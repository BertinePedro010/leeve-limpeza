import { prisma } from "@/lib/prisma";
import { requireDeveloper, handleDevAuthError } from "@/lib/dev-auth";
import { getSystemLockState, setSystemLockState } from "@/lib/system-lock";
import { systemLockActionSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

// Exclusive to the developer account (requireDeveloper() - lib/dev-auth.ts).
// Never requireAuth()/requireGlobalAdmin(): this must stay reachable even
// while the system is blocked, and the developer is not required to have a
// Profile row at all. Also doubles as the "am I really the developer" check
// that DevLoginClient calls right after signInWithPassword succeeds.
export async function GET() {
  try {
    await requireDeveloper();
    const state = await getSystemLockState();
    const history = await prisma.systemLockLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return ok(serialize({ ...state, history }));
  } catch (error) {
    return handleDevAuthError(error);
  }
}

export async function POST(request: Request) {
  try {
    const dev = await requireDeveloper();
    const parsed = systemLockActionSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Dados invalidos.", 422);
    const state = await setSystemLockState({ isBlocked: parsed.data.action === "block", reason: parsed.data.reason, changedBy: dev.userId });
    return ok(serialize(state));
  } catch (error) {
    return handleDevAuthError(error);
  }
}
