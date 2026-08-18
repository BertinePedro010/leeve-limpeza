-- Multi-branch architecture (Vitória / Cachoeiro isolation)
-- All target tables (clients, employees, services, service_orders, transactions)
-- are confirmed empty at the time of this migration, so branch_id can be added
-- as NOT NULL directly, without a nullable-then-backfill two-step.

CREATE TABLE "branches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(120) NOT NULL,
  "city" VARCHAR(120) NOT NULL,
  "state" VARCHAR(2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- Seed the two initial branches (Espírito Santo, BR — Vitória is the state
-- capital, Cachoeiro de Itapemirim its second-largest city; confirm/correct
-- city/state if this assumption is wrong, it's a trivial UPDATE later).
INSERT INTO "branches" ("name", "city", "state") VALUES
  ('Vitória', 'Vitória', 'ES'),
  ('Cachoeiro', 'Cachoeiro de Itapemirim', 'ES');

CREATE TABLE "user_branches" (
  "user_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_branches_pkey" PRIMARY KEY ("user_id", "branch_id")
);

CREATE INDEX "idx_user_branches_branch_id" ON "user_branches"("branch_id");

ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- clients
ALTER TABLE "clients" ADD COLUMN "branch_id" UUID NOT NULL;
CREATE INDEX "idx_clients_branch_id" ON "clients"("branch_id");
ALTER TABLE "clients" ADD CONSTRAINT "clients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- employees
ALTER TABLE "employees" ADD COLUMN "branch_id" UUID NOT NULL;
CREATE INDEX "idx_employees_branch_id" ON "employees"("branch_id");
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- services
ALTER TABLE "services" ADD COLUMN "branch_id" UUID NOT NULL;
CREATE INDEX "idx_services_branch_id" ON "services"("branch_id");
ALTER TABLE "services" ADD CONSTRAINT "services_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- service_orders
ALTER TABLE "service_orders" ADD COLUMN "branch_id" UUID NOT NULL;
ALTER TABLE "service_orders" ADD COLUMN "created_by" UUID;
CREATE INDEX "idx_service_orders_branch_id" ON "service_orders"("branch_id");
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- transactions
ALTER TABLE "transactions" ADD COLUMN "branch_id" UUID NOT NULL;
CREATE INDEX "idx_transactions_branch_id" ON "transactions"("branch_id");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
