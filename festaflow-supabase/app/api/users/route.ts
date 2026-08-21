import { prisma } from "@/lib/prisma";
import { requireAuth, requireGlobalAdmin, AuthzError, handleAuthzError } from "@/lib/authz";
import { userCreateSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const include = { branches: { select: { branchId: true } } };

// Admin-only user/permission management. requireGlobalAdmin (not just
// requireRole(admin)) so a branch-scoped admin can't grant module or branch
// access beyond what a global admin themselves would have - same principle
// already used for /api/branches.
export async function GET() {
  try {
    const auth = await requireAuth();
    await requireGlobalAdmin(auth);
    const data = await prisma.profile.findMany({ orderBy: { name: "asc" }, include });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    await requireGlobalAdmin(auth);
    const parsed = userCreateSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Usuario invalido.", 422);
    const { name, email, password, role, branchIds, allowedModules } = parsed.data;

    if (branchIds.length > 0) {
      const count = await prisma.branch.count({ where: { id: { in: branchIds } } });
      if (count !== branchIds.length) throw new AuthzError("Uma ou mais filiais informadas nao existem.", 422);
    }

    const admin = createSupabaseAdminClient();
    const { data: created, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (authError || !created.user) {
      throw new AuthzError(authError?.message || "Erro ao criar usuario no Supabase Auth.", 422);
    }

    try {
      const profile = await prisma.profile.create({
        data: { id: created.user.id, name, email, role, allowedModules, branches: { create: branchIds.map((branchId) => ({ branchId })) } },
        include,
      });
      return ok(serialize(profile), 201);
    } catch (dbError) {
      // Prisma and Supabase Auth are separate systems with no shared
      // transaction - roll back the auth.users row created above so a
      // Profile-creation failure never leaves an orphaned, loginable auth
      // user with no application-side profile. If the rollback itself fails,
      // log the orphaned user id so an operator can find and remove it
      // manually - it can't be used to access app data (requireAuth rejects
      // any session without a matching Profile), so this is a hygiene gap,
      // not a silent data-access risk, but it must not be swallowed unlogged.
      await admin.auth.admin.deleteUser(created.user.id).catch((rollbackError) => {
        console.error(`Falha ao reverter auth.users apos erro de Profile.create - usuario orfao: ${created.user.id}`, rollbackError);
      });
      throw dbError;
    }
  } catch (error) {
    return handleAuthzError(error);
  }
}
