import { getCurrentUser, AuthServiceUnavailableError } from "@/lib/auth";
import { fail } from "@/lib/json";

// Deliberately separate from lib/authz.ts: the developer account is a third
// tier above "global admin", identified ONLY by an exact match against the
// server-only DEVELOPER_USER_ID env var - never by role, user_metadata,
// email, or any Profile field. The developer is not required to have a
// Profile row at all (see prisma/schema.prisma SystemLockLog comment), so
// this never touches prisma.profile.

// Pure comparison, exported so it is unit-testable without mocking Prisma or
// Supabase, and reused both by requireDeveloper() below and by the
// block-bypass check inside lib/authz.ts's resolveAuth() - one single
// source of truth for "who is the developer".
export function isDeveloperUserId(userId: string | null | undefined, developerUserId = process.env.DEVELOPER_USER_ID): boolean {
  return !!developerUserId && !!userId && userId === developerUserId;
}

export class DevAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface DevAuthContext {
  userId: string;
}

export async function requireDeveloper(): Promise<DevAuthContext> {
  // Missing config never grants access - and never blocks the rest of the
  // app either (see lib/system-lock.ts getSystemLockState default).
  const developerUserId = process.env.DEVELOPER_USER_ID;
  if (!developerUserId) {
    throw new DevAuthError("Recurso de desenvolvedor nao configurado neste ambiente.", 503);
  }
  let user: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof AuthServiceUnavailableError) {
      console.error("[dev-auth] Supabase Auth unavailable while validating developer session:", { status: 503, endpoint: "auth.getUser", errorType: error.name, message: error.message });
      throw new DevAuthError("Nao foi possivel validar sua sessao agora. Tente novamente.", 503);
    }
    throw error;
  }
  if (!user) {
    throw new DevAuthError("Sessao expirada ou invalida. Faca login novamente.", 401);
  }
  if (!isDeveloperUserId(user.id, developerUserId)) {
    throw new DevAuthError("Acesso restrito ao desenvolvedor autorizado.", 403);
  }
  return { userId: user.id };
}

// Mirrors handleAuthzError (lib/authz.ts) - every /api/dev/** route funnels
// its catch block through here so the frontend always gets clean JSON, never
// a framework default HTML/empty 500, and nothing sensitive (tokens,
// cookies, the env var's value) ever leaves this function.
export function handleDevAuthError(error: unknown) {
  if (error instanceof DevAuthError) return fail(error.message, error.status);
  console.error("[dev-auth] unexpected error:", error);
  return fail("Nao foi possivel concluir a operacao agora. Tente novamente.", 500);
}
