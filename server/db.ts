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
      role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
      sector_id TEXT REFERENCES sectors(id) ON DELETE SET NULL,
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
      production_record_id TEXT NOT NULL REFERENCES production_records(id) ON DELETE CASCADE,
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

    CREATE INDEX IF NOT EXISTS idx_prod_records_date ON production_records(production_date);
    CREATE INDEX IF NOT EXISTS idx_prod_records_operator ON production_records(operator_id);
    CREATE INDEX IF NOT EXISTS idx_prod_records_sector ON production_records(sector_id);
    CREATE INDEX IF NOT EXISTS idx_prod_records_line ON production_records(line_id);
    CREATE INDEX IF NOT EXISTS idx_prod_records_product ON production_records(product_id);
  `);

  const sectorCount = db.prepare('SELECT COUNT(*) as c FROM sectors').get() as { c: number };
  if (sectorCount.c === 0) {
    seedInitialCatalogAndUsers();
    seedDemoProductionData();
  }
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
    { id: 'prod-01', sku: 'FF-PEBD-040', name: 'Filme Técnico PEBD 40µm', category: 'Filmes Técnicos', unit_of_measure: 'kg', target_cycle_minutes: 0.45 },
    { id: 'prod-02', sku: 'FF-BOPP-025', name: 'Bobina Laminada BOPP', category: 'Laminados', unit_of_measure: 'kg', target_cycle_minutes: 0.35 },
    { id: 'prod-03', sku: 'FF-SAC-025', name: 'Saco Industrial Valvulado 25kg', category: 'Sacos Industriais', unit_of_measure: 'un', target_cycle_minutes: 0.12 },
    { id: 'prod-04', sku: 'FF-SHR-060', name: 'Filme Termoencolhível Shrink 60µm', category: 'Termoencolhíveis', unit_of_measure: 'kg', target_cycle_minutes: 0.40 },
    { id: 'prod-05', sku: 'FF-BOB-IMP', name: 'Bobina Impressa Personalizada', category: 'Impressos', unit_of_measure: 'kg', target_cycle_minutes: 0.38 },
  ];

  const insertProduct = db.prepare(
    'INSERT INTO products (id, sku, name, category, unit_of_measure, target_cycle_minutes, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  );
  for (const p of products) {
    insertProduct.run(p.id, p.sku, p.name, p.category, p.unit_of_measure, p.target_cycle_minutes);
  }

  const shifts = [
    { id: 'shf-01', code: 'T1', name: '1º Turno (Manhã)', start_time: '06:00', end_time: '14:00' },
    { id: 'shf-02', code: 'T2', name: '2º Turno (Tarde)', start_time: '14:00', end_time: '22:00' },
    { id: 'shf-03', code: 'T3', name: '3º Turno (Noite)', start_time: '22:00', end_time: '06:00' },
  ];

  const insertShift = db.prepare(
    'INSERT INTO shifts (id, code, name, start_time, end_time, active) VALUES (?, ?, ?, ?, ?, 1)'
  );
  for (const s of shifts) {
    insertShift.run(s.id, s.code, s.name, s.start_time, s.end_time);
  }

  const adminPermissions = JSON.stringify({
    can_create_records: true,
    can_edit_own_records: true,
    can_view_own_records: true,
    can_view_sector_records: true,
    can_export_own_records: true,
  });

  const operatorPermissions = JSON.stringify({
    can_create_records: true,
    can_edit_own_records: true,
    can_view_own_records: true,
    can_view_sector_records: false,
    can_export_own_records: false,
  });

  const adminHash = bcrypt.hashSync('Forte@2026', 10);
  const operatorHash = bcrypt.hashSync('Prod@2026', 10);

  const insertUser = db.prepare(`
    INSERT INTO profiles (id, username, email, password_hash, full_name, role, sector_id, is_active, permissions)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  insertUser.run('usr-admin-01', 'admin', 'admin@forteflex.com.br', adminHash, 'Ricardo Almeida (Gestão Industrial)', 'admin', null, adminPermissions);
  insertUser.run('usr-op-01', 'carlos.silva', 'carlos.silva@forteflex.com.br', operatorHash, 'Carlos Eduardo Silva', 'operator', 'sec-ext', operatorPermissions);
  insertUser.run('usr-op-02', 'mariana.costa', 'mariana.costa@forteflex.com.br', operatorHash, 'Mariana Ferreira Costa', 'operator', 'sec-cs', operatorPermissions);
  insertUser.run('usr-op-03', 'joao.santos', 'joao.santos@forteflex.com.br', operatorHash, 'João Pedro Santos', 'operator', 'sec-imp', operatorPermissions);

  const insertGoal = db.prepare(`
    INSERT INTO production_goals (id, sector_id, line_id, product_id, shift_id, period_type, target_quantity, max_loss_percent, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  insertGoal.run('goal-01', 'sec-ext', 'lin-ext-01', 'prod-01', 'shf-01', 'daily', 1600, 2.5);
  insertGoal.run('goal-02', 'sec-ext', 'lin-ext-02', 'prod-04', 'shf-02', 'daily', 2100, 2.8);
  insertGoal.run('goal-03', 'sec-cs', 'lin-cs-01', 'prod-03', 'shf-01', 'daily', 1400, 2.0);
  insertGoal.run('goal-04', 'sec-imp', 'lin-imp-01', 'prod-05', 'shf-02', 'daily', 1900, 3.0);
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
    { operator: 'usr-op-01', sector: 'sec-ext', line: 'lin-ext-01', product: 'prod-01', uom: 'kg', shift: 'shf-01', planned: 1600, produced: 1560, loss: 38, downtime: 25, reason: 'Troca de tela / filtro', desc: 'Troca programada de tela no cabeçote de extrusão.' },
    { operator: 'usr-op-01', sector: 'sec-ext', line: 'lin-ext-02', product: 'prod-04', uom: 'kg', shift: 'shf-02', planned: 2100, produced: 2140, loss: 42, downtime: 0, reason: '', desc: '' },
    { operator: 'usr-op-02', sector: 'sec-cs', line: 'lin-cs-01', product: 'prod-03', uom: 'un', shift: 'shf-01', planned: 1400, produced: 1320, loss: 45, downtime: 40, reason: 'Ajuste mecânico / faca', desc: 'Recalibração de resistência de solda e faca transversal.' },
    { operator: 'usr-op-03', sector: 'sec-imp', line: 'lin-imp-01', product: 'prod-05', uom: 'kg', shift: 'shf-02', planned: 1900, produced: 1850, loss: 55, downtime: 30, reason: 'Setup / troca de clichê', desc: 'Acerto de registro de cores e limpeza de anilox.' },
    { operator: 'usr-op-02', sector: 'sec-emb', line: 'lin-emb-01', product: 'prod-02', uom: 'kg', shift: 'shf-03', planned: 1800, produced: 1790, loss: 22, downtime: 15, reason: 'Falta de matéria-prima / bobina', desc: 'Aguardando movimentação de empilhadeira.' },
  ];

  const insertRecord = db.prepare(`
    INSERT INTO production_records (
      id, production_date, shift_id, operator_id, sector_id, line_id, product_id,
      planned_quantity, produced_quantity, approved_quantity, loss_quantity, unit_of_measure,
      has_downtime, total_downtime_minutes, notes, additional_notes, is_demo, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);

  const insertDowntime = db.prepare(`
    INSERT INTO downtime_records (id, production_record_id, reason, duration_minutes, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  let created = 0;
  const tx = db.transaction(() => {
    for (let day = 0; day < 10; day++) {
      const dateStr = formatDate(day);
      const dayRecords = day === 0 ? templates.slice(0, 3) : templates;
      for (let i = 0; i < dayRecords.length; i++) {
        const t = dayRecords[i];
        const variance = ((day * 7 + i * 13) % 140) - 60;
        const produced = Math.max(200, t.produced + variance);
        const loss = Math.max(8, t.loss + ((day + i) % 15) - 5);
        const approved = Math.max(0, produced - loss);
        const hasDowntime = t.downtime > 0 && ((day + i) % 2 === 0 || day === 0);
        const downtimeMinutes = hasDowntime ? t.downtime + ((day * 3) % 15) : 0;
        const recId = `demo-${day}-${i}-${crypto.randomUUID().slice(0, 8)}`;
        const timestamp = `${dateStr}T${t.shift === 'shf-01' ? '13:45:00' : t.shift === 'shf-02' ? '21:50:00' : '05:45:00'}.000Z`;

        insertRecord.run(
          recId,
          dateStr,
          t.shift,
          t.operator,
          t.sector,
          t.line,
          t.product,
          t.planned,
          produced,
          approved,
          loss,
          t.uom,
          hasDowntime ? 1 : 0,
          downtimeMinutes,
          'Registro demonstrativo inicial para validação de indicadores.',
          'Pode ser removido a qualquer momento em Configurações Gerais.',
          t.operator,
          timestamp,
          timestamp
        );

        if (hasDowntime) {
          insertDowntime.run(
            `dt-${recId}`,
            recId,
            t.reason || 'Ajuste operacional',
            downtimeMinutes,
            t.desc || 'Parada registrada no apontamento demonstrativo.'
          );
        }
        created++;
      }
    }
  });

  tx();
  return created;
}

export function clearDemoProductionData(): number {
  const result = db.prepare('DELETE FROM production_records WHERE is_demo = 1').run();
  return result.changes;
}
