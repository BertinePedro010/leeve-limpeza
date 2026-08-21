import type { Prisma, Transaction } from "@prisma/client";

// Single source of truth for turning a finalized OS into revenue. Called from
// every path that can change service_orders.status (order PUT, appointment
// complete) inside the SAME transaction as that status change, so Dashboard,
// Financeiro, Relatorios and the PDF all read the exact same data - never
// computed independently in more than one place.
//
// Idempotent by construction: at most one transaction with isAutoRevenue=true
// can exist per orderId (enforced by a partial unique index in the DB, see
// migration 20260820190000), and this function always looks up that row
// before deciding whether to create or update it. Reloading, re-viewing, or
// re-finalizing the same OS never produces a duplicate.
//
// Must always be called with the transaction client (`tx`), never the outer
// `prisma` singleton - see the connection_limit=1 warning in app/api/orders/route.ts.
export async function syncOrderBilling(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const order = await tx.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
  const existing = await tx.transaction.findFirst({ where: { orderId, isAutoRevenue: true } });

  if (order.status === "finalizado") {
    const data = {
      type: "receita" as const,
      category: "Servicos",
      description: `OS ${order.code}`,
      amount: order.totalAmount,
      dueDate: order.updatedAt,
      paidAt: new Date(),
      status: "pago" as const,
      branchId: order.branchId,
      orderId: order.id,
      paymentMethod: order.paymentMethod,
      isAutoRevenue: true,
      deletedAt: null,
    };
    if (existing) {
      await tx.transaction.update({ where: { id: existing.id }, data });
    } else {
      await tx.transaction.create({ data });
    }
    return;
  }

  // OS is no longer finalizada (e.g. it was reopened or cancelled after being
  // finalized) - the revenue it generated is reverted via soft-delete, never
  // left as an orphaned realized-revenue row.
  if (existing && !existing.deletedAt) {
    await tx.transaction.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }
}

/** Same summation rule used by /api/dashboard and /api/reports/os - kept in one place so both can never drift. */
export function sumRevenue(transactions: Array<Pick<Transaction, "type" | "status" | "amount" | "deletedAt">>): number {
  return transactions
    .filter((t) => t.type === "receita" && t.status === "pago" && !t.deletedAt)
    .reduce((sum, t) => sum + Number(t.amount), 0);
}
