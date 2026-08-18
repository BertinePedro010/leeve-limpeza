import { useEffect, useState } from "react";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { reportService } from "../services/reportService";
import { DashboardSummary } from "../types";

function money(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  useEffect(() => { reportService.summary().then(setData); }, []);
  if (!data) return <p>Carregando dashboard...</p>;
  return <div className="space-y-6"><div className="grid gap-4 md:grid-cols-4"><StatCard label="Faturamento" value={money(data.faturamento)} /><StatCard label="Lucro" value={money(data.lucro)} tone="emerald" /><StatCard label="Ordens Ativas" value={data.ordensAtivas} tone="amber" /><StatCard label="Eventos Concluidos" value={data.eventosConcluidos} tone="slate" /></div><div className="grid gap-6 lg:grid-cols-3"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"><h3 className="font-black">Resumo financeiro</h3><div className="mt-6 grid gap-3 md:grid-cols-2"><StatCard label="Despesas" value={money(data.despesas)} tone="rose" /><StatCard label="Contas a receber" value={money(data.contasReceber)} tone="indigo" /><StatCard label="Contas a pagar" value={money(data.contasPagar)} tone="amber" /><StatCard label="Eventos cadastrados" value={data.eventos} tone="slate" /></div></section><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="font-black">Proximos agendamentos</h3><div className="mt-4 space-y-3">{data.proximosEventos.map((o) => <div key={o.id} className="rounded-xl border border-slate-100 p-3"><div className="flex justify-between"><b>{o.codigo}</b><StatusBadge status={o.status} /></div><p className="mt-1 text-xs text-slate-500">{new Date(o.dataEvento).toLocaleDateString("pt-BR")} - {o.local}</p></div>)}</div></section></div></div>;
}
