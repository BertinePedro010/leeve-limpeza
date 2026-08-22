-- Performance audit: add missing indexes for query patterns confirmed in
-- app/api/appointments, app/api/reports/*, app/api/reports/os and
-- app/api/orders. Purely additive (CREATE INDEX), no data or column changes.
-- Safe to roll back with the matching DROP INDEX statements below.

-- appointments.employee_id: FK filtered by app/api/appointments (GET list),
-- app/api/reports/appointments and app/api/reports/employees[/id], with no
-- existing index (only the (branch_id, date) composite and order_id/status
-- singles existed).
CREATE INDEX IF NOT EXISTS "idx_appointments_employee_id" ON "appointments"("employee_id");

-- appointments.cancelled_at: range-filtered by app/api/reports/cancellations
-- alongside status = 'cancelado' (already indexed separately).
CREATE INDEX IF NOT EXISTS "idx_appointments_cancelled_at" ON "appointments"("cancelled_at");

-- transactions.paid_at: range-filtered by app/api/reports/os and the
-- dashboard's revenue/expense aggregates (type + status + paid_at); no
-- existing index covered paid_at (only due_date was indexed).
CREATE INDEX IF NOT EXISTS "idx_transactions_paid_at" ON "transactions"("paid_at");

-- service_orders(branch_id, created_at): app/api/reports/os filters
-- branchId + createdAt range together - the existing single-column
-- branch_id index can't serve that as one index range scan.
CREATE INDEX IF NOT EXISTS "idx_service_orders_branch_created_at" ON "service_orders"("branch_id", "created_at");

-- service_orders(branch_id, event_date): app/api/orders filters by branchId
-- and orders by eventDate - same rationale as above.
CREATE INDEX IF NOT EXISTS "idx_service_orders_branch_event_date" ON "service_orders"("branch_id", "event_date");

-- Rollback (not executed):
-- DROP INDEX IF EXISTS "idx_appointments_employee_id";
-- DROP INDEX IF EXISTS "idx_appointments_cancelled_at";
-- DROP INDEX IF EXISTS "idx_transactions_paid_at";
-- DROP INDEX IF EXISTS "idx_service_orders_branch_created_at";
-- DROP INDEX IF EXISTS "idx_service_orders_branch_event_date";
