import { describe, it, expect } from "vitest";
import { orderRealTotal } from "@/lib/order-total";
import { Prisma } from "@prisma/client";

function appts(count: number): Array<{ priceOverride: null }> {
  return Array.from({ length: count }, () => ({ priceOverride: null }));
}

describe("orderRealTotal", () => {
  it("sums the order's totalAmount once per non-cancelled occurrence when none has an override", () => {
    expect(orderRealTotal(189.9, appts(3))).toBeCloseTo(569.7, 2);
  });

  it("returns 0 when there are no non-cancelled occurrences", () => {
    expect(orderRealTotal(500, [])).toBe(0);
  });

  it("accepts a Prisma.Decimal instance (as returned by the ORM), not just number", () => {
    const decimal = new Prisma.Decimal("739.89");
    expect(orderRealTotal(decimal, appts(1))).toBeCloseTo(739.89, 2);
  });

  it("handles a zero-value order (courtesy service) without throwing", () => {
    expect(orderRealTotal(0, appts(5))).toBe(0);
  });

  it("handles fractional cents correctly (no floating point drift for typical values)", () => {
    expect(orderRealTotal(0.1, appts(3))).toBeCloseTo(0.3, 10);
  });

  // The requirement this override exists for: editing ONE occurrence's value
  // (e.g. 07/10 -> R$650) must never change the others (05/10, 09/10, 12/10
  // stay R$500) - exercised here as "one appointment out of several carries
  // its own priceOverride, the rest fall back to the OS's totalAmount".
  it("uses an occurrence's own priceOverride instead of the OS's totalAmount when set", () => {
    const occurrences = [
      { priceOverride: null }, // 05/10 -> inherits 500
      { priceOverride: 650 }, // 07/10 -> overridden
      { priceOverride: null }, // 09/10 -> inherits 500
      { priceOverride: null }, // 12/10 -> inherits 500
    ];
    expect(orderRealTotal(500, occurrences)).toBeCloseTo(2150, 2);
  });

  it("accepts a Prisma.Decimal priceOverride, not just number", () => {
    const occurrences = [{ priceOverride: new Prisma.Decimal("650.00") }, { priceOverride: null }];
    expect(orderRealTotal(500, occurrences)).toBeCloseTo(1150, 2);
  });
});
