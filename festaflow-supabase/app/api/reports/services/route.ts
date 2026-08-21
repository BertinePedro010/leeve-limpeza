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
    const serviceId = url.searchParams.get("serviceId");
    const employeeId = url.searchParams.get("employeeId");
    const status = url.searchParams.get("status");

    const items = await prisma.serviceOrderItem.findMany({
      where: {
        service: { branchId: branchFilter, ...(serviceId ? { id: serviceId } : {}) },
        order: {
          appointments: {
            some: {
              date: { gte: from, lte: to },
              ...(employeeId ? { employeeId } : {}),
              ...(status ? { status: status as never } : {}),
            },
          },
        },
      },
      include: {
        service: { select: { id: true, name: true, category: true } },
        order: {
          select: {
            code: true,
            client: { select: { name: true } },
            branch: { select: { name: true } },
            appointments: { where: { date: { gte: from, lte: to } }, select: { date: true, status: true, employee: { select: { name: true } } } },
          },
        },
      },
    });

    return ok(serialize({ period: { from, to }, data: items }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
