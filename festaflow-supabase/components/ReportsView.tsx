"use client";

import { useEffect, useState } from "react";
import { useBranch } from "@/lib/branch-context";
import { api, money, Badge, Select, Input, Stat, paymentMethodLabels, paymentMethodOptions } from "@/components/ui";
import type { Employee, Service } from "@/components/SaasApp";
import { ORDER_STATUS_VALUES, orderStatusLabels } from "@/lib/order-status";

type ReportType = "employees" | "employee" | "services" | "appointments" | "os" | "cancellations" | "clients";
type Period = "hoje" | "ontem" | "semana" | "mes" | "mes_anterior" | "personalizado";

const reportTypes: Array<[ReportType, string]> = [
  ["employees", "Funcionarios"],
  ["employee", "Funcionario individual"],
  ["services", "Servicos prestados"],
  ["appointments", "Atendimentos"],
  ["os", "Ordens de Servico"],
  ["cancellations", "Cancelamentos"],
  ["clients", "Por Cliente"],
];
const periods: Array<[Period, string]> = [["hoje", "Hoje"], ["ontem", "Ontem"], ["semana", "Esta semana"], ["mes", "Este mes"], ["mes_anterior", "Mes anterior"], ["personalizado", "Personalizado"]];
const statuses = [["", "Todos"], ...ORDER_STATUS_VALUES.map((s) => [s, orderStatusLabels[s]])];

function endpointFor(type: ReportType, employeeId: string): string {
  if (type === "employee") return `/api/reports/employees/${employeeId}`;
  if (type === "employees") return "/api/reports/employees";
  if (type === "services") return "/api/reports/services";
  if (type === "appointments") return "/api/reports/appointments";
  if (type === "os") return "/api/reports/os";
  if (type === "clients") return "/api/reports/clients";
  return "/api/reports/cancellations";
}

