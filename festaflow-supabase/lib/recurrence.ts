import { prisma } from "@/lib/prisma";
import type { RecurringSchedule } from "@prisma/client";

const DEFAULT_HORIZON_DAYS = 90;

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Weekdays (0=Sunday..6=Saturday) a weekly schedule fires on, sorted and
 * deduped. Falls back to the legacy single `dayOfWeek` column (then to
 * `startDate`'s weekday) for schedules created before `daysOfWeek` existed,
 * so old recurrences keep generating exactly the same day.
 */
function weeklyTargetDays(schedule: RecurringSchedule): number[] {
  const days = schedule.daysOfWeek?.length ? schedule.daysOfWeek : [schedule.dayOfWeek ?? schedule.startDate.getDay()];
  return [...new Set(days)].sort((a, b) => a - b);
}

/** Computes occurrence dates for a schedule between [from, until], inclusive. */
export function computeOccurrences(schedule: RecurringSchedule, from: Date, until: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(Math.max(schedule.startDate.getTime(), from.getTime()));
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(until);
  end.setHours(0, 0, 0, 0);

  if (schedule.frequency === "weekly" || schedule.frequency === "biweekly") {
    const targetDays = weeklyTargetDays(schedule);
    // Quinzenal is a fixed 14-day cycle, not a user-configurable interval -
    // it reuses the weekly week-stepping logic below with the week-count
    // hardcoded to 2, regardless of whatever `interval` happens to be
    // stored on the row (recurringScheduleSchema / RecurrenceModal never
    // expose an interval field for biweekly, so it is always 1 there).
    const weekStep = schedule.frequency === "biweekly" ? 2 : schedule.interval;

    // Anchor the interval cadence to the Sunday of the week containing
    // startDate, so "every N weeks" stays correctly phased across repeated
    // generateAppointments calls (each call only knows `cursor`, not the
    // schedule's original phase) - this also naturally generalizes the
    // former single-day logic to multiple days per week.
    const anchorWeekStart = new Date(schedule.startDate);
    anchorWeekStart.setHours(0, 0, 0, 0);
    anchorWeekStart.setDate(anchorWeekStart.getDate() - anchorWeekStart.getDay());

    const weekStart = new Date(cursor);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksFromAnchor = Math.round((weekStart.getTime() - anchorWeekStart.getTime()) / msPerWeek);
    const rem = ((weeksFromAnchor % weekStep) + weekStep) % weekStep;
    if (rem !== 0) weekStart.setDate(weekStart.getDate() + (weekStep - rem) * 7);

    for (let w = new Date(weekStart); w <= end; w.setDate(w.getDate() + 7 * weekStep)) {
      for (const dow of targetDays) {
        const occurrence = new Date(w);
        occurrence.setDate(occurrence.getDate() + dow);
        if (occurrence >= cursor && occurrence <= end) dates.push(occurrence);
      }
    }
    dates.sort((a, b) => a.getTime() - b.getTime());
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
