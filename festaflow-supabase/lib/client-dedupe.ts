// Duplicate-client rule (CPF/CNPJ): the same document may be reused for
// clients with DIFFERENT names, but not for two clients with the SAME
// normalized name in the SAME branch. Normalization is comparison-only - the
// stored `name`/`document` are never rewritten. Kept branch-scoped on
// purpose: a user only ever queries their own branch's clients, so this
// never reads across branches (see app/api/clients - the candidate list is
// already filtered by branchId there).

// CPF/CNPJ compared by digits only: "123.456.789-00" == "12345678900".
export function normalizeDocument(document: string | null | undefined): string {
  return (document ?? "").replace(/\D/g, "");
}

// Name compared case-insensitively, with leading/trailing and repeated
// whitespace collapsed: "  Joao  da   Silva " == "joao da silva".
export function normalizeClientName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

type ClientKeyFields = { name?: string | null; document?: string | null };

// Returns true when `candidate` (an existing client row) collides with the
// client being saved under the duplicate rule. Callers pass a branch-scoped
// list and must exclude the row being edited by id before calling.
export function isDuplicateClient(
  incoming: { name: string; document: string | null | undefined },
  candidate: ClientKeyFields
): boolean {
  const incomingDoc = normalizeDocument(incoming.document);
  if (!incomingDoc) return false; // no document -> rule does not apply
  return (
    normalizeDocument(candidate.document) === incomingDoc &&
    normalizeClientName(candidate.name) === normalizeClientName(incoming.name)
  );
}

export const DUPLICATE_CLIENT_MESSAGE =
  "Ja existe um cliente cadastrado com este CPF/CNPJ e este mesmo nome.";
