import { useState } from "react";
import { AppProvider, useApp } from "./contexts/AppContext";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { DashboardView } from "./components/DashboardView";
import { ClientsView } from "./components/ClientsView";
import { EmployeesView } from "./components/EmployeesView";
import { ServicesView } from "./components/ServicesView";
import { OSView } from "./components/OSView";
import { CalendarView } from "./components/CalendarView";
import { FinancialView } from "./components/FinancialView";
import { ReportsView } from "./components/ReportsView";
import { DevSetupView } from "./components/DevSetupView";
import { LoginView } from "./components/LoginView";

function MainAppShell() {
  const { user } = useApp();
  const [currentTab, setCurrentTab] = useState("dashboard");

  // State to pass an OS selected from Dashboard or Calendar straight to the OS Details printable view
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  if (!user) {
    return <LoginView />;
  }

  // Handle selected OS routing
  const handleSelectOS = (id: string) => {
    setSelectedOrderId(id);
    setCurrentTab("os");
  };

  const getPageTitle = () => {
    switch (currentTab) {
      case "dashboard":
        return "Painel de Controle Principal";
      case "os":
        return "Gerenciamento de Ordens de Serviço";
      case "calendario":
        return "Agenda de Eventos e Festas";
      case "clientes":
        return "Módulo de Clientes";
      case "funcionarios":
        return "Gestão de Colaboradores e Staff";
      case "servicos":
        return "Diretório de Serviços e Precificação";
      case "financeiro":
        return "Controle Financeiro e Fluxo de Caixa";
      case "relatorios":
        return "Relatórios de Performance";
      case "dev":
        return "Especificações de Produção & API";
      default:
        return "FestaFlow SaaS";
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-700 overflow-hidden font-sans">
      {/* Sidebar navigation */}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          title={getPageTitle()}
          onQuickAction={(action) => {
            if (action === "new_os") {
              setCurrentTab("os");
            }
          }}
        />

        {/* Dynamic Panel Content Area */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {currentTab === "dashboard" && (
            <DashboardView
              onTabChange={setCurrentTab}
              onSelectOS={handleSelectOS}
            />
          )}

          {currentTab === "clientes" && <ClientsView />}

          {currentTab === "funcionarios" && <EmployeesView />}

          {currentTab === "servicos" && <ServicesView />}

          {currentTab === "os" && (
            <OSView
              selectedOrderId={selectedOrderId}
              onClearSelectedOrder={() => setSelectedOrderId(null)}
            />
          )}

          {currentTab === "calendario" && (
            <CalendarView
              onSelectOS={handleSelectOS}
              onNewOS={() => setCurrentTab("os")}
            />
          )}

          {currentTab === "financeiro" && <FinancialView />}

          {currentTab === "relatorios" && <ReportsView />}

          {currentTab === "dev" && <DevSetupView />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainAppShell />
    </AppProvider>
  );
}
