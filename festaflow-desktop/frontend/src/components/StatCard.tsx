export function StatCard({ label, value, tone = "indigo" }: { label: string; value: string | number; tone?: "indigo" | "emerald" | "rose" | "amber" | "slate" }) {
  const map = { indigo: "text-indigo-600 bg-indigo-50", emerald: "text-emerald-600 bg-emerald-50", rose: "text-rose-600 bg-rose-50", amber: "text-amber-600 bg-amber-50", slate: "text-slate-700 bg-slate-50" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-3 rounded-xl px-3 py-2 text-xl font-black ${map[tone]}`}>{value}</p></div>;
}
