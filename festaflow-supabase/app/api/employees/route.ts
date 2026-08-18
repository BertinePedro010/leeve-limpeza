import { prisma } from "@/lib/prisma";
import { requireAuth, resolveBranchIdForCreate, handleAuthzError } from "@/lib/authz";
import { employeeSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function GET() {
  try {
    const auth = await requireAuth();
    const data = await prisma.employee.findMany({
      where: { deletedAt: null, branchId: { in: auth.branchIds } },
      orderBy: { name: "asc" },
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const parsed = employeeSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Funcionario invalido.", 422);
    const branchId = resolveBranchIdForCreate(auth, parsed.data.branchId);
    const { branchId: _branchId, ...rest } = parsed.data;
    const data = await prisma.employee.create({ data: { ...rest, branchId } });
    return ok(serialize(data), 201);
  } catch (error) {
    return handleAuthzError(error);
  }
}
