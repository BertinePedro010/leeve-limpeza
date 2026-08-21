-- Forma de pagamento estruturada + faturamento idempotente.
-- Aditiva: nenhuma coluna/dado existente é removida ou reescrita.
--
-- service_orders.payment_method (texto livre) permanece intocada, mapeada no
-- Prisma como `paymentMethodLegacy` - preserva registros como "Pix 50/50" e
-- "Faturamento 30 dias" (ver prisma/seed.ts) sem qualquer conversão. Toda
-- escrita nova usa a coluna nova `payment_method_new` (enum), mapeada como
-- `paymentMethod` no Prisma.

CREATE TYPE "PaymentMethod" AS ENUM ('pix', 'credit_card', 'debit_card', 'cash');

ALTER TABLE "service_orders" ADD COLUMN "payment_method_new" "PaymentMethod";

ALTER TABLE "transactions" ADD COLUMN "payment_method" "PaymentMethod";
ALTER TABLE "transactions" ADD COLUMN "is_auto_revenue" BOOLEAN NOT NULL DEFAULT false;

-- Garante, no próprio banco, que uma OS nunca produza mais de um lançamento
-- financeiro automático (is_auto_revenue = true), não importa quantas vezes
-- a finalização seja reprocessada. Índice parcial: não afeta lançamentos
-- manuais (is_auto_revenue = false), que continuam ilimitados por OS.
CREATE UNIQUE INDEX "uq_transactions_auto_revenue_per_order"
  ON "transactions"("order_id")
  WHERE "is_auto_revenue" = true;

-- RLS: nenhuma policy nova necessária - as policies de branch_id em
-- service_orders/transactions (20260819100000_rls_branch_isolation) já
-- cobrem todas as colunas da tabela, incluindo as novas acima.
