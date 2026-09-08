-- LeeveLimpeza — restruturação de filiais (não destrutiva).
--
-- Objetivo:
--   1. RENOMEAR a filial existente "Grande Vitória" para "Vitória/VV",
--      preservando o MESMO id (fa84e964-4050-46e1-b1ed-a72e4997a1d7) e todos
--      os relacionamentos (user_branches, employees, clients, services,
--      service_orders, transactions, appointments, recurring_schedules,
--      order_send_logs). Nada é movido — só o campo `name` muda.
--   2. CRIAR a nova filial "Serra" com um id próprio novo (gen_random_uuid()),
--      ativa, sem nenhum dado operacional vinculado.
--   3. Vincular "Serra" em user_branches a todo admin que hoje é
--      "administrador global" (já possui acesso a todas as filiais ativas).
--      Sem isso, requireGlobalAdmin()/api/me passariam a considerar esses
--      admins como NÃO-globais (2 de 3 filiais) e eles perderiam acesso à
--      tela de filiais e à Serra.
--
-- A filial "Cachoeiro e Regiões" (id ad66bb4a-5c50-469d-a2b9-de3a91c8e039)
-- NÃO é tocada por decisão explícita do responsável pelo sistema.
--
-- Idempotência: cada passo tem guarda (WHERE / NOT EXISTS / ON CONFLICT),
-- então reexecução manual é segura.

-- 1) Renomear "Grande Vitória" -> "Vitória/VV" (mesmo id, mesmos vínculos).
UPDATE "branches"
   SET "name" = 'Vitória/VV',
       "updated_at" = now()
 WHERE "id" = 'fa84e964-4050-46e1-b1ed-a72e4997a1d7'
   AND "name" = 'Grande Vitória';

-- 2) Criar a filial "Serra" (id novo, ativa).
INSERT INTO "branches" ("name", "city", "state", "active")
SELECT 'Serra', 'Serra', 'ES', true
 WHERE NOT EXISTS (SELECT 1 FROM "branches" WHERE "name" = 'Serra');

-- 3) Vincular "Serra" a cada admin global atual.
--    "admin global" = profile role=admin, não excluído, e que já tem uma
--    linha em user_branches para TODA filial ativa diferente da Serra.
INSERT INTO "user_branches" ("user_id", "branch_id")
SELECT p."id", s."id"
  FROM "profiles" p
  CROSS JOIN (SELECT "id" FROM "branches" WHERE "name" = 'Serra') s
 WHERE p."role" = 'admin'
   AND p."deleted_at" IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM "branches" b
      WHERE b."active" = true
        AND b."id" <> s."id"
        AND NOT EXISTS (
          SELECT 1 FROM "user_branches" ub
           WHERE ub."user_id" = p."id"
             AND ub."branch_id" = b."id"
        )
   )
ON CONFLICT ("user_id", "branch_id") DO NOTHING;
