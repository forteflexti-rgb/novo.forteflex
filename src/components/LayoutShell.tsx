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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrandMark } from './BrandMark';

export type AppRoute =
  | 'production-entry'
  | 'my-records'
  | 'admin-dashboard'
  | 'admin-records'
  | 'admin-reports'
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
  'production-entry': { section: 'Produção', title: 'Registro de Produção' },
  'my-records': { section: 'Produção', title: 'Meus Registros' },
  'admin-dashboard': { section: 'Gestão Executiva', title: 'Dashboard Gerencial' },
  'admin-records': { section: 'Operações', title: 'Todos os Registros' },
  'admin-reports': { section: 'Análises', title: 'Relatórios e Exportação' },
  'admin-users': { section: 'Administração', title: 'Usuários e Permissões' },
  'admin-catalog': { section: 'Administração', title: 'Cadastros Industriais' },
  'admin-imports': { section: 'Integrações', title: 'Importação e ERP Iniflex' },
  'admin-settings': { section: 'Sistema', title: 'Configurações Gerais' },
  'admin-tv': { section: 'Gestão à Vista', title: 'Modo TV / Projeção' },
};

export function LayoutShell({ activeRoute, onNavigate, children }: LayoutShellProps) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === 'admin';

  const navItems: NavItem[] = isAdmin
    ? [
        { id: 'admin-dashboard', label: 'Dashboard Gerencial', icon: BarChart3 },
        { id: 'admin-tv', label: 'Modo TV / Projeção', icon: Tv },
        { id: 'admin-records', label: 'Registros de Produção', icon: ClipboardList },
        { id: 'production-entry', label: 'Novo Lançamento', icon: ClipboardPlus },
        { id: 'admin-reports', label: 'Relatórios', icon: FileSpreadsheet },
        { id: 'admin-users', label: 'Usuários e Permissões', icon: Users },
        { id: 'admin-catalog', label: 'Setores, Linhas e Turnos', icon: Settings2 },
        { id: 'admin-imports', label: 'Importação e Iniflex', icon: UploadCloud },
        { id: 'admin-settings', label: 'Configurações Gerais', icon: SlidersHorizontal },
      ]
    : [
        { id: 'production-entry', label: 'Registrar Produção', icon: ClipboardPlus },
        ...(user.permissions.can_view_own_records || user.permissions.can_view_sector_records
          ? [{ id: 'my-records' as AppRoute, label: 'Meus Registros', icon: ClipboardList }]
          : []),
      ];

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
                className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
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
            {isAdmin ? 'Administrador da Empresa' : 'Operador de Produção'}
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
              <span>{isAdmin ? 'Administrador' : 'Produção'}</span>
            </div>
            {isAdmin && (
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
              onClick={logout}
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
