"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, Modal, CrudShell, Input } from "@/components/ui";
import { useBranch } from "@/lib/branch-context";
import { MAX_BRANCHES, BRANCH_LIMIT_MESSAGE } from "@/lib/branch-limit";

type Branch = { id: string; name: string; city: string; state: string; active: boolean };
type BranchCount = { total: number; limit: number };
const blank = { name: "", city: "", state: "", active: true };

export default function BranchesView() {
  // Reuses the app-wide BranchContext list instead of keeping its own copy
  // fetched from the same /api/branches endpoint; refetch() re-pulls that
  // shared list after a create/edit so this screen still reflects its own
  // writes immediately.
  const { branches, refetch } = useBranch();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // Total REAL de filiais no banco (ativas + inativas), fonte da verdade para
  // o limite. `branches` do contexto traz so as ativas autorizadas e nao
  // serve para isso. O backend revalida de qualquer forma (409).
  const [count, setCount] = useState<BranchCount | null>(null);

  const loadCount = useCallback(async () => {
    try { setCount(await api<BranchCount>("/api/branches/count")); }
    catch { setCount(null); }
  }, []);
  useEffect(() => { loadCount(); }, [loadCount]);

  const limit = count?.limit ?? MAX_BRANCHES;
  const total = count?.total ?? branches.length;
  const limitReached = total >= limit;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    try {
      await api(editing ? `/api/branches/${editing.id}` : "/api/branches", { method: editing ? "PUT" : "POST", body: JSON.stringify(form) });
      setOpen(false);
      setSuccess(editing ? "Filial atualizada com sucesso!" : "Filial cadastrada com sucesso!");
      setEditing(null);
      await Promise.all([refetch(), loadCount()]);
    } catch (err) {
      // Mensagem especifica do backend (limite, nome duplicado, etc.) sobre
      // uma linha generica, sem quebrar a tela.
      const detail = err instanceof Error ? err.message : "";
      setError(editing ? `Nao foi possivel salvar a filial.${detail ? ` ${detail}` : ""}` : `Nao foi possivel cadastrar a filial.${detail ? ` ${detail}` : ""}`);
    }
  }

  function openNew() {
    if (limitReached) { setError(BRANCH_LIMIT_MESSAGE); setSuccess(""); return; }
    setEditing(null); setError(""); setSuccess(""); setForm(blank); setOpen(true);
  }

  return <div className="space-y-5">
    <p className="text-sm text-slate-500">Cadastro de filiais/cidades. Visivel apenas para o administrador global (acesso a todas as filiais).</p>
    <p className="text-xs font-black uppercase tracking-wide text-slate-400">{total} de {limit} filiais cadastradas</p>
    {success && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{success}</p>}
    {limitReached && <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-700">{BRANCH_LIMIT_MESSAGE}</p>}
    {error && !open && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
    <CrudShell title="Filiais" onNew={openNew} newDisabled={limitReached} newLabel={limitReached ? "Novo (limite atingido)" : "Novo"}>
      {branches.map((b) => <div key={b.id} className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-black">{b.name}</h3><button onClick={() => { setEditing(b); setError(""); setSuccess(""); setForm({ name: b.name, city: b.city, state: b.state, active: b.active }); setOpen(true); }} className="text-sm font-bold text-indigo-600">Editar</button></div>
        <p className="mt-2 text-sm text-slate-500">{b.city} - {b.state}</p>
        <p className={`mt-2 text-xs font-black uppercase ${b.active ? "text-emerald-600" : "text-rose-600"}`}>{b.active ? "Ativa" : "Inativa"}</p>
      </div>)}
    </CrudShell>
    {open && <Modal title={editing ? "Editar filial" : "Nova filial"} onClose={() => setOpen(false)}>
      <form onSubmit={submit} className="grid gap-3">
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
        <Input label="Nome" value={form.name} set={(v) => setForm({ ...form, name: v })} required />
        <Input label="Cidade" value={form.city} set={(v) => setForm({ ...form, city: v })} required />
        <Input label="UF" value={form.state} set={(v) => setForm({ ...form, state: v.toUpperCase().slice(0, 2) })} required />
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Filial ativa</label>
        <button className="rounded-xl bg-indigo-600 p-3 font-black text-white">Salvar</button>
      </form>
    </Modal>}
  </div>;
}
