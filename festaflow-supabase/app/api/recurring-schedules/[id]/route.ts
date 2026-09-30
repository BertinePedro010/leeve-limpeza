import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, AuthzError, handleAuthzError } from "@/lib/authz";
import { recurringScheduleUpdateSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

// Edits ONLY the recurrence's own "valor mensal" (serviceId + price) - the
// inline click-to-edit affordance in components/SaasApp.tsx OrderFormModal
// mirrors the appointment date-reschedule pattern in
// app/api/appointments/[id]. Deliberately narrow: never touches orderId,
// clientId, frequency/day/date fields, and never regenerates appointments
// (contrast with the sibling generate/route.ts). Because
// RecurringSchedule.price/serviceId feed nothing else - no ServiceOrderItem,
// no ServiceOrder.totalAmount, no Appointment carries a price column at all -
// this update can never rewrite historical realizado values, so no
// confirmation gate is needed here (unlike a realizado OS's own item price,
// see components/SaasApp.tsx REALIZADO_PRICE_EDIT_CONFIRM).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;
    const existing = await prisma.recurringSchedule.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Recorrencia nao encontrada.");

    const parsed = recurringScheduleUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Recorrencia invalida.", 422);

    const service = await prisma.service.findUnique({ where: { id: parsed.data.serviceId } });
    if (!service || service.branchId !== existing.branchId) {
      throw new AuthzError("Servico nao pertence a filial da recorrencia.", 422);
    }

    const updated = await prisma.recurringSchedule.update({
      where: { id },
      data: { serviceId: parsed.data.serviceId, price: parsed.data.price },
      include: { client: true, service: true, order: { select: { id: true, code: true } } },
    });
    return ok(serialize(updated));
  } catch (error) {
    return handleAuthzError(error);
  }
}
