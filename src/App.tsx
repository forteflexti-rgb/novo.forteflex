/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './lib/api';
import type { CatalogData } from './types';
import { LoginScreen } from './components/LoginScreen';
import { LayoutShell, type AppRoute } from './components/LayoutShell';
import { ProductionForm } from './components/ProductionForm';
import { MyRecordsView } from './components/MyRecordsView';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminRecordsView } from './components/admin/AdminRecordsView';
import { AdminReportsView } from './components/admin/AdminReportsView';
import { AdminUsersView } from './components/admin/AdminUsersView';
import { AdminCatalogView } from './components/admin/AdminCatalogView';
import { AdminImportsView } from './components/admin/AdminImportsView';
import { AdminSettingsView } from './components/admin/AdminSettingsView';
import { TvProjectionView } from './components/admin/TvProjectionView';
import { ServiceOrdersView } from './components/ServiceOrdersView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IrogFactoryDashboard } from './components/irog/IrogFactoryDashboard';
import { IrogDrilldownView } from './components/irog/IrogDrilldownView';
import { DowntimeModule } from './components/DowntimeModule';
import { LossesModule } from './components/LossesModule';
import { AdminAlertsAuditView } from './components/admin/AdminAlertsAuditView';
import { canViewIrog, isAdminUser } from './lib/access';
import { AlertCircle } from 'lucide-react';

function Workspace() {
  const { user, loading: authLoading } = useAuth();
  const [route, setRoute] = useState<AppRoute>('production-entry');
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [drilldownTarget, setDrilldownTarget] = useState<{ level: 'sector' | 'line' | 'machine'; id: string } | null>(null);

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
      setRoute(canViewIrog(user) ? 'irog-factory' : 'production-entry');
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

  // Enforce strict role guard in UI navigation
  const isAdmin = isAdminUser(user);
  const irog = canViewIrog(user);
  const blocked =
    (route.startsWith('irog-') && !irog) ||
    (route === 'admin-alerts' && !irog) ||
    (route.startsWith('admin-') && route !== 'admin-alerts' && !isAdmin);
  const safeRoute: AppRoute = blocked ? 'production-entry' : route;

  const handleDrilldown = (target: { level: 'sector' | 'line' | 'machine'; id: string }) => {
    setDrilldownTarget(target);
    setRoute('irog-drilldown');
  };

  if (isAdmin && safeRoute === 'admin-tv' && catalog) {
    return (
      <TvProjectionView
        catalog={catalog}
        onExit={() => setRoute('admin-dashboard')}
      />
    );
  }

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
          {irog && safeRoute === 'irog-factory' && (
            <IrogFactoryDashboard
              catalog={catalog}
              onOpenTvMode={isAdmin ? () => setRoute('admin-tv') : undefined}
              onDrilldown={handleDrilldown}
            />
          )}

          {irog && safeRoute === 'irog-drilldown' && (
            <IrogDrilldownView catalog={catalog} initialTarget={drilldownTarget} />
          )}

          {safeRoute === 'downtimes' && <DowntimeModule catalog={catalog} onCatalogUpdated={loadCatalog} />}

          {safeRoute === 'losses' && <LossesModule catalog={catalog} />}

          {irog && safeRoute === 'admin-alerts' && <AdminAlertsAuditView />}

          {safeRoute === 'service-orders' && (
            <ServiceOrdersView catalog={catalog} />
          )}

          {safeRoute === 'production-entry' && (
            <ProductionForm catalog={catalog} />
          )}

          {safeRoute === 'my-records' && (
            <MyRecordsView
              catalog={catalog}
              onGoToEntry={() => setRoute('production-entry')}
            />
          )}

          {isAdmin && safeRoute === 'admin-dashboard' && (
            <AdminDashboard
              catalog={catalog}
              onOpenTvMode={() => setRoute('admin-tv')}
            />
          )}

          {isAdmin && safeRoute === 'admin-records' && (
            <AdminRecordsView catalog={catalog} />
          )}

          {isAdmin && safeRoute === 'admin-reports' && (
            <AdminReportsView catalog={catalog} />
          )}

          {isAdmin && safeRoute === 'admin-users' && (
            <AdminUsersView catalog={catalog} onCatalogUpdated={loadCatalog} />
          )}

          {isAdmin && safeRoute === 'admin-catalog' && (
            <AdminCatalogView catalog={catalog} onCatalogUpdated={loadCatalog} />
          )}

          {isAdmin && safeRoute === 'admin-imports' && (
            <AdminImportsView />
          )}

          {isAdmin && safeRoute === 'admin-settings' && (
            <AdminSettingsView />
          )}
        </>
      )}
    </LayoutShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Workspace />
      </AuthProvider>
    </ErrorBoundary>
  );
}
