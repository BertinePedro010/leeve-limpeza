import type { OsStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { ok, serialize } from "@/lib/json";

const INACTIVE_ORDER_STATUSES: OsStatus[] = ["finalizado", "cancelado"];

type UpcomingOrder = { id: string; code: string; status: OsStatus; eventDate: Date; client: { name: string } | null };

// Explicit return type keeps this out of the Promise.all ternary-union
// inference trap - without it, TS widens the resolved element type to the
// full ServiceOrder shape instead of the `select`-narrowed one.
async function loadUpcomingOrders(canView: boolean, where: Prisma.ServiceOrderWhereInput): Promise<UpcomingOrder[]> {
  if (!canView) return [];
  return prisma.serviceOrder.findMany({
    where,
    orderBy: { eventDate: "asc" },
    take: 5,
    select: { id: true, code: true, status: true, eventDate: true, client: { select: { name: true } } },
  });
}

// Same revenue/expense/receivable/payable filter rules as lib/billing.ts
// sumRevenue (type/status/deletedAt), computed with Prisma `aggregate`
// instead of fetching every transaction row and summing in JS - the result
// is mathematically identical, just computed by Postgres instead of the
// Node process.
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const branchId = new URL(request.url).searchParams.get("branchId");
    const branchFilter = { branchId: resolveBranchFilter(auth, branchId) };
    const orderWhere = { deletedAt: null, ...branchFilter };
    const transactionWhere = { deletedAt: null, ...branchFilter };

    // Dashboard itself is always reachable (it's the landing page - see
    // requireModule's docstring in lib/authz.ts), but its money/order figures
    // are exactly what the "finance"/"orders" modules gate elsewhere, so a
    // caller without those grants skips the underlying queries entirely
    // (not just zeroes the response) and gets 0/[] directly.
    const isAdmin = auth.profile.role === "admin";
    const canViewFinance = isAdmin || auth.profile.allowedModules.includes("finance");
    const canViewOrders = isAdmin || auth.profile.allowedModules.includes("orders");
    const canViewClients = isAdmin || auth.profile.allowedModules.includes("clients");
    const canViewEmployees = isAdmin || auth.profile.allowedModules.includes("employees");
    const canViewServices = isAdmin || auth.profile.allowedModules.includes("services");

    const [
      clients,
      employees,
      services,
      ordersCount,
      activeOrdersCount,
      completedOrdersCount,
      upcomingOrders,
      revenueAgg,
      expensesAgg,
      receivableAgg,
      payableAgg,
    ] = await Promise.all([
      prisma.client.count({ where: { deletedAt: null, ...branchFilter } }),
      prisma.employee.count({ where: { deletedAt: null, ...branchFilter } }),
      prisma.service.count({ where: { deletedAt: null, ...branchFilter } }),
      canViewOrders ? prisma.serviceOrder.count({ where: orderWhere }) : Promise.resolve(0),
      canViewOrders ? prisma.serviceOrder.count({ where: { ...orderWhere, status: { notIn: INACTIVE_ORDER_STATUSES } } }) : Promise.resolve(0),
      canViewOrders ? prisma.serviceOrder.count({ where: { ...orderWhere, status: "finalizado" } }) : Promise.resolve(0),
      // `upcomingOrders` is trimmed to exactly what DashboardView renders
      // (id/code/status/eventDate/client name) - the full ServiceOrder +
      // Client records carry PII (document/address/phone) and financial
      // data (totalAmount) that the "clients"/"finance" modules gate
      // elsewhere, and this dashboard is reachable by every authenticated
      // user regardless of those grants. Explicitly ordered by eventDate
      // ascending (the prior all-rows-then-slice(0,5) had no ORDER BY, so
      // which 5 rows came back was not deterministic either).
      loadUpcomingOrders(canViewOrders, { ...orderWhere, status: { notIn: INACTIVE_ORDER_STATUSES } }),
      canViewFinance ? prisma.transaction.aggregate({ where: { ...transactionWhere, type: "receita", status: "pago" }, _sum: { amount: true } }) : Promise.resolve(null),
      canViewFinance ? prisma.transaction.aggregate({ where: { ...transactionWhere, type: "despesa", status: "pago" }, _sum: { amount: true } }) : Promise.resolve(null),
      canViewFinance ? prisma.transaction.aggregate({ where: { ...transactionWhere, type: "receita", status: "pendente" }, _sum: { amount: true } }) : Promise.resolve(null),
      canViewFinance ? prisma.transaction.aggregate({ where: { ...transactionWhere, type: "despesa", status: "pendente" }, _sum: { amount: true } }) : Promise.resolve(null),
    ]);

    const revenue = revenueAgg ? Number(revenueAgg._sum.amount ?? 0) : 0;
    const expenses = expensesAgg ? Number(expensesAgg._sum.amount ?? 0) : 0;
    const receivable = receivableAgg ? Number(receivableAgg._sum.amount ?? 0) : 0;
    const payable = payableAgg ? Number(payableAgg._sum.amount ?? 0) : 0;

    return ok(serialize({
      revenue,
      expenses,
      profit: revenue - expenses,
      receivable,
      payable,
      clients: canViewClients ? clients : 0,
      employees: canViewEmployees ? employees : 0,
      services: canViewServices ? services : 0,
      orders: ordersCount,
      activeOrders: activeOrdersCount,
      completedOrders: completedOrdersCount,
      upcomingOrders: upcomingOrders.map((o) => ({ id: o.id, code: o.code, status: o.status, eventDate: o.eventDate, client: o.client ? { name: o.client.name } : null })),
    }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
