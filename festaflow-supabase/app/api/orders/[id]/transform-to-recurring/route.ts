import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, AuthzError, handleAuthzError } from "@/lib/authz";
import { recurringScheduleSchema } from "@/lib/validators";
import { evaluateClientAddress, clientAddressErrorMessage } from "@/lib/order-address";
import { fail, ok, serialize } from "@/lib/json";
import { createRecurringScheduleForExistingOrder } from "@/lib/recurrence";
import { orderRealTotal } from "@/lib/order-total";

// Same shape as app/api/orders/[id]'s own include()/withRealTotal() - kept as
// a local copy rather than a shared import, matching that route's own
// documented reasoning (each order route's include can diverge later without
// one silently affecting the others).
function withRealTotal<T extends { totalAmount: unknown; _count: { appointments: number } }>(order: T): Omit<T, "_count"> & { total: number } {
  const { _count, ...rest } = order;
  return { ...rest, total: orderRealTotal(order.totalAmount as number | string, _count.appointments) };
}

function include(canViewFinance: boolean) {
  return { client: true, branch: { select: { id: true, name: true, city: true } }, items: { include: { service: true } }, employees: { include: { employee: true } }, transactions: canViewFinance, appointments: { include: { employee: { select: { id: true, name: true } } }, orderBy: [{ date: "asc" as const }, { startTime: "asc" as const }] }, recurringSchedules: { select: { id: true, frequency: true, interval: true, dayOfWeek: true, daysOfWeek: true, dayOfMonth: true, startDate: true, endDate: true, active: true, price: true } }, _count: { select: { appointments: { where: { cancelledAt: null } } } } };
}

