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
// branches can independently reach the same `count + 1` and collide. Because
// the pool is capped at 1 connection, transactions run serialized - so
// instead of trusting the count blindly, probe for the first free code
// starting from it. This also self-heals a previous collision: a failed
// create rolls its transaction back (count unchanged), so without this probe
// every retry would keep generating the exact same taken code forever.
export async function nextOrderCode(client: Prisma.TransactionClient | typeof prisma, branchId: string): Promise<string> {
  const year = new Date().getFullYear();
  let count = await client.serviceOrder.count({ where: { branchId } });
  for (;;) {
    const code = `OS-${year}-${String(count + 1).padStart(4, "0")}`;
    const existing = await client.serviceOrder.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
    count += 1;
  }
}
