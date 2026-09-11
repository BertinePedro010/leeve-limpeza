// Single source of truth for OS/appointment status - shared by API routes,
// validators, and every place status is displayed (UI badges, PDF, e-mail,
// WhatsApp) so the labels/values never drift or get redefined per file.
//
// Only two OPERATIONAL statuses exist (see prisma/schema.prisma OsStatus):
// "agendado" (scheduled, not yet done) and "realizado" (completed). There is
// no "cancelado" status value - cancellation is tracked separately via
// cancelledAt/cancelledBy/cancellationReason on ServiceOrder and Appointment
// (exactly how Appointment already modeled it before this file existed).
// displayOrderStatus() below is the one place that turns "status + cancelledAt"
// into what the user actually sees, including the derived "Cancelado" label -
// never write "cancelado" back into the status column, it is not a valid value.

export const ORDER_STATUS_VALUES = ["agendado", "realizado"] as const;
export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

export const orderStatusLabels: Record<OrderStatus, string> = {
  agendado: "Agendado",
  realizado: "Realizado",
};

// Union of the 2 real statuses plus the derived "cancelado" display label -
// never a value stored in the DB, only ever returned by displayOrderStatus().
export type DisplayOrderStatus = OrderStatus | "cancelado";

export const displayStatusLabels: Record<DisplayOrderStatus, string> = {
  ...orderStatusLabels,
  cancelado: "Cancelado",
};

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUS_VALUES as readonly string[]).includes(value);
}

export function displayOrderStatus(entity: { status: string; cancelledAt?: Date | string | null }): DisplayOrderStatus {
  if (entity.cancelledAt) return "cancelado";
  return isOrderStatus(entity.status) ? entity.status : "agendado";
}

export function orderStatusLabel(entity: { status: string; cancelledAt?: Date | string | null }): string {
  return displayStatusLabels[displayOrderStatus(entity)];
}
