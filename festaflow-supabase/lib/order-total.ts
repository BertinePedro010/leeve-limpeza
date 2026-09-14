// Single source of truth for "the real total value of an OS". An
// appointment carries no price of its own (see prisma/schema.prisma
// Appointment) - each of an OS's own non-cancelled appointments/occurrences
// inherits the OS's own ServiceOrderItem-derived totalAmount once. This is
// the exact convention already established by app/api/dashboard's
// loadOccurrences and lib/pdf.ts / components/SaasApp.tsx PrintOrder's own
// recurrence total - generalized and centralized here so every screen that
// shows an OS's value (listing, client search, reports) reuses the same
// rule instead of re-deriving it, and so a fix here never has to be
// duplicated by hand in five places again.
//
// Deliberately NOT `RecurringSchedule.price` ("valor mensal"): that field is
// a separate, independent concept (see app/api/recurring-schedules) and is
// never read here - this function only ever multiplies the OS's own
// totalAmount by its own appointment count, exactly like the pre-existing
// dashboard/PDF rule it generalizes.
import type { Prisma } from "@prisma/client";

export function orderRealTotal(totalAmount: Prisma.Decimal | number | string, nonCancelledAppointmentCount: number): number {
  return Number(totalAmount) * nonCancelledAppointmentCount;
}
