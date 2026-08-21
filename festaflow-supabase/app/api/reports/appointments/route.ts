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
    const employeeId = url.searchParams.get("employeeId");
    const status = url.searchParams.get("status");
    const serviceId = url.searchParams.get("serviceId");

    const data = await prisma.appointment.findMany({
      where: {
        branchId: branchFilter,
        date: { gte: from, lte: to },
        ...(employeeId ? { employeeId } : {}),
        ...(status ? { status: status as never } : {}),
        ...(serviceId ? { order: { items: { some: { serviceId } } } } : {}),
      },
      include: {
        order: { select: { code: true, client: { select: { name: true } }, items: { include: { service: true } } } },
        employee: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return ok(serialize({ period: { from, to }, data }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
