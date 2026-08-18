import { Toast } from "../hooks/useToast";

export function Toasts({ toasts, remove }: { toasts: Toast[]; remove: (id: string) => void }) {
  return <div className="fixed bottom-4 right-4 z-[60] space-y-2">{toasts.map((t) => <button key={t.id} onClick={() => remove(t.id)} className={`block w-80 rounded-xl border px-4 py-3 text-left text-sm font-semibold shadow-lg ${t.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : t.type === "info" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{t.message}</button>)}</div>;
}
