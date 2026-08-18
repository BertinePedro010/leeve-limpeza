import React from "react";
import { useApp } from "../contexts/AppContext";
import {
  TrendingUp,
  Calendar,
  Layers,
  CheckCircle2,
  ArrowUpRight,
  Clock,
  MapPin,
  ChevronRight,
} from "lucide-react";
import { cn } from "../utils/cn";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const DashboardView: React.FC<{
  onTabChange: (tab: string) => void;
  onSelectOS: (id: string) => void;
}> = ({ onTabChange, onSelectOS }) => {
  const { orders, clients, transactions } = useApp();

  // Metrics
  const activeOrders = orders.filter((o) => o.status !== "cancelado" && o.status !== "finalizado");
  const completedEvents = orders.filter((o) => o.status === "finalizado");

  // Calculate monthly revenue from transactions/orders
  const totalReceitas = transactions
    .filter((t) => t.tipo === "receita" && t.status === "pago")
    .reduce((sum, t) => sum + t.valor, 0);

  const totalDespesas = transactions
    .filter((t) => t.tipo === "despesa" && t.status === "pago")
    .reduce((sum, t) => sum + t.valor, 0);

  const faturamentoMensal = totalReceitas;
  const lucroMensal = totalReceitas - totalDespesas;

  // Next scheduled events (sorted by date)
  const upcomingEvents = [...orders]
    .filter((o) => o.status !== "cancelado" && o.status !== "finalizado")
    .sort((a, b) => new Date(a.dataEvento).getTime() - new Date(b.dataEvento).getTime())
    .slice(0, 4);

  // SVG Chart Calculation
  // We'll project last 5 months
  const monthlyData = [
    { month: "Jan", revenue: 5200, expense: 1200 },
    { month: "Fev", revenue: 7800, expense: 2300 },
    { month: "Mar", revenue: 12000, expense: 4100 },
    { month: "Abr", revenue: 9500, expense: 3800 },
    { month: "Mai", revenue: totalReceitas || 15600, expense: totalDespesas || 5400 },
  ];

  const maxVal = Math.max(...monthlyData.map((d) => d.revenue)) * 1.15;

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Seu resumo operacional</h2>
          <p className="text-xs text-slate-500">Métricas financeiras e de equipe atualizadas em tempo real.</p>
        </div>
      </div>

      {/* Modern Premium Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Monthly Revenue Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-indigo-50/50 group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Faturamento Total</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
              <TrendingUp className="h-4.5 w-4.5 text-indigo-600" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-800">R$ {fmt(faturamentoMensal)}</h3>
            <p className="text-[10px] text-emerald-600 flex items-center gap-0.5 font-medium">
              <ArrowUpRight className="h-3 w-3" />
              +12.4% vs último mês
            </p>
          </div>
        </div>

        {/* Quantity of Events */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-emerald-50/50 group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Eventos Cadastrados</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
              <Calendar className="h-4.5 w-4.5 text-emerald-600" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-800">{orders.length}</h3>
            <p className="text-[10px] text-emerald-600 flex items-center gap-0.5 font-medium">
              <ArrowUpRight className="h-3 w-3" />
              Total geral na plataforma
            </p>
          </div>
        </div>

        {/* Active OS */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-amber-50/50 group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ordens Ativas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Layers className="h-4.5 w-4.5 text-amber-600" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-800">{activeOrders.length}</h3>
            <p className="text-[10px] text-amber-600 flex items-center gap-0.5 font-medium">
              Em andamento/pendentes
            </p>
          </div>
        </div>

        {/* Completed Events */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-blue-50/50 group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Eventos Concluídos</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <CheckCircle2 className="h-4.5 w-4.5 text-blue-600" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-800">{completedEvents.length}</h3>
            <p className="text-[10px] text-blue-600 flex items-center gap-0.5 font-medium">
              Histórico finalizado
            </p>
          </div>
        </div>
      </div>

      {/* Main Charts & Events grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Financial Flow Chart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Faturamento vs Despesas</h3>
              <p className="text-[11px] text-slate-400">Projeção e dados consolidados mensais</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-indigo-600">
                <span className="h-2 w-2 rounded-full bg-indigo-500" /> Faturamento
              </span>
              <span className="flex items-center gap-1.5 text-rose-500">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Despesas
              </span>
            </div>
          </div>

          {/* SVG Custom Graph */}
          <div className="h-48 relative">
            <svg viewBox="0 0 500 200" className="w-full h-full">
              {/* Grid Lines */}
              <line x1="0" y1="50" x2="500" y2="50" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="0" y1="100" x2="500" y2="100" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="0" y1="150" x2="500" y2="150" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="0" y1="200" x2="500" y2="200" stroke="#e2e8f0" strokeWidth="1" />

              {/* Bar charts projection */}
              {monthlyData.map((d, idx) => {
                const x = 40 + idx * 95;
                const revHeight = (d.revenue / maxVal) * 160;
                const expHeight = (d.expense / maxVal) * 160;

                return (
                  <g key={d.month}>
                    {/* Revenue Bar */}
                    <rect
                      x={x}
                      y={200 - revHeight}
                      width="20"
                      height={revHeight}
                      fill="url(#indigoGrad)"
                      rx="4"
                      className="transition-all duration-300 hover:opacity-85 cursor-pointer"
                    />
                    {/* Expense Bar */}
                    <rect
                      x={x + 24}
                      y={200 - expHeight}
                      width="20"
                      height={expHeight}
                      fill="url(#roseGrad)"
                      rx="4"
                      className="transition-all duration-300 hover:opacity-85 cursor-pointer"
                    />

                    {/* Value tags */}
                    <text x={x + 22} y={200 - Math.max(revHeight, expHeight) - 8} textAnchor="middle" className="text-[10px] font-bold fill-slate-500">
                      R${Math.round(d.revenue / 100) / 10}k
                    </text>

                    {/* Month Label */}
                    <text x={x + 22} y={218} textAnchor="middle" className="text-[11px] font-semibold fill-slate-400">
                      {d.month}
                    </text>
                  </g>
                );
              })}

              <defs>
                <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
                <linearGradient id="roseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" />
                  <stop offset="100%" stopColor="#fda4af" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Budget summary */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Receitas Totais</p>
              <p className="text-base font-extrabold text-indigo-600">R$ {fmt(totalReceitas)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Despesas Totais</p>
              <p className="text-base font-extrabold text-rose-500">R$ {fmt(totalDespesas)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lucro Líquido</p>
              <p className="text-base font-extrabold text-emerald-600">R$ {fmt(lucroMensal)}</p>
            </div>
          </div>
        </div>

        {/* Upcoming Events / Next Schedule */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 flex flex-col justify-between">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Próximos Agendamentos</h3>
            <p className="text-[11px] text-slate-400">Compromissos e festas confirmados na agenda</p>
          </div>

          <div className="space-y-3.5 flex-1 mt-4 overflow-y-auto max-h-64">
            {upcomingEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-400 py-8">
                <Calendar className="h-8 w-8 text-slate-300 mb-2" />
                Nenhum evento futuro agendado.
              </div>
            ) : (
              upcomingEvents.map((event) => {
                const client = clients.find((c) => c.id === event.clienteId);
                return (
                  <div
                    key={event.id}
                    onClick={() => onSelectOS(event.id)}
                    className="group flex items-start justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-700">{event.codigo}</span>
                        <span
                          className={cn(
                            "inline-block h-2 w-2 rounded-full",
                            event.status === "confirmado" && "bg-indigo-500",
                            event.status === "em_andamento" && "bg-amber-500",
                            event.status === "finalizado" && "bg-emerald-500",
                            event.status === "pendente" && "bg-blue-400",
                            event.status === "cancelado" && "bg-slate-400"
                          )}
                        />
                      </div>
                      <p className="text-xs font-bold text-slate-800 truncate max-w-[160px]">
                        {client?.nome || "Cliente Desconhecido"}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {event.horarioInicio}
                        </span>
                        <span className="flex items-center gap-0.5 truncate max-w-[120px]">
                          <MapPin className="h-3 w-3" />
                          {event.local.split("-")[0]}
                        </span>
                      </div>
                    </div>

                    <div className="text-right flex flex-col justify-between items-end">
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        {new Date(event.dataEvento).toLocaleDateString("pt-BR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-400 transition-transform group-hover:translate-x-0.5 mt-2" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button
            onClick={() => onTabChange("calendario")}
            className="w-full flex items-center justify-center gap-1 py-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition mt-4"
          >
            Ver Calendário Completo
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
