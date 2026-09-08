import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, assertBranchAccess, handleAuthzError } from "@/lib/authz";
import { clientSchema } from "@/lib/validators";
import { formatClientAddressLine } from "@/lib/client-address";
import { checkDuplicateClient, isDuplicateClientDbError } from "@/lib/client-dedupe.server";
import { DUPLICATE_CLIENT_MESSAGE } from "@/lib/client-dedupe";
import { fail, ok, serialize } from "@/lib/json";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "clients");
    const { id } = await params;
    const existing = await prisma.client.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Cliente nao encontrado.");
    const parsed = clientSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Cliente invalido.", 422);
    const branchId = parsed.data.branchId ?? existing.branchId;
    if (branchId !== existing.branchId) assertBranchAccess(auth, branchId);
    const { branchId: _branchId, address: _legacyAddress, ...rest } = parsed.data;
    // Ignore the client's own row (id) so saving it unchanged never counts as
    // a duplicate; any OTHER row in the branch with the same normalized
    // document + name is still rejected.
    const duplicate = await checkDuplicateClient(branchId, rest.name, rest.document, id);
    if (duplicate) return duplicate;
    const data = await prisma.client.update({ where: { id }, data: { ...rest, address: formatClientAddressLine(rest), branchId } });
    return ok(serialize(data));
  } catch (error) {
    if (isDuplicateClientDbError(error)) return fail(DUPLICATE_CLIENT_MESSAGE, 409);
    return handleAuthzError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "clients");
    const { id } = await params;
    const existing = await prisma.client.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Cliente nao encontrado.");
    await prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
    return ok({ success: true });
  } catch (error) {
    return handleAuthzError(error);
  }
}
