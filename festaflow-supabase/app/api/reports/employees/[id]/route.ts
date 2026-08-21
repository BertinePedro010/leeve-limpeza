import { prisma } from "@/lib/prisma";
import { requireAuth, assertRecordBranchAccess, handleAuthzError } from "@/lib/authz";
import { resolvePeriod } from "@/lib/reports";
import { ok, serialize } from "@/lib/json";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await params;
    const employee = await prisma.employee.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, employee, "Funcionario nao encontrado.");

    const url = new URL(request.url);
    const { from, to } = resolvePeriod(url);

    const appointments = await prisma.appointment.findMany({
      where: { employeeId: id, date: { gte: from, lte: to } },
      include: {
        order: { select: { id: true, code: true, totalAmount: true, client: { select: { name: true } }, items: { include: { service: true } } } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // Sum each distinct OS only once, even if the employee has multiple
    // atendimentos on the same OS in the period.
    const distinctOrders = new Map(appointments.map((a) => [a.order.id, a.order.totalAmount]));
    const totalValue = [...distinctOrders.values()].reduce((sum, v) => sum + Number(v), 0);

    const summary = {
      total: appointments.length,
      realizado: appointments.filter((a) => a.status === "finalizado").length,
      cancelado: appointments.filter((a) => a.status === "cancelado").length,
      agendado: appointments.filter((a) => !["finalizado", "cancelado"].includes(a.status)).length,
      totalValue,
      orderCount: distinctOrders.size,
    };

    return ok(
      serialize({
        employee: { id: employee.id, name: employee.name, role: employee.role },
        period: { from, to },
        summary,
        appointments,
      })
    );
  } catch (error) {
    return handleAuthzError(error);
  }
}
