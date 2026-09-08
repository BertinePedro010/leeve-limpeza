-- LeeveLimpeza — limite de 6 filiais + acesso automático do admin global.
--
-- NÃO destrutiva: só cria funções/triggers. Nenhuma tabela, coluna, índice,
-- policy RLS ou linha existente é alterada ou removida. As 3 filiais atuais
-- (Cachoeiro e Regiões, Vitória/VV, Serra) e todos os seus dados/IDs
-- permanecem exatamente como estão.

-- ---------------------------------------------------------------------------
-- 1) LIMITE DE 6 FILIAIS (backstop no banco).
--
-- A API (POST /api/branches) já bloqueia com uma contagem sob
-- pg_advisory_xact_lock. Este trigger é a garantia final: vale para QUALQUER
-- INSERT em "branches" (chamada direta à API/DB, script, seed, etc.).
--
-- Concorrência: pg_advisory_xact_lock(748923001) com a MESMA chave usada pela
-- API (BRANCH_CREATE_LOCK_KEY em app/api/branches/route.ts). Advisory lock é
-- reentrante para o mesmo detentor (chamada pela API + pelo trigger na mesma
-- transação = ok) e serializa dois INSERTs concorrentes de filial sem risco
-- de deadlock com o ROW EXCLUSIVE que o próprio INSERT já segura. O segundo
-- só conta depois que o primeiro commitou — nunca passa de 6.
--
-- Conta TODAS as filiais (ativas + inativas): a regra de negócio é "no
-- máximo 6 cadastradas", e isso impede burlar o limite desativando uma
-- filial para criar outra.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "enforce_branch_limit"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  total integer;
BEGIN
  PERFORM pg_advisory_xact_lock(748923001);
  SELECT count(*) INTO total FROM "branches";
  IF total >= 6 THEN
    RAISE EXCEPTION 'Limite máximo de 6 filiais atingido.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_enforce_branch_limit" ON "branches";
CREATE TRIGGER "trg_enforce_branch_limit"
  BEFORE INSERT ON "branches"
  FOR EACH ROW EXECUTE FUNCTION "enforce_branch_limit"();

-- ---------------------------------------------------------------------------
-- 2) ACESSO AUTOMÁTICO DO ADMINISTRADOR GLOBAL A FILIAIS NOVAS.
--
-- "Administrador global" já é definido no sistema (lib/authz.ts
-- requireGlobalAdmin / /api/me) como: profile.role = 'admin', não excluído,
-- com linhas em user_branches cobrindo TODAS as filiais ativas. Não há um
-- flag separado — esta migration NÃO cria um; apenas mantém esse invariante
-- quando uma filial nova entra.
--
-- Ao inserir uma filial, todo admin que HOJE já é global (tem acesso a toda
-- outra filial ativa) recebe automaticamente uma linha user_branches para a
-- filial nova. Admins de filial (role admin, mas sem cobrir todas) e demais
-- perfis NÃO são afetados.
--
-- ON CONFLICT DO NOTHING: idempotente e cobre o caso do próprio criador, que
-- a API também vincula explicitamente.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "link_global_admins_to_new_branch"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "user_branches" ("user_id", "branch_id")
  SELECT p."id", NEW."id"
    FROM "profiles" p
   WHERE p."role" = 'admin'
     AND p."deleted_at" IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM "branches" b
        WHERE b."active" = true
          AND b."id" <> NEW."id"
          AND NOT EXISTS (
            SELECT 1 FROM "user_branches" ub
             WHERE ub."user_id" = p."id"
               AND ub."branch_id" = b."id"
          )
     )
  ON CONFLICT ("user_id", "branch_id") DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "trg_link_global_admins_to_new_branch" ON "branches";
CREATE TRIGGER "trg_link_global_admins_to_new_branch"
  AFTER INSERT ON "branches"
  FOR EACH ROW EXECUTE FUNCTION "link_global_admins_to_new_branch"();
