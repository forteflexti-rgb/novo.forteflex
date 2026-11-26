import type {
  AuditLogEntry,
  CatalogData,
  DashboardFilters,
  DashboardSummary,
  DowntimeRecord,
  ImportBatch,
  ImportEntityType,
  ImportValidationRow,
  IntegrationLog,
  IntegrationSettings,
  IntegrationStatus,
  IrogActiveAlert,
  IrogAlertRule,
  IrogFactoryOverview,
  LossRecord,
  ParameterHistoryEntry,
  ProductionRecord,
  UserProfile,
  UserRole,
} from '../types';

let memoryToken: string | null = null;

export function getStoredToken(): string | null {
  return memoryToken;
}

export function setStoredToken(token: string | null): void {
  memoryToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (memoryToken) {
    headers.Authorization = `Bearer ${memoryToken}`;
  }

  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Erro na requisição (${response.status})`);
  }
  return data as T;
}

function buildQuery(paramsObj?: Record<string, unknown>): string {
  if (!paramsObj) return '';
  const params = new URLSearchParams();
  Object.entries(paramsObj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  health: () =>
    request<{ status: string; platform: string; module?: string; database: string; supabaseConfigured: boolean }>(
      '/api/health'
    ),

  login: (identifier: string, password: string) =>
    request<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  me: () => request<{ user: UserProfile }>('/api/auth/me'),

  recoverPassword: (identifier: string) =>
    request<{ accepted: boolean; message: string }>('/api/auth/recover', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),

  getCatalog: () => request<CatalogData>('/api/catalog'),

  // Production records
  getProductionRecords: (filters?: Partial<DashboardFilters>) =>
    request<{ records: ProductionRecord[] }>(`/api/production-records${buildQuery(filters as Record<string, unknown>)}`),

  createProductionRecord: (payload: {
    production_date: string;
    shift_id: string;
    operator_id?: string;
    sector_id: string;
    line_id: string;
    machine_id?: string | null;
    stage_id?: string | null;
    production_order_id?: string | null;
    product_id: string;
    planned_quantity: number;
    produced_quantity: number;
    approved_quantity: number;
    loss_quantity: number;
    unit_of_measure: string;
    start_time?: string | null;
    end_time?: string | null;
    planned_time_minutes?: number | null;
    has_downtime: boolean;
    total_downtime_minutes: number;
    downtime_reason_id?: string | null;
    downtime_reason?: string;
    downtime_description?: string;
    notes?: string;
    additional_notes?: string;
  }) =>
    request<{ record: ProductionRecord }>('/api/production-records', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProductionRecord: (id: string, payload: Partial<ProductionRecord>) =>
    request<{ updated: boolean; id: string }>(`/api/production-records/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteProductionRecord: (id: string) =>
    request<{ deleted: boolean }>(`/api/production-records/${id}`, {
      method: 'DELETE',
    }),

  // Standalone Downtime module
  getDowntimes: (filters?: { machineId?: string; status?: 'open' | 'closed' }) =>
    request<{ downtimes: DowntimeRecord[] }>(`/api/downtimes${buildQuery(filters)}`),

  createDowntime: (payload: {
    machine_id: string;
    shift_id: string;
    reason_id?: string | null;
    reason?: string;
    category?: string;
    start_at?: string;
    end_at?: string;
    duration_minutes?: number;
    description?: string;
    mode?: 'open' | 'closed';
  }) =>
    request<{ id: string; status: 'open' | 'closed' }>('/api/downtimes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  closeDowntime: (id: string, payload?: { end_at?: string; duration_minutes?: number; description?: string }) =>
    request<{ closed: boolean; duration_minutes: number }>(`/api/downtimes/${id}/close`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  // Standalone Losses module
  getLosses: (filters?: { includeDemo?: boolean }) =>
    request<{ losses: LossRecord[] }>(`/api/losses${buildQuery(filters)}`),

  createLoss: (payload: {
    loss_date: string;
    shift_id: string;
    sector_id: string;
    line_id?: string | null;
    machine_id?: string | null;
    product_id: string;
    production_order_id?: string | null;
    reason_id?: string | null;
    category?: string;
    reason_name?: string;
    quantity: number;
    unit_of_measure?: string;
    notes?: string;
  }) =>
    request<{ id: string }>('/api/losses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Dashboards & 4-level IROG
  getDashboardSummary: (filters: DashboardFilters) =>
    request<DashboardSummary>(`/api/dashboard/summary${buildQuery(filters as unknown as Record<string, unknown>)}`),

  getIrogOverview: (filters?: Partial<DashboardFilters>) =>
    request<IrogFactoryOverview>(`/api/irog/overview${buildQuery(filters as Record<string, unknown>)}`),

  // Alerts & Audit
  getAlerts: (includeDemo = true) =>
    request<{ rules: IrogAlertRule[]; activeAlerts: IrogActiveAlert[] }>(`/api/alerts?includeDemo=${includeDemo}`),

  createAlertRule: (payload: {
    alert_type: string;
    name: string;
    threshold_value: number;
    comparison?: 'lt' | 'gt';
    recipients?: string;
  }) =>
    request<{ id: string }>('/api/admin/alerts-config', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAlertRule: (id: string, payload: { enabled?: boolean; threshold_value?: number; recipients?: string }) =>
    request<{ updated: boolean }>(`/api/admin/alerts-config/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getAuditLogs: () =>
    request<{ logs: AuditLogEntry[]; parameterHistory: ParameterHistoryEntry[] }>('/api/admin/audit-logs'),

  // Admin Users
  getUsers: () => request<{ users: UserProfile[] }>('/api/admin/users'),

  createUser: (payload: {
    username: string;
    email: string;
    full_name: string;
    password: string;
    role: UserRole;
    sector_id?: string | null;
    allowed_sector_ids?: string[];
    permissions?: UserProfile['permissions'];
  }) =>
    request<{ user: UserProfile }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateUser: (
    id: string,
    payload: Partial<{
      full_name: string;
      email: string;
      username: string;
      role: UserRole;
      sector_id: string | null;
      allowed_sector_ids: string[];
      is_active: boolean;
      permissions: UserProfile['permissions'];
      password: string;
    }>
  ) =>
    request<{ user: UserProfile }>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Admin Catalog CRUD
  createSector: (payload: { code: string; name: string; description?: string }) =>
    request<{ id: string }>('/api/admin/sectors', { method: 'POST', body: JSON.stringify(payload) }),

  updateSector: (id: string, payload: Record<string, any>) =>
    request<{ updated: boolean }>(`/api/admin/sectors/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  createLine: (payload: { sector_id: string; code: string; name: string; capacity_per_hour: number }) =>
    request<{ id: string }>('/api/admin/lines', { method: 'POST', body: JSON.stringify(payload) }),

  updateLine: (id: string, payload: Record<string, any>) =>
    request<{ updated: boolean }>(`/api/admin/lines/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  createMachine: (payload: {
    sector_id: string;
    line_id?: string | null;
    code: string;
    name: string;
    resource_type?: string;
    theoretical_capacity_per_hour?: number | null;
    capacity_unit?: string;
    status?: string;
  }) => request<{ id: string }>('/api/admin/machines', { method: 'POST', body: JSON.stringify(payload) }),

  updateMachine: (id: string, payload: Record<string, any>) =>
    request<{ updated: boolean }>(`/api/admin/machines/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  createStage: (payload: { sector_id?: string | null; code: string; name: string; description?: string }) =>
    request<{ id: string }>('/api/admin/stages', { method: 'POST', body: JSON.stringify(payload) }),

  createCycleStandard: (payload: {
    product_id: string;
    stage_id?: string | null;
    machine_id: string;
    theoretical_capacity_per_hour?: number;
    cycle_time_minutes?: number;
  }) => request<{ id: string }>('/api/admin/cycle-standards', { method: 'POST', body: JSON.stringify(payload) }),

  createOrder: (payload: {
    order_number: string;
    product_id: string;
    sector_id: string;
    line_id?: string | null;
    machine_id?: string | null;
    planned_quantity: number;
    due_date?: string | null;
  }) => request<{ id: string }>('/api/admin/orders', { method: 'POST', body: JSON.stringify(payload) }),

  createProduct: (payload: {
    sku: string;
    name: string;
    category: string;
    unit_of_measure: string;
    target_cycle_minutes: number;
  }) => request<{ id: string }>('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) }),

  updateProduct: (id: string, payload: Record<string, any>) =>
    request<{ updated: boolean }>(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  createShift: (payload: {
    code: string;
    name: string;
    start_time: string;
    end_time: string;
    break_minutes?: number;
    working_days?: string;
  }) => request<{ id: string }>('/api/admin/shifts', { method: 'POST', body: JSON.stringify(payload) }),

  updateShift: (id: string, payload: Record<string, any>) =>
    request<{ updated: boolean }>(`/api/admin/shifts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  createCalendar: (payload: {
    calendar_date: string;
    sector_id?: string | null;
    line_id?: string | null;
    machine_id?: string | null;
    shift_id?: string | null;
    day_type: 'workday' | 'holiday' | 'planned_stop';
    available_minutes: number;
    description?: string;
  }) => request<{ id: string }>('/api/admin/calendars', { method: 'POST', body: JSON.stringify(payload) }),

  deleteCalendar: (id: string) =>
    request<{ deleted: boolean }>(`/api/admin/calendars/${id}`, { method: 'DELETE' }),

  createDowntimeReason: (payload: {
    code: string;
    name: string;
    category: string;
    is_planned: boolean;
    counts_for_availability: boolean;
  }) => request<{ id: string }>('/api/admin/downtime-reasons', { method: 'POST', body: JSON.stringify(payload) }),

  updateDowntimeReason: (id: string, payload: Record<string, any>) =>
    request<{ updated: boolean }>(`/api/admin/downtime-reasons/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  createLossReason: (payload: { code: string; name: string; category: string }) =>
    request<{ id: string }>('/api/admin/loss-reasons', { method: 'POST', body: JSON.stringify(payload) }),

  createGoal: (payload: {
    sector_id: string;
    line_id?: string | null;
    product_id?: string | null;
    shift_id?: string | null;
    period_type: 'daily' | 'monthly';
    target_quantity: number;
    max_loss_percent: number;
  }) => request<{ id: string }>('/api/admin/goals', { method: 'POST', body: JSON.stringify(payload) }),

  deleteGoal: (id: string) => request<{ deleted: boolean }>(`/api/admin/goals/${id}`, { method: 'DELETE' }),

  createIrogGoal: (payload: {
    scope_level: 'factory' | 'sector' | 'line' | 'machine';
    sector_id?: string | null;
    line_id?: string | null;
    machine_id?: string | null;
    target_irog_percent: number;
    target_availability_percent: number;
    target_performance_percent: number;
    target_quality_percent: number;
    max_loss_percent: number;
  }) => request<{ id: string }>('/api/admin/irog-goals', { method: 'POST', body: JSON.stringify(payload) }),

  deleteIrogGoal: (id: string) =>
    request<{ deleted: boolean }>(`/api/admin/irog-goals/${id}`, { method: 'DELETE' }),

  clearDemoData: () => request<{ removed: number }>('/api/admin/demo-data', { method: 'DELETE' }),

  restoreDemoData: () => request<{ created: number }>('/api/admin/demo-data', { method: 'POST' }),

  // Imports (8 types) & Projedata Iniflex integration
  getImportBatches: () =>
    request<{
      batches: ImportBatch[];
      errors: Array<{ id: string; batch_id: string; row_number: number; raw_payload: string; error_message: string; created_at: string }>;
    }>('/api/admin/imports'),

  validateImportRows: (rows: Record<string, any>[], entity_type: ImportEntityType = 'production') =>
    request<{ rows: ImportValidationRow[] }>('/api/admin/imports/validate', {
      method: 'POST',
      body: JSON.stringify({ rows, entity_type }),
    }),

  commitImportRows: (payload: {
    filename: string;
    source_type: 'excel' | 'csv' | 'iniflex_api';
    entity_type: ImportEntityType;
    rows: ImportValidationRow[];
  }) =>
    request<{ batchId: string; imported: number; duplicates: number; errors: number }>('/api/admin/imports/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getProjedataIntegration: () =>
    request<{
      settings: IntegrationSettings | null;
      logs: IntegrationLog[];
      hasBackendTokenConfigured: boolean;
    }>('/api/admin/integrations/projedata'),

  updateProjedataIntegration: (payload: {
    status: IntegrationStatus;
    api_base_url?: string | null;
    enabled_interfaces?: string[];
  }) =>
    request<{ updated: boolean }>('/api/admin/integrations/projedata', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
