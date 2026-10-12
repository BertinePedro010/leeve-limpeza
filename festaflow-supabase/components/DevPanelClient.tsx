"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { api, ApiError } from "@/components/ui";

type LockLog = { id: string; action: "blocked" | "unblocked"; reason: string | null; changedBy: string | null; createdAt: string };
type LockState = { isBlocked: boolean; reason: string | null; updatedAt: string | null; updatedBy: string | null; history: LockLog[] };

const BLOCK_CONFIRM = "Tem certeza de que deseja bloquear o acesso ao LeeveLimpeza? Os usuários comuns perderão o acesso às funcionalidades do sistema até que o bloqueio seja removido.";
const UNBLOCK_CONFIRM = "Tem certeza de que deseja desbloquear o acesso ao LeeveLimpeza? Os usuários voltarão a ter acesso normal ao sistema.";

export default function DevPanelClient() {
  const supabase = createSupabaseBrowserClient();
  const [state, setState] = useState<LockState | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  // Disables both action buttons for the duration of a request - the only
  // guard needed against double-click/duplicate submissions here, since
  // there is exactly one authorized actor (the developer) and no list of
  // concurrent collaborators to race against.
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api<LockState>("/api/dev/system-lock"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nao foi possivel carregar o estado do sistema.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function applyAction(action: "block" | "unblock") {
    const confirmed = window.confirm(action === "block" ? BLOCK_CONFIRM : UNBLOCK_CONFIRM);
    if (!confirmed) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const next = await api<LockState>("/api/dev/system-lock", { method: "POST", body: JSON.stringify({ action, reason: reason || undefined }) });
      setState(next);
      setReason("");
      setSuccess(action === "block" ? "Sistema bloqueado com sucesso." : "Sistema desbloqueado com sucesso.");
    } catch (err) {
      // Preserves whatever state was already on screen - never shows
      // success for a write that actually failed on the server.
      setError(err instanceof ApiError ? err.message : "Nao foi possivel concluir a operacao agora. Tente novamente.");
    } finally {
      setActionLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    location.href = "/dev/login";
  }

  return (
    <div className="flex min-h-screen justify-center bg-slate-50 p-4 lg:p-8">
      <div className="w-full max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Painel de desenvolvedor</h1>
            <p className="text-sm text-slate-500">Controle de acesso do LeeveLimpeza</p>
          </div>
          <button onClick={logout} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black uppercase text-slate-500 hover:bg-slate-100">Sair</button>
        </div>

        {loading && <p className="text-sm text-slate-500">Carregando...</p>}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
        {success && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{success}</p>}

        {state && (
          <>
            <div className={`rounded-2xl border p-5 shadow-sm ${state.isBlocked ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
              <p className={`text-xs font-black uppercase tracking-wide ${state.isBlocked ? "text-rose-700" : "text-emerald-700"}`}>
                {state.isBlocked ? "Sistema bloqueado por pendência financeira" : "Sistema desbloqueado"}
              </p>
              {state.updatedAt && (
                <p className="mt-2 text-sm text-slate-600">
                  Última alteração: {new Date(state.updatedAt).toLocaleString("pt-BR")}
                  {state.updatedBy && ` — por ${state.updatedBy}`}
                </p>
              )}
              {state.reason && <p className="mt-1 text-sm text-slate-600">Motivo: {state.reason}</p>}
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <label className="block text-xs font-black uppercase tracking-wide text-slate-500">Motivo (opcional)</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-indigo-500" placeholder="Ex.: fatura de outubro em aberto" />
              <div className="mt-4 flex flex-wrap gap-3">
                <button disabled={actionLoading || state.isBlocked} onClick={() => applyAction("block")} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                  Bloquear sistema por falta de pagamento
                </button>
                <button disabled={actionLoading || !state.isBlocked} onClick={() => applyAction("unblock")} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                  Desbloquear sistema
                </button>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">Histórico</h2>
              {state.history.length === 0 && <p className="mt-2 text-sm text-slate-500">Nenhuma ação registrada ainda.</p>}
              <ul className="mt-3 space-y-2">
                {state.history.map((log) => (
                  <li key={log.id} className="rounded-xl border border-slate-100 p-3 text-sm text-slate-600">
                    <span className={`font-black ${log.action === "blocked" ? "text-rose-600" : "text-emerald-700"}`}>{log.action === "blocked" ? "Bloqueado" : "Desbloqueado"}</span>
                    {" — "}{new Date(log.createdAt).toLocaleString("pt-BR")}
                    {log.changedBy && ` — desenvolvedor (${log.changedBy})`}
                    {log.reason && <span className="block text-slate-500">Motivo: {log.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
