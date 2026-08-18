import React, { useState, useMemo } from "react";
import { useApp } from "../contexts/AppContext";
import { Transaction } from "../types";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  Edit2,
  X,
  Check,
} from "lucide-react";
import { cn } from "../utils/cn";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const FinancialView: React.FC = () => {
  const { transactions, addTransaction, editTransaction, deleteTransaction } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<"todos" | "receita" | "despesa">("todos");
  const [selectedStatus, setSelectedStatus] = useState<"todos" | "pago" | "pendente">("todos");

  // Form & Editing state
  const [isAdding, setIsAdding] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  // Form inputs
  const [tipo, setTipo] = useState<"receita" | "despesa">("receita");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [data, setData] = useState("");
  const [status, setStatus] = useState<"pago" | "pendente">("pago");

  // Filtering transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchSearch =
        t.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.categoria.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = selectedType === "todos" || t.tipo === selectedType;
      const matchStatus = selectedStatus === "todos" || t.status === selectedStatus;
      return matchSearch && matchType && matchStatus;
    });
  }, [transactions, searchTerm, selectedType, selectedStatus]);

  // Aggregated totals
  const totalReceitas = useMemo(() => {
    return transactions
      .filter((t) => t.tipo === "receita" && t.status === "pago")
      .reduce((sum, t) => sum + t.valor, 0);
  }, [transactions]);

  const totalDespesas = useMemo(() => {
    return transactions
      .filter((t) => t.tipo === "despesa" && t.status === "pago")
      .reduce((sum, t) => sum + t.valor, 0);
  }, [transactions]);

  const contasAReceber = useMemo(() => {
    return transactions
      .filter((t) => t.tipo === "receita" && t.status === "pendente")
      .reduce((sum, t) => sum + t.valor, 0);
  }, [transactions]);

  const contasAPagar = useMemo(() => {
    return transactions
      .filter((t) => t.tipo === "despesa" && t.status === "pendente")
      .reduce((sum, t) => sum + t.valor, 0);
  }, [transactions]);

  const fluxoCaixa = totalReceitas - totalDespesas;

  const handleOpenAdd = () => {
    setTipo("receita");
    setCategoria("Eventos");
    setDescricao("");
    setValor(0);
    setData(new Date().toISOString().split("T")[0]);
    setStatus("pago");
    setIsAdding(true);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao || !valor || !data) return;
    addTransaction({ tipo, categoria, descricao, valor, data, status });
    setIsAdding(false);
  };

  const handleOpenEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setTipo(tx.tipo);
    setCategoria(tx.categoria);
    setDescricao(tx.descricao);
    setValor(tx.valor);
    setData(tx.data);
    setStatus(tx.status);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    editTransaction({
      ...editingTx,
      tipo,
      categoria,
      descricao,
      valor,
      data,
      status,
    });
    setEditingTx(null);
  };

  // Export to CSV simulation
  const exportToCSV = () => {
    const headers = "Data,Tipo,Categoria,Descrição,Valor,Status\n";
    const rows = filteredTransactions
      .map(
        (t) =>
          `"${t.data}","${t.tipo}","${t.categoria}","${t.descricao}",${t.valor},"${t.status}"`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Fluxo_de_Caixa_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Fluxo de Caixa & Finanças</h2>
          <p className="text-xs text-slate-500 font-medium">Controle de receitas, despesas, contas a pagar e receber de festas.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Exportar Planilha
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Novo Lançamento
          </button>
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Entradas (Realizado)</span>
          <p className="text-xl font-black text-indigo-600">R$ {fmt(totalReceitas)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saídas (Realizado)</span>
          <p className="text-xl font-black text-rose-500">R$ {fmt(totalDespesas)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lucro Líquido</span>
          <p className="text-xl font-black text-emerald-600">R$ {fmt(fluxoCaixa)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contas a Receber</span>
          <p className="text-xl font-black text-blue-600">R$ {fmt(contasAReceber)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contas a Pagar</span>
          <p className="text-xl font-black text-amber-600">R$ {fmt(contasAPagar)}</p>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar lançamento por descrição ou categoria..."
              className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs text-slate-700 focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Type filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as any)}
                className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer"
              >
                <option value="todos">Todos Tipos</option>
                <option value="receita">Apenas Receitas</option>
                <option value="despesa">Apenas Despesas</option>
              </select>
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as any)}
                className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer"
              >
                <option value="todos">Todos Status</option>
                <option value="pago">Pago / Recebido</option>
                <option value="pendente">Pendente</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-4 py-3 font-mono text-slate-500">
                    {new Date(tx.data).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        tx.tipo === "receita"
                          ? "bg-indigo-50 text-indigo-700"
                          : "bg-rose-50 text-rose-700"
                      )}
                    >
                      {tx.tipo === "receita" ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {tx.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{tx.categoria}</td>
                  <td className="px-4 py-3 text-slate-600">{tx.descricao}</td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-mono font-bold",
                      tx.tipo === "receita" ? "text-indigo-600" : "text-rose-600"
                    )}
                  >
                    R$ {fmt(tx.valor)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                        tx.status === "pago" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {tx.status === "pago" ? "pago" : "pendente"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(tx)}
                        className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-50"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Excluir esta transação permanente?")) {
                            deleteTransaction(tx.id);
                          }
                        }}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form: Add or Edit Transaction */}
      {(isAdding || editingTx) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden animate-zoom-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                {isAdding ? "Adicionar Lançamento" : "Editar Lançamento"}
              </h3>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setEditingTx(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={isAdding ? handleAdd : handleEdit} className="p-6 space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Tipo de Movimentação *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTipo("receita")}
                      className={cn(
                        "py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1",
                        tipo === "receita"
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <TrendingUp className="h-4 w-4" />
                      Receita / Entrada
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipo("despesa")}
                      className={cn(
                        "py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1",
                        tipo === "despesa"
                          ? "bg-rose-50 border-rose-300 text-rose-700"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <TrendingDown className="h-4 w-4" />
                      Despesa / Saída
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Categoria *
                  </label>
                  <input
                    type="text"
                    required
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                    placeholder="Ex: Marketing, Alimentação, Locação"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Descrição *
                  </label>
                  <input
                    type="text"
                    required
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                    placeholder="Ex: Compra de insumos adicionais"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Valor (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={valor || ""}
                      onChange={(e) => setValor(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 text-right"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Data *
                    </label>
                    <input
                      type="date"
                      required
                      value={data}
                      onChange={(e) => setData(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status do Lançamento
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "pago" | "pendente")}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="pago">Pago / Liquidado</option>
                    <option value="pendente">Pendente / Aberto</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingTx(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 flex items-center gap-1.5"
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
