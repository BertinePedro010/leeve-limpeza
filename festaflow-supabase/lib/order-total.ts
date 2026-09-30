// Single source of truth for "the real total value of an OS". Each of an
// OS's own non-cancelled appointments/occurrences inherits the OS's own
// ServiceOrderItem-derived totalAmount, UNLESS that specific occurrence has
// its own Appointment.priceOverride set (see prisma/schema.prisma) - the one
// deliberate, narrow exception, added so editing a single recurrence
// occurrence's value never has to touch (and never does touch)
// ServiceOrderItem, ServiceOrder.totalAmount, RecurringSchedule.price, or any
// sibling Appointment. This is the exact convention already established by
// app/api/dashboard's loadOccurrences and lib/pdf.ts / components/SaasApp.tsx
// PrintOrder's own recurrence total - generalized and centralized here so
// every screen that shows an OS's value (listing, client search, reports)
// reuses the same rule instead of re-deriving it, and so a fix here never has
// to be duplicated by hand in five places again.
//
// Deliberately NOT `RecurringSchedule.price` ("valor mensal"): that field is
// a separate, independent concept (see app/api/recurring-schedules) and is
// never read here.
import type { Prisma } from "@prisma/client";

export function orderRealTotal(
  totalAmount: Prisma.Decimal | number | string,
  nonCancelledAppointments: Array<{ priceOverride?: Prisma.Decimal | number | string | null }>
): number {
  const fallback = Number(totalAmount);
  return nonCancelledAppointments.reduce(
    (sum, a) => sum + (a.priceOverride != null ? Number(a.priceOverride) : fallback),
    0
  );
}
