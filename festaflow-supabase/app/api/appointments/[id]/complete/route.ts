import { prisma } from "@/lib/prisma";
import { requireAuth, assertRecordBranchAccess, handleAuthzError } from "@/lib/authz";
import { ok, serialize } from "@/lib/json";
import { sendAppointmentCompletedEmail } from "@/lib/email";
import { syncOrderBilling } from "@/lib/billing";

// Marks a single appointment as completed. If this was the last still-open
// appointment on the order, also marks the order itself as finalizado (a
// convenience, not a requirement - individual appointments remain the source
// of truth) and syncs the order's billing (see lib/billing.ts) in the same
// transaction, so Dashboard/Financeiro/Relatorios never observe a
// finalizado OS without its revenue, or vice versa. Email failures never
// affect the appointment's saved status.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await params;
    const existing = await prisma.appointment.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Atendimento nao encontrado.");

    const appointment = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: { status: "finalizado", completedAt: new Date() },
        include: {
          order: {
            include: { client: true, items: { include: { service: true } } },
          },
        },
      });

      const remainingOpen = await tx.appointment.count({
        where: { orderId: updated.orderId, status: { notIn: ["finalizado", "cancelado"] } },
      });
      if (remainingOpen === 0) {
        await tx.serviceOrder.update({ where: { id: updated.orderId }, data: { status: "finalizado" } });
      }
      await syncOrderBilling(tx, updated.orderId);
      return updated;
    }, { timeout: 15000 });

    const serviceName = appointment.order.items[0]?.service?.name ?? "Servico";
    const emailResult = await sendAppointmentCompletedEmail({
      clientEmail: appointment.order.client.email,
      clientName: appointment.order.client.name,
      serviceName,
      date: appointment.date,
      orderCode: appointment.order.code,
    });

    return ok(serialize({ appointment, email: emailResult }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
