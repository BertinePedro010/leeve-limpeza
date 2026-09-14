-- Adds multi-day support to weekly recurrences. Purely additive: the
-- existing "day_of_week" column is untouched (still populated, still read as
-- a fallback by lib/recurrence.ts / lib/recurrence-label.ts for rows that
-- predate this column), so no existing recurrence stops working.
ALTER TABLE "recurring_schedules" ADD COLUMN "days_of_week" INTEGER[] NOT NULL DEFAULT '{}';

-- Backfill: every existing weekly schedule keeps generating exactly the same
-- single day it already had.
UPDATE "recurring_schedules"
SET "days_of_week" = ARRAY["day_of_week"]
WHERE "frequency" = 'weekly' AND "day_of_week" IS NOT NULL;
