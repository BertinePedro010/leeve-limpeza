import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, resolveBranchIdForCreate, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { serviceSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "services");
    const branchId = new URL(request.url).searchParams.get("branchId");
    const data = await prisma.service.findMany({
      where: { deletedAt: null, branchId: resolveBranchFilter(auth, branchId) },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "services");
    const parsed = serviceSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Servico invalido.", 422);
    const branchId = resolveBranchIdForCreate(auth, parsed.data.branchId);
    const { branchId: _branchId, ...rest } = parsed.data;
    const data = await prisma.service.create({ data: { ...rest, branchId } });
    return ok(serialize(data), 201);
  } catch (error) {
    return handleAuthzError(error);
  }
}
