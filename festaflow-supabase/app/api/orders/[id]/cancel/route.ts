import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, handleAuthzError } from "@/lib/authz";
import { orderCancelSchema } from "@/lib/validators";
import { syncOrderBilling } from "@/lib/billing";
import { fail, ok, serialize } from "@/lib/json";

// Cancels the WHOLE OS - the replacement for the old "set status=cancelado"
// PUT branch, now that cancellation is tracked via cancelledAt/cancelledBy/
// cancellationReason instead of a status value (see lib/order-status.ts).
// Cascades to cancel every still-open appointment (mirrors
// app/api/appointments/[id]/cancel) and reverts any revenue the OS may have
// generated (lib/billing.ts). The OS itself keeps whatever agendado/realizado
// status it already had - only cancelledAt marks it cancelled.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;
    const existing = await prisma.serviceOrder.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "OS nao encontrada.");
    const parsed = orderCancelSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Informe o motivo do cancelamento.", 422);

    const data = await prisma.$transaction(async (tx) => {
      const updated = await tx.serviceOrder.update({
        where: { id },
        data: { cancelledAt: new Date(), cancelledBy: auth.userId, cancellationReason: parsed.data.reason },
      });
      await tx.appointment.updateMany({
        where: { orderId: id, status: { not: "realizado" }, cancelledAt: null },
        data: { cancelledAt: new Date(), cancelledBy: auth.userId, cancellationReason: "OS cancelada." },
      });
      await syncOrderBilling(tx, id, { order: updated });
      return updated;
    }, { timeout: 15000 });

    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}
