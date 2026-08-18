import { useEffect, useState } from "react";
import { reportService } from "../services/reportService";
import { DashboardSummary } from "../types";

function money(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export function ReportsPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  useEffect(() => { reportService.summary().then(setData); }, []);
  if (!data) return <p>Carregando relatorios...</p>;
  return <div className="space-y-6"><div className="flex justify-between"><div><h3 className="text-xl font-black">Relatorio gerencial</h3><p className="text-sm text-slate-500">Eventos, faturamento, despesas e produtividade operacional.</p></div><button onClick={() => window.print()} className="no-print rounded-xl bg-slate-900 px-4 py-2 font-bold text-white">Imprimir PDF</button></div><div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-xs uppercase text-slate-400">Faturamento</p><b className="text-2xl text-indigo-600">{money(data.faturamento)}</b></div><div className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-xs uppercase text-slate-400">Despesas</p><b className="text-2xl text-rose-600">{money(data.despesas)}</b></div><div className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-xs uppercase text-slate-400">Lucro</p><b className="text-2xl text-emerald-600">{money(data.lucro)}</b></div></div><div className="rounded-2xl bg-white p-6 shadow-sm"><h4 className="font-black">Indicadores</h4><div className="mt-4 grid gap-3 md:grid-cols-4"><p>Eventos: <b>{data.eventos}</b></p><p>Ordens ativas: <b>{data.ordensAtivas}</b></p><p>Clientes: <b>{data.clientes}</b></p><p>Servicos: <b>{data.servicos}</b></p></div></div></div>;
}