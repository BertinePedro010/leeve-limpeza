import { prisma } from "@/lib/prisma";
import { requireAuth, requireGlobalAdmin, AuthzError, handleAuthzError } from "@/lib/authz";
import { userResetPasswordSchema } from "@/lib/validators";
import { fail, ok } from "@/lib/json";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    await requireGlobalAdmin(auth);
    const { id } = await params;
    const existing = await prisma.profile.findUnique({ where: { id } });
    if (!existing) throw new AuthzError("Usuario nao encontrado.", 404);
    const parsed = userResetPasswordSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Senha invalida.", 422);

    const admin = createSupabaseAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { password: parsed.data.password });
    if (error) throw new AuthzError(error.message, 422);

    return ok({ success: true });
  } catch (error) {
    return handleAuthzError(error);
  }
}
