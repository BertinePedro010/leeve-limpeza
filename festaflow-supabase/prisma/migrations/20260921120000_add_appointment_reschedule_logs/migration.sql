-- Minimal, append-only audit trail for administrative date/time corrections
-- made to an appointment (see PUT /api/appointments/[id]) - required so a
-- correction applied AFTER an appointment/OS is already "realizado" leaves a
-- trace of who changed it and from/to which date+time, without touching the
-- appointment row's own history. Purely additive: no existing column/table
-- touched, no data deleted. Mirrors the order_send_logs table's shape and
-- RLS approach exactly (migration 20260824130000_add_order_send_logs).

-- CreateTable
CREATE TABLE "appointment_reschedule_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "appointment_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "changed_by" UUID,
  "status_at_change" "OsStatus" NOT NULL,
  "previous_date" DATE NOT NULL,
  "new_date" DATE NOT NULL,
  "previous_start_time" VARCHAR(10) NOT NULL,
  "new_start_time" VARCHAR(10) NOT NULL,
  "previous_end_time" VARCHAR(10) NOT NULL,
  "new_end_time" VARCHAR(10) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "appointment_reschedule_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_appointment_reschedule_logs_appointment_id" ON "appointment_reschedule_logs"("appointment_id");

-- CreateIndex
CREATE INDEX "idx_appointment_reschedule_logs_order_id" ON "appointment_reschedule_logs"("order_id");

-- CreateIndex
CREATE INDEX "idx_appointment_reschedule_logs_branch_id" ON "appointment_reschedule_logs"("branch_id");

-- AddForeignKey
ALTER TABLE "appointment_reschedule_logs" ADD CONSTRAINT "appointment_reschedule_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reschedule_logs" ADD CONSTRAINT "appointment_reschedule_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reschedule_logs" ADD CONSTRAINT "appointment_reschedule_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reschedule_logs" ADD CONSTRAINT "appointment_reschedule_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: same defense-in-depth pattern as order_send_logs. Real enforcement
-- stays lib/authz.ts (Prisma's connection role has BYPASSRLS) - these
-- policies protect any future non-Prisma access path that carries a real
-- Supabase session. No UPDATE/DELETE policy: log rows are append-only by
-- design, matching the order_send_logs / branches / user_branches pattern.
ALTER TABLE "appointment_reschedule_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_select_appointment_reschedule_logs" ON "appointment_reschedule_logs" FOR SELECT
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_insert_appointment_reschedule_logs" ON "appointment_reschedule_logs" FOR INSERT
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
