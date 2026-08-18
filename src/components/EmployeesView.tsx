import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { Employee } from "../types";
import {
  Search,
  Plus,
  Trash2,
  Edit2,
  Phone,
  Briefcase,
  DollarSign,
  Calendar,
  X,
  Check,
  FileText,
} from "lucide-react";

export const EmployeesView: React.FC = () => {
  const { employees, addEmployee, editEmployee, deleteEmployee, orders } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [valorDiaria, setValorDiaria] = useState(0);
  const [tipoPagamento, setTipoPagamento] = useState<"diaria" | "salario">("diaria");
  const [observacoes, setObservacoes] = useState("");

  const filteredEmployees = employees.filter(
    (e) =>
      e.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.cargo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setNome("");
    setCargo("");
    setTelefone("");
    setValorDiaria(0);
    setTipoPagamento("diaria");
    setObservacoes("");
    setIsAdding(true);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !cargo || !telefone) return;
    addEmployee({ nome, cargo, telefone, valorDiaria, tipoPagamento, observacoes });
    setIsAdding(false);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setNome(emp.nome);
    setCargo(emp.cargo);
    setTelefone(emp.telefone);
    setValorDiaria(emp.valorDiaria);
    setTipoPagamento(emp.tipoPagamento);
    setObservacoes(emp.observacoes || "");
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    editEmployee({
      ...editingEmployee,
      nome,
      cargo,
      telefone,
      valorDiaria,
      tipoPagamento,
      observacoes,
    });
    setEditingEmployee(null);
  };

  // Get Employee assigned events/services
  const getEmployeeEvents = (empId: string) => {
    return orders.filter((o) => o.funcionariosIds.includes(empId));
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Equipe & Funcionários</h2>
          <p className="text-xs text-slate-500">Cadastre fornecedores, freelancers, staff e monitore agendas de diárias.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Novo Funcionário
        </button>
      </div>

      {/* Search and filtering */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar funcionário por nome ou cargo..."
          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
        />
      </div>

      {/* Grid listing */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredEmployees.map((emp) => {
          const events = getEmployeeEvents(emp.id);
          return (
            <div
              key={emp.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:shadow-md transition relative flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                      <Briefcase className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{emp.nome}</h3>
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {emp.cargo}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleOpenEdit(emp)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-indigo-600 transition"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Deseja realmente excluir ${emp.nome}?`)) {
                          deleteEmployee(emp.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{emp.telefone}</span>
                  </div>
                  <div className="flex items-center gap-2 font-semibold">
                    <DollarSign className="h-4 w-4 text-slate-400" />
                    <span>
                      R$ {emp.valorDiaria.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por{" "}
                      {emp.tipoPagamento === "diaria" ? "Diária" : "Mês"}
                    </span>
                  </div>
                </div>

                {emp.observacoes && (
                  <div className="flex items-start gap-1.5 text-xs bg-slate-50 p-2.5 rounded-xl text-slate-500">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{emp.observacoes}</span>
                  </div>
                )}
              </div>

              {/* Agenda summary */}
              <div className="pt-3 border-t border-slate-100 mt-4 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-slate-400">
                  <Calendar className="h-4 w-4" />
                  {events.length} evento(s) vinculado(s)
                </span>
                <span className="font-semibold text-slate-700">Agenda Ativa</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Form: Add or Edit Employee */}
      {(isAdding || editingEmployee) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-zoom-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                {isAdding ? "Cadastrar Novo Funcionário" : "Editar Funcionário"}
              </h3>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setEditingEmployee(null);
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
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Cargo / Função *
                  </label>
                  <input
                    type="text"
                    required
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Ex: Bartender, Decorador"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Telefone *
                  </label>
                  <input
                    type="text"
                    required
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="(00) 00000-0000"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Tipo de Pagamento
                  </label>
                  <select
                    value={tipoPagamento}
                    onChange={(e) => setTipoPagamento(e.target.value as "diaria" | "salario")}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="diaria">Valor por Diária</option>
                    <option value="salario">Salário Mensal Fixo</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={valorDiaria || ""}
                    onChange={(e) => setValorDiaria(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-right"
                  />
                </div>

                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Observações / Habilidades
                  </label>
                  <textarea
                    rows={3}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingEmployee(null);
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
