import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthzError } from "@/lib/authz";
import { resolvePeriod, resolveReportBranchFilter } from "@/lib/reports";
import { ok, serialize } from "@/lib/json";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const url = new URL(request.url);
    const branchFilter = await resolveReportBranchFilter(auth, url.searchParams.get("branchId"));
    const { from, to } = resolvePeriod(url);

    const employees = await prisma.employee.findMany({
      where: { deletedAt: null, branchId: branchFilter },
      include: { branch: { select: { name: true } } },
      orderBy: { name: "asc" },
    });

    const appointments = await prisma.appointment.groupBy({
      by: ["employeeId", "status"],
      where: { employeeId: { in: employees.map((e) => e.id) }, date: { gte: from, lte: to } },
      _count: true,
    });

    const data = employees.map((employee) => {
      const rows = appointments.filter((a) => a.employeeId === employee.id);
      const total = rows.reduce((sum, r) => sum + r._count, 0);
      const byStatus = Object.fromEntries(rows.map((r) => [r.status, r._count]));
      return {
        id: employee.id,
        name: employee.name,
        branch: employee.branch.name,
        role: employee.role,
        totalAppointments: total,
        realizado: byStatus.finalizado ?? 0,
        cancelado: byStatus.cancelado ?? 0,
        agendado: (byStatus.pendente ?? 0) + (byStatus.confirmado ?? 0) + (byStatus.em_andamento ?? 0),
      };
    });

    return ok(serialize({ period: { from, to }, data }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
