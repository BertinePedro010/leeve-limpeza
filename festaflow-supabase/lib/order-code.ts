import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";

// Must be called with the *transaction* client when running inside
// prisma.$transaction - the connection pool here is capped at 1 connection,
// so calling the outer `prisma` singleton from inside an open transaction
// deadlocks (the transaction holds the only connection while waiting on a
// query that itself needs a connection).
//
// `code` is globally unique (see ServiceOrder.code in prisma/schema.prisma)
// but the count used to build it is scoped to a single branch, so two
// branches can independently reach the same `count + 1` and collide - probe
// for the first free code starting from it. This also self-heals a previous
// collision: a failed create rolls its transaction back (count unchanged),
// so without this probe every retry would keep generating the exact same
// taken code forever.
//
// The probe itself is a SINGLE query, not one round-trip per candidate code.
// A branch with few/no orders sitting alongside heavily-used branches (same
// global code space, e.g. a brand-new branch after others already reached
// ~100 codes) used to re-check every already-taken code one Prisma
// round-trip at a time - observed taking 12+ seconds for a 0-order branch,
// which blew past the surrounding prisma.$transaction's 15s timeout and
// surfaced as a generic 500 on order/recurrence creation for that branch
// specifically. Fetching every taken code for the year up front and probing
// in memory keeps the exact same starting point and collision order, just
// without the network cost scaling with how far ahead OTHER branches are.
// Bounds the in-memory probe: a real collision run is expected to resolve in
// a handful of iterations. A run that still hasn't found a free code after
// this many tries means something is actually wrong (e.g. `code` generation
// logic broken) - fail loudly with a clear message.
const MAX_CODE_PROBES = 2000;

export async function nextOrderCode(client: Prisma.TransactionClient | typeof prisma, branchId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `OS-${year}-`;
  const [count, takenThisYear] = await Promise.all([
    client.serviceOrder.count({ where: { branchId } }),
    client.serviceOrder.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } }),
  ]);
  const taken = new Set(takenThisYear.map((o) => o.code));
  for (let probes = 0; probes < MAX_CODE_PROBES; probes += 1) {
    const code = `${prefix}${String(count + 1 + probes).padStart(4, "0")}`;
    if (!taken.has(code)) return code;
  }
  throw new Error(`nextOrderCode: nao foi possivel gerar um codigo livre para a filial ${branchId} apos ${MAX_CODE_PROBES} tentativas.`);
}
