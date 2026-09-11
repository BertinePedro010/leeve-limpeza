import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, resolveBranchIdForCreate, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { clientSchema, clientValidationError } from "@/lib/validators";
import { formatClientAddressLine } from "@/lib/client-address";
import { checkDuplicateClient, isDuplicateClientDbError } from "@/lib/client-dedupe.server";
import { DUPLICATE_CLIENT_MESSAGE, clientMatchesSearch } from "@/lib/client-dedupe";
import { fail, ok, serialize } from "@/lib/json";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "clients");
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    const search = url.searchParams.get("search");
    // `orders` intentionally not included - the frontend Client type has no
    // `orders` field and never reads it; embedding every client's full order
    // history here was pure payload weight.
    const data = await prisma.client.findMany({
      where: { deletedAt: null, branchId: resolveBranchFilter(auth, branchId) },
      orderBy: { name: "asc" },
    });
    // Filtered here (not in the WHERE clause) because `document` is stored
    // exactly as typed - never normalized at rest (see clientSchema) - so a
    // DB-level `contains` can't match "11.406.274/0001-00" against a search
    // of "11406274000100" or vice-versa. `data` above is already scoped to
    // the caller's branch, so this never reads or returns another branch's
    // rows - same branch-scoped-then-filter shape as checkDuplicateClient.
    const filtered = search ? data.filter((c) => clientMatchesSearch(c, search)) : data;
    return ok(serialize(filtered));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "clients");
    const parsed = clientSchema.safeParse(await request.json());
    if (!parsed.success) { const { message, field } = clientValidationError(parsed.error); return fail(message, 422, field); }
    const branchId = resolveBranchIdForCreate(auth, parsed.data.branchId);
    const { branchId: _branchId, address: _legacyAddress, ...rest } = parsed.data;
    const duplicate = await checkDuplicateClient(branchId, rest.name, rest.document);
    if (duplicate) return duplicate;
    const data = await prisma.client.create({ data: { ...rest, address: formatClientAddressLine(rest), branchId } });
    return ok(serialize(data), 201);
  } catch (error) {
    if (isDuplicateClientDbError(error)) return fail(DUPLICATE_CLIENT_MESSAGE, 409, "document");
    return handleAuthzError(error);
  }
}
