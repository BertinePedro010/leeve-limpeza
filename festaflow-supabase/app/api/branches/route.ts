import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireGlobalAdmin, handleAuthzError } from "@/lib/authz";
import { branchSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function GET() {
  try {
    const auth = await requireAuth();
    const data = await prisma.branch.findMany({
      where: { id: { in: auth.branchIds }, active: true },
      orderBy: { name: "asc" },
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

// Restricted to the global admin (role admin + access to every active
// branch) - a branch admin manages their own branch's data, not the list
// of branches itself.
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    await requireGlobalAdmin(auth);
    const parsed = branchSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Filial invalida.", 422);
    // The creating global admin is linked to the new branch immediately -
    // otherwise they would be locked out of it (access is always data-driven
    // from user_branches, never inferred from role, even for the creator).
    const data = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({ data: parsed.data });
      await tx.userBranch.create({ data: { userId: auth.userId, branchId: branch.id } });
      return branch;
    }, { timeout: 15000 });
    return ok(serialize(data), 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Ja existe uma filial com esse nome.", 409);
    }
    return handleAuthzError(error);
  }
}
