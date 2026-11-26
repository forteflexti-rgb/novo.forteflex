import React, { useState } from 'react';
import {
  BarChart3,
  ClipboardPlus,
  ClipboardList,
  Users,
  Settings2,
  FileSpreadsheet,
  UploadCloud,
  SlidersHorizontal,
  LogOut,
  Menu,
  X,
  Tv,
  Gauge,
  GitBranch,
  Wrench,
  AlertTriangle,
  Bell,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';
import { BrandMark } from './BrandMark';

export type AppRoute =
  | 'irog-factory'
  | 'irog-drilldown'
  | 'production-entry'
  | 'downtimes'
  | 'losses'
  | 'my-records'
  | 'admin-dashboard'
  | 'admin-records'
  | 'admin-reports'
  | 'admin-alerts'
  | 'admin-users'
  | 'admin-catalog'
  | 'admin-imports'
  | 'admin-settings'
  | 'admin-tv';

interface NavItem {
  id: AppRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface LayoutShellProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: React.ReactNode;
}

const ROUTE_TITLES: Record<AppRoute, { section: string; title: string }> = {
  'irog-factory': { section: 'IROG ForteFlex', title: 'Eficiência Geral da Fábrica' },
  'irog-drilldown': { section: 'IROG ForteFlex', title: 'Análise Setor, Linha e Máquina' },
  'production-entry': { section: 'Operações', title: 'Apontamento de Produção' },
  downtimes: { section: 'Operações', title: 'Controle de Paradas' },
  losses: { section: 'Operações', title: 'Perdas e Refugos' },
  'my-records': { section: 'Produção', title: 'Meus Registros' },
  'admin-dashboard': { section: 'Gestão Base', title: 'Dashboard de Produção' },
  'admin-records': { section: 'Operações', title: 'Registros de Produção' },
  'admin-reports': { section: 'Análises', title: 'Relatórios Gerenciais (14)' },
  'admin-alerts': { section: 'Governança', title: 'Alertas e Auditoria IROG' },
  'admin-users': { section: 'Administração', title: 'Usuários e Permissões' },
  'admin-catalog': { section: 'Administração', title: 'Estrutura Industrial e Metas' },
  'admin-imports': { section: 'Integrações', title: 'Importação e ERP Projedata' },
  'admin-settings': { section: 'Sistema', title: 'Configurações Gerais' },
  'admin-tv': { section: 'Gestão à Vista', title: 'Modo TV / Projeção' },
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador da Empresa',
  director: 'Diretoria Executiva',
  manager: 'Gestor Industrial',
  leader: 'Líder / Supervisor',
  operator: 'Operador de Produção',
};

const ROLE_SHORT_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  director: 'Diretoria',
  manager: 'Gestor',
  leader: 'Líder',
  operator: 'Produção',
};

