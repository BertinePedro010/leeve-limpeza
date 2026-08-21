import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, assertBranchAccess, AuthzError, handleAuthzError } from "@/lib/authz";
import type { AuthContext } from "@/lib/authz";
import { transactionSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

async function resolveTransactionBranch(auth: AuthContext, orderId: string | null | undefined, requestedBranchId: string | undefined, fallbackBranchId: string) {
  if (orderId) {
    const order = await prisma.serviceOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new AuthzError("OS vinculada nao encontrada.", 422);
    assertBranchAccess(auth, order.branchId);
    if (requestedBranchId && requestedBranchId !== order.branchId) {
      throw new AuthzError("branchId informado nao corresponde a filial da OS vinculada.", 422);
    }
    return order.branchId;
  }
  return fallbackBranchId;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "finance");
    const { id } = await params;
    const existing = await prisma.transaction.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Lancamento nao encontrado.");
    const parsed = transactionSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Lancamento invalido.", 422);
    const requested = parsed.data.branchId ?? existing.branchId;
    if (requested !== existing.branchId) assertBranchAccess(auth, requested);
    const branchId = await resolveTransactionBranch(auth, parsed.data.orderId, parsed.data.branchId, requested);
    const { branchId: _branchId, ...rest } = parsed.data;
    const data = await prisma.transaction.update({ where: { id }, data: { ...rest, branchId } });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "finance");
    const { id } = await params;
    const existing = await prisma.transaction.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Lancamento nao encontrado.");
    await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
    return ok({ success: true });
  } catch (error) {
    return handleAuthzError(error);
  }
}
