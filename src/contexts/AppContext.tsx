import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  Client,
  Employee,
  Service,
  ServiceOrder,
  Transaction,
  User,
  UserRole,
  Notification,
} from "../types";
import {
  MOCK_USER,
  MOCK_CLIENTS,
  MOCK_EMPLOYEES,
  MOCK_SERVICES,
  MOCK_ORDERS,
  MOCK_TRANSACTIONS,
} from "../utils/mockData";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
}

interface AppContextType {
  // Session & Auth
  user: User | null;
  login: (email: string, role: UserRole) => Promise<boolean>;
  logout: () => void;
  resetPassword: (email: string) => Promise<boolean>;

  // Clients
  clients: Client[];
  addClient: (client: Omit<Client, "id" | "createdAt">) => void;
  editClient: (client: Client) => void;
  deleteClient: (id: string) => void;

  // Employees
  employees: Employee[];
  addEmployee: (employee: Omit<Employee, "id" | "createdAt">) => void;
  editEmployee: (employee: Employee) => void;
  deleteEmployee: (id: string) => void;

  // Services
  services: Service[];
  addService: (service: Omit<Service, "id">) => void;
  editService: (service: Service) => void;
  deleteService: (id: string) => void;

  // OS (Service Orders)
  orders: ServiceOrder[];
  addOrder: (order: Omit<ServiceOrder, "id" | "codigo" | "createdAt" | "valorTotal">) => void;
  editOrder: (order: ServiceOrder) => void;
  deleteOrder: (id: string) => void;

  // Financial
  transactions: Transaction[];
  addTransaction: (transaction: Omit<Transaction, "id">) => void;
  editTransaction: (transaction: Transaction) => void;
  deleteTransaction: (id: string) => void;

  // Notifications
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
  addNotification: (title: string, message: string, type?: Notification["tipo"]) => void;

