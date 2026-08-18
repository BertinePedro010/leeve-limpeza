import { FormEvent, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { recover } from "../services/authService";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@festaflow.local");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try { await login(email, password); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Falha no login."); }
    finally { setLoading(false); }
  }

  async function reset() {
    const res = await recover(email);
    setMessage(res.message);
  }

  return <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl"><h1 className="text-2xl font-black text-white">FestaFlow</h1><p className="mt-1 text-sm text-slate-500">Acesso local com JWT e SQLite</p><label className="mt-8 block text-xs font-bold uppercase text-slate-500">Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500" /><label className="mt-4 block text-xs font-bold uppercase text-slate-500">Senha</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500" /><button disabled={loading} className="mt-6 w-full rounded-xl bg-indigo-600 py-3 text-sm font-black uppercase text-white disabled:opacity-60">{loading ? "Entrando..." : "Entrar"}</button><button type="button" onClick={reset} className="mt-3 w-full text-xs font-bold text-slate-500 hover:text-indigo-400">Recuperar senha</button>{message && <p className="mt-4 rounded-xl bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}<p className="mt-6 text-xs text-slate-600">Usuario inicial: admin@festaflow.local / admin123</p></form></div>;
}
