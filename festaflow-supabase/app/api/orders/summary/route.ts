import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireAuth, requireModule, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { ok, serialize } from "@/lib/json";

// Client search summary for the Ordens de Servico screen. Same module
// ("orders"), same branch isolation (resolveBranchFilter validates the
// requested branch against the caller's own user_branches) and the same
// "one row per OS" model as the listing itself - the aggregation is a
// groupBy on service_orders, so an OS with several appointments still
// counts as exactly one OS. Value uses ServiceOrder.totalAmount, the same
// figure the listing table shows in its "Valor" column - no new financial
// rule. Returns zeros (not an error) when the search term is empty.
const STATUSES = ["pendente", "confirmado", "em_andamento", "finalizado", "cancelado"] as const;

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
      return ok(serialize({ clientNames: [], totalOrders: 0, totalValue: 0, byStatus }));
    }

    const where: Prisma.ServiceOrderWhereInput = {
      deletedAt: null,
      branchId: resolveBranchFilter(auth, branchId),
      client: { name: { contains: clientSearch, mode: "insensitive" } },
    };

    const [grouped, distinctClients] = await Promise.all([
      prisma.serviceOrder.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      prisma.serviceOrder.findMany({
        where,
        select: { clientId: true, client: { select: { name: true } } },
        distinct: ["clientId"],
      }),
    ]);

    let totalOrders = 0;
    let totalValue = 0;
    for (const g of grouped) {
      const value = Number(g._sum.totalAmount ?? 0);
      byStatus[g.status] = { count: g._count._all, value };
      totalOrders += g._count._all;
      totalValue += value;
    }

    const clientNames = distinctClients
      .map((c) => c.client.name)
      .sort((a, b) => a.localeCompare(b));

    return ok(serialize({ clientNames, totalOrders, totalValue, byStatus }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