// Turns an existing, still-scheduled OS into a recurring one - the SAME OS
// keeps its own id/code/history, a RecurringSchedule row is attached to it,
// and only its future occurrences are generated (see lib/recurrence.ts
// createRecurringScheduleForExistingOrder for how the OS's own pre-existing
// atendimento is preserved instead of duplicated). This is deliberately a
// different endpoint from POST /api/recurring-schedules (which always
// creates a brand-new OS) - that endpoint is untouched and still backs the
// plain "Nova Recorrencia" and "Criar recorrencia a partir desta OS" (for a
// Realizada OS, used as a template) flows.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;

    const existing = await prisma.serviceOrder.findUnique({
      where: { id, deletedAt: null },
      include: { items: true, recurringSchedules: { select: { id: true } } },
    });
    assertRecordBranchAccess(auth, existing, "OS nao encontrada.");

    if (existing.cancelledAt) {
      throw new AuthzError("Esta OS foi cancelada e nao pode ser transformada em recorrencia.", 422);
    }
    // Only a still-scheduled OS can be transformed in place. A Realizada OS
    // keeps its history untouched - the UI offers a separate "Criar
    // recorrencia a partir desta OS" action instead, which reuses this same
    // form to create a brand-new recurring OS via /api/recurring-schedules.
    if (existing.status !== "agendado") {
      throw new AuthzError('Apenas uma OS Agendada pode ser transformada diretamente em recorrencia. Para uma OS Realizada, use "Criar recorrencia a partir desta OS".', 422);
    }
    if (existing.recurringSchedules.length > 0) {
      throw new AuthzError("Esta OS ja possui uma recorrencia configurada.", 422);
    }

    const parsed = recurringScheduleSchema.safeParse(await request.json());
    if (!parsed.success) {
      const daysIssue = parsed.error.issues.find((issue) => issue.path[0] === "daysOfWeek");
      if (daysIssue) return fail(daysIssue.message, 422, "daysOfWeek");
      return fail("Recorrencia invalida.", 422);
    }

    // Client and branch are locked to the OS being transformed - this is not
    // a general-purpose recurrence creator, so neither is ever taken from the
    // request body even if the (disabled, pre-filled) frontend field sent one.
    if (parsed.data.clientId !== existing.clientId) {
      throw new AuthzError("O cliente nao pode ser alterado ao transformar a OS em recorrencia.", 422);
    }
    const contractedServiceIds = new Set(existing.items.map((i) => i.serviceId));
    if (!contractedServiceIds.has(parsed.data.serviceId)) {
      return fail("Selecione um dos servicos ja contratados nesta OS.", 422, "serviceId");
    }

    const branchId = existing.branchId;
    const [client, employees] = await Promise.all([
      prisma.client.findUnique({ where: { id: existing.clientId } }),
      prisma.employee.findMany({ where: { id: { in: parsed.data.employeeIds } } }),
    ]);
    if (!client || client.deletedAt) throw new AuthzError("Cliente nao encontrado.", 422);
    const clientAddressState = evaluateClientAddress(client);
    if (clientAddressState !== "ok") {
      return fail(clientAddressErrorMessage(clientAddressState, client), 422, "clientId");
    }
    if (employees.length !== parsed.data.employeeIds.length || employees.some((e) => e.branchId !== branchId)) {
      throw new AuthzError("Um ou mais funcionarios nao pertencem a filial da OS.", 422);
    }

    // Same normalization as POST /api/recurring-schedules.
    const isBiweekly = parsed.data.frequency === "biweekly";
    const usesWeekdays = parsed.data.frequency === "weekly" || isBiweekly;
    const daysOfWeek = usesWeekdays ? [...new Set(parsed.data.daysOfWeek ?? [])].sort((a, b) => a - b) : [];
    const dayOfWeek = usesWeekdays ? (daysOfWeek[0] ?? null) : null;

    const canViewFinance = auth.profile.role === "admin" || auth.profile.allowedModules.includes("finance");

    const data = await prisma.$transaction(async (tx) => {
      // Fast-path re-check for a concurrent transform (double-click /
      // duplicate request) so the common case fails fast with a clean 422.
      // This alone is NOT race-proof (two transactions can both read
      // count=0 under Postgres's default ReadCommitted isolation before
      // either commits) - the real guarantee is the @unique constraint on
      // recurring_schedules.order_id (migration
      // 20260918120000_recurring_schedule_order_unique), which turns a true
      // race into a P2002 error caught below instead of a second row.
      const raceCount = await tx.recurringSchedule.count({ where: { orderId: id } });
      if (raceCount > 0) throw new AuthzError("Esta OS ja possui uma recorrencia configurada.", 422);

      // Employees are carried over from the OS by default (pre-filled in the
      // form) but stay editable, exactly like editing the OS itself (see the
      // PUT /api/orders/[id] route this mirrors).
      await tx.orderEmployee.deleteMany({ where: { orderId: id } });
      if (parsed.data.employeeIds.length > 0) {
        await tx.orderEmployee.createMany({ data: parsed.data.employeeIds.map((employeeId) => ({ orderId: id, employeeId })) });
      }

      const { schedule, created, adopted } = await createRecurringScheduleForExistingOrder(tx, {
        orderId: id,
        branchId,
        clientId: existing.clientId,
        serviceId: parsed.data.serviceId,
        frequency: parsed.data.frequency,
        interval: isBiweekly ? 1 : parsed.data.interval,
        dayOfWeek,
        daysOfWeek,
        dayOfMonth: parsed.data.frequency === "monthly" ? (parsed.data.dayOfMonth ?? null) : null,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        price: parsed.data.price,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate ?? null,
        createdBy: auth.userId,
      });

      const order = await tx.serviceOrder.findUniqueOrThrow({ where: { id }, include: include(canViewFinance) });
      return { order, schedule, created, adopted };
    }, { timeout: 15000 });

    return ok(serialize({ order: withRealTotal(data.order), schedule: data.schedule, generation: { created: data.created, adopted: data.adopted } }));
  } catch (error) {
    // The true concurrent-double-submit guard: two racing requests can both
    // pass the in-transaction COUNT check above, but only one can win the
    // @unique(order_id) constraint - the loser lands here as P2002, not a
    // partially-applied write (both writes happen inside the same $transaction,
    // so the loser's entire transaction is rolled back, not just this insert).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Esta OS ja possui uma recorrencia configurada.", 422);
    }
    return handleAuthzError(error);
  }
}
