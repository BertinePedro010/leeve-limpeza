import React, { useState, useMemo } from "react";
import { useApp } from "../contexts/AppContext";
import { ServiceOrder, OSStatus, ServiceOrderItem } from "../types";
import {
  Search,
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  Printer,
  Paperclip,
  CheckSquare,
} from "lucide-react";
import { cn } from "../utils/cn";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const OSView: React.FC<{
  selectedOrderId?: string | null;
  onClearSelectedOrder?: () => void;
}> = ({ selectedOrderId, onClearSelectedOrder }) => {
  const {
    orders,
    clients,
    employees,
    services,
    addOrder,
    editOrder,
    deleteOrder,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"todos" | OSStatus>("todos");

  // Form modals state
  const [isAdding, setIsAdding] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [printingOrder, setPrintingOrder] = useState<ServiceOrder | null>(null);

  // Form Fields
  const [clienteId, setClienteId] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [horarioInicio, setHorarioInicio] = useState("");
  const [horarioFim, setHorarioFim] = useState("");
  const [local, setLocal] = useState("");
  const [status, setStatus] = useState<OSStatus>("pendente");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [assinaturaNome, setAssinaturaNome] = useState("");
  const [anexos, setAnexos] = useState<string[]>([]);
  const [funcionariosIds, setFuncionariosIds] = useState<string[]>([]);
  const [itens, setItens] = useState<ServiceOrderItem[]>([]);

  // Helpers for adding items to the OS
  const [currentItemServiceId, setCurrentItemServiceId] = useState("");
  const [currentItemQty, setCurrentItemQty] = useState(1);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const client = clients.find((c) => c.id === o.clienteId);
      const matchSearch =
        o.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client?.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.local.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = selectedStatus === "todos" || o.status === selectedStatus;
      return matchSearch && matchStatus;
    });
  }, [orders, clients, searchTerm, selectedStatus]);

  // Open direct view of selected order if passed from dashboard
  React.useEffect(() => {
    if (selectedOrderId) {
      const order = orders.find((o) => o.id === selectedOrderId);
      if (order) {
        setPrintingOrder(order);
      }
      if (onClearSelectedOrder) {
        onClearSelectedOrder();
      }
    }
  }, [selectedOrderId, orders, onClearSelectedOrder]);

  const handleOpenAdd = () => {
    setClienteId(clients[0]?.id || "");
    setDataEvento(new Date().toISOString().split("T")[0]);
    setHorarioInicio("18:00");
    setHorarioFim("23:59");
    setLocal("");
    setStatus("pendente");
    setFormaPagamento("Pix à Vista");
    setObservacoes("");
    setAssinaturaNome("");
    setAnexos([]);
    setFuncionariosIds([]);
    setItens([]);
    setCurrentItemServiceId(services[0]?.id || "");
    setCurrentItemQty(1);
    setIsAdding(true);
  };

  const handleAddOrderItem = () => {
    if (!currentItemServiceId) return;
    const service = services.find((s) => s.id === currentItemServiceId);
    if (!service) return;

    // Check if item already exists
    const existsIndex = itens.findIndex((item) => item.serviceId === currentItemServiceId);
    if (existsIndex !== -1) {
      setItens((prev) =>
        prev.map((item, idx) =>
          idx === existsIndex ? { ...item, quantidade: item.quantidade + currentItemQty } : item
        )
      );
    } else {
      setItens((prev) => [
        ...prev,
        {
          serviceId: currentItemServiceId,
          quantidade: currentItemQty,
          valorUnitario: service.valor,
        },
      ]);
    }
    setCurrentItemQty(1);
  };

  const handleRemoveOrderItem = (srvId: string) => {
    setItens((prev) => prev.filter((item) => item.serviceId !== srvId));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || !dataEvento || !local || itens.length === 0) return;
    addOrder({
      clienteId,
      dataEvento,
      horarioInicio,
      horarioFim,
      local,
      status,
      formaPagamento,
      observacoes,
      itens,
      funcionariosIds,
      assinaturaNome,
      anexos,
    });
    setIsAdding(false);
  };

  const handleOpenEdit = (order: ServiceOrder) => {
    setEditingOrder(order);
    setClienteId(order.clienteId);
    setDataEvento(order.dataEvento);
    setHorarioInicio(order.horarioInicio);
    setHorarioFim(order.horarioFim);
    setLocal(order.local);
    setStatus(order.status);
    setFormaPagamento(order.formaPagamento);
    setObservacoes(order.observacoes || "");
    setAssinaturaNome(order.assinaturaNome || "");
    setAnexos(order.anexos || []);
    setFuncionariosIds(order.funcionariosIds || []);
    setItens(order.itens || []);
    setCurrentItemServiceId(services[0]?.id || "");
    setCurrentItemQty(1);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    editOrder({
      ...editingOrder,
      clienteId,
      dataEvento,
      horarioInicio,
      horarioFim,
      local,
      status,
      formaPagamento,
      observacoes,
      itens,
      funcionariosIds,
      assinaturaNome,
      anexos,
    });
    setEditingOrder(null);
  };

  const toggleEmployeeInvolvement = (empId: string) => {
    setFuncionariosIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleSimulateAttachment = () => {
    // Add a simulated photo attachment
    const randomUrls = [
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=600&q=80"
    ];
    const pick = randomUrls[Math.floor(Math.random() * randomUrls.length)];
    setAnexos((prev) => [...prev, pick]);
  };

  // Get localized style status badge
  const getStatusBadge = (st: OSStatus) => {
    switch (st) {
      case "confirmado":
        return <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full font-semibold">Confirmado</span>;
      case "em_andamento":
        return <span className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-semibold">Em Andamento</span>;
      case "finalizado":
        return <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full font-semibold">Finalizado</span>;
      case "pendente":
        return <span className="bg-blue-50 border border-blue-200 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-semibold">Pendente</span>;
      case "cancelado":
        return <span className="bg-slate-50 border border-slate-200 text-slate-500 text-xs px-2.5 py-0.5 rounded-full font-semibold">Cancelado</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Ordens de Serviço (OS)</h2>
          <p className="text-xs text-slate-500">Ordens operacionais de eventos, montagem, equipes e faturamentos.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nova Ordem de Serviço
        </button>
      </div>

      {/* Filtering Panel */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código, cliente ou endereço do local..."
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0 shrink-0">
          {(["todos", "pendente", "confirmado", "em_andamento", "finalizado", "cancelado"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-semibold capitalize tracking-wide transition shrink-0",
                selectedStatus === st
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
              )}
            >
              {st === "todos" ? "Todos Status" : st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Main OS List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <th className="px-5 py-3.5">Código</th>
                <th className="px-5 py-3.5">Cliente</th>
                <th className="px-5 py-3.5">Data do Evento</th>
                <th className="px-5 py-3.5">Local</th>
                <th className="px-5 py-3.5 text-right">Valor Total</th>
                <th className="px-5 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    Nenhuma Ordem de Serviço encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const client = clients.find((c) => c.id === o.clienteId);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-5 py-4 font-mono font-bold text-slate-700">{o.codigo}</td>
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-slate-800">{client?.nome}</p>
                          <p className="text-[10px] text-slate-400">{client?.telefone}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {new Date(o.dataEvento).toLocaleDateString("pt-BR")}
                        <span className="block text-[10px] font-normal text-slate-400">
                          {o.horarioInicio} - {o.horarioFim}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500 truncate max-w-[200px]">{o.local}</td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-indigo-600">
                        R$ {fmt(o.valorTotal)}
                      </td>
                      <td className="px-5 py-4 text-center">{getStatusBadge(o.status)}</td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setPrintingOrder(o)}
                            title="Imprimir OS / Detalhes"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(o)}
                            title="Editar OS"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Excluir permanentemente a Ordem ${o.codigo}?`)) {
                                deleteOrder(o.id);
                              }
                            }}
                            title="Excluir OS"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Form: Add or Edit OS ────────────────── */}
      {(isAdding || editingOrder) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-zoom-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
              <h3 className="text-base font-bold text-slate-800">
                {isAdding ? "Criar Ordem de Serviço" : `Editar Ordem ${editingOrder?.codigo}`}
              </h3>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setEditingOrder(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={isAdding ? handleAdd : handleEdit} className="p-6 overflow-y-auto space-y-6">
              {/* Basic Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Cliente Responsável *
                  </label>
                  <select
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-500"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Data do Evento *
                  </label>
                  <input
                    type="date"
                    required
                    value={dataEvento}
                    onChange={(e) => setDataEvento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Status Atual da OS
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as OSStatus)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="confirmado">Confirmado</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="finalizado">Finalizado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Local do Evento *
                  </label>
                  <input
                    type="text"
                    required
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    placeholder="Av. Paulista, 1000 - Bela Vista"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Hora Início
                    </label>
                    <input
                      type="time"
                      value={horarioInicio}
                      onChange={(e) => setHorarioInicio(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Hora Fim
                    </label>
                    <input
                      type="time"
                      value={horarioFim}
                      onChange={(e) => setHorarioFim(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Services contract list */}
              <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CheckSquare className="h-4 w-4 text-indigo-600" />
                  Serviços Contratados
                </h4>

                {/* Add Service Item box */}
                <div className="flex flex-wrap items-end gap-3 bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex-1 min-w-[200px]">
                    <label className="mb-1 block text-[10px] font-semibold text-slate-400">Selecionar Serviço</label>
                    <select
                      value={currentItemServiceId}
                      onChange={(e) => setCurrentItemServiceId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 bg-white"
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome} - R$ {fmt(s.valor)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-20">
                    <label className="mb-1 block text-[10px] font-semibold text-slate-400">Qtd</label>
                    <input
                      type="number"
                      min="1"
                      value={currentItemQty}
                      onChange={(e) => setCurrentItemQty(parseInt(e.target.value) || 1)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 text-center"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddOrderItem}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition shrink-0"
                  >
                    Adicionar
                  </button>
                </div>

                {/* List of items */}
                <div className="space-y-2">
                  {itens.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">Nenhum serviço adicionado a esta OS ainda.</p>
                  ) : (
                    itens.map((item) => {
                      const service = services.find((s) => s.id === item.serviceId);
                      return (
                        <div
                          key={item.serviceId}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-100 text-xs"
                        >
                          <div>
                            <p className="font-bold text-slate-700">{service?.nome}</p>
                            <span className="text-[10px] text-slate-400">
                              R$ {fmt(item.valorUnitario)} × {item.quantidade}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-indigo-600">
                              R$ {fmt(item.quantidade * item.valorUnitario)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveOrderItem(item.serviceId)}
                              className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Staff assignment & payment options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Staff Assignment */}
                <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700">Equipe Escalada</h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {employees.map((emp) => {
                      const isAssigned = funcionariosIds.includes(emp.id);
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => toggleEmployeeInvolvement(emp.id)}
                          className={cn(
                            "w-full flex items-center justify-between p-2 rounded-lg border text-left text-xs font-semibold transition",
                            isAssigned
                              ? "bg-indigo-50/60 border-indigo-200 text-indigo-700"
                              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                          )}
                        >
                          <span>{emp.nome} ({emp.cargo})</span>
                          {isAssigned && <Check className="h-4 w-4" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payments, attachments, observations */}
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Forma de Pagamento / Condições
                    </label>
                    <input
                      type="text"
                      value={formaPagamento}
                      onChange={(e) => setFormaPagamento(e.target.value)}
                      placeholder="Ex: Pix 50/50"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Assinatura de Acordo / Contrato (Nome)
                    </label>
                    <input
                      type="text"
                      value={assinaturaNome}
                      onChange={(e) => setAssinaturaNome(e.target.value)}
                      placeholder="Nome do cliente que deu o aceite"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>

                  {/* Attachment Box */}
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Anexos (Projetos / Fotos)
                    </label>
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        onClick={handleSimulateAttachment}
                        className="flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 shadow-sm"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        Simular Upload
                      </button>

                      {anexos.map((url, idx) => (
                        <div key={idx} className="relative group h-9 w-9 rounded-lg border border-slate-200 overflow-hidden">
                          <img src={url} alt="anexo" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setAnexos((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute inset-0 bg-rose-500/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Observações Detalhadas
                </label>
                <textarea
                  rows={3}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Instruções especiais de logística, montagem, restrições alimentares, etc."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingOrder(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  <Check className="h-4.5 w-4.5" />
                  Salvar OS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal PDF / Print Layout ─────────────────── */}
      {printingOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-4xl w-full my-8 overflow-hidden animate-zoom-in">
            {/* Action Bar */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Layout de Impressão de Contrato e OS
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-indigo-700 transition"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir / PDF
                </button>
                <button
                  onClick={() => setPrintingOrder(null)}
                  className="p-2 rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Printable Layout */}
            <div className="p-8 space-y-8 print:p-0 text-slate-800">
              {/* Invoice Brand header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-6">
                <div className="space-y-1">
                  <h1 className="text-2xl font-black text-slate-900">FestaFlow Eventos</h1>
                  <p className="text-xs text-slate-500">CNPJ: 12.345.678/0001-90 | Tel: (11) 99888-7766</p>
                  <p className="text-xs text-slate-400">Rua das Orquídeas, 1200 - São Paulo - SP</p>
                </div>
                <div className="text-right space-y-1">
                  <span className="inline-block text-xs font-bold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full uppercase tracking-wider">
                    {printingOrder.codigo}
                  </span>
                  <p className="text-xs text-slate-500">
                    Emissão: {new Date(printingOrder.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>

              {/* Client & Logistics Details */}
              <div className="grid grid-cols-2 gap-6 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                <div className="space-y-1.5 text-xs">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px] text-slate-400">
                    Cliente / Contratante
                  </h3>
                  {(() => {
                    const client = clients.find((c) => c.id === printingOrder.clienteId);
                    return (
                      <>
                        <p className="font-bold text-slate-800">{client?.nome}</p>
                        <p className="text-slate-600">Doc: {client?.documento}</p>
                        <p className="text-slate-600">Tel: {client?.telefone}</p>
                        <p className="text-slate-600">E-mail: {client?.email}</p>
                      </>
                    );
                  })()}
                </div>

                <div className="space-y-1.5 text-xs">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px] text-slate-400">
                    Logística do Evento
                  </h3>
                  <p className="font-bold text-slate-800">Local: {printingOrder.local}</p>
                  <p className="text-slate-600">
                    Data do Evento: {new Date(printingOrder.dataEvento).toLocaleDateString("pt-BR")}
                  </p>
                  <p className="text-slate-600">
                    Horário: {printingOrder.horarioInicio} às {printingOrder.horarioFim}
                  </p>
                  <p className="text-slate-600">Forma Pagto: {printingOrder.formaPagamento}</p>
                </div>
              </div>

              {/* Items Contract Table */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px] text-slate-400">
                  Especificação dos Serviços Contratados
                </h3>
                <table className="w-full text-xs text-left border border-slate-200 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <th className="px-4 py-2.5">Item</th>
                      <th className="px-4 py-2.5">Descrição</th>
                      <th className="px-4 py-2.5 text-center">Quantidade</th>
                      <th className="px-4 py-2.5 text-right">Valor Unitário</th>
                      <th className="px-4 py-2.5 text-right">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {printingOrder.itens.map((item, idx) => {
                      const service = services.find((s) => s.id === item.serviceId);
                      return (
                        <tr key={idx}>
                          <td className="px-4 py-3 font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-800">{service?.nome}</p>
                            <p className="text-[10px] text-slate-500 leading-relaxed max-w-[400px]">
                              {service?.descricao}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-700">{item.quantidade}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-600">
                            R$ {fmt(item.valorUnitario)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                            R$ {fmt(item.quantidade * item.valorUnitario)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold border-t border-slate-200">
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-slate-600 uppercase tracking-wider text-[10px]">
                        Valor Total da OS
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right font-mono text-indigo-700 text-sm">
                        R$ {fmt(printingOrder.valorTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Staff members in charge */}
              {printingOrder.funcionariosIds.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px] text-slate-400">
                    Equipe / Responsáveis Escalados
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {printingOrder.funcionariosIds.map((id) => {
                      const emp = employees.find((e) => e.id === id);
                      return (
                        <div
                          key={id}
                          className="bg-slate-50 border border-slate-200/60 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          {emp?.nome} ({emp?.cargo})
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Detailed Terms and conditions / notes */}
              {printingOrder.observacoes && (
                <div className="space-y-2 border-t border-slate-100 pt-6">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px] text-slate-400">
                    Observações e Notas do Contrato
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium bg-slate-50/50 p-4 rounded-xl">
                    {printingOrder.observacoes}
                  </p>
                </div>
              )}

              {/* Signature section */}
              <div className="grid grid-cols-2 gap-12 pt-12 border-t border-slate-200 text-xs">
                <div className="text-center space-y-4">
                  <div className="border-b border-slate-400 h-10 w-full" />
                  <p className="font-bold text-slate-800">FestaFlow Eventos Ltda.</p>
                  <p className="text-slate-400">Contratado</p>
                </div>

                <div className="text-center space-y-4">
                  <div className="border-b border-slate-400 h-10 w-full flex items-center justify-center">
                    {printingOrder.assinaturaNome && (
                      <span className="font-serif italic text-base text-indigo-700 tracking-wider">
                        {printingOrder.assinaturaNome}
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-slate-800">
                    {clients.find((c) => c.id === printingOrder.clienteId)?.nome || "Contratante"}
                  </p>
                  <p className="text-slate-400">
                    Contratante (Aceite em:{" "}
                    {printingOrder.assinaturaData
                      ? new Date(printingOrder.assinaturaData).toLocaleDateString("pt-BR")
                      : "pendente"}
                    )
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
