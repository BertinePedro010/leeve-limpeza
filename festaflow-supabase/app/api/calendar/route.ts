import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, resolveBranchFilter, handleAuthzError } from "@/lib/authz";
import { fail, ok, serialize } from "@/lib/json";

// Branch-scoped, server-filtered appointment list for a date range - the
// calendar UI must never derive this by filtering a client-side list of
// every order (the anti-pattern the prior client-only implementation had).
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "calendar");
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to) return fail("Parametros from e to sao obrigatorios.", 422);

    const data = await prisma.appointment.findMany({
      where: {
        branchId: resolveBranchFilter(auth, branchId),
        date: { gte: new Date(from), lte: new Date(to) },
        // A soft-deleted OS (deletedAt set) is already gone from every order
        // list the UI reads from - its appointments must not linger on the
        // calendar as unopenable events.
        order: { deletedAt: null },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: {
        order: {
          select: {
            id: true,
            code: true,
            client: { select: { id: true, name: true } },
            items: { include: { service: true } },
          },
        },
        employee: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}
