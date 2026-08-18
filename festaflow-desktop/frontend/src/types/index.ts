export type Role = "ADMIN" | "OPERADOR" | "FUNCIONARIO";
export type OSStatus = "PENDENTE" | "CONFIRMADO" | "EM_ANDAMENTO" | "FINALIZADO" | "CANCELADO";

export interface User { id: string; name: string; email: string; role: Role }
export interface Client { id: string; nome: string; email?: string; telefone?: string; documento?: string; endereco?: string; observacoes?: string; createdAt?: string; orders?: ServiceOrder[] }
export interface Employee { id: string; nome: string; cargo: string; telefone?: string; valorDiaria: number | string; tipoPagamento: string; observacoes?: string; orders?: ServiceOrder[] }
export interface Service { id: string; nome: string; descricao?: string; valor: number | string; duracaoHoras: number | string; categoria: string; status: string }
export interface ServiceOrderItem { id?: string; serviceId: string; quantidade: number; valorUnitario: number | string; service?: Service }
export interface ServiceOrder { id: string; codigo: string; clienteId: string; cliente?: Client; dataEvento: string; horarioInicio: string; horarioFim: string; local: string; status: OSStatus; formaPagamento?: string; observacoes?: string; assinaturaNome?: string; assinaturaData?: string; anexos?: string; valorTotal: number | string; itens: ServiceOrderItem[]; funcionarios: Employee[]; createdAt?: string }
export interface Transaction { id: string; tipo: "receita" | "despesa"; categoria: string; descricao: string; valor: number | string; data: string; status: "pago" | "pendente"; osId?: string }
export interface DashboardSummary { faturamento: number; despesas: number; lucro: number; contasReceber: number; contasPagar: number; eventos: number; ordensAtivas: number; eventosConcluidos: number; clientes: number; funcionarios: number; servicos: number; proximosEventos: ServiceOrder[] }
