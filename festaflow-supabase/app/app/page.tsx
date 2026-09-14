import { requireUser, AuthServiceUnavailableError } from "@/lib/auth";
import SaasApp from "@/components/SaasApp";
import { AppErrorBoundary } from "@/components/ErrorBoundary";

export default async function AppPage() {
  try {
    await requireUser();
  } catch (error) {
    // A transient Supabase Auth outage (5xx/network) must show a retry
    // message, never redirect to /login or drop the session - only a real
    // "no session" case goes through requireUser()'s own redirect("/login"),
    // which throws Next's internal NEXT_REDIRECT signal and must keep
    // propagating unchanged (the `throw error` below).
    if (error instanceof AuthServiceUnavailableError) {
      console.error("[auth] Supabase Auth unavailable while loading /app:", { status: 503, endpoint: "auth.getUser", errorType: error.name, message: error.message });
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 p-8 text-center">
          <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-black text-slate-900">Nao foi possivel validar sua sessao agora</h1>
            <p className="mt-3 text-sm text-slate-500">Tente novamente em instantes.</p>
          </div>
        </div>
      );
    }
    throw error;
  }
  return (
    <AppErrorBoundary>
      <SaasApp />
    </AppErrorBoundary>
  );
}
