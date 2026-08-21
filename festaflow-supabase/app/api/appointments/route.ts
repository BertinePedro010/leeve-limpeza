import { prisma } from "@/lib/prisma";
import { requireAuth, resolveBranchFilter, assertRecordBranchAccess, AuthzError, handleAuthzError } from "@/lib/authz";
import { appointmentCreateSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

const include = {
  order: { select: { id: true, code: true, clientId: true, client: { select: { id: true, name: true } } } },
  employee: { select: { id: true, name: true } },
};

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const employeeId = url.searchParams.get("employeeId");
    const status = url.searchParams.get("status");

    const data = await prisma.appointment.findMany({
      where: {
        branchId: resolveBranchFilter(auth, branchId),
        ...(from || to
          ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
        ...(employeeId ? { employeeId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
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
    const parsed = appointmentCreateSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Atendimento invalido.", 422);
    const { orderId, employeeId, dates, startTime, endTime, notes } = parsed.data;

    const order = await prisma.serviceOrder.findUnique({ where: { id: orderId } });
    assertRecordBranchAccess(auth, order, "OS nao encontrada.");

    if (employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee || employee.branchId !== order.branchId) {
        throw new AuthzError("Funcionario nao pertence a filial da OS.", 422);
      }
    }

    const data = await prisma.$transaction(
      dates.map((date) =>
        prisma.appointment.create({
          data: { orderId, branchId: order.branchId, employeeId: employeeId ?? null, date, startTime, endTime, notes },
          include,
        })
      )
    );
    return ok(serialize(data), 201);
  } catch (error) {
    return handleAuthzError(error);
  }
}
