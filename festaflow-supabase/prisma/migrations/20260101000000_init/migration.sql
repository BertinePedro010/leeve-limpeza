CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "UserRole" AS ENUM ('admin', 'operador', 'funcionario');
CREATE TYPE "OsStatus" AS ENUM ('pendente', 'confirmado', 'em_andamento', 'finalizado', 'cancelado');
CREATE TYPE "TransactionType" AS ENUM ('receita', 'despesa');
CREATE TYPE "PaymentStatus" AS ENUM ('pago', 'pendente');

CREATE TABLE "profiles" (
  "id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "email" VARCHAR(180) NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'operador',
  "avatar_url" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(180) NOT NULL,
  "email" VARCHAR(180),
  "phone" VARCHAR(40),
  "document" VARCHAR(40),
  "address" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(180) NOT NULL,
  "role" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(40),
  "daily_rate" NUMERIC(10,2) NOT NULL,
  "payment_type" VARCHAR(30) NOT NULL DEFAULT 'diaria',
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "services" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "price" NUMERIC(10,2) NOT NULL,
  "duration_hours" NUMERIC(5,2) NOT NULL,
  "category" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(40) NOT NULL,
  "client_id" UUID NOT NULL,
  "event_date" TIMESTAMPTZ(6) NOT NULL,
  "start_time" VARCHAR(10) NOT NULL,
  "end_time" VARCHAR(10) NOT NULL,
  "location" TEXT NOT NULL,
  "status" "OsStatus" NOT NULL DEFAULT 'pendente',
  "payment_method" VARCHAR(160),
  "notes" TEXT,
  "signature_name" VARCHAR(180),
  "signature_date" TIMESTAMPTZ(6),
  "total_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_order_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit_price" NUMERIC(10,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_employees" (
  "order_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_employees_pkey" PRIMARY KEY ("order_id", "employee_id")
);

CREATE TABLE "attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "file_name" VARCHAR(220) NOT NULL,
  "file_url" TEXT NOT NULL,
  "mime_type" VARCHAR(120),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "TransactionType" NOT NULL,
  "category" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "amount" NUMERIC(10,2) NOT NULL,
  "due_date" TIMESTAMPTZ(6) NOT NULL,
  "paid_at" TIMESTAMPTZ(6),
  "status" "PaymentStatus" NOT NULL DEFAULT 'pendente',
  "order_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");
CREATE UNIQUE INDEX "clients_document_key" ON "clients"("document");
CREATE UNIQUE INDEX "service_orders_code_key" ON "service_orders"("code");
CREATE INDEX "idx_profiles_email" ON "profiles"("email");
CREATE INDEX "idx_clients_name" ON "clients"("name");
CREATE INDEX "idx_clients_email" ON "clients"("email");
CREATE INDEX "idx_clients_phone" ON "clients"("phone");
CREATE INDEX "idx_clients_document" ON "clients"("document");
CREATE INDEX "idx_employees_name" ON "employees"("name");
CREATE INDEX "idx_employees_phone" ON "employees"("phone");
CREATE INDEX "idx_services_name" ON "services"("name");
CREATE INDEX "idx_services_category" ON "services"("category");
CREATE INDEX "idx_service_orders_client_id" ON "service_orders"("client_id");
CREATE INDEX "idx_service_orders_event_date" ON "service_orders"("event_date");
CREATE INDEX "idx_service_orders_status" ON "service_orders"("status");
CREATE INDEX "idx_service_order_items_order_id" ON "service_order_items"("order_id");
CREATE INDEX "idx_service_order_items_service_id" ON "service_order_items"("service_id");
CREATE INDEX "idx_order_employees_order_id" ON "order_employees"("order_id");
CREATE INDEX "idx_order_employees_employee_id" ON "order_employees"("employee_id");
CREATE INDEX "idx_attachments_order_id" ON "attachments"("order_id");
CREATE INDEX "idx_transactions_type" ON "transactions"("type");
CREATE INDEX "idx_transactions_status" ON "transactions"("status");
CREATE INDEX "idx_transactions_due_date" ON "transactions"("due_date");
CREATE INDEX "idx_transactions_order_id" ON "transactions"("order_id");

ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_employees" ADD CONSTRAINT "order_employees_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_employees" ADD CONSTRAINT "order_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self_read" ON "profiles" FOR SELECT USING (auth.uid() = id);
CREATE POLICY "authenticated_read_clients" ON "clients" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_employees" ON "employees" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_services" ON "services" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_orders" ON "service_orders" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_order_items" ON "service_order_items" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_order_employees" ON "order_employees" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_attachments" ON "attachments" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_transactions" ON "transactions" FOR SELECT USING (auth.role() = 'authenticated');