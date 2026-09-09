import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, handleAuthzError } from "@/lib/authz";
import { resolvePeriod, resolveReportBranchFilter } from "@/lib/reports";
import { fail, ok, serialize } from "@/lib/json";

// "Por Cliente" report. Same query shape and same filters as
// /api/reports/services (one row per OS line item), only grouped by client
// instead of listed flat:
//   - branch/authz: resolveReportBranchFilter (identical to every other report,
//     "all" still gated behind requireGlobalAdmin) applied to service.branchId
//   - periodo / funcionario / status: matched against the parent OS's
//     appointments (appointments.some), exactly like the services report
//   - servico: optional service.id filter, same as the services report
//   - cliente: optional order.clientId filter, validated against branchFilter
//
// An OS line is therefore counted once regardless of how many appointment
// dates the OS has ("OS com multiplas datas" never duplicates), and the value
// of each line is quantity * unitPrice - the exact rule used to build
// ServiceOrder.totalAmount itself (see `total()` in app/api/orders/route.ts),
// so this report can never drift from the OS/financial totals. No parallel
// financial logic is introduced here.
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "reports");
    const url = new URL(request.url);
    const branchFilter = await resolveReportBranchFilter(auth, url.searchParams.get("branchId"));
    const { from, to } = resolvePeriod(url);
    const serviceId = url.searchParams.get("serviceId");
    const employeeId = url.searchParams.get("employeeId");
    const status = url.searchParams.get("status");
    const clientId = url.searchParams.get("clientId");

    // FILIAL -> CLIENTE is validated here, never trusted from the frontend: a
    // clientId is only accepted when that client actually belongs to one of
    // the branches the caller resolved to (branchFilter). An invalid pair
    // (e.g. filial = Grande Vitoria, cliente de Cachoeiro) is rejected.
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, deletedAt: null, branchId: branchFilter },
        select: { id: true },
      });
      if (!client) return fail("Cliente nao pertence a filial selecionada.", 422);
    }

    const items = await prisma.serviceOrderItem.findMany({
      where: {
        service: { branchId: branchFilter, ...(serviceId ? { id: serviceId } : {}) },
        order: {
          deletedAt: null,
          ...(clientId ? { clientId } : {}),
          appointments: {
            some: {
              date: { gte: from, lte: to },
              ...(employeeId ? { employeeId } : {}),
              ...(status ? { status: status as never } : {}),
            },
          },
        },
      },
      include: {
        service: { select: { name: true } },
        order: { select: { clientId: true, client: { select: { name: true } } } },
      },
    });

    // client id -> { name, service name -> { quantity, value } }
    const byClient = new Map<
      string,
      { clientId: string; client: string; services: Map<string, { quantity: number; value: number }> }
    >();

    for (const item of items) {
      const key = item.order.clientId;
      let entry = byClient.get(key);
      if (!entry) {
        entry = { clientId: key, client: item.order.client.name, services: new Map() };
        byClient.set(key, entry);
      }
      const line = entry.services.get(item.service.name) ?? { quantity: 0, value: 0 };
      line.quantity += item.quantity;
      line.value += item.quantity * Number(item.unitPrice);
      entry.services.set(item.service.name, line);
    }

    const data = [...byClient.values()]
      .map((entry) => {
        const services = [...entry.services.entries()]
          .map(([service, v]) => ({ service, quantity: v.quantity, value: v.value }))
          .sort((a, b) => b.value - a.value || a.service.localeCompare(b.service));
        return {
          clientId: entry.clientId,
          client: entry.client,
          totalServices: services.reduce((s, x) => s + x.quantity, 0),
          totalValue: services.reduce((s, x) => s + x.value, 0),
          services,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue || a.client.localeCompare(b.client));

    const totals = {
      services: data.reduce((s, c) => s + c.totalServices, 0),
      value: data.reduce((s, c) => s + c.totalValue, 0),
    };

    return ok(serialize({ period: { from, to }, data, totals }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
