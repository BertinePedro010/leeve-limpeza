import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, assertBranchAccess, handleAuthzError } from "@/lib/authz";
import { employeeSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "employees");
    const { id } = await params;
    const existing = await prisma.employee.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Funcionario nao encontrado.");
    const parsed = employeeSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Funcionario invalido.", 422);
    const branchId = parsed.data.branchId ?? existing.branchId;
    if (branchId !== existing.branchId) assertBranchAccess(auth, branchId);
    const { branchId: _branchId, ...rest } = parsed.data;
    const data = await prisma.employee.update({ where: { id }, data: { ...rest, branchId } });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "employees");
    const { id } = await params;
    const existing = await prisma.employee.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Funcionario nao encontrado.");
    await prisma.employee.update({ where: { id }, data: { deletedAt: new Date() } });
    return ok({ success: true });
  } catch (error) {
    return handleAuthzError(error);
  }
}
