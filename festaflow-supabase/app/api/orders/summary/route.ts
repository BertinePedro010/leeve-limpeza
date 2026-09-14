import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { ok, serialize } from "@/lib/json";
import { ORDER_STATUS_VALUES } from "@/lib/order-status";

// Client search summary for the Ordens de Servico screen. Same module
// ("orders"), same branch isolation (resolveBranchFilter validates the
// requested branch against the caller's own user_branches) and the same
// "one row per OS" model as the listing itself - COUNT(*) on service_orders,
// so an OS with several appointments still counts as exactly one OS. Value
// is the OS's REAL total (see lib/order-total.ts: totalAmount x its own
// non-cancelled appointment count) - the same rule app/api/dashboard's
// loadOccurrences already established, generalized here from "per
// occurrence, grouped by appointment status" to "per OS, grouped by OS
// status". A plain groupBy can't express "count x totalAmount" (that needs
// a join + per-order subquery), hence the raw SQL, same style as
// loadOccurrences. Returns zeros (not an error) when the search term is
// empty.
const STATUSES = ORDER_STATUS_VALUES;

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    const clientSearch = url.searchParams.get("clientSearch")?.trim() ?? "";

    const byStatus: Record<string, { count: number; value: number }> = Object.fromEntries(
      STATUSES.map((s) => [s, { count: 0, value: 0 }])
    );

    if (!clientSearch) {
      return ok(serialize({ clientNames: [], totalOrders: 0, totalValue: 0, valorMensal: 0, byStatus }));
    }

    const branchIds = resolveBranchFilter(auth, branchId).in;
    // Cancelled OS are tracked separately (cancelledAt) and must never be
    // counted into the agendado/realizado breakdown here - same rule as the
    // Dashboard's occurrence totals (see app/api/dashboard). `clientSearch`
    // is not wildcard-escaped (a literal "%"/"_" in a client name would
    // behave like an ILIKE wildcard) - the same minor, harmless edge case
    // Prisma's own `contains` avoids internally; acceptable here since this
    // only ever narrows a search, never exposes data outside branchIds.
    const grouped = branchIds.length === 0 ? [] : await prisma.$queryRaw<Array<{ status: string; count: number; value: number }>>(Prisma.sql`
      SELECT so.status::text AS status,
             COUNT(*)::int AS count,
             COALESCE(SUM(so.total_amount * COALESCE(ac.appt_count, 0)), 0)::float8 AS value
      FROM service_orders so
      JOIN clients c ON c.id = so.client_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS appt_count
        FROM appointments a
        WHERE a.order_id = so.id AND a.cancelled_at IS NULL
      ) ac ON true
      WHERE so.deleted_at IS NULL
        AND so.cancelled_at IS NULL
        AND so.branch_id = ANY(ARRAY[${Prisma.join(branchIds)}]::uuid[])
        AND c.name ILIKE '%' || ${clientSearch} || '%'
      GROUP BY so.status
    `);
    const distinctClients = branchIds.length === 0 ? [] : await prisma.serviceOrder.findMany({
      where: {
        deletedAt: null,
        cancelledAt: null,
        branchId: { in: branchIds },
        client: { name: { contains: clientSearch, mode: "insensitive" } },
      },
      select: { clientId: true, client: { select: { name: true } } },
      distinct: ["clientId"],
    });
    // "Valor mensal" = the client's own contracted monthly value(s)
    // (RecurringSchedule.price - see app/api/recurring-schedules), summed
    // across every currently active recurrence matching this search/branch.
    // Deliberately NOT derived from appointment counts or totalOrders/
    // totalValue above - that field is a completely separate concept (see
    // the fix in app/api/recurring-schedules' own POST handler) and reading
    // it directly here, instead of recomputing it from occurrences, is
    // exactly what avoids the "atendimentos x valor mensal" bug.
    const valorMensalAgg = branchIds.length === 0 ? null : await prisma.recurringSchedule.aggregate({
      where: {
        active: true,
        branchId: { in: branchIds },
        client: { name: { contains: clientSearch, mode: "insensitive" } },
        order: { deletedAt: null, cancelledAt: null },
      },
      _sum: { price: true },
    });
    const valorMensal = Number(valorMensalAgg?._sum.price ?? 0);

    let totalOrders = 0;
    let totalValue = 0;
    for (const g of grouped) {
      const value = Number(g.value);
      byStatus[g.status] = { count: Number(g.count), value };
      totalOrders += Number(g.count);
      totalValue += value;
    }

    const clientNames = distinctClients
      .map((c) => c.client.name)
      .sort((a, b) => a.localeCompare(b));

    return ok(serialize({ clientNames, totalOrders, totalValue, valorMensal, byStatus }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
