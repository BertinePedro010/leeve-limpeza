import { prisma } from "@/lib/prisma";
import type { RecurringSchedule } from "@prisma/client";

const DEFAULT_HORIZON_DAYS = 90;

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Computes occurrence dates for a schedule between [from, until], inclusive. */
export function computeOccurrences(schedule: RecurringSchedule, from: Date, until: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(Math.max(schedule.startDate.getTime(), from.getTime()));
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(until);
  end.setHours(0, 0, 0, 0);

  if (schedule.frequency === "weekly") {
    const targetDow = schedule.dayOfWeek ?? schedule.startDate.getDay();
    let d = new Date(cursor);
    while (d.getDay() !== targetDow) d.setDate(d.getDate() + 1);
    while (d <= end) {
      dates.push(new Date(d));
      d.setDate(d.getDate() + 7 * schedule.interval);
    }
    return dates;
  }

  // monthly
  const targetDom = schedule.dayOfMonth ?? schedule.startDate.getDate();
  let year = cursor.getFullYear();
  let month = cursor.getMonth();
  // step back to the schedule's own start month so the interval cadence is anchored correctly
  const startYear = schedule.startDate.getFullYear();
  const startMonth = schedule.startDate.getMonth();
  let monthsFromStart = (year - startYear) * 12 + (month - startMonth);
  monthsFromStart = Math.ceil(monthsFromStart / schedule.interval) * schedule.interval;
  year = startYear + Math.floor((startMonth + monthsFromStart) / 12);
  month = (startMonth + monthsFromStart) % 12;

  for (let guard = 0; guard < 600; guard += 1) {
    const day = Math.min(targetDom, daysInMonth(year, month));
    const occurrence = new Date(year, month, day);
    if (occurrence > end) break;
    if (occurrence >= cursor) dates.push(occurrence);
    month += schedule.interval;
    year += Math.floor(month / 12);
    month = month % 12;
  }
  return dates;
}

/**
 * Idempotent generation: relies on the DB unique constraint
 * (recurring_schedule_id, date) via skipDuplicates, so calling this twice
 * for the same window never creates duplicate appointments.
 */
export async function generateAppointments(scheduleId: string, horizonDays = DEFAULT_HORIZON_DAYS) {
  const schedule = await prisma.recurringSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
  if (!schedule.active) return { created: 0, generatedUntil: schedule.generatedUntil };

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + horizonDays);
  const until = schedule.endDate && schedule.endDate < horizon ? schedule.endDate : horizon;
  const from = schedule.generatedUntil ?? schedule.startDate;

  const occurrences = computeOccurrences(schedule, from, until);
  if (occurrences.length === 0) return { created: 0, generatedUntil: schedule.generatedUntil };

  const result = await prisma.appointment.createMany({
    data: occurrences.map((date) => ({
      orderId: schedule.orderId,
      branchId: schedule.branchId,
      date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      recurringScheduleId: schedule.id,
    })),
    skipDuplicates: true,
  });

  await prisma.recurringSchedule.update({ where: { id: scheduleId }, data: { generatedUntil: until } });
  return { created: result.count, generatedUntil: until };
}
