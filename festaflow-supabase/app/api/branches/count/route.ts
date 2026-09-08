import { prisma } from "@/lib/prisma";
import { requireAuth, requireGlobalAdmin, handleAuthzError } from "@/lib/authz";
import { ok, serialize } from "@/lib/json";
import { MAX_BRANCHES } from "@/lib/branch-limit";

// Total real de filiais cadastradas (ativas + inativas) para o painel de
// Filiais decidir se libera o botão "Novo". Restrito ao admin global, igual
// ao resto do CRUD de filiais. O GET /api/branches "normal" devolve só as
// filiais ativas autorizadas do usuário (usado pelo seletor) e não serve
// para contar o limite.
export async function GET() {
  try {
    const auth = await requireAuth();
    await requireGlobalAdmin(auth);
    const total = await prisma.branch.count();
    return ok(serialize({ total, limit: MAX_BRANCHES }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
