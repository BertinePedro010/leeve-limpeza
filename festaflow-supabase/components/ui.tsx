"use client";

import { useEffect, useRef, useState } from "react";

export const statusLabels: Record<string, string> = { pendente: "Agendado", confirmado: "Confirmado", em_andamento: "Em andamento", finalizado: "Realizado", cancelado: "Cancelado" };
export const money = (n: number | string) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dateOnly = (d?: string) => (d ? new Date(d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
// `Appointment.date` is a DB "date"-only column (no time/timezone) serialized
// as UTC midnight (e.g. "2026-08-25T00:00:00.000Z"). Formatting that with the
// viewer's local timezone shifts it back a calendar day for any timezone
// behind UTC (including Brazil, UTC-3) - found during QA of the redesigned
// OS PDF. Forcing timeZone: "UTC" reads back the exact calendar day that was
// stored, regardless of where the browser/server is running.
export const dateOnlyLabel = (d?: string) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-");

export const paymentMethodLabels: Record<string, string> = { pix: "PIX", credit_card: "Cartao de credito", debit_card: "Cartao de debito", cash: "Dinheiro" };
export const paymentMethodOptions: Array<[string, string]> = [["", "Nao informado"], ["pix", "PIX"], ["credit_card", "Cartao de credito"], ["debit_card", "Cartao de debito"], ["cash", "Dinheiro"]];

// A single, reused rule for turning the enum + legacy free-text field into a
// display string, so OS table, PDF, Financeiro and Relatorios never diverge.
export function paymentMethodLabel(order: { paymentMethod?: string | null; paymentMethodLegacy?: string | null }): string {
  if (order.paymentMethod) return paymentMethodLabels[order.paymentMethod] || order.paymentMethod;
  if (order.paymentMethodLegacy) return `${order.paymentMethodLegacy} (legado)`;
  return "-";
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Erro na API");
  return data;
}

export function Badge({ status }: { status: string }) {
  const colors: Record<string, string> = { pendente: "bg-blue-50 text-blue-700", confirmado: "bg-indigo-50 text-indigo-700", em_andamento: "bg-amber-50 text-amber-700", finalizado: "bg-emerald-50 text-emerald-700", cancelado: "bg-slate-100 text-slate-600", pago: "bg-emerald-50 text-emerald-700" };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${colors[status] || colors.pendente}`}>{statusLabels[status] || status.replace("_", " ")}</span>;
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-6 py-4"><h3 className="font-black text-slate-900">{title}</h3><button onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-black text-slate-500 hover:bg-slate-100">X</button></div><div className="max-h-[82vh] overflow-y-auto p-6">{children}</div></div></div>;
}

export function Stat({ label, value, tone = "indigo" }: { label: string; value: string | number; tone?: string }) {
  const color = tone === "rose" ? "text-rose-600 bg-rose-50" : tone === "emerald" ? "text-emerald-600 bg-emerald-50" : tone === "amber" ? "text-amber-600 bg-amber-50" : "text-indigo-600 bg-indigo-50";
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-3 rounded-xl px-3 py-2 text-xl font-black ${color}`}>{value}</p></div>;
}

export function CrudShell({ title, onNew, children }: { title: string; onNew: () => void; children: React.ReactNode }) {
  return <div className="space-y-5"><div className="flex justify-between"><h3 className="text-lg font-black">{title}</h3><button onClick={onNew} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Novo</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div></div>;
}
export function ActionButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return <div><button onClick={onEdit} className="mr-2 text-sm font-bold text-indigo-600">Editar</button><button onClick={onDelete} className="text-sm font-bold text-rose-600">Excluir</button></div>;
}
export function Input({ label, value, set, required, type = "text" }: { label: string; value: string; set: (v: string) => void; required?: boolean; type?: string }) {
  return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<input type={type} required={required} value={value} onChange={(e) => set(e.target.value)} className="rounded-xl border p-3 text-sm font-normal normal-case text-slate-800" /></label>;
}
export function NumberInput({ label, value, set }: { label: string; value: number; set: (v: number) => void }) {
  return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<input type="number" step="0.01" value={value} onChange={(e) => set(Number(e.target.value))} className="rounded-xl border p-3 text-sm font-normal text-slate-800" /></label>;
}
export function Text({ label, value, set }: { label: string; value: string; set: (v: string) => void }) {
  return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<textarea value={value} onChange={(e) => set(e.target.value)} className="rounded-xl border p-3 text-sm font-normal normal-case text-slate-800" /></label>;
}
export function Select({ value, set, options }: { value: string; set: (v: string) => void; options: Array<[string, string] | string[]> }) {
  return <select value={value} onChange={(e) => set(e.target.value)} className="rounded-xl border p-3 text-sm">{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}
export function Save() {
  return <button className="rounded-xl bg-indigo-600 p-3 font-black text-white">Salvar</button>;
}

type SelectableEmployee = { id: string; name: string; role: string };

// Dropdown + search + removable chips, replacing a plain toggle-button grid.
// Purely presentational: the set of `employees` passed in must already be
// branch-scoped by the caller (server-side validation of the final selection
// still happens in the API, this never becomes the source of truth).
export function EmployeeMultiSelect({ employees, selected, onChange }: { employees: SelectableEmployee[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? employees.filter((e) => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q)) : employees;
  const selectedEmployees = employees.filter((e) => selected.includes(e.id));

  return (
    <div ref={containerRef} className="relative grid gap-1">
      <span className="text-xs font-black uppercase text-slate-500">Funcionarios</span>
      <button type="button" onClick={() => setOpen((o) => !o)} className="min-h-[3rem] w-full rounded-xl border p-2.5 text-left text-sm">
        {selectedEmployees.length === 0
          ? <span className="p-1 text-slate-400">Selecionar funcionarios...</span>
          : <span className="flex flex-wrap gap-1.5">{selectedEmployees.map((e) => <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{e.name}<span role="button" tabIndex={0} onClick={(ev) => { ev.stopPropagation(); toggle(e.id); }} className="cursor-pointer text-indigo-400 hover:text-rose-600">×</span></span>)}</span>}
      </button>
      {open && <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white p-2 shadow-xl">
        {employees.length > 6 && <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou cargo..." className="mb-2 w-full rounded-lg border p-2 text-sm normal-case" />}
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 && <p className="p-2 text-xs text-slate-400">Nenhum funcionario encontrado.</p>}
          {filtered.map((e) => <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm normal-case hover:bg-slate-50"><input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} />{e.name} <span className="text-xs text-slate-400">({e.role})</span></label>)}
        </div>
      </div>}
    </div>
  );
}
