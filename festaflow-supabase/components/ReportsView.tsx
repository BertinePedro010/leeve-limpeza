"use client";

import { useState } from "react";
import { useBranch } from "@/lib/branch-context";
import { api, money, Badge, Select, Input, Stat, paymentMethodLabels, paymentMethodOptions } from "@/components/ui";
import type { Employee, Service } from "@/components/SaasApp";

type ReportType = "employees" | "employee" | "services" | "appointments" | "os" | "cancellations";
type Period = "hoje" | "ontem" | "semana" | "mes" | "mes_anterior" | "personalizado";

const reportTypes: Array<[ReportType, string]> = [
  ["employees", "Funcionarios"],
  ["employee", "Funcionario individual"],
  ["services", "Servicos prestados"],
  ["appointments", "Atendimentos"],
  ["os", "Ordens de Servico"],
  ["cancellations", "Cancelamentos"],
];
const periods: Array<[Period, string]> = [["hoje", "Hoje"], ["ontem", "Ontem"], ["semana", "Esta semana"], ["mes", "Este mes"], ["mes_anterior", "Mes anterior"], ["personalizado", "Personalizado"]];
const statuses = [["", "Todos"], ["pendente", "Agendado"], ["confirmado", "Confirmado"], ["em_andamento", "Em andamento"], ["finalizado", "Realizado"], ["cancelado", "Cancelado"]];

function endpointFor(type: ReportType, employeeId: string): string {
  if (type === "employee") return `/api/reports/employees/${employeeId}`;
  if (type === "employees") return "/api/reports/employees";
  if (type === "services") return "/api/reports/services";
  if (type === "appointments") return "/api/reports/appointments";
  if (type === "os") return "/api/reports/os";
  return "/api/reports/cancellations";
}

export default function ReportsView({ employees, services, isGlobalAdmin }: { employees: Employee[]; services: Service[]; isGlobalAdmin: boolean }) {
  const { branches, activeBranchId } = useBranch();
  const [type, setType] = useState<ReportType>("appointments");
  const [period, setPeriod] = useState<Period>("mes");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branchId, setBranchId] = useState(activeBranchId ?? "");
  const [employeeId, setEmployeeId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [status, setStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  async function generate() {
    setError(""); setLoading(true); setResult(null);
    try {
      if (type === "employee" && !employeeId) throw new Error("Selecione um funcionario.");
      const params = new URLSearchParams();
      if (type !== "employee") params.set("branchId", branchId);
      params.set("period", period);
      if (period === "personalizado") { params.set("from", from); params.set("to", to); }
      if (employeeId && type !== "employee") params.set("employeeId", employeeId);
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

  return <div className="space-y-6">
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h3 className="font-black">Relatorios</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Tipo<Select value={type} set={(v) => setType(v as ReportType)} options={reportTypes} /></label>
        <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Periodo<Select value={period} set={(v) => setPeriod(v as Period)} options={periods} /></label>
        {type !== "employee" && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Filial<Select value={branchId} set={setBranchId} options={[...branches.map((b) => [b.id, b.name]), ...(isGlobalAdmin ? [["all", "Todas"]] : [])]} /></label>}
        {type === "employee" && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Funcionario<Select value={employeeId} set={setEmployeeId} options={employees.map((e) => [e.id, e.name])} /></label>}
        {(type === "appointments" || type === "services" || type === "employees") && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Funcionario<Select value={employeeId} set={setEmployeeId} options={[["", "Todos"], ...employees.map((e) => [e.id, e.name])]} /></label>}
        {(type === "appointments" || type === "services") && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Servico<Select value={serviceId} set={setServiceId} options={[["", "Todos"], ...services.map((s) => [s.id, s.name])]} /></label>}
        {(type === "appointments" || type === "os") && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Status<Select value={status} set={setStatus} options={statuses} /></label>}
        {type === "os" && <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Pagamento<Select value={paymentMethod} set={setPaymentMethod} options={paymentMethodOptions} /></label>}
      </div>
      {period === "personalizado" && <div className="mt-3 grid gap-3 md:grid-cols-2"><Input type="date" label="De" value={from} set={setFrom} /><Input type="date" label="Ate" value={to} set={setTo} /></div>}
      {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
      <div className="mt-4 flex gap-2"><button onClick={generate} disabled={loading} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white disabled:opacity-60">{loading ? "Gerando..." : "Gerar Relatorio"}</button>{result != null && <button onClick={() => setShowPrint(true)} className="rounded-xl bg-slate-950 px-4 py-2 font-black text-white">Gerar PDF</button>}</div>
    </div>
    {result != null && <ReportSummary type={type} result={result} />}
    {result != null && <ReportTable type={type} result={result} />}
    {showPrint && result != null && <ReportPrintView type={type} result={result} filters={{ periodLabel: periods.find(([p]) => p === period)?.[1] ?? period, branchLabel: branchId === "all" ? "Todas" : branches.find((b) => b.id === branchId)?.name ?? branchId, status }} close={() => setShowPrint(false)} />}
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
