import { describe, it, expect } from "vitest";
import { computeOccurrences, createRecurringScheduleForExistingOrder, type AttachRecurrenceParams } from "@/lib/recurrence";
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

describe("createRecurringScheduleForExistingOrder", () => {
  // `endDate` is always set in these fixtures (never left open-ended) so the
  // generation window is capped by it instead of by "now + horizonDays" -
  // computeOccurrences would otherwise depend on whatever date the test
  // happens to run on, which is not deterministic.
  function baseParams(overrides: Partial<AttachRecurrenceParams> = {}): AttachRecurrenceParams {
    return {
      orderId: "order-1",
      branchId: "branch-1",
      clientId: "client-1",
      serviceId: "service-1",
      frequency: "weekly",
      interval: 1,
      dayOfWeek: 1,
      daysOfWeek: [1], // Monday
      dayOfMonth: null,
      startTime: "09:00",
      endTime: "11:00",
      price: 135,
      startDate: new Date(2026, 0, 5), // Monday
      endDate: new Date(2026, 0, 19), // 3rd Monday -> occurrences: 01-05, 01-12, 01-19
      createdBy: "user-1",
      ...overrides,
    };
  }

  // Lightweight fake of the 4 Prisma calls the function actually makes -
  // mirrors tests/unit/order-code.test.ts's own fakeClient pattern, avoiding
  // a real database for logic that is purely about which methods get called
  // with which arguments (the real-DB path is covered by the e2e suite).
  //
  // `racedIds`: candidate appointment ids that a concurrent, non-transactional
  // mutation (cancel/reschedule/delete) is simulated to have changed AFTER the
  // initial findMany read but BEFORE updateMany runs - updateMany's own
  // cancelledAt/recurringScheduleId predicates (re-checked at write time, not
  // just at the earlier read) must exclude these, exactly like the real
  // Postgres WHERE clause would.
  function fakeTx(existingAppointments: Array<{ id: string; date: Date }> = [], racedIds: Set<string> = new Set()) {
    const calls = {
      findManyCalls: [] as unknown[],
      updateManyWhere: null as unknown,
      createManyData: null as Array<{ date: Date }> | null,
      updateData: null as Record<string, unknown> | null,
    };
    const linkedIds = new Set<string>();
    const tx = {
      recurringSchedule: {
        create: async ({ data }: { data: AttachRecurrenceParams }) =>
          ({ id: "schedule-1", ...data, generatedUntil: null, active: true, createdAt: new Date(), updatedAt: new Date() }) as unknown as RecurringSchedule,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          calls.updateData = data;
          return {} as RecurringSchedule;
        },
      },
      appointment: {
        findMany: async ({ where }: { where: { orderId?: string; id?: { in: string[] } } }) => {
          calls.findManyCalls.push(where);
          if (where.orderId) return existingAppointments; // initial adoption-candidate read
          // Fallback verification query (only issued when updateMany's count
          // came up short): { id: { in }, recurringScheduleId: schedule.id }.
          const ids = where.id?.in ?? [];
          return existingAppointments.filter((a) => ids.includes(a.id) && linkedIds.has(a.id)).map((a) => ({ id: a.id }));
        },
        updateMany: async ({ where }: { where: { id: { in: string[] }; cancelledAt: null; recurringScheduleId: null } }) => {
          calls.updateManyWhere = where;
          const matched = where.id.in.filter((id) => !racedIds.has(id));
          matched.forEach((id) => linkedIds.add(id));
          return { count: matched.length };
        },
        createMany: async ({ data }: { data: Array<{ date: Date }> }) => {
          calls.createManyData = data;
          return { count: data.length };
        },
      },
    };
    return { tx: tx as unknown as Parameters<typeof createRecurringScheduleForExistingOrder>[0], calls };
  }

  it("generates every occurrence as a new appointment when none pre-exist", async () => {
    const { tx, calls } = fakeTx([]);
    const result = await createRecurringScheduleForExistingOrder(tx, baseParams());
    expect(result.created).toBe(3);
    expect(result.adopted).toBe(0);
    expect(calls.createManyData?.map((d) => d.date.toISOString().slice(0, 10))).toEqual(["2026-01-05", "2026-01-12", "2026-01-19"]);
    expect(calls.updateManyWhere).toBeNull(); // nothing to adopt -> updateMany never called
    expect(calls.findManyCalls).toEqual([{ orderId: "order-1", cancelledAt: null, recurringScheduleId: null }]);
  });

  it("adopts the OS's own pre-existing appointment instead of creating a duplicate for the same date", async () => {
    const { tx, calls } = fakeTx([{ id: "appt-original", date: new Date(2026, 0, 5) }]);
    const result = await createRecurringScheduleForExistingOrder(tx, baseParams());
    expect(result.adopted).toBe(1);
    expect(result.created).toBe(2); // only 01-12 and 01-19 are new
    expect(calls.updateManyWhere).toEqual({ id: { in: ["appt-original"] }, cancelledAt: null, recurringScheduleId: null });
    expect(calls.createManyData?.map((d) => d.date.toISOString().slice(0, 10))).toEqual(["2026-01-12", "2026-01-19"]);
    expect(calls.findManyCalls).toHaveLength(1); // no fallback verification query needed - the update matched everything
  });

  it("adopts every occurrence and never calls createMany when all dates already have an appointment", async () => {
    const { tx, calls } = fakeTx([
      { id: "a1", date: new Date(2026, 0, 5) },
      { id: "a2", date: new Date(2026, 0, 12) },
      { id: "a3", date: new Date(2026, 0, 19) },
    ]);
    const result = await createRecurringScheduleForExistingOrder(tx, baseParams());
    expect(result.adopted).toBe(3);
    expect(result.created).toBe(0);
    expect(calls.updateManyWhere).toEqual({ id: { in: ["a1", "a2", "a3"] }, cancelledAt: null, recurringScheduleId: null });
    expect(calls.createManyData).toBeNull(); // createMany is skipped entirely, not called with an empty array
  });

  it("falls back to a fresh appointment (never silently drops the date) when a concurrent cancel/reschedule races the adoption", async () => {
    // Simulates: findMany reads "appt-original" as a live adoption candidate,
    // then (before updateMany runs) a concurrent, non-transactional request -
    // e.g. POST /api/appointments/[id]/cancel - cancels it. updateMany's own
    // cancelledAt:null predicate must exclude it, and the date must still get
    // a brand-new appointment instead of vanishing from the recurrence.
    const { tx, calls } = fakeTx([{ id: "appt-original", date: new Date(2026, 0, 5) }], new Set(["appt-original"]));
    const result = await createRecurringScheduleForExistingOrder(tx, baseParams());
    expect(result.adopted).toBe(0); // the race meant nothing was actually (successfully) adopted
    expect(result.created).toBe(3); // 01-05 falls back to a fresh row alongside 01-12 and 01-19
    // The fallback date is appended after the loop, so insertion order isn't
    // guaranteed (and doesn't need to be - createMany has no ordering
    // requirement, appointments are always read back sorted by date).
    expect(calls.createManyData?.map((d) => d.date.toISOString().slice(0, 10)).sort()).toEqual(["2026-01-05", "2026-01-12", "2026-01-19"]);
    // The fallback verification query ran because updateMany's count (0) fell short of the 1 candidate.
    expect(calls.findManyCalls).toHaveLength(2);
    expect(calls.findManyCalls[1]).toEqual({ id: { in: ["appt-original"] }, recurringScheduleId: "schedule-1" });
  });

  it("caps the generation window at the schedule's own endDate and records it as generatedUntil", async () => {
    const { tx, calls } = fakeTx([]);
    await createRecurringScheduleForExistingOrder(tx, baseParams());
    expect((calls.updateData?.generatedUntil as Date).toISOString().slice(0, 10)).toBe("2026-01-19");
  });
});
