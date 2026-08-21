import { prisma } from "@/lib/prisma";
import { requireAuth, assertRecordBranchAccess, AuthzError, handleAuthzError } from "@/lib/authz";
import { appointmentUpdateSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

const include = {
  order: { select: { id: true, code: true, clientId: true, client: { select: { id: true, name: true } } } },
  employee: { select: { id: true, name: true } },
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await params;
    const existing = await prisma.appointment.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Atendimento nao encontrado.");
    const parsed = appointmentUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Atendimento invalido.", 422);

    if (parsed.data.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
      if (!employee || employee.branchId !== existing.branchId) {
        throw new AuthzError("Funcionario nao pertence a filial do atendimento.", 422);
      }
    }

    const data = await prisma.appointment.update({ where: { id }, data: parsed.data, include });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}
