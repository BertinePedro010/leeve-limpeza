import { prisma } from "@/lib/prisma";
import { requireGlobalAdmin, resolveBranchFilter, type AuthContext } from "@/lib/authz";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** hoje | ontem | semana | mes | mes_anterior | personalizado (with from/to). Defaults to hoje. */
export function resolvePeriod(url: URL): { from: Date; to: Date } {
  const preset = url.searchParams.get("period");
  const now = new Date();
  if (preset === "ontem") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return { from: startOfDay(d), to: endOfDay(d) };
  }
  if (preset === "semana") {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    return { from: startOfDay(start), to: endOfDay(now) };
  }
  if (preset === "mes") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
  }
  if (preset === "mes_anterior") {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    };
  }
  if (preset === "personalizado") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from && to) return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };
  }
  return { from: startOfDay(now), to: endOfDay(now) };
}

/**
 * Same rule as every other endpoint: the requested branch is only ever used
 * after being validated. "all" is additionally gated behind requireGlobalAdmin
 * - a branch-scoped user can never request a consolidated cross-branch report.
 */
export async function resolveReportBranchFilter(auth: AuthContext, branchId: string | null): Promise<{ in: string[] }> {
  if (branchId === "all") {
    await requireGlobalAdmin(auth);
    const branches = await prisma.branch.findMany({ where: { active: true }, select: { id: true } });
    return { in: branches.map((b) => b.id) };
  }
  return resolveBranchFilter(auth, branchId);
}
