import { OSStatus } from "../types";

export function StatusBadge({ status }: { status: OSStatus | string }) {
  const map: Record<string, string> = { PENDENTE: "bg-blue-50 text-blue-700", CONFIRMADO: "bg-indigo-50 text-indigo-700", EM_ANDAMENTO: "bg-amber-50 text-amber-700", FINALIZADO: "bg-emerald-50 text-emerald-700", CANCELADO: "bg-slate-100 text-slate-600" };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${map[status] || map.PENDENTE}`}>{status.replace("_", " ")}</span>;
}