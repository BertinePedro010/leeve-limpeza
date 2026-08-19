-- Row Level Security, corrected for branch isolation.
--
-- IMPORTANT — read before assuming this protects application traffic:
-- The Prisma connection (DATABASE_URL/DIRECT_URL) uses the Supabase "postgres"
-- role, which has BYPASSRLS. Confirmed via `SELECT rolbypassrls FROM pg_roles
-- WHERE rolname = current_user` against this database: bypass_rls = true.
-- That means every policy below is skipped entirely for Prisma's own traffic
-- today. The real authorization for the Next.js app remains lib/authz.ts
-- (requireAuth + branch checks on every route), unchanged by this migration.
--
-- These policies exist as defense-in-depth for any access path that DOES
-- carry the user's Supabase session (PostgREST / supabase-js / Storage
-- policies / a future non-Prisma client) and therefore has a real auth.uid().
-- Making Prisma's own connection subject to RLS requires a structural change
-- (a non-bypass role + per-request session propagation of auth.uid()) that
-- was intentionally NOT made here — it needs separate, explicit authorization
-- before touching how Prisma connects to the database.

-- ---------------------------------------------------------------------------
-- branches, user_branches: RLS was never enabled for these two tables when
-- they were introduced (multi-branch migration). Closing that gap here.
-- ---------------------------------------------------------------------------

ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_branches" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_select_branches" ON "branches" FOR SELECT
  USING (id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));

CREATE POLICY "self_select_user_branches" ON "user_branches" FOR SELECT
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy on branches or user_branches: provisioning
-- a branch or granting/removing branch access is an administrative action
-- performed via Prisma today, not something an end-user session should be
-- able to do directly. With RLS enabled and no such policy, it is denied by
-- default for any role that is actually subject to RLS.

-- ---------------------------------------------------------------------------
-- Direct branch_id tables: replace the old "any authenticated user reads
-- everything" SELECT-only policies with real branch-scoped SELECT/INSERT/
-- UPDATE/DELETE policies.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_read_clients" ON "clients";
DROP POLICY IF EXISTS "authenticated_read_employees" ON "employees";
DROP POLICY IF EXISTS "authenticated_read_services" ON "services";
DROP POLICY IF EXISTS "authenticated_read_orders" ON "service_orders";
DROP POLICY IF EXISTS "authenticated_read_transactions" ON "transactions";

CREATE POLICY "branch_select_clients" ON "clients" FOR SELECT
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_insert_clients" ON "clients" FOR INSERT
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_update_clients" ON "clients" FOR UPDATE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()))
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_delete_clients" ON "clients" FOR DELETE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));

CREATE POLICY "branch_select_employees" ON "employees" FOR SELECT
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_insert_employees" ON "employees" FOR INSERT
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_update_employees" ON "employees" FOR UPDATE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()))
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_delete_employees" ON "employees" FOR DELETE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));

CREATE POLICY "branch_select_services" ON "services" FOR SELECT
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_insert_services" ON "services" FOR INSERT
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_update_services" ON "services" FOR UPDATE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()))
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_delete_services" ON "services" FOR DELETE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));

CREATE POLICY "branch_select_service_orders" ON "service_orders" FOR SELECT
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_insert_service_orders" ON "service_orders" FOR INSERT
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_update_service_orders" ON "service_orders" FOR UPDATE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()))
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_delete_service_orders" ON "service_orders" FOR DELETE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));

CREATE POLICY "branch_select_transactions" ON "transactions" FOR SELECT
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_insert_transactions" ON "transactions" FOR INSERT
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_update_transactions" ON "transactions" FOR UPDATE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()))
  WITH CHECK (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));
CREATE POLICY "branch_delete_transactions" ON "transactions" FOR DELETE
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Tables without their own branch_id: isolation is derived through
-- service_orders.branch_id (order_id foreign key).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_read_order_items" ON "service_order_items";
DROP POLICY IF EXISTS "authenticated_read_order_employees" ON "order_employees";
DROP POLICY IF EXISTS "authenticated_read_attachments" ON "attachments";

CREATE POLICY "branch_select_service_order_items" ON "service_order_items" FOR SELECT
  USING (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));
CREATE POLICY "branch_insert_service_order_items" ON "service_order_items" FOR INSERT
  WITH CHECK (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));
CREATE POLICY "branch_update_service_order_items" ON "service_order_items" FOR UPDATE
  USING (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())))
  WITH CHECK (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));
CREATE POLICY "branch_delete_service_order_items" ON "service_order_items" FOR DELETE
  USING (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));

CREATE POLICY "branch_select_order_employees" ON "order_employees" FOR SELECT
  USING (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));
CREATE POLICY "branch_insert_order_employees" ON "order_employees" FOR INSERT
  WITH CHECK (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));
CREATE POLICY "branch_update_order_employees" ON "order_employees" FOR UPDATE
  USING (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())))
  WITH CHECK (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));
CREATE POLICY "branch_delete_order_employees" ON "order_employees" FOR DELETE
  USING (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));

CREATE POLICY "branch_select_attachments" ON "attachments" FOR SELECT
  USING (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));
CREATE POLICY "branch_insert_attachments" ON "attachments" FOR INSERT
  WITH CHECK (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));
CREATE POLICY "branch_update_attachments" ON "attachments" FOR UPDATE
  USING (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())))
  WITH CHECK (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));
CREATE POLICY "branch_delete_attachments" ON "attachments" FOR DELETE
  USING (order_id IN (SELECT id FROM service_orders WHERE branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())));

-- profiles: untouched. "profiles_self_read" (auth.uid() = id) from the init
-- migration already correctly scopes each user to their own profile row and
-- is not affected by branch isolation.
