import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, assertBranchAccess, AuthzError, handleAuthzError } from "@/lib/authz";
import { orderSchema, orderValidationError } from "@/lib/validators";
import { syncOrderBilling } from "@/lib/billing";
import { fail, ok, serialize } from "@/lib/json";

function total(items: Array<{ quantity: number; unitPrice: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
}

// `transactions` (real amounts/status/payment method) is exactly what the
// "finance" module gates elsewhere - a user with only "orders" must not
// recover that data through an order's embedded relations, so it is
// included only when the caller can also view finance.
function include(canViewFinance: boolean) {
  return { client: true, branch: { select: { id: true, name: true, city: true } }, items: { include: { service: true } }, employees: { include: { employee: true } }, attachments: true, transactions: canViewFinance, appointments: { include: { employee: { select: { id: true, name: true } } }, orderBy: [{ date: "asc" as const }, { startTime: "asc" as const }] } };
}

// Used by the calendar (click an appointment -> load its full order) and by
// Financeiro's "ver detalhes" action - the one place both features fetch a
// single order's full data from, so neither builds its own parallel query.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;
    const canViewFinance = auth.profile.role === "admin" || auth.profile.allowedModules.includes("finance");
    const order = await prisma.serviceOrder.findUnique({ where: { id, deletedAt: null }, include: include(canViewFinance) });
    assertRecordBranchAccess(auth, order, "OS nao encontrada.");
    return ok(serialize(order));
  } catch (error) {
    return handleAuthzError(error);
  }
}

async function assertSameBranchRelations(
  branchId: string,
  clientId: string,
  serviceIds: string[],
  employeeIds: string[]
) {
  const [client, services, employees] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.service.findMany({ where: { id: { in: serviceIds } } }),
    prisma.employee.findMany({ where: { id: { in: employeeIds } } }),
  ]);
  if (!client || client.branchId !== branchId) {
    throw new AuthzError("Cliente nao pertence a filial da OS.", 422);
  }
  if (services.length !== serviceIds.length || services.some((s) => s.branchId !== branchId)) {
    throw new AuthzError("Um ou mais servicos nao pertencem a filial da OS.", 422);
  }
  if (employees.length !== employeeIds.length || employees.some((e) => e.branchId !== branchId)) {
    throw new AuthzError("Um ou mais funcionarios nao pertencem a filial da OS.", 422);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;
    const existing = await prisma.serviceOrder.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "OS nao encontrada.");
    const parsed = orderSchema.safeParse(await request.json());
    if (!parsed.success) { const { message, field } = orderValidationError(parsed.error); return fail(message, 422, field); }
    const canViewFinance = auth.profile.role === "admin" || auth.profile.allowedModules.includes("finance");
    const branchId = parsed.data.branchId ?? existing.branchId;
    if (branchId !== existing.branchId) assertBranchAccess(auth, branchId);
    const { items, employeeIds, dates: _dates, branchId: _branchId, ...body } = parsed.data;
    await assertSameBranchRelations(branchId, body.clientId, items.map((i) => i.serviceId), employeeIds);
    const data = await prisma.$transaction(async (tx) => {
      await tx.serviceOrderItem.deleteMany({ where: { orderId: id } });
      await tx.orderEmployee.deleteMany({ where: { orderId: id } });
      await tx.serviceOrder.update({
        where: { id },
        data: {
          ...body,
          branchId,
          totalAmount: total(items),
          items: { create: items },
          employees: { create: employeeIds.map((employeeId) => ({ employeeId })) },
        },
      });
      // Cancelling the whole OS also cancels any of its appointments that
      // are still open - individual appointments are never bulk-recreated
      // here (that would wipe their own status/history), only cascade-cancelled.
      // This must run BEFORE the final read below, otherwise the returned
      // order.appointments would be a stale snapshot from before the cascade.
      if (body.status === "cancelado") {
        await tx.appointment.updateMany({
          where: { orderId: id, status: { notIn: ["finalizado", "cancelado"] } },
          data: { status: "cancelado", cancelledAt: new Date(), cancelledBy: auth.userId, cancellationReason: "OS cancelada." },
        });
      }
      // Must run after the status write above and before the final read below,
      // so the returned order (and every other module reading transactions)
      // reflects the up-to-date billing state in the same response.
      await syncOrderBilling(tx, id);
      return tx.serviceOrder.findUniqueOrThrow({ where: { id }, include: include(canViewFinance) });
    }, { timeout: 15000 });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;
    const existing = await prisma.serviceOrder.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "OS nao encontrada.");
    await prisma.serviceOrder.update({ where: { id }, data: { deletedAt: new Date() } });
    return ok({ success: true });
  } catch (error) {
    return handleAuthzError(error);
  }
}
