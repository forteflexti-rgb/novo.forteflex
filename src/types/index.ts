export type UserRole = 'admin' | 'operator';

export interface UserPermissions {
  can_create_records: boolean;
  can_edit_own_records: boolean;
  can_view_own_records: boolean;
  can_view_sector_records: boolean;
  can_export_own_records: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  sector_id: string | null;
  sector_name?: string | null;
  is_active: boolean;
  permissions: UserPermissions;
  created_at: string;
}

export interface Sector {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface ProductionLine {
  id: string;
  sector_id: string;
  sector_name?: string;
  code: string;
  name: string;
  capacity_per_hour: number;
  active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit_of_measure: string;
  target_cycle_minutes: number;
  active: boolean;
  created_at: string;
}

export interface Shift {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  active: boolean;
  created_at: string;
}

export interface ProductionGoal {
  id: string;
  sector_id: string;
  sector_name?: string;
  line_id: string | null;
  line_name?: string | null;
  product_id: string | null;
  product_name?: string | null;
  shift_id: string | null;
  shift_name?: string | null;
  period_type: 'daily' | 'monthly';
  target_quantity: number;
  max_loss_percent: number;
  active: boolean;
  created_at: string;
}

export interface DowntimeRecord {
  id: string;
  production_record_id: string;
  reason: string;
  duration_minutes: number;
  description: string | null;
  created_at: string;
}

export interface ProductionRecord {
  id: string;
  production_date: string;
  shift_id: string;
  shift_name?: string;
  operator_id: string;
  operator_name?: string;
  sector_id: string;
  sector_name?: string;
  line_id: string;
  line_name?: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  planned_quantity: number;
  produced_quantity: number;
  approved_quantity: number;
  loss_quantity: number;
  unit_of_measure: string;
  has_downtime: boolean;
  total_downtime_minutes: number;
  downtime_reason?: string | null;
  downtime_description?: string | null;
  notes: string | null;
  additional_notes: string | null;
  is_demo: boolean;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogData {
  sectors: Sector[];
  lines: ProductionLine[];
  products: Product[];
  shifts: Shift[];
  goals: ProductionGoal[];
  operators: Pick<UserProfile, 'id' | 'full_name' | 'username' | 'role' | 'sector_id' | 'is_active'>[];
}

export interface DashboardFilters {
  startDate: string;
  endDate: string;
  shiftId: string;
  sectorId: string;
  lineId: string;
  productId: string;
  operatorId: string;
  includeDemo: boolean;
}

export interface DashboardSummary {
  kpis: {
    todayProduction: number;
    monthProduction: number;
    plannedTotal: number;
    realizedTotal: number;
    goalAttainmentPercent: number;
    lossesTotal: number;
    lossPercent: number;
    totalDowntimeMinutes: number;
    productiveEfficiencyPercent: number;
    recordsCount: number;
    demoRecordsCount: number;
  };
  charts: {
    dailyProduction: Array<{ date: string; planned: number; realized: number; approved: number }>;
    byShift: Array<{ name: string; planned: number; realized: number; losses: number }>;
    bySector: Array<{ name: string; planned: number; realized: number; losses: number }>;
    byEmployee: Array<{ name: string; realized: number; approved: number; losses: number }>;
    byProduct: Array<{ name: string; planned: number; realized: number }>;
    plannedVsActual: Array<{ label: string; planned: number; realized: number }>;
    lossEvolution: Array<{ date: string; losses: number; lossPercent: number }>;
    downtimeReasons: Array<{ reason: string; minutes: number; occurrences: number }>;
  };
}

export interface ImportBatch {
  id: string;
  source_type: 'excel' | 'csv' | 'iniflex_api';
  filename: string;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  error_rows: number;
  status: 'validated' | 'completed' | 'failed';
  validation_summary: string | null;
  imported_by: string;
  imported_by_name?: string;
  created_at: string;
}

export interface ImportValidationRow {
  rowIndex: number;
  production_date: string;
  shift_code: string;
  operator_username: string;
  sector_code: string;
  line_code: string;
  product_sku: string;
  planned_quantity: number;
  produced_quantity: number;
  approved_quantity: number;
  loss_quantity: number;
  has_downtime: boolean;
  total_downtime_minutes: number;
  downtime_reason: string;
  notes: string;
  status: 'valid' | 'duplicate' | 'error';
  messages: string[];
  resolvedIds?: {
    shift_id: string;
    operator_id: string;
    sector_id: string;
    line_id: string;
    product_id: string;
    unit_of_measure: string;
  };
}
