import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireAuth, resolveBranchIdForCreate, resolveBranchFilter, AuthzError, handleAuthzError } from "@/lib/authz";
import { orderSchema } from "@/lib/validators";
import { syncOrderBilling } from "@/lib/billing";
import { fail, ok, serialize } from "@/lib/json";

// Must be called with the *transaction* client when running inside
// prisma.$transaction - the connection pool here is capped at 1 connection,
// so calling the outer `prisma` singleton from inside an open transaction
// deadlocks (the transaction holds the only connection while waiting on a
// query that itself needs a connection).
async function nextCode(client: Prisma.TransactionClient | typeof prisma, branchId: string) {
  const year = new Date().getFullYear();
  const count = await client.serviceOrder.count({ where: { branchId } });
  return `OS-${year}-${String(count + 1).padStart(4, "0")}`;
}

function total(items: Array<{ quantity: number; unitPrice: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
}

const include = { client: true, branch: { select: { id: true, name: true, city: true } }, items: { include: { service: true } }, employees: { include: { employee: true } }, attachments: true, transactions: true, appointments: { include: { employee: { select: { id: true, name: true } } }, orderBy: [{ date: "asc" as const }, { startTime: "asc" as const }] } };

async function assertSameBranchRelations(
  branchId: string,
  clientId: string,
  serviceIds: string[],
  employeeIds: string[]
) {
  const [client, services, employees] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.service.findMany({ where: { id: { in: serviceIds } } }),
    prisma.employee.findMany({ where: { id: { in: employeeIds } } }),
  ]);
  if (!client || client.branchId !== branchId) {
    throw new AuthzError("Cliente nao pertence a filial da OS.", 422);
  }
  if (services.length !== serviceIds.length || services.some((s) => s.branchId !== branchId)) {
    throw new AuthzError("Um ou mais servicos nao pertencem a filial da OS.", 422);
  }
  if (employees.length !== employeeIds.length || employees.some((e) => e.branchId !== branchId)) {
    throw new AuthzError("Um ou mais funcionarios nao pertencem a filial da OS.", 422);
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const branchId = new URL(request.url).searchParams.get("branchId");
    const data = await prisma.serviceOrder.findMany({
      where: { deletedAt: null, branchId: resolveBranchFilter(auth, branchId) },
      orderBy: { eventDate: "asc" },
      include,
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const parsed = orderSchema.safeParse(await request.json());
    if (!parsed.success) return fail("OS invalida.", 422);
    const branchId = resolveBranchIdForCreate(auth, parsed.data.branchId);
    const { items, employeeIds, dates, branchId: _branchId, ...body } = parsed.data;
    await assertSameBranchRelations(branchId, body.clientId, items.map((i) => i.serviceId), employeeIds);

    // dates omitted (or empty): preserve prior behavior - exactly one
    // appointment mirroring eventDate/startTime/endTime. dates present: one
    // appointment per selected date, all under the same OS.
    const appointmentDates = dates && dates.length > 0 ? dates : [body.eventDate];

    const data = await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.create({
        data: {
          ...body,
          branchId,
          createdBy: auth.userId,
          code: await nextCode(tx, branchId),
          totalAmount: total(items),
          items: { create: items },
          employees: { create: employeeIds.map((employeeId) => ({ employeeId })) },
        },
      });
      await tx.appointment.createMany({
        data: appointmentDates.map((date) => ({
          orderId: order.id,
          branchId,
          date,
          startTime: body.startTime,
          endTime: body.endTime,
        })),
      });
      // Covers the rare case of an order created already in "finalizado"
      // status - keeps billing in sync from the very first write, not just
      // from subsequent edits.
      await syncOrderBilling(tx, order.id);
      // Re-read with the full include AFTER appointments exist - creating
      // with `include` would have returned an order.appointments snapshot
      // from before appointment.createMany ran (same stale-response class of
      // bug already fixed once for the cascade-cancel path in PUT below).
      return tx.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, include });
    }, { timeout: 15000 });
    return ok(serialize(data), 201);
  } catch (error) {
    return handleAuthzError(error);
  }
}