  // Toasts
  toasts: ToastMessage[];
  showToast: (message: string, type?: ToastMessage["type"]) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Try to load initial state from localStorage or use mocks
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("party_user");
    return saved ? JSON.parse(saved) : MOCK_USER;
  });

  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem("party_clients");
    return saved ? JSON.parse(saved) : MOCK_CLIENTS;
  });

  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem("party_employees");
    return saved ? JSON.parse(saved) : MOCK_EMPLOYEES;
  });

  const [services, setServices] = useState<Service[]>(() => {
    const saved = localStorage.getItem("party_services");
    return saved ? JSON.parse(saved) : MOCK_SERVICES;
  });

  const [orders, setOrders] = useState<ServiceOrder[]>(() => {
    const saved = localStorage.getItem("party_orders");
    return saved ? JSON.parse(saved) : MOCK_ORDERS;
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem("party_transactions");
    return saved ? JSON.parse(saved) : MOCK_TRANSACTIONS;
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Sync state to localstorage
  useEffect(() => {
    localStorage.setItem("party_user", JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem("party_clients", JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem("party_employees", JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem("party_services", JSON.stringify(services));
  }, [services]);

  useEffect(() => {
    localStorage.setItem("party_orders", JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem("party_transactions", JSON.stringify(transactions));
  }, [transactions]);

  // Toast Helper
  const showToast = useCallback((message: string, type: ToastMessage["type"] = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Notification Helper
  const addNotification = useCallback((title: string, msg: string, type: Notification["tipo"] = "info") => {
    const notif: Notification = {
      id: Math.random().toString(36).substring(2, 9),
      titulo: title,
      mensagem: msg,
      tipo: type,
      lida: false,
      data: new Date().toISOString(),
    };
    setNotifications((prev) => [notif, ...prev]);
  }, []);

  // Auth Methods
  const login = async (email: string, role: UserRole): Promise<boolean> => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (email.trim()) {
      const newUser: User = {
        id: "user-" + Math.random().toString(36).substring(2, 5),
        name: email.split("@")[0].charAt(0).toUpperCase() + email.split("@")[0].slice(1),
        email,
        role,
        avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${email}`,
      };
      setUser(newUser);
      showToast(`Bem-vindo, ${newUser.name}!`, "success");
      addNotification("Acesso Autorizado", `Login realizado como ${role}`, "info");
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    showToast("Sessão encerrada com sucesso.", "info");
  };

  const resetPassword = async (email: string): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    showToast("Link de recuperação enviado para " + email, "info");
    return true;
  };

  // Client CRUD
  const addClient = (newCli: Omit<Client, "id" | "createdAt">) => {
    const id = "cli-" + Math.random().toString(36).substring(2, 9);
    const client: Client = {
      ...newCli,
      id,
      createdAt: new Date().toISOString(),
    };
    setClients((prev) => [...prev, client]);
    showToast("Cliente cadastrado com sucesso!");
    addNotification("Novo Cliente", `Cliente ${client.nome} foi registrado no sistema.`, "success");
  };

  const editClient = (updated: Client) => {
    setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    showToast("Cliente atualizado com sucesso!");
  };

  const deleteClient = (id: string) => {
    const associatedOrders = orders.filter((o) => o.clienteId === id);
    if (associatedOrders.length > 0) {
      showToast("Não é possível excluir o cliente, pois ele possui Ordens de Serviço.", "error");
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== id));
    showToast("Cliente removido com sucesso!", "warning");
  };

  // Employee CRUD
  const addEmployee = (newEmp: Omit<Employee, "id" | "createdAt">) => {
    const id = "emp-" + Math.random().toString(36).substring(2, 9);
    const employee: Employee = {
      ...newEmp,
      id,
      createdAt: new Date().toISOString(),
    };
    setEmployees((prev) => [...prev, employee]);
    showToast("Funcionário cadastrado com sucesso!");
  };

  const editEmployee = (updated: Employee) => {
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    showToast("Funcionário atualizado com sucesso!");
  };

  const deleteEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    showToast("Funcionário removido com sucesso!", "warning");
  };

  // Service CRUD
  const addService = (newSrv: Omit<Service, "id">) => {
    const id = "srv-" + Math.random().toString(36).substring(2, 9);
    const service: Service = {
      ...newSrv,
      id,
    };
    setServices((prev) => [...prev, service]);
    showToast("Serviço cadastrado com sucesso!");
  };

  const editService = (updated: Service) => {
    setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    showToast("Serviço atualizado com sucesso!");
  };

  const deleteService = (id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id));
    showToast("Serviço removido com sucesso!", "warning");
  };

  // OS CRUD
  const addOrder = (newOrder: Omit<ServiceOrder, "id" | "codigo" | "createdAt" | "valorTotal">) => {
    const year = new Date().getFullYear();
    const count = orders.length + 1;
    const codigo = `OS-${year}-${String(count).padStart(4, "0")}`;
    const id = "os-" + Math.random().toString(36).substring(2, 9);

    // Calculate total value
    const valorTotal = newOrder.itens.reduce(
      (sum, item) => sum + item.quantidade * item.valorUnitario,
      0
    );

    const order: ServiceOrder = {
      ...newOrder,
      id,
      codigo,
      valorTotal,
      createdAt: new Date().toISOString(),
    };

    setOrders((prev) => [...prev, order]);

    // Automatically create a pending/paid transaction if order is confirmed/finalized
    if (order.status === "confirmado" || order.status === "finalizado" || order.status === "em_andamento") {
      const cli = clients.find((c) => c.id === order.clienteId);
      addTransaction({
        tipo: "receita",
        categoria: "Eventos",
        descricao: `Recebimento OS - ${order.codigo} (${cli?.nome || ""})`,
        valor: order.valorTotal,
        data: order.dataEvento,
        osId: order.id,
        status: order.status === "finalizado" ? "pago" : "pendente",
      });
    }

    showToast(`Ordem de Serviço ${codigo} criada com sucesso!`);
    addNotification("Nova OS Criada", `A Ordem de Serviço ${codigo} foi cadastrada com sucesso.`, "success");
  };

  const editOrder = (updated: ServiceOrder) => {
    // Recalculate total value
    const valorTotal = updated.itens.reduce(
      (sum, item) => sum + item.quantidade * item.valorUnitario,
      0
    );

    const orderWithTotal = {
      ...updated,
      valorTotal,
    };

    setOrders((prev) => prev.map((o) => (o.id === updated.id ? orderWithTotal : o)));

    // Sync financial transactions
    const existingTxIndex = transactions.findIndex((t) => t.osId === updated.id);
    if (existingTxIndex !== -1) {
      setTransactions((prev) =>
        prev.map((t) => {
          if (t.osId === updated.id) {
            return {
              ...t,
              valor: valorTotal,
              data: updated.dataEvento,
              status: updated.status === "finalizado" ? "pago" : "pendente",
            };
          }
          return t;
        })
      );
    }

    showToast(`Ordem de Serviço ${updated.codigo} atualizada!`);
  };

  const deleteOrder = (id: string) => {
    const order = orders.find((o) => o.id === id);
    setOrders((prev) => prev.filter((o) => o.id !== id));
    // Also clean up transaction
    setTransactions((prev) => prev.filter((t) => t.osId !== id));
    showToast(`Ordem de Serviço ${order?.codigo || ""} excluída.`, "warning");
  };

  // Financial CRUD
  const addTransaction = (newTx: Omit<Transaction, "id">) => {
    const id = "tx-" + Math.random().toString(36).substring(2, 9);
    const transaction: Transaction = {
      ...newTx,
      id,
    };
    setTransactions((prev) => [...prev, transaction]);
    showToast(`Lançamento financeiro registrado!`);
  };

  const editTransaction = (updated: Transaction) => {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    showToast("Lançamento atualizado com sucesso!");
  };

  const deleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    showToast("Lançamento financeiro removido.", "warning");
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
    );
  };

  return (
    <AppContext.Provider
      value={{
        user,
        login,
        logout,
        resetPassword,
        clients,
        addClient,
        editClient,
        deleteClient,
        employees,
        addEmployee,
        editEmployee,
        deleteEmployee,
        services,
        addService,
        editService,
        deleteService,
        orders,
        addOrder,
        editOrder,
        deleteOrder,
        transactions,
        addTransaction,
        editTransaction,
        deleteTransaction,
        notifications,
        markNotificationRead,
        addNotification,
        toasts,
        showToast,
      }}
    >
      {children}

      {/* Toast Manager Rendering */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-4 rounded-xl shadow-lg border transition-all duration-300 transform translate-y-0 scale-100 flex items-center justify-between ${
              t.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : t.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : t.type === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-blue-50 border-blue-200 text-blue-800"
            }`}
          >
            <span className="text-sm font-medium">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="ml-4 text-xs font-bold opacity-75 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};
