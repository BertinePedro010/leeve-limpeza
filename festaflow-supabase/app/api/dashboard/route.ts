import { prisma } from "@/lib/prisma";
import { requireAuth, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { ok, serialize } from "@/lib/json";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const branchId = new URL(request.url).searchParams.get("branchId");
    const branchFilter = { branchId: resolveBranchFilter(auth, branchId) };
    const [orders, clients, employees, services, transactions] = await Promise.all([
      prisma.serviceOrder.findMany({ where: { deletedAt: null, ...branchFilter }, include: { client: true } }),
      prisma.client.count({ where: { deletedAt: null, ...branchFilter } }),
      prisma.employee.count({ where: { deletedAt: null, ...branchFilter } }),
      prisma.service.count({ where: { deletedAt: null, ...branchFilter } }),
      prisma.transaction.findMany({ where: { deletedAt: null, ...branchFilter } }),
    ]);
    const revenue = transactions.filter((t) => t.type === "receita" && t.status === "pago").reduce((sum, t) => sum + Number(t.amount), 0);
    const expenses = transactions.filter((t) => t.type === "despesa" && t.status === "pago").reduce((sum, t) => sum + Number(t.amount), 0);
    const receivable = transactions.filter((t) => t.type === "receita" && t.status === "pendente").reduce((sum, t) => sum + Number(t.amount), 0);
    const payable = transactions.filter((t) => t.type === "despesa" && t.status === "pendente").reduce((sum, t) => sum + Number(t.amount), 0);
    return ok(serialize({
      revenue,
      expenses,
      profit: revenue - expenses,
      receivable,
      payable,
      clients,
      employees,
      services,
      orders: orders.length,
      activeOrders: orders.filter((o) => !["finalizado", "cancelado"].includes(o.status)).length,
      completedOrders: orders.filter((o) => o.status === "finalizado").length,
      upcomingOrders: orders.filter((o) => !["finalizado", "cancelado"].includes(o.status)).slice(0, 5),
    }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
