import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, handleAuthzError } from "@/lib/authz";
import { resolvePeriod, resolveReportBranchFilter } from "@/lib/reports";
import { sumRevenue } from "@/lib/billing";
import { orderRealTotal } from "@/lib/order-total";
import { ok, serialize } from "@/lib/json";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "reports");
    // "reports" alone must never carry "finance": this report's faturamento
    // and per-order monetary fields are exactly what app/api/transactions
    // gates behind requireModule(auth,"finance") and what the Dashboard's
    // own canViewFinance zeroes out - see SECURITY-AUDIT finding F1. A caller
    // with only "reports" still gets the non-financial shape of this report
    // (code/client/branch/status/appointmentCount), never the money fields.
    const isAdmin = auth.profile.role === "admin";
    const canViewFinance = isAdmin || auth.profile.allowedModules.includes("finance");
    const url = new URL(request.url);
    const branchFilter = await resolveReportBranchFilter(auth, url.searchParams.get("branchId"));
    const { from, to } = resolvePeriod(url);
    const status = url.searchParams.get("status");
    const paymentMethod = url.searchParams.get("paymentMethod");

    // Neither query depends on the other's result - run in parallel instead
    // of two sequential round-trips. The transaction query only ever runs
    // for a caller who can view finance - mirrors app/api/dashboard's
    // canViewFinance ? ... : Promise.resolve(...) pattern, so a finance-less
    // caller never even causes a Transaction-table read, not just a hidden
    // field in the response.
    const [orders, transactions] = await Promise.all([
      prisma.serviceOrder.findMany({
        where: {
          deletedAt: null,
          // Cancelled OS are tracked separately (cancelledAt) and are never
          // part of "Todos"/Agendado/Realizado here - same rule as the
          // Dashboard and every other status breakdown (lib/order-status.ts).
          cancelledAt: null,
          branchId: branchFilter,
          createdAt: { gte: from, lte: to },
          ...(status ? { status: status as never } : {}),
          ...(paymentMethod ? { paymentMethod: paymentMethod as never } : {}),
        },
        include: {
          client: { select: { name: true } },
          branch: { select: { name: true } },
          appointments: { select: { status: true, cancelledAt: true, priceOverride: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Same summation rule as /api/dashboard (lib/billing.ts) - realized
      // revenue (transactions, not OS totals) for the same branch/period, so
      // this report's faturamento total can never drift from the Dashboard's.
      canViewFinance
        ? prisma.transaction.findMany({
            where: { deletedAt: null, branchId: branchFilter, type: "receita", status: "pago", paidAt: { gte: from, lte: to } },
          })
        : Promise.resolve([]),
    ]);

    const data = orders.map((o) => {
      const nonCancelled = o.appointments.filter((a) => !a.cancelledAt);
      return {
        code: o.code,
        client: o.client.name,
        branch: o.branch.name,
        status: o.status,
        appointmentCount: nonCancelled.length,
        totalAmount: canViewFinance ? o.totalAmount : null,
        // Real total across every occurrence this OS actually has - see
        // lib/order-total.ts (override-aware). Distinct from totalAmount
        // (the value of a single occurrence with no override), same rule the
        // OS listing's own "Total" column and the client-search summary use.
        total: canViewFinance ? orderRealTotal(o.totalAmount, nonCancelled) : null,
        paymentMethod: canViewFinance ? o.paymentMethod : null,
        paymentMethodLegacy: canViewFinance ? o.paymentMethodLegacy : null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
    });

    const faturamento = canViewFinance ? sumRevenue(transactions) : null;

    return ok(serialize({ period: { from, to }, faturamento, data }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
