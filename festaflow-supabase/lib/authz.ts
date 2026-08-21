import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { fail } from "@/lib/json";

// Authorization is data-driven from `user_branches`, never inferred from `role`.
// An admin with access to "all branches" still needs one user_branches row per
// branch — see the comment on the UserBranch model in schema.prisma.

export class AuthzError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface AuthContext {
  userId: string;
  profile: { id: string; role: UserRole; name: string; email: string; allowedModules: string[] };
  branchIds: string[];
}

export async function requireAuth(): Promise<AuthContext> {
  const user = await requireUser();
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    include: { branches: { select: { branchId: true } } },
  });
  if (!profile || profile.deletedAt) {
    throw new AuthzError("Perfil nao encontrado ou inativo.", 403);
  }
  return {
    userId: user.id,
    profile: { id: profile.id, role: profile.role, name: profile.name, email: profile.email, allowedModules: profile.allowedModules },
    branchIds: profile.branches.map((b) => b.branchId),
  };
}

export function requireRole(auth: AuthContext, ...roles: UserRole[]): void {
  if (!roles.includes(auth.profile.role)) {
    throw new AuthzError("Papel nao autorizado para esta acao.", 403);
  }
}

/**
 * Module-level permission check. role="admin" always bypasses (full access,
 * preserves existing admin behavior) - every other role is gated strictly by
 * `profile.allowedModules`, checked here on every read AND write, never only
 * hidden client-side. "dashboard" is intentionally not a member of ModuleName:
 * it stays always-reachable as the landing page, with its own route zeroing
 * out financial figures for users lacking the "finance" module instead of
 * blocking the whole page. "branches" also stays outside this list - that
 * stays exclusive to requireGlobalAdmin, unchanged.
 */
export type ModuleName = "clients" | "employees" | "services" | "orders" | "calendar" | "finance" | "reports";

export function requireModule(auth: AuthContext, moduleName: ModuleName): void {
  if (auth.profile.role === "admin") return;
  if (!auth.profile.allowedModules.includes(moduleName)) {
    throw new AuthzError("Modulo nao autorizado para este usuario.", 403);
  }
}

export function canReadBranch(auth: AuthContext, branchId: string): boolean {
  return auth.branchIds.includes(branchId);
}

export function canWriteBranch(auth: AuthContext, branchId: string): boolean {
  return auth.branchIds.includes(branchId);
}

export function assertBranchAccess(auth: AuthContext, branchId: string): void {
  if (!canWriteBranch(auth, branchId)) {
    throw new AuthzError("Filial nao autorizada para este usuario.", 403);
  }
}

/**
 * Resolves the branch_id filter for a list/read endpoint from the frontend's
 * "active branch" intent. The requested id is only ever used after being
 * validated against the user's own user_branches rows — it is never trusted
 * on its own. Omitted/invalid input falls back to every branch the user is
 * authorized for (prior default behavior), never to "all branches" in the
 * database sense.
 */
export function resolveBranchFilter(auth: AuthContext, requested?: string | null): { in: string[] } {
  if (requested) {
    assertBranchAccess(auth, requested);
    return { in: [requested] };
  }
  return { in: auth.branchIds };
}

/**
 * Resolves the branchId for a new record without ever guessing a default.
 * - If the client sent one, it must be one of the user's authorized branches.
 * - If omitted and the user has exactly one authorized branch, that one is used
 *   (not a guess: it is the only value that could be valid for this user).
 * - If omitted and the user has 0 or 2+ authorized branches, this throws —
 *   the caller (frontend) must send an explicit branchId. This is the case
 *   that requires a branch selector in the UI (tracked as a pending UI-phase
 *   dependency, not worked around here).
 */
export function resolveBranchIdForCreate(auth: AuthContext, requested?: string | null): string {
  if (requested) {
    assertBranchAccess(auth, requested);
    return requested;
  }
  if (auth.branchIds.length === 1) return auth.branchIds[0];
  if (auth.branchIds.length === 0) {
    throw new AuthzError("Usuario sem filial vinculada. Contate um administrador.", 403);
  }
  throw new AuthzError("Filial obrigatoria: usuario tem acesso a mais de uma filial e nenhuma foi informada.", 422);
}

/**
 * Guards access to an already-fetched record that carries a branchId.
 * Returns 404 (not 403) when the record is missing or belongs to a branch
 * the user cannot access, so cross-branch record IDs never confirm existence.
 */
export function assertRecordBranchAccess<T extends { branchId: string } | null | undefined>(
  auth: AuthContext,
  record: T,
  notFoundMessage: string
): asserts record is NonNullable<T> {
  if (!record || !canReadBranch(auth, record.branchId)) {
    throw new AuthzError(notFoundMessage, 404);
  }
}

export function handleAuthzError(error: unknown) {
  if (error instanceof AuthzError) return fail(error.message, error.status);
  throw error;
}

/**
 * "Administrador global" is not a separate role — it is an admin whose
 * user_branches rows cover every currently active branch. Never inferred
 * from role alone (same principle as the rest of this file): an admin with
 * access to only one branch is a branch admin, not a global admin.
 */
export async function requireGlobalAdmin(auth: AuthContext): Promise<void> {
  requireRole(auth, "admin");
  const activeBranchCount = await prisma.branch.count({ where: { active: true } });
  const hasAllBranches = activeBranchCount > 0 && auth.branchIds.length >= activeBranchCount;
  if (!hasAllBranches) {
    throw new AuthzError("Acao restrita ao administrador global (acesso a todas as filiais).", 403);
  }
}
