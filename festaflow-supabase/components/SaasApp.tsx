"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { BranchProvider, useBranch } from "@/lib/branch-context";
import { statusLabels, money, dateOnly, dateOnlyLabel, api, ApiError, Badge, Modal, Stat, CrudShell, ActionButtons, Input, NumberInput, Text, Select, Save, paymentMethodLabel, paymentMethodOptions, EmployeeMultiSelect, CepField, brazilStateOptions, MultiDatePicker, focusFormField, FieldErrorSummary } from "@/components/ui";
import { hasStructuredOrderAddress, evaluateClientAddress, clientAddressErrorMessage, type ClientAddressState } from "@/lib/order-address";
import { hasStructuredClientAddress } from "@/lib/client-address";
import { isDuplicateClient, DUPLICATE_CLIENT_MESSAGE } from "@/lib/client-dedupe";
import ReportsView from "@/components/ReportsView";
import BranchesView from "@/components/BranchesView";
import UsersView from "@/components/UsersView";
import { normalizeWhatsappPhone, buildOrderWhatsappMessage, buildWhatsappShareUrl } from "@/lib/whatsapp";

type Tab = "dashboard" | "clients" | "employees" | "services" | "orders" | "calendar" | "finance" | "reports" | "branches" | "users";
export type Client = { id: string; name: string; email?: string; phone?: string; document?: string; address?: string; addressZip?: string | null; addressStreet?: string | null; addressNumber?: string | null; addressNeighborhood?: string | null; addressCity?: string | null; addressState?: string | null; addressReference?: string | null; notes?: string };
export type Employee = { id: string; name: string; role: string; phone?: string; dailyRate: string | number; paymentType: string; notes?: string };
export type Service = { id: string; name: string; description?: string; price: string | number; durationHours: string | number; category: string; active: boolean };
type OrderItem = { id?: string; serviceId: string; quantity: number; unitPrice: string | number; service?: Service };
type OrderEmployee = { employee: Employee };
type Appointment = { id: string; orderId: string; branchId: string; employeeId?: string | null; employee?: { id: string; name: string } | null; date: string; startTime: string; endTime: string; status: string; notes?: string | null; cancellationReason?: string | null };
type Branch = { id: string; name: string; city: string };
type Order = { id: string; code: string; clientId: string; client?: Client; branch?: Branch; eventDate: string; startTime: string; endTime: string; location: string; addressZip?: string | null; addressStreet?: string | null; addressNumber?: string | null; addressNeighborhood?: string | null; addressCity?: string | null; addressState?: string | null; addressReference?: string | null; status: string; paymentMethod?: string | null; paymentMethodLegacy?: string | null; notes?: string; signatureName?: string; signatureDate?: string; totalAmount: string | number; items: OrderItem[]; employees: OrderEmployee[]; appointments: Appointment[] };
type Transaction = { id: string; type: "receita" | "despesa"; category: string; description: string; amount: string | number; dueDate: string; paidAt?: string; status: "pago" | "pendente"; orderId?: string; paymentMethod?: string | null; isAutoRevenue?: boolean };
type OccurrenceBucket = { count: number; total: number };
type Dashboard = { revenue: number; expenses: number; profit: number; receivable: number; payable: number; clients: number; employees: number; services: number; orders: number; activeOrders: number; completedOrders: number; principalOrders: { count: number }; occurrences: { total: OccurrenceBucket; scheduled: OccurrenceBucket; confirmed: OccurrenceBucket; finalized: OccurrenceBucket }; upcomingOrders: Order[] };
type Me = { id: string; name: string; email: string; role: string; allowedModules: string[]; isGlobalAdmin: boolean };
type SendChannel = "email" | "whatsapp";

const nav: Array<[Tab, string]> = [["dashboard", "Dashboard"], ["orders", "Ordens de Servico"], ["calendar", "Calendario"], ["clients", "Clientes"], ["employees", "Funcionarios"], ["services", "Servicos"], ["finance", "Financeiro"], ["reports", "Relatorios"]];

// Client-side nav filtering is UX only (hide tabs the user can't use) - the
// real enforcement is requireModule() on every API route (lib/authz.ts), so
// this never needs to be kept airtight against someone editing the DOM.
// While `me` hasn't loaded yet, show every tab rather than flashing down to
// just Dashboard - the very first API call from any hidden tab still gets
// rejected server-side if it turns out the user can't use it.
function canUseModule(me: Me | null, id: Tab): boolean {
  if (id === "dashboard" || id === "branches" || id === "users") return true;
  if (!me) return true;
  return me.role === "admin" || me.allowedModules.includes(id);
}

function BranchSwitcher() {
  const { branches, activeBranchId, setActiveBranchId, loading } = useBranch();
  if (loading) return <p className="px-4 text-[10px] font-black uppercase text-slate-600">Carregando filiais...</p>;
  if (branches.length === 0) return <p className="px-4 text-[10px] font-black uppercase text-rose-400">Sem filial vinculada</p>;
  return <div className="px-4"><label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Filial ativa</label><select value={activeBranchId ?? ""} onChange={(e) => setActiveBranchId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-sm font-bold text-white outline-none focus:border-indigo-500">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>;
}

export default function SaasApp() {
  return <BranchProvider><SaasAppShell /></BranchProvider>;
}

function SaasAppShell() {
  const supabase = createSupabaseBrowserClient();
  const { activeBranchId, activeBranch, branches, loading: branchLoading } = useBranch();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  // "Editar cliente" from inside an OS form: jump to the Clientes tab with
  // that client's editor open, then let the user come back to the OS. No
  // second registration screen - it reuses ClientsView's existing modal.
  const [pendingClientEditId, setPendingClientEditId] = useState<string | null>(null);
  const goEditClient = useCallback((clientId: string) => { setPendingClientEditId(clientId); setTab("clients"); }, []);
  const activeBranchIdRef = useRef(activeBranchId);
  useEffect(() => { activeBranchIdRef.current = activeBranchId; }, [activeBranchId]);
  useEffect(() => { api<Me>("/api/me").then(setMe).catch(() => {}); }, []);

  // Each fetch is caught independently - a user restricted from one module
  // (e.g. no "finance") gets a 403 on just that call. Without the per-call
  // .catch(), Promise.all would reject as a whole and leave every OTHER
  // module's data empty too, breaking the whole shell for a partially
  // restricted user instead of just hiding the one module they can't use.
  async function loadAll() {
    const requestedBranchId = activeBranchId;
    if (!requestedBranchId) return;
    const qs = `?branchId=${requestedBranchId}`;
    const [c, e, s, o, t, d] = await Promise.all([
      api<Client[]>(`/api/clients${qs}`).catch(() => [] as Client[]),
      api<Employee[]>(`/api/employees${qs}`).catch(() => [] as Employee[]),
      api<Service[]>(`/api/services${qs}`).catch(() => [] as Service[]),
      api<Order[]>(`/api/orders${qs}`).catch(() => [] as Order[]),
      api<Transaction[]>(`/api/transactions${qs}`).catch(() => [] as Transaction[]),
      api<Dashboard>(`/api/dashboard${qs}`).catch(() => null),
    ]);
    if (activeBranchIdRef.current !== requestedBranchId) return; // a newer branch switch already superseded this fetch
    setClients(c); setEmployees(e); setServices(s); setOrders(o); setTransactions(t); setDashboard(d);
  }

  // Refreshes Financeiro/Dashboard in the background after an OS save -
  // never awaited by the caller. Billing sync (lib/billing.ts) can change
  // revenue even when the edit didn't obviously look financial (e.g. status
  // moved to/from "finalizado"), so this always runs, it just doesn't block
  // the modal closing: the OS write itself is already durable by the time
  // this fires, and Financeiro/Dashboard are secondary views that can catch
  // up a moment later without the user ever being blocked on them.
  function refreshFinanceInBackground() {
    const requestedBranchId = activeBranchId;
    if (!requestedBranchId) return;
    const qs = `?branchId=${requestedBranchId}`;
    Promise.all([
      api<Transaction[]>(`/api/transactions${qs}`).catch(() => null),
      api<Dashboard>(`/api/dashboard${qs}`).catch(() => null),
    ]).then(([t, d]) => {
      if (activeBranchIdRef.current !== requestedBranchId) return;
      if (t) setTransactions(t);
      if (d) setDashboard(d);
    });
  }

  // Applies an order the server just confirmed saved (create or edit),
  // without the full loadAll() round-trip that used to follow every OS save.
  // Saving an OS can only ever affect orders/transactions/dashboard - never
  // clients, employees, or services (the API routes never write those
  // tables) - so this is not a "lighter reload", it is the complete set of
  // data an OS save can actually change. `saved` is the API's own response
  // (the just-written row, read back inside the same transaction), never a
  // client-side guess, so splicing it in directly is not an optimistic
  // update - the write is already confirmed by the time this runs.
  async function applyOrderSaved(saved: Order) {
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === saved.id);
      const next = idx === -1 ? [...prev, saved] : prev.map((o, i) => (i === idx ? saved : o));
      return next.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    });
    refreshFinanceInBackground();
  }

  useEffect(() => {
    if (!activeBranchId) return;
    setClients([]); setEmployees([]); setServices([]); setOrders([]); setTransactions([]); setDashboard(null);
    setDataLoading(true);
    loadAll().catch((err) => setMessage(err.message)).finally(() => setDataLoading(false));
  }, [activeBranchId]);

  async function logout() { await supabase.auth.signOut(); location.href = "/login"; }

  if (!branchLoading && branches.length === 0) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 p-8 text-center"><div className="max-w-md rounded-2xl border border-rose-200 bg-white p-8 shadow-sm"><h1 className="text-xl font-black text-slate-900">Nenhuma filial vinculada</h1><p className="mt-3 text-sm text-slate-500">Sua conta ainda nao tem acesso a nenhuma filial. Contate um administrador para vincular seu usuario a uma filial.</p><button onClick={logout} className="mt-6 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Sair</button></div></div>;
  }

  const filteredNav = nav.filter(([id]) => canUseModule(me, id));
  const visibleNav = me?.isGlobalAdmin ? [...filteredNav, ["users", "Usuarios"] as [Tab, string], ["branches", "Filiais"] as [Tab, string]] : filteredNav;
  return <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
    {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden" />}
    <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-slate-950 text-slate-300 transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}><div className="flex items-center justify-between border-b border-slate-800 p-6"><div><h1 className="text-2xl font-black text-white">LeeveLimpeza</h1><p className="text-xs text-slate-500">Supabase PostgreSQL</p></div><button onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" className="rounded-lg p-1 text-slate-500 hover:bg-slate-900 hover:text-white lg:hidden">✕</button></div><div className="border-b border-slate-800 py-4"><BranchSwitcher /></div><nav className="flex-1 space-y-1 overflow-y-auto p-4">{visibleNav.map(([id, label]) => <button key={id} onClick={() => { setTab(id); setSidebarOpen(false); }} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${tab === id ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}>{label}</button>)}</nav><div className="border-t border-slate-800 p-4"><button onClick={logout} className="w-full rounded-xl border border-slate-800 py-2 text-xs font-black uppercase text-slate-400 hover:bg-slate-900">Sair</button></div></aside>
    <main className="flex-1 overflow-y-auto"><header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur lg:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><button onClick={() => setSidebarOpen(true)} aria-label="Abrir menu" className="rounded-xl border border-slate-200 p-2 text-slate-600 lg:hidden">☰</button><div><h2 className="text-xl font-black">{visibleNav.find(([id]) => id === tab)?.[1]}</h2><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{activeBranch?.name || "Selecione uma filial"}</p>{message && <p className="text-xs text-rose-600">{message}</p>}</div></div>{canUseModule(me, "orders") && <button onClick={() => setTab("orders")} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">Nova OS</button>}</div></header><section className="p-4 lg:p-8">{tab === "dashboard" && <DashboardView dashboard={dashboard} />}{tab === "clients" && <ClientsView data={clients} branchId={activeBranchId} reload={loadAll} loading={dataLoading} openClientId={pendingClientEditId} onOpenClientHandled={() => setPendingClientEditId(null)} />}{tab === "employees" && <EmployeesView data={employees} branchId={activeBranchId} reload={loadAll} loading={dataLoading} />}{tab === "services" && <ServicesView data={services} branchId={activeBranchId} reload={loadAll} loading={dataLoading} />}{tab === "orders" && <OrdersView orders={orders} clients={clients} employees={employees} services={services} branchId={activeBranchId} reload={loadAll} onOrderSaved={applyOrderSaved} loading={dataLoading} onEditClient={goEditClient} />}{tab === "calendar" && <CalendarView branchId={activeBranchId} employees={employees} clients={clients} services={services} orders={orders} reload={loadAll} onOrderSaved={applyOrderSaved} onEditClient={goEditClient} />}{tab === "finance" && <FinanceView data={transactions} orders={orders} employees={employees} clients={clients} services={services} branchId={activeBranchId} reload={loadAll} onOrderSaved={applyOrderSaved} loading={dataLoading} onEditClient={goEditClient} />}{tab === "reports" && <ReportsView employees={employees} services={services} isGlobalAdmin={!!me?.isGlobalAdmin} />}{tab === "branches" && <BranchesView />}{tab === "users" && <UsersView />}</section></main>
  </div>;
}

