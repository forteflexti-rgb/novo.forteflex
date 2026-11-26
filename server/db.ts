import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'forteflex.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function hasColumn(tableName: string, columnName: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === columnName);
}

function addColumnIfMissing(tableName: string, columnName: string, columnDef: string): void {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  }
}

export function recordAuditLog(params: {
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: unknown;
}): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `aud-${crypto.randomUUID().slice(0, 12)}`,
      params.actorId,
      params.actorName,
      params.action,
      params.entityType,
      params.entityId ?? null,
      params.details !== undefined ? JSON.stringify(params.details) : null
    );
  } catch {
    // avoid crashing business transaction on non-critical audit insert
  }
}

export function recordParameterHistory(params: {
  entityType: string;
  entityId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string;
  changedBy: string | null;
}): void {
  db.prepare(
    `INSERT INTO parameter_history (id, entity_type, entity_id, field_name, old_value, new_value, changed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `hist-${crypto.randomUUID().slice(0, 12)}`,
    params.entityType,
    params.entityId,
    params.fieldName,
    params.oldValue,
    params.newValue,
    params.changedBy
  );
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sectors (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'director', 'manager', 'leader', 'operator')),
      sector_id TEXT REFERENCES sectors(id) ON DELETE SET NULL,
      allowed_sector_ids TEXT NOT NULL DEFAULT '[]',
      allowed_line_ids TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      permissions TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS production_lines (
      id TEXT PRIMARY KEY,
      sector_id TEXT NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      capacity_per_hour REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit_of_measure TEXT NOT NULL DEFAULT 'kg',
      target_cycle_minutes REAL NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      break_minutes INTEGER NOT NULL DEFAULT 0,
      working_days TEXT NOT NULL DEFAULT 'Seg,Ter,Qua,Qui,Sex',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS production_records (
      id TEXT PRIMARY KEY,
      production_date TEXT NOT NULL,
      shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
      operator_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      sector_id TEXT NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
      line_id TEXT NOT NULL REFERENCES production_lines(id) ON DELETE RESTRICT,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      planned_quantity REAL NOT NULL,
      produced_quantity REAL NOT NULL,
      approved_quantity REAL NOT NULL,
      loss_quantity REAL NOT NULL,
      unit_of_measure TEXT NOT NULL,
      has_downtime INTEGER NOT NULL DEFAULT 0,
      total_downtime_minutes INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      additional_notes TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS downtime_records (
      id TEXT PRIMARY KEY,
      production_record_id TEXT REFERENCES production_records(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS production_goals (
      id TEXT PRIMARY KEY,
      sector_id TEXT NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
      line_id TEXT REFERENCES production_lines(id) ON DELETE SET NULL,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      shift_id TEXT REFERENCES shifts(id) ON DELETE SET NULL,
      period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'monthly')),
      target_quantity REAL NOT NULL,
      max_loss_percent REAL NOT NULL DEFAULT 3.0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL CHECK (source_type IN ('excel', 'csv', 'iniflex_api')),
      entity_type TEXT NOT NULL DEFAULT 'production',
      filename TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      duplicate_rows INTEGER NOT NULL DEFAULT 0,
      error_rows INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('validated', 'completed', 'failed')),
      validation_summary TEXT,
      imported_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migrateIrogSchema();

  const sectorCount = db.prepare('SELECT COUNT(*) as c FROM sectors').get() as { c: number };
  if (sectorCount.c === 0) {
    seedInitialCatalogAndUsers();
  }

  seedIrogCatalogIfEmpty();

  const prodCount = db.prepare('SELECT COUNT(*) as c FROM production_records').get() as { c: number };
  if (prodCount.c === 0) {
    seedDemoProductionData();
  }
}

function migrateIrogSchema(): void {
  // Safely expand profiles table if old 2-role CHECK constraint exists
  const profileSqlRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='profiles'")
    .get() as { sql?: string } | undefined;

  if (profileSqlRow?.sql && !profileSqlRow.sql.includes("'director'")) {
    db.pragma('foreign_keys = OFF');
    const tx = db.transaction(() => {
      db.exec(`
        CREATE TABLE profiles_new (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'director', 'manager', 'leader', 'operator')),
          sector_id TEXT REFERENCES sectors(id) ON DELETE SET NULL,
          allowed_sector_ids TEXT NOT NULL DEFAULT '[]',
          allowed_line_ids TEXT NOT NULL DEFAULT '[]',
          is_active INTEGER NOT NULL DEFAULT 1,
          permissions TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO profiles_new (id, username, email, password_hash, full_name, role, sector_id, is_active, permissions, created_at, updated_at)
        SELECT id, username, email, password_hash, full_name, role, sector_id, is_active, permissions, created_at, updated_at FROM profiles;
        DROP TABLE profiles;
        ALTER TABLE profiles_new RENAME TO profiles;
      `);
    });
    tx();
    db.pragma('foreign_keys = ON');
  } else {
    addColumnIfMissing('profiles', 'allowed_sector_ids', "TEXT NOT NULL DEFAULT '[]'");
    addColumnIfMissing('profiles', 'allowed_line_ids', "TEXT NOT NULL DEFAULT '[]'");
  }

  // Incremental non-destructive table creation for IROG ForteFlex
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      sector_id TEXT NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
      line_id TEXT REFERENCES production_lines(id) ON DELETE SET NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      resource_type TEXT NOT NULL DEFAULT 'Máquina',
      theoretical_capacity_per_hour REAL,
      capacity_unit TEXT NOT NULL DEFAULT 'kg',
      status TEXT NOT NULL DEFAULT 'operating' CHECK (status IN ('operating', 'stopped', 'maintenance', 'idle')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS production_stages (
      id TEXT PRIMARY KEY,
      sector_id TEXT REFERENCES sectors(id) ON DELETE SET NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS production_calendars (
      id TEXT PRIMARY KEY,
      calendar_date TEXT NOT NULL,
      sector_id TEXT REFERENCES sectors(id) ON DELETE CASCADE,
      line_id TEXT REFERENCES production_lines(id) ON DELETE CASCADE,
      machine_id TEXT REFERENCES machines(id) ON DELETE CASCADE,
      shift_id TEXT REFERENCES shifts(id) ON DELETE CASCADE,
      day_type TEXT NOT NULL CHECK (day_type IN ('workday', 'holiday', 'planned_stop')),
      available_minutes INTEGER NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_operations (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      stage_id TEXT NOT NULL REFERENCES production_stages(id) ON DELETE RESTRICT,
      sequence_order INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE (product_id, stage_id)
    );

    CREATE TABLE IF NOT EXISTS cycle_time_standards (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      stage_id TEXT REFERENCES production_stages(id) ON DELETE SET NULL,
      machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
      cycle_time_minutes REAL NOT NULL,
      theoretical_capacity_per_hour REAL NOT NULL,
      effective_from TEXT NOT NULL DEFAULT (datetime('now')),
      effective_to TEXT,
      is_current INTEGER NOT NULL DEFAULT 1,
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS production_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      sector_id TEXT NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
      line_id TEXT REFERENCES production_lines(id) ON DELETE SET NULL,
      machine_id TEXT REFERENCES machines(id) ON DELETE SET NULL,
      planned_quantity REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS downtime_reasons (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      is_planned INTEGER NOT NULL DEFAULT 0,
      counts_for_availability INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loss_reasons (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loss_records (
      id TEXT PRIMARY KEY,
      production_record_id TEXT REFERENCES production_records(id) ON DELETE SET NULL,
      loss_date TEXT NOT NULL,
      shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
      sector_id TEXT NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
      line_id TEXT REFERENCES production_lines(id) ON DELETE SET NULL,
      machine_id TEXT REFERENCES machines(id) ON DELETE SET NULL,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      production_order_id TEXT REFERENCES production_orders(id) ON DELETE SET NULL,
      reason_id TEXT REFERENCES loss_reasons(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      reason_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_of_measure TEXT NOT NULL,
      notes TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      recorded_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS irog_goals (
      id TEXT PRIMARY KEY,
      scope_level TEXT NOT NULL CHECK (scope_level IN ('factory', 'sector', 'line', 'machine')),
      sector_id TEXT REFERENCES sectors(id) ON DELETE CASCADE,
      line_id TEXT REFERENCES production_lines(id) ON DELETE CASCADE,
      machine_id TEXT REFERENCES machines(id) ON DELETE CASCADE,
      target_irog_percent REAL NOT NULL,
      target_availability_percent REAL NOT NULL,
      target_performance_percent REAL NOT NULL,
      target_quality_percent REAL NOT NULL,
      max_loss_percent REAL NOT NULL DEFAULT 3.0,
      effective_from TEXT NOT NULL DEFAULT (datetime('now')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS irog_alerts_config (
      id TEXT PRIMARY KEY,
      alert_type TEXT NOT NULL,
      name TEXT NOT NULL,
      threshold_value REAL NOT NULL,
      comparison TEXT NOT NULL CHECK (comparison IN ('lt', 'gt')),
      recipients TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parameter_history (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT NOT NULL,
      effective_from TEXT NOT NULL DEFAULT (datetime('now')),
      changed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS integration_settings (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'not_configured',
      api_base_url TEXT,
      docs_url TEXT NOT NULL DEFAULT 'https://projedata-api.apidog.io/',
      read_only INTEGER NOT NULL DEFAULT 1,
      enabled_interfaces TEXT NOT NULL DEFAULT '["EXP_AP_PRODUCAO_V1","EXP_AP_PERDA_V1","EXP_AP_PARADA_V1"]',
      last_sync_at TEXT,
      last_error TEXT,
      updated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS integration_logs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'projedata_iniflex',
      interface_name TEXT NOT NULL,
      status TEXT NOT NULL,
      records_read INTEGER NOT NULL DEFAULT 0,
      records_imported INTEGER NOT NULL DEFAULT 0,
      duplicates_skipped INTEGER NOT NULL DEFAULT 0,
      message TEXT,
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_errors (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      row_number INTEGER NOT NULL,
      raw_payload TEXT NOT NULL,
      error_message TEXT NOT NULL,
      reprocessed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe additive columns on existing tables
  addColumnIfMissing('shifts', 'break_minutes', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('shifts', 'working_days', "TEXT NOT NULL DEFAULT 'Seg,Ter,Qua,Qui,Sex'");

  addColumnIfMissing('production_records', 'machine_id', 'TEXT REFERENCES machines(id) ON DELETE SET NULL');
  addColumnIfMissing('production_records', 'stage_id', 'TEXT REFERENCES production_stages(id) ON DELETE SET NULL');
  addColumnIfMissing('production_records', 'production_order_id', 'TEXT REFERENCES production_orders(id) ON DELETE SET NULL');
  addColumnIfMissing('production_records', 'start_time', 'TEXT');
  addColumnIfMissing('production_records', 'end_time', 'TEXT');
  addColumnIfMissing('production_records', 'planned_time_minutes', 'INTEGER');
  addColumnIfMissing('production_records', 'source_origin', "TEXT NOT NULL DEFAULT 'manual'");

  addColumnIfMissing('downtime_records', 'machine_id', 'TEXT REFERENCES machines(id) ON DELETE SET NULL');
  addColumnIfMissing('downtime_records', 'sector_id', 'TEXT REFERENCES sectors(id) ON DELETE SET NULL');
  addColumnIfMissing('downtime_records', 'line_id', 'TEXT REFERENCES production_lines(id) ON DELETE SET NULL');
  addColumnIfMissing('downtime_records', 'shift_id', 'TEXT REFERENCES shifts(id) ON DELETE SET NULL');
  addColumnIfMissing('downtime_records', 'reason_id', 'TEXT REFERENCES downtime_reasons(id) ON DELETE SET NULL');
  addColumnIfMissing('downtime_records', 'category', 'TEXT');
  addColumnIfMissing('downtime_records', 'is_planned', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('downtime_records', 'counts_for_availability', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('downtime_records', 'start_at', 'TEXT');
  addColumnIfMissing('downtime_records', 'end_at', 'TEXT');
  addColumnIfMissing('downtime_records', 'status', "TEXT NOT NULL DEFAULT 'closed'");
  addColumnIfMissing('downtime_records', 'recorded_by', 'TEXT REFERENCES profiles(id) ON DELETE SET NULL');

  // Ensure downtime_records.production_record_id is nullable for standalone machine stops
  const dtCols = db.prepare('PRAGMA table_info(downtime_records)').all() as Array<{ name: string; notnull: number }>;
  const prodIdCol = dtCols.find((c) => c.name === 'production_record_id');
  if (prodIdCol && prodIdCol.notnull === 1) {
    db.pragma('foreign_keys = OFF');
    const migrateDt = db.transaction(() => {
      db.exec(`
        CREATE TABLE downtime_records_v2 (
          id TEXT PRIMARY KEY,
          production_record_id TEXT REFERENCES production_records(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL DEFAULT 0,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          machine_id TEXT REFERENCES machines(id) ON DELETE SET NULL,
          sector_id TEXT REFERENCES sectors(id) ON DELETE SET NULL,
          line_id TEXT REFERENCES production_lines(id) ON DELETE SET NULL,
          shift_id TEXT REFERENCES shifts(id) ON DELETE SET NULL,
          reason_id TEXT REFERENCES downtime_reasons(id) ON DELETE SET NULL,
          category TEXT,
          is_planned INTEGER NOT NULL DEFAULT 0,
          counts_for_availability INTEGER NOT NULL DEFAULT 1,
          start_at TEXT,
          end_at TEXT,
          status TEXT NOT NULL DEFAULT 'closed',
          recorded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL
        );
        INSERT INTO downtime_records_v2 (
          id, production_record_id, reason, duration_minutes, description, created_at,
          machine_id, sector_id, line_id, shift_id, reason_id, category, is_planned,
          counts_for_availability, start_at, end_at, status, recorded_by
        )
        SELECT
          id, production_record_id, reason, duration_minutes, description, created_at,
          machine_id, sector_id, line_id, shift_id, reason_id, category, is_planned,
          counts_for_availability, start_at, end_at, status, recorded_by
        FROM downtime_records;
        DROP TABLE downtime_records;
        ALTER TABLE downtime_records_v2 RENAME TO downtime_records;
      `);
    });
    migrateDt();
    db.pragma('foreign_keys = ON');
  }

  addColumnIfMissing('import_batches', 'entity_type', "TEXT NOT NULL DEFAULT 'production'");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prod_records_date ON production_records(production_date);
    CREATE INDEX IF NOT EXISTS idx_prod_records_operator ON production_records(operator_id);
    CREATE INDEX IF NOT EXISTS idx_prod_records_sector ON production_records(sector_id);
    CREATE INDEX IF NOT EXISTS idx_prod_records_line ON production_records(line_id);
    CREATE INDEX IF NOT EXISTS idx_prod_records_product ON production_records(product_id);
    CREATE INDEX IF NOT EXISTS idx_prod_records_machine ON production_records(machine_id);
    CREATE INDEX IF NOT EXISTS idx_machines_sector_line ON machines(sector_id, line_id);
    CREATE INDEX IF NOT EXISTS idx_cycle_standards_lookup ON cycle_time_standards(product_id, machine_id, is_current);
    CREATE INDEX IF NOT EXISTS idx_loss_records_date ON loss_records(loss_date);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

    INSERT OR IGNORE INTO schema_migrations (version) VALUES ('001_initial_forteflex');
    INSERT OR IGNORE INTO schema_migrations (version) VALUES ('002_irog_forteflex');
  `);
}

