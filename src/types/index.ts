// Perfis aceitos pelo Supabase (profiles_role_check, migração da Fase 2)
export type UserRole = 'admin' | 'industrial_manager' | 'sector_manager' | 'director' | 'operator' | 'ti';

export interface UserPermissions {
  can_create_records: boolean;
  can_edit_own_records: boolean;
  can_view_own_records: boolean;
  can_view_sector_records: boolean;
  can_export_own_records: boolean;
  can_register_downtime?: boolean;
  can_register_losses?: boolean;
  can_view_irog_dashboards?: boolean;
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
  /** Intervalo do turno em minutos (opcional). */
  break_minutes?: number | null;
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
  /** Origem do registro no Supabase: demo | manual | iniflex_report | iniflex_api. */
  source?: string | null;
  resource_id?: string | null;
  machine_name?: string | null;
  order_number?: string | null;
}

export interface CatalogData {
  sectors: Sector[];
  lines: ProductionLine[];
  products: Product[];
  shifts: Shift[];
  goals: ProductionGoal[];
  // IROG (Supabase: resources, process_steps, resource_standards, production_orders,
  // work_calendars, downtime_reasons, loss_reasons, production_goals.metric = 'irog')
  machines: Machine[];
  stages: ProductionStage[];
  cycleStandards: CycleTimeStandard[];
  orders: ProductionOrder[];
  calendars: ProductionCalendarEntry[];
  downtimeReasons: DowntimeReason[];
  lossReasons: LossReason[];
  irogGoals: IrogGoal[];
  operators: Pick<UserProfile, 'id' | 'full_name' | 'username' | 'role' | 'sector_id' | 'is_active'>[];
}

export interface DashboardFilters {
  startDate: string;
  endDate: string;
  shiftId: string;
  sectorId: string;
  lineId: string;
  machineId?: string;
  productId: string;
  orderId?: string;
  operatorId: string;
  includeDemo: boolean;
}

