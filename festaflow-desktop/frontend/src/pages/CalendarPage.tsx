import { useMemo, useState } from "react";
import { useCrud } from "../hooks/useCrud";
import { ServiceOrder } from "../types";
import { StatusBadge } from "../components/StatusBadge";

const week = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function CalendarPage() {
  const { items } = useCrud<ServiceOrder>("orders");
  const [cursor, setCursor] = useState(new Date());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthName = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const count = new Date(year, month + 1, 0).getDate();
    const pad = first.getDay();
    return [...Array(pad).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [year, month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ServiceOrder[]>();
    items.forEach((order) => {
      const key = dateKey(new Date(order.dataEvento));
      map.set(key, [...(map.get(key) || []), order]);
    });
    return map;
  }, [items]);

  function eventsFor(day: number) {
    return eventsByDay.get(dateKey(new Date(year, month, day))) || [];
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-lg font-black capitalize">{monthName}</h3>
          <p className="text-sm text-slate-500">Calendario local das ordens de servico e eventos.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="rounded-xl border px-4 py-2 text-sm font-bold">Anterior</button>
          <button onClick={() => setCursor(new Date())} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Hoje</button>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="rounded-xl border px-4 py-2 text-sm font-bold">Proximo</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 bg-slate-50 text-center text-xs font-black uppercase text-slate-500">
          {week.map((d) => <div key={d} className="border-r border-slate-100 py-3 last:border-r-0">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 auto-rows-[145px]">
          {days.map((day, idx) => (
            <div key={`${idx}-${day}`} className="border-r border-t border-slate-100 p-2 last:border-r-0">
              {day && <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-slate-600">{day}</span>
                  {eventsFor(day).length > 0 && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">{eventsFor(day).length}</span>}
                </div>
                <div className="space-y-1 overflow-y-auto pr-1">
                  {eventsFor(day).map((order) => (
                    <div key={order.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <b className="truncate text-[11px]">{order.codigo}</b>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 truncate text-[10px] text-slate-500">{order.horarioInicio} - {order.cliente?.nome}</p>
                    </div>
                  ))}
                </div>
              </>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}