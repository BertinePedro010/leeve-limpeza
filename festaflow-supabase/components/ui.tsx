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

// Carries the server's `field` hint (see lib/json.ts fail()) alongside the
// message, so a form can scroll to and highlight the exact control that
// failed validation instead of only showing a generic error banner.
export class ApiError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message || "Erro na API", data?.field);
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
export function Input({ label, value, set, required, type = "text", id, error }: { label: string; value: string; set: (v: string) => void; required?: boolean; type?: string; id?: string; error?: boolean }) {
  return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<input id={id} type={type} required={required} value={value} onChange={(e) => set(e.target.value)} className={`rounded-xl border p-3 text-sm font-normal normal-case text-slate-800 ${error ? "border-rose-500 ring-1 ring-rose-500" : ""}`} /></label>;
}
export function NumberInput({ label, value, set }: { label: string; value: number; set: (v: number) => void }) {
  return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<input type="number" step="0.01" value={value} onChange={(e) => set(Number(e.target.value))} className="rounded-xl border p-3 text-sm font-normal text-slate-800" /></label>;
}
export function Text({ label, value, set }: { label: string; value: string; set: (v: string) => void }) {
  return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<textarea value={value} onChange={(e) => set(e.target.value)} className="rounded-xl border p-3 text-sm font-normal normal-case text-slate-800" /></label>;
}
export function Select({ value, set, options, id, error }: { value: string; set: (v: string) => void; options: Array<[string, string] | string[]>; id?: string; error?: boolean }) {
  return <select id={id} value={value} onChange={(e) => set(e.target.value)} className={`rounded-xl border p-3 text-sm ${error ? "border-rose-500 ring-1 ring-rose-500" : ""}`}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}
export function Save() {
  return <button className="rounded-xl bg-indigo-600 p-3 font-black text-white">Salvar</button>;
}

export type CepAddress = { cep: string; street: string; neighborhood: string; city: string; state: string };

export const brazilStateOptions: Array<[string, string]> = [
  ["", "UF"], ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapa"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceara"],
  ["DF", "Distrito Federal"], ["ES", "Espirito Santo"], ["GO", "Goias"], ["MA", "Maranhao"], ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Para"], ["PB", "Paraiba"], ["PR", "Parana"],
  ["PE", "Pernambuco"], ["PI", "Piaui"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"],
  ["RO", "Rondonia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "Sao Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
];

// ViaCEP always returns the 2-letter UF already, but a defensive fallback in
// case a different CEP provider ever returns the full state name instead -
// looks it up against the same list the state <select> uses, so the two
// never drift out of sync.
export function normalizeStateToUf(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 2) return trimmed.toUpperCase();
  const found = brazilStateOptions.find(([, name]) => name.toLowerCase() === trimmed.toLowerCase());
  return found ? found[0] : trimmed.toUpperCase().slice(0, 2);
}

// Keeps the CEP input masked as the user types/pastes, accepting input with
// or without the dash (or any other stray characters) - only the digits
// matter for both display and the lookup below.
export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

// Free public lookup (no API key/secret involved) - used directly from the
// browser exactly as ViaCEP's own docs recommend. Kept separate from the
// component so it can be unit-tested without rendering anything.
export async function fetchCepAddress(cep: string): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, "");
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) throw new Error("viacep_unavailable");
  const data = await res.json();
  if (data.erro) return null;
  return { cep: formatCep(digits), street: data.logradouro || "", neighborhood: data.bairro || "", city: data.localidade || "", state: normalizeStateToUf(data.uf || "") };
}

// CEP input with autofill: Enter or the search button look up the address
// via ViaCEP and hand the result to `onFound` for the caller to merge into
// its own address field(s) - this component never assumes where the result
// should land, so it stays reusable across OS/client forms.
export function CepField({ value, onChange, onFound, id, label = "CEP" }: { value: string; onChange: (v: string) => void; onFound: (address: CepAddress) => void; id?: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const lastLookedUpRef = useRef("");

  async function lookup() {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8 || loading || lastLookedUpRef.current === digits) return;
    lastLookedUpRef.current = digits;
    setLoading(true);
    setNotice(null);
    try {
      const address = await fetchCepAddress(digits);
      if (!address) { setNotice({ tone: "error", text: "CEP nao encontrado. Verifique o numero informado." }); return; }
      onChange(address.cep);
      onFound(address);
    } catch {
      setNotice({ tone: "error", text: "Nao foi possivel consultar o CEP. Preencha o endereco manualmente." });
    } finally {
      setLoading(false);
    }
  }

  function handleChange(raw: string) {
    lastLookedUpRef.current = "";
    setNotice(null);
    onChange(formatCep(raw));
  }

  return (
    <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
      {label}
      <div className="flex gap-2">
        <input
          id={id}
          inputMode="numeric"
          placeholder="00000-000"
          maxLength={9}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }}
          className="w-full rounded-xl border p-3 text-sm font-normal normal-case text-slate-800"
        />
        <button type="button" onClick={lookup} disabled={loading} className="shrink-0 rounded-xl bg-slate-100 px-3 text-sm font-black normal-case text-slate-700 disabled:opacity-60">
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>
      {loading && <span className="text-[11px] font-normal normal-case text-slate-400">Buscando endereco...</span>}
      {notice && <span className={`text-[11px] font-normal normal-case ${notice.tone === "error" ? "text-rose-600" : "text-slate-500"}`}>{notice.text}</span>}
    </label>
  );
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
