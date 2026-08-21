import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireAuth, requireModule, resolveBranchIdForCreate, resolveBranchFilter, AuthzError, handleAuthzError } from "@/lib/authz";
import { recurringScheduleSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";
import { generateAppointments } from "@/lib/recurrence";

// Must be called with the transaction client - see the identical comment in
// app/api/orders/route.ts (connection pool capped at 1, deadlocks otherwise).
async function nextCode(client: Prisma.TransactionClient | typeof prisma, branchId: string) {
  const year = new Date().getFullYear();
  const count = await client.serviceOrder.count({ where: { branchId } });
  return `OS-${year}-${String(count + 1).padStart(4, "0")}`;
}

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
    if (!parsed.success) return fail("Recorrencia invalida.", 422);
    const branchId = resolveBranchIdForCreate(auth, parsed.data.branchId);

    const [client, service, employees] = await Promise.all([
      prisma.client.findUnique({ where: { id: parsed.data.clientId } }),
      prisma.service.findUnique({ where: { id: parsed.data.serviceId } }),
      prisma.employee.findMany({ where: { id: { in: parsed.data.employeeIds } } }),
    ]);
    if (!client || client.branchId !== branchId) throw new AuthzError("Cliente nao pertence a filial informada.", 422);
    if (!service || service.branchId !== branchId) throw new AuthzError("Servico nao pertence a filial informada.", 422);
    if (employees.length !== parsed.data.employeeIds.length || employees.some((e) => e.branchId !== branchId)) {
      throw new AuthzError("Um ou mais funcionarios nao pertencem a filial informada.", 422);
    }

    const { location, employeeIds, ...schedulePayload } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.create({
        data: {
          branchId,
          clientId: parsed.data.clientId,
          code: await nextCode(tx, branchId),
          eventDate: parsed.data.startDate,
          startTime: parsed.data.startTime,
          endTime: parsed.data.endTime,
          location,
          status: "confirmado",
          totalAmount: parsed.data.price,
          createdBy: auth.userId,
          items: { create: [{ serviceId: parsed.data.serviceId, quantity: 1, unitPrice: parsed.data.price }] },
          employees: { create: employeeIds.map((employeeId) => ({ employeeId })) },
        },
      });

      const schedule = await tx.recurringSchedule.create({
        data: { ...schedulePayload, branchId, orderId: order.id, createdBy: auth.userId },
      });

      return { order, schedule };
    }, { timeout: 15000 });

    const generation = await generateAppointments(result.schedule.id);

    return ok(serialize({ ...result, generation }), 201);
  } catch (error) {
    return handleAuthzError(error);
  }
}
