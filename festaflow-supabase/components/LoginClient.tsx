"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const EYE_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
);

const EYE_OFF_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
);

export default function LoginClient() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const result = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (result.error) return setMessage(result.error.message);
    router.push("/app");
    router.refresh();
  }

  async function resetPassword() {
    if (!email) return setMessage("Informe o email para recuperar a senha.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/app` });
    setMessage(error ? error.message : "Email de recuperacao enviado.");
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl"><h1 className="text-3xl font-black text-white">LeeveLimpeza</h1><p className="mt-2 text-sm text-slate-500">Autenticacao via Supabase Auth e dados no PostgreSQL.</p><label className="mt-8 block text-xs font-black uppercase tracking-wider text-slate-500">Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:border-indigo-500" /><label className="mt-4 block text-xs font-black uppercase tracking-wider text-slate-500">Senha</label><div className="relative mt-2"><input type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 pr-12 text-white outline-none focus:border-indigo-500" /><button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-indigo-400">{showPassword ? EYE_OFF_ICON : EYE_ICON}</button></div><button disabled={loading} className="mt-6 w-full rounded-xl bg-indigo-600 py-3 text-sm font-black uppercase text-white disabled:opacity-60">{loading ? "Processando..." : "Entrar"}</button><div className="mt-4 flex justify-end text-xs font-bold"><button type="button" onClick={resetPassword} className="text-slate-500 hover:text-indigo-400">Recuperar senha</button></div><p className="mt-3 text-center text-[11px] text-slate-600">Acesso apenas para usuarios cadastrados por um administrador.</p>{message && <p className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}</form></main>;
}