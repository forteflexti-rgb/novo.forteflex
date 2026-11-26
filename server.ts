import express, { type Request, type Response, type NextFunction } from 'express';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  db,
  initDatabase,
  seedDemoProductionData,
  clearDemoProductionData,
  recordAuditLog,
  recordParameterHistory,
} from './server/db.ts';
import { computeFourLevelIrog, type RawIrogRecordInput } from './server/irogEngine.ts';
import type { UserRole } from './src/types/index.ts';

dotenv.config();
initDatabase();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_COOKIE_NAME = 'nf_session';

interface JwtUserPayload {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    full_name: string;
    role: UserRole;
    sector_id: string | null;
    sector_name: string | null;
    allowed_sector_ids: string[];
    allowed_line_ids: string[];
    is_active: boolean;
    permissions: {
      can_create_records: boolean;
      can_edit_own_records: boolean;
      can_view_own_records: boolean;
      can_view_sector_records: boolean;
      can_export_own_records: boolean;
      can_register_downtime: boolean;
      can_register_losses: boolean;
      can_view_irog_dashboards: boolean;
    };
  };
}

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function sanitizeUserRow(row: any) {
  let permissions = {
    can_create_records: true,
    can_edit_own_records: true,
    can_view_own_records: true,
    can_view_sector_records: false,
    can_export_own_records: false,
    can_register_downtime: true,
    can_register_losses: true,
    can_view_irog_dashboards: row.role !== 'operator',
  };
  try {
    if (typeof row.permissions === 'string') {
      permissions = { ...permissions, ...JSON.parse(row.permissions) };
    } else if (row.permissions && typeof row.permissions === 'object') {
      permissions = { ...permissions, ...row.permissions };
    }
  } catch {
    // keep defaults
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    full_name: row.full_name,
    role: row.role as UserRole,
    sector_id: row.sector_id ?? null,
    sector_name: row.sector_name ?? null,
    allowed_sector_ids: parseJsonArray(row.allowed_sector_ids),
    allowed_line_ids: parseJsonArray(row.allowed_line_ids),
    is_active: Boolean(row.is_active),
    permissions,
    created_at: row.created_at,
  };
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${12 * 3600}`,
    ...(isHttps ? ['Secure', 'SameSite=None', 'Partitioned'] : ['SameSite=Lax']),
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    ...(isHttps ? ['Secure', 'SameSite=None', 'Partitioned'] : ['SameSite=Lax']),
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = '';
  let usedCookie = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[SESSION_COOKIE_NAME]) {
      token = cookies[SESSION_COOKIE_NAME];
      usedCookie = true;
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Sessão não autenticada. Faça login para continuar.' });
    return;
  }

  // CSRF defense for cookie-authenticated state-changing requests
  if (usedCookie && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const customHdr = req.headers['x-requested-with'];
    const origin = req.headers.origin;
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString();
    const originMatchesHost = origin ? origin.includes(host) : false;
    if (customHdr !== 'XMLHttpRequest' && !originMatchesHost) {
      res.status(403).json({ error: 'Validação de origem da sessão recusada.' });
      return;
    }
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
    const row = db
      .prepare(
        `SELECT p.*, s.name as sector_name
         FROM profiles p
         LEFT JOIN sectors s ON s.id = p.sector_id
         WHERE p.id = ?`
      )
      .get(decoded.id) as any;

    if (!row) {
      res.status(401).json({ error: 'Usuário não encontrado.' });
      return;
    }
    if (!row.is_active) {
      res.status(403).json({ error: 'Seu acesso está bloqueado pelo administrador.' });
      return;
    }

    req.user = sanitizeUserRow(row);
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
  }
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito aos administradores da empresa.' });
    return;
  }
  next();
}

function requireDashboardAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }
  if (
    user.role === 'admin' ||
    user.role === 'director' ||
    user.role === 'manager' ||
    user.role === 'leader' ||
    user.permissions.can_view_irog_dashboards
  ) {
    next();
    return;
  }
  res.status(403).json({ error: 'Seu perfil não possui acesso aos painéis gerenciais.' });
}

function getUserAllowedSectorIds(user: NonNullable<AuthenticatedRequest['user']>): string[] | null {
  if (user.role === 'admin' || user.role === 'director') return null; // Unrestricted
  const set = new Set<string>(user.allowed_sector_ids || []);
  if (user.sector_id) set.add(user.sector_id);
  return Array.from(set);
}

function buildRecordFilterWhere(
  query: Record<string, any>,
  alias = 'pr',
  allowedSectorIds: string[] | null = null
) {
  const clauses: string[] = [];
  const params: any[] = [];

  if (query.startDate) {
    clauses.push(`${alias}.production_date >= ?`);
    params.push(String(query.startDate));
  }
  if (query.endDate) {
    clauses.push(`${alias}.production_date <= ?`);
    params.push(String(query.endDate));
  }
  if (query.shiftId) {
    clauses.push(`${alias}.shift_id = ?`);
    params.push(String(query.shiftId));
  }
  if (query.sectorId) {
    clauses.push(`${alias}.sector_id = ?`);
    params.push(String(query.sectorId));
  }
  if (query.lineId) {
    clauses.push(`${alias}.line_id = ?`);
    params.push(String(query.lineId));
  }
  if (query.machineId) {
    clauses.push(`${alias}.machine_id = ?`);
    params.push(String(query.machineId));
  }
  if (query.productId) {
    clauses.push(`${alias}.product_id = ?`);
    params.push(String(query.productId));
  }
  if (query.orderId) {
    clauses.push(`${alias}.production_order_id = ?`);
    params.push(String(query.orderId));
  }
  if (query.operatorId) {
    clauses.push(`${alias}.operator_id = ?`);
    params.push(String(query.operatorId));
  }
  if (query.includeDemo === 'false' || query.includeDemo === false) {
    clauses.push(`${alias}.is_demo = 0`);
  }
  if (allowedSectorIds !== null) {
    if (allowedSectorIds.length === 0) {
      clauses.push('1 = 0');
    } else {
      clauses.push(`${alias}.sector_id IN (${allowedSectorIds.map(() => '?').join(',')})`);
      params.push(...allowedSectorIds);
    }
  }

  return { clauses, params };
}

function computeDurationMinutesFromTimes(startTime?: string | null, endTime?: string | null): number | null {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return null;
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function buildIrogOverviewData(query: Record<string, any>, allowedSectorIds: string[] | null) {
  const { clauses, params } = buildRecordFilterWhere(query, 'pr', allowedSectorIds);
  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT
        pr.*,
        sh.name as shift_name,
        sh.start_time as shift_start,
        sh.end_time as shift_end,
        sh.break_minutes as shift_break,
        op.full_name as operator_name,
        sec.name as sector_name,
        ln.name as line_name,
        mac.code as machine_code,
        mac.name as machine_name,
        mac.status as machine_status,
        mac.theoretical_capacity_per_hour as machine_capacity_per_hour,
        prod.name as product_name,
        prod.sku as product_sku
       FROM production_records pr
       JOIN shifts sh ON sh.id = pr.shift_id
       JOIN profiles op ON op.id = pr.operator_id
       JOIN sectors sec ON sec.id = pr.sector_id
       JOIN production_lines ln ON ln.id = pr.line_id
       LEFT JOIN machines mac ON mac.id = pr.machine_id
       JOIN products prod ON prod.id = pr.product_id
       ${whereSql}
       ORDER BY pr.production_date ASC, pr.created_at ASC`
    )
    .all(...params) as any[];

  // Load cycle standards lookup (current)
  const cycleRows = db
    .prepare('SELECT product_id, stage_id, machine_id, cycle_time_minutes FROM cycle_time_standards WHERE is_current = 1')
    .all() as any[];

  const cycleByExact = new Map<string, number>();
  const cycleByMacProd = new Map<string, number>();
  for (const c of cycleRows) {
    if (c.stage_id) {
      cycleByExact.set(`${c.product_id}|${c.stage_id}|${c.machine_id}`, c.cycle_time_minutes);
    }
    cycleByMacProd.set(`${c.product_id}|${c.machine_id}`, c.cycle_time_minutes);
  }

  // Load downtime breakdown per production_record
  const dtRows = db
    .prepare(
      `SELECT dt.*, dr.is_planned as dr_is_planned, dr.counts_for_availability as dr_counts
       FROM downtime_records dt
       LEFT JOIN downtime_reasons dr ON dr.id = dt.reason_id`
    )
    .all() as any[];

  const dtByRecord = new Map<string, { included: number; excluded: number }>();
  for (const dt of dtRows) {
    if (!dt.production_record_id) continue;
    const entry = dtByRecord.get(dt.production_record_id) || { included: 0, excluded: 0 };
    const counts = dt.dr_counts !== null && dt.dr_counts !== undefined ? Boolean(dt.dr_counts) : Boolean(dt.counts_for_availability);
    if (counts) {
      entry.included += dt.duration_minutes || 0;
    } else {
      entry.excluded += dt.duration_minutes || 0;
    }
    dtByRecord.set(dt.production_record_id, entry);
  }

  const rawInputs: Array<RawIrogRecordInput & { unit_of_measure: string; shift_id: string; shift_name: string }> = rows.map(
    (r) => {
      let cycleMin: number | null = null;
      let cycleSource: 'cycle_standard' | 'machine_capacity' | 'missing' = 'missing';

      if (r.machine_id) {
        const exactKey = `${r.product_id}|${r.stage_id || ''}|${r.machine_id}`;
        const macProdKey = `${r.product_id}|${r.machine_id}`;
        if (r.stage_id && cycleByExact.has(exactKey)) {
          cycleMin = cycleByExact.get(exactKey)!;
          cycleSource = 'cycle_standard';
        } else if (cycleByMacProd.has(macProdKey)) {
          cycleMin = cycleByMacProd.get(macProdKey)!;
          cycleSource = 'cycle_standard';
        } else if (r.machine_capacity_per_hour && r.machine_capacity_per_hour > 0) {
          cycleMin = Number((60 / r.machine_capacity_per_hour).toFixed(6));
          cycleSource = 'machine_capacity';
        }
      }

      // Planned time: explicit record planned_time_minutes or derived from start/end times or shift window
      let plannedTimeMin: number | null =
        r.planned_time_minutes && r.planned_time_minutes > 0 ? Number(r.planned_time_minutes) : null;
      if (!plannedTimeMin && r.start_time && r.end_time) {
        plannedTimeMin = computeDurationMinutesFromTimes(r.start_time, r.end_time);
      }
      if (!plannedTimeMin && r.shift_start && r.shift_end) {
        const shiftLen = computeDurationMinutesFromTimes(r.shift_start, r.shift_end);
        if (shiftLen) {
          plannedTimeMin = Math.max(0, shiftLen - Number(r.shift_break || 0));
        }
      }

      const dtSum = dtByRecord.get(r.id);
      const includedDowntime = dtSum ? dtSum.included : r.has_downtime ? Number(r.total_downtime_minutes || 0) : 0;
      const excludedDowntime = dtSum ? dtSum.excluded : 0;

      return {
        id: r.id,
        production_date: r.production_date,
        shift_id: r.shift_id,
        shift_name: r.shift_name,
        sector_id: r.sector_id,
        sector_name: r.sector_name,
        line_id: r.line_id,
        line_name: r.line_name,
        machine_id: r.machine_id ?? null,
        machine_code: r.machine_code ?? null,
        machine_name: r.machine_name ?? null,
        machine_status: r.machine_status || 'operating',
        machine_capacity_per_hour: r.machine_capacity_per_hour ?? null,
        product_id: r.product_id,
        product_name: r.product_name,
        stage_id: r.stage_id ?? null,
        planned_quantity: r.planned_quantity,
        produced_quantity: r.produced_quantity,
        approved_quantity: r.approved_quantity,
        loss_quantity: r.loss_quantity,
        unit_of_measure: r.unit_of_measure,
        planned_time_minutes: plannedTimeMin,
        cycle_time_minutes: cycleMin,
        cycle_source: cycleSource,
        included_downtime_minutes: includedDowntime,
        excluded_downtime_minutes: excludedDowntime,
        is_complete_record: Boolean(r.machine_id && plannedTimeMin && plannedTimeMin > 0),
        incomplete_reason: !r.machine_id
          ? `Registro ${r.id} sem máquina/recurso associado`
          : !plannedTimeMin
          ? `Registro ${r.id} sem tempo planejado configurado`
          : undefined,
      };
    }
  );

  const sectorScopeSql =
    allowedSectorIds !== null
      ? allowedSectorIds.length > 0
        ? `WHERE active = 1 AND id IN (${allowedSectorIds.map(() => '?').join(',')})`
        : 'WHERE 1 = 0'
      : 'WHERE active = 1';
  const sectorScopeParams = allowedSectorIds !== null && allowedSectorIds.length > 0 ? allowedSectorIds : [];

  const sectorsCatalog = db
    .prepare(`SELECT id, code, name FROM sectors ${sectorScopeSql} ORDER BY name`)
    .all(...sectorScopeParams) as any[];

  const linesCatalog = db
    .prepare(
      `SELECT pl.id, pl.code, pl.name, pl.sector_id, s.name as sector_name
       FROM production_lines pl
       JOIN sectors s ON s.id = pl.sector_id
       WHERE pl.active = 1
       ${allowedSectorIds !== null ? (allowedSectorIds.length > 0 ? `AND pl.sector_id IN (${allowedSectorIds.map(() => '?').join(',')})` : 'AND 1 = 0') : ''}
       ORDER BY pl.code`
    )
    .all(...sectorScopeParams) as any[];

  const machinesCatalog = db
    .prepare(
      `SELECT m.id, m.code, m.name, m.sector_id, s.name as sector_name, m.line_id, pl.name as line_name, m.status, m.theoretical_capacity_per_hour
       FROM machines m
       JOIN sectors s ON s.id = m.sector_id
       LEFT JOIN production_lines pl ON pl.id = m.line_id
       WHERE m.active = 1
       ${allowedSectorIds !== null ? (allowedSectorIds.length > 0 ? `AND m.sector_id IN (${allowedSectorIds.map(() => '?').join(',')})` : 'AND 1 = 0') : ''}
       ORDER BY m.code`
    )
    .all(...sectorScopeParams) as any[];

  // IROG goals lookup
  const irogGoalRows = db.prepare('SELECT * FROM irog_goals WHERE active = 1').all() as any[];
  let factoryGoal: number | null = null;
  const sectorGoalMap = new Map<string, number>();
  const lineGoalMap = new Map<string, number>();
  const machineGoalMap = new Map<string, number>();

  for (const g of irogGoalRows) {
    if (g.scope_level === 'factory') factoryGoal = g.target_irog_percent;
    if (g.scope_level === 'sector' && g.sector_id) sectorGoalMap.set(g.sector_id, g.target_irog_percent);
    if (g.scope_level === 'line' && g.line_id) lineGoalMap.set(g.line_id, g.target_irog_percent);
    if (g.scope_level === 'machine' && g.machine_id) machineGoalMap.set(g.machine_id, g.target_irog_percent);
  }

  const fourLevel = computeFourLevelIrog({
    records: rawInputs,
    machinesCatalog,
    linesCatalog,
    sectorsCatalog,
    goalsByScope: {
      factory: factoryGoal,
      sector: sectorGoalMap,
      line: lineGoalMap,
      machine: machineGoalMap,
    },
  });

  // Machine counts
  const operating = machinesCatalog.filter((m) => m.status === 'operating').length;
  const stopped = machinesCatalog.filter((m) => m.status === 'stopped').length;
  const maintenance = machinesCatalog.filter((m) => m.status === 'maintenance').length;
  const idle = machinesCatalog.filter((m) => m.status === 'idle').length;
  const belowTarget = fourLevel.machines.filter(
    (m) => m.irogPercent !== null && m.targetIrogPercent !== null && m.irogPercent < m.targetIrogPercent
  ).length;

  // Daily, Weekly, Monthly IROG evolution
  const byDate = new Map<string, typeof rawInputs>();
  const byWeek = new Map<string, typeof rawInputs>();
  const byMonth = new Map<string, typeof rawInputs>();
  const byShift = new Map<string, typeof rawInputs>();

  for (const rec of rawInputs) {
    const listD = byDate.get(rec.production_date) || [];
    listD.push(rec);
    byDate.set(rec.production_date, listD);

    // ISO week bucket
    const dObj = new Date(`${rec.production_date}T12:00:00Z`);
    const dayNum = dObj.getUTCDay() || 7;
    const monday = new Date(dObj);
    monday.setUTCDate(dObj.getUTCDate() - dayNum + 1);
    const weekKey = `Sem ${monday.toISOString().slice(5, 10)}`;
    const listW = byWeek.get(weekKey) || [];
    listW.push(rec);
    byWeek.set(weekKey, listW);

    const monthKey = rec.production_date.slice(0, 7);
    const listM = byMonth.get(monthKey) || [];
    listM.push(rec);
    byMonth.set(monthKey, listM);

    const listS = byShift.get(rec.shift_name) || [];
    listS.push(rec);
    byShift.set(rec.shift_name, listS);
  }

  const dailyIrog = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const res = computeFourLevelIrog({
        records: list,
        machinesCatalog: [],
        linesCatalog: [],
        sectorsCatalog: [],
        goalsByScope: { factory: null, sector: new Map(), line: new Map(), machine: new Map() },
      });
      return {
        date,
        irog: res.factory.irogPercent,
        availability: res.factory.availabilityPercent,
        performance: res.factory.performancePercent,
        quality: res.factory.qualityPercent,
        planned: res.factory.plannedQuantity,
        realized: res.factory.producedQuantity,
      };
    });

  const weeklyIrog = Array.from(byWeek.entries()).map(([period, list]) => {
    const res = computeFourLevelIrog({
      records: list,
      machinesCatalog: [],
      linesCatalog: [],
      sectorsCatalog: [],
      goalsByScope: { factory: null, sector: new Map(), line: new Map(), machine: new Map() },
    });
    return {
      period,
      irog: res.factory.irogPercent,
      availability: res.factory.availabilityPercent,
      performance: res.factory.performancePercent,
      quality: res.factory.qualityPercent,
    };
  });

  const monthlyIrog = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, list]) => {
      const res = computeFourLevelIrog({
        records: list,
        machinesCatalog: [],
        linesCatalog: [],
        sectorsCatalog: [],
        goalsByScope: { factory: null, sector: new Map(), line: new Map(), machine: new Map() },
      });
      return {
        period,
        irog: res.factory.irogPercent,
        availability: res.factory.availabilityPercent,
        performance: res.factory.performancePercent,
        quality: res.factory.qualityPercent,
      };
    });

  const byShiftChart = Array.from(byShift.entries()).map(([name, list]) => {
    const res = computeFourLevelIrog({
      records: list,
      machinesCatalog: [],
      linesCatalog: [],
      sectorsCatalog: [],
      goalsByScope: { factory: null, sector: new Map(), line: new Map(), machine: new Map() },
    });
    return {
      name,
      irog: res.factory.irogPercent,
      availability: res.factory.availabilityPercent,
      performance: res.factory.performancePercent,
      quality: res.factory.qualityPercent,
      realized: res.factory.producedQuantity,
      planned: res.factory.plannedQuantity,
    };
  });

  // Downtime reasons chart (filtered by records or standalone downtimes matching sector/demo)
  const dtWhere: string[] = [];
  const dtParams: any[] = [];
  if (query.sectorId) {
    dtWhere.push('COALESCE(dt.sector_id, pr.sector_id) = ?');
    dtParams.push(String(query.sectorId));
  }
  if (query.machineId) {
    dtWhere.push('COALESCE(dt.machine_id, pr.machine_id) = ?');
    dtParams.push(String(query.machineId));
  }
  if (query.includeDemo === 'false') {
    dtWhere.push('(pr.id IS NULL OR pr.is_demo = 0)');
  }
  const dtWhereSql = dtWhere.length > 0 ? `WHERE ${dtWhere.join(' AND ')}` : '';
  const downtimeByReason = db
    .prepare(
      `SELECT dt.reason, COALESCE(dt.category, 'Operacional') as category, SUM(dt.duration_minutes) as minutes, COUNT(*) as occurrences
       FROM downtime_records dt
       LEFT JOIN production_records pr ON pr.id = dt.production_record_id
       ${dtWhereSql}
       GROUP BY dt.reason, category
       ORDER BY minutes DESC`
    )
    .all(...dtParams) as any[];

  // Loss reasons chart
  const lsWhere: string[] = [];
  const lsParams: any[] = [];
  if (query.startDate) {
    lsWhere.push('lr.loss_date >= ?');
    lsParams.push(String(query.startDate));
  }
  if (query.endDate) {
    lsWhere.push('lr.loss_date <= ?');
    lsParams.push(String(query.endDate));
  }
  if (query.sectorId) {
    lsWhere.push('lr.sector_id = ?');
    lsParams.push(String(query.sectorId));
  }
  if (query.machineId) {
    lsWhere.push('lr.machine_id = ?');
    lsParams.push(String(query.machineId));
  }
  if (query.includeDemo === 'false') {
    lsWhere.push('lr.is_demo = 0');
  }
  const lsWhereSql = lsWhere.length > 0 ? `WHERE ${lsWhere.join(' AND ')}` : '';
  const lossByReason = db
    .prepare(
      `SELECT lr.reason_name as reason, lr.category, SUM(lr.quantity) as quantity
       FROM loss_records lr
       ${lsWhereSql}
       GROUP BY lr.reason_name, lr.category
       ORDER BY quantity DESC`
    )
    .all(...lsParams) as any[];

  // Machine/Factory Timeline Events
  const timelineEvents: Array<{
    id: string;
    timestamp: string;
    machineId: string | null;
    machineName: string;
    eventType: 'start' | 'downtime' | 'resume' | 'loss' | 'finish';
    title: string;
    detail: string;
  }> = [];

  for (const r of rows.slice(-25).reverse()) {
    const macName = r.machine_name || r.line_name;
    timelineEvents.push({
      id: `ev-prod-${r.id}`,
      timestamp: r.created_at,
      machineId: r.machine_id || null,
      machineName: macName,
      eventType: 'finish',
      title: `Produção registrada · ${r.product_name}`,
      detail: `${r.produced_quantity} ${r.unit_of_measure} produzidos (${r.approved_quantity} aprovados)`,
    });
    if (r.has_downtime && r.total_downtime_minutes > 0) {
      timelineEvents.push({
        id: `ev-dt-${r.id}`,
        timestamp: r.created_at,
        machineId: r.machine_id || null,
        machineName: macName,
        eventType: 'downtime',
        title: `Parada de ${r.total_downtime_minutes} min`,
        detail: `${r.sector_name} · ${r.shift_name}`,
      });
    }
    if (r.loss_quantity > 0) {
      timelineEvents.push({
        id: `ev-ls-${r.id}`,
        timestamp: r.created_at,
        machineId: r.machine_id || null,
        machineName: macName,
        eventType: 'loss',
        title: `Perda registrada: ${r.loss_quantity} ${r.unit_of_measure}`,
        detail: `${r.product_name} · ${r.shift_name}`,
      });
    }
  }

  const demoRecordsCount = rows.filter((r) => r.is_demo === 1).length;

  return {
    factory: fourLevel.factory,
    machineCounts: {
      total: machinesCatalog.length,
      operating,
      stopped,
      maintenance,
      idle,
      belowTarget,
    },
    sectors: fourLevel.sectors,
    lines: fourLevel.lines,
    machines: fourLevel.machines,
    charts: {
      dailyIrog,
      weeklyIrog,
      monthlyIrog,
      downtimeByReason,
      lossByReason,
      byShift: byShiftChart,
    },
    timelineEvents: timelineEvents.slice(0, 40),
    demoRecordsCount,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: 'novo.forteflex',
      module: 'IROG ForteFlex',
      database: 'sqlite',
      supabaseConfigured: Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY),
    });
  });

  // ---------------------------------------------------------------------------
  // AUTH ROUTES
  // ---------------------------------------------------------------------------
  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      res.status(400).json({ error: 'Informe seu usuário ou e-mail e sua senha.' });
      return;
    }

    const cleanIdentifier = String(identifier).trim().toLowerCase();
    const row = db
      .prepare(
        `SELECT p.*, s.name as sector_name
         FROM profiles p
         LEFT JOIN sectors s ON s.id = p.sector_id
         WHERE lower(p.username) = ? OR lower(p.email) = ?`
      )
      .get(cleanIdentifier, cleanIdentifier) as any;

    if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
      res.status(401).json({ error: 'Usuário, e-mail ou senha inválidos.' });
      return;
    }

    if (!row.is_active) {
      res.status(403).json({
        error: 'Usuário bloqueado. Procure o administrador da empresa para reativar seu acesso.',
      });
      return;
    }

    const user = sanitizeUserRow(row);
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    setSessionCookie(req, res, token);
    recordAuditLog({
      actorId: user.id,
      actorName: user.full_name,
      action: 'LOGIN',
      entityType: 'auth',
      entityId: user.id,
      details: { role: user.role },
    });

    res.json({ token, user });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/recover', (req, res) => {
    const { identifier } = req.body || {};
    if (!identifier || String(identifier).trim().length < 3) {
      res.status(400).json({ error: 'Informe o usuário ou e-mail cadastrado.' });
      return;
    }

    const cleanIdentifier = String(identifier).trim().toLowerCase();
    const row = db
      .prepare('SELECT id, username, full_name FROM profiles WHERE lower(username) = ? OR lower(email) = ?')
      .get(cleanIdentifier, cleanIdentifier) as any;

    if (!row) {
      res.json({
        accepted: true,
        message:
          'Se o usuário ou e-mail estiver cadastrado na plataforma, a solicitação de redefinição foi registrada para atendimento pelo administrador.',
      });
      return;
    }

    res.json({
      accepted: true,
      message: `Solicitação registrada para ${row.full_name} (${row.username}). O administrador pode redefinir a senha em Gestão de Usuários.`,
    });
  });

  // ---------------------------------------------------------------------------
  // CATALOG ROUTE (Authenticated users)
  // ---------------------------------------------------------------------------
  app.get('/api/catalog', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const isAdminOrDirector = user.role === 'admin' || user.role === 'director';
    const activeClause = isAdminOrDirector ? '' : 'WHERE active = 1';

    const sectors = db
      .prepare(`SELECT * FROM sectors ${activeClause} ORDER BY name`)
      .all()
      .map((s: any) => ({ ...s, active: Boolean(s.active) }));

    const lines = db
      .prepare(
        `SELECT pl.*, s.name as sector_name
         FROM production_lines pl
         JOIN sectors s ON s.id = pl.sector_id
         ${isAdminOrDirector ? '' : 'WHERE pl.active = 1 AND s.active = 1'}
         ORDER BY pl.code`
      )
      .all()
      .map((l: any) => ({ ...l, active: Boolean(l.active) }));

    const machines = db
      .prepare(
        `SELECT m.*, s.name as sector_name, pl.name as line_name
         FROM machines m
         JOIN sectors s ON s.id = m.sector_id
         LEFT JOIN production_lines pl ON pl.id = m.line_id
         ${isAdminOrDirector ? '' : 'WHERE m.active = 1'}
         ORDER BY m.code`
      )
      .all()
      .map((m: any) => ({ ...m, active: Boolean(m.active) }));

    const stages = db
      .prepare(
        `SELECT ps.*, s.name as sector_name
         FROM production_stages ps
         LEFT JOIN sectors s ON s.id = ps.sector_id
         ${isAdminOrDirector ? '' : 'WHERE ps.active = 1'}
         ORDER BY ps.code`
      )
      .all()
      .map((st: any) => ({ ...st, active: Boolean(st.active) }));

    const products = db
      .prepare(`SELECT * FROM products ${activeClause} ORDER BY name`)
      .all()
      .map((p: any) => ({ ...p, active: Boolean(p.active) }));

    const cycleStandards = db
      .prepare(
        `SELECT cs.*, p.name as product_name, p.sku as product_sku, ps.name as stage_name, m.code as machine_code, m.name as machine_name
         FROM cycle_time_standards cs
         JOIN products p ON p.id = cs.product_id
         LEFT JOIN production_stages ps ON ps.id = cs.stage_id
         JOIN machines m ON m.id = cs.machine_id
         WHERE cs.is_current = 1
         ORDER BY m.code, p.name`
      )
      .all()
      .map((c: any) => ({ ...c, is_current: Boolean(c.is_current) }));

    const orders = db
      .prepare(
        `SELECT po.*, p.name as product_name, p.sku as product_sku, s.name as sector_name, pl.name as line_name, m.name as machine_name
         FROM production_orders po
         JOIN products p ON p.id = po.product_id
         JOIN sectors s ON s.id = po.sector_id
         LEFT JOIN production_lines pl ON pl.id = po.line_id
         LEFT JOIN machines m ON m.id = po.machine_id
         ORDER BY po.created_at DESC`
      )
      .all();

    const shifts = db
      .prepare(`SELECT * FROM shifts ${activeClause} ORDER BY code`)
      .all()
      .map((sh: any) => ({ ...sh, active: Boolean(sh.active) }));

    const calendars = db
      .prepare(
        `SELECT pc.*, s.name as sector_name, pl.name as line_name, m.name as machine_name, sh.name as shift_name
         FROM production_calendars pc
         LEFT JOIN sectors s ON s.id = pc.sector_id
         LEFT JOIN production_lines pl ON pl.id = pc.line_id
         LEFT JOIN machines m ON m.id = pc.machine_id
         LEFT JOIN shifts sh ON sh.id = pc.shift_id
         ORDER BY pc.calendar_date DESC`
      )
      .all();

    const downtimeReasons = db
      .prepare(`SELECT * FROM downtime_reasons ${activeClause} ORDER BY code`)
      .all()
      .map((r: any) => ({
        ...r,
        is_planned: Boolean(r.is_planned),
        counts_for_availability: Boolean(r.counts_for_availability),
        active: Boolean(r.active),
      }));

    const lossReasons = db
      .prepare(`SELECT * FROM loss_reasons ${activeClause} ORDER BY code`)
      .all()
      .map((r: any) => ({ ...r, active: Boolean(r.active) }));

    const goals = db
      .prepare(
        `SELECT pg.*, s.name as sector_name, pl.name as line_name, pr.name as product_name, sh.name as shift_name
         FROM production_goals pg
         JOIN sectors s ON s.id = pg.sector_id
         LEFT JOIN production_lines pl ON pl.id = pg.line_id
         LEFT JOIN products pr ON pr.id = pg.product_id
         LEFT JOIN shifts sh ON sh.id = pg.shift_id
         ${isAdminOrDirector ? '' : 'WHERE pg.active = 1'}
         ORDER BY pg.created_at DESC`
      )
      .all()
      .map((g: any) => ({ ...g, active: Boolean(g.active) }));

    const irogGoals = db
      .prepare(
        `SELECT ig.*, s.name as sector_name, pl.name as line_name, m.name as machine_name
         FROM irog_goals ig
         LEFT JOIN sectors s ON s.id = ig.sector_id
         LEFT JOIN production_lines pl ON pl.id = ig.line_id
         LEFT JOIN machines m ON m.id = ig.machine_id
         WHERE ig.active = 1
         ORDER BY ig.scope_level, ig.created_at DESC`
      )
      .all()
      .map((g: any) => ({ ...g, active: Boolean(g.active) }));

    const operators =
      user.role !== 'operator'
        ? db
            .prepare('SELECT id, full_name, username, role, sector_id, is_active FROM profiles ORDER BY full_name')
            .all()
            .map((u: any) => ({ ...u, is_active: Boolean(u.is_active) }))
        : [
            {
              id: user.id,
              full_name: user.full_name,
              username: user.username,
              role: user.role,
              sector_id: user.sector_id,
              is_active: user.is_active,
            },
          ];

    res.json({
      sectors,
      lines,
      machines,
      stages,
      products,
      cycleStandards,
      orders,
      shifts,
      calendars,
      downtimeReasons,
      lossReasons,
      goals,
      irogGoals,
      operators,
    });
  });

  // ---------------------------------------------------------------------------
  // PRODUCTION RECORDS ROUTES
  // ---------------------------------------------------------------------------
  app.get('/api/production-records', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const allowedSectors = getUserAllowedSectorIds(user);
    const { clauses, params } = buildRecordFilterWhere(req.query as Record<string, any>, 'pr', allowedSectors);

    if (user.role === 'operator') {
      if (!user.permissions.can_view_own_records && !user.permissions.can_view_sector_records) {
        res.status(403).json({ error: 'Seu perfil não possui permissão para consultar registros.' });
        return;
      }
      if (!user.permissions.can_view_sector_records) {
        clauses.push('(pr.operator_id = ? OR pr.created_by = ?)');
        params.push(user.id, user.id);
      }
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT
          pr.*,
          sh.name as shift_name,
          op.full_name as operator_name,
          sec.name as sector_name,
          ln.name as line_name,
          mac.code as machine_code,
          mac.name as machine_name,
          stg.name as stage_name,
          po.order_number as order_number,
          prod.name as product_name,
          prod.sku as product_sku,
          cb.full_name as created_by_name,
          dt.reason as downtime_reason,
          dt.description as downtime_description
         FROM production_records pr
         JOIN shifts sh ON sh.id = pr.shift_id
         JOIN profiles op ON op.id = pr.operator_id
         JOIN sectors sec ON sec.id = pr.sector_id
         JOIN production_lines ln ON ln.id = pr.line_id
         LEFT JOIN machines mac ON mac.id = pr.machine_id
         LEFT JOIN production_stages stg ON stg.id = pr.stage_id
         LEFT JOIN production_orders po ON po.id = pr.production_order_id
         JOIN products prod ON prod.id = pr.product_id
         JOIN profiles cb ON cb.id = pr.created_by
         LEFT JOIN downtime_records dt ON dt.production_record_id = pr.id
         ${whereSql}
         ORDER BY pr.production_date DESC, pr.created_at DESC`
      )
      .all(...params)
      .map((r: any) => ({
        ...r,
        has_downtime: Boolean(r.has_downtime),
        is_demo: Boolean(r.is_demo),
      }));

    res.json({ records: rows });
  });

  app.post('/api/production-records', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    if (!user.permissions.can_create_records && user.role !== 'admin') {
      res.status(403).json({ error: 'Seu usuário não possui permissão para lançar registros de produção.' });
      return;
    }

    const body = req.body || {};
    const {
      production_date,
      shift_id,
      operator_id,
      sector_id,
      line_id,
      machine_id,
      stage_id,
      production_order_id,
      product_id,
      planned_quantity,
      produced_quantity,
      approved_quantity,
      loss_quantity,
      unit_of_measure,
      start_time,
      end_time,
      planned_time_minutes,
      has_downtime,
      total_downtime_minutes,
      downtime_reason_id,
      downtime_reason,
      downtime_description,
      notes,
      additional_notes,
    } = body;

    if (!production_date || !shift_id || !sector_id || !line_id || !product_id) {
      res.status(400).json({ error: 'Preencha todos os campos obrigatórios de identificação.' });
      return;
    }

    const planned = Number(planned_quantity);
    const produced = Number(produced_quantity);
    const approved = Number(approved_quantity);
    const loss = Number(loss_quantity);
    const downtimeMin = has_downtime ? Number(total_downtime_minutes) : 0;

    if (!Number.isFinite(planned) || planned <= 0) {
      res.status(400).json({ error: 'A quantidade planejada deve ser maior que zero.' });
      return;
    }
    if (
      !Number.isFinite(produced) ||
      produced < 0 ||
      !Number.isFinite(approved) ||
      approved < 0 ||
      !Number.isFinite(loss) ||
      loss < 0
    ) {
      res.status(400).json({ error: 'As quantidades produzida, aprovada e de perdas não podem ser negativas.' });
      return;
    }
    if (approved > produced) {
      res.status(400).json({ error: 'A quantidade aprovada não pode exceder a quantidade efetivamente produzida.' });
      return;
    }

    if (has_downtime) {
      if (!Number.isFinite(downtimeMin) || downtimeMin <= 0) {
        res.status(400).json({ error: 'Informe o tempo total de parada (maior que 0 minutos).' });
        return;
      }
      if (!downtime_reason || !String(downtime_reason).trim()) {
        res.status(400).json({ error: 'Informe o motivo da parada.' });
        return;
      }
    }

    const targetOperatorId =
      user.role === 'admin' || user.role === 'leader' ? String(operator_id || user.id) : user.id;

    // Duplicate protection check for same date, shift, operator, machine/line, product, start_time
    const dupCheck = db
      .prepare(
        `SELECT id FROM production_records
         WHERE production_date = ? AND shift_id = ? AND operator_id = ? AND line_id = ? AND COALESCE(machine_id, '') = ? AND product_id = ? AND COALESCE(start_time, '') = ?`
      )
      .get(
        String(production_date),
        String(shift_id),
        targetOperatorId,
        String(line_id),
        String(machine_id || ''),
        String(product_id),
        String(start_time || '')
      );
    if (dupCheck) {
      res.status(409).json({
        error: 'Já existe um apontamento idêntico para esta data, turno, máquina/linha, operador e produto.',
      });
      return;
    }

    const product = db.prepare('SELECT id, unit_of_measure FROM products WHERE id = ?').get(product_id) as any;
    if (!product) {
      res.status(400).json({ error: 'Produto selecionado inválido.' });
      return;
    }

    const shiftRow = db.prepare('SELECT start_time, end_time, break_minutes FROM shifts WHERE id = ?').get(shift_id) as any;
    let resolvedPlannedMinutes: number | null =
      planned_time_minutes && Number(planned_time_minutes) > 0 ? Number(planned_time_minutes) : null;
    if (!resolvedPlannedMinutes && start_time && end_time) {
      resolvedPlannedMinutes = computeDurationMinutesFromTimes(start_time, end_time);
    }
    if (!resolvedPlannedMinutes && shiftRow) {
      const len = computeDurationMinutesFromTimes(shiftRow.start_time, shiftRow.end_time);
      if (len) resolvedPlannedMinutes = Math.max(0, len - Number(shiftRow.break_minutes || 0));
    }

    const reasonRow = downtime_reason_id
      ? (db.prepare('SELECT * FROM downtime_reasons WHERE id = ?').get(downtime_reason_id) as any)
      : null;

    const recordId = `rec-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO production_records (
          id, production_date, shift_id, operator_id, sector_id, line_id, machine_id, stage_id, production_order_id, product_id,
          planned_quantity, produced_quantity, approved_quantity, loss_quantity, unit_of_measure,
          start_time, end_time, planned_time_minutes,
          has_downtime, total_downtime_minutes, notes, additional_notes, is_demo, source_origin, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'manual', ?, ?, ?)`
      ).run(
        recordId,
        String(production_date),
        String(shift_id),
        targetOperatorId,
        String(sector_id),
        String(line_id),
        machine_id ? String(machine_id) : null,
        stage_id ? String(stage_id) : null,
        production_order_id ? String(production_order_id) : null,
        String(product_id),
        planned,
        produced,
        approved,
        loss,
        String(unit_of_measure || product.unit_of_measure || 'kg'),
        start_time ? String(start_time) : null,
        end_time ? String(end_time) : null,
        resolvedPlannedMinutes,
        has_downtime ? 1 : 0,
        Math.round(downtimeMin),
        notes ? String(notes).trim() : null,
        additional_notes ? String(additional_notes).trim() : null,
        user.id,
        nowIso,
        nowIso
      );

      if (has_downtime) {
        db.prepare(
          `INSERT INTO downtime_records (
            id, production_record_id, machine_id, sector_id, line_id, shift_id, reason_id,
            reason, category, is_planned, counts_for_availability, duration_minutes, description, status, recorded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'closed', ?)`
        ).run(
          `dt-${crypto.randomUUID()}`,
          recordId,
          machine_id ? String(machine_id) : null,
          String(sector_id),
          String(line_id),
          String(shift_id),
          reasonRow ? reasonRow.id : null,
          reasonRow ? reasonRow.name : String(downtime_reason).trim(),
          reasonRow ? reasonRow.category : 'Operacional',
          reasonRow ? reasonRow.is_planned : 0,
          reasonRow ? reasonRow.counts_for_availability : 1,
          Math.round(downtimeMin),
          downtime_description ? String(downtime_description).trim() : null,
          user.id
        );
      }

      if (loss > 0) {
        db.prepare(
          `INSERT INTO loss_records (
            id, production_record_id, loss_date, shift_id, sector_id, line_id, machine_id, product_id, production_order_id,
            category, reason_name, quantity, unit_of_measure, notes, is_demo, recorded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Refugo', 'Perda registrada no apontamento de produção', ?, ?, ?, 0, ?)`
        ).run(
          `ls-${crypto.randomUUID()}`,
          recordId,
          String(production_date),
          String(shift_id),
          String(sector_id),
          String(line_id),
          machine_id ? String(machine_id) : null,
          String(product_id),
          production_order_id ? String(production_order_id) : null,
          loss,
          String(unit_of_measure || product.unit_of_measure || 'kg'),
          notes ? String(notes).trim() : null,
          user.id
        );
      }
    });

    tx();

    recordAuditLog({
      actorId: user.id,
      actorName: user.full_name,
      action: 'CREATE_PRODUCTION_RECORD',
      entityType: 'production_records',
      entityId: recordId,
      details: { produced, approved, loss, machine_id },
    });

    const created = db
      .prepare(
        `SELECT
          pr.*,
          sh.name as shift_name,
          op.full_name as operator_name,
          sec.name as sector_name,
          ln.name as line_name,
          mac.code as machine_code,
          mac.name as machine_name,
          stg.name as stage_name,
          po.order_number as order_number,
          prod.name as product_name,
          prod.sku as product_sku,
          cb.full_name as created_by_name,
          dt.reason as downtime_reason,
          dt.description as downtime_description
         FROM production_records pr
         JOIN shifts sh ON sh.id = pr.shift_id
         JOIN profiles op ON op.id = pr.operator_id
         JOIN sectors sec ON sec.id = pr.sector_id
         JOIN production_lines ln ON ln.id = pr.line_id
         LEFT JOIN machines mac ON mac.id = pr.machine_id
         LEFT JOIN production_stages stg ON stg.id = pr.stage_id
         LEFT JOIN production_orders po ON po.id = pr.production_order_id
         JOIN products prod ON prod.id = pr.product_id
         JOIN profiles cb ON cb.id = pr.created_by
         LEFT JOIN downtime_records dt ON dt.production_record_id = pr.id
         WHERE pr.id = ?`
      )
      .get(recordId) as any;

    res.status(201).json({
      record: {
        ...created,
        has_downtime: Boolean(created.has_downtime),
        is_demo: Boolean(created.is_demo),
      },
    });
  });

  app.put('/api/production-records/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM production_records WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Registro de produção não encontrado.' });
      return;
    }

    if (user.role !== 'admin') {
      const isOwner = existing.operator_id === user.id || existing.created_by === user.id;
      if (!isOwner || !user.permissions.can_edit_own_records) {
        res.status(403).json({ error: 'Você não tem permissão para alterar registros de outros funcionários.' });
        return;
      }
    }

    const body = req.body || {};
    const planned = Number(body.planned_quantity ?? existing.planned_quantity);
    const produced = Number(body.produced_quantity ?? existing.produced_quantity);
    const approved = Number(body.approved_quantity ?? existing.approved_quantity);
    const loss = Number(body.loss_quantity ?? existing.loss_quantity);

    if (planned <= 0 || produced < 0 || approved < 0 || loss < 0 || approved > produced) {
      res.status(400).json({ error: 'Valores numéricos inválidos para o registro.' });
      return;
    }

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE production_records SET
        planned_quantity = ?,
        produced_quantity = ?,
        approved_quantity = ?,
        loss_quantity = ?,
        notes = ?,
        updated_at = ?
       WHERE id = ?`
    ).run(
      planned,
      produced,
      approved,
      loss,
      body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes,
      nowIso,
      id
    );

    recordAuditLog({
      actorId: user.id,
      actorName: user.full_name,
      action: 'UPDATE_PRODUCTION_RECORD',
      entityType: 'production_records',
      entityId: id,
      details: { before: { produced: existing.produced_quantity, approved: existing.approved_quantity }, after: { produced, approved, loss } },
    });

    res.json({ updated: true, id });
  });

  app.delete('/api/production-records/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT id, production_date, produced_quantity FROM production_records WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Registro não encontrado.' });
      return;
    }
    db.prepare('DELETE FROM loss_records WHERE production_record_id = ?').run(id);
    db.prepare('DELETE FROM production_records WHERE id = ?').run(id);
    recordAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.full_name,
      action: 'DELETE_PRODUCTION_RECORD',
      entityType: 'production_records',
      entityId: id,
      details: existing,
    });
    res.json({ deleted: true });
  });

  // ---------------------------------------------------------------------------
  // STANDALONE DOWNTIME MODULE (Open/Close real-time stops + Completed stops)
  // ---------------------------------------------------------------------------
  app.get('/api/downtimes', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const allowedSectors = getUserAllowedSectorIds(user);
    const clauses: string[] = [];
    const params: any[] = [];

    if (allowedSectors !== null) {
      if (allowedSectors.length === 0) {
        clauses.push('1 = 0');
      } else {
        clauses.push(`COALESCE(dt.sector_id, pr.sector_id) IN (${allowedSectors.map(() => '?').join(',')})`);
        params.push(...allowedSectors);
      }
    }
    if (req.query.machineId) {
      clauses.push('dt.machine_id = ?');
      params.push(String(req.query.machineId));
    }
    if (req.query.status) {
      clauses.push('dt.status = ?');
      params.push(String(req.query.status));
    }
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT
          dt.*,
          m.code as machine_code,
          m.name as machine_name,
          COALESCE(s.name, pr_s.name) as sector_name,
          COALESCE(l.name, pr_l.name) as line_name,
          sh.name as shift_name,
          u.full_name as recorded_by_name
         FROM downtime_records dt
         LEFT JOIN production_records pr ON pr.id = dt.production_record_id
         LEFT JOIN machines m ON m.id = COALESCE(dt.machine_id, pr.machine_id)
         LEFT JOIN sectors s ON s.id = dt.sector_id
         LEFT JOIN sectors pr_s ON pr_s.id = pr.sector_id
         LEFT JOIN production_lines l ON l.id = dt.line_id
         LEFT JOIN production_lines pr_l ON pr_l.id = pr.line_id
         LEFT JOIN shifts sh ON sh.id = COALESCE(dt.shift_id, pr.shift_id)
         LEFT JOIN profiles u ON u.id = dt.recorded_by
         ${whereSql}
         ORDER BY CASE WHEN dt.status = 'open' THEN 0 ELSE 1 END, dt.created_at DESC
         LIMIT 150`
      )
      .all(...params)
      .map((r: any) => ({
        ...r,
        is_planned: Boolean(r.is_planned),
        counts_for_availability: Boolean(r.counts_for_availability),
      }));

    res.json({ downtimes: rows });
  });

  app.post('/api/downtimes', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    if (!user.permissions.can_register_downtime && user.role === 'operator') {
      res.status(403).json({ error: 'Sem permissão para registrar paradas.' });
      return;
    }

    const { machine_id, shift_id, reason_id, reason, category, start_at, end_at, duration_minutes, description, mode } =
      req.body || {};

    if (!machine_id || !shift_id) {
      res.status(400).json({ error: 'Selecione máquina/recurso e turno.' });
      return;
    }

    const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(machine_id) as any;
    if (!machine) {
      res.status(400).json({ error: 'Máquina/recurso não encontrado.' });
      return;
    }

    const reasonRow = reason_id ? (db.prepare('SELECT * FROM downtime_reasons WHERE id = ?').get(reason_id) as any) : null;
    const finalReason = reasonRow ? reasonRow.name : String(reason || '').trim();
    if (!finalReason) {
      res.status(400).json({ error: 'Informe o motivo da parada.' });
      return;
    }

    const isStartOnly = mode === 'open';
    const startIso = start_at ? String(start_at) : new Date().toISOString();
    let endIso: string | null = null;
    let finalDuration = Number(duration_minutes || 0);

    if (!isStartOnly) {
      endIso = end_at ? String(end_at) : new Date().toISOString();
      if (finalDuration <= 0 && start_at && end_at) {
        const diffMs = new Date(end_at).getTime() - new Date(start_at).getTime();
        if (diffMs > 0) finalDuration = Math.round(diffMs / 60000);
      }
      if (!Number.isFinite(finalDuration) || finalDuration <= 0) {
        res.status(400).json({ error: 'Informe a duração da parada em minutos (> 0) ou horários válidos.' });
        return;
      }
    }

    const id = `dt-${crypto.randomUUID()}`;
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO downtime_records (
          id, production_record_id, machine_id, sector_id, line_id, shift_id, reason_id,
          reason, category, is_planned, counts_for_availability, duration_minutes,
          start_at, end_at, status, description, recorded_by
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        machine.id,
        machine.sector_id,
        machine.line_id,
        String(shift_id),
        reasonRow ? reasonRow.id : null,
        finalReason,
        reasonRow ? reasonRow.category : String(category || 'Outros'),
        reasonRow ? reasonRow.is_planned : 0,
        reasonRow ? reasonRow.counts_for_availability : 1,
        isStartOnly ? 0 : Math.round(finalDuration),
        startIso,
        endIso,
        isStartOnly ? 'open' : 'closed',
        description ? String(description).trim() : null,
        user.id
      );

      if (isStartOnly) {
        db.prepare("UPDATE machines SET status = 'stopped', updated_at = datetime('now') WHERE id = ?").run(machine.id);
      }
    });

    tx();
    recordAuditLog({
      actorId: user.id,
      actorName: user.full_name,
      action: isStartOnly ? 'START_DOWNTIME' : 'RECORD_DOWNTIME',
      entityType: 'downtime_records',
      entityId: id,
      details: { machine_id: machine.id, reason: finalReason, duration_minutes: finalDuration },
    });

    res.status(201).json({ id, status: isStartOnly ? 'open' : 'closed' });
  });

  app.post('/api/downtimes/:id/close', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM downtime_records WHERE id = ?').get(id) as any;
    if (!row) {
      res.status(404).json({ error: 'Parada não encontrada.' });
      return;
    }
    if (row.status === 'closed') {
      res.status(400).json({ error: 'Esta parada já foi encerrada.' });
      return;
    }

    const endIso = req.body?.end_at ? String(req.body.end_at) : new Date().toISOString();
    let duration = Number(req.body?.duration_minutes || 0);
    if (duration <= 0 && row.start_at) {
      const diffMin = Math.max(1, Math.round((new Date(endIso).getTime() - new Date(row.start_at).getTime()) / 60000));
      duration = diffMin;
    }
    if (duration <= 0) duration = 1;

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE downtime_records SET end_at = ?, duration_minutes = ?, status = 'closed', description = COALESCE(?, description) WHERE id = ?`
      ).run(endIso, Math.round(duration), req.body?.description ? String(req.body.description) : null, id);

      if (row.machine_id) {
        db.prepare("UPDATE machines SET status = 'operating', updated_at = datetime('now') WHERE id = ?").run(row.machine_id);
      }
    });
    tx();

    recordAuditLog({
      actorId: user.id,
      actorName: user.full_name,
      action: 'CLOSE_DOWNTIME',
      entityType: 'downtime_records',
      entityId: id,
      details: { duration_minutes: duration },
    });

    res.json({ closed: true, duration_minutes: Math.round(duration) });
  });

  // ---------------------------------------------------------------------------
  // STANDALONE LOSSES MODULE
  // ---------------------------------------------------------------------------
  app.get('/api/losses', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const allowedSectors = getUserAllowedSectorIds(user);
    const clauses: string[] = [];
    const params: any[] = [];

    if (allowedSectors !== null) {
      if (allowedSectors.length === 0) clauses.push('1 = 0');
      else {
        clauses.push(`lr.sector_id IN (${allowedSectors.map(() => '?').join(',')})`);
        params.push(...allowedSectors);
      }
    }
    if (user.role === 'operator') {
      clauses.push('lr.recorded_by = ?');
      params.push(user.id);
    }
    if (req.query.includeDemo === 'false') {
      clauses.push('lr.is_demo = 0');
    }
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT lr.*, sh.name as shift_name, s.name as sector_name, l.name as line_name, m.name as machine_name,
                p.name as product_name, p.sku as product_sku, po.order_number, u.full_name as recorded_by_name
         FROM loss_records lr
         JOIN shifts sh ON sh.id = lr.shift_id
         JOIN sectors s ON s.id = lr.sector_id
         LEFT JOIN production_lines l ON l.id = lr.line_id
         LEFT JOIN machines m ON m.id = lr.machine_id
         JOIN products p ON p.id = lr.product_id
         LEFT JOIN production_orders po ON po.id = lr.production_order_id
         JOIN profiles u ON u.id = lr.recorded_by
         ${whereSql}
         ORDER BY lr.loss_date DESC, lr.created_at DESC
         LIMIT 200`
      )
      .all(...params)
      .map((r: any) => ({ ...r, is_demo: Boolean(r.is_demo) }));

    res.json({ losses: rows });
  });

  app.post('/api/losses', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    if (!user.permissions.can_register_losses && user.role === 'operator') {
      res.status(403).json({ error: 'Sem permissão para registrar perdas.' });
      return;
    }

    const { loss_date, shift_id, sector_id, line_id, machine_id, product_id, production_order_id, reason_id, category, reason_name, quantity, unit_of_measure, notes } =
      req.body || {};

    const qty = Number(quantity);
    if (!loss_date || !shift_id || !sector_id || !product_id || !Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ error: 'Preencha data, turno, setor, produto e quantidade maior que zero.' });
      return;
    }

    const prod = db.prepare('SELECT unit_of_measure FROM products WHERE id = ?').get(product_id) as any;
    const reasonRow = reason_id ? (db.prepare('SELECT * FROM loss_reasons WHERE id = ?').get(reason_id) as any) : null;

    const id = `ls-${crypto.randomUUID()}`;
    db.prepare(
      `INSERT INTO loss_records (
        id, production_record_id, loss_date, shift_id, sector_id, line_id, machine_id, product_id, production_order_id,
        reason_id, category, reason_name, quantity, unit_of_measure, notes, is_demo, recorded_by
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(
      id,
      String(loss_date),
      String(shift_id),
      String(sector_id),
      line_id ? String(line_id) : null,
      machine_id ? String(machine_id) : null,
      String(product_id),
      production_order_id ? String(production_order_id) : null,
      reasonRow ? reasonRow.id : null,
      reasonRow ? reasonRow.category : String(category || 'Refugo'),
      reasonRow ? reasonRow.name : String(reason_name || 'Perda registrada manualmente'),
      qty,
      String(unit_of_measure || prod?.unit_of_measure || 'kg'),
      notes ? String(notes).trim() : null,
      user.id
    );

    recordAuditLog({
      actorId: user.id,
      actorName: user.full_name,
      action: 'RECORD_LOSS',
      entityType: 'loss_records',
      entityId: id,
      details: { quantity: qty, product_id },
    });

    res.status(201).json({ id });
  });

  // ---------------------------------------------------------------------------
  // MANAGERIAL DASHBOARD & 4-LEVEL IROG ANALYTICS
  // ---------------------------------------------------------------------------
  app.get('/api/dashboard/summary', requireAuth, requireDashboardAccess, (req: AuthenticatedRequest, res) => {
    const query = req.query as Record<string, any>;
    const allowedSectors = getUserAllowedSectorIds(req.user!);
    const { clauses, params } = buildRecordFilterWhere(query, 'pr', allowedSectors);
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT
          pr.*,
          sh.name as shift_name,
          op.full_name as operator_name,
          sec.name as sector_name,
          ln.name as line_name,
          prod.name as product_name,
          dt.reason as downtime_reason
         FROM production_records pr
         JOIN shifts sh ON sh.id = pr.shift_id
         JOIN profiles op ON op.id = pr.operator_id
         JOIN sectors sec ON sec.id = pr.sector_id
         JOIN production_lines ln ON ln.id = pr.line_id
         JOIN products prod ON prod.id = pr.product_id
         LEFT JOIN downtime_records dt ON dt.production_record_id = pr.id
         ${whereSql}
         ORDER BY pr.production_date ASC`
      )
      .all(...params) as any[];

    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);

    const entityFilter = buildRecordFilterWhere(
      {
        shiftId: query.shiftId,
        sectorId: query.sectorId,
        lineId: query.lineId,
        machineId: query.machineId,
        productId: query.productId,
        operatorId: query.operatorId,
        includeDemo: query.includeDemo,
      },
      'pr',
      allowedSectors
    );

    const todayClauses = [...entityFilter.clauses, 'pr.production_date = ?'];
    const todayRow = db
      .prepare(`SELECT COALESCE(SUM(pr.produced_quantity), 0) as total FROM production_records pr WHERE ${todayClauses.join(' AND ')}`)
      .get(...entityFilter.params, todayStr) as { total: number };

    const monthClauses = [...entityFilter.clauses, "substr(pr.production_date, 1, 7) = ?"];
    const monthRow = db
      .prepare(`SELECT COALESCE(SUM(pr.produced_quantity), 0) as total FROM production_records pr WHERE ${monthClauses.join(' AND ')}`)
      .get(...entityFilter.params, monthStr) as { total: number };

    let plannedTotal = 0;
    let realizedTotal = 0;
    let approvedTotal = 0;
    let lossesTotal = 0;
    let totalDowntimeMinutes = 0;
    let demoRecordsCount = 0;

    const dailyMap = new Map<string, { planned: number; realized: number; approved: number; losses: number }>();
    const shiftMap = new Map<string, { planned: number; realized: number; losses: number }>();
    const sectorMap = new Map<string, { planned: number; realized: number; losses: number }>();
    const employeeMap = new Map<string, { realized: number; approved: number; losses: number }>();
    const productMap = new Map<string, { planned: number; realized: number }>();
    const downtimeReasonMap = new Map<string, { minutes: number; occurrences: number }>();

    for (const r of rows) {
      plannedTotal += r.planned_quantity;
      realizedTotal += r.produced_quantity;
      approvedTotal += r.approved_quantity;
      lossesTotal += r.loss_quantity;
      totalDowntimeMinutes += r.total_downtime_minutes || 0;
      if (r.is_demo) demoRecordsCount++;

      const dEntry = dailyMap.get(r.production_date) || { planned: 0, realized: 0, approved: 0, losses: 0 };
      dEntry.planned += r.planned_quantity;
      dEntry.realized += r.produced_quantity;
      dEntry.approved += r.approved_quantity;
      dEntry.losses += r.loss_quantity;
      dailyMap.set(r.production_date, dEntry);

      const sEntry = shiftMap.get(r.shift_name) || { planned: 0, realized: 0, losses: 0 };
      sEntry.planned += r.planned_quantity;
      sEntry.realized += r.produced_quantity;
      sEntry.losses += r.loss_quantity;
      shiftMap.set(r.shift_name, sEntry);

      const secEntry = sectorMap.get(r.sector_name) || { planned: 0, realized: 0, losses: 0 };
      secEntry.planned += r.planned_quantity;
      secEntry.realized += r.produced_quantity;
      secEntry.losses += r.loss_quantity;
      sectorMap.set(r.sector_name, secEntry);

      const empEntry = employeeMap.get(r.operator_name) || { realized: 0, approved: 0, losses: 0 };
      empEntry.realized += r.produced_quantity;
      empEntry.approved += r.approved_quantity;
      empEntry.losses += r.loss_quantity;
      employeeMap.set(r.operator_name, empEntry);

      const prodEntry = productMap.get(r.product_name) || { planned: 0, realized: 0 };
      prodEntry.planned += r.planned_quantity;
      prodEntry.realized += r.produced_quantity;
      productMap.set(r.product_name, prodEntry);

      if (r.has_downtime && r.total_downtime_minutes > 0) {
        const reason = r.downtime_reason || 'Motivo não especificado';
        const dtEntry = downtimeReasonMap.get(reason) || { minutes: 0, occurrences: 0 };
        dtEntry.minutes += r.total_downtime_minutes;
        dtEntry.occurrences += 1;
        downtimeReasonMap.set(reason, dtEntry);
      }
    }

    const irogOverview = buildIrogOverviewData(query, allowedSectors);
    const goalAttainmentPercent = plannedTotal > 0 ? (realizedTotal / plannedTotal) * 100 : 0;
    const lossPercent = realizedTotal > 0 ? (lossesTotal / realizedTotal) * 100 : 0;

    res.json({
      kpis: {
        todayProduction: Math.round(todayRow.total),
        monthProduction: Math.round(monthRow.total),
        plannedTotal: Math.round(plannedTotal),
        realizedTotal: Math.round(realizedTotal),
        goalAttainmentPercent: Number(goalAttainmentPercent.toFixed(1)),
        lossesTotal: Math.round(lossesTotal),
        lossPercent: Number(lossPercent.toFixed(2)),
        totalDowntimeMinutes,
        productiveEfficiencyPercent: irogOverview.factory.irogPercent ?? 0,
        recordsCount: rows.length,
        demoRecordsCount,
      },
      charts: {
        dailyProduction: Array.from(dailyMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({
            date,
            planned: Math.round(v.planned),
            realized: Math.round(v.realized),
            approved: Math.round(v.approved),
          })),
        byShift: Array.from(shiftMap.entries()).map(([name, v]) => ({
          name,
          planned: Math.round(v.planned),
          realized: Math.round(v.realized),
          losses: Math.round(v.losses),
        })),
        bySector: Array.from(sectorMap.entries()).map(([name, v]) => ({
          name,
          planned: Math.round(v.planned),
          realized: Math.round(v.realized),
          losses: Math.round(v.losses),
        })),
        byEmployee: Array.from(employeeMap.entries()).map(([name, v]) => ({
          name,
          realized: Math.round(v.realized),
          approved: Math.round(v.approved),
          losses: Math.round(v.losses),
        })),
        byProduct: Array.from(productMap.entries()).map(([name, v]) => ({
          name,
          planned: Math.round(v.planned),
          realized: Math.round(v.realized),
        })),
        plannedVsActual: Array.from(sectorMap.entries()).map(([label, v]) => ({
          label,
          planned: Math.round(v.planned),
          realized: Math.round(v.realized),
        })),
        lossEvolution: Array.from(dailyMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({
            date,
            losses: Math.round(v.losses),
            lossPercent: v.realized > 0 ? Number(((v.losses / v.realized) * 100).toFixed(2)) : 0,
          })),
        downtimeReasons: Array.from(downtimeReasonMap.entries())
          .map(([reason, v]) => ({ reason, minutes: v.minutes, occurrences: v.occurrences }))
          .sort((a, b) => b.minutes - a.minutes),
      },
    });
  });

  app.get('/api/irog/overview', requireAuth, requireDashboardAccess, (req: AuthenticatedRequest, res) => {
    const allowedSectors = getUserAllowedSectorIds(req.user!);
    const data = buildIrogOverviewData(req.query as Record<string, any>, allowedSectors);
    res.json(data);
  });

  // ---------------------------------------------------------------------------
  // ALERTS & AUDIT ROUTES
  // ---------------------------------------------------------------------------
  app.get('/api/alerts', requireAuth, requireDashboardAccess, (req: AuthenticatedRequest, res) => {
    const allowedSectors = getUserAllowedSectorIds(req.user!);
    const overview = buildIrogOverviewData({ includeDemo: req.query.includeDemo ?? 'true' }, allowedSectors);
    const rules = db.prepare('SELECT * FROM irog_alerts_config ORDER BY created_at').all().map((r: any) => ({
      ...r,
      enabled: Boolean(r.enabled),
    }));

    const activeAlerts: any[] = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.alert_type === 'machine_irog_below_goal') {
        for (const m of overview.machines) {
          if (m.irogPercent !== null && m.irogPercent < rule.threshold_value) {
            activeAlerts.push({
              id: `act-${rule.id}-${m.id}`,
              ruleName: rule.name,
              severity: m.irogPercent < rule.threshold_value - 5 ? 'critical' : 'warning',
              entityLevel: 'machine',
              entityName: `${m.code} — ${m.name}`,
              message: `IROG da máquina em ${m.irogPercent}% (abaixo do limite ${rule.threshold_value}%)`,
              currentValue: `${m.irogPercent}%`,
              thresholdValue: `${rule.threshold_value}%`,
            });
          }
        }
      } else if (rule.alert_type === 'sector_irog_below_goal') {
        for (const s of overview.sectors) {
          if (s.irogPercent !== null && s.irogPercent < rule.threshold_value) {
            activeAlerts.push({
              id: `act-${rule.id}-${s.id}`,
              ruleName: rule.name,
              severity: 'warning',
              entityLevel: 'sector',
              entityName: s.name,
              message: `IROG do setor em ${s.irogPercent}% (abaixo do limite ${rule.threshold_value}%)`,
              currentValue: `${s.irogPercent}%`,
              thresholdValue: `${rule.threshold_value}%`,
            });
          }
        }
      } else if (rule.alert_type === 'downtime_above_limit') {
        for (const m of overview.machines) {
          if (m.downtimeMinutes > rule.threshold_value) {
            activeAlerts.push({
              id: `act-${rule.id}-${m.id}`,
              ruleName: rule.name,
              severity: 'critical',
              entityLevel: 'machine',
              entityName: `${m.code} — ${m.name}`,
              message: `Paradas acumuladas de ${m.downtimeMinutes} min (limite ${rule.threshold_value} min)`,
              currentValue: `${m.downtimeMinutes} min`,
              thresholdValue: `${rule.threshold_value} min`,
            });
          }
        }
      } else if (rule.alert_type === 'loss_above_limit') {
        for (const m of overview.machines) {
          const lossPct = m.producedQuantity > 0 ? (m.lossQuantity / m.producedQuantity) * 100 : 0;
          if (lossPct > rule.threshold_value) {
            activeAlerts.push({
              id: `act-${rule.id}-${m.id}`,
              ruleName: rule.name,
              severity: 'warning',
              entityLevel: 'machine',
              entityName: `${m.code} — ${m.name}`,
              message: `Perda de ${lossPct.toFixed(2)}% acima do limite (${rule.threshold_value}%)`,
              currentValue: `${lossPct.toFixed(2)}%`,
              thresholdValue: `${rule.threshold_value}%`,
            });
          }
        }
      }
    }

    // Check incomplete data warnings
    for (const m of overview.machines) {
      if (m.recordsCount > 0 && m.status === 'incomplete') {
        activeAlerts.push({
          id: `inc-${m.id}`,
          ruleName: 'Dados incompletos para IROG',
          severity: 'warning',
          entityLevel: 'machine',
          entityName: `${m.code} — ${m.name}`,
          message: m.memory.incompleteReasons[0] || 'Faltam parâmetros padrão para cálculo válido do IROG.',
          currentValue: 'Incompleto',
          thresholdValue: '100% parametrizado',
        });
      }
    }

    res.json({ rules, activeAlerts });
  });

  app.post('/api/admin/alerts-config', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { alert_type, name, threshold_value, comparison, recipients } = req.body || {};
    if (!alert_type || !name || threshold_value === undefined) {
      res.status(400).json({ error: 'Tipo, nome e limite são obrigatórios.' });
      return;
    }
    const id = `al-${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(
      'INSERT INTO irog_alerts_config (id, alert_type, name, threshold_value, comparison, recipients, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).run(id, String(alert_type), String(name), Number(threshold_value), comparison === 'gt' ? 'gt' : 'lt', recipients || null);
    recordAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.full_name,
      action: 'CREATE_ALERT_RULE',
      entityType: 'irog_alerts_config',
      entityId: id,
    });
    res.status(201).json({ id });
  });

  app.put('/api/admin/alerts-config/:id', requireAuth, requireAdmin, (req, res) => {
    const { enabled, threshold_value, recipients } = req.body || {};
    db.prepare(
      'UPDATE irog_alerts_config SET enabled = COALESCE(?, enabled), threshold_value = COALESCE(?, threshold_value), recipients = COALESCE(?, recipients) WHERE id = ?'
    ).run(
      enabled !== undefined ? (enabled ? 1 : 0) : null,
      threshold_value !== undefined ? Number(threshold_value) : null,
      recipients !== undefined ? String(recipients) : null,
      req.params.id
    );
    res.json({ updated: true });
  });

  app.get('/api/admin/audit-logs', requireAuth, requireDashboardAccess, (req: AuthenticatedRequest, res) => {
    if (req.user!.role !== 'admin' && req.user!.role !== 'director') {
      res.status(403).json({ error: 'Acesso restrito à Administração e Diretoria.' });
      return;
    }
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 150').all();
    const parameterHistory = db
      .prepare(
        `SELECT ph.*, p.full_name as changed_by_name
         FROM parameter_history ph
         LEFT JOIN profiles p ON p.id = ph.changed_by
         ORDER BY ph.created_at DESC LIMIT 150`
      )
      .all();
    res.json({ logs, parameterHistory });
  });

  // ---------------------------------------------------------------------------
  // ADMIN USERS & PERMISSIONS MANAGEMENT
  // ---------------------------------------------------------------------------
  app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
    const users = db
      .prepare(
        `SELECT p.*, s.name as sector_name
         FROM profiles p
         LEFT JOIN sectors s ON s.id = p.sector_id
         ORDER BY p.role ASC, p.full_name ASC`
      )
      .all()
      .map(sanitizeUserRow);
    res.json({ users });
  });

  app.post('/api/admin/users', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { username, email, full_name, password, role, sector_id, allowed_sector_ids, permissions } = req.body || {};
    const validRoles: UserRole[] = ['admin', 'director', 'manager', 'leader', 'operator'];
    if (!username || !email || !full_name || !password || !validRoles.includes(role)) {
      res.status(400).json({ error: 'Preencha usuário, e-mail, nome completo, perfil válido e senha.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'A senha deve possuir no mínimo 6 caracteres.' });
      return;
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanEmail = String(email).trim().toLowerCase();
    const exists = db
      .prepare('SELECT id FROM profiles WHERE lower(username) = ? OR lower(email) = ?')
      .get(cleanUsername, cleanEmail);
    if (exists) {
      res.status(409).json({ error: 'Já existe um usuário com este login ou e-mail.' });
      return;
    }

    const id = `usr-${crypto.randomUUID().slice(0, 12)}`;
    const hash = bcrypt.hashSync(String(password), 10);
    const defaultPermissions = {
      can_create_records: role === 'admin' || role === 'leader' || role === 'operator',
      can_edit_own_records: role === 'admin' || role === 'leader' || role === 'operator',
      can_view_own_records: true,
      can_view_sector_records: role !== 'operator',
      can_export_own_records: role !== 'operator',
      can_register_downtime: role === 'admin' || role === 'leader' || role === 'operator',
      can_register_losses: role === 'admin' || role === 'leader' || role === 'operator',
      can_view_irog_dashboards: role !== 'operator',
      ...(permissions || {}),
    };

    const allowedSecs = Array.isArray(allowed_sector_ids)
      ? allowed_sector_ids
      : sector_id
      ? [sector_id]
      : [];

    db.prepare(
      `INSERT INTO profiles (id, username, email, password_hash, full_name, role, sector_id, allowed_sector_ids, is_active, permissions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      cleanUsername,
      cleanEmail,
      hash,
      String(full_name).trim(),
      role,
      sector_id || null,
      JSON.stringify(allowedSecs),
      JSON.stringify(defaultPermissions)
    );

    recordAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.full_name,
      action: 'CREATE_USER',
      entityType: 'profiles',
      entityId: id,
      details: { username: cleanUsername, role },
    });

    const created = db
      .prepare('SELECT p.*, s.name as sector_name FROM profiles p LEFT JOIN sectors s ON s.id = p.sector_id WHERE p.id = ?')
      .get(id);
    res.status(201).json({ user: sanitizeUserRow(created) });
  });

  app.put('/api/admin/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const { full_name, email, username, role, sector_id, allowed_sector_ids, is_active, permissions, password } =
      req.body || {};

    if (id === req.user!.id && is_active === false) {
      res.status(400).json({ error: 'Você não pode bloquear o próprio usuário administrador conectado.' });
      return;
    }

    const validRoles: UserRole[] = ['admin', 'director', 'manager', 'leader', 'operator'];
    const nextRole = validRoles.includes(role) ? role : existing.role;
    const nextPasswordHash =
      password && String(password).trim().length >= 6 ? bcrypt.hashSync(String(password), 10) : existing.password_hash;

    const currentPerms = sanitizeUserRow(existing).permissions;
    const nextPerms = permissions ? { ...currentPerms, ...permissions } : currentPerms;
    const nextAllowedSectors =
      allowed_sector_ids !== undefined
        ? JSON.stringify(Array.isArray(allowed_sector_ids) ? allowed_sector_ids : [])
        : existing.allowed_sector_ids;

    db.prepare(
      `UPDATE profiles SET
        full_name = ?,
        email = ?,
        username = ?,
        role = ?,
        sector_id = ?,
        allowed_sector_ids = ?,
        is_active = ?,
        permissions = ?,
        password_hash = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      full_name ? String(full_name).trim() : existing.full_name,
      email ? String(email).trim().toLowerCase() : existing.email,
      username ? String(username).trim().toLowerCase() : existing.username,
      nextRole,
      sector_id !== undefined ? sector_id || null : existing.sector_id,
      nextAllowedSectors,
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      JSON.stringify(nextPerms),
      nextPasswordHash,
      id
    );

    recordAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.full_name,
      action: 'UPDATE_USER',
      entityType: 'profiles',
      entityId: id,
      details: { role: nextRole, is_active },
    });

    const updated = db
      .prepare('SELECT p.*, s.name as sector_name FROM profiles p LEFT JOIN sectors s ON s.id = p.sector_id WHERE p.id = ?')
      .get(id);
    res.json({ user: sanitizeUserRow(updated) });
  });

  // ---------------------------------------------------------------------------
  // ADMIN INDUSTRIAL CATALOG CRUD (Sectors, Lines, Machines, Stages, Products,
  // Cycle Standards w/ History, Orders, Shifts, Calendars, Reasons, IROG Goals)
  // ---------------------------------------------------------------------------
  app.post('/api/admin/sectors', requireAuth, requireAdmin, (req, res) => {
    const { code, name, description } = req.body || {};
    if (!code || !name) {
      res.status(400).json({ error: 'Código e nome do setor são obrigatórios.' });
      return;
    }
    const id = `sec-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare('INSERT INTO sectors (id, code, name, description, active) VALUES (?, ?, ?, ?, 1)').run(
        id,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        description ? String(description).trim() : null
      );
      res.status(201).json({ id });
    } catch {
      res.status(409).json({ error: 'Já existe um setor com este código.' });
    }
  });

  app.put('/api/admin/sectors/:id', requireAuth, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { code, name, description, active } = req.body || {};
    db.prepare(
      'UPDATE sectors SET code = COALESCE(?, code), name = COALESCE(?, name), description = COALESCE(?, description), active = COALESCE(?, active) WHERE id = ?'
    ).run(
      code ? String(code).trim().toUpperCase() : null,
      name ? String(name).trim() : null,
      description !== undefined ? (description ? String(description).trim() : null) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      id
    );
    res.json({ updated: true });
  });

  app.post('/api/admin/lines', requireAuth, requireAdmin, (req, res) => {
    const { sector_id, code, name, capacity_per_hour } = req.body || {};
    if (!sector_id || !code || !name) {
      res.status(400).json({ error: 'Setor, código e nome da linha são obrigatórios.' });
      return;
    }
    const id = `lin-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare(
        'INSERT INTO production_lines (id, sector_id, code, name, capacity_per_hour, active) VALUES (?, ?, ?, ?, ?, 1)'
      ).run(id, String(sector_id), String(code).trim().toUpperCase(), String(name).trim(), Number(capacity_per_hour || 0));
      res.status(201).json({ id });
    } catch {
      res.status(409).json({ error: 'Já existe uma linha com este código.' });
    }
  });

  app.put('/api/admin/lines/:id', requireAuth, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { sector_id, code, name, capacity_per_hour, active } = req.body || {};
    db.prepare(
      `UPDATE production_lines SET
        sector_id = COALESCE(?, sector_id),
        code = COALESCE(?, code),
        name = COALESCE(?, name),
        capacity_per_hour = COALESCE(?, capacity_per_hour),
        active = COALESCE(?, active)
       WHERE id = ?`
    ).run(
      sector_id || null,
      code ? String(code).trim().toUpperCase() : null,
      name ? String(name).trim() : null,
      capacity_per_hour !== undefined ? Number(capacity_per_hour) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      id
    );
    res.json({ updated: true });
  });

  // Machines
  app.post('/api/admin/machines', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { sector_id, line_id, code, name, resource_type, theoretical_capacity_per_hour, capacity_unit, status } =
      req.body || {};
    if (!sector_id || !code || !name) {
      res.status(400).json({ error: 'Setor, código e nome da máquina/recurso são obrigatórios.' });
      return;
    }
    const id = `mac-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare(
        `INSERT INTO machines (id, sector_id, line_id, code, name, resource_type, theoretical_capacity_per_hour, capacity_unit, status, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).run(
        id,
        String(sector_id),
        line_id ? String(line_id) : null,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        String(resource_type || 'Máquina'),
        theoretical_capacity_per_hour !== undefined && theoretical_capacity_per_hour !== ''
          ? Number(theoretical_capacity_per_hour)
          : null,
        String(capacity_unit || 'kg'),
        ['operating', 'stopped', 'maintenance', 'idle'].includes(status) ? status : 'operating'
      );
      recordAuditLog({
        actorId: req.user!.id,
        actorName: req.user!.full_name,
        action: 'CREATE_MACHINE',
        entityType: 'machines',
        entityId: id,
        details: { code, name },
      });
      res.status(201).json({ id });
    } catch {
      res.status(409).json({ error: 'Já existe uma máquina/recurso com este código.' });
    }
  });

  app.put('/api/admin/machines/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Máquina não encontrada.' });
      return;
    }
    const { sector_id, line_id, name, status, active, theoretical_capacity_per_hour } = req.body || {};
    if (
      theoretical_capacity_per_hour !== undefined &&
      Number(theoretical_capacity_per_hour) !== existing.theoretical_capacity_per_hour
    ) {
      recordParameterHistory({
        entityType: 'machine_capacity',
        entityId: id,
        fieldName: 'theoretical_capacity_per_hour',
        oldValue: existing.theoretical_capacity_per_hour !== null ? String(existing.theoretical_capacity_per_hour) : null,
        newValue: String(theoretical_capacity_per_hour),
        changedBy: req.user!.id,
      });
    }
    db.prepare(
      `UPDATE machines SET
        sector_id = COALESCE(?, sector_id),
        line_id = COALESCE(?, line_id),
        name = COALESCE(?, name),
        status = COALESCE(?, status),
        theoretical_capacity_per_hour = COALESCE(?, theoretical_capacity_per_hour),
        active = COALESCE(?, active),
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      sector_id || null,
      line_id !== undefined ? line_id || null : null,
      name ? String(name).trim() : null,
      status || null,
      theoretical_capacity_per_hour !== undefined ? Number(theoretical_capacity_per_hour) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      id
    );
    res.json({ updated: true });
  });

  // Stages
  app.post('/api/admin/stages', requireAuth, requireAdmin, (req, res) => {
    const { sector_id, code, name, description } = req.body || {};
    if (!code || !name) {
      res.status(400).json({ error: 'Código e nome da operação/etapa são obrigatórios.' });
      return;
    }
    const id = `stg-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare('INSERT INTO production_stages (id, sector_id, code, name, description, active) VALUES (?, ?, ?, ?, ?, 1)').run(
        id,
        sector_id || null,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        description || null
      );
      res.status(201).json({ id });
    } catch {
      res.status(409).json({ error: 'Código de operação já existe.' });
    }
  });

  // Cycle Time Standards (preserves history!)
  app.post('/api/admin/cycle-standards', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { product_id, stage_id, machine_id, theoretical_capacity_per_hour, cycle_time_minutes } = req.body || {};
    if (!product_id || !machine_id) {
      res.status(400).json({ error: 'Produto e máquina são obrigatórios.' });
      return;
    }
    let cap = Number(theoretical_capacity_per_hour || 0);
    let cyc = Number(cycle_time_minutes || 0);
    if (cap > 0 && cyc <= 0) cyc = Number((60 / cap).toFixed(6));
    if (cyc > 0 && cap <= 0) cap = Number((60 / cyc).toFixed(4));
    if (cyc <= 0 || cap <= 0) {
      res.status(400).json({ error: 'Informe capacidade teórica por hora ou tempo de ciclo padrão válido (> 0).' });
      return;
    }

    const id = `cyc-${crypto.randomUUID().slice(0, 8)}`;
    const tx = db.transaction(() => {
      const prev = db
        .prepare(
          'SELECT id, cycle_time_minutes, theoretical_capacity_per_hour FROM cycle_time_standards WHERE product_id = ? AND machine_id = ? AND is_current = 1'
        )
        .get(product_id, machine_id) as any;

      if (prev) {
        db.prepare("UPDATE cycle_time_standards SET is_current = 0, effective_to = datetime('now') WHERE id = ?").run(prev.id);
        recordParameterHistory({
          entityType: 'cycle_time_standard',
          entityId: `${product_id}|${machine_id}`,
          fieldName: 'cycle_time_minutes',
          oldValue: `${prev.cycle_time_minutes} min/un (${prev.theoretical_capacity_per_hour}/h)`,
          newValue: `${cyc} min/un (${cap}/h)`,
          changedBy: req.user!.id,
        });
      }

      db.prepare(
        `INSERT INTO cycle_time_standards (id, product_id, stage_id, machine_id, cycle_time_minutes, theoretical_capacity_per_hour, is_current, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(id, String(product_id), stage_id || null, String(machine_id), cyc, cap, req.user!.id);
    });
    tx();

    res.status(201).json({ id });
  });

  // Production Orders
  app.post('/api/admin/orders', requireAuth, requireAdmin, (req, res) => {
    const { order_number, product_id, sector_id, line_id, machine_id, planned_quantity, due_date } = req.body || {};
    if (!order_number || !product_id || !sector_id || !planned_quantity) {
      res.status(400).json({ error: 'Número da OP, produto, setor e quantidade planejada são obrigatórios.' });
      return;
    }
    const id = `po-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare(
        `INSERT INTO production_orders (id, order_number, product_id, sector_id, line_id, machine_id, planned_quantity, status, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`
      ).run(
        id,
        String(order_number).trim().toUpperCase(),
        String(product_id),
        String(sector_id),
        line_id || null,
        machine_id || null,
        Number(planned_quantity),
        due_date || null
      );
      res.status(201).json({ id });
    } catch {
      res.status(409).json({ error: 'Já existe uma Ordem de Produção com este número.' });
    }
  });

  // Products
  app.post('/api/admin/products', requireAuth, requireAdmin, (req, res) => {
    const { sku, name, category, unit_of_measure, target_cycle_minutes } = req.body || {};
    if (!sku || !name || !category) {
      res.status(400).json({ error: 'SKU, nome e categoria do produto são obrigatórios.' });
      return;
    }
    const id = `prod-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare(
        'INSERT INTO products (id, sku, name, category, unit_of_measure, target_cycle_minutes, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
      ).run(
        id,
        String(sku).trim().toUpperCase(),
        String(name).trim(),
        String(category).trim(),
        String(unit_of_measure || 'kg').trim(),
        Number(target_cycle_minutes || 1)
      );
      res.status(201).json({ id });
    } catch {
      res.status(409).json({ error: 'Já existe um produto com este SKU.' });
    }
  });

  app.put('/api/admin/products/:id', requireAuth, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { sku, name, category, unit_of_measure, target_cycle_minutes, active } = req.body || {};
    db.prepare(
      `UPDATE products SET
        sku = COALESCE(?, sku),
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        unit_of_measure = COALESCE(?, unit_of_measure),
        target_cycle_minutes = COALESCE(?, target_cycle_minutes),
        active = COALESCE(?, active)
       WHERE id = ?`
    ).run(
      sku ? String(sku).trim().toUpperCase() : null,
      name ? String(name).trim() : null,
      category ? String(category).trim() : null,
      unit_of_measure ? String(unit_of_measure).trim() : null,
      target_cycle_minutes !== undefined ? Number(target_cycle_minutes) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      id
    );
    res.json({ updated: true });
  });

  // Shifts & Calendars
  app.post('/api/admin/shifts', requireAuth, requireAdmin, (req, res) => {
    const { code, name, start_time, end_time, break_minutes, working_days } = req.body || {};
    if (!code || !name || !start_time || !end_time) {
      res.status(400).json({ error: 'Código, nome e horários de início/fim do turno são obrigatórios.' });
      return;
    }
    const id = `shf-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare(
        'INSERT INTO shifts (id, code, name, start_time, end_time, break_minutes, working_days, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
      ).run(
        id,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        String(start_time),
        String(end_time),
        Number(break_minutes || 0),
        String(working_days || 'Seg,Ter,Qua,Qui,Sex')
      );
      res.status(201).json({ id });
    } catch {
      res.status(409).json({ error: 'Já existe um turno com este código.' });
    }
  });

  app.put('/api/admin/shifts/:id', requireAuth, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { code, name, start_time, end_time, break_minutes, working_days, active } = req.body || {};
    db.prepare(
      `UPDATE shifts SET
        code = COALESCE(?, code),
        name = COALESCE(?, name),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        break_minutes = COALESCE(?, break_minutes),
        working_days = COALESCE(?, working_days),
        active = COALESCE(?, active)
       WHERE id = ?`
    ).run(
      code ? String(code).trim().toUpperCase() : null,
      name ? String(name).trim() : null,
      start_time || null,
      end_time || null,
      break_minutes !== undefined ? Number(break_minutes) : null,
      working_days || null,
      active !== undefined ? (active ? 1 : 0) : null,
      id
    );
    res.json({ updated: true });
  });

  app.post('/api/admin/calendars', requireAuth, requireAdmin, (req, res) => {
    const { calendar_date, sector_id, line_id, machine_id, shift_id, day_type, available_minutes, description } =
      req.body || {};
    if (!calendar_date || !day_type) {
      res.status(400).json({ error: 'Data e tipo do dia são obrigatórios.' });
      return;
    }
    const id = `cal-${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(
      `INSERT INTO production_calendars (id, calendar_date, sector_id, line_id, machine_id, shift_id, day_type, available_minutes, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      String(calendar_date),
      sector_id || null,
      line_id || null,
      machine_id || null,
      shift_id || null,
      day_type,
      Number(available_minutes || 0),
      description || null
    );
    res.status(201).json({ id });
  });

  app.delete('/api/admin/calendars/:id', requireAuth, requireAdmin, (req, res) => {
    db.prepare('DELETE FROM production_calendars WHERE id = ?').run(req.params.id);
    res.json({ deleted: true });
  });

  // Downtime & Loss Reasons
  app.post('/api/admin/downtime-reasons', requireAuth, requireAdmin, (req, res) => {
    const { code, name, category, is_planned, counts_for_availability } = req.body || {};
    if (!code || !name || !category) {
      res.status(400).json({ error: 'Código, nome e categoria do motivo são obrigatórios.' });
      return;
    }
    const id = `dr-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare(
        'INSERT INTO downtime_reasons (id, code, name, category, is_planned, counts_for_availability, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
      ).run(
        id,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        String(category),
        is_planned ? 1 : 0,
        counts_for_availability === false ? 0 : 1
      );
      res.status(201).json({ id });
    } catch {
      res.status(409).json({ error: 'Já existe um motivo com este código.' });
    }
  });

  app.put('/api/admin/downtime-reasons/:id', requireAuth, requireAdmin, (req, res) => {
    const { counts_for_availability, is_planned, active } = req.body || {};
    db.prepare(
      'UPDATE downtime_reasons SET is_planned = COALESCE(?, is_planned), counts_for_availability = COALESCE(?, counts_for_availability), active = COALESCE(?, active) WHERE id = ?'
    ).run(
      is_planned !== undefined ? (is_planned ? 1 : 0) : null,
      counts_for_availability !== undefined ? (counts_for_availability ? 1 : 0) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      req.params.id
    );
    res.json({ updated: true });
  });

  app.post('/api/admin/loss-reasons', requireAuth, requireAdmin, (req, res) => {
    const { code, name, category } = req.body || {};
    if (!code || !name || !category) {
      res.status(400).json({ error: 'Código, nome e categoria são obrigatórios.' });
      return;
    }
    const id = `lr-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare('INSERT INTO loss_reasons (id, code, name, category, active) VALUES (?, ?, ?, ?, 1)').run(
        id,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        String(category)
      );
      res.status(201).json({ id });
    } catch {
      res.status(409).json({ error: 'Código já existente.' });
    }
  });

  // Production Goals & IROG Goals
  app.post('/api/admin/goals', requireAuth, requireAdmin, (req, res) => {
    const { sector_id, line_id, product_id, shift_id, period_type, target_quantity, max_loss_percent } = req.body || {};
    if (!sector_id || !target_quantity) {
      res.status(400).json({ error: 'Setor e quantidade meta são obrigatórios.' });
      return;
    }
    const id = `goal-${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(
      `INSERT INTO production_goals (id, sector_id, line_id, product_id, shift_id, period_type, target_quantity, max_loss_percent, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      id,
      String(sector_id),
      line_id || null,
      product_id || null,
      shift_id || null,
      period_type === 'monthly' ? 'monthly' : 'daily',
      Number(target_quantity),
      Number(max_loss_percent ?? 3.0)
    );
    res.status(201).json({ id });
  });

  app.delete('/api/admin/goals/:id', requireAuth, requireAdmin, (req, res) => {
    db.prepare('DELETE FROM production_goals WHERE id = ?').run(req.params.id);
    res.json({ deleted: true });
  });

  app.post('/api/admin/irog-goals', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const {
      scope_level,
      sector_id,
      line_id,
      machine_id,
      target_irog_percent,
      target_availability_percent,
      target_performance_percent,
      target_quality_percent,
      max_loss_percent,
    } = req.body || {};
    if (!scope_level || !target_irog_percent) {
      res.status(400).json({ error: 'Nível e meta de IROG (%) são obrigatórios.' });
      return;
    }
    const id = `ig-${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(
      `INSERT INTO irog_goals (id, scope_level, sector_id, line_id, machine_id, target_irog_percent, target_availability_percent, target_performance_percent, target_quality_percent, max_loss_percent, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      id,
      scope_level,
      sector_id || null,
      line_id || null,
      machine_id || null,
      Number(target_irog_percent),
      Number(target_availability_percent || 90),
      Number(target_performance_percent || 92),
      Number(target_quality_percent || 98),
      Number(max_loss_percent || 3)
    );
    recordParameterHistory({
      entityType: 'irog_goal',
      entityId: id,
      fieldName: 'target_irog_percent',
      oldValue: null,
      newValue: `${target_irog_percent}% (${scope_level})`,
      changedBy: req.user!.id,
    });
    res.status(201).json({ id });
  });

  app.delete('/api/admin/irog-goals/:id', requireAuth, requireAdmin, (req, res) => {
    db.prepare('UPDATE irog_goals SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ deleted: true });
  });

  // ---------------------------------------------------------------------------
  // DEMO DATA MANAGEMENT
  // ---------------------------------------------------------------------------
  app.delete('/api/admin/demo-data', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const removed = clearDemoProductionData();
    recordAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.full_name,
      action: 'CLEAR_DEMO_DATA',
      entityType: 'production_records',
      details: { removed },
    });
    res.json({ removed });
  });

  app.post('/api/admin/demo-data', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const created = seedDemoProductionData();
    recordAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.full_name,
      action: 'RESTORE_DEMO_DATA',
      entityType: 'production_records',
      details: { created },
    });
    res.json({ created });
  });

  // ---------------------------------------------------------------------------
  // MULTI-ENTITY IMPORT ARCHITECTURE (8 Types + Duplicate Check + Reprocess)
  // ---------------------------------------------------------------------------
  app.get('/api/admin/imports', requireAuth, requireAdmin, (_req, res) => {
    const batches = db
      .prepare(
        `SELECT ib.*, p.full_name as imported_by_name
         FROM import_batches ib
         JOIN profiles p ON p.id = ib.imported_by
         ORDER BY ib.created_at DESC`
      )
      .all();
    const errors = db.prepare('SELECT * FROM import_errors ORDER BY created_at DESC LIMIT 100').all();
    res.json({ batches, errors });
  });

  app.post('/api/admin/imports/validate', requireAuth, requireAdmin, (req, res) => {
    const { rows, entity_type = 'production' } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'Nenhuma linha encontrada no arquivo enviado.' });
      return;
    }

    const shifts = db.prepare('SELECT id, code FROM shifts').all() as any[];
    const operators = db.prepare('SELECT id, username FROM profiles').all() as any[];
    const sectors = db.prepare('SELECT id, code FROM sectors').all() as any[];
    const lines = db.prepare('SELECT id, code, sector_id FROM production_lines').all() as any[];
    const machines = db.prepare('SELECT id, code, sector_id, line_id FROM machines').all() as any[];
    const products = db.prepare('SELECT id, sku, unit_of_measure FROM products').all() as any[];

    const shiftByCode = new Map(shifts.map((s) => [s.code.toUpperCase(), s.id]));
    const opByUser = new Map(operators.map((o) => [o.username.toLowerCase(), o.id]));
    const sectorByCode = new Map(sectors.map((s) => [s.code.toUpperCase(), s.id]));
    const lineByCode = new Map(lines.map((l) => [l.code.toUpperCase(), l]));
    const machineByCode = new Map(machines.map((m) => [m.code.toUpperCase(), m]));
    const prodBySku = new Map(products.map((p) => [p.sku.toUpperCase(), p]));

    const existingDupProd = db.prepare(
      `SELECT id FROM production_records
       WHERE production_date = ? AND shift_id = ? AND operator_id = ? AND line_id = ? AND product_id = ?`
    );

    const seenInBatch = new Set<string>();
    const validatedRows = rows.slice(0, 1000).map((raw: any, index: number) => {
      const messages: string[] = [];
      let status: 'valid' | 'duplicate' | 'error' = 'valid';
      let resolvedIds: Record<string, any> | undefined;

      if (entity_type === 'production') {
        const production_date = String(raw.production_date || raw.data || '').trim();
        const shift_code = String(raw.shift_code || raw.turno || '').trim().toUpperCase();
        const operator_username = String(raw.operator_username || raw.usuario || '').trim().toLowerCase();
        const sector_code = String(raw.sector_code || raw.setor || '').trim().toUpperCase();
        const line_code = String(raw.line_code || raw.linha || '').trim().toUpperCase();
        const machine_code = String(raw.machine_code || raw.maquina || '').trim().toUpperCase();
        const product_sku = String(raw.product_sku || raw.produto || '').trim().toUpperCase();
        const planned_quantity = Number(raw.planned_quantity ?? raw.planejado ?? 0);
        const produced_quantity = Number(raw.produced_quantity ?? raw.produzido ?? 0);
        const approved_quantity = Number(raw.approved_quantity ?? raw.aprovado ?? produced_quantity);
        const loss_quantity = Number(raw.loss_quantity ?? raw.perdas ?? 0);
        const total_downtime_minutes = Number(raw.total_downtime_minutes ?? raw.parada_minutos ?? 0);
        const has_downtime = total_downtime_minutes > 0 || Boolean(raw.has_downtime);
        const downtime_reason = String(raw.downtime_reason || raw.motivo_parada || '').trim();
        const notes = String(raw.notes || raw.observacoes || '').trim();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(production_date)) messages.push('Data inválida (use AAAA-MM-DD)');
        const shift_id = shiftByCode.get(shift_code);
        if (!shift_id) messages.push(`Turno não encontrado (${shift_code || 'vazio'})`);
        const operator_id = opByUser.get(operator_username);
        if (!operator_id) messages.push(`Usuário não encontrado (${operator_username || 'vazio'})`);
        const sector_id = sectorByCode.get(sector_code);
        if (!sector_id) messages.push(`Setor não encontrado (${sector_code || 'vazio'})`);
        const lineObj = lineByCode.get(line_code);
        if (!lineObj) messages.push(`Linha não encontrada (${line_code || 'vazio'})`);
        else if (sector_id && lineObj.sector_id !== sector_id) messages.push(`Linha ${line_code} não pertence ao setor ${sector_code}`);
        const macObj = machine_code ? machineByCode.get(machine_code) : undefined;
        if (machine_code && !macObj) messages.push(`Máquina não encontrada (${machine_code})`);
        const prodObj = prodBySku.get(product_sku);
        if (!prodObj) messages.push(`Produto SKU não encontrado (${product_sku || 'vazio'})`);
        if (!Number.isFinite(planned_quantity) || planned_quantity <= 0) messages.push('Planejado deve ser > 0');
        if (produced_quantity < 0 || approved_quantity < 0 || loss_quantity < 0) messages.push('Quantidades negativas inválidas');
        if (approved_quantity > produced_quantity) messages.push('Aprovado não pode superar produzido');

        status = messages.length > 0 ? 'error' : 'valid';
        if (status === 'valid' && shift_id && operator_id && lineObj && prodObj) {
          const batchKey = `${production_date}|${shift_id}|${operator_id}|${lineObj.id}|${prodObj.id}`;
          const existsInDb = existingDupProd.get(production_date, shift_id, operator_id, lineObj.id, prodObj.id);
          if (existsInDb || seenInBatch.has(batchKey)) {
            status = 'duplicate';
            messages.push('Registro duplicado detectado');
          } else {
            seenInBatch.add(batchKey);
            resolvedIds = {
              shift_id,
              operator_id,
              sector_id,
              line_id: lineObj.id,
              machine_id: macObj?.id || null,
              product_id: prodObj.id,
              unit_of_measure: prodObj.unit_of_measure,
            };
          }
        }

        return {
          rowIndex: index + 1,
          entityType: entity_type,
          raw,
          production_date,
          shift_code,
          operator_username,
          sector_code,
          line_code,
          machine_code,
          product_sku,
          planned_quantity,
          produced_quantity,
          approved_quantity,
          loss_quantity,
          has_downtime,
          total_downtime_minutes,
          downtime_reason,
          notes,
          status,
          messages,
          resolvedIds,
        };
      }

      // Generic validation for catalog & standalone imports (sectors, lines, machines, products, cycle_times, losses, downtimes)
      const code = String(raw.code || raw.sku || raw.sector_code || raw.machine_code || '').trim().toUpperCase();
      const name = String(raw.name || raw.reason || raw.product_sku || '').trim();
      if (entity_type === 'sectors') {
        if (!code || !raw.name) messages.push('Colunas code e name são obrigatórias');
        else if (sectorByCode.has(code)) {
          status = 'duplicate';
          messages.push(`Setor ${code} já cadastrado`);
        }
      } else if (entity_type === 'lines') {
        const secId = sectorByCode.get(String(raw.sector_code || '').trim().toUpperCase());
        if (!code || !raw.name || !secId) messages.push('Informe sector_code válido, code e name');
        else if (lineByCode.has(code)) {
          status = 'duplicate';
          messages.push(`Linha ${code} já cadastrada`);
        } else resolvedIds = { sector_id: secId };
      } else if (entity_type === 'machines') {
        const secId = sectorByCode.get(String(raw.sector_code || '').trim().toUpperCase());
        const linObj = raw.line_code ? lineByCode.get(String(raw.line_code).trim().toUpperCase()) : null;
        if (!code || !raw.name || !secId) messages.push('Informe sector_code válido, code e name');
        else if (machineByCode.has(code)) {
          status = 'duplicate';
          messages.push(`Máquina ${code} já cadastrada`);
        } else resolvedIds = { sector_id: secId, line_id: linObj?.id || null };
      } else if (entity_type === 'products') {
        const sku = String(raw.sku || '').trim().toUpperCase();
        if (!sku || !raw.name) messages.push('Informe sku e name');
        else if (prodBySku.has(sku)) {
          status = 'duplicate';
          messages.push(`Produto SKU ${sku} já cadastrado`);
        }
      } else if (entity_type === 'cycle_times') {
        const prodObj = prodBySku.get(String(raw.product_sku || '').trim().toUpperCase());
        const macObj = machineByCode.get(String(raw.machine_code || '').trim().toUpperCase());
        const cap = Number(raw.theoretical_capacity_per_hour || 0);
        if (!prodObj || !macObj || cap <= 0) messages.push('Informe product_sku, machine_code e theoretical_capacity_per_hour > 0');
        else resolvedIds = { product_id: prodObj.id, machine_id: macObj.id };
      } else if (entity_type === 'losses') {
        const prodObj = prodBySku.get(String(raw.product_sku || '').trim().toUpperCase());
        const secId = sectorByCode.get(String(raw.sector_code || '').trim().toUpperCase());
        const shiftId = shiftByCode.get(String(raw.shift_code || '').trim().toUpperCase());
        const qty = Number(raw.quantity || 0);
        if (!raw.loss_date || !prodObj || !secId || !shiftId || qty <= 0)
          messages.push('Informe loss_date, shift_code, sector_code, product_sku e quantity > 0');
        else resolvedIds = { product_id: prodObj.id, sector_id: secId, shift_id: shiftId, unit_of_measure: prodObj.unit_of_measure };
      } else if (entity_type === 'downtimes') {
        const macObj = machineByCode.get(String(raw.machine_code || '').trim().toUpperCase());
        const shiftId = shiftByCode.get(String(raw.shift_code || '').trim().toUpperCase());
        const dur = Number(raw.duration_minutes || 0);
        if (!macObj || !shiftId || dur <= 0 || !raw.reason)
          messages.push('Informe machine_code, shift_code, reason e duration_minutes > 0');
        else resolvedIds = { machine_id: macObj.id, sector_id: macObj.sector_id, line_id: macObj.line_id, shift_id: shiftId };
      }

      if (messages.length > 0 && status === 'valid') status = 'error';

      return {
        rowIndex: index + 1,
        entityType: entity_type,
        raw,
        production_date: String(raw.loss_date || raw.production_date || ''),
        shift_code: String(raw.shift_code || ''),
        operator_username: String(raw.operator_username || ''),
        sector_code: String(raw.sector_code || ''),
        line_code: String(raw.line_code || ''),
        machine_code: String(raw.machine_code || ''),
        product_sku: String(raw.product_sku || raw.sku || code),
        planned_quantity: Number(raw.planned_quantity || raw.theoretical_capacity_per_hour || 0),
        produced_quantity: Number(raw.produced_quantity || raw.quantity || raw.duration_minutes || 0),
        approved_quantity: 0,
        loss_quantity: Number(raw.quantity || 0),
        has_downtime: entity_type === 'downtimes',
        total_downtime_minutes: Number(raw.duration_minutes || 0),
        downtime_reason: String(raw.reason || ''),
        notes: name || String(raw.notes || ''),
        status,
        messages,
        resolvedIds,
      };
    });

    res.json({ rows: validatedRows });
  });

  app.post('/api/admin/imports/commit', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { filename, source_type, entity_type = 'production', rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'Nenhum dado para importação.' });
      return;
    }

    const validRows = rows.filter((r: any) => r.status === 'valid');
    const duplicateCount = rows.filter((r: any) => r.status === 'duplicate').length;
    const errorRows = rows.filter((r: any) => r.status === 'error');
    const batchId = `imp-${crypto.randomUUID().slice(0, 10)}`;

    const tx = db.transaction(() => {
      for (const r of validRows) {
        const raw = r.raw || {};
        if (entity_type === 'production' && r.resolvedIds) {
          const recId = `rec-imp-${crypto.randomUUID().slice(0, 10)}`;
          db.prepare(
            `INSERT INTO production_records (
              id, production_date, shift_id, operator_id, sector_id, line_id, machine_id, product_id,
              planned_quantity, produced_quantity, approved_quantity, loss_quantity, unit_of_measure,
              planned_time_minutes, has_downtime, total_downtime_minutes, notes, additional_notes, is_demo, source_origin, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 450, ?, ?, ?, ?, 0, 'import', ?)`
          ).run(
            recId,
            r.production_date,
            r.resolvedIds.shift_id,
            r.resolvedIds.operator_id,
            r.resolvedIds.sector_id,
            r.resolvedIds.line_id,
            r.resolvedIds.machine_id || null,
            r.resolvedIds.product_id,
            Number(r.planned_quantity),
            Number(r.produced_quantity),
            Number(r.approved_quantity),
            Number(r.loss_quantity),
            r.resolvedIds.unit_of_measure,
            r.has_downtime ? 1 : 0,
            Math.round(Number(r.total_downtime_minutes || 0)),
            r.notes || `Importado via ${filename || 'planilha'}`,
            `Lote: ${batchId}`,
            req.user!.id
          );
        } else if (entity_type === 'sectors') {
          db.prepare('INSERT INTO sectors (id, code, name, description, active) VALUES (?, ?, ?, ?, 1)').run(
            `sec-${crypto.randomUUID().slice(0, 8)}`,
            String(raw.code).trim().toUpperCase(),
            String(raw.name).trim(),
            raw.description || null
          );
        } else if (entity_type === 'lines' && r.resolvedIds) {
          db.prepare('INSERT INTO production_lines (id, sector_id, code, name, capacity_per_hour, active) VALUES (?, ?, ?, ?, ?, 1)').run(
            `lin-${crypto.randomUUID().slice(0, 8)}`,
            r.resolvedIds.sector_id,
            String(raw.code).trim().toUpperCase(),
            String(raw.name).trim(),
            Number(raw.capacity_per_hour || 0)
          );
        } else if (entity_type === 'machines' && r.resolvedIds) {
          db.prepare(
            'INSERT INTO machines (id, sector_id, line_id, code, name, resource_type, theoretical_capacity_per_hour, capacity_unit, status, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'operating\', 1)'
          ).run(
            `mac-${crypto.randomUUID().slice(0, 8)}`,
            r.resolvedIds.sector_id,
            r.resolvedIds.line_id || null,
            String(raw.code).trim().toUpperCase(),
            String(raw.name).trim(),
            String(raw.resource_type || 'Máquina'),
            raw.theoretical_capacity_per_hour ? Number(raw.theoretical_capacity_per_hour) : null,
            String(raw.capacity_unit || 'kg')
          );
        } else if (entity_type === 'products') {
          db.prepare(
            'INSERT INTO products (id, sku, name, category, unit_of_measure, target_cycle_minutes, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
          ).run(
            `prod-${crypto.randomUUID().slice(0, 8)}`,
            String(raw.sku).trim().toUpperCase(),
            String(raw.name).trim(),
            String(raw.category || 'Geral'),
            String(raw.unit_of_measure || 'kg'),
            Number(raw.target_cycle_minutes || 1)
          );
        } else if (entity_type === 'cycle_times' && r.resolvedIds) {
          const cap = Number(raw.theoretical_capacity_per_hour);
          const cyc = Number((60 / cap).toFixed(6));
          db.prepare('UPDATE cycle_time_standards SET is_current = 0 WHERE product_id = ? AND machine_id = ? AND is_current = 1').run(
            r.resolvedIds.product_id,
            r.resolvedIds.machine_id
          );
          db.prepare(
            'INSERT INTO cycle_time_standards (id, product_id, machine_id, cycle_time_minutes, theoretical_capacity_per_hour, is_current, created_by) VALUES (?, ?, ?, ?, ?, 1, ?)'
          ).run(`cyc-${crypto.randomUUID().slice(0, 8)}`, r.resolvedIds.product_id, r.resolvedIds.machine_id, cyc, cap, req.user!.id);
        } else if (entity_type === 'losses' && r.resolvedIds) {
          db.prepare(
            `INSERT INTO loss_records (id, loss_date, shift_id, sector_id, product_id, category, reason_name, quantity, unit_of_measure, notes, is_demo, recorded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
          ).run(
            `ls-${crypto.randomUUID().slice(0, 8)}`,
            String(raw.loss_date),
            r.resolvedIds.shift_id,
            r.resolvedIds.sector_id,
            r.resolvedIds.product_id,
            String(raw.category || 'Refugo'),
            String(raw.reason_name || 'Perda importada'),
            Number(raw.quantity),
            r.resolvedIds.unit_of_measure,
            raw.notes || null,
            req.user!.id
          );
        } else if (entity_type === 'downtimes' && r.resolvedIds) {
          db.prepare(
            `INSERT INTO downtime_records (id, machine_id, sector_id, line_id, shift_id, reason, category, is_planned, counts_for_availability, duration_minutes, description, status, recorded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 'closed', ?)`
          ).run(
            `dt-${crypto.randomUUID().slice(0, 8)}`,
            r.resolvedIds.machine_id,
            r.resolvedIds.sector_id,
            r.resolvedIds.line_id,
            r.resolvedIds.shift_id,
            String(raw.reason),
            String(raw.category || 'Outros'),
            Math.round(Number(raw.duration_minutes)),
            raw.description || null,
            req.user!.id
          );
        }
      }

      db.prepare(
        `INSERT INTO import_batches (
          id, source_type, entity_type, filename, total_rows, imported_rows, duplicate_rows, error_rows, status, validation_summary, imported_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        batchId,
        source_type === 'csv' || source_type === 'iniflex_api' ? source_type : 'excel',
        String(entity_type),
        String(filename || 'importacao.xlsx'),
        rows.length,
        validRows.length,
        duplicateCount,
        errorRows.length,
        validRows.length > 0 ? 'completed' : 'validated',
        JSON.stringify({ imported: validRows.length, duplicates: duplicateCount, errors: errorRows.length }),
        req.user!.id
      );

      for (const er of errorRows) {
        db.prepare(
          'INSERT INTO import_errors (id, batch_id, row_number, raw_payload, error_message) VALUES (?, ?, ?, ?, ?)'
        ).run(`ie-${crypto.randomUUID().slice(0, 8)}`, batchId, er.rowIndex, JSON.stringify(er.raw || er), er.messages.join('; '));
      }
    });

    tx();
    recordAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.full_name,
      action: 'COMMIT_IMPORT',
      entityType: 'import_batches',
      entityId: batchId,
      details: { entity_type, imported: validRows.length, duplicates: duplicateCount, errors: errorRows.length },
    });

    res.status(201).json({
      batchId,
      imported: validRows.length,
      duplicates: duplicateCount,
      errors: errorRows.length,
    });
  });

  // ---------------------------------------------------------------------------
  // PROJEDATA / INIFLEX INTEGRATION LAYER (Read-only & strictly non-simulated)
  // ---------------------------------------------------------------------------
  app.get('/api/admin/integrations/projedata', requireAuth, requireAdmin, (_req, res) => {
    const settings = db
      .prepare("SELECT * FROM integration_settings WHERE provider = 'projedata_iniflex'")
      .get() as any;
    const logs = db
      .prepare(
        `SELECT il.*, p.full_name as created_by_name
         FROM integration_logs il
         LEFT JOIN profiles p ON p.id = il.created_by
         ORDER BY il.created_at DESC LIMIT 50`
      )
      .all();

    res.json({
      settings: settings
        ? {
            ...settings,
            read_only: Boolean(settings.read_only),
            enabled_interfaces: parseJsonArray(settings.enabled_interfaces),
          }
        : null,
      logs,
      hasBackendTokenConfigured: Boolean(process.env.PROJEDATA_API_TOKEN),
    });
  });

  app.put('/api/admin/integrations/projedata', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { status, api_base_url, enabled_interfaces } = req.body || {};
    const validStatuses = [
      'not_configured',
      'awaiting_credentials',
      'awaiting_network',
      'configured',
      'connected',
      'connection_error',
    ];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: 'Status de integração inválido.' });
      return;
    }

    if (api_base_url) {
      try {
        const parsed = new URL(String(api_base_url));
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          res.status(400).json({ error: 'URL da API deve utilizar http ou https.' });
          return;
        }
      } catch {
        res.status(400).json({ error: 'URL base da API Projedata inválida.' });
        return;
      }
    }

    db.prepare(
      `UPDATE integration_settings SET
        status = COALESCE(?, status),
        api_base_url = ?,
        enabled_interfaces = COALESCE(?, enabled_interfaces),
        updated_by = ?,
        updated_at = datetime('now')
       WHERE provider = 'projedata_iniflex'`
    ).run(
      status || null,
      api_base_url !== undefined ? (api_base_url ? String(api_base_url).trim() : null) : null,
      Array.isArray(enabled_interfaces) ? JSON.stringify(enabled_interfaces) : null,
      req.user!.id
    );

    db.prepare(
      `INSERT INTO integration_logs (id, provider, interface_name, status, message, created_by)
       VALUES (?, 'projedata_iniflex', 'CONFIG', ?, ?, ?)`
    ).run(
      `il-${crypto.randomUUID().slice(0, 8)}`,
      status || 'updated',
      'Configuração estrutural atualizada pelo administrador (somente leitura; sem conexão Oracle direta).',
      req.user!.id
    );

    res.json({ updated: true });
  });

  // ---------------------------------------------------------------------------
  // VITE MIDDLEWARE (DEV) OR STATIC ASSETS (PROD)
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build não encontrado.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`novo.forteflex server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
