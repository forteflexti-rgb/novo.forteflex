import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User, ArrowRight, AlertCircle, CheckCircle2, Factory, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { BrandMark } from './BrandMark';

const FACILITY_IMAGE = '/src/assets/images/forteflex_industrial_facility_1795090606698.jpg';

export function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

  const [showDemoHelper, setShowDemoHelper] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Preencha usuário ou e-mail e senha para entrar.');
      return;
    }

    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Não foi possível realizar o acesso.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRecoveryMessage(null);
    if (!recoveryIdentifier.trim()) {
      setError('Informe seu usuário ou e-mail para solicitar a recuperação de senha.');
      return;
    }

    setRecoverySubmitting(true);
    try {
      const res = await api.recoverPassword(recoveryIdentifier.trim());
      setRecoveryMessage(res.message);
    } catch (err: any) {
      setError(err.message || 'Erro ao solicitar recuperação.');
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const fillDemoAccount = (user: string, pass: string) => {
    setRecoveryMode(false);
    setError(null);
    setIdentifier(user);
    setPassword(pass);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Institutional Visual Column */}
      <div className="relative lg:w-[46%] min-h-[240px] lg:min-h-screen bg-[#0f2544] overflow-hidden flex flex-col justify-between p-8 lg:p-12">
        {!imgFailed ? (
          <img
            src={FACILITY_IMAGE}
            alt="Linha de produção industrial novo.forteflex"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-55"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#09172b] via-[#0f2544] to-[#17345e] flex items-center justify-center opacity-40">
            <Factory className="w-32 h-32 text-blue-300/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#09172b]/95 via-[#0f2544]/70 to-[#0f2544]/55" />

        <div className="relative z-10">
          <BrandMark variant="light" size="lg" />
        </div>

        <div className="relative z-10 max-w-lg mt-12 lg:mt-0">
          <p className="text-xs font-medium tracking-wide text-blue-200 mb-3">
            Plataforma de Gestão Industrial
          </p>
          <h1
            className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-white leading-tight mb-4"
            style={{ textWrap: 'balance' }}
          >
            Do apontamento em linha aos indicadores gerenciais em tempo real.
          </h1>
          <p className="text-sm sm:text-base text-slate-200/90 leading-relaxed mb-8">
            Registre produção por turno, controle refugos e motivos de parada e acompanhe metas com rastreabilidade completa por operador e setor.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-white/15 text-slate-100">
            <div>
              <div className="text-xs text-blue-200 mb-1">Chão de Fábrica</div>
              <div className="text-sm font-medium">Lançamento guiado</div>
            </div>
            <div>
              <div className="text-xs text-blue-200 mb-1">Rastreabilidade</div>
              <div className="text-sm font-medium">Auditoria por usuário</div>
            </div>
            <div>
              <div className="text-xs text-blue-200 mb-1">Gestão</div>
              <div className="text-sm font-medium">Dashboards &amp; Excel</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Column */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-16 bg-slate-50">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-7 sm:p-9">
          <div className="mb-7">
            <div className="lg:hidden mb-5">
              <BrandMark variant="dark" size="md" />
            </div>
            <h2 className="text-2xl font-display font-bold text-[#0f2544]">
              {recoveryMode ? 'Recuperar acesso' : 'Acesso ao sistema'}
            </h2>
            <p className="text-sm text-slate-500 mt-1.5">
              {recoveryMode
                ? 'Informe seu usuário ou e-mail corporativo para solicitar a redefinição.'
                : 'Entre com seu usuário ou e-mail individual para acessar sua área de trabalho.'}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-sm text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {recoveryMessage && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-sm text-emerald-800"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{recoveryMessage}</span>
            </div>
          )}

          {!recoveryMode ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-identifier" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Usuário ou e-mail
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="ex.: carlos.silva ou nome@forteflex.com.br"
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setRecoveryMessage(null);
                      setRecoveryMode(true);
                    }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full min-h-[44px] pl-10 pr-11 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Visualizar senha'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] mt-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>{submitting ? 'Autenticando...' : 'Entrar no sistema'}</span>
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRecovery} className="space-y-4">
              <div>
                <label htmlFor="recover-identifier" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Usuário ou e-mail cadastrado
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="recover-identifier"
                    type="text"
                    value={recoveryIdentifier}
                    onChange={(e) => setRecoveryIdentifier(e.target.value)}
                    placeholder="ex.: carlos.silva"
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={recoverySubmitting}
                  className="flex-1 min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer"
                >
                  {recoverySubmitting ? 'Enviando...' : 'Solicitar redefinição'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMode(false);
                    setError(null);
                    setRecoveryMessage(null);
                  }}
                  className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg transition-colors cursor-pointer"
                >
                  Voltar ao login
                </button>
              </div>
            </form>
          )}

          {/* Transparent Demo Accounts Helper */}
          <div className="mt-7 pt-5 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowDemoHelper((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-medium text-slate-600 hover:text-[#0f2544] py-1 cursor-pointer"
            >
              <span>Acessos iniciais de demonstração</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showDemoHelper ? 'rotate-180' : ''}`} />
            </button>

            {showDemoHelper && (
              <div className="mt-3 space-y-2 text-xs">
                <p className="text-slate-500 leading-relaxed">
                  Credenciais criadas para validação inicial do sistema (senhas armazenadas com hash criptográfico no banco).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('admin', 'Forte@2026')}
                    className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-[#0f2544]">Administrador</div>
                    <div className="font-mono text-[11px] text-slate-600 mt-0.5">admin / Forte@2026</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('carlos.silva', 'Prod@2026')}
                    className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-[#0f2544]">Extrusão (Operador)</div>
                    <div className="font-mono text-[11px] text-slate-600 mt-0.5">carlos.silva / Prod@2026</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('mariana.costa', 'Prod@2026')}
                    className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-[#0f2544]">Corte e Solda (Operador)</div>
                    <div className="font-mono text-[11px] text-slate-600 mt-0.5">mariana.costa / Prod@2026</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('joao.santos', 'Prod@2026')}
                    className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-[#0f2544]">Impressão (Operador)</div>
                    <div className="font-mono text-[11px] text-slate-600 mt-0.5">joao.santos / Prod@2026</div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