export default function ReportsView({ employees, services, isGlobalAdmin }: { employees: Employee[]; services: Service[]; isGlobalAdmin: boolean }) {
  const { branches, activeBranchId } = useBranch();
  const [type, setType] = useState<ReportType>("appointments");
  const [period, setPeriod] = useState<Period>("mes");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branchId, setBranchId] = useState(activeBranchId ?? "");
  const [clientId, setClientId] = useState("");
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [status, setStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  // The CLIENTE picker is scoped to the selected FILIAL and only relevant for
  // the "Por Cliente" report. Re-fetched whenever the branch changes; if the
  // currently selected client is not in the new branch's list it is reset to
  // "Todos os clientes" so an invalid FILIAL x CLIENTE pair can never be sent.
  useEffect(() => {
    if (type !== "clients") return;
    let cancelled = false;
    api<Array<{ id: string; name: string }>>(`/api/reports/clients/options?branchId=${encodeURIComponent(branchId)}`)
      .then((opts) => {
        if (cancelled) return;
        setClientOptions(opts);
        setClientId((current) => (current && opts.some((o) => o.id === current) ? current : ""));
      })
      .catch(() => {
        if (cancelled) return;
        setClientOptions([]);
        setClientId("");
      });
    return () => { cancelled = true; };
  }, [type, branchId]);

  async function generate() {
    setError(""); setLoading(true); setResult(null);
    try {
      if (type === "employee" && !employeeId) throw new Error("Selecione um funcionario.");
      const params = new URLSearchParams();
      if (type !== "employee") params.set("branchId", branchId);
      params.set("period", period);
      if (period === "personalizado") { params.set("from", from); params.set("to", to); }
      if (employeeId && type !== "employee") params.set("employeeId", employeeId);
      if (clientId && type === "clients") params.set("clientId", clientId);
      if (serviceId) params.set("serviceId", serviceId);
      if (status) params.set("status", status);
      if (paymentMethod && type === "os") params.set("paymentMethod", paymentMethod);
      const data = await api(`${endpointFor(type, employeeId)}?${params.toString()}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar relatorio.");
    } finally {
      setLoading(false);
    }
  }

  const printFilters = {
    periodLabel: periods.find(([p]) => p === period)?.[1] ?? period,
    branchLabel: branchId === "all" ? "Todas" : branches.find((b) => b.id === branchId)?.name ?? branchId,
    clientLabel: clientId ? clientOptions.find((c) => c.id === clientId)?.name ?? clientId : "Todos os clientes",
    employeeLabel: employeeId ? employees.find((e) => e.id === employeeId)?.name ?? employeeId : "Todos",
    serviceLabel: serviceId ? services.find((s) => s.id === serviceId)?.name ?? serviceId : "Todos",
    status,
  };

  return <div className="space-y-6">
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h3 className="font-black">Relatorios</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {type !== "employee" && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Filial<Select value={branchId} set={setBranchId} options={[...branches.map((b) => [b.id, b.name]), ...(isGlobalAdmin ? [["all", "Todas"]] : [])]} /></label>}
        {type === "employee" && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Funcionario<Select value={employeeId} set={setEmployeeId} options={employees.map((e) => [e.id, e.name])} /></label>}
        {type === "clients" && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Cliente<Select value={clientId} set={setClientId} options={[["", "Todos os clientes"], ...clientOptions.map((c) => [c.id, c.name])]} /></label>}
        <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Tipo<Select value={type} set={(v) => setType(v as ReportType)} options={reportTypes} /></label>
        <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Periodo<Select value={period} set={(v) => setPeriod(v as Period)} options={periods} /></label>
        {(type === "appointments" || type === "services" || type === "employees" || type === "clients") && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Funcionario<Select value={employeeId} set={setEmployeeId} options={[["", "Todos"], ...employees.map((e) => [e.id, e.name])]} /></label>}
        {(type === "appointments" || type === "services" || type === "clients") && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Servico<Select value={serviceId} set={setServiceId} options={[["", "Todos"], ...services.map((s) => [s.id, s.name])]} /></label>}
        {(type === "appointments" || type === "os" || type === "clients") && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Status<Select value={status} set={setStatus} options={statuses} /></label>}
        {type === "os" && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Pagamento<Select value={paymentMethod} set={setPaymentMethod} options={paymentMethodOptions} /></label>}
      </div>
      {period === "personalizado" && <div className="mt-3 grid gap-3 md:grid-cols-2"><Input type="date" label="De" value={from} set={setFrom} /><Input type="date" label="Ate" value={to} set={setTo} /></div>}
      {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
      <div className="mt-4 flex gap-2"><button onClick={generate} disabled={loading} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white disabled:opacity-60">{loading ? "Gerando..." : "Gerar Relatorio"}</button>{result != null && <button onClick={() => setShowPrint(true)} className="rounded-xl bg-slate-950 px-4 py-2 font-black text-white">Gerar PDF</button>}</div>
    </div>
    {result != null && type === "clients" && <ClientsReport result={result} />}
    {result != null && type !== "clients" && <ReportSummary type={type} result={result} />}
    {result != null && type !== "clients" && <ReportTable type={type} result={result} />}
    {showPrint && result != null && type === "clients" && <ClientsPrintView result={result} filters={printFilters} close={() => setShowPrint(false)} />}
    {showPrint && result != null && type !== "clients" && <ReportPrintView type={type} result={result} filters={printFilters} close={() => setShowPrint(false)} />}
  </div>;
}

// Faturamento (os) and per-employee totals (employee) - both computed
// server-side from the same shared rule as Dashboard/Financeiro (see
// lib/billing.ts sumRevenue), never recomputed here from the row data.
function ReportSummary({ type, result }: { type: ReportType; result: unknown }) {
  if (type === "os") {
    const r = result as { faturamento?: number };
    if (r.faturamento == null) return null;
    return <div className="grid gap-4 md:grid-cols-3"><Stat label="Faturamento realizado no periodo" value={money(r.faturamento)} tone="emerald" /></div>;
  }
  if (type === "employee") {
    const r = result as { summary?: { total: number; realizado: number; cancelado: number; agendado: number; totalValue: number; orderCount: number } };
    if (!r.summary) return null;
    return <div className="grid gap-4 md:grid-cols-4"><Stat label="Atendimentos" value={r.summary.total} /><Stat label="Realizados" value={r.summary.realizado} tone="emerald" /><Stat label="Cancelados" value={r.summary.cancelado} tone="rose" /><Stat label={`Valor (${r.summary.orderCount} OS)`} value={money(r.summary.totalValue)} tone="amber" /></div>;
  }
  return null;
}

function ReportTable({ type, result }: { type: ReportType; result: unknown }) {
  const rows = extractRows(type, result);
  if (rows.length === 0) return <div className="rounded-2xl border bg-white p-6 text-sm text-slate-500">Nenhum registro encontrado para os filtros selecionados.</div>;
  const columns = columnsFor(type);
  return <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{columns.map((c) => <th key={c} className="p-3">{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-t">{renderRow(type, row)}</tr>)}</tbody></table></div>;
}

function extractRows(type: ReportType, result: unknown): Record<string, unknown>[] {
  const r = result as { data?: unknown[]; appointments?: unknown[] };
  if (type === "employee") return (r.appointments as Record<string, unknown>[]) ?? [];
  return (r.data as Record<string, unknown>[]) ?? [];
}

function columnsFor(type: ReportType): string[] {
  switch (type) {
    case "employees": return ["Nome", "Filial", "Cargo", "Total", "Realizado", "Cancelado", "Agendado"];
    case "employee": return ["Data", "Horario", "Cliente", "OS", "Status"];
    case "services": return ["Servico", "OS", "Cliente", "Filial"];
    case "appointments": return ["Data", "Horario", "Cliente", "Servico", "Funcionario", "Filial", "Status"];
    case "os": return ["Codigo", "Cliente", "Filial", "Atendimentos", "Pagamento", "Status", "Valor"];
    case "cancellations": return ["OS", "Cliente", "Atendimento", "Cancelado em", "Tipo", "Motivo"];
    // "clients" renders its own grouped layout (ClientsReport / ClientsPrintView),
    // never the flat table - ReportTable/ReportPrintView are not used for it.
    case "clients": return [];
  }
}

function renderRow(type: ReportType, row: Record<string, unknown>) {
  switch (type) {
    case "employees":
      return <>{cell(row.name)}{cell(row.branch)}{cell(row.role)}{cell(row.totalAppointments)}{cell(row.realizado)}{cell(row.cancelado)}{cell(row.agendado)}</>;
    case "employee": {
      const order = row.order as { code?: string; client?: { name?: string } } | undefined;
      return <>{cell(fmtDate(row.date as string))}{cell(`${row.startTime} - ${row.endTime}`)}{cell(order?.client?.name)}{cell(order?.code)}<td className="p-3"><Badge status={String(row.status)} /></td></>;
    }
    case "services": {
      const service = row.service as { name?: string } | undefined;
      const order = row.order as { code?: string; client?: { name?: string }; branch?: { name?: string } } | undefined;
      return <>{cell(service?.name)}{cell(order?.code)}{cell(order?.client?.name)}{cell(order?.branch?.name)}</>;
    }
    case "appointments": {
      const order = row.order as { client?: { name?: string }; items?: Array<{ service?: { name?: string } }> } | undefined;
      const employee = row.employee as { name?: string } | undefined;
      const branch = row.branch as { name?: string } | undefined;
      return <>{cell(fmtDate(row.date as string))}{cell(`${row.startTime} - ${row.endTime}`)}{cell(order?.client?.name)}{cell(order?.items?.[0]?.service?.name)}{cell(employee?.name || "Equipe da OS")}{cell(branch?.name)}<td className="p-3"><Badge status={String(row.status)} /></td></>;
    }
    case "os": {
      const paymentMethod = row.paymentMethod as string | null;
      const paymentMethodLegacy = row.paymentMethodLegacy as string | null;
      const paymentLabel = paymentMethod ? (paymentMethodLabels[paymentMethod] || paymentMethod) : paymentMethodLegacy ? `${paymentMethodLegacy} (legado)` : "-";
      return <>{cell(row.code)}{cell(row.client)}{cell(row.branch)}{cell(row.appointmentCount)}{cell(paymentLabel)}<td className="p-3"><Badge status={String(row.status)} /></td>{cell(money(row.totalAmount as number))}</>;
    }
    case "cancellations":
      return <>{cell(row.orderCode)}{cell(row.client)}{cell(fmtDate(row.appointmentDate as string))}{cell(fmtDate(row.cancelledAt as string, true))}{cell(row.type === "os_inteira" ? "OS inteira" : "Atendimento individual")}{cell(row.reason)}</>;
  }
}

function cell(value: unknown) {
  return <td className="p-3">{value == null || value === "" ? "-" : String(value)}</td>;
}
function fmtDate(iso?: string, withTime = false) {
  if (!iso) return "-";
  const d = new Date(iso);
  return withTime ? d.toLocaleString("pt-BR") : d.toLocaleDateString("pt-BR");
}

function ReportPrintView({ type, result, filters, close }: { type: ReportType; result: unknown; filters: { periodLabel: string; branchLabel: string; status: string }; close: () => void }) {
  const rows = extractRows(type, result);
  const columns = columnsFor(type);
  const title = reportTypes.find(([t]) => t === type)?.[1] ?? "Relatorio";
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
    <div className="no-print sticky top-0 z-10 flex justify-end gap-2 border-b bg-white p-4"><button onClick={() => window.print()} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Imprimir / Salvar PDF</button><button onClick={close} className="rounded-xl border px-4 py-2 font-black text-slate-600">Fechar</button></div>
    <div className="print-page mx-auto max-w-5xl p-10">
      <div className="flex items-center justify-between border-b pb-6"><div><h1 className="text-2xl font-black">LeeveLimpeza</h1><p className="text-sm text-slate-500">Relatorio: {title}</p></div><p className="text-xs text-slate-500">Gerado em {new Date().toLocaleString("pt-BR")}</p></div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span>Periodo: {filters.periodLabel}</span><span>Filial: {filters.branchLabel}</span>{filters.status && <span>Status: {filters.status}</span>}</div>
      <table className="report-table mt-6 w-full text-sm"><thead><tr>{columns.map((c) => <th key={c} className="border-b p-2 text-left text-xs uppercase text-slate-500">{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{renderRow(type, row)}</tr>)}</tbody></table>
      <p className="mt-6 text-right text-xs text-slate-400">Total de registros: {rows.length}</p>
    </div>
  </div>;
}

// "Por Cliente" - shape returned by /api/reports/clients.
type ClientServiceLine = { service: string; quantity: number; value: number };
type ClientReportRow = { clientId: string; client: string; totalOrders: number; agendado: number; realizado: number; totalServices: number; totalValue: number; services: ClientServiceLine[] };
type ClientsResult = { data?: ClientReportRow[]; totals?: { services: number; value: number; orders?: number; agendado?: number; realizado?: number } };
type ClientsPrintFilters = { periodLabel: string; branchLabel: string; clientLabel: string; employeeLabel: string; serviceLabel: string; status: string };

function ClientsReport({ result }: { result: unknown }) {
  const r = result as ClientsResult;
  const clients = r.data ?? [];
  const totals = r.totals ?? { services: 0, value: 0 };
  if (clients.length === 0) return <div className="rounded-2xl border bg-white p-6 text-sm text-slate-500">Nenhum registro encontrado para os filtros selecionados.</div>;
  return <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2">
      <Stat label="Total geral de servicos" value={totals.services} />
      <Stat label="Total geral em valor" value={money(totals.value)} tone="emerald" />
    </div>
    {clients.map((c) => <div key={c.clientId} className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-black">{c.client}</h4>
        <p className="text-sm font-bold text-slate-500">{c.totalServices} servico(s) &middot; {money(c.totalValue)}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs font-bold text-slate-500">
        <span>Total de OS: <span className="text-slate-800">{c.totalOrders}</span></span>
        <span>Agendado: <span className="text-blue-700">{c.agendado}</span></span>
        <span>Realizado: <span className="text-emerald-700">{c.realizado}</span></span>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Servico</th><th className="py-1">Quantidade</th><th className="py-1">Valor total</th></tr></thead>
        <tbody>
          {c.services.map((s) => <tr key={s.service} className="border-t"><td className="py-1">{s.service}</td><td className="py-1">{s.quantity}</td><td className="py-1">{money(s.value)}</td></tr>)}
          <tr className="border-t font-black"><td className="py-1">TOTAL</td><td className="py-1">{c.totalServices}</td><td className="py-1">{money(c.totalValue)}</td></tr>
        </tbody>
      </table>
    </div>)}
  </div>;
}

function ClientsPrintView({ result, filters, close }: { result: unknown; filters: ClientsPrintFilters; close: () => void }) {
  const r = result as ClientsResult;
  const clients = r.data ?? [];
  const totals = r.totals ?? { services: 0, value: 0 };
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
    <div className="no-print sticky top-0 z-10 flex justify-end gap-2 border-b bg-white p-4"><button onClick={() => window.print()} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Imprimir / Salvar PDF</button><button onClick={close} className="rounded-xl border px-4 py-2 font-black text-slate-600">Fechar</button></div>
    <div className="print-page mx-auto max-w-5xl p-10">
      <div className="flex items-center justify-between border-b pb-6"><div><h1 className="text-2xl font-black">LeeveLimpeza</h1><p className="text-sm text-slate-500">Relatorio: Por Cliente</p></div><p className="text-xs text-slate-500">Gerado em {new Date().toLocaleString("pt-BR")}</p></div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span>Filial: {filters.branchLabel}</span><span>Cliente: {filters.clientLabel}</span><span>Periodo: {filters.periodLabel}</span><span>Funcionario: {filters.employeeLabel}</span><span>Servico: {filters.serviceLabel}</span><span>Status: {filters.status || "Todos"}</span></div>
      {clients.length === 0 && <p className="mt-6 text-sm text-slate-500">Nenhum registro encontrado para os filtros selecionados.</p>}
      {clients.map((c) => <div key={c.clientId} className="mt-6 break-inside-avoid">
        <h2 className="text-lg font-black">CLIENTE: {c.client.toUpperCase()}</h2>
        <p className="text-sm text-slate-600">Total de OS: {c.totalOrders} &middot; Agendado: {c.agendado} &middot; Realizado: {c.realizado}</p>
        <p className="text-sm text-slate-600">Total de servicos: {c.totalServices} &middot; Valor total: {money(c.totalValue)}</p>
        <table className="report-table mt-2 w-full text-sm">
          <thead><tr><th className="border-b p-2 text-left text-xs uppercase text-slate-500">Servico</th><th className="border-b p-2 text-left text-xs uppercase text-slate-500">Quantidade</th><th className="border-b p-2 text-left text-xs uppercase text-slate-500">Valor total</th></tr></thead>
          <tbody>
            {c.services.map((s) => <tr key={s.service}><td className="p-2">{s.service}</td><td className="p-2">{s.quantity}</td><td className="p-2">{money(s.value)}</td></tr>)}
            <tr className="font-black"><td className="p-2">TOTAL</td><td className="p-2">{c.totalServices}</td><td className="p-2">{money(c.totalValue)}</td></tr>
          </tbody>
        </table>
      </div>)}
      <div className="mt-8 border-t pt-4 text-right">
        <p className="font-black">TOTAL GERAL DE SERVICOS: {totals.services}</p>
        <p className="font-black">TOTAL GERAL EM VALOR: {money(totals.value)}</p>
      </div>
    </div>
  </div>;
}
