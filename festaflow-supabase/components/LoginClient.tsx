"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginClient() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/app` } });
    setLoading(false);
    if (result.error) return setMessage(result.error.message);
    if (mode === "signup") return setMessage("Cadastro criado. Confirme o email caso o Supabase solicite.");
    router.push("/app");
    router.refresh();
  }

  async function resetPassword() {
    if (!email) return setMessage("Informe o email para recuperar a senha.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/app` });
    setMessage(error ? error.message : "Email de recuperacao enviado.");
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl"><h1 className="text-3xl font-black text-white">FestaFlow</h1><p className="mt-2 text-sm text-slate-500">Autenticacao via Supabase Auth e dados no PostgreSQL.</p><label className="mt-8 block text-xs font-black uppercase tracking-wider text-slate-500">Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:border-indigo-500" /><label className="mt-4 block text-xs font-black uppercase tracking-wider text-slate-500">Senha</label><input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:border-indigo-500" /><button disabled={loading} className="mt-6 w-full rounded-xl bg-indigo-600 py-3 text-sm font-black uppercase text-white disabled:opacity-60">{loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}</button><div className="mt-4 flex justify-between text-xs font-bold"><button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-indigo-400">{mode === "login" ? "Criar nova conta" : "Ja tenho conta"}</button><button type="button" onClick={resetPassword} className="text-slate-500 hover:text-indigo-400">Recuperar senha</button></div>{message && <p className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}</form></main>;
}