import { prisma } from "@/lib/prisma";

// The system_lock table always has exactly one row, whose id is this literal
// (also enforced by a CHECK constraint at the DB level - see the
// 20261012120000_add_system_lock migration). Every read/write in this app
// goes through this constant instead of letting callers guess an id.
export const SYSTEM_LOCK_ID = "global";

export interface SystemLockState {
  isBlocked: boolean;
  reason: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

const UNBLOCKED_FALLBACK: SystemLockState = { isBlocked: false, reason: null, updatedAt: null, updatedBy: null };

// Fail-open by design: a missing row (fresh deploy, migration not yet
// applied in some edge environment) or a transient DB error must NEVER
// block the whole application - only an explicit, successful read of
// isBlocked=true ever blocks anyone. The error is logged server-side only;
// nothing here ever throws, so callers (lib/authz.ts resolveAuth(), the
// page gates) never need their own try/catch around this.
export async function getSystemLockState(): Promise<SystemLockState> {
  try {
    const row = await prisma.systemLock.findUnique({ where: { id: SYSTEM_LOCK_ID } });
    if (!row) return UNBLOCKED_FALLBACK;
    return { isBlocked: row.isBlocked, reason: row.reason, updatedAt: row.updatedAt, updatedBy: row.updatedBy };
  } catch (error) {
    console.error("[system-lock] failed to read lock state - defaulting to unblocked:", error);
    return UNBLOCKED_FALLBACK;
  }
}

export interface SetSystemLockInput {
  isBlocked: boolean;
  reason?: string | null;
  changedBy: string;
}

// Upsert + audit-log insert in one transaction, same pattern as the
// branch-creation transaction in app/api/branches/route.ts, so the current
// state and its history can never disagree (e.g. a crash between the two
// writes). Returns the fresh state for the caller to send straight back to
// the dev panel without a second read.
export async function setSystemLockState(input: SetSystemLockInput): Promise<SystemLockState> {
  const reason = input.reason ?? null;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.systemLock.upsert({
      where: { id: SYSTEM_LOCK_ID },
      update: { isBlocked: input.isBlocked, reason, updatedBy: input.changedBy },
      create: { id: SYSTEM_LOCK_ID, isBlocked: input.isBlocked, reason, updatedBy: input.changedBy },
    });
    await tx.systemLockLog.create({
      data: { action: input.isBlocked ? "blocked" : "unblocked", reason, changedBy: input.changedBy },
    });
    return row;
  });
  return { isBlocked: updated.isBlocked, reason: updated.reason, updatedAt: updated.updatedAt, updatedBy: updated.updatedBy };
}
