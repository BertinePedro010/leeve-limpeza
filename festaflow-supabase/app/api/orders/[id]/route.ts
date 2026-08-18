import { prisma } from "@/lib/prisma";
import { requireAuth, assertRecordBranchAccess, assertBranchAccess, AuthzError, handleAuthzError } from "@/lib/authz";
import { orderSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

function total(items: Array<{ quantity: number; unitPrice: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
}

const include = { client: true, items: { include: { service: true } }, employees: { include: { employee: true } }, attachments: true, transactions: true };

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
    const { id } = await params;
    const existing = await prisma.serviceOrder.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "OS nao encontrada.");
    const parsed = orderSchema.safeParse(await request.json());
    if (!parsed.success) return fail("OS invalida.", 422);
    const branchId = parsed.data.branchId ?? existing.branchId;
    if (branchId !== existing.branchId) assertBranchAccess(auth, branchId);
    const { items, employeeIds, branchId: _branchId, ...body } = parsed.data;
    await assertSameBranchRelations(branchId, body.clientId, items.map((i) => i.serviceId), employeeIds);
    await prisma.$transaction([
      prisma.serviceOrderItem.deleteMany({ where: { orderId: id } }),
      prisma.orderEmployee.deleteMany({ where: { orderId: id } }),
    ]);
    const data = await prisma.serviceOrder.update({
      where: { id },
      data: {
        ...body,
        branchId,
        totalAmount: total(items),
        items: { create: items },
        employees: { create: employeeIds.map((employeeId) => ({ employeeId })) },
      },
      include,
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await params;
    const existing = await prisma.serviceOrder.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "OS nao encontrada.");
    await prisma.serviceOrder.update({ where: { id }, data: { deletedAt: new Date() } });
    return ok({ success: true });
  } catch (error) {
    return handleAuthzError(error);
  }
}
