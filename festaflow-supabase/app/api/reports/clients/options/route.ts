import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, handleAuthzError } from "@/lib/authz";
import { resolveReportBranchFilter } from "@/lib/reports";
import { ok, serialize } from "@/lib/json";

// Client picker options for the "Por Cliente" report. Gated by the SAME
// module ("reports") and the SAME branch resolution as the report itself
// (resolveReportBranchFilter -> "all" still behind requireGlobalAdmin), so a
// reports user never needs the separate "clients" module and can never list
// clients from a branch they are not authorized for. Returns only id + name.
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "reports");
    const url = new URL(request.url);
    const branchFilter = await resolveReportBranchFilter(auth, url.searchParams.get("branchId"));

    const data = await prisma.client.findMany({
      where: { deletedAt: null, branchId: branchFilter },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}
