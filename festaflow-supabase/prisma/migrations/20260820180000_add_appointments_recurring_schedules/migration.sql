-- Atendimentos (appointments) + Recorrência (recurring_schedules).
-- Uma OS (service_orders) passa a poder ter vários atendimentos individuais,
-- cada um com seu próprio status/cancelamento, sem afetar a OS nem os demais.
-- Aditiva: nenhuma coluna/tabela existente é removida. service_orders mantém
-- event_date/start_time/end_time/status como resumo do "primeiro atendimento"
-- para telas que ainda os leem.

CREATE TYPE "RecurrenceFrequency" AS ENUM ('weekly', 'monthly');

CREATE TABLE "appointments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "employee_id" UUID,
  "date" DATE NOT NULL,
  "start_time" VARCHAR(10) NOT NULL,
  "end_time" VARCHAR(10) NOT NULL,
  "status" "OsStatus" NOT NULL DEFAULT 'pendente',
  "notes" TEXT,
  "cancellation_reason" TEXT,
  "cancelled_at" TIMESTAMPTZ(6),
  "cancelled_by" UUID,
  "completed_at" TIMESTAMPTZ(6),
  "recurring_schedule_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_appointments_recurring_date" ON "appointments"("recurring_schedule_id", "date");
CREATE INDEX "idx_appointments_branch_date" ON "appointments"("branch_id", "date");
CREATE INDEX "idx_appointments_order_id" ON "appointments"("order_id");
CREATE INDEX "idx_appointments_status" ON "appointments"("status");

CREATE TABLE "recurring_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "frequency" "RecurrenceFrequency" NOT NULL,
  "interval" INTEGER NOT NULL DEFAULT 1,
  "day_of_week" INTEGER,
  "day_of_month" INTEGER,
  "start_time" VARCHAR(10) NOT NULL,
  "end_time" VARCHAR(10) NOT NULL,
  "price" DECIMAL(10, 2) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "generated_until" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recurring_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_recurring_schedules_branch_id" ON "recurring_schedules"("branch_id");
CREATE INDEX "idx_recurring_schedules_active" ON "recurring_schedules"("active");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_recurring_schedule_id_fkey" FOREIGN KEY ("recurring_schedule_id") REFERENCES "recurring_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cobrança mensal: reaproveita transactions em vez de criar uma tabela nova.
-- "Cobrança cancelada" = deleted_at preenchido (soft-delete já existente).
ALTER TABLE "transactions" ADD COLUMN "recurring_schedule_id" UUID;
ALTER TABLE "transactions" ADD COLUMN "billing_period" DATE;
CREATE INDEX "idx_transactions_recurring_schedule_id" ON "transactions"("recurring_schedule_id");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_schedule_id_fkey" FOREIGN KEY ("recurring_schedule_id") REFERENCES "recurring_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: cada OS existente (não excluída) ganha um atendimento inicial
-- espelhando seus dados atuais de data/horário/status, preservando histórico.
INSERT INTO "appointments" ("order_id", "branch_id", "date", "start_time", "end_time", "status")
SELECT "id", "branch_id", "event_date"::date, "start_time", "end_time", "status"
FROM "service_orders"
WHERE "deleted_at" IS NULL;

-- RLS: mesmo padrão já usado em 20260819100000_rls_branch_isolation
-- (defesa em profundidade; a conexão do Prisma tem BYPASSRLS confirmado,
-- autorização real permanece em lib/authz.ts).
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recurring_schedules" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_select_appointments" ON "appointments" FOR SELECT
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_insert_appointments" ON "appointments" FOR INSERT
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_update_appointments" ON "appointments" FOR UPDATE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()))
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_delete_appointments" ON "appointments" FOR DELETE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));

CREATE POLICY "branch_select_recurring_schedules" ON "recurring_schedules" FOR SELECT
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_insert_recurring_schedules" ON "recurring_schedules" FOR INSERT
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_update_recurring_schedules" ON "recurring_schedules" FOR UPDATE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()))
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_delete_recurring_schedules" ON "recurring_schedules" FOR DELETE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
