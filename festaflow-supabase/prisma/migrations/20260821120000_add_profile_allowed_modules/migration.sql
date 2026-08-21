-- Modulo-level permission list per profile.
-- Aditiva: nenhuma coluna/dado existente e removida ou reescrita.
--
-- role='admin' sempre ignora esta lista (bypass total, ver requireModule()
-- em lib/authz.ts). Perfis existentes recebem a lista completa no backfill
-- abaixo para preservar exatamente o comportamento atual (hoje qualquer
-- usuario autenticado com acesso a filial ja pode usar todos os modulos -
-- nenhuma rota alem de branches verifica role). So a partir de agora,
-- perfis novos ou editados pelo admin passam a ter uma lista restrita real.

ALTER TABLE "profiles" ADD COLUMN "allowed_modules" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "profiles"
SET "allowed_modules" = ARRAY['clients','employees','services','orders','calendar','finance','reports']
WHERE "deleted_at" IS NULL;
