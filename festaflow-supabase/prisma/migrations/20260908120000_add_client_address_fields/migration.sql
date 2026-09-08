-- Purely additive: 7 new nullable columns on "clients", mirroring the
-- structured address fields already added to "service_orders" in
-- 20260826180000_add_service_order_address_fields. No column is dropped,
-- renamed or made NOT NULL. The legacy free-text "address" column is left
-- untouched and stays populated (new/edited clients now also write a
-- single-line mirror into it - see lib/client-address.ts) so anything still
-- reading client.address directly (e.g. the OS PDF) keeps working with no
-- change. Existing client rows keep their current "address" text exactly as
-- it is; nothing is parsed or guessed into the new columns. No index is
-- added: these columns are only ever read back as part of a single client
-- row already fetched by primary key / branch filter, never filtered on.
ALTER TABLE "clients"
  ADD COLUMN "address_zip" VARCHAR(9),
  ADD COLUMN "address_street" VARCHAR(200),
  ADD COLUMN "address_number" VARCHAR(20),
  ADD COLUMN "address_neighborhood" VARCHAR(120),
  ADD COLUMN "address_city" VARCHAR(120),
  ADD COLUMN "address_state" VARCHAR(2),
  ADD COLUMN "address_reference" VARCHAR(200);
