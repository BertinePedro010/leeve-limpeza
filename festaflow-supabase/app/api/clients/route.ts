import { prisma } from "@/lib/prisma";
import { requireAuth, resolveBranchIdForCreate, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { clientSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const branchId = new URL(request.url).searchParams.get("branchId");
    const data = await prisma.client.findMany({
      where: { deletedAt: null, branchId: resolveBranchFilter(auth, branchId) },
      orderBy: { name: "asc" },
      include: { orders: true },
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const parsed = clientSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Cliente invalido.", 422);
    const branchId = resolveBranchIdForCreate(auth, parsed.data.branchId);
    const { branchId: _branchId, ...rest } = parsed.data;
    const data = await prisma.client.create({ data: { ...rest, branchId } });
    return ok(serialize(data), 201);
  } catch (error) {
    return handleAuthzError(error);
  }
}
