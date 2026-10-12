"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { api, ApiError } from "@/components/ui";

// Visual twin of components/LoginClient.tsx on purpose (same card/inputs/
// button), but reuses Supabase Auth, not a second password system. Logging
// in here only proves "this is a valid Supabase account" - it does NOT
// prove "this is the developer". The real authorization check happens
// server-side right after sign-in (GET /api/dev/system-lock, gated by
// requireDeveloper() in lib/dev-auth.ts): a non-developer who successfully
// signs in with their own real password is still signed back out
// immediately, so no non-developer session is ever left sitting on /dev.
export default function DevLoginClient() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setLoading(false);
      return setMessage(result.error.message);
    }
    try {
      await api("/api/dev/system-lock");
      router.push("/dev");
      router.refresh();
    } catch (err) {
      await supabase.auth.signOut();
      setLoading(false);
      setMessage(err instanceof ApiError ? err.message : "Acesso restrito ao desenvolvedor autorizado.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <h1 className="text-3xl font-black text-white">LeeveLimpeza</h1>
        <p className="mt-2 text-sm text-slate-500">Painel de desenvolvedor.</p>
        <label className="mt-8 block text-xs font-black uppercase tracking-wider text-slate-500">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:border-indigo-500" />
        <label className="mt-4 block text-xs font-black uppercase tracking-wider text-slate-500">Senha</label>
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:border-indigo-500" />
        <button disabled={loading} className="mt-6 w-full rounded-xl bg-indigo-600 py-3 text-sm font-black uppercase text-white disabled:opacity-60">
          {loading ? "Processando..." : "Entrar"}
        </button>
        <p className="mt-3 text-center text-[11px] text-slate-600">Acesso restrito ao desenvolvedor autorizado.</p>
        {message && <p className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}
      </form>
    </main>
  );
}
