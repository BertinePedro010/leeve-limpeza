import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { Service } from "../types";
import {
  Search,
  Plus,
  Trash2,
  Edit2,
  DollarSign,
  Clock,
  X,
  Check,
} from "lucide-react";
import { cn } from "../utils/cn";

export const ServicesView: React.FC = () => {
  const { services, addService, editService, deleteService } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("todos");
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [duracaoHoras, setDuracaoHoras] = useState(0);
  const [categoria, setCategoria] = useState("");
  const [status, setStatus] = useState<"ativo" | "inativo">("ativo");

  const categories = ["todos", ...Array.from(new Set(services.map((s) => s.categoria)))];

  const filteredServices = services.filter(
    (s) =>
      (selectedCategory === "todos" || s.categoria === selectedCategory) &&
      (s.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.descricao.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOpenAdd = () => {
    setNome("");
    setDescricao("");
    setValor(0);
    setDuracaoHoras(0);
    setCategoria("Decoração");
    setStatus("ativo");
    setIsAdding(true);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !valor) return;
    addService({ nome, descricao, valor, duracaoHoras, categoria, status });
    setIsAdding(false);
  };

  const handleOpenEdit = (srv: Service) => {
    setEditingService(srv);
    setNome(srv.nome);
    setDescricao(srv.descricao);
    setValor(srv.valor);
    setDuracaoHoras(srv.duracaoHoras);
    setCategoria(srv.categoria);
    setStatus(srv.status);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;
    editService({
      ...editingService,
      nome,
      descricao,
      valor,
      duracaoHoras,
      categoria,
      status,
    });
    setEditingService(null);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Catálogo de Serviços</h2>
          <p className="text-xs text-slate-500">Defina os pacotes de serviços, garçons, DJs, decoração e precificação.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Novo Serviço
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar serviço por nome ou descrição..."
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 shrink-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition shrink-0 whitespace-nowrap",
                selectedCategory === cat
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid listing */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredServices.map((srv) => (
          <div
            key={srv.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:shadow-md transition relative flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {srv.categoria}
                  </span>
                  <h3 className="text-sm font-bold text-slate-800">{srv.nome}</h3>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => handleOpenEdit(srv)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-indigo-600 transition"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Deseja realmente excluir ${srv.nome}?`)) {
                        deleteService(srv.id);
                      }
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
                {srv.descricao}
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span>{srv.duracaoHoras}h</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-emerald-600">
                  <DollarSign className="h-4 w-4" />
                  <span>R$ {srv.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  srv.status === "ativo" ? "bg-emerald-500" : "bg-slate-300"
                )}
                title={srv.status === "ativo" ? "Ativo" : "Inativo"}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Modal Form: Add or Edit Service */}
      {(isAdding || editingService) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-zoom-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                {isAdding ? "Cadastrar Novo Serviço" : "Editar Serviço"}
              </h3>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setEditingService(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={isAdding ? handleAdd : handleEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Nome do Serviço *
                  </label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Ex: Bartender Especialista"
                  />
                </div>

                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Descrição Detalhada
                  </label>
                  <textarea
                    rows={3}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Descreva o que está incluso no pacote/serviço..."
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Categoria
                  </label>
                  <input
                    type="text"
                    required
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Ex: Decoração, Som, Buffet"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "ativo" | "inativo")}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Preço Base (R$) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={valor || ""}
                    onChange={(e) => setValor(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-right"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Duração Estimada (Horas)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={duracaoHoras || ""}
                    onChange={(e) => setDuracaoHoras(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-right"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingService(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  <Check className="h-4.5 w-4.5" />
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
