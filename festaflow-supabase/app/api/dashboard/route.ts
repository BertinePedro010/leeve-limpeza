import { Prisma } from "@prisma/client";
import type { OsStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { resolveMonthRange } from "@/lib/reports";
import { ok, serialize } from "@/lib/json";

type UpcomingOrder = { id: string; code: string; status: OsStatus; eventDate: Date; client: { name: string } | null };

type OccurrenceBucket = { count: number; total: number };

type CategoryBucket = { category: string; count: number; total: number };

// A "ocorrencia" agendada = uma linha de `appointments` (data adicional,
// atendimento manual, ou ocorrencia de recorrencia - todas vinculadas a uma
// unica ServiceOrder). O valor de cada ocorrencia e HERDADO da OS pai
// (service_orders.total_amount) - EXCETO quando aquela ocorrencia tem seu
// proprio a.price_override (ver prisma/schema.prisma Appointment.priceOverride),
// caso em que ela contribui com esse valor em vez do total_amount da OS.
//
// Uma unica query agrupada por status: cada appointment entra UMA vez e
// contribui com COALESCE(a.price_override, o.total_amount) uma vez (JOIN N:1
// appointment->order, sem fan-out). OS soft-deletada e excluida (o.deleted_at
// IS NULL). Escopo por filial via a.branch_id (indice
// idx_appointments_branch_date). Um atendimento cancelado (a.cancelled_at IS
// NOT NULL) nao entra em nenhum bucket - o status (agendado/realizado) so e
// considerado quando NAO cancelado, exatamente como o resumo "Por Cliente" e
// os demais relatorios (ver lib/order-status.ts).
async function loadOccurrences(canView: boolean, branchIds: string[], from: Date, to: Date): Promise<{
  total: OccurrenceBucket;
  scheduled: OccurrenceBucket;
  finalized: OccurrenceBucket;
}> {
  const empty = { count: 0, total: 0 };
  if (!canView || branchIds.length === 0) {
    return { total: empty, scheduled: empty, finalized: empty };
  }
  const rows = await prisma.$queryRaw<Array<{ status: string; count: number; total: number }>>(Prisma.sql`
    SELECT a.status::text AS status,
           COUNT(*)::int AS count,
           COALESCE(SUM(COALESCE(a.price_override, o.total_amount)), 0)::float8 AS total
    FROM appointments a
    JOIN service_orders o ON o.id = a.order_id
    WHERE o.deleted_at IS NULL
      AND a.cancelled_at IS NULL
      AND a.branch_id = ANY(ARRAY[${Prisma.join(branchIds)}]::uuid[])
      AND a.date BETWEEN ${from} AND ${to}
    GROUP BY a.status
  `);
  const byStatus = new Map(rows.map((r) => [r.status, { count: Number(r.count), total: Number(r.total) }]));
  const get = (s: string) => byStatus.get(s) ?? { count: 0, total: 0 };
  const scheduled = get("agendado");
  const finalized = get("realizado");
  return {
    scheduled,
    finalized,
    total: { count: scheduled.count + finalized.count, total: scheduled.total + finalized.total },
  };
}

// "Tipo de OS" nao e um campo proprio - o sistema nao tem essa coluna (ver
// Service.category, unico lugar que distingue tipos, mesmo padrao ja usado
// em app/api/reports/services). Uma ServiceOrder pode ter varios
// ServiceOrderItem de categorias diferentes; para nao contar a mesma
// ocorrencia em duas categorias (mesma regra de "sem fan-out" de
// loadOccurrences acima), cada ocorrencia e atribuida a UMA categoria: a do
// primeiro servico contratado na OS (menor created_at em service_order_items,
// via LATERAL...LIMIT 1). LEFT JOIN LATERAL + COALESCE garante que uma OS
// sem nenhum item ainda apareca (sob "Sem categoria") em vez de desaparecer
// do detalhamento e quebrar a soma em relacao a loadOccurrences().
async function loadOccurrencesByCategory(canView: boolean, branchIds: string[], from: Date, to: Date): Promise<CategoryBucket[]> {
  if (!canView || branchIds.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ category: string; count: number; total: number }>>(Prisma.sql`
    SELECT COALESCE(cat.category, 'Sem categoria') AS category,
           COUNT(*)::int AS count,
           COALESCE(SUM(COALESCE(a.price_override, o.total_amount)), 0)::float8 AS total
    FROM appointments a
    JOIN service_orders o ON o.id = a.order_id
    LEFT JOIN LATERAL (
      SELECT s.category
      FROM service_order_items soi
      JOIN services s ON s.id = soi.service_id
      WHERE soi.order_id = o.id
      ORDER BY soi.created_at ASC
      LIMIT 1
    ) cat ON true
    WHERE o.deleted_at IS NULL
      AND a.cancelled_at IS NULL
      AND a.branch_id = ANY(ARRAY[${Prisma.join(branchIds)}]::uuid[])
      AND a.date BETWEEN ${from} AND ${to}
    GROUP BY cat.category
    ORDER BY total DESC
  `);
  return rows.map((r) => ({ category: r.category, count: Number(r.count), total: Number(r.total) }));
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
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    // Dashboard period selector (seção "Período analisado"). Defaults to the
    // current month/year - see resolveMonthRange's docstring (lib/reports.ts)
    // for why this is month+year instead of resolvePeriod's day-level presets.
    const { year, month, from, to } = resolveMonthRange(url);
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

    // OsStatus (prisma/schema.prisma + lib/validators.ts) has exactly 2
    // values: agendado | realizado. Cancellation is a separate fact
    // (cancelledAt), never a status value - see lib/order-status.ts.
    //
    // Two DIFFERENT things are reported:
    //  - principalOrders: quantas ServiceOrder existem (a "OS principal"),
    //    nao canceladas, nao excluidas. Um COUNT de service_orders.
    //  - occurrences.{scheduled,finalized,total}: quantidade E valor de
    //    OCORRENCIAS (linhas de appointments) por status - inclui data
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
      occurrencesByCategory,
      upcomingOrders,
      revenueAgg,
      expensesAgg,
      receivableAgg,
      payableAgg,
    ] = await Promise.all([
      prisma.client.count({ where: { deletedAt: null, ...branchFilter } }),
      prisma.employee.count({ where: { deletedAt: null, ...branchFilter } }),
      prisma.service.count({ where: { deletedAt: null, ...branchFilter } }),
      // Order-level counts (orders/activeOrders/completedOrders/principalOrders)
      // are deliberately NOT filtered by the selected month: they report
      // current operational state ("how many OS are open right now", "how
      // many have ever been completed"), not a historical count for that
      // month - filtering them would silently turn a live gauge into a
      // history widget, exactly what "upcomingOrders" below must also avoid.
      canViewOrders ? prisma.serviceOrder.count({ where: orderWhere }) : Promise.resolve(0),
      canViewOrders ? prisma.serviceOrder.count({ where: { ...orderWhere, status: "agendado", cancelledAt: null } }) : Promise.resolve(0),
      canViewOrders ? prisma.serviceOrder.count({ where: { ...orderWhere, status: "realizado", cancelledAt: null } }) : Promise.resolve(0),
      canViewOrders ? prisma.serviceOrder.count({ where: { ...orderWhere, cancelledAt: null } }) : Promise.resolve(0),
      loadOccurrences(canViewOrders, branchIds, from, to),
      loadOccurrencesByCategory(canViewOrders, branchIds, from, to),
      // `upcomingOrders` is trimmed to exactly what DashboardView renders
      // (id/code/status/eventDate/client name) - the full ServiceOrder +
      // Client records carry PII (document/address/phone) and financial
      // data (totalAmount) that the "clients"/"finance" modules gate
      // elsewhere, and this dashboard is reachable by every authenticated
      // user regardless of those grants. Explicitly ordered by eventDate
      // ascending (the prior all-rows-then-slice(0,5) had no ORDER BY, so
      // which 5 rows came back was not deterministic either). Never filtered
      // by the selected month either - "proximos eventos" always means the
      // next scheduled orders from today forward, regardless of which month
      // is being analyzed elsewhere on the dashboard.
      loadUpcomingOrders(canViewOrders, { ...orderWhere, status: "agendado", cancelledAt: null }),
      // revenue/expenses ("Faturamento"/"Despesas" do periodo selecionado) ARE
      // filtered by paidAt within the selected month - on a dashboard with a
      // month selector these read naturally as period figures, same
      // convention /api/reports already uses (resolvePeriod + paidAt).
      // receivable/payable below are deliberately NOT filtered: they are the
      // *current* outstanding balance ("a receber"/"a pagar" agora), not a
      // per-month figure - "a receber de agosto" would misrepresent an open
      // balance as something tied to a past month.
      canViewFinance ? prisma.transaction.aggregate({ where: { ...transactionWhere, type: "receita", status: "pago", paidAt: { gte: from, lte: to } }, _sum: { amount: true } }) : Promise.resolve(null),
      canViewFinance ? prisma.transaction.aggregate({ where: { ...transactionWhere, type: "despesa", status: "pago", paidAt: { gte: from, lte: to } }, _sum: { amount: true } }) : Promise.resolve(null),
      canViewFinance ? prisma.transaction.aggregate({ where: { ...transactionWhere, type: "receita", status: "pendente" }, _sum: { amount: true } }) : Promise.resolve(null),
      canViewFinance ? prisma.transaction.aggregate({ where: { ...transactionWhere, type: "despesa", status: "pendente" }, _sum: { amount: true } }) : Promise.resolve(null),
    ]);

    const revenue = revenueAgg ? Number(revenueAgg._sum.amount ?? 0) : 0;
    const expenses = expensesAgg ? Number(expensesAgg._sum.amount ?? 0) : 0;
    const receivable = receivableAgg ? Number(receivableAgg._sum.amount ?? 0) : 0;
    const payable = payableAgg ? Number(payableAgg._sum.amount ?? 0) : 0;

    return ok(serialize({
      period: { year, month },
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
      occurrencesByCategory,
      upcomingOrders: upcomingOrders.map((o) => ({ id: o.id, code: o.code, status: o.status, eventDate: o.eventDate, client: o.client ? { name: o.client.name } : null })),
    }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
