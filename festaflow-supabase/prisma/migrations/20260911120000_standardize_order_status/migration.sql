-- LeeveLimpeza — padroniza o status de OS/atendimento para apenas 2 valores:
-- "agendado" e "realizado". Nenhum dado historico e apagado.
--
-- Mapeamento (ver lib/order-status.ts para a logica de exibicao derivada):
--   pendente      -> agendado
--   confirmado    -> agendado
--   em_andamento  -> agendado
--   finalizado    -> realizado
--   cancelado     -> agendado (o status deixa de carregar "cancelado";
--                    o cancelamento passa a ser um FATO separado, marcado
--                    por cancelled_at/cancelled_by/cancellation_reason -
--                    exatamente como "appointments" ja fazia antes desta
--                    migration, agora espelhado em "service_orders")
--
-- "service_orders" nao tinha cancelled_at/cancelled_by/cancellation_reason
-- (so "appointments" tinha) - por isso os 3 passos abaixo, nesta ordem:
--   1) adicionar as 3 colunas (aditivo).
--   2) fazer backfill de cancelled_at/cancellation_reason para toda OS que
--      hoje esta com status='cancelado', ANTES de remapear o status - sem
--      isso a informacao "esta OS foi cancelada" seria perdida. Nao existe
--      timestamp exato do cancelamento para OS (o status era o unico
--      registro) - updated_at e usado como aproximacao razoavel, deixado
--      explicito aqui para quem for auditar os dados depois.
--   3) converter as colunas "status" (service_orders e appointments) para
--      TEXT, remapear os valores, recriar o enum OsStatus com somente os
--      2 valores novos e converter as colunas de volta - unica forma segura
--      de remover valores de um enum Postgres (nao existe "ALTER TYPE ...
--      DROP VALUE"). "appointments" mantem cancelled_at/cancelled_by/
--      cancellation_reason exatamente como estavam - apenas o "status" e
--      remapeado.

-- 1) Colunas de cancelamento em service_orders (mesmo padrao de appointments).
ALTER TABLE "service_orders" ADD COLUMN "cancelled_at" TIMESTAMPTZ(6);
ALTER TABLE "service_orders" ADD COLUMN "cancelled_by" UUID;
ALTER TABLE "service_orders" ADD COLUMN "cancellation_reason" TEXT;

-- 2) Backfill: preserva "esta OS foi cancelada" antes do status ser remapeado.
UPDATE "service_orders"
   SET "cancelled_at" = "updated_at",
       "cancellation_reason" = 'OS cancelada.'
 WHERE "status" = 'cancelado'
   AND "cancelled_at" IS NULL;

-- 3) Remapeia os valores e recria o enum com somente agendado/realizado.
ALTER TABLE "service_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "appointments" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "service_orders" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "appointments" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

UPDATE "service_orders"
   SET "status" = CASE "status"
         WHEN 'pendente' THEN 'agendado'
         WHEN 'confirmado' THEN 'agendado'
         WHEN 'em_andamento' THEN 'agendado'
         WHEN 'finalizado' THEN 'realizado'
         WHEN 'cancelado' THEN 'agendado'
         ELSE "status"
       END;

UPDATE "appointments"
   SET "status" = CASE "status"
         WHEN 'pendente' THEN 'agendado'
         WHEN 'confirmado' THEN 'agendado'
         WHEN 'em_andamento' THEN 'agendado'
         WHEN 'finalizado' THEN 'realizado'
         WHEN 'cancelado' THEN 'agendado'
         ELSE "status"
       END;

DROP TYPE "OsStatus";
CREATE TYPE "OsStatus" AS ENUM ('agendado', 'realizado');

ALTER TABLE "service_orders" ALTER COLUMN "status" TYPE "OsStatus" USING "status"::"OsStatus";
ALTER TABLE "service_orders" ALTER COLUMN "status" SET DEFAULT 'agendado';
ALTER TABLE "appointments" ALTER COLUMN "status" TYPE "OsStatus" USING "status"::"OsStatus";
ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'agendado';
