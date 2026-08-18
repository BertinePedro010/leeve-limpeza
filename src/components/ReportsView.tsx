import React, { useMemo } from "react";
import { useApp } from "../contexts/AppContext";
import {
  LineChart,
  Calendar,
  Layers,
  Award,
  DollarSign,
  Printer,
  ChevronRight,
  UserCheck,
} from "lucide-react";

export const ReportsView: React.FC = () => {
  const { orders, clients, employees, services, transactions } = useApp();

  // Metrics
  const activeEventsThisMonth = useMemo(() => {
    return orders.filter((o) => o.status !== "cancelado").length;
  }, [orders]);

  const totalBilling = useMemo(() => {
    return transactions
      .filter((t) => t.tipo === "receita" && t.status === "pago")
      .reduce((sum, t) => sum + t.valor, 0);
  }, [transactions]);

  const totalExpenses = useMemo(() => {
    return transactions
      .filter((t) => t.tipo === "despesa" && t.status === "pago")
      .reduce((sum, t) => sum + t.valor, 0);
  }, [transactions]);

  const totalProfit = totalBilling - totalExpenses;

  // Clients with most events
  const topClients = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      counts[o.clienteId] = (counts[o.clienteId] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([id, count]) => {
        const client = clients.find((c) => c.id === id);
        return {
          name: client?.nome || "Cliente Desconhecido",
          email: client?.email || "",
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [orders, clients]);

  // Most sold services
  const topServices = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      o.itens.forEach((item) => {
        counts[item.serviceId] = (counts[item.serviceId] || 0) + item.quantidade;
      });
    });

    return Object.entries(counts)
      .map(([id, quantity]) => {
        const service = services.find((s) => s.id === id);
        return {
          name: service?.nome || "Serviço Adicional",
          category: service?.categoria || "Geral",
          quantity,
          totalRevenue: quantity * (service?.valor || 0),
        };
      })
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 4);
  }, [orders, services]);

  // Most utilized employees/staff
  const topStaff = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      o.funcionariosIds.forEach((empId) => {
        counts[empId] = (counts[empId] || 0) + 1;
      });
    });

    return Object.entries(counts)
      .map(([id, count]) => {
        const emp = employees.find((e) => e.id === id);
        return {
          name: emp?.nome || "Colaborador",
          role: emp?.cargo || "Staff",
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [orders, employees]);

  const maxServiceSold = Math.max(...topServices.map((s) => s.quantity), 1);

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Relatórios & Analytics</h2>
          <p className="text-xs text-slate-500">Métricas consolidadas de vendas, serviços e escala de equipe.</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
          Imprimir Relatório Geral
        </button>
      </div>

      {/* Grid Quick Indicators */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Receita Total</span>
            <DollarSign className="h-4 w-4 text-indigo-500" />
          </div>
          <h3 className="text-xl font-black text-slate-800">
            R$ {totalBilling.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </h3>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Despesas</span>
            <DollarSign className="h-4 w-4 text-rose-500" />
          </div>
          <h3 className="text-xl font-black text-slate-800">
            R$ {totalExpenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </h3>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lucro Líquido</span>
            <LineChart className="h-4 w-4 text-emerald-500" />
          </div>
          <h3 className="text-xl font-black text-slate-800">
            R$ {totalProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </h3>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Agendamentos</span>
            <Calendar className="h-4 w-4 text-amber-500" />
          </div>
          <h3 className="text-xl font-black text-slate-800">{activeEventsThisMonth} Eventos</h3>
        </div>
      </div>

      {/* Detail Analytics Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Most Sold Services */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Serviços Mais Vendidos</h3>
              <p className="text-[11px] text-slate-400">Demanda em número total de itens contratados</p>
            </div>
            <Layers className="h-4.5 w-4.5 text-indigo-500" />
          </div>

          <div className="space-y-3.5">
            {topServices.map((service, index) => {
              const percentage = (service.quantity / maxServiceSold) * 100;
              return (
                <div key={index} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="truncate max-w-[200px]">{service.name}</span>
                    <span>{service.quantity} vezes</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Active Clients */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Clientes Mais Ativos</h3>
              <p className="text-[11px] text-slate-400 font-medium">Parcerias com maior frequência de agendamentos</p>
            </div>
            <Award className="h-4.5 w-4.5 text-amber-500" />
          </div>

          <div className="divide-y divide-slate-100">
            {topClients.map((client, index) => (
              <div key={index} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-700">{client.name}</p>
                  <p className="text-[10px] text-slate-400">{client.email}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl">
                    {client.count} Eventos
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Most Utilized Staff members */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Staff & Colaboradores Destaques</h3>
              <p className="text-[11px] text-slate-400">Escalas operacionais frequentes para festas</p>
            </div>
            <UserCheck className="h-4.5 w-4.5 text-emerald-500" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {topStaff.map((staff, index) => (
              <div key={index} className="p-3.5 border border-slate-100 rounded-xl bg-slate-50 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">{staff.name}</h4>
                  <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-semibold">
                    {staff.role}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-slate-600">
                  <span>{staff.count} Diárias</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
