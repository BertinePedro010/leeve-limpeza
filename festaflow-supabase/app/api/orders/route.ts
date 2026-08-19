import { prisma } from "@/lib/prisma";
import { requireAuth, resolveBranchIdForCreate, resolveBranchFilter, AuthzError, handleAuthzError } from "@/lib/authz";
import { orderSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

async function nextCode(branchId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.serviceOrder.count({ where: { branchId } });
  return `OS-${year}-${String(count + 1).padStart(4, "0")}`;
}

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

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const branchId = new URL(request.url).searchParams.get("branchId");
    const data = await prisma.serviceOrder.findMany({
      where: { deletedAt: null, branchId: resolveBranchFilter(auth, branchId) },
      orderBy: { eventDate: "asc" },
      include,
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const parsed = orderSchema.safeParse(await request.json());
    if (!parsed.success) return fail("OS invalida.", 422);
    const branchId = resolveBranchIdForCreate(auth, parsed.data.branchId);
    const { items, employeeIds, branchId: _branchId, ...body } = parsed.data;
    await assertSameBranchRelations(branchId, body.clientId, items.map((i) => i.serviceId), employeeIds);
    const data = await prisma.serviceOrder.create({
      data: {
        ...body,
        branchId,
        createdBy: auth.userId,
        code: await nextCode(branchId),
        totalAmount: total(items),
        items: { create: items },
        employees: { create: employeeIds.map((employeeId) => ({ employeeId })) },
      },
      include,
    });
    return ok(serialize(data), 201);
  } catch (error) {
    return handleAuthzError(error);
  }
}
