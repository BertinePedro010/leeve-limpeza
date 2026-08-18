import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { UserRole } from "../types";
import { CalendarDays, Mail, ShieldAlert, ArrowRight, RefreshCw } from "lucide-react";

export const LoginView: React.FC = () => {
  const { login, resetPassword } = useApp();

  const [email, setEmail] = useState("lorena@festaseventos.com.br");
  const [role, setRole] = useState<UserRole>("admin");
  const [loading, setLoading] = useState(false);

  // Recovery modal
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, role);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail) return;
    setRecoveryLoading(true);
    try {
      await resetPassword(recoveryEmail);
      setShowRecovery(false);
      setRecoveryEmail("");
    } catch (err) {
      console.error(err);
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background radial effects */}
      <div className="absolute top-0 left-0 h-96 w-96 rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative space-y-6">
        {/* Brand logo details */}
        <div className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <CalendarDays className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">Acesse o FestaFlow</h1>
            <p className="text-xs text-slate-500">Sistema completo de Gestão Operacional & Financeira</p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Endereço de E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@festaseventos.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-9 pr-4 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Nível de Acesso
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["admin", "operador", "funcionario"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`py-2 rounded-xl text-[10px] font-bold tracking-wide uppercase border transition-all ${
                    role === r
                      ? "bg-indigo-600/10 border-indigo-500/60 text-indigo-400"
                      : "bg-slate-950 border-slate-850 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs tracking-wider uppercase transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Conectando...
                </>
              ) : (
                <>
                  Entrar no Sistema
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer recovery link */}
        <div className="text-center pt-2">
          <button
            onClick={() => setShowRecovery(true)}
            className="text-[11px] font-semibold text-slate-500 hover:text-indigo-400 transition"
          >
            Esqueceu sua senha? Clique aqui
          </button>
        </div>

        {/* Info Credentials notice */}
        <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
          <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
            <strong>Instruções de Demo:</strong> Não é necessária senha para testar. Digite qualquer e-mail para simular o login no nível escolhido.
          </div>
        </div>
      </div>

      {/* Password Recovery Modal */}
      {showRecovery && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 animate-zoom-in">
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-white">Recuperação de Senha</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Insira o seu e-mail cadastrado e enviaremos um link de redefinição seguro.
              </p>
            </div>

            <form onSubmit={handleRecovery} className="space-y-3.5">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
                <input
                  type="email"
                  required
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="Seu e-mail de acesso"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-300 placeholder-slate-600 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecovery(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 bg-transparent hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                >
                  {recoveryLoading ? "Enviando..." : "Enviar Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
