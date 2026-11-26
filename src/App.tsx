/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './lib/api';
import type { CatalogData, UserRole } from './types';
import { LoginScreen } from './components/LoginScreen';
import { LayoutShell, type AppRoute } from './components/LayoutShell';
import { ProductionForm } from './components/ProductionForm';
import { DowntimeModule } from './components/DowntimeModule';
import { LossesModule } from './components/LossesModule';
import { MyRecordsView } from './components/MyRecordsView';
import { IrogFactoryDashboard } from './components/irog/IrogFactoryDashboard';
import { IrogDrilldownView } from './components/irog/IrogDrilldownView';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminRecordsView } from './components/admin/AdminRecordsView';
import { AdminReportsView } from './components/admin/AdminReportsView';
import { AdminAlertsAuditView } from './components/admin/AdminAlertsAuditView';
import { AdminUsersView } from './components/admin/AdminUsersView';
import { AdminCatalogView } from './components/admin/AdminCatalogView';
import { AdminImportsView } from './components/admin/AdminImportsView';
import { AdminSettingsView } from './components/admin/AdminSettingsView';
import { TvProjectionView } from './components/admin/TvProjectionView';
import { AlertCircle } from 'lucide-react';

const ALLOWED_ROUTES_BY_ROLE: Record<UserRole, AppRoute[]> = {
  admin: [
    'irog-factory',
    'irog-drilldown',
    'production-entry',
    'downtimes',
    'losses',
    'my-records',
    'admin-dashboard',
    'admin-records',
    'admin-reports',
    'admin-alerts',
    'admin-users',
    'admin-catalog',
    'admin-imports',
    'admin-settings',
    'admin-tv',
  ],
  director: [
    'irog-factory',
    'irog-drilldown',
    'admin-records',
    'admin-reports',
    'admin-alerts',
    'admin-tv',
  ],
  manager: [
    'irog-factory',
    'irog-drilldown',
    'downtimes',
    'losses',
    'admin-records',
    'admin-reports',
    'admin-alerts',
  ],
  leader: [
    'irog-factory',
    'irog-drilldown',
    'production-entry',
    'downtimes',
    'losses',
    'admin-records',
  ],
  operator: ['production-entry', 'downtimes', 'losses', 'my-records'],
};

function defaultRouteForRole(role: UserRole): AppRoute {
  return role === 'operator' ? 'production-entry' : 'irog-factory';
}

function Workspace() {
  const { user, loading: authLoading } = useAuth();
  const [route, setRoute] = useState<AppRoute>('production-entry');
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [drilldownTarget, setDrilldownTarget] = useState<{
    level: 'sector' | 'line' | 'machine';
    id: string;
  } | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!user) return;
    setCatalogError(null);
    try {
      const data = await api.getCatalog();
      setCatalog(data);
    } catch (err: any) {
      setCatalogError(err.message || 'Erro ao carregar catálogos operacionais.');
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setRoute(defaultRouteForRole(user.role));
      setDrilldownTarget(null);
      loadCatalog();
    } else {
      setCatalog(null);
    }
  }, [user, loadCatalog]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-600 font-medium">Verificando sessão...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const allowedRoutes = ALLOWED_ROUTES_BY_ROLE[user.role] || ['production-entry'];
  const safeRoute: AppRoute = allowedRoutes.includes(route)
    ? route
    : defaultRouteForRole(user.role);

  const canProjectTv = user.role === 'admin' || user.role === 'director';

  if (canProjectTv && safeRoute === 'admin-tv' && catalog) {
    return (
      <TvProjectionView
        catalog={catalog}
        onExit={() => setRoute('irog-factory')}
      />
    );
  }

  const handleDrilldown = (target: { level: 'sector' | 'line' | 'machine'; id: string }) => {
    setDrilldownTarget(target);
    setRoute('irog-drilldown');
  };

  return (
    <LayoutShell activeRoute={safeRoute} onNavigate={setRoute}>
      {catalogError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{catalogError}</span>
        </div>
      )}

      {!catalog ? (
        <div className="space-y-4">
          <div className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      ) : (
        <>
          {safeRoute === 'irog-factory' && (
            <IrogFactoryDashboard
              catalog={catalog}
              onOpenTvMode={canProjectTv ? () => setRoute('admin-tv') : undefined}
              onDrilldown={handleDrilldown}
            />
          )}

          {safeRoute === 'irog-drilldown' && (
            <IrogDrilldownView catalog={catalog} initialTarget={drilldownTarget} />
          )}

          {safeRoute === 'production-entry' && (
            <ProductionForm catalog={catalog} />
          )}

          {safeRoute === 'downtimes' && (
            <DowntimeModule catalog={catalog} onCatalogUpdated={loadCatalog} />
          )}

          {safeRoute === 'losses' && (
            <LossesModule catalog={catalog} />
          )}

          {safeRoute === 'my-records' && (
            <MyRecordsView
              catalog={catalog}
              onGoToEntry={() => setRoute('production-entry')}
            />
          )}

          {safeRoute === 'admin-dashboard' && user.role === 'admin' && (
            <AdminDashboard
              catalog={catalog}
              onOpenTvMode={() => setRoute('admin-tv')}
            />
          )}

          {safeRoute === 'admin-records' && (
            <AdminRecordsView catalog={catalog} />
          )}

          {safeRoute === 'admin-reports' && (
            <AdminReportsView catalog={catalog} />
          )}

          {safeRoute === 'admin-alerts' && (
            <AdminAlertsAuditView />
          )}

          {safeRoute === 'admin-users' && user.role === 'admin' && (
            <AdminUsersView catalog={catalog} onCatalogUpdated={loadCatalog} />
          )}

          {safeRoute === 'admin-catalog' && user.role === 'admin' && (
            <AdminCatalogView catalog={catalog} onCatalogUpdated={loadCatalog} />
          )}

          {safeRoute === 'admin-imports' && user.role === 'admin' && (
            <AdminImportsView />
          )}

          {safeRoute === 'admin-settings' && user.role === 'admin' && (
            <AdminSettingsView />
          )}
        </>
      )}
    </LayoutShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Workspace />
    </AuthProvider>
  );
}

