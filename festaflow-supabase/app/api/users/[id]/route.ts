import { prisma } from "@/lib/prisma";
import { requireAuth, requireGlobalAdmin, AuthzError, handleAuthzError } from "@/lib/authz";
import { userUpdateSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

const include = { branches: { select: { branchId: true } } };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    await requireGlobalAdmin(auth);
    const { id } = await params;
    const existing = await prisma.profile.findUnique({ where: { id } });
    if (!existing) throw new AuthzError("Usuario nao encontrado.", 404);
    const parsed = userUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Usuario invalido.", 422);
    const { name, role, active, branchIds, allowedModules } = parsed.data;

    // Prevents an admin from locking themselves out of the admin panel by
    // deactivating their own account, demoting themselves away from admin,
    // or narrowing their own branch coverage below what requireGlobalAdmin
    // (lib/authz.ts) requires - the same computation is repeated here so the
    // guard actually matches the condition that would strip their access.
    if (id === auth.userId) {
      if (!active || role !== "admin") {
        throw new AuthzError("Voce nao pode remover seu proprio acesso de administrador.", 422);
      }
      const activeBranchCount = await prisma.branch.count({ where: { active: true } });
      if (activeBranchCount > 0 && branchIds.length < activeBranchCount) {
        throw new AuthzError("Voce nao pode reduzir suas proprias filiais a ponto de perder o acesso de administrador global.", 422);
      }
    }

    if (branchIds.length > 0) {
      const count = await prisma.branch.count({ where: { id: { in: branchIds } } });
      if (count !== branchIds.length) throw new AuthzError("Uma ou mais filiais informadas nao existem.", 422);
    }

    const data = await prisma.$transaction(async (tx) => {
      await tx.userBranch.deleteMany({ where: { userId: id } });
      return tx.profile.update({
        where: { id },
        data: { name, role, allowedModules, deletedAt: active ? null : new Date(), branches: { create: branchIds.map((branchId) => ({ branchId })) } },
        include,
      });
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}
