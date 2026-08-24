-- Minimal, append-only audit trail for "send OS" actions (email/WhatsApp).
-- Purely additive: new enums + one new table, no existing column/table
-- touched. Never stores SMTP credentials, message bodies, or PDF bytes.

-- CreateEnum
CREATE TYPE "SendChannel" AS ENUM ('email', 'whatsapp');

-- CreateEnum
CREATE TYPE "SendStatus" AS ENUM ('sent', 'failed');

-- CreateTable
CREATE TABLE "order_send_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "channel" "SendChannel" NOT NULL,
  "recipient" VARCHAR(255) NOT NULL,
  "status" "SendStatus" NOT NULL,
  "error_message" TEXT,
  "sent_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_send_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_order_send_logs_order_id" ON "order_send_logs"("order_id");

-- CreateIndex
CREATE INDEX "idx_order_send_logs_branch_id" ON "order_send_logs"("branch_id");

-- AddForeignKey
ALTER TABLE "order_send_logs" ADD CONSTRAINT "order_send_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_send_logs" ADD CONSTRAINT "order_send_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_send_logs" ADD CONSTRAINT "order_send_logs_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: same defense-in-depth pattern as migration 20260819100000_rls_branch_isolation.
-- Real enforcement stays lib/authz.ts (Prisma's connection role has
-- BYPASSRLS) - these policies protect any future non-Prisma access path that
-- carries a real Supabase session. No UPDATE/DELETE policy: log rows are
-- append-only by design, matching the branches/user_branches pattern.
ALTER TABLE "order_send_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_select_order_send_logs" ON "order_send_logs" FOR SELECT
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_insert_order_send_logs" ON "order_send_logs" FOR INSERT
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
