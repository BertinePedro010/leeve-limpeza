"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Modal, Input, Save } from "@/components/ui";
import { useBranch } from "@/lib/branch-context";

type UserProfile = { id: string; name: string; email: string; role: string; allowedModules: string[]; deletedAt: string | null; branches: Array<{ branchId: string }> };

const MODULES: Array<[string, string]> = [["clients", "Clientes"], ["employees", "Funcionarios"], ["services", "Servicos"], ["orders", "Ordens de Servico"], ["calendar", "Calendario"], ["finance", "Financeiro"], ["reports", "Relatorios"]];
const ROLES: Array<[string, string]> = [["funcionario", "Funcionario"], ["operador", "Operador"], ["admin", "Administrador"]];

const blank = { name: "", email: "", password: "", role: "funcionario", active: true, branchIds: [] as string[], allowedModules: [] as string[] };

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// Admin-only: create/edit login users, their role, active status, branch
// access and module permissions. Every write here is re-validated server-side
// by requireGlobalAdmin + requireModule (see lib/authz.ts) - this UI only
// hides/shows controls, it is never itself the authorization boundary.
export default function UsersView() {
  // Branch list is already loaded once for the whole app in BranchContext
  // (same /api/branches endpoint, same auth-scoped filter) - reusing it here
  // avoids a second, redundant fetch every time this tab is opened.
  const { branches } = useBranch();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  async function load() {
    try {
      setUsers(await api<UserProfile[]>("/api/users"));
      setLoadError("");
    } catch (err) { setLoadError(err instanceof Error ? err.message : "Erro ao carregar usuarios."); }
  }
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      if (editing) {
        await api(`/api/users/${editing.id}`, { method: "PUT", body: JSON.stringify({ name: form.name, role: form.role, active: form.active, branchIds: form.branchIds, allowedModules: form.allowedModules }) });
      } else {
        await api("/api/users", { method: "POST", body: JSON.stringify({ name: form.name, email: form.email, password: form.password, role: form.role, branchIds: form.branchIds, allowedModules: form.allowedModules }) });
      }
      setOpen(false); setEditing(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar usuario."); }
  }

  async function resetPassword(id: string) {
    const password = prompt("Nova senha temporaria (minimo 6 caracteres):");
    if (!password) return;
    try { await api(`/api/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }); alert("Senha redefinida."); }
    catch (err) { alert(err instanceof Error ? err.message : "Erro ao redefinir senha."); }
  }

  function openEdit(u: UserProfile) {
    setEditing(u); setError("");
    setForm({ name: u.name, email: u.email, password: "", role: u.role, active: !u.deletedAt, branchIds: u.branches.map((b) => b.branchId), allowedModules: u.allowedModules });
    setOpen(true);
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name || id;

  return <div className="space-y-5">
    <p className="text-sm text-slate-500">Cadastro de usuarios do sistema, com filiais e modulos permitidos por usuario. Visivel apenas para o administrador global.</p>
    {loadError && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{loadError}</p>}
    <div className="flex justify-between"><h3 className="text-lg font-black">Usuarios</h3><button onClick={() => { setEditing(null); setError(""); setForm(blank); setOpen(true); }} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Novo usuario</button></div>
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Filiais</th><th>Modulos</th><th className="p-4 text-right">Acoes</th></tr></thead>
      <tbody>{users.map((u) => <tr key={u.id} className="border-t"><td className="p-4 font-bold">{u.name}</td><td className="text-xs">{u.email}</td><td className="text-xs uppercase">{u.role}</td><td>{u.deletedAt ? <span className="text-xs font-black text-rose-600">Inativo</span> : <span className="text-xs font-black text-emerald-600">Ativo</span>}</td><td className="text-xs">{u.branches.map((b) => branchName(b.branchId)).join(", ") || "-"}</td><td className="text-xs">{u.role === "admin" ? "Todos" : (u.allowedModules.join(", ") || "-")}</td><td className="p-4 text-right"><button onClick={() => openEdit(u)} className="mr-2 font-bold text-indigo-600">Editar</button><button onClick={() => resetPassword(u.id)} className="font-bold text-slate-600">Redefinir senha</button></td></tr>)}</tbody>
    </table></div>
    {open && <Modal title={editing ? `Editar ${editing.name}` : "Novo usuario"} onClose={() => setOpen(false)}>
      <form onSubmit={submit} className="grid gap-3">
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
        <Input label="Nome" value={form.name} set={(v) => setForm({ ...form, name: v })} required />
        {editing
          ? <p className="grid gap-1 text-xs font-black uppercase text-slate-500">E-mail<span className="text-sm font-normal normal-case text-slate-800">{form.email}</span></p>
          : <Input label="E-mail" type="email" value={form.email} set={(v) => setForm({ ...form, email: v })} required />}
        {!editing && <Input label="Senha temporaria" type="password" value={form.password} set={(v) => setForm({ ...form, password: v })} required />}
        <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Perfil<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-xl border p-3 text-sm normal-case">{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Usuario ativo</label>
        <div className="rounded-2xl bg-slate-50 p-4"><h4 className="font-black">Filiais</h4><div className="mt-2 flex flex-wrap gap-3">{branches.map((b) => <label key={b.id} className="flex items-center gap-2 text-sm normal-case"><input type="checkbox" checked={form.branchIds.includes(b.id)} onChange={() => setForm({ ...form, branchIds: toggle(form.branchIds, b.id) })} />{b.name}</label>)}</div></div>
        <div className="rounded-2xl bg-slate-50 p-4"><h4 className="font-black">Modulos permitidos</h4>{form.role === "admin" ? <p className="mt-2 text-xs text-slate-500">Administradores tem acesso a todos os modulos automaticamente.</p> : <div className="mt-2 grid gap-2 sm:grid-cols-2">{MODULES.map(([v, l]) => <label key={v} className="flex items-center gap-2 text-sm normal-case"><input type="checkbox" checked={form.allowedModules.includes(v)} onChange={() => setForm({ ...form, allowedModules: toggle(form.allowedModules, v) })} />{l}</label>)}</div>}</div>
        <Save />
      </form>
    </Modal>}
  </div>;
}
