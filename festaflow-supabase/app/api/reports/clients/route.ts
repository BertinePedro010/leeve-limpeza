import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, handleAuthzError } from "@/lib/authz";
import { resolvePeriod, resolveReportBranchFilter } from "@/lib/reports";
import { fail, ok, serialize } from "@/lib/json";

// "Por Cliente" report.
//   - branch/authz: resolveReportBranchFilter (identical to every other report,
//     "all" still gated behind requireGlobalAdmin).
//   - periodo / funcionario / status: matched against real Appointment rows
//     (the same fields the dashboard's loadOccurrences and the appointments
//     report already filter on), not just "does the OS have SOME matching
//     appointment" - see the JOIN below.
//   - servico: optional service.id filter, cliente: optional order.clientId
//     filter, validated against branchFilter.
//
// Value/quantity per (client, service) line = SUM over each matching
// appointment of (item.quantity * item.unitPrice) - the same "an occurrence
// inherits its OS's item value" rule as lib/order-total.ts (which does this
// per whole order; this does it per order+item line, so a multi-service OS
// never has one item's value bleed into another's). This generalizes
// app/api/dashboard's loadOccurrences pattern (raw SQL, one appointment ->
// one value contribution, grouped) from "per appointment status" to "per
// client + service". No parallel financial logic: still ultimately
// item.quantity * item.unitPrice, the exact figures ServiceOrder.totalAmount
// itself is built from (see app/api/orders' own total()).
//
// OS-level Agendado/Realizado counts are a SEPARATE query, unchanged from
// before: an OS is counted once regardless of its number of service lines
// or appointment dates (distinct on order id). Neither query recomputes the
// other's numbers.
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "reports");
    const url = new URL(request.url);
    const branchIds = (await resolveReportBranchFilter(auth, url.searchParams.get("branchId"))).in;
    const { from, to } = resolvePeriod(url);
    const serviceId = url.searchParams.get("serviceId");
    const employeeId = url.searchParams.get("employeeId");
    const status = url.searchParams.get("status");
    const clientId = url.searchParams.get("clientId");

    // FILIAL -> CLIENTE is validated here, never trusted from the frontend: a
    // clientId is only accepted when that client actually belongs to one of
    // the branches the caller resolved to. An invalid pair (e.g. filial =
    // Grande Vitoria, cliente de Cachoeiro) is rejected.
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, deletedAt: null, branchId: { in: branchIds } },
        select: { id: true },
      });
      if (!client) return fail("Cliente nao pertence a filial selecionada.", 422);
    }

    const rows = branchIds.length === 0 ? [] : await prisma.$queryRaw<Array<{
      client_id: string;
      client_name: string;
      service_name: string;
      item_quantity: number;
      unit_price: number;
      matching_appt_count: number;
    }>>(Prisma.sql`
      SELECT so.client_id,
             c.name AS client_name,
             s.name AS service_name,
             soi.quantity AS item_quantity,
             soi.unit_price::float8 AS unit_price,
             COUNT(a.id)::int AS matching_appt_count
      FROM service_orders so
      JOIN clients c ON c.id = so.client_id
      JOIN service_order_items soi ON soi.order_id = so.id
      JOIN services s ON s.id = soi.service_id
      JOIN appointments a ON a.order_id = so.id
        AND a.cancelled_at IS NULL
        AND a.date >= ${from} AND a.date <= ${to}
        ${employeeId ? Prisma.sql`AND a.employee_id = ${employeeId}::uuid` : Prisma.empty}
        ${status ? Prisma.sql`AND a.status = ${status}::"OsStatus"` : Prisma.empty}
      WHERE so.deleted_at IS NULL
        AND s.branch_id = ANY(ARRAY[${Prisma.join(branchIds)}]::uuid[])
        ${serviceId ? Prisma.sql`AND s.id = ${serviceId}::uuid` : Prisma.empty}
        ${clientId ? Prisma.sql`AND so.client_id = ${clientId}::uuid` : Prisma.empty}
      GROUP BY so.id, so.client_id, c.name, s.id, s.name, soi.quantity, soi.unit_price
    `);

    const orders = branchIds.length === 0 ? [] : await prisma.serviceOrder.findMany({
      where: {
        deletedAt: null,
        ...(clientId ? { clientId } : {}),
        items: { some: { service: { branchId: { in: branchIds }, ...(serviceId ? { id: serviceId } : {}) } } },
        appointments: {
          some: {
            date: { gte: from, lte: to },
            // Cancelled appointments are tracked separately (cancelledAt)
            // and never count toward a client's Agendado/Realizado summary -
            // see lib/order-status.ts.
            cancelledAt: null,
            ...(employeeId ? { employeeId } : {}),
            ...(status ? { status: status as never } : {}),
          },
        },
      },
      select: { id: true, clientId: true, status: true },
      distinct: ["id"],
    });

    // client id -> { name, service name -> { quantity, value } }
    const byClient = new Map<
      string,
      { clientId: string; client: string; services: Map<string, { quantity: number; value: number }> }
    >();
    for (const row of rows) {
      let entry = byClient.get(row.client_id);
      if (!entry) {
        entry = { clientId: row.client_id, client: row.client_name, services: new Map() };
        byClient.set(row.client_id, entry);
      }
      const line = entry.services.get(row.service_name) ?? { quantity: 0, value: 0 };
      const occurrenceQuantity = Number(row.item_quantity) * Number(row.matching_appt_count);
      line.quantity += occurrenceQuantity;
      line.value += occurrenceQuantity * Number(row.unit_price);
      entry.services.set(row.service_name, line);
    }

    // client id -> { totalOrders, agendado, realizado }
    const statusByClient = new Map<string, { totalOrders: number; agendado: number; realizado: number }>();
    for (const order of orders) {
      const entry = statusByClient.get(order.clientId) ?? { totalOrders: 0, agendado: 0, realizado: 0 };
      entry.totalOrders += 1;
      if (order.status === "realizado") entry.realizado += 1;
      else entry.agendado += 1;
      statusByClient.set(order.clientId, entry);
    }

    const data = [...byClient.values()]
      .map((entry) => {
        const services = [...entry.services.entries()]
          .map(([service, v]) => ({ service, quantity: v.quantity, value: v.value }))
          .sort((a, b) => b.value - a.value || a.service.localeCompare(b.service));
        const statusCounts = statusByClient.get(entry.clientId) ?? { totalOrders: 0, agendado: 0, realizado: 0 };
        return {
          clientId: entry.clientId,
          client: entry.client,
          totalOrders: statusCounts.totalOrders,
          agendado: statusCounts.agendado,
          realizado: statusCounts.realizado,
          totalServices: services.reduce((s, x) => s + x.quantity, 0),
          totalValue: services.reduce((s, x) => s + x.value, 0),
          services,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue || a.client.localeCompare(b.client));

    const totals = {
      services: data.reduce((s, c) => s + c.totalServices, 0),
      value: data.reduce((s, c) => s + c.totalValue, 0),
      orders: data.reduce((s, c) => s + c.totalOrders, 0),
      agendado: data.reduce((s, c) => s + c.agendado, 0),
      realizado: data.reduce((s, c) => s + c.realizado, 0),
    };

    return ok(serialize({ period: { from, to }, data, totals }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
