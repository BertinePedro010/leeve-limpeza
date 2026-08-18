export type UserRole = "admin" | "operador" | "funcionario";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
}

export interface Client {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  documento: string; // CPF or CNPJ
  endereco: string;
  observacoes?: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  nome: string;
  cargo: string;
  telefone: string;
  valorDiaria: number;
  tipoPagamento: "diaria" | "salario";
  observacoes?: string;
  createdAt: string;
}

export interface Service {
  id: string;
  nome: string;
  descricao: string;
  valor: number;
  duracaoHoras: number;
  categoria: string;
  status: "ativo" | "inativo";
}

export type OSStatus = "pendente" | "confirmado" | "em_andamento" | "finalizado" | "cancelado";

export interface ServiceOrderItem {
  serviceId: string;
  quantidade: number;
  valorUnitario: number;
}

export interface ServiceOrder {
  id: string;
  codigo: string; // e.g., OS-2026-0001
  clienteId: string;
  dataEvento: string;
  horarioInicio: string;
  horarioFim: string;
  local: string;
  status: OSStatus;
  formaPagamento: string;
  observacoes?: string;
  itens: ServiceOrderItem[];
  funcionariosIds: string[];
  assinaturaNome?: string;
  assinaturaData?: string;
  anexos: string[]; // image/file URLs
  valorTotal: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  tipo: "receita" | "despesa";
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  osId?: string; // Associated OS if any
  status: "pago" | "pendente";
}

export interface Notification {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: "info" | "success" | "warning" | "error";
  lida: boolean;
  data: string;
}
