import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthzError } from "@/lib/authz";
import { resolvePeriod, resolveReportBranchFilter } from "@/lib/reports";
import { sumRevenue } from "@/lib/billing";
import { ok, serialize } from "@/lib/json";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const url = new URL(request.url);
    const branchFilter = await resolveReportBranchFilter(auth, url.searchParams.get("branchId"));
    const { from, to } = resolvePeriod(url);
    const status = url.searchParams.get("status");
    const paymentMethod = url.searchParams.get("paymentMethod");

    const orders = await prisma.serviceOrder.findMany({
      where: {
        deletedAt: null,
        branchId: branchFilter,
        createdAt: { gte: from, lte: to },
        ...(status ? { status: status as never } : {}),
        ...(paymentMethod ? { paymentMethod: paymentMethod as never } : {}),
      },
      include: {
        client: { select: { name: true } },
        branch: { select: { name: true } },
        appointments: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = orders.map((o) => ({
      code: o.code,
      client: o.client.name,
      branch: o.branch.name,
      status: o.status,
      appointmentCount: o.appointments.length,
      totalAmount: o.totalAmount,
      paymentMethod: o.paymentMethod,
      paymentMethodLegacy: o.paymentMethodLegacy,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));

    // Same summation rule as /api/dashboard (lib/billing.ts) - realized
    // revenue (transactions, not OS totals) for the same branch/period, so
    // this report's faturamento total can never drift from the Dashboard's.
    const transactions = await prisma.transaction.findMany({
      where: { deletedAt: null, branchId: branchFilter, type: "receita", status: "pago", paidAt: { gte: from, lte: to } },
    });
    const faturamento = sumRevenue(transactions);

    return ok(serialize({ period: { from, to }, faturamento, data }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
