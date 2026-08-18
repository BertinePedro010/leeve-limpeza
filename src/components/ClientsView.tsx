import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { Client } from "../types";
import {
  Search,
  Plus,
  Trash2,
  Edit2,
  Mail,
  Phone,
  FileText,
  MapPin,
  History,
  X,
  Check,
} from "lucide-react";

export const ClientsView: React.FC = () => {
  const { clients, addClient, editClient, deleteClient, orders } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [documento, setDocumento] = useState("");
  const [endereco, setEndereco] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const filteredClients = clients.filter(
    (c) =>
      c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.documento.includes(searchTerm)
  );

  const handleOpenAdd = () => {
    setNome("");
    setEmail("");
    setTelefone("");
    setDocumento("");
    setEndereco("");
    setObservacoes("");
    setIsAdding(true);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !email || !telefone) return;
    addClient({ nome, email, telefone, documento, endereco, observacoes });
    setIsAdding(false);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setNome(client.nome);
    setEmail(client.email);
    setTelefone(client.telefone);
    setDocumento(client.documento);
    setEndereco(client.endereco);
    setObservacoes(client.observacoes || "");
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    editClient({
      ...editingClient,
      nome,
      email,
      telefone,
      documento,
      endereco,
      observacoes,
    });
    setEditingClient(null);
  };

  // Get Client service history
  const getClientHistory = (clientId: string) => {
    return orders.filter((o) => o.clienteId === clientId);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Diretório de Clientes</h2>
          <p className="text-xs text-slate-500">Cadastre e gerencie o histórico de eventos de seus clientes.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Novo Cliente
        </button>
      </div>

      {/* Search and filtering */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar cliente por nome, email ou CPF/CNPJ..."
          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
        />
      </div>

      {/* Grid listing */}
      <div className="grid gap-6 md:grid-cols-2">
        {filteredClients.map((client) => {
          const history = getClientHistory(client.id);
          return (
            <div
              key={client.id}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 hover:shadow-md transition relative flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{client.nome}</h3>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      DOC: {client.documento || "Não informado"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(client)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-indigo-600 transition"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Deseja realmente excluir ${client.nome}?`)) {
                          deleteClient(client.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{client.telefone}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-slate-400 truncate" />
                    <span className="truncate">{client.email}</span>
                  </div>
                </div>

                {client.endereco && (
                  <div className="flex items-start gap-1.5 text-xs text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{client.endereco}</span>
                  </div>
                )}

                {client.observacoes && (
                  <div className="flex items-start gap-1.5 text-xs bg-slate-50 p-2.5 rounded-xl text-slate-500">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{client.observacoes}</span>
                  </div>
                )}
              </div>

              {/* Service History Tracker */}
              <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <History className="h-4 w-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500">
                    {history.length} Serviço(s)
                  </span>
                </div>
                <div className="flex gap-1">
                  {history.map((os) => (
                    <span
                      key={os.id}
                      title={`${os.codigo} - ${os.status}`}
                      className={`h-2.5 w-2.5 rounded-full ${
                        os.status === "finalizado"
                          ? "bg-emerald-500"
                          : os.status === "confirmado"
                          ? "bg-indigo-500"
                          : "bg-amber-400"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Form: Add or Edit Client */}
      {(isAdding || editingClient) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-zoom-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                {isAdding ? "Cadastrar Novo Cliente" : "Editar Cliente"}
              </h3>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setEditingClient(null);
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
                    E-mail *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
                    CPF / CNPJ
                  </label>
                  <input
                    type="text"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="000.000.000-00"
                  />
                </div>

                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Endereço Completo
                  </label>
                  <input
                    type="text"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Observações Internas
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
                    setEditingClient(null);
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