export function LayoutShell({ activeRoute, onNavigate, children }: LayoutShellProps) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const role = user.role;
  const canProjectTv = role === 'admin' || role === 'director';

  let navItems: NavItem[] = [];
  if (role === 'admin') {
    navItems = [
      { id: 'irog-factory', label: 'Dashboard IROG Geral', icon: Gauge },
      { id: 'irog-drilldown', label: 'Setor, Linha e Máquina', icon: GitBranch },
      { id: 'admin-tv', label: 'Modo TV / Projeção', icon: Tv },
      { id: 'production-entry', label: 'Apontar Produção', icon: ClipboardPlus },
      { id: 'downtimes', label: 'Paradas em Linha', icon: Wrench },
      { id: 'losses', label: 'Perdas e Refugos', icon: AlertTriangle },
      { id: 'admin-records', label: 'Todos os Registros', icon: ClipboardList },
      { id: 'admin-reports', label: 'Relatórios (14)', icon: FileSpreadsheet },
      { id: 'admin-alerts', label: 'Alertas e Auditoria', icon: Bell },
      { id: 'admin-dashboard', label: 'Painel Base Produção', icon: BarChart3 },
      { id: 'admin-users', label: 'Usuários e Permissões', icon: Users },
      { id: 'admin-catalog', label: 'Estrutura Industrial', icon: Settings2 },
      { id: 'admin-imports', label: 'Importação e Projedata', icon: UploadCloud },
      { id: 'admin-settings', label: 'Configurações Gerais', icon: SlidersHorizontal },
    ];
  } else if (role === 'director') {
    navItems = [
      { id: 'irog-factory', label: 'Dashboard IROG Geral', icon: Gauge },
      { id: 'irog-drilldown', label: 'Setor, Linha e Máquina', icon: GitBranch },
      { id: 'admin-tv', label: 'Modo TV / Projeção', icon: Tv },
      { id: 'admin-records', label: 'Registros de Produção', icon: ClipboardList },
      { id: 'admin-reports', label: 'Relatórios (14)', icon: FileSpreadsheet },
      { id: 'admin-alerts', label: 'Alertas e Auditoria', icon: Bell },
    ];
  } else if (role === 'manager') {
    navItems = [
      { id: 'irog-factory', label: 'Dashboard IROG', icon: Gauge },
      { id: 'irog-drilldown', label: 'Setor, Linha e Máquina', icon: GitBranch },
      { id: 'downtimes', label: 'Paradas em Linha', icon: Wrench },
      { id: 'losses', label: 'Perdas e Refugos', icon: AlertTriangle },
      { id: 'admin-records', label: 'Registros do Setor', icon: ClipboardList },
      { id: 'admin-reports', label: 'Relatórios (14)', icon: FileSpreadsheet },
      { id: 'admin-alerts', label: 'Alertas Ativos', icon: Bell },
    ];
  } else if (role === 'leader') {
    navItems = [
      { id: 'irog-factory', label: 'Dashboard IROG', icon: Gauge },
      { id: 'irog-drilldown', label: 'Setor, Linha e Máquina', icon: GitBranch },
      { id: 'production-entry', label: 'Apontar Produção', icon: ClipboardPlus },
      { id: 'downtimes', label: 'Paradas em Linha', icon: Wrench },
      { id: 'losses', label: 'Perdas e Refugos', icon: AlertTriangle },
      { id: 'admin-records', label: 'Registros do Setor', icon: ClipboardList },
    ];
  } else {
    navItems = [
      { id: 'production-entry', label: 'Registrar Produção', icon: ClipboardPlus },
      ...(user.permissions.can_register_downtime !== false
        ? [{ id: 'downtimes' as AppRoute, label: 'Registrar Parada', icon: Wrench }]
        : []),
      ...(user.permissions.can_register_losses !== false
        ? [{ id: 'losses' as AppRoute, label: 'Registrar Perdas', icon: AlertTriangle }]
        : []),
      ...(user.permissions.can_view_own_records || user.permissions.can_view_sector_records
        ? [{ id: 'my-records' as AppRoute, label: 'Meus Registros', icon: ClipboardList }]
        : []),
    ];
  }

  const meta = ROUTE_TITLES[activeRoute];

  const handleSelect = (route: AppRoute) => {
    onNavigate(route);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Institutional Navy Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#0f2544] text-slate-100 flex flex-col shrink-0 transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <BrandMark variant="light" size="md" />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden p-1.5 text-slate-300 hover:text-white rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Navegação principal">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full min-h-[40px] px-3.5 py-2 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 text-xs text-slate-300 space-y-1">
          <div className="font-medium text-white truncate">{user.full_name}</div>
          <div className="text-slate-400 truncate">
            {ROLE_LABELS[role]}
            {user.sector_name ? ` · ${user.sector_name}` : ''}
          </div>
        </div>
      </aside>

      {/* Main Workspace Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, User & Logout on right */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu lateral"
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">{meta.section}</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
              <h1 className="font-display font-semibold text-[#0f2544] truncate">{meta.title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 whitespace-nowrap mr-1">
              <span className="font-medium text-slate-900">{user.full_name}</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>{ROLE_SHORT_LABELS[role]}</span>
            </div>
            {canProjectTv && (
              <button
                type="button"
                onClick={() => handleSelect('admin-tv')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#0f2544] hover:bg-[#17345e] text-white text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>Projetar na TV</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

