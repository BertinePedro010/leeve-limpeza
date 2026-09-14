import { redirect } from "next/navigation";
import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase/server";

// Thrown when Supabase Auth itself could not be validated (5xx from the Auth
// service, or a network-level failure with no HTTP status at all) - this is
// NOT proof the session is invalid, only that we couldn't currently check it.
// Callers must never treat this the same as "no session": a transient Auth
// outage must not log a real, logged-in user out. Only a genuine 401/403
// from Auth (see isInvalidSession below) means the session itself is bad.
export class AuthServiceUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AuthServiceUnavailableError";
  }
}

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // Only a genuine 5xx from the Auth REST API, or a network-level failure
    // that never got an HTTP response at all (isAuthRetryableFetchError),
    // counts as "Auth is temporarily unavailable". Everything else -
    // including no session at all (AuthSessionMissingError, status 400,
    // thrown on every anonymous/logged-out request) and real 401/403s -
    // means the session itself is missing/invalid. Default stays the old,
    // safe behavior (treat as no session) unless there is positive evidence
    // otherwise - the inverse (defaulting to "service unavailable") was
    // tried first and wrongly turned every anonymous request into a 503;
    // caught via curl smoke test before this shipped.
    const isServiceIssue = (isAuthApiError(error) && error.status >= 500) || isAuthRetryableFetchError(error);
    if (isServiceIssue) throw new AuthServiceUnavailableError(error.message, error);
    return null;
  }
  if (!data.user) return null;
  return data.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
