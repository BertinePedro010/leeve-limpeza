import React, { useState, useMemo } from "react";
import { useApp } from "../contexts/AppContext";
import { OSStatus } from "../types";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Users,
  Briefcase,
  Clock,
  MapPin,
} from "lucide-react";
import { cn } from "../utils/cn";

interface CalendarViewProps {
  onSelectOS: (id: string) => void;
  onNewOS?: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onSelectOS, onNewOS }) => {
  const { orders, clients, employees } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date(2026, 4, 1)); // Default to May 2026 for mock data visibility

  // Filters
  const [selectedClient, setSelectedClient] = useState("todos");
  const [selectedEmployee, setSelectedEmployee] = useState("todos");

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchClient = selectedClient === "todos" || o.clienteId === selectedClient;
      const matchEmployee = selectedEmployee === "todos" || o.funcionariosIds.includes(selectedEmployee);
      return matchClient && matchEmployee;
    });
  }, [orders, selectedClient, selectedEmployee]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  // First day of current month
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  // Number of days in current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Get status color coding
  const getStatusClasses = (status: OSStatus) => {
    switch (status) {
      case "confirmado":
        return "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100";
      case "em_andamento":
        return "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100";
      case "finalizado":
        return "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100";
      case "pendente":
        return "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100";
      case "cancelado":
        return "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 line-through";
      default:
        return "bg-slate-100 border-slate-200 text-slate-700";
    }
  };

  // Build grid days
  const calendarDays = useMemo(() => {
    const days = [];
    // Pad days from previous month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  }, [firstDayOfMonth, daysInMonth]);

  // Find events on a specific day
  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return filteredOrders.filter((o) => o.dataEvento === dateStr);
  };

  return (
    <div className="space-y-6">
      {/* Header with Navigation and Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Calendário de Eventos</h2>
          <p className="text-xs text-slate-500">Agendamentos mensais, disponibilidade de equipe e status operacional.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Client Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
            <Users className="h-4 w-4 text-slate-400" />
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer"
            >
              <option value="todos">Todos Clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome.split(" ")[0]}
                </option>
              ))}
            </select>
          </div>

          {/* Employee Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
            <Briefcase className="h-4 w-4 text-slate-400" />
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer"
            >
              <option value="todos">Toda Equipe</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nome.split(" ")[0]} ({emp.cargo})
                </option>
              ))}
            </select>
          </div>

          {onNewOS && (
            <button
              onClick={onNewOS}
              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-md transition"
            >
              <Plus className="h-4 w-4" />
              Novo Evento
            </button>
          )}
        </div>
      </div>

      {/* Calendar Grid Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Month Header Controller */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">
              {monthNames[month]} {year}
            </h3>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              {filteredOrders.length} Eventos Filtrados
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date(2026, 4, 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Hoje
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Week Days Header */}
        <div className="grid grid-cols-7 border-b border-slate-100 text-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50/30">
          <div className="py-3 border-r border-slate-100">Dom</div>
          <div className="py-3 border-r border-slate-100">Seg</div>
          <div className="py-3 border-r border-slate-100">Ter</div>
          <div className="py-3 border-r border-slate-100">Qua</div>
          <div className="py-3 border-r border-slate-100">Qui</div>
          <div className="py-3 border-r border-slate-100">Sex</div>
          <div className="py-3">Sáb</div>
        </div>

        {/* Monthly Grid */}
        <div className="grid grid-cols-7 grid-flow-row auto-rows-[120px] divide-x divide-y divide-slate-100">
          {calendarDays.map((day, idx) => {
            const dayEvents = day ? getEventsForDay(day) : [];
            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

            return (
              <div
                key={idx}
                className={cn(
                  "p-2 flex flex-col justify-between hover:bg-slate-50/20 transition relative",
                  day === null && "bg-slate-50/40 cursor-not-allowed",
                  isToday && "bg-indigo-50/20"
                )}
              >
                {day && (
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center",
                        isToday ? "bg-indigo-600 text-white" : "text-slate-500"
                      )}
                    >
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    )}
                  </div>
                )}

                {day && (
                  <div className="space-y-1 overflow-y-auto max-h-[85px] mt-1 pr-1 custom-scrollbar">
                    {dayEvents.map((event) => {
                      const client = clients.find((c) => c.id === event.clienteId);
                      return (
                        <div
                          key={event.id}
                          onClick={() => onSelectOS(event.id)}
                          className={cn(
                            "px-1.5 py-1 text-[10px] rounded border font-semibold truncate cursor-pointer transition flex items-center gap-1",
                            getStatusClasses(event.status)
                          )}
                          title={`${event.codigo} - ${client?.nome || ""}`}
                        >
                          <span className="font-bold">{event.horarioInicio}</span>
                          <span className="truncate">{client?.nome || "Cliente"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Agenda List */}
      <div className="xl:hidden bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-800">Eventos do Mês</h3>
        <div className="divide-y divide-slate-100">
          {filteredOrders.map((event) => {
            const client = clients.find((c) => c.id === event.clienteId);
            return (
              <div
                key={event.id}
                onClick={() => onSelectOS(event.id)}
                className="py-3 flex items-start justify-between cursor-pointer hover:bg-slate-50 rounded px-2"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800">{event.codigo}</span>
                    <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                      {event.dataEvento}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700">{client?.nome}</p>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {event.horarioInicio} - {event.horarioFim}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {event.local.split("-")[0]}
                    </span>
                  </div>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full capitalize",
                    event.status === "confirmado" && "bg-indigo-50 text-indigo-700",
                    event.status === "em_andamento" && "bg-amber-50 text-amber-700",
                    event.status === "finalizado" && "bg-emerald-50 text-emerald-700",
                    event.status === "pendente" && "bg-blue-50 text-blue-700",
                    event.status === "cancelado" && "bg-slate-50 text-slate-700"
                  )}
                >
                  {event.status.replace("_", " ")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
