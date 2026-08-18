import React from "react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Layers,
  FileSpreadsheet,
  CalendarDays,
  LineChart,
  LogOut,
  Sliders,
  DollarSign,
} from "lucide-react";
import { useApp } from "../contexts/AppContext";
import { cn } from "../utils/cn";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const { user, logout } = useApp();

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "os", label: "Ordens de Serviço", icon: FileSpreadsheet },
    { id: "calendario", label: "Calendário", icon: CalendarDays },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "funcionarios", label: "Funcionários", icon: Briefcase },
    { id: "servicos", label: "Serviços", icon: Layers },
    { id: "financeiro", label: "Financeiro", icon: DollarSign },
    { id: "relatorios", label: "Relatórios", icon: LineChart },
    { id: "dev", label: "Config. Produção", icon: Sliders },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col h-full shrink-0">
      {/* Brand Logo */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <CalendarDays className="h-5 w-5 text-white" />
        </div>
        <div>
          <span className="font-bold text-white tracking-wide block text-sm">FestaFlow</span>
          <span className="text-[10px] text-slate-500 font-semibold tracking-widest uppercase">SaaS Eventos</span>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all group",
                isActive
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300")} />
              <span>{item.label}</span>
              {item.id === "os" && (
                <span className="ml-auto bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded-full font-bold group-hover:bg-slate-700">
                  OS
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      {user && (
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <img
              src={user.avatarUrl || "https://api.dicebear.com/7.x/adventurer/svg"}
              alt={user.name}
              className="h-10 w-10 rounded-xl bg-slate-800 object-cover ring-2 ring-indigo-500/20"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.name}</p>
              <p className="text-xs text-slate-500 truncate capitalize">{user.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-800 hover:border-rose-900/50 hover:bg-rose-950/20 hover:text-rose-400 text-slate-500 text-xs font-semibold tracking-wider uppercase transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair do Painel
          </button>
        </div>
      )}
    </aside>
  );
};
