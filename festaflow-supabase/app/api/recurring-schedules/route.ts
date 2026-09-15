import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, resolveBranchIdForCreate, resolveBranchFilter, AuthzError, handleAuthzError } from "@/lib/authz";
import { recurringScheduleSchema } from "@/lib/validators";
import { formatOrderAddressLine, orderAddressSnapshot, evaluateClientAddress, clientAddressErrorMessage } from "@/lib/order-address";
import { fail, ok, serialize } from "@/lib/json";
import { generateAppointments } from "@/lib/recurrence";
import { nextOrderCode } from "@/lib/order-code";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const branchId = new URL(request.url).searchParams.get("branchId");
    const data = await prisma.recurringSchedule.findMany({
      where: { branchId: resolveBranchFilter(auth, branchId) },
      include: { client: true, service: true, order: { select: { id: true, code: true } } },
      orderBy: { createdAt: "desc" },
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const body = await request.json();
    const parsed = recurringScheduleSchema.safeParse(body);
    if (!parsed.success) {
      const daysIssue = parsed.error.issues.find((issue) => issue.path[0] === "daysOfWeek");
      if (daysIssue) return fail(daysIssue.message, 422, "daysOfWeek");
      return fail("Recorrencia invalida.", 422);
    }
    const branchId = resolveBranchIdForCreate(auth, parsed.data.branchId);

    const [client, service, employees] = await Promise.all([
      prisma.client.findUnique({ where: { id: parsed.data.clientId } }),
      prisma.service.findUnique({ where: { id: parsed.data.serviceId } }),
      prisma.employee.findMany({ where: { id: { in: parsed.data.employeeIds } } }),
    ]);
    if (!client || client.branchId !== branchId || client.deletedAt) throw new AuthzError("Cliente nao pertence a filial informada.", 422);
    if (!service || service.branchId !== branchId) throw new AuthzError("Servico nao pertence a filial informada.", 422);
    if (employees.length !== parsed.data.employeeIds.length || employees.some((e) => e.branchId !== branchId)) {
      throw new AuthzError("Um ou mais funcionarios nao pertencem a filial informada.", 422);
    }

    // The recurrence's OS snapshots its service address from the client's
    // cadastro, exactly like a normal OS - `location` from the payload is
    // ignored. A recurrence cannot start for a client with no usable address.
    const clientAddressState = evaluateClientAddress(client);
    if (clientAddressState !== "ok") {
      return fail(clientAddressErrorMessage(clientAddressState, client), 422, "clientId");
    }
    const address = orderAddressSnapshot(client);

    // The OS item/total must always reflect the service's own cadastro
    // price, never `parsed.data.price` ("valor mensal") - that field is a
    // separate, independent concept (the recurrence's own monthly/contract
    // value, stored only on RecurringSchedule.price below) and must never
    // contaminate the item's unit price or the order's total. Never trust
    // the frontend for this even though it now sends the same number by
    // default - `service` was already looked up and branch-validated above,
    // so its `price` is the authoritative source, exactly like a normal OS
    // creation (see app/api/orders' own `total()` helper for the same rule).
    const unitPrice = Number(service.price);

    const { location: _location, employeeIds, dayOfWeek: _dayOfWeek, daysOfWeek: _daysOfWeek, ...schedulePayload } = parsed.data;
    // Normalize to a sorted, deduped list for weekly schedules (monthly
    // schedules carry no weekday at all); dayOfWeek keeps mirroring the
    // lowest selected day for any code/tooling still reading the legacy
    // single-day column (see prisma/schema.prisma RecurringSchedule).
    // Biweekly (quinzenal) never accepts a client-chosen weekday - it is
    // always locked to startDate's own weekday, so the first occurrence is
    // always startDate itself and every following one is exactly 14 days
    // later (see lib/recurrence.ts computeOccurrences, which reads this
    // same daysOfWeek/dayOfWeek pair through the weekly code path).
    const isWeekly = parsed.data.frequency === "weekly";
    const isBiweekly = parsed.data.frequency === "biweekly";
    const daysOfWeek = isWeekly
      ? [...new Set(parsed.data.daysOfWeek ?? [])].sort((a, b) => a - b)
      : isBiweekly
        ? [parsed.data.startDate.getDay()]
        : [];
    const dayOfWeek = isWeekly || isBiweekly ? (daysOfWeek[0] ?? null) : null;

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.create({
        data: {
          branchId,
          clientId: parsed.data.clientId,
          code: await nextOrderCode(tx, branchId),
          eventDate: parsed.data.startDate,
          startTime: parsed.data.startTime,
          endTime: parsed.data.endTime,
          ...address,
          location: formatOrderAddressLine(address),
          status: "agendado",
          totalAmount: unitPrice,
          createdBy: auth.userId,
          items: { create: [{ serviceId: parsed.data.serviceId, quantity: 1, unitPrice }] },
          employees: { create: employeeIds.map((employeeId) => ({ employeeId })) },
        },
      });

      const schedule = await tx.recurringSchedule.create({
        // `interval` is meaningless for biweekly (the 14-day step is fixed,
        // see lib/recurrence.ts) - forced to 1 here so the stored value is
        // never a stale leftover from switching frequencies on the form.
        data: { ...schedulePayload, interval: isBiweekly ? 1 : schedulePayload.interval, dayOfWeek, daysOfWeek, branchId, orderId: order.id, createdBy: auth.userId },
      });

      return { order, schedule };
    }, { timeout: 15000 });

    const generation = await generateAppointments(result.schedule.id);

    return ok(serialize({ ...result, generation }), 201);
  } catch (error) {
    return handleAuthzError(error);
  }
}
