-- Regra de duplicidade de CPF/CNPJ de clientes.
--
-- ANTES: "clients_document_key" (UNIQUE INDEX global em document) bloqueava
--   QUALQUER repeticao de um CPF/CNPJ - inclusive entre filiais diferentes e
--   inclusive quando o nome do cliente era diferente.
-- AGORA: o mesmo CPF/CNPJ pode se repetir para clientes com NOMES diferentes.
--   So e bloqueada a combinacao (mesma filial + mesmo documento so-digitos +
--   mesmo nome normalizado por caixa/espacos).
--
-- Enforcement primario: app-side em app/api/clients (POST/PUT), ver
--   lib/client-dedupe.ts. O indice abaixo e apenas um backstop no banco.
--
-- Seguranca dos dados existentes: verificado contra a base atual (22 linhas
--   de clients) - 0 grupos (mesma filial + mesmo documento + mesmo nome
--   normalizado) e 0 casos do mesmo documento em filiais diferentes. Nenhuma
--   linha existente viola o novo indice; nada e apagado ou alterado.

DROP INDEX IF EXISTS "clients_document_key";

-- Partial + functional UNIQUE: um cliente por (filial, documento so-digitos,
-- nome sem espacos redundantes e sem diferenca de caixa), ignorando linhas
-- soft-deleted e linhas sem documento. Nao duplica o "idx_clients_document"
-- (que continua existindo, e um indice comum em document para buscas).
CREATE UNIQUE INDEX "uq_clients_branch_document_name"
  ON "clients" (
    "branch_id",
    regexp_replace(COALESCE("document", ''), '\D', '', 'g'),
    lower(btrim(regexp_replace("name", '\s+', ' ', 'g')))
  )
  WHERE "deleted_at" IS NULL
    AND "document" IS NOT NULL
    AND regexp_replace("document", '\D', '', 'g') <> '';
