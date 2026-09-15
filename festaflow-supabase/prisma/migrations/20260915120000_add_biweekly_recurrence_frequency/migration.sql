-- Purely additive: one new value on the existing "RecurrenceFrequency" enum.
-- Nothing is dropped or renamed. Existing recurring_schedules rows ("weekly"
-- and "monthly") keep working exactly as before - "biweekly" only becomes
-- selectable once the frequency dropdown (components/SaasApp.tsx) and the
-- API validator (lib/validators.ts recurringScheduleSchema) accept it.
-- computeOccurrences (lib/recurrence.ts) reuses the weekly branch with a
-- fixed 2-week step, so no separate generation logic exists for it.
ALTER TYPE "RecurrenceFrequency" ADD VALUE 'biweekly';