function seedInitialCatalogAndUsers(): void {
  const sectors = [
    { id: 'sec-ext', code: 'EXT', name: 'Extrusão', description: 'Extrusão de filmes técnicos e tubulares' },
    { id: 'sec-cs', code: 'CS', name: 'Corte e Solda', description: 'Conversão, corte e soldagem industrial' },
    { id: 'sec-imp', code: 'IMP', name: 'Impressão Flexográfica', description: 'Impressão rotativa de alta definição' },
    { id: 'sec-emb', code: 'EMB', name: 'Acabamento e Embalagem', description: 'Revisão final, paletização e expedição' },
  ];

  const insertSector = db.prepare(
    'INSERT INTO sectors (id, code, name, description, active) VALUES (?, ?, ?, ?, 1)'
  );
  for (const s of sectors) {
    insertSector.run(s.id, s.code, s.name, s.description);
  }

  const lines = [
    { id: 'lin-ext-01', sector_id: 'sec-ext', code: 'EXT-01', name: 'Extrusora Balão 01', capacity_per_hour: 220 },
    { id: 'lin-ext-02', sector_id: 'sec-ext', code: 'EXT-02', name: 'Extrusora Coextrusada 02', capacity_per_hour: 310 },
    { id: 'lin-cs-01', sector_id: 'sec-cs', code: 'CS-01', name: 'Corte e Solda Automática 01', capacity_per_hour: 180 },
    { id: 'lin-cs-02', sector_id: 'sec-cs', code: 'CS-02', name: 'Corte Lateral Alta Velocidade 02', capacity_per_hour: 210 },
    { id: 'lin-imp-01', sector_id: 'sec-imp', code: 'IMP-01', name: 'Impressora Flexo 8 Cores', capacity_per_hour: 260 },
    { id: 'lin-emb-01', sector_id: 'sec-emb', code: 'EMB-01', name: 'Linha de Rebobinamento e Paletização', capacity_per_hour: 350 },
  ];

  const insertLine = db.prepare(
    'INSERT INTO production_lines (id, sector_id, code, name, capacity_per_hour, active) VALUES (?, ?, ?, ?, ?, 1)'
  );
  for (const l of lines) {
    insertLine.run(l.id, l.sector_id, l.code, l.name, l.capacity_per_hour);
  }

  const products = [
    { id: 'prod-01', sku: 'FF-PEBD-040', name: 'Filme Técnico PEBD 40µm', category: 'Filmes Técnicos', unit_of_measure: 'kg', target_cycle_minutes: 0.27 },
    { id: 'prod-02', sku: 'FF-BOPP-025', name: 'Bobina Laminada BOPP', category: 'Laminados', unit_of_measure: 'kg', target_cycle_minutes: 0.25 },
    { id: 'prod-03', sku: 'FF-SAC-025', name: 'Saco Industrial Valvulado 25kg', category: 'Sacos Industriais', unit_of_measure: 'un', target_cycle_minutes: 0.30 },
    { id: 'prod-04', sku: 'FF-SHR-060', name: 'Filme Termoencolhível Shrink 60µm', category: 'Termoencolhíveis', unit_of_measure: 'kg', target_cycle_minutes: 0.20 },
    { id: 'prod-05', sku: 'FF-BOB-IMP', name: 'Bobina Impressa Personalizada', category: 'Impressos', unit_of_measure: 'kg', target_cycle_minutes: 0.23 },
  ];

  const insertProduct = db.prepare(
    'INSERT INTO products (id, sku, name, category, unit_of_measure, target_cycle_minutes, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  );
  for (const p of products) {
    insertProduct.run(p.id, p.sku, p.name, p.category, p.unit_of_measure, p.target_cycle_minutes);
  }

  const shifts = [
    { id: 'shf-01', code: 'T1', name: '1º Turno (Manhã)', start_time: '06:00', end_time: '14:00', break_minutes: 30 },
    { id: 'shf-02', code: 'T2', name: '2º Turno (Tarde)', start_time: '14:00', end_time: '22:00', break_minutes: 30 },
    { id: 'shf-03', code: 'T3', name: '3º Turno (Noite)', start_time: '22:00', end_time: '06:00', break_minutes: 30 },
  ];

  const insertShift = db.prepare(
    'INSERT INTO shifts (id, code, name, start_time, end_time, break_minutes, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  );
  for (const s of shifts) {
    insertShift.run(s.id, s.code, s.name, s.start_time, s.end_time, s.break_minutes);
  }

  const adminPermissions = JSON.stringify({
    can_create_records: true,
    can_edit_own_records: true,
    can_view_own_records: true,
    can_view_sector_records: true,
    can_export_own_records: true,
    can_register_downtime: true,
    can_register_losses: true,
    can_view_irog_dashboards: true,
  });

  const operatorPermissions = JSON.stringify({
    can_create_records: true,
    can_edit_own_records: true,
    can_view_own_records: true,
    can_view_sector_records: false,
    can_export_own_records: false,
    can_register_downtime: true,
    can_register_losses: true,
    can_view_irog_dashboards: false,
  });

  const adminHash = bcrypt.hashSync('Forte@2026', 10);
  const operatorHash = bcrypt.hashSync('Prod@2026', 10);

  const insertUser = db.prepare(`
    INSERT INTO profiles (id, username, email, password_hash, full_name, role, sector_id, allowed_sector_ids, is_active, permissions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  insertUser.run('usr-admin-01', 'admin', 'admin@forteflex.com.br', adminHash, 'Ricardo Almeida (Gestão Industrial)', 'admin', null, '[]', adminPermissions);
  insertUser.run('usr-op-01', 'carlos.silva', 'carlos.silva@forteflex.com.br', operatorHash, 'Carlos Eduardo Silva', 'operator', 'sec-ext', '["sec-ext"]', operatorPermissions);
  insertUser.run('usr-op-02', 'mariana.costa', 'mariana.costa@forteflex.com.br', operatorHash, 'Mariana Ferreira Costa', 'operator', 'sec-cs', '["sec-cs"]', operatorPermissions);
  insertUser.run('usr-op-03', 'joao.santos', 'joao.santos@forteflex.com.br', operatorHash, 'João Pedro Santos', 'operator', 'sec-imp', '["sec-imp"]', operatorPermissions);

  const insertGoal = db.prepare(`
    INSERT INTO production_goals (id, sector_id, line_id, product_id, shift_id, period_type, target_quantity, max_loss_percent, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  insertGoal.run('goal-01', 'sec-ext', 'lin-ext-01', 'prod-01', 'shf-01', 'daily', 1600, 2.5);
  insertGoal.run('goal-02', 'sec-ext', 'lin-ext-02', 'prod-04', 'shf-02', 'daily', 2100, 2.8);
  insertGoal.run('goal-03', 'sec-cs', 'lin-cs-01', 'prod-03', 'shf-01', 'daily', 1400, 2.0);
  insertGoal.run('goal-04', 'sec-imp', 'lin-imp-01', 'prod-05', 'shf-02', 'daily', 1900, 3.0);
}

function seedIrogCatalogIfEmpty(): void {
  // Seed machines if empty
  const macCount = db.prepare('SELECT COUNT(*) as c FROM machines').get() as { c: number };
  if (macCount.c === 0) {
    const machines = [
      { id: 'mac-ext-01', sector_id: 'sec-ext', line_id: 'lin-ext-01', code: 'MQ-EXT-01', name: 'Extrusora Balão Matriz A', type: 'Extrusora', cap: 220, unit: 'kg', status: 'operating' },
      { id: 'mac-ext-02', sector_id: 'sec-ext', line_id: 'lin-ext-02', code: 'MQ-EXT-02', name: 'Extrusora Coextrusada 3 Camadas', type: 'Extrusora', cap: 310, unit: 'kg', status: 'operating' },
      { id: 'mac-cs-01', sector_id: 'sec-cs', line_id: 'lin-cs-01', code: 'MQ-CS-01', name: 'Máquina Corte e Solda Fundo 01', type: 'Corte e Solda', cap: 200, unit: 'un', status: 'operating' },
      { id: 'mac-cs-02', sector_id: 'sec-cs', line_id: 'lin-cs-02', code: 'MQ-CS-02', name: 'Máquina Corte Lateral Servo 02', type: 'Corte e Solda', cap: 210, unit: 'un', status: 'idle' },
      { id: 'mac-imp-01', sector_id: 'sec-imp', line_id: 'lin-imp-01', code: 'MQ-IMP-01', name: 'Impressora Flexográfica 8 Cores', type: 'Impressora', cap: 260, unit: 'kg', status: 'operating' },
      { id: 'mac-emb-01', sector_id: 'sec-emb', line_id: 'lin-emb-01', code: 'MQ-EMB-01', name: 'Rebobinadeira e Paletizadora 01', type: 'Acabamento', cap: 250, unit: 'kg', status: 'operating' },
    ];
    const insertMachine = db.prepare(`
      INSERT OR IGNORE INTO machines (id, sector_id, line_id, code, name, resource_type, theoretical_capacity_per_hour, capacity_unit, status, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const m of machines) {
      insertMachine.run(m.id, m.sector_id, m.line_id, m.code, m.name, m.type, m.cap, m.unit, m.status);
    }
  }

  // Seed production stages
  const stageCount = db.prepare('SELECT COUNT(*) as c FROM production_stages').get() as { c: number };
  if (stageCount.c === 0) {
    const stages = [
      { id: 'stg-ext', sector_id: 'sec-ext', code: 'OP-EXT', name: 'Extrusão de Filme', desc: 'Formação e resfriamento de bobina mãe' },
      { id: 'stg-imp', sector_id: 'sec-imp', code: 'OP-IMP', name: 'Impressão Flexográfica', desc: 'Aplicação de tintas e secagem' },
      { id: 'stg-cs', sector_id: 'sec-cs', code: 'OP-CS', name: 'Corte e Soldagem', desc: 'Conversão em sacos ou formatos finais' },
      { id: 'stg-emb', sector_id: 'sec-emb', code: 'OP-EMB', name: 'Rebobinamento e Paletização', desc: 'Inspeção final e embalagem' },
    ];
    const ins = db.prepare('INSERT OR IGNORE INTO production_stages (id, sector_id, code, name, description, active) VALUES (?, ?, ?, ?, ?, 1)');
    for (const st of stages) ins.run(st.id, st.sector_id, st.code, st.name, st.desc);
  }

  // Seed cycle time standards matching machine/product combinations
  const cycleCount = db.prepare('SELECT COUNT(*) as c FROM cycle_time_standards').get() as { c: number };
  if (cycleCount.c === 0) {
    const standards = [
      { id: 'cyc-01', product_id: 'prod-01', stage_id: 'stg-ext', machine_id: 'mac-ext-01', cap: 220 },
      { id: 'cyc-02', product_id: 'prod-04', stage_id: 'stg-ext', machine_id: 'mac-ext-02', cap: 300 },
      { id: 'cyc-03', product_id: 'prod-03', stage_id: 'stg-cs', machine_id: 'mac-cs-01', cap: 200 },
      { id: 'cyc-04', product_id: 'prod-05', stage_id: 'stg-imp', machine_id: 'mac-imp-01', cap: 260 },
      { id: 'cyc-05', product_id: 'prod-02', stage_id: 'stg-emb', machine_id: 'mac-emb-01', cap: 250 },
    ];
    const ins = db.prepare(`
      INSERT OR IGNORE INTO cycle_time_standards (id, product_id, stage_id, machine_id, cycle_time_minutes, theoretical_capacity_per_hour, is_current)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    for (const c of standards) {
      ins.run(c.id, c.product_id, c.stage_id, c.machine_id, Number((60 / c.cap).toFixed(6)), c.cap);
    }
  }

  // Seed production orders
  const opCount = db.prepare('SELECT COUNT(*) as c FROM production_orders').get() as { c: number };
  if (opCount.c === 0) {
    const orders = [
      { id: 'po-01', num: 'OP-2026-1041', prod: 'prod-01', sec: 'sec-ext', lin: 'lin-ext-01', mac: 'mac-ext-01', qty: 8000, status: 'in_progress' },
      { id: 'po-02', num: 'OP-2026-1042', prod: 'prod-04', sec: 'sec-ext', lin: 'lin-ext-02', mac: 'mac-ext-02', qty: 10500, status: 'in_progress' },
      { id: 'po-03', num: 'OP-2026-1043', prod: 'prod-03', sec: 'sec-cs', lin: 'lin-cs-01', mac: 'mac-cs-01', qty: 7000, status: 'in_progress' },
      { id: 'po-04', num: 'OP-2026-1044', prod: 'prod-05', sec: 'sec-imp', lin: 'lin-imp-01', mac: 'mac-imp-01', qty: 9500, status: 'open' },
      { id: 'po-05', num: 'OP-2026-1045', prod: 'prod-02', sec: 'sec-emb', lin: 'lin-emb-01', mac: 'mac-emb-01', qty: 9000, status: 'open' },
    ];
    const ins = db.prepare(`
      INSERT OR IGNORE INTO production_orders (id, order_number, product_id, sector_id, line_id, machine_id, planned_quantity, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const o of orders) ins.run(o.id, o.num, o.prod, o.sec, o.lin, o.mac, o.qty, o.status);
  }

  // Seed configurable downtime reasons
  const drCount = db.prepare('SELECT COUNT(*) as c FROM downtime_reasons').get() as { c: number };
  if (drCount.c === 0) {
    const reasons = [
      { id: 'dr-01', code: 'PAR-MC', name: 'Manutenção corretiva', cat: 'Manutenção corretiva', planned: 0, avail: 1 },
      { id: 'dr-02', code: 'PAR-MP', name: 'Manutenção preventiva programada', cat: 'Manutenção preventiva', planned: 1, avail: 0 },
      { id: 'dr-03', code: 'PAR-FM', name: 'Falta de matéria-prima / bobina', cat: 'Falta de material', planned: 0, avail: 1 },
      { id: 'dr-04', code: 'PAR-FO', name: 'Falta de operador', cat: 'Falta de operador', planned: 0, avail: 1 },
      { id: 'dr-05', code: 'PAR-SU', name: 'Setup / troca de clichê ou ferramenta', cat: 'Setup', planned: 0, avail: 1 },
      { id: 'dr-06', code: 'PAR-RG', name: 'Regulagem / troca de tela ou faca', cat: 'Regulagem', planned: 0, avail: 1 },
      { id: 'dr-07', code: 'PAR-EL', name: 'Falha elétrica', cat: 'Falha elétrica', planned: 0, avail: 1 },
      { id: 'dr-08', code: 'PAR-ME', name: 'Falha mecânica', cat: 'Falha mecânica', planned: 0, avail: 1 },
      { id: 'dr-09', code: 'PAR-QL', name: 'Problema de qualidade', cat: 'Problema de qualidade', planned: 0, avail: 1 },
      { id: 'dr-10', code: 'PAR-AP', name: 'Aguardando programação', cat: 'Aguardando programação', planned: 0, avail: 1 },
      { id: 'dr-11', code: 'PAR-OU', name: 'Outros motivos operacionais', cat: 'Outros', planned: 0, avail: 1 },
    ];
    const ins = db.prepare(`
      INSERT OR IGNORE INTO downtime_reasons (id, code, name, category, is_planned, counts_for_availability, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    for (const r of reasons) ins.run(r.id, r.code, r.name, r.cat, r.planned, r.avail);
  }

  // Seed configurable loss reasons
  const lrCount = db.prepare('SELECT COUNT(*) as c FROM loss_reasons').get() as { c: number };
  if (lrCount.c === 0) {
    const reasons = [
      { id: 'lr-01', code: 'PER-REF', name: 'Apara / refugo de borda e corte', cat: 'Refugo' },
      { id: 'lr-02', code: 'PER-RET', name: 'Bobina ou lote para retrabalho', cat: 'Retrabalho' },
      { id: 'lr-03', code: 'PER-MP', name: 'Perda de resina ou matéria-prima', cat: 'Matéria-prima' },
      { id: 'lr-04', code: 'PER-SU', name: 'Perda em partida / setup de máquina', cat: 'Setup' },
      { id: 'lr-05', code: 'PER-OP', name: 'Erro operacional ou tensão de bobina', cat: 'Operacional' },
      { id: 'lr-06', code: 'PER-QL', name: 'Não conformidade dimensional / solda', cat: 'Qualidade' },
    ];
    const ins = db.prepare('INSERT OR IGNORE INTO loss_reasons (id, code, name, category, active) VALUES (?, ?, ?, ?, 1)');
    for (const r of reasons) ins.run(r.id, r.code, r.name, r.cat);
  }

  // Seed default IROG goals (configurable by Admin)
  const igCount = db.prepare('SELECT COUNT(*) as c FROM irog_goals').get() as { c: number };
  if (igCount.c === 0) {
    const ins = db.prepare(`
      INSERT INTO irog_goals (id, scope_level, sector_id, line_id, machine_id, target_irog_percent, target_availability_percent, target_performance_percent, target_quality_percent, max_loss_percent, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    ins.run('ig-factory', 'factory', null, null, null, 82.0, 90.0, 93.0, 98.0, 3.0);
    ins.run('ig-sec-ext', 'sector', 'sec-ext', null, null, 84.0, 91.0, 94.0, 98.0, 2.8);
    ins.run('ig-sec-cs', 'sector', 'sec-cs', null, null, 80.0, 89.0, 92.0, 97.5, 3.2);
    ins.run('ig-sec-imp', 'sector', 'sec-imp', null, null, 81.0, 90.0, 92.0, 98.0, 3.0);
    ins.run('ig-sec-emb', 'sector', 'sec-emb', null, null, 85.0, 92.0, 94.0, 98.5, 2.0);
  }

  // Seed configurable alerts rules
  const alCount = db.prepare('SELECT COUNT(*) as c FROM irog_alerts_config').get() as { c: number };
  if (alCount.c === 0) {
    const ins = db.prepare('INSERT INTO irog_alerts_config (id, alert_type, name, threshold_value, comparison, recipients, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)');
    ins.run('al-01', 'machine_irog_below_goal', 'Máquina com IROG abaixo de 78%', 78, 'lt', 'Diretoria e Gestor Industrial');
    ins.run('al-02', 'sector_irog_below_goal', 'Setor com IROG abaixo de 80%', 80, 'lt', 'Gerência de Produção');
    ins.run('al-03', 'downtime_above_limit', 'Parada acumulada acima de 60 min', 60, 'gt', 'Manutenção e Liderança');
    ins.run('al-04', 'loss_above_limit', 'Percentual de perdas acima de 3,5%', 3.5, 'gt', 'Controle de Qualidade');
  }

  // Seed integration_settings (Projedata Iniflex - read-only & not configured)
  db.prepare(`
    INSERT OR IGNORE INTO integration_settings (id, provider, status, api_base_url, docs_url, read_only, enabled_interfaces)
    VALUES ('int-projedata', 'projedata_iniflex', 'not_configured', NULL, 'https://projedata-api.apidog.io/', 1, '["EXP_AP_PRODUCAO_V1","EXP_AP_PERDA_V1","EXP_AP_PARADA_V1"]')
  `).run();

  // Seed additional role showcase accounts (Diretoria, Gestor, Líder) if missing
  const dirExists = db.prepare("SELECT id FROM profiles WHERE username = 'diretoria'").get();
  if (!dirExists) {
    const dirHash = bcrypt.hashSync('Dir@2026', 10);
    const mgrHash = bcrypt.hashSync('Gestor@2026', 10);
    const ldrHash = bcrypt.hashSync('Lider@2026', 10);

    const insUser = db.prepare(`
      INSERT OR IGNORE INTO profiles (id, username, email, password_hash, full_name, role, sector_id, allowed_sector_ids, is_active, permissions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    insUser.run(
      'usr-dir-01',
      'diretoria',
      'diretoria@forteflex.com.br',
      dirHash,
      'Paulo Henrique (Diretoria)',
      'director',
      null,
      '[]',
      JSON.stringify({
        can_create_records: false,
        can_edit_own_records: false,
        can_view_own_records: true,
        can_view_sector_records: true,
        can_export_own_records: true,
        can_view_irog_dashboards: true,
      })
    );

    insUser.run(
      'usr-mgr-01',
      'gestor.extrusao',
      'gestor.extrusao@forteflex.com.br',
      mgrHash,
      'Fernanda Oliveira (Gestora Extrusão)',
      'manager',
      'sec-ext',
      '["sec-ext","sec-imp"]',
      JSON.stringify({
        can_create_records: false,
        can_edit_own_records: false,
        can_view_own_records: true,
        can_view_sector_records: true,
        can_export_own_records: true,
        can_view_irog_dashboards: true,
      })
    );

    insUser.run(
      'usr-ldr-01',
      'lider.cs',
      'lider.cs@forteflex.com.br',
      ldrHash,
      'Marcos Vinícius (Líder Corte e Solda)',
      'leader',
      'sec-cs',
      '["sec-cs"]',
      JSON.stringify({
        can_create_records: true,
        can_edit_own_records: true,
        can_view_own_records: true,
        can_view_sector_records: true,
        can_export_own_records: true,
        can_register_downtime: true,
        can_register_losses: true,
        can_view_irog_dashboards: true,
      })
    );
  }

  // Link legacy demo records without machine_id/planned_time_minutes so IROG works seamlessly on existing demo dataset
  const lineToMachine: Record<string, string> = {
    'lin-ext-01': 'mac-ext-01',
    'lin-ext-02': 'mac-ext-02',
    'lin-cs-01': 'mac-cs-01',
    'lin-cs-02': 'mac-cs-02',
    'lin-imp-01': 'mac-imp-01',
    'lin-emb-01': 'mac-emb-01',
  };
  for (const [linId, macId] of Object.entries(lineToMachine)) {
    db.prepare(
      `UPDATE production_records
       SET machine_id = ?, planned_time_minutes = COALESCE(planned_time_minutes, 480)
       WHERE line_id = ? AND machine_id IS NULL`
    ).run(macId, linId);
  }
  db.prepare(
    `UPDATE downtime_records
     SET machine_id = (SELECT pr.machine_id FROM production_records pr WHERE pr.id = downtime_records.production_record_id),
         sector_id = (SELECT pr.sector_id FROM production_records pr WHERE pr.id = downtime_records.production_record_id),
         line_id = (SELECT pr.line_id FROM production_records pr WHERE pr.id = downtime_records.production_record_id),
         shift_id = (SELECT pr.shift_id FROM production_records pr WHERE pr.id = downtime_records.production_record_id),
         counts_for_availability = 1
     WHERE machine_id IS NULL AND production_record_id IS NOT NULL`
  ).run();
}

export function seedDemoProductionData(): number {
  const existingDemo = db.prepare('SELECT COUNT(*) as c FROM production_records WHERE is_demo = 1').get() as { c: number };
  if (existingDemo.c > 0) {
    return existingDemo.c;
  }

  const today = new Date();
  const formatDate = (daysAgo: number): string => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  const templates = [
    {
      operator: 'usr-op-01',
      sector: 'sec-ext',
      line: 'lin-ext-01',
      machine: 'mac-ext-01',
      stage: 'stg-ext',
      order: 'po-01',
      product: 'prod-01',
      uom: 'kg',
      shift: 'shf-01',
      planned: 1650,
      produced: 1520,
      loss: 32,
      downtime: 25,
      reason: 'Troca de tela / filtro',
      category: 'Regulagem',
      desc: 'Troca de tela no cabeçote de extrusão.',
      lossCat: 'Setup',
      lossReason: 'Perda em partida / setup de máquina',
    },
    {
      operator: 'usr-op-01',
      sector: 'sec-ext',
      line: 'lin-ext-02',
      machine: 'mac-ext-02',
      stage: 'stg-ext',
      order: 'po-02',
      product: 'prod-04',
      uom: 'kg',
      shift: 'shf-02',
      planned: 2250,
      produced: 2140,
      loss: 42,
      downtime: 0,
      reason: '',
      category: '',
      desc: '',
      lossCat: 'Refugo',
      lossReason: 'Apara / refugo de borda e corte',
    },
    {
      operator: 'usr-op-02',
      sector: 'sec-cs',
      line: 'lin-cs-01',
      machine: 'mac-cs-01',
      stage: 'stg-cs',
      order: 'po-03',
      product: 'prod-03',
      uom: 'un',
      shift: 'shf-01',
      planned: 1500,
      produced: 1320,
      loss: 45,
      downtime: 40,
      reason: 'Ajuste mecânico / faca',
      category: 'Falha mecânica',
      desc: 'Recalibração de resistência de solda e faca transversal.',
      lossCat: 'Qualidade',
      lossReason: 'Não conformidade dimensional / solda',
    },
    {
      operator: 'usr-op-03',
      sector: 'sec-imp',
      line: 'lin-imp-01',
      machine: 'mac-imp-01',
      stage: 'stg-imp',
      order: 'po-04',
      product: 'prod-05',
      uom: 'kg',
      shift: 'shf-02',
      planned: 1950,
      produced: 1850,
      loss: 55,
      downtime: 30,
      reason: 'Setup / troca de clichê',
      category: 'Setup',
      desc: 'Acerto de registro de cores e limpeza de anilox.',
      lossCat: 'Operacional',
      lossReason: 'Erro operacional ou tensão de bobina',
    },
    {
      operator: 'usr-op-02',
      sector: 'sec-emb',
      line: 'lin-emb-01',
      machine: 'mac-emb-01',
      stage: 'stg-emb',
      order: 'po-05',
      product: 'prod-02',
      uom: 'kg',
      shift: 'shf-03',
      planned: 1875,
      produced: 1790,
      loss: 22,
      downtime: 15,
      reason: 'Falta de matéria-prima / bobina',
      category: 'Falta de material',
      desc: 'Aguardando movimentação de empilhadeira.',
      lossCat: 'Matéria-prima',
      lossReason: 'Perda de resina ou matéria-prima',
    },
  ];

  const insertRecord = db.prepare(`
    INSERT INTO production_records (
      id, production_date, shift_id, operator_id, sector_id, line_id, machine_id, stage_id, production_order_id, product_id,
      planned_quantity, produced_quantity, approved_quantity, loss_quantity, unit_of_measure,
      start_time, end_time, planned_time_minutes,
      has_downtime, total_downtime_minutes, notes, additional_notes, is_demo, source_origin, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'demo', ?, ?, ?)
  `);

  const insertDowntime = db.prepare(`
    INSERT INTO downtime_records (id, production_record_id, machine_id, sector_id, line_id, shift_id, reason, category, is_planned, counts_for_availability, duration_minutes, description, status, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 'closed', ?)
  `);

  const insertLoss = db.prepare(`
    INSERT INTO loss_records (id, production_record_id, loss_date, shift_id, sector_id, line_id, machine_id, product_id, production_order_id, category, reason_name, quantity, unit_of_measure, notes, is_demo, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  let created = 0;
  const tx = db.transaction(() => {
    for (let day = 0; day < 14; day++) {
      const dateStr = formatDate(day);
      const dayRecords = day === 0 ? templates.slice(0, 3) : templates;
      for (let i = 0; i < dayRecords.length; i++) {
        const t = dayRecords[i];
        const variance = ((day * 7 + i * 13) % 120) - 55;
        const produced = Math.max(200, t.produced + variance);
        const loss = Math.max(8, t.loss + ((day + i) % 15) - 5);
        const approved = Math.max(0, produced - loss);
        const hasDowntime = t.downtime > 0 && ((day + i) % 2 === 0 || day === 0);
        const downtimeMinutes = hasDowntime ? t.downtime + ((day * 3) % 15) : 0;
        const recId = `demo-${day}-${i}-${crypto.randomUUID().slice(0, 8)}`;
        const timestamp = `${dateStr}T${t.shift === 'shf-01' ? '13:45:00' : t.shift === 'shf-02' ? '21:50:00' : '05:45:00'}.000Z`;
        const startTime = t.shift === 'shf-01' ? '06:00' : t.shift === 'shf-02' ? '14:00' : '22:00';
        const endTime = t.shift === 'shf-01' ? '13:30' : t.shift === 'shf-02' ? '21:30' : '05:30';

        insertRecord.run(
          recId,
          dateStr,
          t.shift,
          t.operator,
          t.sector,
          t.line,
          t.machine,
          t.stage,
          t.order,
          t.product,
          t.planned,
          produced,
          approved,
          loss,
          t.uom,
          startTime,
          endTime,
          450,
          hasDowntime ? 1 : 0,
          downtimeMinutes,
          'Registro demonstrativo inicial para validação de indicadores IROG.',
          'Pode ser removido a qualquer momento em Configurações Gerais.',
          t.operator,
          timestamp,
          timestamp
        );

        if (hasDowntime) {
          insertDowntime.run(
            `dt-${recId}`,
            recId,
            t.machine,
            t.sector,
            t.line,
            t.shift,
            t.reason || 'Ajuste operacional',
            t.category || 'Outros',
            downtimeMinutes,
            t.desc || 'Parada registrada no apontamento demonstrativo.',
            t.operator
          );
        }

        insertLoss.run(
          `ls-${recId}`,
          recId,
          dateStr,
          t.shift,
          t.sector,
          t.line,
          t.machine,
          t.product,
          t.order,
          t.lossCat,
          t.lossReason,
          loss,
          t.uom,
          'Perda vinculada ao apontamento demonstrativo.',
          t.operator
        );

        created++;
      }
    }
  });

  tx();
  return created;
}

export function clearDemoProductionData(): number {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM loss_records WHERE is_demo = 1').run();
    const result = db.prepare('DELETE FROM production_records WHERE is_demo = 1').run();
    return result.changes;
  });
  return tx();
}
