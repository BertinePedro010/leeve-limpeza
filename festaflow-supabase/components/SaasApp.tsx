"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { BranchProvider, useBranch } from "@/lib/branch-context";
import { statusLabels, money, dateOnly, dateOnlyLabel, api, Badge, Modal, Stat, CrudShell, ActionButtons, Input, NumberInput, Text, Select, Save, paymentMethodLabel, paymentMethodOptions, EmployeeMultiSelect } from "@/components/ui";
import ReportsView from "@/components/ReportsView";
import BranchesView from "@/components/BranchesView";
import UsersView from "@/components/UsersView";

type Tab = "dashboard" | "clients" | "employees" | "services" | "orders" | "calendar" | "finance" | "reports" | "branches" | "users";
export type Client = { id: string; name: string; email?: string; phone?: string; document?: string; address?: string; notes?: string };
export type Employee = { id: string; name: string; role: string; phone?: string; dailyRate: string | number; paymentType: string; notes?: string };
export type Service = { id: string; name: string; description?: string; price: string | number; durationHours: string | number; category: string; active: boolean };
type OrderItem = { id?: string; serviceId: string; quantity: number; unitPrice: string | number; service?: Service };
type OrderEmployee = { employee: Employee };
type Appointment = { id: string; orderId: string; branchId: string; employeeId?: string | null; employee?: { id: string; name: string } | null; date: string; startTime: string; endTime: string; status: string; notes?: string | null; cancellationReason?: string | null };
type Branch = { id: string; name: string; city: string };
type Order = { id: string; code: string; clientId: string; client?: Client; branch?: Branch; eventDate: string; startTime: string; endTime: string; location: string; status: string; paymentMethod?: string | null; paymentMethodLegacy?: string | null; notes?: string; signatureName?: string; signatureDate?: string; totalAmount: string | number; items: OrderItem[]; employees: OrderEmployee[]; appointments: Appointment[] };
type Transaction = { id: string; type: "receita" | "despesa"; category: string; description: string; amount: string | number; dueDate: string; paidAt?: string; status: "pago" | "pendente"; orderId?: string; paymentMethod?: string | null; isAutoRevenue?: boolean };
type Dashboard = { revenue: number; expenses: number; profit: number; receivable: number; payable: number; clients: number; employees: number; services: number; orders: number; activeOrders: number; completedOrders: number; upcomingOrders: Order[] };
type Me = { id: string; name: string; email: string; role: string; allowedModules: string[]; isGlobalAdmin: boolean };

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

  useEffect(() => {
    if (!activeBranchId) return;
    setClients([]); setEmployees([]); setServices([]); setOrders([]); setTransactions([]); setDashboard(null);
    loadAll().catch((err) => setMessage(err.message));
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
    <main className="flex-1 overflow-y-auto"><header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur lg:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><button onClick={() => setSidebarOpen(true)} aria-label="Abrir menu" className="rounded-xl border border-slate-200 p-2 text-slate-600 lg:hidden">☰</button><div><h2 className="text-xl font-black">{visibleNav.find(([id]) => id === tab)?.[1]}</h2><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{activeBranch?.name || "Selecione uma filial"}</p>{message && <p className="text-xs text-rose-600">{message}</p>}</div></div>{canUseModule(me, "orders") && <button onClick={() => setTab("orders")} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">Nova OS</button>}</div></header><section className="p-4 lg:p-8">{tab === "dashboard" && <DashboardView dashboard={dashboard} />}{tab === "clients" && <ClientsView data={clients} branchId={activeBranchId} reload={loadAll} />}{tab === "employees" && <EmployeesView data={employees} branchId={activeBranchId} reload={loadAll} />}{tab === "services" && <ServicesView data={services} branchId={activeBranchId} reload={loadAll} />}{tab === "orders" && <OrdersView orders={orders} clients={clients} employees={employees} services={services} branchId={activeBranchId} reload={loadAll} />}{tab === "calendar" && <CalendarView branchId={activeBranchId} employees={employees} clients={clients} services={services} orders={orders} reload={loadAll} />}{tab === "finance" && <FinanceView data={transactions} orders={orders} employees={employees} clients={clients} services={services} branchId={activeBranchId} reload={loadAll} />}{tab === "reports" && <ReportsView employees={employees} services={services} isGlobalAdmin={!!me?.isGlobalAdmin} />}{tab === "branches" && <BranchesView />}{tab === "users" && <UsersView />}</section></main>
  </div>;
}

function DashboardView({ dashboard }: { dashboard: Dashboard | null }) {
  if (!dashboard) return <p>Carregando...</p>;
  return <div className="space-y-6"><div className="grid gap-4 md:grid-cols-4"><Stat label="Faturamento" value={money(dashboard.revenue)} /><Stat label="Lucro" value={money(dashboard.profit)} tone="emerald" /><Stat label="OS ativas" value={dashboard.activeOrders} tone="amber" /><Stat label="Eventos concluidos" value={dashboard.completedOrders} /></div><div className="grid gap-6 lg:grid-cols-3"><div className="rounded-2xl border bg-white p-6 shadow-sm lg:col-span-2"><h3 className="font-black">Resumo financeiro</h3><div className="mt-5 grid gap-4 md:grid-cols-2"><Stat label="Despesas" value={money(dashboard.expenses)} tone="rose" /><Stat label="Contas a receber" value={money(dashboard.receivable)} /><Stat label="Contas a pagar" value={money(dashboard.payable)} tone="amber" /><Stat label="Eventos" value={dashboard.orders} /></div></div><div className="rounded-2xl border bg-white p-6 shadow-sm"><h3 className="font-black">Proximos eventos</h3><div className="mt-4 space-y-3">{dashboard.upcomingOrders.map((o) => <div key={o.id} className="rounded-xl border p-3"><div className="flex justify-between"><b>{o.code}</b><Badge status={o.status} /></div><p className="mt-1 text-xs text-slate-500">{new Date(o.eventDate).toLocaleDateString("pt-BR")} - {o.client?.name}</p></div>)}</div></div></div></div>;
}

function ClientsView({ data, branchId, reload }: { data: Client[]; branchId: string | null; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Client | null>(null); const [form, setForm] = useState({ name: "", email: "", phone: "", document: "", address: "", notes: "" }); const [error, setError] = useState("");
  async function submit(e: FormEvent) { e.preventDefault(); setError(""); try { const payload = editing ? form : { ...form, branchId }; await api(editing ? `/api/clients/${editing.id}` : "/api/clients", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }); setOpen(false); setEditing(null); await reload(); } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar cliente."); } }
  async function remove(id: string) { if (!confirm("Excluir cliente?")) return; try { await api(`/api/clients/${id}`, { method: "DELETE" }); await reload(); } catch (err) { alert(err instanceof Error ? err.message : "Erro ao excluir cliente."); } }
  return <CrudShell title="Clientes" onNew={() => { setEditing(null); setError(""); setForm({ name: "", email: "", phone: "", document: "", address: "", notes: "" }); setOpen(true); }}>{data.map((c) => <div key={c.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-black">{c.name}</h3><ActionButtons onEdit={() => { setEditing(c); setError(""); setForm({ name: c.name, email: c.email || "", phone: c.phone || "", document: c.document || "", address: c.address || "", notes: c.notes || "" }); setOpen(true); }} onDelete={() => remove(c.id)} /></div><p className="mt-2 text-sm text-slate-500">{c.phone} | {c.email}</p><p className="text-sm text-slate-500">{c.document}</p><p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{c.notes || "Sem observacoes"}</p></div>)}{open && <Modal title={editing ? "Editar cliente" : "Novo cliente"} onClose={() => setOpen(false)}><form onSubmit={submit} className="grid gap-3">{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<Input label="Nome" value={form.name} set={(v) => setForm({ ...form, name: v })} required /><Input label="Email" value={form.email} set={(v) => setForm({ ...form, email: v })} /><Input label="Telefone" value={form.phone} set={(v) => setForm({ ...form, phone: v })} /><Input label="CPF/CNPJ" value={form.document} set={(v) => setForm({ ...form, document: v })} /><Input label="Endereco" value={form.address} set={(v) => setForm({ ...form, address: v })} /><Text label="Observacoes" value={form.notes} set={(v) => setForm({ ...form, notes: v })} /><Save /></form></Modal>}</CrudShell>;
}

function EmployeesView({ data, branchId, reload }: { data: Employee[]; branchId: string | null; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Employee | null>(null); const [form, setForm] = useState({ name: "", role: "", phone: "", dailyRate: 0, paymentType: "diaria", notes: "" }); const [error, setError] = useState("");
  async function submit(e: FormEvent) { e.preventDefault(); setError(""); try { const payload = editing ? form : { ...form, branchId }; await api(editing ? `/api/employees/${editing.id}` : "/api/employees", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }); setOpen(false); setEditing(null); await reload(); } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar funcionario."); } }
  async function remove(id: string) { if (!confirm("Excluir funcionario?")) return; try { await api(`/api/employees/${id}`, { method: "DELETE" }); await reload(); } catch (err) { alert(err instanceof Error ? err.message : "Erro ao excluir funcionario."); } }
  return <CrudShell title="Funcionarios" onNew={() => { setEditing(null); setError(""); setForm({ name: "", role: "", phone: "", dailyRate: 0, paymentType: "diaria", notes: "" }); setOpen(true); }}>{data.map((x) => <div key={x.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-black">{x.name}</h3><ActionButtons onEdit={() => { setEditing(x); setError(""); setForm({ name: x.name, role: x.role, phone: x.phone || "", dailyRate: Number(x.dailyRate), paymentType: x.paymentType, notes: x.notes || "" }); setOpen(true); }} onDelete={() => remove(x.id)} /></div><p className="text-sm font-bold text-indigo-600">{x.role}</p><p className="text-sm text-slate-500">{x.phone}</p><p className="mt-2 font-black text-emerald-600">{money(x.dailyRate)} / {x.paymentType}</p></div>)}{open && <Modal title={editing ? "Editar funcionario" : "Novo funcionario"} onClose={() => setOpen(false)}><form onSubmit={submit} className="grid gap-3">{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<Input label="Nome" value={form.name} set={(v) => setForm({ ...form, name: v })} required /><Input label="Cargo" value={form.role} set={(v) => setForm({ ...form, role: v })} required /><Input label="Telefone" value={form.phone} set={(v) => setForm({ ...form, phone: v })} /><NumberInput label="Valor diaria/salario" value={form.dailyRate} set={(v) => setForm({ ...form, dailyRate: v })} /><Input label="Tipo pagamento" value={form.paymentType} set={(v) => setForm({ ...form, paymentType: v })} /><Text label="Observacoes" value={form.notes} set={(v) => setForm({ ...form, notes: v })} /><Save /></form></Modal>}</CrudShell>;
}

function ServicesView({ data, branchId, reload }: { data: Service[]; branchId: string | null; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Service | null>(null); const [form, setForm] = useState({ name: "", description: "", price: 0, durationHours: 0, category: "Geral", active: true }); const [error, setError] = useState("");
  async function submit(e: FormEvent) { e.preventDefault(); setError(""); try { const payload = editing ? form : { ...form, branchId }; await api(editing ? `/api/services/${editing.id}` : "/api/services", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }); setOpen(false); setEditing(null); await reload(); } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar servico."); } }
  async function remove(id: string) { if (!confirm("Excluir servico?")) return; try { await api(`/api/services/${id}`, { method: "DELETE" }); await reload(); } catch (err) { alert(err instanceof Error ? err.message : "Erro ao excluir servico."); } }
  return <CrudShell title="Servicos" onNew={() => { setEditing(null); setError(""); setOpen(true); }}>{data.map((s) => <div key={s.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase text-indigo-700">{s.category}</span><ActionButtons onEdit={() => { setEditing(s); setError(""); setForm({ name: s.name, description: s.description || "", price: Number(s.price), durationHours: Number(s.durationHours), category: s.category, active: s.active }); setOpen(true); }} onDelete={() => remove(s.id)} /></div><h3 className="mt-3 font-black">{s.name}</h3><p className="mt-2 text-sm text-slate-500">{s.description}</p><p className="mt-3 font-black text-emerald-600">{money(s.price)}</p></div>)}{open && <Modal title={editing ? "Editar servico" : "Novo servico"} onClose={() => setOpen(false)}><form onSubmit={submit} className="grid gap-3">{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<Input label="Nome" value={form.name} set={(v) => setForm({ ...form, name: v })} required /><Text label="Descricao" value={form.description} set={(v) => setForm({ ...form, description: v })} /><NumberInput label="Preco" value={form.price} set={(v) => setForm({ ...form, price: v })} /><NumberInput label="Duracao horas" value={form.durationHours} set={(v) => setForm({ ...form, durationHours: v })} /><Input label="Categoria" value={form.category} set={(v) => setForm({ ...form, category: v })} required /><Save /></form></Modal>}</CrudShell>;
}

function OrdersView({ orders, clients, employees, services, branchId, reload }: { orders: Order[]; clients: Client[]; employees: Employee[]; services: Service[]; branchId: string | null; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false); const [print, setPrint] = useState<Order | null>(null); const [editing, setEditing] = useState<Order | null>(null);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);

  async function removeOrder(id: string) { if (!confirm("Excluir OS?")) return; try { await api(`/api/orders/${id}`, { method: "DELETE" }); await reload(); } catch (err) { alert(err instanceof Error ? err.message : "Erro ao excluir OS."); } }

  return <div className="space-y-5"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm text-slate-500">OS com multiplos atendimentos, recorrencia, equipe, assinatura e impressao/PDF.</p><div className="flex gap-2"><button onClick={() => setRecurrenceOpen(true)} className="rounded-xl border border-indigo-300 px-4 py-2 font-black text-indigo-600">Nova Recorrencia</button><button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Nova OS</button></div></div><div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Codigo</th><th>Cliente</th><th className="hidden sm:table-cell">Data</th><th className="hidden sm:table-cell">Atendimentos</th><th className="hidden sm:table-cell">Pagamento</th><th>Status</th><th className="text-right">Valor</th><th className="p-4 text-right">Acoes</th></tr></thead><tbody>{orders.map((o) => <tr key={o.id} className="border-t"><td className="p-4 font-mono font-black">{o.code}</td><td>{o.client?.name}</td><td className="hidden sm:table-cell">{new Date(o.eventDate).toLocaleDateString("pt-BR")}</td><td className="hidden sm:table-cell">{o.appointments?.length ?? 0}</td><td className="hidden text-xs sm:table-cell">{paymentMethodLabel(o)}</td><td><Badge status={o.status} /></td><td className="text-right font-black text-indigo-600">{money(o.totalAmount)}</td><td className="p-4 text-right"><button onClick={() => setPrint(o)} className="mr-2 font-bold">PDF</button><button onClick={() => { setEditing(o); setOpen(true); }} className="mr-2 font-bold text-indigo-600">Editar</button><button onClick={() => removeOrder(o.id)} className="font-bold text-rose-600">Excluir</button></td></tr>)}</tbody></table></div>{open && <OrderFormModal order={editing} orders={orders} clients={clients} employees={employees} services={services} branchId={branchId} onClose={() => setOpen(false)} reload={reload} />}{print && <PrintOrder order={print} close={() => setPrint(null)} />}{recurrenceOpen && <RecurrenceModal clients={clients} services={services} employees={employees} branchId={branchId} close={() => setRecurrenceOpen(false)} onCreated={reload} />}</div>;
}

// Shared "Nova/Editar OS" form, reused by OrdersView, CalendarView (click an
// atendimento -> edit its OS) and FinanceView (click a movement -> open its
// OS). `order` is the live record from the parent's already-loaded `orders`
// list; `orders` is kept as a prop (not refetched here) purely so this modal
// can re-sync itself from that same list after every reload() - the same
// pattern the original OrdersView used, now shared across all three callers.
function OrderFormModal({ order, orders, clients, employees, services, branchId, onClose, reload }: { order: Order | null; orders: Order[]; clients: Client[]; employees: Employee[]; services: Service[]; branchId: string | null; onClose: () => void; reload: () => Promise<void> }) {
  const blank = { clientId: clients[0]?.id || "", eventDate: dateOnly(), startTime: "18:00", endTime: "23:59", location: "", status: "pendente", paymentMethod: "", notes: "", signatureName: "", employeeIds: [] as string[], items: [] as Array<{ serviceId: string; quantity: number; unitPrice: number }> };
  function fromOrder(o: Order) { return { clientId: o.clientId, eventDate: dateOnly(o.eventDate), startTime: o.startTime, endTime: o.endTime, location: o.location, status: o.status, paymentMethod: o.paymentMethod || "", notes: o.notes || "", signatureName: o.signatureName || "", employeeIds: o.employees.map((x) => x.employee.id), items: o.items.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity, unitPrice: Number(i.unitPrice) })) }; }

  const [current, setCurrent] = useState<Order | null>(order);
  const [form, setForm] = useState(() => (order ? fromOrder(order) : blank));
  const [serviceId, setServiceId] = useState(services[0]?.id || "");
  const [error, setError] = useState("");
  const [extraDates, setExtraDates] = useState<string[]>([]); const [newDate, setNewDate] = useState("");
  const total = form.items.reduce((s, i) => s + i.quantity * Number(i.unitPrice), 0);

  // Keeps `current` (and the AppointmentsSection it feeds) fresh after any
  // action taken on a sibling appointment, without closing the modal - the
  // same sync-from-parent-list pattern the original inline form used.
  useEffect(() => { if (current) { const fresh = orders.find((o) => o.id === current.id); if (fresh) setCurrent(fresh); } }, [orders]);

  function addService() { const s = services.find((x) => x.id === serviceId); if (!s) return; setForm({ ...form, items: [...form.items, { serviceId: s.id, quantity: 1, unitPrice: Number(s.price) }] }); }
  function addDate() { if (newDate && newDate !== form.eventDate && !extraDates.includes(newDate)) { setExtraDates([...extraDates, newDate].sort()); setNewDate(""); } }
  function removeDate(d: string) { setExtraDates(extraDates.filter((x) => x !== d)); }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      const payload = current ? form : { ...form, branchId, ...(extraDates.length ? { dates: [form.eventDate, ...extraDates] } : {}) };
      await api(current ? `/api/orders/${current.id}` : "/api/orders", { method: current ? "PUT" : "POST", body: JSON.stringify(payload) });
      await reload();
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar OS."); }
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

  return <Modal title={current ? `Editar OS ${current.code}` : "Nova OS"} onClose={onClose}><form onSubmit={submit} className="space-y-4">{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<div className="grid gap-3 md:grid-cols-3"><Select value={form.clientId} set={(v) => setForm({ ...form, clientId: v })} options={clients.map((c) => [c.id, c.name])} /><Input type="date" label="Data" value={form.eventDate} set={(v) => setForm({ ...form, eventDate: v })} /><Select value={form.status} set={(v) => setForm({ ...form, status: v })} options={[["pendente", "Pendente"], ["confirmado", "Confirmado"], ["em_andamento", "Em andamento"], ["finalizado", "Finalizado"], ["cancelado", "Cancelado"]]} /><Input label="Inicio" value={form.startTime} set={(v) => setForm({ ...form, startTime: v })} /><Input label="Fim" value={form.endTime} set={(v) => setForm({ ...form, endTime: v })} /><label className="grid gap-1 text-xs font-black uppercase text-slate-500">Pagamento<Select value={form.paymentMethod} set={(v) => setForm({ ...form, paymentMethod: v })} options={paymentMethodOptions} /></label></div>{current?.paymentMethodLegacy && !current.paymentMethod && <p className="text-xs text-slate-400">Valor legado registrado anteriormente: <b>{current.paymentMethodLegacy}</b> (selecione uma opcao acima para substituir por um valor controlado).</p>}<Input label="Local" value={form.location} set={(v) => setForm({ ...form, location: v })} required />{!current && <div className="rounded-2xl bg-slate-50 p-4"><h4 className="font-black">Datas adicionais (opcional)</h4><p className="text-xs text-slate-500">Cria um atendimento para a data principal acima e mais um para cada data adicionada aqui, todos na mesma OS.</p><div className="mt-3 flex gap-2"><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="rounded-xl border p-3" /><button type="button" onClick={addDate} className="rounded-xl bg-slate-950 px-4 font-black text-white">Adicionar data</button></div>{extraDates.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{extraDates.map((d) => <span key={d} className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{new Date(d).toLocaleDateString("pt-BR")}<button type="button" onClick={() => removeDate(d)} className="text-rose-600">x</button></span>)}</div>}</div>}<div className="rounded-2xl bg-slate-50 p-4"><h4 className="font-black">Servicos contratados</h4><div className="mt-3 flex flex-wrap gap-2"><select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full rounded-xl border p-3">{services.map((s) => <option key={s.id} value={s.id}>{s.name} - {money(s.price)}</option>)}</select><button type="button" onClick={addService} className="rounded-xl bg-slate-950 px-4 font-black text-white">Adicionar</button></div>{form.items.map((i, idx) => <div key={idx} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3"><span className="min-w-0 flex-1 break-words">{services.find((s) => s.id === i.serviceId)?.name}</span><input type="number" min={1} value={i.quantity} onChange={(e) => setForm({ ...form, items: form.items.map((x, n) => n === idx ? { ...x, quantity: Number(e.target.value) } : x) })} className="w-16 shrink-0 rounded border p-2" /><b className="shrink-0">{money(i.quantity * Number(i.unitPrice))}</b><button type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, n) => n !== idx) })} className="shrink-0 font-bold text-rose-600">Remover</button></div>)}<p className="mt-3 text-right text-lg font-black">Total: {money(total)}</p></div><EmployeeMultiSelect employees={employees} selected={form.employeeIds} onChange={(ids) => setForm({ ...form, employeeIds: ids })} /><Text label="Observacoes" value={form.notes} set={(v) => setForm({ ...form, notes: v })} /><Input label="Assinatura" value={form.signatureName} set={(v) => setForm({ ...form, signatureName: v })} />{current && <AppointmentsSection appointments={current.appointments} employees={employees} onCancel={cancelAppointment} onComplete={completeAppointment} onReschedule={rescheduleAppointment} onAssign={assignEmployee} />}<Save /></form></Modal>;
}

function AppointmentsSection({ appointments, employees, onCancel, onComplete, onReschedule, onAssign }: { appointments: Appointment[]; employees: Employee[]; onCancel: (id: string) => void; onComplete: (id: string) => void; onReschedule: (id: string, date: string, startTime: string, endTime: string) => void; onAssign: (id: string, employeeId: string) => void }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><h4 className="font-black">Atendimentos ({appointments.length})</h4><div className="mt-3 space-y-2">{appointments.map((a) => <AppointmentRow key={a.id} appointment={a} employees={employees} onCancel={onCancel} onComplete={onComplete} onReschedule={onReschedule} onAssign={onAssign} />)}</div></div>;
}

function AppointmentRow({ appointment, employees, onCancel, onComplete, onReschedule, onAssign }: { appointment: Appointment; employees: Employee[]; onCancel: (id: string) => void; onComplete: (id: string) => void; onReschedule: (id: string, date: string, startTime: string, endTime: string) => void; onAssign: (id: string, employeeId: string) => void }) {
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
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <select value={appointment.employeeId || ""} onChange={(e) => onAssign(appointment.id, e.target.value)} disabled={isFinal} className="rounded border p-2 text-xs"><option value="">Equipe da OS (padrao)</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      {!isFinal && <div className="flex gap-3"><button type="button" onClick={() => onComplete(appointment.id)} className="text-xs font-bold text-emerald-600">Marcar realizado</button><button type="button" onClick={() => onCancel(appointment.id)} className="text-xs font-bold text-rose-600">Cancelar atendimento</button></div>}
    </div>
    {appointment.status === "cancelado" && appointment.cancellationReason && <p className="mt-2 text-xs text-rose-500">Motivo: {appointment.cancellationReason}</p>}
  </div>;
}

function RecurrenceModal({ clients, services, employees, branchId, close, onCreated }: { clients: Client[]; services: Service[]; employees: Employee[]; branchId: string | null; close: () => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({ clientId: clients[0]?.id || "", serviceId: services[0]?.id || "", frequency: "monthly", interval: 1, dayOfWeek: 1, dayOfMonth: 10, startTime: "09:00", endTime: "11:00", price: 0, startDate: dateOnly(), endDate: "", location: "", employeeIds: [] as string[] });
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      const payload = { ...form, branchId, endDate: form.endDate || null, dayOfWeek: form.frequency === "weekly" ? form.dayOfWeek : null, dayOfMonth: form.frequency === "monthly" ? form.dayOfMonth : null };
      await api("/api/recurring-schedules", { method: "POST", body: JSON.stringify(payload) });
      close(); await onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao criar recorrencia."); }
  }
  return <Modal title="Nova Recorrencia" onClose={close}><form onSubmit={submit} className="grid gap-3">{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<Select value={form.clientId} set={(v) => setForm({ ...form, clientId: v })} options={clients.map((c) => [c.id, c.name])} /><Select value={form.serviceId} set={(v) => setForm({ ...form, serviceId: v })} options={services.map((s) => [s.id, `${s.name} - ${money(s.price)}`])} /><div className="grid gap-3 md:grid-cols-2"><Select value={form.frequency} set={(v) => setForm({ ...form, frequency: v })} options={[["weekly", "Semanal"], ["monthly", "Mensal"]]} /><NumberInput label={form.frequency === "weekly" ? "Repetir a cada (semanas)" : "Repetir a cada (meses)"} value={form.interval} set={(v) => setForm({ ...form, interval: v })} /></div>{form.frequency === "weekly" ? <Select value={String(form.dayOfWeek)} set={(v) => setForm({ ...form, dayOfWeek: Number(v) })} options={[["0", "Domingo"], ["1", "Segunda"], ["2", "Terca"], ["3", "Quarta"], ["4", "Quinta"], ["5", "Sexta"], ["6", "Sabado"]]} /> : <NumberInput label="Dia do mes" value={form.dayOfMonth} set={(v) => setForm({ ...form, dayOfMonth: v })} />}<div className="grid gap-3 md:grid-cols-2"><Input label="Horario inicio" value={form.startTime} set={(v) => setForm({ ...form, startTime: v })} /><Input label="Horario fim" value={form.endTime} set={(v) => setForm({ ...form, endTime: v })} /></div><NumberInput label="Valor mensal" value={form.price} set={(v) => setForm({ ...form, price: v })} /><div className="grid gap-3 md:grid-cols-2"><Input type="date" label="Data inicial" value={form.startDate} set={(v) => setForm({ ...form, startDate: v })} /><Input type="date" label="Data final (opcional)" value={form.endDate} set={(v) => setForm({ ...form, endDate: v })} /></div><Input label="Local" value={form.location} set={(v) => setForm({ ...form, location: v })} required /><EmployeeMultiSelect employees={employees} selected={form.employeeIds} onChange={(ids) => setForm({ ...form, employeeIds: ids })} /><p className="text-xs text-slate-500">Os atendimentos sao gerados automaticamente para os proximos meses e continuam sendo gerados de forma controlada enquanto a recorrencia estiver ativa.</p><Save /></form></Modal>;
}

// Professional, multi-page-safe OS document. Uses the same window.print() +
// report-table/@page CSS pattern already validated for the Relatorios PDF
// (app/globals.css) - no PDF library added. Only ever renders values already
// present on `order` (server-computed totalAmount, real appointment/employee
// records) - never re-derives numbers on the client.
function PrintOrder({ order, close }: { order: Order; close: () => void }) {
  const employeeNames = order.employees.map((e) => e.employee.name).join(", ") || "Equipe nao definida";
  return <Modal title={`OS ${order.code}`} onClose={close}><div className="print-page mx-auto max-w-4xl rounded-2xl border p-8">
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
        <p className="md:col-span-2"><b>Local do servico:</b> {order.location}</p>
      </div>
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

    <button onClick={() => window.print()} className="no-print mt-8 rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Gerar PDF / Imprimir</button>
  </div></Modal>;
}

type CalendarAppointment = { id: string; date: string; startTime: string; endTime: string; status: string; employee?: { name: string } | null; branch?: { name: string } | null; order: { id: string; code: string; client?: { name: string }; items: OrderItem[] } };

// Clicking an atendimento in the day panel opens the same OS edit form used
// by OrdersView (OrderFormModal), reusing `orders` already loaded by the
// parent shell instead of re-fetching - editing there and saving refreshes
// both the parent's `orders` list and this view's own /api/calendar data
// (see reloadCalendar below), without ever leaving this tab.
function CalendarView({ branchId, employees, clients, services, orders, reload }: { branchId: string | null; employees: Employee[]; clients: Client[]; services: Service[]; orders: Order[]; reload: () => Promise<void> }) {
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

  const byDay = (d: number) => appointments.filter((a) => new Date(a.date).toISOString().slice(0, 10) === new Date(y, m, d).toISOString().slice(0, 10));
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
    {editingOrder && <OrderFormModal order={editingOrder} orders={orders} clients={clients} employees={employees} services={services} branchId={branchId} onClose={() => setEditingOrder(null)} reload={reloadCalendar} />}
  </div>;
}

// A finalized OS automatically appears here as a receita transaction (see
// lib/billing.ts) - "Ver OS" reuses the same OrderFormModal as OrdersView and
// CalendarView, cross-referencing the already-loaded `orders` prop instead of
// a separate fetch, so drilling into a movement always shows the exact same
// client/service/employees/value/payment-method data as everywhere else.
function FinanceView({ data, orders, employees, clients, services, branchId, reload }: { data: Transaction[]; orders: Order[]; employees: Employee[]; clients: Client[]; services: Service[]; branchId: string | null; reload: () => Promise<void> }) { const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Transaction | null>(null); const [viewOrder, setViewOrder] = useState<Order | null>(null); const [form, setForm] = useState({ type: "receita", category: "Eventos", description: "", amount: 0, dueDate: dateOnly(), paidAt: null as string | null, status: "pago", orderId: "" }); const [error, setError] = useState(""); const totals = { revenue: data.filter((t) => t.type === "receita" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0), expenses: data.filter((t) => t.type === "despesa" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0) }; async function submit(e: FormEvent) { e.preventDefault(); setError(""); try { const base = { ...form, orderId: form.orderId || null, paidAt: form.paidAt || null }; const payload = editing ? base : { ...base, branchId }; await api(editing ? `/api/transactions/${editing.id}` : "/api/transactions", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }); setOpen(false); setEditing(null); await reload(); } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar lancamento."); } } async function remove(id: string) { if (!confirm("Excluir lancamento?")) return; try { await api(`/api/transactions/${id}`, { method: "DELETE" }); await reload(); } catch (err) { alert(err instanceof Error ? err.message : "Erro ao excluir lancamento."); } } function csv() { const content = ["Data,Tipo,Categoria,Descricao,Valor,Status", ...data.map((t) => `${t.dueDate},${t.type},${t.category},"${t.description}",${t.amount},${t.status}`)].join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: "text/csv" })); a.download = "financeiro.csv"; a.click(); } return <div className="space-y-5"><div className="grid gap-4 md:grid-cols-3"><Stat label="Entradas" value={money(totals.revenue)} /><Stat label="Saidas" value={money(totals.expenses)} tone="rose" /><Stat label="Lucro" value={money(totals.revenue - totals.expenses)} tone="emerald" /></div><div className="flex justify-end gap-2"><button onClick={csv} className="rounded-xl border bg-white px-4 py-2 font-bold">Exportar CSV</button><button onClick={() => { setEditing(null); setError(""); setOpen(true); }} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Novo lancamento</button></div><div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase"><tr><th className="p-4">Data</th><th>Tipo</th><th className="hidden sm:table-cell">Categoria</th><th>Descricao</th><th className="hidden sm:table-cell">OS</th><th className="hidden sm:table-cell">Pagamento</th><th className="text-right">Valor</th><th>Status</th><th className="p-4 text-right">Acoes</th></tr></thead><tbody>{data.map((t) => { const linkedOrder = t.orderId ? orders.find((o) => o.id === t.orderId) : undefined; return <tr key={t.id} className="border-t"><td className="p-4">{new Date(t.dueDate).toLocaleDateString("pt-BR")}</td><td>{t.type}</td><td className="hidden sm:table-cell">{t.category}</td><td>{t.description}</td><td className="hidden sm:table-cell">{linkedOrder ? <button onClick={() => setViewOrder(linkedOrder)} className="font-mono font-bold text-indigo-600">{linkedOrder.code}</button> : "-"}</td><td className="hidden text-xs sm:table-cell">{linkedOrder ? paymentMethodLabel(linkedOrder) : "-"}</td><td className="text-right font-black">{money(t.amount)}</td><td><Badge status={t.status} /></td><td className="p-4 text-right"><button onClick={() => { setEditing(t); setError(""); setForm({ type: t.type, category: t.category, description: t.description, amount: Number(t.amount), dueDate: dateOnly(t.dueDate), paidAt: t.paidAt ? dateOnly(t.paidAt) : null, status: t.status, orderId: t.orderId || "" }); setOpen(true); }} className="mr-2 font-bold text-indigo-600">Editar</button><button onClick={() => remove(t.id)} className="font-bold text-rose-600">Excluir</button></td></tr>; })}</tbody></table></div>{open && <Modal title="Lancamento financeiro" onClose={() => setOpen(false)}><form onSubmit={submit} className="grid gap-3">{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}<Select value={form.type} set={(v) => setForm({ ...form, type: v })} options={[["receita", "Receita"], ["despesa", "Despesa"]]} /><Input label="Categoria" value={form.category} set={(v) => setForm({ ...form, category: v })} /><Input label="Descricao" value={form.description} set={(v) => setForm({ ...form, description: v })} /><NumberInput label="Valor" value={form.amount} set={(v) => setForm({ ...form, amount: v })} /><Input type="date" label="Vencimento" value={form.dueDate} set={(v) => setForm({ ...form, dueDate: v })} /><Select value={form.status} set={(v) => setForm({ ...form, status: v })} options={[["pago", "Pago"], ["pendente", "Pendente"]]} /><Select value={form.orderId} set={(v) => setForm({ ...form, orderId: v })} options={[["", "Sem OS"], ...orders.map((o) => [o.id, o.code])]} /><Save /></form></Modal>}{viewOrder && <OrderFormModal order={viewOrder} orders={orders} clients={clients} employees={employees} services={services} branchId={branchId} onClose={() => setViewOrder(null)} reload={reload} />}</div>; }

