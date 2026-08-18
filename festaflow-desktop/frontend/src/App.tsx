import { useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OrdersPage } from "./pages/OrdersPage";
import { CalendarPage } from "./pages/CalendarPage";
import { ClientsPage } from "./pages/ClientsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { ServicesPage } from "./pages/ServicesPage";
import { FinancialPage } from "./pages/FinancialPage";
import { ReportsPage } from "./pages/ReportsPage";

function Shell() {
  const { user } = useAuth();
  const [tab, setTab] = useState("dashboard");
  if (!user) return <LoginPage />;
  return <Layout tab={tab} setTab={setTab}>{tab === "dashboard" && <DashboardPage />}{tab === "orders" && <OrdersPage />}{tab === "calendar" && <CalendarPage />}{tab === "clients" && <ClientsPage />}{tab === "employees" && <EmployeesPage />}{tab === "services" && <ServicesPage />}{tab === "financial" && <FinancialPage />}{tab === "reports" && <ReportsPage />}</Layout>;
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>;
}