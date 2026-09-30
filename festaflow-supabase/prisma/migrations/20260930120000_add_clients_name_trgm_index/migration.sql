-- Speeds up client-name search (app/api/orders' `clientSearch` filter and
-- app/api/orders/summary, both already using Prisma `contains`/raw ILIKE
-- with leading wildcards, e.g. "%joao%"). The existing idx_clients_name is a
-- plain btree, which cannot serve a leading-wildcard search - it falls back
-- to a full scan of `clients` (filtered further by branch_id) on every
-- debounced keystroke. pg_trgm + a GIN trigram index is the standard fix for
-- ILIKE/`contains` queries and is purely additive: no column is dropped,
-- renamed, or retyped, and no data is touched or migrated.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "idx_clients_name_trgm" ON "clients" USING GIN ("name" gin_trgm_ops);
