import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, handleAuthzError } from "@/lib/authz";
import { resolvePeriod } from "@/lib/reports";
import { ok, serialize } from "@/lib/json";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "reports");
    const { id } = await params;
    const employee = await prisma.employee.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, employee, "Funcionario nao encontrado.");

    const url = new URL(request.url);
    const { from, to } = resolvePeriod(url);

    const appointments = await prisma.appointment.findMany({
      where: { employeeId: id, date: { gte: from, lte: to } },
      include: {
        // `items`/`service` intentionally not selected - ReportsView's
        // "employee" report only reads order.client.name and order.code.
        order: { select: { id: true, code: true, totalAmount: true, client: { select: { name: true } } } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // Value inherited per occurrence (see lib/order-total.ts) - if the
    // employee did 3 atendimentos this period on the same recurring OS, the
    // value they were responsible for is 3x order.totalAmount, not the OS's
    // totalAmount once. Cancelled atendimentos never contribute value or
    // count toward orderCount, same rule as everywhere else (see
    // lib/order-status.ts). orderCount stays a distinct-OS count (how many
    // different OS this employee touched) - unrelated to the value fix,
    // still counted once per OS regardless of how many visits.
    const nonCancelled = appointments.filter((a) => a.cancelledAt === null);
    const totalValue = nonCancelled.reduce((sum, a) => sum + Number(a.order.totalAmount), 0);
    const orderCount = new Set(nonCancelled.map((a) => a.order.id)).size;

    const summary = {
      total: appointments.length,
      realizado: nonCancelled.filter((a) => a.status === "realizado").length,
      cancelado: appointments.filter((a) => a.cancelledAt !== null).length,
      agendado: nonCancelled.filter((a) => a.status === "agendado").length,
      totalValue,
      orderCount,
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
