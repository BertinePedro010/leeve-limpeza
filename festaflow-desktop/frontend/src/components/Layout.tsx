import { ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";

const nav = [
  ["dashboard", "Dashboard"], ["orders", "Ordens de Serviço"], ["calendar", "Calendário"], ["clients", "Clientes"], ["employees", "Funcionários"], ["services", "Serviços"], ["financial", "Financeiro"], ["reports", "Relatórios"],
];

export function Layout({ tab, setTab, children }: { tab: string; setTab: (tab: string) => void; children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      <aside className="no-print flex w-72 flex-col bg-slate-950 text-slate-300">
        <div className="border-b border-slate-800 p-6"><h1 className="text-xl font-black text-white">FestaFlow</h1><p className="text-xs text-slate-500">Desktop Local</p></div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">{nav.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${tab === id ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}>{label}</button>)}</nav>
        <div className="border-t border-slate-800 p-4"><p className="truncate text-sm font-bold text-white">{user?.name}</p><p className="text-xs text-slate-500">{user?.role}</p><button onClick={logout} className="mt-3 w-full rounded-xl border border-slate-800 py-2 text-xs font-bold uppercase text-slate-400 hover:bg-slate-900">Sair</button></div>
      </aside>
      <main className="flex-1 overflow-y-auto"><header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-8 py-4 backdrop-blur"><div className="flex items-center justify-between"><h2 className="text-lg font-black">{nav.find(([id]) => id === tab)?.[1] || "FestaFlow"}</h2><button onClick={() => setTab("orders")} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Nova OS</button></div></header><section className="p-8">{children}</section></main>
    </div>
  );
}