// One card per OCCURRENCE bucket: Quantidade (linhas de appointments com esse
// status) + Valor total (soma do valor da OS pai de cada ocorrencia). Tudo
// vem pronto de GET /api/dashboard (uma query agrupada no Postgres, ja
// escopada por filial) - nada e contado ou somado no cliente. Cores distintas
// para "Total", "Agendadas", "Confirmadas" e "Realizadas" nunca lerem igual.
function OccurrenceCard({ label, bucket, tone }: { label: string; bucket: OccurrenceBucket; tone: "slate" | "blue" | "emerald" | "violet" }) {
  const styles = {
    slate: "border-slate-300 bg-slate-50 text-slate-800",
    blue: "border-blue-200 bg-blue-50/60 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-700",
    violet: "border-violet-200 bg-violet-50/60 text-violet-700",
  }[tone];
  return <div className={`rounded-2xl border p-5 shadow-sm ${styles}`}>
    <p className="text-[10px] font-black uppercase tracking-wider">{label}</p>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
      <div><p className="text-[10px] font-black uppercase opacity-70">Quantidade</p><p className="text-2xl font-black">{bucket.count}</p></div>
      <div className="text-right"><p className="text-[10px] font-black uppercase opacity-70">Valor total</p><p className="text-lg font-black">{money(bucket.total)}</p></div>
    </div>
  </div>;
}

const EMPTY_BUCKET: OccurrenceBucket = { count: 0, total: 0 };

// Datas adicionais, atendimentos e recorrencias sao TODOS `appointments`
// (ocorrencias) - por isso a contagem aqui e por ocorrencia, nao por OS. A OS
// principal continua num indicador proprio (quantidade de ServiceOrder).
function OrderTotalsSection({ dashboard }: { dashboard: Dashboard }) {
  const occ = dashboard.occurrences ?? { total: EMPTY_BUCKET, scheduled: EMPTY_BUCKET, confirmed: EMPTY_BUCKET, finalized: EMPTY_BUCKET };
  return <div className="rounded-2xl border bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-black">Totais de ocorrencias da filial</h3>
      <p className="text-xs font-bold text-slate-500">OS principais: <span className="font-black text-slate-800">{dashboard.principalOrders?.count ?? 0}</span></p>
    </div>
    <p className="mt-1 text-xs text-slate-400">Cada data/atendimento (principal, adicional ou recorrencia) conta como 1 ocorrencia e herda o valor da OS. Canceladas e OS excluidas ficam de fora.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <OccurrenceCard label="Total de ocorrencias" bucket={occ.total} tone="slate" />
      <OccurrenceCard label="Ocorrencias Agendadas" bucket={occ.scheduled} tone="blue" />
      <OccurrenceCard label="Ocorrencias Confirmadas" bucket={occ.confirmed} tone="emerald" />
      <OccurrenceCard label="Ocorrencias Realizadas" bucket={occ.finalized} tone="violet" />
    </div>
  </div>;
}

function DashboardView({ dashboard }: { dashboard: Dashboard | null }) {
  if (!dashboard) return <p>Carregando...</p>;
  return <div className="space-y-6"><div className="grid gap-4 md:grid-cols-4"><Stat label="Faturamento" value={money(dashboard.revenue)} /><Stat label="Lucro" value={money(dashboard.profit)} tone="emerald" /><Stat label="OS ativas" value={dashboard.activeOrders} tone="amber" /><Stat label="Eventos concluidos" value={dashboard.completedOrders} /></div><OrderTotalsSection dashboard={dashboard} /><div className="grid gap-6 lg:grid-cols-3"><div className="rounded-2xl border bg-white p-6 shadow-sm lg:col-span-2"><h3 className="font-black">Resumo financeiro</h3><div className="mt-5 grid gap-4 md:grid-cols-2"><Stat label="Despesas" value={money(dashboard.expenses)} tone="rose" /><Stat label="Contas a receber" value={money(dashboard.receivable)} /><Stat label="Contas a pagar" value={money(dashboard.payable)} tone="amber" /><Stat label="Eventos" value={dashboard.orders} /></div></div><div className="rounded-2xl border bg-white p-6 shadow-sm"><h3 className="font-black">Proximos eventos</h3><div className="mt-4 space-y-3">{dashboard.upcomingOrders.map((o) => <div key={o.id} className="rounded-xl border p-3"><div className="flex justify-between"><b>{o.code}</b><Badge status={o.status} /></div><p className="mt-1 text-xs text-slate-500">{new Date(o.eventDate).toLocaleDateString("pt-BR")} - {o.client?.name}</p></div>)}</div></div></div></div>;
}

const BLANK_CLIENT_FORM = { name: "", email: "", phone: "", document: "", addressZip: "", addressStreet: "", addressNumber: "", addressNeighborhood: "", addressCity: "", addressState: "", addressReference: "", notes: "" };
type ClientForm = typeof BLANK_CLIENT_FORM;

function clientToForm(c: Client): ClientForm {
  return { name: c.name, email: c.email || "", phone: c.phone || "", document: c.document || "", addressZip: c.addressZip || "", addressStreet: c.addressStreet || "", addressNumber: c.addressNumber || "", addressNeighborhood: c.addressNeighborhood || "", addressCity: c.addressCity || "", addressState: c.addressState || "", addressReference: c.addressReference || "", notes: c.notes || "" };
}

// Same required set the server enforces (clientSchema) plus email format -
// every failing field is collected at once (not just the first) so the
// summary banner can list every field that needs fixing in a single pass,
// instead of the user discovering them one submit at a time.
function validateClientForm(form: ClientForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "Informe o nome do cliente.";
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "O e-mail informado nao e valido. Exemplo: cliente@empresa.com.";
  if (!form.addressStreet.trim()) errors.addressStreet = "Informe a rua/logradouro do endereco.";
  if (!form.addressNumber.trim()) errors.addressNumber = "Informe o numero do endereco.";
  if (!form.addressNeighborhood.trim()) errors.addressNeighborhood = "Informe o bairro do endereco.";
  if (!form.addressCity.trim()) errors.addressCity = "Informe a cidade do endereco.";
  if (!form.addressState) errors.addressState = "Selecione o estado (UF) do endereco.";
  return errors;
}

