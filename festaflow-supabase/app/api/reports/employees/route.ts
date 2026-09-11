import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, handleAuthzError } from "@/lib/authz";
import { resolvePeriod, resolveReportBranchFilter } from "@/lib/reports";
import { ok, serialize } from "@/lib/json";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "reports");
    const url = new URL(request.url);
    const branchFilter = await resolveReportBranchFilter(auth, url.searchParams.get("branchId"));
    const { from, to } = resolvePeriod(url);

    const employees = await prisma.employee.findMany({
      where: { deletedAt: null, branchId: branchFilter },
      include: { branch: { select: { name: true } } },
      orderBy: { name: "asc" },
    });

    // Cancellation is tracked via cancelledAt, not a status value (see
    // lib/order-status.ts) - groupBy(status) alone can no longer tell a
    // cancelled appointment apart from a merely-agendado one (both keep
    // status="agendado"), so this reads the rows themselves and buckets them
    // in JS instead. Bounded by employees.length x period, same as before.
    const appointments = await prisma.appointment.findMany({
      where: { employeeId: { in: employees.map((e) => e.id) }, date: { gte: from, lte: to } },
      select: { employeeId: true, status: true, cancelledAt: true },
    });

    const data = employees.map((employee) => {
      const rows = appointments.filter((a) => a.employeeId === employee.id);
      const cancelado = rows.filter((a) => a.cancelledAt !== null).length;
      const realizado = rows.filter((a) => a.cancelledAt === null && a.status === "realizado").length;
      const agendado = rows.length - cancelado - realizado;
      return {
        id: employee.id,
        name: employee.name,
        branch: employee.branch.name,
        role: employee.role,
        totalAppointments: rows.length,
        realizado,
        cancelado,
        agendado,
      };
    });

    return ok(serialize({ period: { from, to }, data }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
