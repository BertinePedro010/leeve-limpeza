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

    const cancelled = await prisma.appointment.findMany({
      where: { branchId: branchFilter, status: "cancelado", cancelledAt: { gte: from, lte: to } },
      include: {
        order: { select: { code: true, status: true, client: { select: { name: true } } } },
        employee: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { cancelledAt: "desc" },
    });

    // Whole-OS cancellations cascade-cancel every open appointment with the
    // same fixed reason ("OS cancelada.") - that's how the two cases are
    // told apart here, instead of a separate cancellation-type column.
    const data = cancelled.map((a) => ({
      orderCode: a.order.code,
      client: a.order.client.name,
      branch: a.branch.name,
      employee: a.employee?.name ?? null,
      appointmentDate: a.date,
      cancelledAt: a.cancelledAt,
      reason: a.cancellationReason,
      type: a.order.status === "cancelado" && a.cancellationReason === "OS cancelada." ? "os_inteira" : "atendimento_individual",
    }));

    return ok(serialize({ period: { from, to }, data }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
