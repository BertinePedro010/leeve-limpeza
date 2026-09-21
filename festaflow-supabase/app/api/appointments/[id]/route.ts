import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, AuthzError, handleAuthzError } from "@/lib/authz";
import { appointmentUpdateSchema, appointmentValidationError } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

const include = {
  order: { select: { id: true, code: true, clientId: true, client: { select: { id: true, name: true } } } },
  employee: { select: { id: true, name: true } },
};

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;
    const existing = await prisma.appointment.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Atendimento nao encontrado.");
    const parsed = appointmentUpdateSchema.safeParse(await request.json());
    if (!parsed.success) { const { message, field } = appointmentValidationError(parsed.error); return fail(message, 422, field); }

    if (parsed.data.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
      if (!employee || employee.branchId !== existing.branchId) {
        throw new AuthzError("Funcionario nao pertence a filial do atendimento.", 422);
      }
    }

    // A reschedule (date and/or startTime/endTime actually changing) is
    // handled separately from a plain field update (employeeId/status/notes)
    // below: this is the ONLY path that (a) is intentionally allowed
    // regardless of status - correcting the date of an already-"realizado"
    // atendimento is exactly what this endpoint exists to unblock, the
    // frontend-only disabled state that used to gate it is gone (see
    // components/SaasApp.tsx AppointmentRow) - (b) keeps ServiceOrder's own
    // eventDate/startTime/endTime in sync when the occurrence being moved is
    // the OS's "principal" one (the same date-equality convention PUT
    // /api/orders/[id] already uses to route a status change to the right
    // occurrence), so the OS list, the Dashboard "Proximos eventos" widget,
    // and the e-mail/WhatsApp "Data:" line never go stale after a correction
    // - and (c) writes a minimal audit row (see prisma/schema.prisma
    // AppointmentRescheduleLog). A cancelled atendimento can never be
    // rescheduled - cancellation is terminal, exactly like every other
    // mutation on a cancelled row in this file's sibling routes.
    const dateChanged = parsed.data.date !== undefined && dateKey(parsed.data.date) !== dateKey(existing.date);
    const timeChanged = (parsed.data.startTime !== undefined && parsed.data.startTime !== existing.startTime) || (parsed.data.endTime !== undefined && parsed.data.endTime !== existing.endTime);
    const isReschedule = dateChanged || timeChanged;

    if (isReschedule && existing.cancelledAt) {
      throw new AuthzError("Nao e possivel alterar a data de um atendimento cancelado.", 422);
    }

    if (!isReschedule) {
      const data = await prisma.appointment.update({ where: { id }, data: parsed.data, include });
      return ok(serialize(data));
    }

    const data = await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findUniqueOrThrow({ where: { id: existing.orderId }, select: { eventDate: true } });
      const wasPrincipal = dateKey(existing.date) === dateKey(order.eventDate);

      const updated = await tx.appointment.update({ where: { id }, data: parsed.data, include });

      if (wasPrincipal) {
        await tx.serviceOrder.update({
          where: { id: existing.orderId },
          data: { eventDate: updated.date, startTime: updated.startTime, endTime: updated.endTime },
        });
      }

      await tx.appointmentRescheduleLog.create({
        data: {
          appointmentId: id,
          orderId: existing.orderId,
          branchId: existing.branchId,
          changedBy: auth.userId,
          statusAtChange: existing.status,
          previousDate: existing.date,
          newDate: updated.date,
          previousStartTime: existing.startTime,
          newStartTime: updated.startTime,
          previousEndTime: existing.endTime,
          newEndTime: updated.endTime,
        },
      });

      return updated;
    }, { timeout: 15000 });

    return ok(serialize(data));
  } catch (error) {
    // The only pre-existing conflict rule this system enforces for
    // appointment dates: two occurrences of the SAME recurring schedule can
    // never share a date (@@unique([recurringScheduleId, date]) - see
    // prisma/schema.prisma). Reused here, never a new arbitrary rule: a plain
    // (non-recurring) appointment has no duplicate-date restriction, so this
    // can only ever fire when `existing.recurringScheduleId` is set and the
    // new date collides with a sibling occurrence of that same recurrence.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Ja existe um atendimento desta recorrencia nesta data. Escolha outra data.", 422, "date");
    }
    return handleAuthzError(error);
  }
}

// Hard-removes ONE occurrence (e.g. an extra date added by mistake). Distinct
// from cancel (which keeps the row with status=cancelado and a reason). Never
// touches the parent OS or siblings. Refused when it is the OS's last
// remaining occurrence - an OS always keeps at least one appointment.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;
    const existing = await prisma.appointment.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Atendimento nao encontrado.");
    const siblings = await prisma.appointment.count({ where: { orderId: existing.orderId } });
    if (siblings <= 1) {
      throw new AuthzError("Nao e possivel remover o unico atendimento da OS. Cancele-o ou exclua a OS inteira.", 422);
    }
    await prisma.appointment.delete({ where: { id } });
    return ok({ success: true });
  } catch (error) {
    return handleAuthzError(error);
  }
}
