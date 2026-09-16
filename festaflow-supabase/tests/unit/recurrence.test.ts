import { describe, it, expect } from "vitest";
import { computeOccurrences } from "@/lib/recurrence";
import type { RecurringSchedule } from "@prisma/client";

// Minimal fixture: computeOccurrences only ever reads frequency, daysOfWeek,
// dayOfWeek, interval, dayOfMonth and startDate - the rest of the columns are
// irrelevant to this pure function, so they're stubbed with dummy values.
function schedule(overrides: Partial<RecurringSchedule>): RecurringSchedule {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    orderId: "00000000-0000-0000-0000-000000000002",
    branchId: "00000000-0000-0000-0000-000000000003",
    clientId: "00000000-0000-0000-0000-000000000004",
    serviceId: "00000000-0000-0000-0000-000000000005",
    frequency: "weekly",
    interval: 1,
    dayOfWeek: null,
    daysOfWeek: [],
    dayOfMonth: null,
    startTime: "09:00",
    endTime: "11:00",
    price: 0 as unknown as RecurringSchedule["price"],
    startDate: new Date(2026, 0, 5), // Monday, 2026-01-05
    endDate: null,
    generatedUntil: null,
    active: true,
    createdBy: "00000000-0000-0000-0000-000000000006",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RecurringSchedule;
}

const fmt = (dates: Date[]) => dates.map((d) => d.toISOString().slice(0, 10));

describe("computeOccurrences - weekly", () => {
  it("generates one occurrence per target weekday inside the window", () => {
    const s = schedule({ frequency: "weekly", daysOfWeek: [1, 3, 5], startDate: new Date(2026, 0, 5) }); // Mon
    const dates = computeOccurrences(s, new Date(2026, 0, 5), new Date(2026, 0, 18));
    // Weeks of Jan 5 and Jan 12: Mon/Wed/Fri each.
    expect(fmt(dates)).toEqual(["2026-01-05", "2026-01-07", "2026-01-09", "2026-01-12", "2026-01-14", "2026-01-16"]);
  });

  it("falls back to the legacy dayOfWeek column when daysOfWeek is empty", () => {
    const s = schedule({ frequency: "weekly", daysOfWeek: [], dayOfWeek: 3 }); // Wednesday
    const dates = computeOccurrences(s, new Date(2026, 0, 5), new Date(2026, 0, 11));
    expect(fmt(dates)).toEqual(["2026-01-07"]);
  });

  it("never returns an occurrence before `from`, even mid-week", () => {
    const s = schedule({ frequency: "weekly", daysOfWeek: [1, 3, 5] });
    const dates = computeOccurrences(s, new Date(2026, 0, 8), new Date(2026, 0, 11)); // Thursday..Sunday
    expect(fmt(dates)).toEqual(["2026-01-09"]); // only Friday, not the earlier Monday/Wednesday
  });

  it("is idempotent across two consecutive calls covering adjacent windows (no gaps, no duplicates)", () => {
    const s = schedule({ frequency: "weekly", daysOfWeek: [1, 3, 5] });
    const first = computeOccurrences(s, new Date(2026, 0, 5), new Date(2026, 0, 11));
    const nextFrom = new Date(first[first.length - 1]);
    nextFrom.setDate(nextFrom.getDate() + 1);
    const second = computeOccurrences(s, nextFrom, new Date(2026, 0, 18));
    const all = [...fmt(first), ...fmt(second)];
    expect(new Set(all).size).toBe(all.length); // no duplicates
    expect(all).toEqual(["2026-01-05", "2026-01-07", "2026-01-09", "2026-01-12", "2026-01-14", "2026-01-16"]);
  });
});

describe("computeOccurrences - biweekly (quinzenal)", () => {
  it("fires every 2 weeks, anchored to the week containing startDate, regardless of `interval`", () => {
    // interval is deliberately set to something else - biweekly always uses a
    // hardcoded 2-week step per lib/recurrence.ts, ignoring this column.
    const s = schedule({ frequency: "biweekly", daysOfWeek: [2], interval: 5, startDate: new Date(2026, 0, 5) }); // Tuesday cadence
    const dates = computeOccurrences(s, new Date(2026, 0, 5), new Date(2026, 1, 10));
    expect(fmt(dates)).toEqual(["2026-01-06", "2026-01-20", "2026-02-03"]);
  });

  it("supports multiple weekdays per occurrence, still on the 2-week cadence", () => {
    const s = schedule({ frequency: "biweekly", daysOfWeek: [1, 4], startDate: new Date(2026, 0, 5) });
    const dates = computeOccurrences(s, new Date(2026, 0, 5), new Date(2026, 0, 20));
    expect(fmt(dates)).toEqual(["2026-01-05", "2026-01-08", "2026-01-19"]);
  });
});

describe("computeOccurrences - monthly", () => {
  it("uses dayOfMonth, clamped to the shorter month (e.g. 31 -> 28/30)", () => {
    const s = schedule({ frequency: "monthly", dayOfMonth: 31, startDate: new Date(2026, 0, 31) });
    const dates = computeOccurrences(s, new Date(2026, 0, 31), new Date(2026, 3, 30));
    // Jan 31, Feb (28, non-leap 2026), Mar 31, Apr 30.
    expect(fmt(dates)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("respects a >1 interval (every N months), anchored to the schedule's own start month", () => {
    const s = schedule({ frequency: "monthly", interval: 2, dayOfMonth: 15, startDate: new Date(2026, 0, 15) });
    const dates = computeOccurrences(s, new Date(2026, 0, 15), new Date(2026, 5, 30));
    expect(fmt(dates)).toEqual(["2026-01-15", "2026-03-15", "2026-05-15"]);
  });

  it("falls back to startDate's own day-of-month when dayOfMonth is null", () => {
    const s = schedule({ frequency: "monthly", dayOfMonth: null, startDate: new Date(2026, 2, 10) });
    const dates = computeOccurrences(s, new Date(2026, 2, 10), new Date(2026, 4, 1));
    expect(fmt(dates)).toEqual(["2026-03-10", "2026-04-10"]);
  });
});
