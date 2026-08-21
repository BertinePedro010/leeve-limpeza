import { prisma } from "@/lib/prisma";
import { requireAuth, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { sumRevenue } from "@/lib/billing";
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
    // Dashboard itself is always reachable (it's the landing page - see
    // requireModule's docstring in lib/authz.ts), but its money figures are
    // exactly what the "finance" module gates elsewhere, so they are zeroed
    // here instead of leaking through the one screen that isn't itself
    // module-gated.
    const isAdmin = auth.profile.role === "admin";
    const canViewFinance = isAdmin || auth.profile.allowedModules.includes("finance");
    const canViewOrders = isAdmin || auth.profile.allowedModules.includes("orders");
    const canViewClients = isAdmin || auth.profile.allowedModules.includes("clients");
    const canViewEmployees = isAdmin || auth.profile.allowedModules.includes("employees");
    const canViewServices = isAdmin || auth.profile.allowedModules.includes("services");
    const revenue = canViewFinance ? sumRevenue(transactions) : 0;
    const expenses = canViewFinance ? transactions.filter((t) => t.type === "despesa" && t.status === "pago").reduce((sum, t) => sum + Number(t.amount), 0) : 0;
    const receivable = canViewFinance ? transactions.filter((t) => t.type === "receita" && t.status === "pendente").reduce((sum, t) => sum + Number(t.amount), 0) : 0;
    const payable = canViewFinance ? transactions.filter((t) => t.type === "despesa" && t.status === "pendente").reduce((sum, t) => sum + Number(t.amount), 0) : 0;
    // `upcomingOrders` is trimmed to exactly what DashboardView renders
    // (id/code/status/eventDate/client name) - the full ServiceOrder +
    // Client records carry the same PII (document/address/phone) and
    // financial data (totalAmount) that the "clients"/"finance" modules
    // gate elsewhere, and this dashboard is reachable by every authenticated
    // user regardless of those grants.
    const upcomingOrders = canViewOrders
      ? orders.filter((o) => !["finalizado", "cancelado"].includes(o.status)).slice(0, 5).map((o) => ({ id: o.id, code: o.code, status: o.status, eventDate: o.eventDate, client: o.client ? { name: o.client.name } : null }))
      : [];
    return ok(serialize({
      revenue,
      expenses,
      profit: revenue - expenses,
      receivable,
      payable,
      clients: canViewClients ? clients : 0,
      employees: canViewEmployees ? employees : 0,
      services: canViewServices ? services : 0,
      orders: canViewOrders ? orders.length : 0,
      activeOrders: canViewOrders ? orders.filter((o) => !["finalizado", "cancelado"].includes(o.status)).length : 0,
      completedOrders: canViewOrders ? orders.filter((o) => o.status === "finalizado").length : 0,
      upcomingOrders,
    }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
