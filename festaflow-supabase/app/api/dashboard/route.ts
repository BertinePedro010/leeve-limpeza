import { Prisma } from "@prisma/client";
import type { OsStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { ok, serialize } from "@/lib/json";

const INACTIVE_ORDER_STATUSES: OsStatus[] = ["finalizado", "cancelado"];

type UpcomingOrder = { id: string; code: string; status: OsStatus; eventDate: Date; client: { name: string } | null };

type OccurrenceBucket = { count: number; total: number };

// A "ocorrencia" agendada = uma linha de `appointments` (data adicional,
// atendimento manual, ou ocorrencia de recorrencia - todas vinculadas a uma
// unica ServiceOrder). O valor de cada ocorrencia e HERDADO da OS pai
// (service_orders.total_amount) - nao existe coluna de valor no Appointment.
//
// Uma unica query agrupada por status: cada appointment entra UMA vez e
// contribui com o total_amount da sua OS uma vez (JOIN N:1 appointment->order,
// sem fan-out). OS soft-deletada e excluida (o.deleted_at IS NULL). Escopo por
// filial via a.branch_id (indice idx_appointments_branch_date). `cancelado`
// nao entra em `total`. Nada e trazido linha-a-linha para o Node.
async function loadOccurrences(canView: boolean, branchIds: string[]): Promise<{
  total: OccurrenceBucket;
  scheduled: OccurrenceBucket;
  confirmed: OccurrenceBucket;
  finalized: OccurrenceBucket;
}> {
  const empty = { count: 0, total: 0 };
  if (!canView || branchIds.length === 0) {
    return { total: empty, scheduled: empty, confirmed: empty, finalized: empty };
  }
  const rows = await prisma.$queryRaw<Array<{ status: string; count: number; total: number }>>(Prisma.sql`
    SELECT a.status::text AS status,
           COUNT(*)::int AS count,
           COALESCE(SUM(o.total_amount), 0)::float8 AS total
    FROM appointments a
    JOIN service_orders o ON o.id = a.order_id
    WHERE o.deleted_at IS NULL
      AND a.branch_id = ANY(ARRAY[${Prisma.join(branchIds)}]::uuid[])
    GROUP BY a.status
  `);
  const byStatus = new Map(rows.map((r) => [r.status, { count: Number(r.count), total: Number(r.total) }]));
  const get = (s: string) => byStatus.get(s) ?? { count: 0, total: 0 };
  const scheduled = get("pendente");
  const confirmed = get("confirmado");
  const finalized = get("finalizado");
  const inProgress = get("em_andamento");
  return {
    scheduled,
    confirmed,
    finalized,
    total: {
      count: scheduled.count + confirmed.count + finalized.count + inProgress.count,
      total: scheduled.total + confirmed.total + finalized.total + inProgress.total,
    },
  };
}

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
    // resolveBranchFilter runs assertBranchAccess when a branchId is passed
    // (throws 403 if it isn't one of the user's user_branches) - reuse its
    // resolved list so both the Prisma `where` and the raw occurrences query
    // stay inside the exact same branch scope.
    const branchScope = resolveBranchFilter(auth, branchId);
    const branchIds = branchScope.in;
    const branchFilter = { branchId: branchScope };
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

    // OsStatus (prisma/schema.prisma + lib/validators.ts) has exactly 5
    // values: pendente | confirmado | em_andamento | finalizado | cancelado.
    // UI labels (components/ui.tsx statusLabels): pendente -> "Agendado",
    // confirmado -> "Confirmado", finalizado -> "Realizado".
    //
    // Two DIFFERENT things are reported:
    //  - principalOrders: quantas ServiceOrder existem (a "OS principal"),
    //    status != cancelado, nao excluidas. Um COUNT de service_orders.
    //  - occurrences.{scheduled,confirmed,finalized,total}: quantidade E valor
    //    de OCORRENCIAS (linhas de appointments) por status - inclui data
    //    principal, datas adicionais, atendimentos manuais e ocorrencias de
    //    recorrencia. Valor de cada ocorrencia = total_amount da OS pai.
    //    Ver loadOccurrences() acima (uma query agrupada, sem dupla contagem).
    const [
      clients,
      employees,
      services,
      ordersCount,
      activeOrdersCount,
      completedOrdersCount,
      principalOrdersCount,
      occurrences,
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
      canViewOrders ? prisma.serviceOrder.count({ where: { ...orderWhere, status: { not: "cancelado" } } }) : Promise.resolve(0),
      loadOccurrences(canViewOrders, branchIds),
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
      principalOrders: { count: principalOrdersCount },
      occurrences,
      upcomingOrders: upcomingOrders.map((o) => ({ id: o.id, code: o.code, status: o.status, eventDate: o.eventDate, client: o.client ? { name: o.client.name } : null })),
    }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
