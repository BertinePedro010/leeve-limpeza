import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, resolveBranchIdForCreate, resolveBranchFilter, assertBranchAccess, AuthzError, handleAuthzError } from "@/lib/authz";
import type { AuthContext } from "@/lib/authz";
import { transactionSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

async function resolveTransactionBranch(auth: AuthContext, orderId: string | null | undefined, requestedBranchId?: string) {
  if (orderId) {
    const order = await prisma.serviceOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new AuthzError("OS vinculada nao encontrada.", 422);
    assertBranchAccess(auth, order.branchId);
    if (requestedBranchId && requestedBranchId !== order.branchId) {
      throw new AuthzError("branchId informado nao corresponde a filial da OS vinculada.", 422);
    }
    return order.branchId;
  }
  return resolveBranchIdForCreate(auth, requestedBranchId);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "finance");
    const branchId = new URL(request.url).searchParams.get("branchId");
    // `order` intentionally not included - FinanceView resolves a
    // transaction's linked OS from the separately-loaded `orders` list
    // (orders.find), it never reads `t.order`, so embedding the full
    // ServiceOrder per transaction was pure payload weight.
    const data = await prisma.transaction.findMany({
      where: { deletedAt: null, branchId: resolveBranchFilter(auth, branchId) },
      orderBy: { dueDate: "desc" },
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "finance");
    const parsed = transactionSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Lancamento invalido.", 422);
    const branchId = await resolveTransactionBranch(auth, parsed.data.orderId, parsed.data.branchId);
    const { branchId: _branchId, ...rest } = parsed.data;
    const data = await prisma.transaction.create({ data: { ...rest, branchId } });
    return ok(serialize(data), 201);
  } catch (error) {
    return handleAuthzError(error);
  }
}
