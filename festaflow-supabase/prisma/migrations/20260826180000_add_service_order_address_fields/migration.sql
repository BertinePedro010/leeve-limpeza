-- Purely additive: 7 new nullable columns on an existing table, no column
-- dropped/renamed/made NOT NULL. `location` is untouched and stays the
-- source of truth for every order created before this migration - existing
-- addresses are preserved exactly as they are, nothing is parsed or guessed
-- into the new columns.
ALTER TABLE "service_orders"
  ADD COLUMN "address_zip" VARCHAR(9),
  ADD COLUMN "address_street" VARCHAR(200),
  ADD COLUMN "address_number" VARCHAR(20),
  ADD COLUMN "address_neighborhood" VARCHAR(120),
  ADD COLUMN "address_city" VARCHAR(120),
  ADD COLUMN "address_state" VARCHAR(2),
  ADD COLUMN "address_reference" VARCHAR(200);