export interface DashboardSummary {
  /** Meses com produção registrada (AAAA-MM), mais recente primeiro. Ausente no modo Supabase. */
  availableMonths?: Array<{ month: string; total: number }>;
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

export interface IniflexImportSummary {
  committed: boolean;
  batchId: string | null;
  files: Array<{ filename: string; kind: string }>;
  periodStart: string;
  periodEnd: string;
  apontamentos: number;
  recordsCreated: number;
  totalWeightKg: number;
  reportedTotalWeightKg: number | null;
  totalLossKg: number;
  totalDowntimeMinutes: number;
  replacedRecords: number;
  otherRecordsInPeriod: number;
  newProducts: Array<{ sku: string; name: string }>;
  renamedProducts: number;
  newLines: string[];
  byLine: Array<{ line: string; weightKg: number; lossKg: number; downtimeMinutes: number }>;
  warnings: string[];
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

export type ServiceOrderPriority = 'low' | 'medium' | 'high' | 'critical';
export type ServiceOrderStatus = 'open' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
export type ServiceOrderCategory =
  | 'hardware'
  | 'systems_erp'
  | 'network_internet'
  | 'printers_labels'
  | 'access_passwords'
  | 'telephony'
  | 'other';

export interface ServiceOrderNote {
  id: string;
  author_id: string;
  author_name: string;
  author_role: UserRole;
  content: string;
  created_at: string;
}

export interface ServiceOrder {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  category: ServiceOrderCategory;
  priority: ServiceOrderPriority;
  status: ServiceOrderStatus;
  sector_id: string;
  sector_name?: string;
  line_or_location?: string | null;
  requester_id: string;
  requester_name: string;
  requester_email?: string;
  assigned_to_id?: string | null;
  assigned_to_name?: string | null;
  notes: ServiceOrderNote[];
  solution?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceOrderSummary {
  total: number;
  open: number;
  in_progress: number;
  critical: number;
  completed_this_month: number;
  avg_resolution_hours: number;
  by_category: { category: string; label: string; count: number }[];
  by_sector: { sector_name: string; count: number }[];
  by_priority: { priority: string; label: string; count: number }[];
}

export interface TISettings {
  emergency_phone: string;
  emergency_whatsapp: string;
  support_email: string;
  sla_hours: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  notify_critical_on_screen: boolean;
  allow_operator_direct_tickets: boolean;
}

// =============================================================================
// IROG FORTEFLEX — tipos das telas IROG, paradas, perdas e alertas
// (trazidos da versão importada; DowntimeRecord dela = DowntimeEvent aqui)
// =============================================================================
export type CalculationStatus = 'complete' | 'partial' | 'incomplete';
export type MachineStatus = 'operating' | 'stopped' | 'maintenance' | 'idle';
export interface Machine {
  id: string;
  sector_id: string;
  sector_name?: string;
  line_id: string | null;
  line_name?: string | null;
  code: string;
  name: string;
  resource_type: string;
  theoretical_capacity_per_hour: number | null;
  capacity_unit: string;
  status: MachineStatus;
  active: boolean;
  created_at: string;
}

export interface ProductionStage {
  id: string;
  sector_id: string | null;
  sector_name?: string | null;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface CycleTimeStandard {
  id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  stage_id: string | null;
  stage_name?: string | null;
  machine_id: string;
  machine_code?: string;
  machine_name?: string;
  cycle_time_minutes: number;
  theoretical_capacity_per_hour: number;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
  created_at: string;
}

export interface ProductionOrder {
  id: string;
  order_number: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  sector_id: string;
  sector_name?: string;
  line_id: string | null;
  line_name?: string | null;
  machine_id: string | null;
  machine_name?: string | null;
  planned_quantity: number;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  due_date: string | null;
  created_at: string;
}

export interface ProductionCalendarEntry {
  id: string;
  calendar_date: string;
  sector_id: string | null;
  sector_name?: string | null;
  line_id: string | null;
  line_name?: string | null;
  machine_id: string | null;
  machine_name?: string | null;
  shift_id: string | null;
  shift_name?: string | null;
  day_type: 'workday' | 'holiday' | 'planned_stop';
  available_minutes: number;
  description: string | null;
  created_at: string;
}

export interface DowntimeReason {
  id: string;
  code: string;
  name: string;
  category: string;
  is_planned: boolean;
  counts_for_availability: boolean;
  active: boolean;
  created_at: string;
}

export interface LossReason {
  id: string;
  code: string;
  name: string;
  category: 'Refugo' | 'Retrabalho' | 'Matéria-prima' | 'Setup' | 'Operacional' | 'Qualidade' | 'Outros';
  active: boolean;
  created_at: string;
}

export interface IrogGoal {
  id: string;
  scope_level: 'factory' | 'sector' | 'line' | 'machine';
  sector_id: string | null;
  sector_name?: string | null;
  line_id: string | null;
  line_name?: string | null;
  machine_id: string | null;
  machine_name?: string | null;
  target_irog_percent: number;
  target_availability_percent: number;
  target_performance_percent: number;
  target_quality_percent: number;
  max_loss_percent: number;
  effective_from: string;
  active: boolean;
  created_at: string;
}

export interface IrogCalculationMemory {
  methodology: string;
  normalizationMethod: string;
  plannedTimeMinutes: number;
  excludedPlannedDowntimeMinutes: number;
  effectivePlannedTimeMinutes: number;
  unplannedDowntimeMinutes: number;
  operatingTimeMinutes: number;
  theoreticalOutput: number | null;
  standardEarnedMinutes: number | null;
  producedQuantity: number;
  approvedQuantity: number;
  lossQuantity: number;
  incompleteReasons: string[];
  sourceRecordIds: string[];
  cycleStandardsUsed: Array<{
    machineName: string;
    productName: string;
    cycleTimeMinutes: number;
    capacityPerHour: number;
    source: 'cycle_standard' | 'machine_capacity' | 'missing';
  }>;
}

export interface IrogEntityMetrics {
  id: string;
  code?: string;
  name: string;
  level: 'factory' | 'sector' | 'line' | 'machine';
  sectorId?: string;
  sectorName?: string;
  lineId?: string | null;
  lineName?: string | null;
  machineStatus?: MachineStatus;
  theoreticalCapacityPerHour?: number | null;
  irogPercent: number | null;
  availabilityPercent: number | null;
  performancePercent: number | null;
  qualityPercent: number | null;
  plannedQuantity: number;
  producedQuantity: number;
  approvedQuantity: number;
  lossQuantity: number;
  plannedTimeMinutes: number;
  operatingTimeMinutes: number;
  downtimeMinutes: number;
  targetIrogPercent: number | null;
  irogDeviationPercent: number | null;
  goalAttainmentPercent: number;
  status: CalculationStatus;
  recordsCount: number;
  incompleteCount: number;
  memory: IrogCalculationMemory;
}

export interface IrogFactoryOverview {
  factory: IrogEntityMetrics;
  machineCounts: {
    total: number;
    operating: number;
    stopped: number;
    maintenance: number;
    idle: number;
    belowTarget: number;
  };
  sectors: IrogEntityMetrics[];
  lines: IrogEntityMetrics[];
  machines: IrogEntityMetrics[];
  charts: {
    dailyIrog: Array<{
      date: string;
      irog: number | null;
      availability: number | null;
      performance: number | null;
      quality: number | null;
      planned: number;
      realized: number;
    }>;
    weeklyIrog: Array<{ period: string; irog: number | null; availability: number | null; performance: number | null; quality: number | null }>;
    monthlyIrog: Array<{ period: string; irog: number | null; availability: number | null; performance: number | null; quality: number | null }>;
    downtimeByReason: Array<{ reason: string; category: string; minutes: number; occurrences: number }>;
    lossByReason: Array<{ reason: string; category: string; quantity: number }>;
    byShift: Array<{ name: string; irog: number | null; availability: number | null; performance: number | null; quality: number | null; realized: number; planned: number }>;
  };
  timelineEvents: Array<{
    id: string;
    timestamp: string;
    machineId: string | null;
    machineName: string;
    eventType: 'start' | 'downtime' | 'resume' | 'loss' | 'finish';
    title: string;
    detail: string;
  }>;
  demoRecordsCount: number;
  /** Quantos padrões de ciclo em uso são PROVISÓRIOS (ritmo demonstrado), não oficiais da engenharia. */
  provisionalStandards?: number;
}

export interface DowntimeEvent {
  id: string;
  /** Dia da parada (as paradas do Iniflex não têm hora de início). */
  production_date?: string | null;
  production_record_id: string | null;
  machine_id: string | null;
  machine_code?: string | null;
  machine_name?: string | null;
  sector_id: string | null;
  sector_name?: string | null;
  line_id: string | null;
  line_name?: string | null;
  shift_id: string | null;
  shift_name?: string | null;
  reason_id: string | null;
  reason: string;
  category: string | null;
  is_planned: boolean;
  counts_for_availability: boolean;
  duration_minutes: number;
  start_at: string | null;
  end_at: string | null;
  status: 'open' | 'closed';
  description: string | null;
  recorded_by?: string | null;
  recorded_by_name?: string | null;
  created_at: string;
}

export interface LossRecord {
  id: string;
  production_record_id: string | null;
  loss_date: string;
  shift_id: string;
  shift_name?: string;
  sector_id: string;
  sector_name?: string;
  line_id: string | null;
  line_name?: string | null;
  machine_id: string | null;
  machine_name?: string | null;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  production_order_id: string | null;
  order_number?: string | null;
  reason_id: string | null;
  category: string;
  reason_name: string;
  quantity: number;
  unit_of_measure: string;
  notes: string | null;
  is_demo: boolean;
  recorded_by: string;
  recorded_by_name?: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  created_at: string;
}

export interface ParameterHistoryEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  effective_from: string;
  changed_by_name?: string;
  created_at: string;
}

export interface IrogAlertRule {
  id: string;
  alert_type: string;
  name: string;
  threshold_value: number;
  comparison: 'lt' | 'gt';
  recipients: string | null;
  enabled: boolean;
  created_at: string;
}

export interface IrogActiveAlert {
  id: string;
  ruleName: string;
  severity: 'critical' | 'warning';
  entityLevel: 'factory' | 'sector' | 'line' | 'machine';
  entityName: string;
  message: string;
  currentValue: string;
  thresholdValue: string;
}

