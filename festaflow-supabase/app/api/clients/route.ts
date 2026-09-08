import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, resolveBranchIdForCreate, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { clientSchema } from "@/lib/validators";
import { formatClientAddressLine } from "@/lib/client-address";
import { checkDuplicateClient, isDuplicateClientDbError } from "@/lib/client-dedupe.server";
import { DUPLICATE_CLIENT_MESSAGE } from "@/lib/client-dedupe";
import { fail, ok, serialize } from "@/lib/json";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "clients");
    const branchId = new URL(request.url).searchParams.get("branchId");
    // `orders` intentionally not included - the frontend Client type has no
    // `orders` field and never reads it; embedding every client's full order
    // history here was pure payload weight.
    const data = await prisma.client.findMany({
      where: { deletedAt: null, branchId: resolveBranchFilter(auth, branchId) },
      orderBy: { name: "asc" },
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "clients");
    const parsed = clientSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Cliente invalido.", 422);
    const branchId = resolveBranchIdForCreate(auth, parsed.data.branchId);
    const { branchId: _branchId, address: _legacyAddress, ...rest } = parsed.data;
    const duplicate = await checkDuplicateClient(branchId, rest.name, rest.document);
    if (duplicate) return duplicate;
    const data = await prisma.client.create({ data: { ...rest, address: formatClientAddressLine(rest), branchId } });
    return ok(serialize(data), 201);
  } catch (error) {
    if (isDuplicateClientDbError(error)) return fail(DUPLICATE_CLIENT_MESSAGE, 409);
    return handleAuthzError(error);
  }
}
