-- Adds a per-appointment price override (see prisma/schema.prisma
-- Appointment.priceOverride for the full rationale). Purely additive and
-- backward compatible: a nullable column, no default, no existing row
-- touched - every pre-existing appointment reads NULL, meaning "inherit the
-- parent OS's total_amount", exactly today's behavior. Not destructive.
ALTER TABLE "appointments" ADD COLUMN "price_override" DECIMAL(10, 2);