function ClientsView({ data, branchId, reload, loading, openClientId, onOpenClientHandled }: { data: Client[]; branchId: string | null; reload: () => Promise<void>; loading: boolean; openClientId?: string | null; onOpenClientHandled?: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(BLANK_CLIENT_FORM);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Opened here from an OS form's "Editar cliente" action - pop the editor for
  // that client as soon as its row is available in the loaded list.
  useEffect(() => {
    if (!openClientId) return;
    const target = data.find((c) => c.id === openClientId);
    if (target) { setEditing(target); setError(""); setFieldErrors({}); setForm(clientToForm(target)); setOpen(true); }
    onOpenClientHandled?.();
  }, [openClientId, data, onOpenClientHandled]);
  // Updates one field and clears its own error the moment the user edits it,
  // instead of leaving a stale error visible until the next submit attempt.
  function updateField<K extends keyof ClientForm>(key: K, value: ClientForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((prev) => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const errors = validateClientForm(form);
    // Mirrors the server-side duplicate rule (lib/client-dedupe) for instant
    // feedback - `data` is already the active branch's client list. The API
    // re-checks regardless; this never becomes the source of truth.
    if (data.some((c) => c.id !== editing?.id && isDuplicateClient({ name: form.name, document: form.document }, c))) {
      errors.document = DUPLICATE_CLIENT_MESSAGE;
    }
    const fields = Object.keys(errors);
    if (fields.length > 0) {
      setFieldErrors(errors);
      setError(fields.length === 1 ? "Nao foi possivel salvar o cliente. Corrija o campo destacado abaixo." : `Nao foi possivel salvar o cliente. Existem ${fields.length} campos que precisam ser corrigidos.`);
      focusFormField(`client-field-${fields[0]}`);
      return;
    }
    setFieldErrors({}); setError("");
    try {
      const payload = editing ? form : { ...form, branchId };
      await api(editing ? `/api/clients/${editing.id}` : "/api/clients", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      setOpen(false); setEditing(null); await reload();
    } catch (err) {
      const field = err instanceof ApiError ? err.field : undefined;
      const message = err instanceof Error ? err.message : "Nao foi possivel salvar o cliente agora. Tente novamente.";
      setError(message);
      setFieldErrors(field ? { [field]: message } : {});
      if (field) focusFormField(`client-field-${field}`);
    }
  }
  async function remove(id: string) { if (!confirm("Excluir cliente?")) return; try { await api(`/api/clients/${id}`, { method: "DELETE" }); await reload(); } catch (err) { alert(err instanceof Error ? err.message : "Erro ao excluir cliente."); } }
  if (loading) return <p className="text-sm text-slate-500">Carregando clientes...</p>;
  return <CrudShell title="Clientes" onNew={() => { setEditing(null); setError(""); setFieldErrors({}); setForm(BLANK_CLIENT_FORM); setOpen(true); }}>{data.map((c) => <div key={c.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-black">{c.name}</h3><ActionButtons onEdit={() => { setEditing(c); setError(""); setFieldErrors({}); setForm(clientToForm(c)); setOpen(true); }} onDelete={() => remove(c.id)} /></div><p className="mt-2 text-sm text-slate-500">{c.phone} | {c.email}</p><p className="text-sm text-slate-500">{c.document}</p>{c.address && <p className="mt-2 text-sm text-slate-500">{c.address}</p>}<p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{c.notes || "Sem observacoes"}</p></div>)}{open && <Modal title={editing ? "Editar cliente" : "Novo cliente"} onClose={() => setOpen(false)}><form onSubmit={submit} className="grid gap-3">{Object.keys(fieldErrors).length > 0 ? <FieldErrorSummary title={error} errors={fieldErrors} fieldPrefix="client-field-" /> : error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<Input id="client-field-name" label="Nome *" value={form.name} set={(v) => updateField("name", v)} required error={fieldErrors.name} /><Input id="client-field-email" label="Email" value={form.email} set={(v) => updateField("email", v)} error={fieldErrors.email} /><Input label="Telefone" value={form.phone} set={(v) => updateField("phone", v)} /><Input id="client-field-document" label="CPF/CNPJ" value={form.document} set={(v) => updateField("document", v)} error={fieldErrors.document} /><div className="rounded-2xl bg-slate-50 p-4"><h4 className="font-black">Endereco</h4>{editing && !hasStructuredClientAddress(form) && editing.address && <p className="mt-1 text-xs text-slate-500">Endereco anterior (nao estruturado): <b>{editing.address}</b> - preencha os campos abaixo para atualizar.</p>}<div className="mt-3 grid gap-3 md:grid-cols-3"><CepField id="client-field-addressZip" value={form.addressZip} onChange={(v) => updateField("addressZip", v)} onFound={(address) => setForm({ ...form, addressZip: address.cep, addressStreet: address.street, addressNeighborhood: address.neighborhood, addressCity: address.city, addressState: address.state })} /><div className="md:col-span-2"><Input id="client-field-addressStreet" label="Rua / Logradouro *" value={form.addressStreet} set={(v) => updateField("addressStreet", v)} required error={fieldErrors.addressStreet} /></div></div><div className="mt-3 grid gap-3 md:grid-cols-3"><Input id="client-field-addressNumber" label="Numero *" value={form.addressNumber} set={(v) => updateField("addressNumber", v)} required error={fieldErrors.addressNumber} /><Input id="client-field-addressNeighborhood" label="Bairro *" value={form.addressNeighborhood} set={(v) => updateField("addressNeighborhood", v)} required error={fieldErrors.addressNeighborhood} /><label className="grid gap-1 text-xs font-black uppercase text-slate-500">Estado (UF) *<Select id="client-field-addressState" value={form.addressState} set={(v) => updateField("addressState", v)} options={brazilStateOptions} error={fieldErrors.addressState} /></label></div><div className="mt-3 grid gap-3 md:grid-cols-2"><Input id="client-field-addressCity" label="Cidade *" value={form.addressCity} set={(v) => updateField("addressCity", v)} required error={fieldErrors.addressCity} /><Input label="Ponto de referencia (opcional)" value={form.addressReference} set={(v) => updateField("addressReference", v)} /></div></div><Text label="Observacoes" value={form.notes} set={(v) => updateField("notes", v)} /><Save /></form></Modal>}</CrudShell>;
}

function EmployeesView({ data, branchId, reload, loading }: { data: Employee[]; branchId: string | null; reload: () => Promise<void>; loading: boolean }) {
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Employee | null>(null); const [form, setForm] = useState({ name: "", role: "", phone: "", dailyRate: 0, paymentType: "diaria", notes: "" }); const [error, setError] = useState("");
  async function submit(e: FormEvent) { e.preventDefault(); setError(""); try { const payload = editing ? form : { ...form, branchId }; await api(editing ? `/api/employees/${editing.id}` : "/api/employees", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }); setOpen(false); setEditing(null); await reload(); } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar funcionario."); } }
  async function remove(id: string) { if (!confirm("Excluir funcionario?")) return; try { await api(`/api/employees/${id}`, { method: "DELETE" }); await reload(); } catch (err) { alert(err instanceof Error ? err.message : "Erro ao excluir funcionario."); } }
  if (loading) return <p className="text-sm text-slate-500">Carregando funcionarios...</p>;
  return <CrudShell title="Funcionarios" onNew={() => { setEditing(null); setError(""); setForm({ name: "", role: "", phone: "", dailyRate: 0, paymentType: "diaria", notes: "" }); setOpen(true); }}>{data.map((x) => <div key={x.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-black">{x.name}</h3><ActionButtons onEdit={() => { setEditing(x); setError(""); setForm({ name: x.name, role: x.role, phone: x.phone || "", dailyRate: Number(x.dailyRate), paymentType: x.paymentType, notes: x.notes || "" }); setOpen(true); }} onDelete={() => remove(x.id)} /></div><p className="text-sm font-bold text-indigo-600">{x.role}</p><p className="text-sm text-slate-500">{x.phone}</p><p className="mt-2 font-black text-emerald-600">{money(x.dailyRate)} / {x.paymentType}</p></div>)}{open && <Modal title={editing ? "Editar funcionario" : "Novo funcionario"} onClose={() => setOpen(false)}><form onSubmit={submit} className="grid gap-3">{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<Input label="Nome" value={form.name} set={(v) => setForm({ ...form, name: v })} required /><Input label="Cargo" value={form.role} set={(v) => setForm({ ...form, role: v })} required /><Input label="Telefone" value={form.phone} set={(v) => setForm({ ...form, phone: v })} /><NumberInput label="Valor diaria/salario" value={form.dailyRate} set={(v) => setForm({ ...form, dailyRate: v })} /><Input label="Tipo pagamento" value={form.paymentType} set={(v) => setForm({ ...form, paymentType: v })} /><Text label="Observacoes" value={form.notes} set={(v) => setForm({ ...form, notes: v })} /><Save /></form></Modal>}</CrudShell>;
}

function ServicesView({ data, branchId, reload, loading }: { data: Service[]; branchId: string | null; reload: () => Promise<void>; loading: boolean }) {
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Service | null>(null); const [form, setForm] = useState({ name: "", description: "", price: 0, durationHours: 0, category: "Geral", active: true }); const [error, setError] = useState("");
  async function submit(e: FormEvent) { e.preventDefault(); setError(""); try { const payload = editing ? form : { ...form, branchId }; await api(editing ? `/api/services/${editing.id}` : "/api/services", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }); setOpen(false); setEditing(null); await reload(); } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar servico."); } }
  async function remove(id: string) { if (!confirm("Excluir servico?")) return; try { await api(`/api/services/${id}`, { method: "DELETE" }); await reload(); } catch (err) { alert(err instanceof Error ? err.message : "Erro ao excluir servico."); } }
  if (loading) return <p className="text-sm text-slate-500">Carregando servicos...</p>;
  return <CrudShell title="Servicos" onNew={() => { setEditing(null); setError(""); setOpen(true); }}>{data.map((s) => <div key={s.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase text-indigo-700">{s.category}</span><ActionButtons onEdit={() => { setEditing(s); setError(""); setForm({ name: s.name, description: s.description || "", price: Number(s.price), durationHours: Number(s.durationHours), category: s.category, active: s.active }); setOpen(true); }} onDelete={() => remove(s.id)} /></div><h3 className="mt-3 font-black">{s.name}</h3><p className="mt-2 text-sm text-slate-500">{s.description}</p><p className="mt-3 font-black text-emerald-600">{money(s.price)}</p></div>)}{open && <Modal title={editing ? "Editar servico" : "Novo servico"} onClose={() => setOpen(false)}><form onSubmit={submit} className="grid gap-3">{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<Input label="Nome" value={form.name} set={(v) => setForm({ ...form, name: v })} required /><Text label="Descricao" value={form.description} set={(v) => setForm({ ...form, description: v })} /><NumberInput label="Preco" value={form.price} set={(v) => setForm({ ...form, price: v })} /><NumberInput label="Duracao horas" value={form.durationHours} set={(v) => setForm({ ...form, durationHours: v })} /><Input label="Categoria" value={form.category} set={(v) => setForm({ ...form, category: v })} required /><Save /></form></Modal>}</CrudShell>;
}

// Backend-computed summary for an active client search (see
// /api/orders/summary). Counts one row per OS (never per appointment) and
// values come from ServiceOrder.totalAmount - same figure as the table's
// "Valor" column.
type ClientSearchSummary = { clientNames: string[]; totalOrders: number; totalValue: number; byStatus: Record<string, { count: number; value: number }> };
const SUMMARY_STATUS_KEYS = ["pendente", "confirmado", "em_andamento", "finalizado", "cancelado"] as const;

function ClientSummaryPanel({ summary, term }: { summary: ClientSearchSummary; term: string }) {
  const heading = summary.clientNames.length === 1 ? summary.clientNames[0]
    : summary.clientNames.length > 1 ? `${summary.clientNames.length} clientes: ${summary.clientNames.join(", ")}`
    : term;
  return <div className="rounded-2xl border bg-white p-5 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Resumo do cliente</p>
    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="font-black">{heading}</h4>
      <p className="text-sm font-bold text-slate-500">{summary.totalOrders} OS &middot; {money(summary.totalValue)}</p>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {SUMMARY_STATUS_KEYS.map((k) => {
        const s = summary.byStatus[k] ?? { count: 0, value: 0 };
        return <div key={k} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="font-bold text-slate-600">{statusLabels[k]}</span><span className="font-black text-slate-900">{s.count} OS &middot; {money(s.value)}</span></div>;
      })}
      <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-3 py-2 text-sm"><span className="font-black text-indigo-700">TOTAL</span><span className="font-black text-indigo-700">{summary.totalOrders} OS &middot; {money(summary.totalValue)}</span></div>
    </div>
  </div>;
}

function OrdersView({ orders, clients, employees, services, branchId, reload, onOrderSaved, loading, onEditClient }: { orders: Order[]; clients: Client[]; employees: Employee[]; services: Service[]; branchId: string | null; reload: () => Promise<void>; onOrderSaved: (order: Order) => Promise<void>; loading: boolean; onEditClient?: (clientId: string) => void }) {
  const [open, setOpen] = useState(false); const [print, setPrint] = useState<Order | null>(null); const [editing, setEditing] = useState<Order | null>(null);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [sending, setSending] = useState<{ order: Order; channel: SendChannel } | null>(null);

  // Client search. Server-side (never a frontend filter over `orders`): the
  // debounced term is sent to /api/orders + /api/orders/summary, both of which
  // re-apply the same branch isolation. Empty term => untouched normal listing
  // (the `orders` prop). The effect also re-runs when `orders` changes so an
  // edit/delete/create during an active search refreshes the filtered view.
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [searchResults, setSearchResults] = useState<Order[] | null>(null);
  const [summary, setSummary] = useState<ClientSearchSummary | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!debounced || !branchId) { setSearchResults(null); setSummary(null); setSearchLoading(false); return; }
    let cancelled = false;
    setSearchLoading(true);
    const qs = `?branchId=${encodeURIComponent(branchId)}&clientSearch=${encodeURIComponent(debounced)}`;
    Promise.all([
      api<Order[]>(`/api/orders${qs}`),
      api<ClientSearchSummary>(`/api/orders/summary${qs}`),
    ]).then(([list, sum]) => {
      if (cancelled) return;
      setSearchResults(list); setSummary(sum);
    }).catch(() => {
      if (cancelled) return;
      setSearchResults([]); setSummary(null);
    }).finally(() => {
      if (!cancelled) setSearchLoading(false);
    });
    return () => { cancelled = true; };
  }, [debounced, branchId, orders]);

  const isSearching = debounced.length > 0;
  const displayedOrders = searchResults ?? orders;

  async function removeOrder(id: string) { if (!confirm("Excluir OS?")) return; try { await api(`/api/orders/${id}`, { method: "DELETE" }); await reload(); } catch (err) { alert(err instanceof Error ? err.message : "Erro ao excluir OS."); } }

  if (loading) return <p className="text-sm text-slate-500">Carregando ordens de servico...</p>;
  return <div className="space-y-5"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm text-slate-500">OS com multiplos atendimentos, recorrencia, equipe, assinatura e impressao/PDF.</p><div className="flex gap-2"><button onClick={() => setRecurrenceOpen(true)} className="rounded-xl border border-indigo-300 px-4 py-2 font-black text-indigo-600">Nova Recorrencia</button><button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Nova OS</button></div></div><div className="flex flex-wrap items-center gap-2"><div className="relative flex-1 min-w-[220px]"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔎</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar cliente..." aria-label="Pesquisar cliente" className="w-full rounded-xl border p-3 pl-9 text-sm" /></div>{search && <button onClick={() => setSearch("")} className="rounded-xl border px-4 py-2 text-sm font-black text-slate-600">Limpar</button>}{searchLoading && <span className="text-xs font-bold text-slate-400">Buscando...</span>}</div><div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Codigo</th><th className="p-4">Cliente</th><th className="hidden p-4 sm:table-cell">Data</th><th className="hidden p-4 sm:table-cell">Atendimentos</th><th className="hidden p-4 sm:table-cell">Pagamento</th><th className="p-4">Status</th><th className="p-4 text-right">Valor</th><th className="p-4 text-right">Acoes</th></tr></thead><tbody>{displayedOrders.map((o) => <tr key={o.id} className="border-t"><td className="p-4 font-mono font-black">{o.code}</td><td className="p-4">{o.client?.name}</td><td className="hidden p-4 sm:table-cell">{new Date(o.eventDate).toLocaleDateString("pt-BR")}</td><td className="hidden p-4 sm:table-cell">{o.appointments?.length ?? 0}</td><td className="hidden p-4 text-xs sm:table-cell">{paymentMethodLabel(o)}</td><td className="p-4"><Badge status={o.status} /></td><td className="p-4 text-right font-black text-indigo-600">{money(o.totalAmount)}</td><td className="p-4 text-right"><div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
    <button onClick={() => setPrint(o)} className="font-bold">PDF</button>
    <button onClick={() => { setEditing(o); setOpen(true); }} className="font-bold text-indigo-600">Editar</button>
    <button onClick={() => setSending({ order: o, channel: "email" })} className="font-bold text-emerald-600">E-mail</button>
    <button onClick={() => setSending({ order: o, channel: "whatsapp" })} className="font-bold text-emerald-600">WhatsApp</button>
    <button onClick={() => removeOrder(o.id)} className="font-bold text-rose-600">Excluir</button>
  </div></td></tr>)}</tbody></table></div>{isSearching && !searchLoading && displayedOrders.length === 0 && <div className="rounded-2xl border bg-white p-6 text-sm text-slate-500">Nenhuma Ordem de Servico encontrada para este cliente.</div>}{isSearching && summary && summary.totalOrders > 0 && <ClientSummaryPanel summary={summary} term={debounced} />}{open && <OrderFormModal order={editing} orders={orders} clients={clients} employees={employees} services={services} branchId={branchId} onClose={() => setOpen(false)} reload={reload} onSaved={onOrderSaved} onEditClient={onEditClient} />}{print && <PrintOrder order={print} close={() => setPrint(null)} />}{recurrenceOpen && <RecurrenceModal clients={clients} services={services} employees={employees} branchId={branchId} close={() => setRecurrenceOpen(false)} onCreated={reload} onEditClient={onEditClient} />}{sending && <SendOrderModal order={sending.order} channel={sending.channel} onClose={() => setSending(null)} />}</div>;
}

type ShownAddress = { addressStreet?: string | null; addressNumber?: string | null; addressNeighborhood?: string | null; addressCity?: string | null; addressState?: string | null; addressZip?: string | null; addressReference?: string | null; location?: string | null };

function AddressLines({ a }: { a: ShownAddress }) {
  return <div className="mt-3 grid gap-1 text-sm">
    <p><b>Rua / Logradouro:</b> {a.addressStreet}, {a.addressNumber}</p>
    <p><b>Bairro:</b> {a.addressNeighborhood}</p>
    <p><b>Cidade / UF:</b> {a.addressCity} - {a.addressState}</p>
    {a.addressZip && <p><b>CEP:</b> {a.addressZip}</p>}
    {a.addressReference && <p><b>Ponto de referencia:</b> {a.addressReference}</p>}
  </div>;
}

// Read-only "Endereco do servico" area for the OS / Recorrencia forms. The
// address is NEVER typed here - it is carried automatically from the selected
// client's cadastro (the single source of truth). `historical` is passed only
// for an existing OS being edited without changing its client and that
// already carries its own address snapshot: that snapshot is preserved and
// shown instead, so a later change to the client's cadastro never silently
// rewrites an existing OS. When neither is usable the form is blocked and
// this panel offers "Editar cliente" (reuses ClientsView's own modal).
function ClientServiceAddressPanel({ client, addressState, historical, onEditClient }: { client: Client | null; addressState: ClientAddressState; historical?: ShownAddress | null; onEditClient?: (clientId: string) => void }) {
  const usesHistoricalStructured = !!historical && hasStructuredOrderAddress(historical);
  const usesHistoricalLegacy = !!historical && !usesHistoricalStructured && !!historical.location;
  return <div className="rounded-2xl bg-slate-50 p-4">
    <h4 className="font-black">Endereco do servico</h4>
    <p className="mt-1 text-xs text-slate-500">Este endereco e carregado automaticamente a partir do cadastro do cliente.</p>
    {usesHistoricalStructured && historical ? <>
      <p className="mt-2 text-xs font-bold text-amber-600">Endereco registrado nesta OS - preservado para manter a consistencia historica.</p>
      <AddressLines a={historical} />
    </> : usesHistoricalLegacy && historical ? <>
      <p className="mt-2 text-xs font-bold text-amber-600">Endereco registrado nesta OS - preservado para manter a consistencia historica.</p>
      <p className="mt-2 text-sm">{historical.location}</p>
    </> : addressState === "ok" && client ? <AddressLines a={client} /> : <div role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
      <p className="font-bold">{clientAddressErrorMessage(addressState, client)}</p>
      {client && onEditClient && <button type="button" onClick={() => onEditClient(client.id)} className="mt-2 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-black text-white">Editar cliente</button>}
    </div>}
  </div>;
}

// Shared "Nova/Editar OS" form, reused by OrdersView, CalendarView (click an
// atendimento -> edit its OS) and FinanceView (click a movement -> open its
// OS). `order` is the live record from the parent's already-loaded `orders`
// list; `orders` is kept as a prop (not refetched here) purely so this modal
// can re-sync itself from that same list after every reload() - the same
// pattern the original OrdersView used, now shared across all three callers.
function OrderFormModal({ order, orders, clients, employees, services, branchId, onClose, reload, onSaved, onEditClient }: { order: Order | null; orders: Order[]; clients: Client[]; employees: Employee[]; services: Service[]; branchId: string | null; onClose: () => void; reload: () => Promise<void>; onSaved: (order: Order) => Promise<void>; onEditClient?: (clientId: string) => void }) {
  // Address fields are intentionally absent from the form: the OS service
  // address is never typed here, it is carried from the selected client's
  // cadastro (see ClientServiceAddressPanel + app/api/orders).
  const blank = { clientId: clients[0]?.id || "", eventDate: dateOnly(), startTime: "18:00", endTime: "23:59", status: "pendente", paymentMethod: "", notes: "", signatureName: "", employeeIds: [] as string[], items: [] as Array<{ serviceId: string; quantity: number; unitPrice: number }> };
  function fromOrder(o: Order) { return { clientId: o.clientId, eventDate: dateOnly(o.eventDate), startTime: o.startTime, endTime: o.endTime, status: o.status, paymentMethod: o.paymentMethod || "", notes: o.notes || "", signatureName: o.signatureName || "", employeeIds: o.employees.map((x) => x.employee.id), items: o.items.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity, unitPrice: Number(i.unitPrice) })) }; }

  const [current, setCurrent] = useState<Order | null>(order);
  const [form, setForm] = useState(() => (order ? fromOrder(order) : blank));
  const [serviceId, setServiceId] = useState(services[0]?.id || "");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const total = form.items.reduce((s, i) => s + i.quantity * Number(i.unitPrice), 0);

  // The OS service address always comes from the selected client's cadastro.
  // Exception (must match the PUT route in app/api/orders/[id]): an existing
  // OS edited WITHOUT changing its client, that already carries its own
  // structured address snapshot, keeps that snapshot untouched - so editing
  // an old/finished OS never rewrites its address just because the client's
  // cadastro changed later.
  const selectedClient = clients.find((c) => c.id === form.clientId) ?? null;
  const clientAddressState = selectedClient ? evaluateClientAddress(selectedClient) : "missing";
  // Editing an existing OS without changing its client: the OS keeps its own
  // recorded address (matches the PUT route). Only a client swap re-pulls from
  // the new client's cadastro (and then it must be complete).
  const preservesOsAddress = !!current && form.clientId === current.clientId;
  const addressReady = preservesOsAddress || clientAddressState === "ok";

  // Scrolls to and focuses the field named by the server's `field` hint (or
  // "items" for the services section, which has no single input) so a
  // validation error always lands the user exactly where it needs fixing,
  // instead of just a banner they have to hunt from.
  function focusField(field?: string) {
    if (!field) return;
    focusFormField(`os-field-${field}`);
  }

  // Keeps `current` (and the AppointmentsSection it feeds) fresh after any
  // action taken on a sibling appointment, without closing the modal - the
  // same sync-from-parent-list pattern the original inline form used.
  useEffect(() => { if (current) { const fresh = orders.find((o) => o.id === current.id); if (fresh) setCurrent(fresh); } }, [orders]);

  function addService() { const s = services.find((x) => x.id === serviceId); if (!s) return; setForm({ ...form, items: [...form.items, { serviceId: s.id, quantity: 1, unitPrice: Number(s.price) }] }); }
  // Merges a whole batch from the multi-date calendar at once, dropping any
  // that duplicate the main event date or an already-added date.
  function addDates(dates: string[]) {
    setExtraDates((prev) => {
      const merged = new Set(prev);
      for (const d of dates) if (d !== form.eventDate) merged.add(d);
      return [...merged].sort();
    });
  }
  function removeDate(d: string) { setExtraDates(extraDates.filter((x) => x !== d)); }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setErrorField(""); setSuccess("");
    // Same rule the server enforces (orderSchema: items.min(1)) - checked
    // client-side first so an empty service list is caught instantly, with
    // the same field-highlight treatment as a server-side validation error,
    // instead of round-tripping to the API just to get told the same thing.
    if (form.items.length === 0) {
      setError("Nao foi possivel salvar a OS porque nenhum servico foi selecionado. Selecione pelo menos um servico para continuar.");
      setErrorField("items");
      focusField("items");
      return;
    }
    // Same rule the server enforces (app/api/orders): no OS for a client
    // without a complete address. Kept in the frontend only so the user is
    // told before the round-trip and pointed at the client cadastro to fix it.
    if (!addressReady) {
      setError(clientAddressErrorMessage(clientAddressState, selectedClient));
      setErrorField("clientId");
      focusField("clientId");
      return;
    }
    setSaving(true);
    try {
      const payload = current ? form : { ...form, branchId, ...(extraDates.length ? { dates: [form.eventDate, ...extraDates] } : {}) };
      const saved = await api<Order>(current ? `/api/orders/${current.id}` : "/api/orders", { method: current ? "PUT" : "POST", body: JSON.stringify(payload) });
      // `saved` is the server's own confirmation of the write (read back
      // inside the same transaction that persisted it) - applying it directly
      // instead of a full reload() is not an optimistic update, the save is
      // already durable by the time this runs. onClose only fires once this
      // resolves, so the modal never closes before the update is applied.
      await onSaved(saved);
      setSuccess("OS salva com sucesso!");
      setTimeout(onClose, 900);
    } catch (err) {
      const field = err instanceof ApiError ? err.field : undefined;
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar a OS agora. Tente novamente.");
      setErrorField(field || "");
      focusField(field);
    } finally {
      setSaving(false);
    }
  }

  async function addAppointments(dates: string[], startTime: string, endTime: string) {
    if (!current || dates.length === 0) return;
    try {
      // POST /api/appointments already accepts a `dates` array and creates
      // every appointment in one transaction - no per-date request.
      await api("/api/appointments", { method: "POST", body: JSON.stringify({ orderId: current.id, dates, startTime, endTime }) });
      await reload();
    } catch (err) { alert(err instanceof Error ? err.message : "Erro ao adicionar atendimento."); }
  }

  async function cancelAppointment(id: string) {
    const reason = prompt("Motivo do cancelamento deste atendimento:");
    if (!reason) return;
    try { await api(`/api/appointments/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }); await reload(); }
    catch (err) { alert(err instanceof Error ? err.message : "Erro ao cancelar atendimento."); }
  }
  async function completeAppointment(id: string) {
    try { await api(`/api/appointments/${id}/complete`, { method: "POST" }); await reload(); }
    catch (err) { alert(err instanceof Error ? err.message : "Erro ao concluir atendimento."); }
  }
  async function rescheduleAppointment(id: string, date: string, startTime: string, endTime: string) {
    try { await api(`/api/appointments/${id}`, { method: "PUT", body: JSON.stringify({ date, startTime, endTime }) }); await reload(); }
    catch (err) { alert(err instanceof Error ? err.message : "Erro ao reagendar atendimento."); }
  }
  async function assignEmployee(id: string, employeeId: string) {
    try { await api(`/api/appointments/${id}`, { method: "PUT", body: JSON.stringify({ employeeId: employeeId || null }) }); await reload(); }
    catch (err) { alert(err instanceof Error ? err.message : "Erro ao atribuir funcionario."); }
  }
  // One entry point for changing an occurrence's status. "cancelado" and
  // "finalizado" route to their dedicated endpoints (reason prompt / billing
  // sync); the reversible statuses go straight through the appointment PUT.
  // Never touches the OS or sibling occurrences.
  async function setAppointmentStatus(id: string, status: string) {
    if (status === "cancelado") return cancelAppointment(id);
    if (status === "finalizado") return completeAppointment(id);
    try { await api(`/api/appointments/${id}`, { method: "PUT", body: JSON.stringify({ status }) }); await reload(); }
    catch (err) { alert(err instanceof Error ? err.message : "Erro ao alterar o status do atendimento."); }
  }
  async function removeAppointment(id: string) {
    if (!confirm("Remover este atendimento da OS? Esta acao nao pode ser desfeita.")) return;
    try { await api(`/api/appointments/${id}`, { method: "DELETE" }); await reload(); }
    catch (err) { alert(err instanceof Error ? err.message : "Erro ao remover atendimento."); }
  }

  return <Modal title={current ? `Editar OS ${current.code}` : "Nova OS"} onClose={onClose}><form onSubmit={submit} className="space-y-4">{success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{success}</p>}{error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<div className="grid gap-3 md:grid-cols-3"><Select id="os-field-clientId" error={errorField === "clientId" ? error : undefined} value={form.clientId} set={(v) => setForm({ ...form, clientId: v })} options={clients.map((c) => [c.id, c.name])} /><Input id="os-field-eventDate" error={errorField === "eventDate" ? error : undefined} type="date" label="Data" value={form.eventDate} set={(v) => setForm({ ...form, eventDate: v })} /><Select id="os-field-status" error={errorField === "status" ? error : undefined} value={form.status} set={(v) => setForm({ ...form, status: v })} options={[["pendente", "Pendente"], ["confirmado", "Confirmado"], ["em_andamento", "Em andamento"], ["finalizado", "Finalizado"], ["cancelado", "Cancelado"]]} /><Input id="os-field-startTime" error={errorField === "startTime" ? error : undefined} label="Inicio" value={form.startTime} set={(v) => setForm({ ...form, startTime: v })} /><Input id="os-field-endTime" error={errorField === "endTime" ? error : undefined} label="Fim" value={form.endTime} set={(v) => setForm({ ...form, endTime: v })} /><label className="grid gap-1 text-xs font-black uppercase text-slate-500">Pagamento<Select value={form.paymentMethod} set={(v) => setForm({ ...form, paymentMethod: v })} options={paymentMethodOptions} /></label></div>{current?.paymentMethodLegacy && !current.paymentMethod && <p className="text-xs text-slate-400">Valor legado registrado anteriormente: <b>{current.paymentMethodLegacy}</b> (selecione uma opcao acima para substituir por um valor controlado).</p>}<ClientServiceAddressPanel client={selectedClient} addressState={clientAddressState} historical={preservesOsAddress ? current : null} onEditClient={onEditClient} />{!current && <div className="rounded-2xl bg-slate-50 p-4"><h4 className="font-black">Datas adicionais (opcional)</h4><p className="text-xs text-slate-500">Cria um atendimento para a data principal acima e mais um para cada data selecionada aqui, todos na mesma OS. Selecione varias datas no calendario e confirme de uma vez.</p><div className="mt-3"><MultiDatePicker onConfirm={addDates} disabledDates={[form.eventDate, ...extraDates]} /></div>{extraDates.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{extraDates.map((d) => <span key={d} className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{dateOnlyLabel(d)}<button type="button" onClick={() => removeDate(d)} className="text-rose-600">x</button></span>)}</div>}</div>}<div id="os-field-items" tabIndex={-1} className={`rounded-2xl bg-slate-50 p-4 ${errorField === "items" ? "ring-2 ring-rose-500" : ""}`}><h4 className="font-black">Servicos contratados</h4>{errorField === "items" && error && <p role="alert" className="mt-1 text-xs font-bold text-rose-600">{error}</p>}<div className="mt-3 flex flex-wrap gap-2"><select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full rounded-xl border p-3">{services.map((s) => <option key={s.id} value={s.id}>{s.name} - {money(s.price)}</option>)}</select><button type="button" onClick={addService} className="rounded-xl bg-slate-950 px-4 font-black text-white">Adicionar</button></div>{form.items.map((i, idx) => <div key={idx} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3"><span className="min-w-0 flex-1 break-words">{services.find((s) => s.id === i.serviceId)?.name}</span><input type="number" min={1} value={i.quantity} onChange={(e) => setForm({ ...form, items: form.items.map((x, n) => n === idx ? { ...x, quantity: Number(e.target.value) } : x) })} className="w-16 shrink-0 rounded border p-2" /><b className="shrink-0">{money(i.quantity * Number(i.unitPrice))}</b><button type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, n) => n !== idx) })} className="shrink-0 font-bold text-rose-600">Remover</button></div>)}<p className="mt-3 text-right text-lg font-black">Total: {money(total)}</p></div><EmployeeMultiSelect employees={employees} selected={form.employeeIds} onChange={(ids) => setForm({ ...form, employeeIds: ids })} /><Text label="Observacoes" value={form.notes} set={(v) => setForm({ ...form, notes: v })} /><Input label="Assinatura" value={form.signatureName} set={(v) => setForm({ ...form, signatureName: v })} />{current && <AppointmentsSection appointments={current.appointments} employees={employees} orderTotal={Number(current.totalAmount)} serviceLabel={current.items.map((i) => `${i.service?.name ?? "Servico"}${i.quantity > 1 ? ` x${i.quantity}` : ""}`).join(", ") || "-"} onCancel={cancelAppointment} onComplete={completeAppointment} onReschedule={rescheduleAppointment} onAssign={assignEmployee} onSetStatus={setAppointmentStatus} onRemove={removeAppointment} onAdd={addAppointments} />}<button disabled={saving || !addressReady} className="rounded-xl bg-indigo-600 p-3 font-black text-white disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button></form></Modal>;
}

// Each row = one occurrence (Appointment) of this single OS. Every occurrence
// carries its OWN data/horario/funcionario/status; the servico and valor are
// inherited from the OS (there is no per-appointment amount column - see the
// Dashboard route). Actions act on that one appointment only, never creating
// or duplicating an OS.
function AppointmentsSection({ appointments, employees, orderTotal, serviceLabel, onCancel, onComplete, onReschedule, onAssign, onSetStatus, onRemove, onAdd }: { appointments: Appointment[]; employees: Employee[]; orderTotal: number; serviceLabel: string; onCancel: (id: string) => void; onComplete: (id: string) => void; onReschedule: (id: string, date: string, startTime: string, endTime: string) => void; onAssign: (id: string, employeeId: string) => void; onSetStatus: (id: string, status: string) => void; onRemove: (id: string) => void; onAdd: (dates: string[], startTime: string, endTime: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("23:59");
  const existingDates = appointments.map((a) => dateOnly(a.date));
  const activeCount = appointments.filter((a) => a.status !== "cancelado").length;
  return <div className="rounded-2xl bg-slate-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-black">Atendimentos / Datas ({appointments.length})</h4><p className="text-xs text-slate-500">Servico: {serviceLabel} - Valor por ocorrencia: <b>{money(orderTotal)}</b></p></div><button type="button" onClick={() => setAdding((v) => !v)} className="text-xs font-bold text-indigo-600">{adding ? "Cancelar" : "+ Adicionar atendimentos"}</button></div>
    {adding && <div className="mt-3 space-y-3 rounded-xl border bg-white p-3">
      <div className="flex flex-wrap items-center gap-3"><label className="text-xs font-black uppercase text-slate-500">Inicio<input value={startTime} onChange={(e) => setStartTime(e.target.value)} className="ml-2 w-20 rounded border p-2 text-sm normal-case" /></label><label className="text-xs font-black uppercase text-slate-500">Fim<input value={endTime} onChange={(e) => setEndTime(e.target.value)} className="ml-2 w-20 rounded border p-2 text-sm normal-case" /></label></div>
      <MultiDatePicker disabledDates={existingDates} onConfirm={(dates) => { onAdd(dates, startTime, endTime); setAdding(false); }} />
    </div>}
    <div className="mt-3 space-y-2">{appointments.map((a) => <AppointmentRow key={a.id} appointment={a} employees={employees} occurrenceValue={orderTotal} serviceLabel={serviceLabel} canRemove={activeCount > 1} onCancel={onCancel} onComplete={onComplete} onReschedule={onReschedule} onAssign={onAssign} onSetStatus={onSetStatus} onRemove={onRemove} />)}</div>
  </div>;
}

const APPOINTMENT_STATUS_OPTIONS: Array<[string, string]> = [["pendente", "Agendado"], ["confirmado", "Confirmado"], ["em_andamento", "Em andamento"], ["finalizado", "Realizado"], ["cancelado", "Cancelado"]];

function AppointmentRow({ appointment, employees, occurrenceValue, serviceLabel, canRemove, onCancel, onComplete, onReschedule, onAssign, onSetStatus, onRemove }: { appointment: Appointment; employees: Employee[]; occurrenceValue: number; serviceLabel: string; canRemove: boolean; onCancel: (id: string) => void; onComplete: (id: string) => void; onReschedule: (id: string, date: string, startTime: string, endTime: string) => void; onAssign: (id: string, employeeId: string) => void; onSetStatus: (id: string, status: string) => void; onRemove: (id: string) => void }) {
  const [editingDate, setEditingDate] = useState(false);
  const [date, setDate] = useState(dateOnly(appointment.date));
  const [startTime, setStartTime] = useState(appointment.startTime);
  const [endTime, setEndTime] = useState(appointment.endTime);
  const isFinal = appointment.status === "finalizado" || appointment.status === "cancelado";
  return <div className="rounded-xl border bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      {editingDate
        ? <div className="flex flex-wrap items-center gap-2"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border p-2 text-sm" /><input value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-20 rounded border p-2 text-sm" /><input value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-20 rounded border p-2 text-sm" /><button type="button" onClick={() => { onReschedule(appointment.id, date, startTime, endTime); setEditingDate(false); }} className="text-sm font-bold text-indigo-600">Salvar</button><button type="button" onClick={() => setEditingDate(false)} className="text-sm font-bold text-slate-500">Cancelar edicao</button></div>
        : <button type="button" disabled={isFinal} onClick={() => setEditingDate(true)} className={`text-left text-sm font-bold ${isFinal ? "text-slate-400" : "text-slate-800 hover:text-indigo-600"}`}>{dateOnlyLabel(appointment.date)} - {appointment.startTime} as {appointment.endTime}{!isFinal && " (reagendar)"}</button>}
      <Badge status={appointment.status} />
    </div>
    <p className="mt-1 text-xs text-slate-500">{serviceLabel} - <b className="text-slate-700">{money(occurrenceValue)}</b></p>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select value={appointment.employeeId || ""} onChange={(e) => onAssign(appointment.id, e.target.value)} disabled={isFinal} className="rounded border p-2 text-xs"><option value="">Equipe da OS (padrao)</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      <label className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-500">Status<select value={appointment.status} onChange={(e) => { if (e.target.value !== appointment.status) onSetStatus(appointment.id, e.target.value); }} className="rounded border p-2 text-xs normal-case font-normal">{APPOINTMENT_STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {canRemove && !isFinal && <button type="button" onClick={() => onRemove(appointment.id)} className="text-xs font-bold text-slate-400 hover:text-rose-600">Remover</button>}
    </div>
    {!isFinal && <div className="mt-2 flex gap-3"><button type="button" onClick={() => onComplete(appointment.id)} className="text-xs font-bold text-emerald-600">Marcar realizado</button><button type="button" onClick={() => onCancel(appointment.id)} className="text-xs font-bold text-rose-600">Cancelar atendimento</button></div>}
    {appointment.status === "cancelado" && appointment.cancellationReason && <p className="mt-2 text-xs text-rose-500">Motivo: {appointment.cancellationReason}</p>}
  </div>;
}

function RecurrenceModal({ clients, services, employees, branchId, close, onCreated, onEditClient }: { clients: Client[]; services: Service[]; employees: Employee[]; branchId: string | null; close: () => void; onCreated: () => Promise<void>; onEditClient?: (clientId: string) => void }) {
  const [form, setForm] = useState({ clientId: clients[0]?.id || "", serviceId: services[0]?.id || "", frequency: "monthly", interval: 1, dayOfWeek: 1, dayOfMonth: 10, startTime: "09:00", endTime: "11:00", price: 0, startDate: dateOnly(), endDate: "", employeeIds: [] as string[] });
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [error, setError] = useState("");
  // Same rule as the OS form: the OS this recurrence creates snapshots its
  // address from the client's cadastro (see app/api/recurring-schedules).
  const selectedClient = clients.find((c) => c.id === form.clientId) ?? null;
  const clientAddressState = selectedClient ? evaluateClientAddress(selectedClient) : "missing";
  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    if (clientAddressState !== "ok") {
      setError(clientAddressErrorMessage(clientAddressState, selectedClient));
      return;
    }
    try {
      const payload = { ...form, branchId, endDate: form.endDate || null, dayOfWeek: form.frequency === "weekly" ? form.dayOfWeek : null, dayOfMonth: form.frequency === "monthly" ? form.dayOfMonth : null };
      const created = await api<{ order: { id: string } }>("/api/recurring-schedules", { method: "POST", body: JSON.stringify(payload) });
      // Recurrence business logic is untouched - these are extra one-off
      // appointments attached to the same OS the recurrence just created,
      // added in a single batch POST (not one request per date).
      if (extraDates.length > 0) {
        await api("/api/appointments", { method: "POST", body: JSON.stringify({ orderId: created.order.id, dates: extraDates, startTime: form.startTime, endTime: form.endTime }) });
      }
      close(); await onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel criar a recorrencia agora. Tente novamente."); }
  }
  return <Modal title="Nova Recorrencia" onClose={close}><form onSubmit={submit} className="grid gap-3">{error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<Select value={form.clientId} set={(v) => setForm({ ...form, clientId: v })} options={clients.map((c) => [c.id, c.name])} /><Select value={form.serviceId} set={(v) => setForm({ ...form, serviceId: v })} options={services.map((s) => [s.id, `${s.name} - ${money(s.price)}`])} /><div className="grid gap-3 md:grid-cols-2"><Select value={form.frequency} set={(v) => setForm({ ...form, frequency: v })} options={[["weekly", "Semanal"], ["monthly", "Mensal"]]} /><NumberInput label={form.frequency === "weekly" ? "Repetir a cada (semanas)" : "Repetir a cada (meses)"} value={form.interval} set={(v) => setForm({ ...form, interval: v })} /></div>{form.frequency === "weekly" ? <Select value={String(form.dayOfWeek)} set={(v) => setForm({ ...form, dayOfWeek: Number(v) })} options={[["0", "Domingo"], ["1", "Segunda"], ["2", "Terca"], ["3", "Quarta"], ["4", "Quinta"], ["5", "Sexta"], ["6", "Sabado"]]} /> : <NumberInput label="Dia do mes" value={form.dayOfMonth} set={(v) => setForm({ ...form, dayOfMonth: v })} />}<div className="grid gap-3 md:grid-cols-2"><Input label="Horario inicio" value={form.startTime} set={(v) => setForm({ ...form, startTime: v })} /><Input label="Horario fim" value={form.endTime} set={(v) => setForm({ ...form, endTime: v })} /></div><NumberInput label="Valor mensal" value={form.price} set={(v) => setForm({ ...form, price: v })} /><div className="grid gap-3 md:grid-cols-2"><Input type="date" label="Data inicial" value={form.startDate} set={(v) => setForm({ ...form, startDate: v })} /><Input type="date" label="Data final (opcional)" value={form.endDate} set={(v) => setForm({ ...form, endDate: v })} /></div><ClientServiceAddressPanel client={selectedClient} addressState={clientAddressState} onEditClient={onEditClient} /><EmployeeMultiSelect employees={employees} selected={form.employeeIds} onChange={(ids) => setForm({ ...form, employeeIds: ids })} /><div className="rounded-2xl bg-slate-50 p-4"><h4 className="font-black">Datas avulsas adicionais (opcional)</h4><p className="text-xs text-slate-500">Alem das datas geradas automaticamente pela recorrencia, selecione no calendario atendimentos avulsos para a mesma OS e confirme de uma vez.</p><div className="mt-3"><MultiDatePicker onConfirm={(dates) => setExtraDates((prev) => [...new Set([...prev, ...dates])].sort())} disabledDates={extraDates} /></div>{extraDates.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{extraDates.map((d) => <span key={d} className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{dateOnlyLabel(d)}<button type="button" onClick={() => setExtraDates(extraDates.filter((x) => x !== d))} className="text-rose-600">x</button></span>)}</div>}</div><p className="text-xs text-slate-500">Os atendimentos sao gerados automaticamente para os proximos meses e continuam sendo gerados de forma controlada enquanto a recorrencia estiver ativa.</p><button disabled={clientAddressState !== "ok"} className="rounded-xl bg-indigo-600 p-3 font-black text-white disabled:opacity-60">Salvar</button></form></Modal>;
}

// Downloads the server-generated PDF (lib/pdf.ts via GET /api/orders/:id/pdf)
// as a real file - distinct from PrintOrder's window.print() flow below,
// which stays for the browser print/physical-signature use case.
async function downloadOrderPdf(order: Order) {
  try {
    const res = await fetch(`/api/orders/${order.id}/pdf`);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || "Erro ao baixar o PDF da OS.");
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `OS-${order.code}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert(err instanceof Error ? err.message : "Erro ao baixar o PDF da OS.");
  }
}

// Shared "Enviar OS" modal for both channels, opened from OrdersView's row
// actions and from PrintOrder. Email is a real server-side send (POST
// /api/orders/:id/send generates the PDF + summary from DB data and mails
// it - see app/api/orders/[id]/send/route.ts). WhatsApp only ever opens a
// wa.me link client-side (see lib/whatsapp.ts) and best-effort logs that the
// user did so - the UI must never claim an automatic send for it.
function SendOrderModal({ order, channel, onClose }: { order: Order; channel: SendChannel; onClose: () => void }) {
  const isEmail = channel === "email";
  const [to, setTo] = useState(isEmail ? order.client?.email || "" : order.client?.phone || "");
  const [subject, setSubject] = useState(`Ordem de Servico ${order.code} - LeeveLimpeza`);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function logWhatsappSend(recipient: string) {
    // Best-effort audit entry only - the WhatsApp tab has already opened
    // regardless of whether this call succeeds, so a failure here is never
    // surfaced as an error to the user (nothing they did actually failed).
    try {
      await api(`/api/orders/${order.id}/send`, { method: "POST", body: JSON.stringify({ channel: "whatsapp", to: recipient }) });
    } catch {
      /* logging only - see comment above */
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError("");
    setSuccess("");

    if (isEmail) {
      setSending(true);
      try {
        await api(`/api/orders/${order.id}/send`, { method: "POST", body: JSON.stringify({ channel: "email", to, subject, message: message.trim() || undefined }) });
        setSuccess(`OS enviada com sucesso para ${to}`);
        setTimeout(onClose, 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nao foi possivel enviar a OS. Verifique o e-mail do cliente ou a configuracao do servidor de e-mail.");
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    const normalized = normalizeWhatsappPhone(to);
    if (!normalized) {
      setError("Numero de WhatsApp invalido. Informe DDD + numero, ex: 28 99888-7766.");
      setSending(false);
      return;
    }
    const text = buildOrderWhatsappMessage({
      code: order.code,
      eventDate: new Date(order.eventDate),
      totalAmount: order.totalAmount,
      status: order.status,
      client: order.client ? { name: order.client.name } : null,
    });
    window.open(buildWhatsappShareUrl(normalized, text), "_blank", "noopener,noreferrer");
    setSuccess("WhatsApp aberto com a OS pronta para envio. Confirme o envio na conversa do WhatsApp.");
    void logWhatsappSend(to);
    setSending(false);
    setTimeout(onClose, 1500);
  }

  return <Modal title={isEmail ? `Enviar OS ${order.code} por e-mail` : `Enviar OS ${order.code} pelo WhatsApp`} onClose={onClose}>
    <form onSubmit={submit} className="grid gap-3">
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
      {success && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{success}</p>}
      {!isEmail && <p className="text-xs text-slate-500">O sistema abre o WhatsApp com a mensagem pronta - o envio em si e confirmado por voce, la dentro do WhatsApp.</p>}
      <Input label={isEmail ? "E-mail do destinatario" : "Numero do WhatsApp"} value={to} set={setTo} required type={isEmail ? "email" : "text"} />
      {isEmail && <Input label="Assunto" value={subject} set={setSubject} required />}
      {isEmail && <Text label="Mensagem (opcional)" value={message} set={setMessage} />}
      <button disabled={sending} className="rounded-xl bg-indigo-600 p-3 font-black text-white disabled:opacity-60">{sending ? "Enviando OS..." : isEmail ? "Enviar por e-mail" : "Abrir WhatsApp"}</button>
    </form>
  </Modal>;
}

// Professional, multi-page-safe OS document. Uses the same window.print() +
// report-table/@page CSS pattern already validated for the Relatorios PDF
// (app/globals.css) - no PDF library added. Only ever renders values already
// present on `order` (server-computed totalAmount, real appointment/employee
// records) - never re-derives numbers on the client.
function PrintOrder({ order, close }: { order: Order; close: () => void }) {
  const employeeNames = order.employees.map((e) => e.employee.name).join(", ") || "Equipe nao definida";
  const [sending, setSending] = useState<SendChannel | null>(null);
  return <><Modal title={`OS ${order.code}`} onClose={close}><div className="print-page mx-auto max-w-4xl rounded-2xl border p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
      <div><h1 className="text-3xl font-black">LeeveLimpeza</h1><p className="text-sm text-slate-500">Ordem de Servico</p>{order.branch && <p className="mt-1 text-xs text-slate-400">{order.branch.name} - {order.branch.city}</p>}</div>
      <div className="text-right"><p className="font-mono text-lg font-black">{order.code}</p><p className="text-xs text-slate-500">Emitido em {new Date().toLocaleDateString("pt-BR")}</p><div className="mt-2"><Badge status={order.status} /></div></div>
    </div>

    <section className="mt-6">
      <h3 className="text-xs font-black uppercase text-slate-400">Cliente</h3>
      <div className="mt-2 grid gap-1 text-sm md:grid-cols-2">
        <p><b>Nome:</b> {order.client?.name || "-"}</p>
        {order.client?.phone && <p><b>Telefone:</b> {order.client.phone}</p>}
        {order.client?.email && <p><b>E-mail:</b> {order.client.email}</p>}
        {order.client?.address && <p className="md:col-span-2"><b>Endereco:</b> {order.client.address}</p>}
      </div>
    </section>

    <section className="mt-6">
      <h3 className="text-xs font-black uppercase text-slate-400">Endereco do atendimento</h3>
      {hasStructuredOrderAddress(order) ? (
        <div className="mt-2 grid gap-1 text-sm">
          <p><b>Rua / Logradouro:</b> {order.addressStreet}</p>
          <p><b>Numero:</b> {order.addressNumber}</p>
          <p><b>Bairro:</b> {order.addressNeighborhood}</p>
          <p><b>Cidade:</b> {order.addressCity}</p>
          <p><b>UF:</b> {order.addressState}</p>
          {order.addressZip && <p><b>CEP:</b> {order.addressZip}</p>}
          {order.addressReference && <p><b>Ponto de referencia:</b> {order.addressReference}</p>}
        </div>
      ) : (
        <p className="mt-2 text-sm">{order.location}</p>
      )}
    </section>

    <section className="mt-6">
      <h3 className="text-xs font-black uppercase text-slate-400">Servicos contratados</h3>
      <table className="report-table mt-2 w-full text-sm"><thead><tr><th className="border-b p-2 text-left">Servico</th><th className="border-b p-2 text-left">Qtd</th><th className="border-b p-2 text-right">Valor</th></tr></thead>
        <tbody>{order.items.map((i) => <tr key={i.id}><td className="border-b p-2">{i.service?.name}</td><td className="border-b p-2">{i.quantity}x</td><td className="border-b p-2 text-right">{money(i.quantity * Number(i.unitPrice))}</td></tr>)}</tbody></table>
    </section>

    {order.appointments.length > 0 && <section className="mt-6">
      <h3 className="text-xs font-black uppercase text-slate-400">Atendimentos ({order.appointments.length})</h3>
      <table className="report-table mt-2 w-full text-sm"><thead><tr><th className="border-b p-2 text-left">Data</th><th className="border-b p-2 text-left">Horario</th><th className="border-b p-2 text-left">Funcionario</th><th className="border-b p-2 text-left">Status</th></tr></thead>
        <tbody>{order.appointments.map((a) => <tr key={a.id} className={a.status === "cancelado" ? "text-rose-500" : undefined}><td className="border-b p-2">{dateOnlyLabel(a.date)}</td><td className="border-b p-2">{a.startTime} - {a.endTime}</td><td className="border-b p-2">{a.employee?.name || employeeNames}</td><td className="border-b p-2 font-bold">{statusLabels[a.status] || a.status}{a.status === "cancelado" ? " (CANCELADO)" : ""}</td></tr>)}</tbody></table>
    </section>}

    <section className="mt-6 grid gap-1 text-sm">
      <h3 className="text-xs font-black uppercase text-slate-400">Valores</h3>
      <p><b>Equipe:</b> {employeeNames}</p>
      <p><b>Forma de pagamento:</b> {paymentMethodLabel(order)}</p>
      <p className="mt-2 text-right text-xl font-black">Total: {money(order.totalAmount)}</p>
    </section>

    {order.notes && <section className="mt-4"><h3 className="text-xs font-black uppercase text-slate-400">Observacoes</h3><p className="mt-2 min-h-16 rounded-xl bg-slate-50 p-4 text-sm">{order.notes}</p></section>}

    <div className="signature-block mt-16 grid grid-cols-2 gap-12 text-center">
      <div className="border-t pt-3">Assinatura do cliente<br />{order.signatureName || order.client?.name}</div>
      <div className="border-t pt-3">Assinatura do responsavel<br />LeeveLimpeza</div>
    </div>

    <div className="no-print mt-8 flex flex-wrap gap-3">
      <button onClick={() => window.print()} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Gerar PDF / Imprimir</button>
      <button onClick={() => downloadOrderPdf(order)} className="rounded-xl border border-indigo-300 px-4 py-2 font-black text-indigo-600">Baixar PDF</button>
      <button onClick={() => setSending("email")} className="rounded-xl border border-emerald-300 px-4 py-2 font-black text-emerald-600">Enviar por e-mail</button>
      <button onClick={() => setSending("whatsapp")} className="rounded-xl border border-emerald-300 px-4 py-2 font-black text-emerald-600">Enviar pelo WhatsApp</button>
    </div>
  </div></Modal>{sending && <SendOrderModal order={order} channel={sending} onClose={() => setSending(null)} />}</>;
}

type CalendarAppointment = { id: string; date: string; startTime: string; endTime: string; status: string; employee?: { name: string } | null; branch?: { name: string } | null; order: { id: string; code: string; client?: { name: string }; items: OrderItem[] } };

// Clicking an atendimento in the day panel opens the same OS edit form used
// by OrdersView (OrderFormModal), reusing `orders` already loaded by the
// parent shell instead of re-fetching - editing there and saving refreshes
// both the parent's `orders` list and this view's own /api/calendar data
// (see reloadCalendar below), without ever leaving this tab.
function CalendarView({ branchId, employees, clients, services, orders, reload, onOrderSaved, onEditClient }: { branchId: string | null; employees: Employee[]; clients: Client[]; services: Service[]; orders: Order[]; reload: () => Promise<void>; onOrderSaved: (order: Order) => Promise<void>; onEditClient?: (clientId: string) => void }) {
  const [cursor, setCursor] = useState(new Date());
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const y = cursor.getFullYear(); const m = cursor.getMonth();
  const days = useMemo(() => [...Array(new Date(y, m, 1).getDay()).fill(null), ...Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => i + 1)], [y, m]);

  // Keeps the selected day valid when paging into a shorter month (e.g. day
  // 31 selected, then "Anterior" into a 30-day month) - without this,
  // `new Date(y, m, 31)` silently rolls over into the next month and the day
  // panel/label end up showing the wrong date.
  useEffect(() => { setSelectedDay((prev) => (prev === null ? prev : Math.min(prev, new Date(y, m + 1, 0).getDate()))); }, [y, m]);

  const requestKeyRef = useRef<string | null>(null);
  const fetchAppointments = useCallback(() => {
    if (!branchId) return Promise.resolve();
    const from = new Date(y, m, 1).toISOString().slice(0, 10);
    const to = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    const requestKey = `${branchId}:${from}:${to}`;
    requestKeyRef.current = requestKey;
    return api<CalendarAppointment[]>(`/api/calendar?branchId=${branchId}&from=${from}&to=${to}`)
      .then((data) => { if (requestKeyRef.current === requestKey) setAppointments(data); })
      .catch(() => { if (requestKeyRef.current === requestKey) setAppointments([]); });
  }, [branchId, y, m]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // OrderFormModal's own `reload` prop only refreshes the parent shell's
  // `orders` list (used to look up which OS an appointment belongs to) - it
  // never touches this view's own /api/calendar data. Editing/cancelling/
  // completing/reassigning an appointment from the calendar's own modal must
  // also re-fetch the month grid + day panel, or they show stale data until
  // the Calendario tab is left and re-entered.
  async function reloadCalendar() { await reload(); await fetchAppointments(); }

  // Same targeted update as OrdersView's onOrderSaved, plus the calendar's
  // own month-grid/day-panel refresh (fetchAppointments) - never the full
  // loadAll() (see reloadCalendar above, still used by the modal's
  // individual appointment actions).
  async function handleOrderSaved(order: Order) { await onOrderSaved(order); await fetchAppointments(); }

  // Grouped once per `appointments` change instead of re-filtering the full
  // array on every day cell's render (the month grid calls byDay() twice per
  // cell, ~84 scans/render for a 6-week grid) - same per-day contents/order,
  // just computed once and looked up by key.
  const byDayMap = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const a of appointments) {
      const key = new Date(a.date).toISOString().slice(0, 10);
      const list = map.get(key);
      if (list) list.push(a); else map.set(key, [a]);
    }
    return map;
  }, [appointments]);
  const byDay = (d: number) => byDayMap.get(new Date(y, m, d).toISOString().slice(0, 10)) ?? [];
  const selectedAppointments = selectedDay ? byDay(selectedDay) : [];
  const selectedLabel = selectedDay ? new Date(y, m, selectedDay).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) : "";

  function openAppointment(a: CalendarAppointment) {
    const found = orders.find((o) => o.id === a.order.id);
    if (found) setEditingOrder(found);
  }

  return <div className="space-y-5">
    <div className="flex justify-between rounded-2xl border bg-white p-5"><h3 className="text-lg font-black capitalize">{cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3><div className="flex gap-2"><button onClick={() => setCursor(new Date(y, m - 1, 1))} className="rounded-xl border px-4 py-2 font-bold">Anterior</button><button onClick={() => setCursor(new Date(y, m + 1, 1))} className="rounded-xl border px-4 py-2 font-bold">Proximo</button></div></div>
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="overflow-hidden rounded-2xl border bg-white lg:col-span-2"><div className="overflow-x-auto"><div className="min-w-full sm:min-w-[640px]"><div className="grid grid-cols-7 bg-slate-50 text-center text-xs font-black uppercase text-slate-500">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((x) => <div key={x} className="py-3">{x}</div>)}</div><div className="grid grid-cols-7 auto-rows-[70px] sm:auto-rows-[90px] lg:auto-rows-[110px]">{days.map((d, i) => <button type="button" key={i} disabled={!d} onClick={() => d && setSelectedDay(d)} className={`border-t border-r p-2 text-left ${d === selectedDay ? "bg-indigo-50" : ""}`}>{d && <><b className="text-xs">{d}</b><div className="mt-2 space-y-1">{byDay(d).slice(0, 3).map((a) => <div key={a.id} className="truncate rounded-lg bg-indigo-100 p-1 text-[10px] font-bold text-indigo-700">{a.startTime} {a.order.client?.name}</div>)}{byDay(d).length > 3 && <p className="text-[10px] font-bold text-slate-400">+{byDay(d).length - 3}</p>}</div></>}</button>)}</div></div></div></div>
      <div className="rounded-2xl border bg-white p-5"><h4 className="font-black capitalize">Atendimentos - {selectedLabel}</h4>{selectedAppointments.length === 0 && <p className="mt-4 text-sm text-slate-500">Nenhum atendimento neste dia.</p>}<div className="mt-4 space-y-3">{selectedAppointments.map((a) => <button type="button" key={a.id} onClick={() => openAppointment(a)} className="w-full rounded-xl border p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40"><div className="flex items-center justify-between"><b className="text-sm">{a.startTime} - {a.endTime}</b><Badge status={a.status} /></div><p className="mt-1 text-sm font-bold text-slate-800">{a.order.client?.name}</p><p className="text-xs text-slate-500">{a.order.items[0]?.service?.name}{a.order.items.length > 1 ? ` +${a.order.items.length - 1}` : ""} - OS {a.order.code}</p><p className="text-xs text-slate-500">{a.employee?.name || "Equipe da OS"} - {a.branch?.name}</p></button>)}</div></div>
    </div>
    {editingOrder && <OrderFormModal order={editingOrder} orders={orders} clients={clients} employees={employees} services={services} branchId={branchId} onClose={() => setEditingOrder(null)} reload={reloadCalendar} onSaved={handleOrderSaved} onEditClient={onEditClient} />}
  </div>;
}

// A finalized OS automatically appears here as a receita transaction (see
// lib/billing.ts) - "Ver OS" reuses the same OrderFormModal as OrdersView and
// CalendarView, cross-referencing the already-loaded `orders` prop instead of
// a separate fetch, so drilling into a movement always shows the exact same
// client/service/employees/value/payment-method data as everywhere else.
function FinanceView({ data, orders, employees, clients, services, branchId, reload, onOrderSaved, loading, onEditClient }: { data: Transaction[]; orders: Order[]; employees: Employee[]; clients: Client[]; services: Service[]; branchId: string | null; reload: () => Promise<void>; onOrderSaved: (order: Order) => Promise<void>; loading: boolean; onEditClient?: (clientId: string) => void }) { const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Transaction | null>(null); const [viewOrder, setViewOrder] = useState<Order | null>(null); const [form, setForm] = useState({ type: "receita", category: "Eventos", description: "", amount: 0, dueDate: dateOnly(), paidAt: null as string | null, status: "pago", orderId: "" }); const [error, setError] = useState("");
  // Memoized so typing in the "Novo lancamento" form (local state in this
  // same component) doesn't force a full O(n) re-scan of every transaction
  // on each keystroke - only recomputed when the transaction list itself changes.
  const totals = useMemo(() => ({ revenue: data.filter((t) => t.type === "receita" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0), expenses: data.filter((t) => t.type === "despesa" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0) }), [data]);
  // O(1) lookup per row instead of orders.find() (O(orders.length)) inside
  // the table map - same Map-lookup pattern already used by CalendarView's byDayMap.
  const ordersById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  if (loading) return <p className="text-sm text-slate-500">Carregando financeiro...</p>; async function submit(e: FormEvent) { e.preventDefault(); setError(""); try { const base = { ...form, orderId: form.orderId || null, paidAt: form.paidAt || null }; const payload = editing ? base : { ...base, branchId }; await api(editing ? `/api/transactions/${editing.id}` : "/api/transactions", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }); setOpen(false); setEditing(null); await reload(); } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar lancamento."); } } async function remove(id: string) { if (!confirm("Excluir lancamento?")) return; try { await api(`/api/transactions/${id}`, { method: "DELETE" }); await reload(); } catch (err) { alert(err instanceof Error ? err.message : "Erro ao excluir lancamento."); } } function csv() { const content = ["Data,Tipo,Categoria,Descricao,Valor,Status", ...data.map((t) => `${t.dueDate},${t.type},${t.category},"${t.description}",${t.amount},${t.status}`)].join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: "text/csv" })); a.download = "financeiro.csv"; a.click(); } return <div className="space-y-5"><div className="grid gap-4 md:grid-cols-3"><Stat label="Entradas" value={money(totals.revenue)} /><Stat label="Saidas" value={money(totals.expenses)} tone="rose" /><Stat label="Lucro" value={money(totals.revenue - totals.expenses)} tone="emerald" /></div><div className="flex justify-end gap-2"><button onClick={csv} className="rounded-xl border bg-white px-4 py-2 font-bold">Exportar CSV</button><button onClick={() => { setEditing(null); setError(""); setOpen(true); }} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Novo lancamento</button></div><div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase"><tr><th className="p-4">Data</th><th>Tipo</th><th className="hidden sm:table-cell">Categoria</th><th>Descricao</th><th className="hidden sm:table-cell">OS</th><th className="hidden sm:table-cell">Pagamento</th><th className="text-right">Valor</th><th>Status</th><th className="p-4 text-right">Acoes</th></tr></thead><tbody>{data.map((t) => { const linkedOrder = t.orderId ? ordersById.get(t.orderId) : undefined; return <tr key={t.id} className="border-t"><td className="p-4">{new Date(t.dueDate).toLocaleDateString("pt-BR")}</td><td>{t.type}</td><td className="hidden sm:table-cell">{t.category}</td><td>{t.description}</td><td className="hidden sm:table-cell">{linkedOrder ? <button onClick={() => setViewOrder(linkedOrder)} className="font-mono font-bold text-indigo-600">{linkedOrder.code}</button> : "-"}</td><td className="hidden text-xs sm:table-cell">{linkedOrder ? paymentMethodLabel(linkedOrder) : "-"}</td><td className="text-right font-black">{money(t.amount)}</td><td><Badge status={t.status} /></td><td className="p-4 text-right"><button onClick={() => { setEditing(t); setError(""); setForm({ type: t.type, category: t.category, description: t.description, amount: Number(t.amount), dueDate: dateOnly(t.dueDate), paidAt: t.paidAt ? dateOnly(t.paidAt) : null, status: t.status, orderId: t.orderId || "" }); setOpen(true); }} className="mr-2 font-bold text-indigo-600">Editar</button><button onClick={() => remove(t.id)} className="font-bold text-rose-600">Excluir</button></td></tr>; })}</tbody></table></div>{open && <Modal title="Lancamento financeiro" onClose={() => setOpen(false)}><form onSubmit={submit} className="grid gap-3">{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<Select value={form.type} set={(v) => setForm({ ...form, type: v })} options={[["receita", "Receita"], ["despesa", "Despesa"]]} /><Input label="Categoria" value={form.category} set={(v) => setForm({ ...form, category: v })} /><Input label="Descricao" value={form.description} set={(v) => setForm({ ...form, description: v })} /><NumberInput label="Valor" value={form.amount} set={(v) => setForm({ ...form, amount: v })} /><Input type="date" label="Vencimento" value={form.dueDate} set={(v) => setForm({ ...form, dueDate: v })} /><Select value={form.status} set={(v) => setForm({ ...form, status: v })} options={[["pago", "Pago"], ["pendente", "Pendente"]]} /><Select value={form.orderId} set={(v) => setForm({ ...form, orderId: v })} options={[["", "Sem OS"], ...orders.map((o) => [o.id, o.code])]} /><Save /></form></Modal>}{viewOrder && <OrderFormModal order={viewOrder} orders={orders} clients={clients} employees={employees} services={services} branchId={branchId} onClose={() => setViewOrder(null)} reload={reload} onSaved={onOrderSaved} onEditClient={onEditClient} />}</div>; }

