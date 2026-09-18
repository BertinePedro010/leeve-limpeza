import { describe, it, expect } from "vitest";
import { orderRealTotal } from "@/lib/order-total";
import { Prisma } from "@prisma/client";

describe("orderRealTotal", () => {
  it("multiplies the order's totalAmount by the non-cancelled occurrence count", () => {
    expect(orderRealTotal(189.9, 3)).toBeCloseTo(569.7, 2);
  });

  it("returns 0 when there are no non-cancelled occurrences", () => {
    expect(orderRealTotal(500, 0)).toBe(0);
  });

  it("accepts a Prisma.Decimal instance (as returned by the ORM), not just number", () => {
    const decimal = new Prisma.Decimal("739.89");
    expect(orderRealTotal(decimal, 1)).toBeCloseTo(739.89, 2);
  });

  it("handles a zero-value order (courtesy service) without throwing", () => {
    expect(orderRealTotal(0, 5)).toBe(0);
  });

  it("handles fractional cents correctly (no floating point drift for typical values)", () => {
    expect(orderRealTotal(0.1, 3)).toBeCloseTo(0.3, 10);
  });
});
