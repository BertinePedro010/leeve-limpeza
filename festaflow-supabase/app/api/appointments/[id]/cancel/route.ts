import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, handleAuthzError } from "@/lib/authz";
import { appointmentCancelSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

// Cancels ONE appointment only. Never touches the parent OS or any sibling
// appointment - "cancelar a OS inteira" is a separate action on /api/orders/[id].
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;
    const existing = await prisma.appointment.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Atendimento nao encontrado.");
    const parsed = appointmentCancelSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Informe o motivo do cancelamento.", 422);

    // `status` is intentionally left untouched - "cancelado" is not a valid
    // status value (see lib/order-status.ts). cancelledAt is what marks this
    // appointment cancelled everywhere it's read.
    const data = await prisma.appointment.update({
      where: { id },
      data: {
        cancellationReason: parsed.data.reason,
        cancelledAt: new Date(),
        cancelledBy: auth.userId,
      },
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}
