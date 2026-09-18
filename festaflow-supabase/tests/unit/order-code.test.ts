import { describe, it, expect } from "vitest";
import { nextOrderCode } from "@/lib/order-code";

// Lightweight fake of the two Prisma calls nextOrderCode actually makes -
// avoids touching a real database for a purely algorithmic unit (the
// integration test suite covers the real-DB collision path separately).
function fakeClient(branchOrderCount: number, takenCodesThisYear: string[]) {
  return {
    serviceOrder: {
      count: async () => branchOrderCount,
      findMany: async () => takenCodesThisYear.map((code) => ({ code })),
    },
  } as any;
}

const year = new Date().getFullYear();

describe("nextOrderCode", () => {
  it("returns OS-<year>-0001 for a brand-new branch with no codes taken anywhere", async () => {
    const code = await nextOrderCode(fakeClient(0, []), "branch-a");
    expect(code).toBe(`OS-${year}-0001`);
  });

  it("starts from the branch's own order count + 1, regardless of other branches", async () => {
    const code = await nextOrderCode(fakeClient(5, []), "branch-a");
    expect(code).toBe(`OS-${year}-0006`);
  });

  it("probes forward past codes already taken by ANY branch (global uniqueness)", async () => {
    // This branch has 0 orders (count=0 -> would naively try 0001), but 0001
    // and 0002 were already taken by other branches - see memory
    // ordercode-global-uniqueness-bug.md for why this matters.
    const code = await nextOrderCode(fakeClient(0, [`OS-${year}-0001`, `OS-${year}-0002`]), "branch-low-volume");
    expect(code).toBe(`OS-${year}-0003`);
  });

  it("throws a clear error instead of hanging when no free code exists within the probe bound", async () => {
    const taken = Array.from({ length: 2000 }, (_, i) => `OS-${year}-${String(i + 1).padStart(4, "0")}`);
    await expect(nextOrderCode(fakeClient(0, taken), "branch-a")).rejects.toThrow(/nao foi possivel gerar um codigo livre/i);
  });
});
