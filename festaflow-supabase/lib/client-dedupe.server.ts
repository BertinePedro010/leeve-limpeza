import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/json";
import { isDuplicateClient, normalizeDocument, DUPLICATE_CLIENT_MESSAGE } from "@/lib/client-dedupe";

// Server-only half of the duplicate-client rule (keeps lib/client-dedupe.ts
// free of any server import so the pure normalizers stay usable client-side).
//
// Same CPF/CNPJ is allowed for clients with DIFFERENT names; blocked for the
// same normalized name in the same branch. Branch-scoped by design - the
// candidate query never leaves `branchId`, so this stays fully inside the
// existing per-branch isolation and never reads another branch's clients.
// `excludeId` skips the row being edited so a client never clashes with
// itself. Returns a ready 409 Response on clash, or null to proceed.
export async function checkDuplicateClient(
  branchId: string,
  name: string,
  document: string | null | undefined,
  excludeId?: string
) {
  if (!normalizeDocument(document)) return null; // no document -> rule N/A
  const candidates = await prisma.client.findMany({
    where: {
      branchId,
      deletedAt: null,
      document: { not: null },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true, document: true },
  });
  if (candidates.some((c) => isDuplicateClient({ name, document }, c))) {
    return fail(DUPLICATE_CLIENT_MESSAGE, 409);
  }
  return null;
}

// Backstop: if the DB partial unique index (uq_clients_branch_document_name)
// rejects the write despite the check above (race between two identical
// concurrent submits, or a normalization edge case), surface the same
// friendly message instead of a raw 500. That index is the only unique index
// on `clients` now that the global document unique was dropped.
export function isDuplicateClientDbError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
