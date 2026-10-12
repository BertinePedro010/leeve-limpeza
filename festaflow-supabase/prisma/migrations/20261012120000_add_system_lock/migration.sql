-- Global switch to block/unblock the entire LeeveLimpeza installation for
-- non-payment. Deliberately has NO branch_id column, unlike every other
-- business-data table - this is intentionally installation-wide, blocking
-- every branch at once, never per-branch. Enforced as a true singleton via
-- the fixed id 'global' plus a CHECK constraint, rather than a serial/numeric
-- id, so the single row is self-documenting at every call site that reads
-- it (see lib/system-lock.ts, the only module allowed to touch this table).
CREATE TABLE "system_lock" (
  "id" VARCHAR(16) NOT NULL,
  "is_blocked" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_by" UUID,
  CONSTRAINT "system_lock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_lock_single_row" CHECK ("id" = 'global')
);

CREATE TYPE "SystemLockAction" AS ENUM ('blocked', 'unblocked');

-- Append-only audit trail, same intent/shape as order_send_logs and
-- appointment_reschedule_logs: who did what, when, never edited after
-- insert. changed_by is a plain UUID with NO foreign key to profiles - the
-- developer account allowed to write here (see lib/dev-auth.ts,
-- DEVELOPER_USER_ID) is deliberately not required to have a profiles row.
CREATE TABLE "system_lock_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "action" "SystemLockAction" NOT NULL,
  "reason" TEXT,
  "changed_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "system_lock_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_system_lock_logs_created_at" ON "system_lock_logs" ("created_at" DESC);

-- Seeds the single row as UNBLOCKED by default so this migration is always
-- safe to deploy - existing production traffic is never affected until a
-- developer explicitly uses the /dev panel. ON CONFLICT DO NOTHING keeps
-- this idempotent if the migration is ever re-applied.
INSERT INTO "system_lock" ("id", "is_blocked") VALUES ('global', false) ON CONFLICT ("id") DO NOTHING;
