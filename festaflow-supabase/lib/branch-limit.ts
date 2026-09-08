// Limite de negócio: no máximo 6 filiais cadastradas no total (ativas +
// inativas). Constante pura, sem dependência de servidor, para ser importada
// tanto pela API (app/api/branches) quanto pelo frontend (BranchesView) sem
// duplicar o número em dois lugares.
//
// A regra é imposta em três camadas independentes:
//   1. Frontend: botão "Novo" desabilitado quando total >= MAX_BRANCHES.
//   2. API: POST /api/branches conta dentro de uma transação com
//      pg_advisory_xact_lock e devolve 409 antes de inserir.
//   3. Banco: trigger BEFORE INSERT em "branches" (migration
//      20260902140000_branch_limit_and_global_admin) — backstop final,
//      vale inclusive para qualquer INSERT fora desta API.
export const MAX_BRANCHES = 6;

export const BRANCH_LIMIT_MESSAGE = `Limite máximo de ${MAX_BRANCHES} filiais atingido.`;
