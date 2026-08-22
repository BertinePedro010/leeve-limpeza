"use client";

import { FormEvent, useState } from "react";
import { api, Modal, CrudShell, Input } from "@/components/ui";
import { useBranch } from "@/lib/branch-context";

type Branch = { id: string; name: string; city: string; state: string; active: boolean };
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

  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      await api(editing ? `/api/branches/${editing.id}` : "/api/branches", { method: editing ? "PUT" : "POST", body: JSON.stringify(form) });
      setOpen(false); setEditing(null); await refetch();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar filial."); }
  }

  return <div className="space-y-5">
    <p className="text-sm text-slate-500">Cadastro de filiais/cidades. Visivel apenas para o administrador global (acesso a todas as filiais).</p>
    <CrudShell title="Filiais" onNew={() => { setEditing(null); setError(""); setForm(blank); setOpen(true); }}>
      {branches.map((b) => <div key={b.id} className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-black">{b.name}</h3><button onClick={() => { setEditing(b); setError(""); setForm({ name: b.name, city: b.city, state: b.state, active: b.active }); setOpen(true); }} className="text-sm font-bold text-indigo-600">Editar</button></div>
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
