// Pure label formatting for a RecurringSchedule - shared between the server
// (lib/pdf.ts) and the client (components/SaasApp.tsx PrintOrder), exactly
// like lib/order-address.ts, so the PDF and the on-screen/print view always
// describe the same recurrence the same way. No server-only imports, safe
// in both bundles. Dates arrive as real Dates from Prisma (PDF route) or as
// ISO strings from the serialized API response (frontend) - every function
// here accepts both.

export type RecurrenceLabelInput = {
  frequency: string;
  interval: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  startDate: Date | string;
  endDate?: Date | string | null;
};

export const WEEKDAY_LABELS = ["Domingo", "Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sabado"];

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function dateLabel(d: Date | string): string {
  return toDate(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function recurrenceTypeLabel(schedule: Pick<RecurrenceLabelInput, "frequency">): string {
  return schedule.frequency === "weekly" ? "Semanal" : "Mensal";
}

/** e.g. "A cada semana" / "A cada 2 semanas" / "A cada mes" / "A cada 3 meses". */
export function recurrenceFrequencyLabel(schedule: Pick<RecurrenceLabelInput, "frequency" | "interval">): string {
  const unit = schedule.frequency === "weekly" ? "semana" : "mes";
  const unitPlural = schedule.frequency === "weekly" ? "semanas" : "meses";
  return schedule.interval > 1 ? `A cada ${schedule.interval} ${unitPlural}` : `A cada ${unit}`;
}

/** e.g. "Terca-feira" for weekly, "Dia 10" for monthly. */
export function recurrenceDayLabel(schedule: Pick<RecurrenceLabelInput, "frequency" | "dayOfWeek" | "dayOfMonth">): string {
  if (schedule.frequency === "weekly") {
    return typeof schedule.dayOfWeek === "number" ? WEEKDAY_LABELS[schedule.dayOfWeek] : "-";
  }
  return typeof schedule.dayOfMonth === "number" ? `Dia ${schedule.dayOfMonth}` : "-";
}

/** e.g. "15/09/2026 ate 08/12/2026" or "A partir de 15/09/2026 (sem data final)". */
export function recurrencePeriodLabel(schedule: Pick<RecurrenceLabelInput, "startDate" | "endDate">): string {
  const start = dateLabel(schedule.startDate);
  if (!schedule.endDate) return `A partir de ${start} (sem data final)`;
  return `${start} ate ${dateLabel(schedule.endDate)}`;
}
