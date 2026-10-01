import { prisma } from "@/lib/prisma";
import { AuthzError, requireGlobalAdmin, resolveBranchFilter, type AuthContext } from "@/lib/authz";

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
 * Dashboard period selector: `month` (1-12) + `year`, defaulting to the
 * current month/year when either is absent - this is what makes "the
 * current month" the Dashboard's initial view without the frontend having
 * to compute or send a default itself. Unlike resolvePeriod's day-level
 * presets above (used by /api/reports), this is always a *whole calendar
 * month* range, selected explicitly by two numbers instead of a preset
 * string - the Dashboard's Anterior/Proximo navigation needs an exact
 * month+year round-trip, not a "mes atual" vs "mes anterior" choice.
 * Malformed input (non-numeric, out of range) throws AuthzError(422) rather
 * than silently falling back to "hoje" - a caller passing a garbled month
 * should see an error, not a dashboard quietly showing the wrong period.
 */
export function resolveMonthRange(url: URL): { year: number; month: number; from: Date; to: Date } {
  const now = new Date();
  const monthParam = url.searchParams.get("month");
  const yearParam = url.searchParams.get("year");
  const month = monthParam === null ? now.getMonth() + 1 : Number(monthParam);
  const year = yearParam === null ? now.getFullYear() : Number(yearParam);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AuthzError("Mes invalido: informe um valor entre 1 e 12.", 422);
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AuthzError("Ano invalido.", 422);
  }
  return {
    year,
    month,
    from: new Date(year, month - 1, 1),
    to: new Date(year, month, 0, 23, 59, 59, 999),
  };
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
