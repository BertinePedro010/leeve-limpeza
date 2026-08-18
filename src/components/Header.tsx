import React, { useState } from "react";
import { Bell, Search, PlusCircle, Calendar, Sparkles, Check, CheckCheck } from "lucide-react";
import { useApp } from "../contexts/AppContext";

interface HeaderProps {
  title: string;
  onQuickAction?: (action: string) => void;
  onSearchQuery?: (query: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ title, onQuickAction, onSearchQuery }) => {
  const { notifications, markNotificationRead } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchVal, setSearchVal] = useState("");

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchVal(e.target.value);
    if (onSearchQuery) {
      onSearchQuery(e.target.value);
    }
  };

  const unreadNotifications = notifications.filter((n) => !n.lida);

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between sticky top-0 z-20 shadow-sm">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-slate-800 tracking-tight">{title}</h2>
        <span className="hidden md:inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
          <Sparkles className="h-3 w-3" />
          Modo Administrador
        </span>
      </div>

      {/* Center Actions - Search */}
      <div className="hidden lg:flex items-center gap-2 max-w-md w-full relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchVal}
          onChange={handleSearchChange}
          placeholder="Pesquisa rápida (clientes, serviços ou ordens de serviço)..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
        />
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-4">
        {/* Quick action button */}
        {onQuickAction && (
          <button
            onClick={() => onQuickAction("new_os")}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700"
          >
            <PlusCircle className="h-4 w-4" />
            Nova OS
          </button>
        )}

        {/* Notifications Icon with count */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors relative"
          >
            <Bell className="h-4.5 w-4.5" />
            {unreadNotifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
            )}
          </button>

          {/* Notifications Dropdown Drawer */}
          {showNotifications && (
            <div className="absolute right-0 mt-2.5 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-40 animate-fade-in-down">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Notificações Recentes</span>
                {unreadNotifications.length > 0 && (
                  <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {unreadNotifications.length} Novas
                  </span>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    <CheckCheck className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    Sem novas notificações por enquanto.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 flex items-start gap-2.5 hover:bg-slate-50 transition-colors ${
                        !n.lida ? "bg-indigo-50/20" : ""
                      }`}
                    >
                      <div className="mt-0.5">
                        <span
                          className={`flex h-2.5 w-2.5 rounded-full ${
                            n.tipo === "success"
                              ? "bg-emerald-500"
                              : n.tipo === "warning"
                              ? "bg-amber-500"
                              : n.tipo === "error"
                              ? "bg-rose-500"
                              : "bg-blue-500"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700">{n.titulo}</p>
                        <p className="text-[11px] text-slate-500 leading-normal">{n.mensagem}</p>
                        <span className="text-[9px] text-slate-400 mt-1 block">
                          {new Date(n.data).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {!n.lida && (
                        <button
                          onClick={() => markNotificationRead(n.id)}
                          className="text-indigo-600 hover:text-indigo-800 p-0.5 rounded bg-indigo-50"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Date visual header tag */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 border-l border-slate-200 pl-4">
          <Calendar className="h-4.5 w-4.5 text-slate-400" />
          <span className="font-medium">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
      </div>
    </header>
  );
};
