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
} from './server/db.ts';

dotenv.config();

initDatabase();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'novo-forteflex-dev-jwt-secret-key-2026';

interface JwtUserPayload {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'operator';
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    full_name: string;
    role: 'admin' | 'operator';
    sector_id: string | null;
    is_active: boolean;
    permissions: {
      can_create_records: boolean;
      can_edit_own_records: boolean;
      can_view_own_records: boolean;
      can_view_sector_records: boolean;
      can_export_own_records: boolean;
    };
  };
}

function sanitizeUserRow(row: any) {
  let permissions = {
    can_create_records: true,
    can_edit_own_records: true,
    can_view_own_records: true,
    can_view_sector_records: false,
    can_export_own_records: false,
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
    role: row.role as 'admin' | 'operator',
    sector_id: row.sector_id ?? null,
    sector_name: row.sector_name ?? null,
    is_active: Boolean(row.is_active),
    permissions,
    created_at: row.created_at,
  };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sessão não autenticada. Faça login para continuar.' });
    return;
  }

  const token = authHeader.slice(7).trim();
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

function buildRecordFilterWhere(query: Record<string, any>, alias = 'pr') {
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
  if (query.productId) {
    clauses.push(`${alias}.product_id = ?`);
    params.push(String(query.productId));
  }
  if (query.operatorId) {
    clauses.push(`${alias}.operator_id = ?`);
    params.push(String(query.operatorId));
  }
  if (query.includeDemo === 'false' || query.includeDemo === false) {
    clauses.push(`${alias}.is_demo = 0`);
  }

  return { clauses, params };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: 'novo.forteflex',
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
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, user });
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
      .prepare('SELECT id, username, email, full_name, is_active FROM profiles WHERE lower(username) = ? OR lower(email) = ?')
      .get(cleanIdentifier, cleanIdentifier) as any;

    if (!row) {
      res.json({
        accepted: true,
        message:
          'Se o usuário ou e-mail estiver cadastrado na plataforma, a solicitação de redefinição foi registrada para atendimento pelo administrador ou envio via Supabase Auth em produção.',
      });
      return;
    }

    res.json({
      accepted: true,
      message: `Solicitação registrada para ${row.full_name} (${row.username}). Em ambiente corporativo local, o administrador pode definir uma nova senha imediatamente em Gestão de Usuários.`,
    });
  });

  // ---------------------------------------------------------------------------
  // CATALOG ROUTE (Authenticated users)
  // ---------------------------------------------------------------------------
  app.get('/api/catalog', requireAuth, (req: AuthenticatedRequest, res) => {
    const isAdmin = req.user?.role === 'admin';
    const sectors = db
      .prepare(`SELECT * FROM sectors ${isAdmin ? '' : 'WHERE active = 1'} ORDER BY name`)
      .all()
      .map((s: any) => ({ ...s, active: Boolean(s.active) }));

    const lines = db
      .prepare(
        `SELECT pl.*, s.name as sector_name
         FROM production_lines pl
         JOIN sectors s ON s.id = pl.sector_id
         ${isAdmin ? '' : 'WHERE pl.active = 1 AND s.active = 1'}
         ORDER BY pl.code`
      )
      .all()
      .map((l: any) => ({ ...l, active: Boolean(l.active) }));

    const products = db
      .prepare(`SELECT * FROM products ${isAdmin ? '' : 'WHERE active = 1'} ORDER BY name`)
      .all()
      .map((p: any) => ({ ...p, active: Boolean(p.active) }));

    const shifts = db
      .prepare(`SELECT * FROM shifts ${isAdmin ? '' : 'WHERE active = 1'} ORDER BY code`)
      .all()
      .map((sh: any) => ({ ...sh, active: Boolean(sh.active) }));

    const goals = db
      .prepare(
        `SELECT pg.*, s.name as sector_name, pl.name as line_name, pr.name as product_name, sh.name as shift_name
         FROM production_goals pg
         JOIN sectors s ON s.id = pg.sector_id
         LEFT JOIN production_lines pl ON pl.id = pg.line_id
         LEFT JOIN products pr ON pr.id = pg.product_id
         LEFT JOIN shifts sh ON sh.id = pg.shift_id
         ${isAdmin ? '' : 'WHERE pg.active = 1'}
         ORDER BY pg.created_at DESC`
      )
      .all()
      .map((g: any) => ({ ...g, active: Boolean(g.active) }));

    const operators = isAdmin
      ? db
          .prepare('SELECT id, full_name, username, role, sector_id, is_active FROM profiles ORDER BY full_name')
          .all()
          .map((u: any) => ({ ...u, is_active: Boolean(u.is_active) }))
      : [
          {
            id: req.user!.id,
            full_name: req.user!.full_name,
            username: req.user!.username,
            role: req.user!.role,
            sector_id: req.user!.sector_id,
            is_active: req.user!.is_active,
          },
        ];

    res.json({ sectors, lines, products, shifts, goals, operators });
  });

  // ---------------------------------------------------------------------------
  // PRODUCTION RECORDS ROUTES
  // ---------------------------------------------------------------------------
  app.get('/api/production-records', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { clauses, params } = buildRecordFilterWhere(req.query as Record<string, any>, 'pr');

    if (user.role !== 'admin') {
      if (!user.permissions.can_view_own_records && !user.permissions.can_view_sector_records) {
        res.status(403).json({ error: 'Seu perfil não possui permissão para consultar registros.' });
        return;
      }
      if (user.permissions.can_view_sector_records && user.sector_id) {
        clauses.push('(pr.operator_id = ? OR pr.sector_id = ?)');
        params.push(user.id, user.sector_id);
      } else {
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
      product_id,
      planned_quantity,
      produced_quantity,
      approved_quantity,
      loss_quantity,
      unit_of_measure,
      has_downtime,
      total_downtime_minutes,
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

    const targetOperatorId = user.role === 'admin' && operator_id ? String(operator_id) : user.id;
    const product = db.prepare('SELECT id, unit_of_measure FROM products WHERE id = ?').get(product_id) as any;
    if (!product) {
      res.status(400).json({ error: 'Produto selecionado inválido.' });
      return;
    }

    const recordId = `rec-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO production_records (
          id, production_date, shift_id, operator_id, sector_id, line_id, product_id,
          planned_quantity, produced_quantity, approved_quantity, loss_quantity, unit_of_measure,
          has_downtime, total_downtime_minutes, notes, additional_notes, is_demo, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).run(
        recordId,
        String(production_date),
        String(shift_id),
        targetOperatorId,
        String(sector_id),
        String(line_id),
        String(product_id),
        planned,
        produced,
        approved,
        loss,
        String(unit_of_measure || product.unit_of_measure || 'kg'),
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
          `INSERT INTO downtime_records (id, production_record_id, reason, duration_minutes, description)
           VALUES (?, ?, ?, ?, ?)`
        ).run(
          `dt-${crypto.randomUUID()}`,
          recordId,
          String(downtime_reason).trim(),
          Math.round(downtimeMin),
          downtime_description ? String(downtime_description).trim() : null
        );
      }
    });

    tx();

    const created = db
      .prepare(
        `SELECT
          pr.*,
          sh.name as shift_name,
          op.full_name as operator_name,
          sec.name as sector_name,
          ln.name as line_name,
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
    const hasDowntime = body.has_downtime !== undefined ? Boolean(body.has_downtime) : Boolean(existing.has_downtime);
    const downtimeMin = hasDowntime ? Number(body.total_downtime_minutes ?? existing.total_downtime_minutes) : 0;

    if (planned <= 0 || produced < 0 || approved < 0 || loss < 0 || approved > produced) {
      res.status(400).json({ error: 'Valores numéricos inválidos para o registro.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE production_records SET
          production_date = ?,
          shift_id = ?,
          operator_id = ?,
          sector_id = ?,
          line_id = ?,
          product_id = ?,
          planned_quantity = ?,
          produced_quantity = ?,
          approved_quantity = ?,
          loss_quantity = ?,
          unit_of_measure = ?,
          has_downtime = ?,
          total_downtime_minutes = ?,
          notes = ?,
          additional_notes = ?,
          updated_at = ?
         WHERE id = ?`
      ).run(
        String(body.production_date ?? existing.production_date),
        String(body.shift_id ?? existing.shift_id),
        user.role === 'admin' && body.operator_id ? String(body.operator_id) : existing.operator_id,
        String(body.sector_id ?? existing.sector_id),
        String(body.line_id ?? existing.line_id),
        String(body.product_id ?? existing.product_id),
        planned,
        produced,
        approved,
        loss,
        String(body.unit_of_measure ?? existing.unit_of_measure),
        hasDowntime ? 1 : 0,
        Math.round(downtimeMin),
        body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes,
        body.additional_notes !== undefined
          ? body.additional_notes
            ? String(body.additional_notes).trim()
            : null
          : existing.additional_notes,
        nowIso,
        id
      );

      db.prepare('DELETE FROM downtime_records WHERE production_record_id = ?').run(id);
      if (hasDowntime && downtimeMin > 0) {
        db.prepare(
          `INSERT INTO downtime_records (id, production_record_id, reason, duration_minutes, description)
           VALUES (?, ?, ?, ?, ?)`
        ).run(
          `dt-${crypto.randomUUID()}`,
          id,
          String(body.downtime_reason || 'Parada operacional').trim(),
          Math.round(downtimeMin),
          body.downtime_description ? String(body.downtime_description).trim() : null
        );
      }
    });

    tx();
    res.json({ updated: true, id });
  });

  app.delete('/api/production-records/:id', requireAuth, requireAdmin, (req, res) => {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM production_records WHERE id = ?').run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Registro não encontrado.' });
      return;
    }
    res.json({ deleted: true });
  });

  // ---------------------------------------------------------------------------
  // MANAGERIAL DASHBOARD ANALYTICS (Admin Only, 100% computed from DB)
  // ---------------------------------------------------------------------------
  app.get('/api/dashboard/summary', requireAuth, requireAdmin, (req, res) => {
    const query = req.query as Record<string, any>;
    const { clauses, params } = buildRecordFilterWhere(query, 'pr');
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

    // Day & month totals also respect entity filters (sector/line/product/shift/operator/demo)
    const entityFilter = buildRecordFilterWhere(
      {
        shiftId: query.shiftId,
        sectorId: query.sectorId,
        lineId: query.lineId,
        productId: query.productId,
        operatorId: query.operatorId,
        includeDemo: query.includeDemo,
      },
      'pr'
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

      // Daily
      const dEntry = dailyMap.get(r.production_date) || { planned: 0, realized: 0, approved: 0, losses: 0 };
      dEntry.planned += r.planned_quantity;
      dEntry.realized += r.produced_quantity;
      dEntry.approved += r.approved_quantity;
      dEntry.losses += r.loss_quantity;
      dailyMap.set(r.production_date, dEntry);

      // Shift
      const sEntry = shiftMap.get(r.shift_name) || { planned: 0, realized: 0, losses: 0 };
      sEntry.planned += r.planned_quantity;
      sEntry.realized += r.produced_quantity;
      sEntry.losses += r.loss_quantity;
      shiftMap.set(r.shift_name, sEntry);

      // Sector
      const secEntry = sectorMap.get(r.sector_name) || { planned: 0, realized: 0, losses: 0 };
      secEntry.planned += r.planned_quantity;
      secEntry.realized += r.produced_quantity;
      secEntry.losses += r.loss_quantity;
      sectorMap.set(r.sector_name, secEntry);

      // Employee
      const empEntry = employeeMap.get(r.operator_name) || { realized: 0, approved: 0, losses: 0 };
      empEntry.realized += r.produced_quantity;
      empEntry.approved += r.approved_quantity;
      empEntry.losses += r.loss_quantity;
      employeeMap.set(r.operator_name, empEntry);

      // Product
      const prodEntry = productMap.get(r.product_name) || { planned: 0, realized: 0 };
      prodEntry.planned += r.planned_quantity;
      prodEntry.realized += r.produced_quantity;
      productMap.set(r.product_name, prodEntry);

      // Downtime reasons
      if (r.has_downtime && r.total_downtime_minutes > 0) {
        const reason = r.downtime_reason || 'Motivo não especificado';
        const dtEntry = downtimeReasonMap.get(reason) || { minutes: 0, occurrences: 0 };
        dtEntry.minutes += r.total_downtime_minutes;
        dtEntry.occurrences += 1;
        downtimeReasonMap.set(reason, dtEntry);
      }
    }

    const goalAttainmentPercent = plannedTotal > 0 ? (realizedTotal / plannedTotal) * 100 : 0;
    const lossPercent = realizedTotal > 0 ? (lossesTotal / realizedTotal) * 100 : 0;

    // Coherent Productive Efficiency (OEE-aligned formula):
    // Availability = (Total Shift Minutes (480 * count) - Downtime Minutes) / (480 * count)
    // Quality = Approved / Realized
    // Performance = min(1.0, Realized / Planned)
    let productiveEfficiencyPercent = 0;
    if (rows.length > 0 && plannedTotal > 0 && realizedTotal > 0) {
      const scheduledMinutes = rows.length * 480;
      const availability = Math.max(0, (scheduledMinutes - totalDowntimeMinutes) / scheduledMinutes);
      const quality = Math.min(1, approvedTotal / realizedTotal);
      const performance = Math.min(1.15, realizedTotal / plannedTotal);
      productiveEfficiencyPercent = Math.min(100, availability * quality * performance * 100);
    }

    const dailyProduction = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        planned: Math.round(v.planned),
        realized: Math.round(v.realized),
        approved: Math.round(v.approved),
      }));

    const lossEvolution = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        losses: Math.round(v.losses),
        lossPercent: v.realized > 0 ? Number(((v.losses / v.realized) * 100).toFixed(2)) : 0,
      }));

    const byShift = Array.from(shiftMap.entries()).map(([name, v]) => ({
      name,
      planned: Math.round(v.planned),
      realized: Math.round(v.realized),
      losses: Math.round(v.losses),
    }));

    const bySector = Array.from(sectorMap.entries()).map(([name, v]) => ({
      name,
      planned: Math.round(v.planned),
      realized: Math.round(v.realized),
      losses: Math.round(v.losses),
    }));

    const byEmployee = Array.from(employeeMap.entries()).map(([name, v]) => ({
      name,
      realized: Math.round(v.realized),
      approved: Math.round(v.approved),
      losses: Math.round(v.losses),
    }));

    const byProduct = Array.from(productMap.entries()).map(([name, v]) => ({
      name,
      planned: Math.round(v.planned),
      realized: Math.round(v.realized),
    }));

    const plannedVsActual = bySector.map((s) => ({
      label: s.name,
      planned: s.planned,
      realized: s.realized,
    }));

    const downtimeReasons = Array.from(downtimeReasonMap.entries())
      .map(([reason, v]) => ({
        reason,
        minutes: v.minutes,
        occurrences: v.occurrences,
      }))
      .sort((a, b) => b.minutes - a.minutes);

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
        productiveEfficiencyPercent: Number(productiveEfficiencyPercent.toFixed(1)),
        recordsCount: rows.length,
        demoRecordsCount,
      },
      charts: {
        dailyProduction,
        byShift,
        bySector,
        byEmployee,
        byProduct,
        plannedVsActual,
        lossEvolution,
        downtimeReasons,
      },
    });
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

  app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
    const { username, email, full_name, password, role, sector_id, permissions } = req.body || {};
    if (!username || !email || !full_name || !password || !role) {
      res.status(400).json({ error: 'Preencha usuário, e-mail, nome completo, perfil e senha.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'A senha deve possuir no mínimo 6 caracteres.' });
      return;
    }
    if (role !== 'admin' && role !== 'operator') {
      res.status(400).json({ error: 'Perfil de usuário inválido.' });
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
      can_create_records: true,
      can_edit_own_records: true,
      can_view_own_records: true,
      can_view_sector_records: role === 'admin',
      can_export_own_records: role === 'admin',
      ...(permissions || {}),
    };

    db.prepare(
      `INSERT INTO profiles (id, username, email, password_hash, full_name, role, sector_id, is_active, permissions)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      cleanUsername,
      cleanEmail,
      hash,
      String(full_name).trim(),
      role,
      sector_id || null,
      JSON.stringify(defaultPermissions)
    );

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

    const { full_name, email, username, role, sector_id, is_active, permissions, password } = req.body || {};

    if (id === req.user!.id && is_active === false) {
      res.status(400).json({ error: 'Você não pode bloquear o próprio usuário administrador conectado.' });
      return;
    }

    const nextRole = role === 'admin' || role === 'operator' ? role : existing.role;
    const nextPasswordHash =
      password && String(password).trim().length >= 6 ? bcrypt.hashSync(String(password), 10) : existing.password_hash;

    const currentPerms = sanitizeUserRow(existing).permissions;
    const nextPerms = permissions ? { ...currentPerms, ...permissions } : currentPerms;

    db.prepare(
      `UPDATE profiles SET
        full_name = ?,
        email = ?,
        username = ?,
        role = ?,
        sector_id = ?,
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
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      JSON.stringify(nextPerms),
      nextPasswordHash,
      id
    );

    const updated = db
      .prepare('SELECT p.*, s.name as sector_name FROM profiles p LEFT JOIN sectors s ON s.id = p.sector_id WHERE p.id = ?')
      .get(id);
    res.json({ user: sanitizeUserRow(updated) });
  });

  // ---------------------------------------------------------------------------
  // ADMIN INDUSTRIAL CATALOG CRUD (Sectors, Lines, Products, Shifts, Goals)
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
    db.prepare('UPDATE sectors SET code = COALESCE(?, code), name = COALESCE(?, name), description = ?, active = COALESCE(?, active) WHERE id = ?').run(
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

  app.post('/api/admin/shifts', requireAuth, requireAdmin, (req, res) => {
    const { code, name, start_time, end_time } = req.body || {};
    if (!code || !name || !start_time || !end_time) {
      res.status(400).json({ error: 'Código, nome e horários de início/fim do turno são obrigatórios.' });
      return;
    }
    const id = `shf-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare('INSERT INTO shifts (id, code, name, start_time, end_time, active) VALUES (?, ?, ?, ?, ?, 1)').run(
        id,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        String(start_time),
        String(end_time)
      );
      res.status(201).json({ id });
    } catch {
      res.status(409).json({ error: 'Já existe um turno com este código.' });
    }
  });

  app.put('/api/admin/shifts/:id', requireAuth, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { code, name, start_time, end_time, active } = req.body || {};
    db.prepare(
      `UPDATE shifts SET
        code = COALESCE(?, code),
        name = COALESCE(?, name),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        active = COALESCE(?, active)
       WHERE id = ?`
    ).run(
      code ? String(code).trim().toUpperCase() : null,
      name ? String(name).trim() : null,
      start_time || null,
      end_time || null,
      active !== undefined ? (active ? 1 : 0) : null,
      id
    );
    res.json({ updated: true });
  });

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

  // ---------------------------------------------------------------------------
  // DEMO DATA MANAGEMENT (Clear / Restore demonstration records cleanly)
  // ---------------------------------------------------------------------------
  app.delete('/api/admin/demo-data', requireAuth, requireAdmin, (_req, res) => {
    const removed = clearDemoProductionData();
    res.json({ removed });
  });

  app.post('/api/admin/demo-data', requireAuth, requireAdmin, (_req, res) => {
    const created = seedDemoProductionData();
    res.json({ created });
  });

  // ---------------------------------------------------------------------------
  // IMPORT ARCHITECTURE (Excel, CSV & Future ERP Iniflex Preparation)
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
    res.json({ batches });
  });

  app.post('/api/admin/imports/validate', requireAuth, requireAdmin, (req, res) => {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'Nenhuma linha encontrada no arquivo enviado.' });
      return;
    }

    const shifts = db.prepare('SELECT id, code FROM shifts').all() as any[];
    const operators = db.prepare('SELECT id, username FROM profiles').all() as any[];
    const sectors = db.prepare('SELECT id, code FROM sectors').all() as any[];
    const lines = db.prepare('SELECT id, code, sector_id FROM production_lines').all() as any[];
    const products = db.prepare('SELECT id, sku, unit_of_measure FROM products').all() as any[];

    const shiftByCode = new Map(shifts.map((s) => [s.code.toUpperCase(), s.id]));
    const opByUser = new Map(operators.map((o) => [o.username.toLowerCase(), o.id]));
    const sectorByCode = new Map(sectors.map((s) => [s.code.toUpperCase(), s.id]));
    const lineByCode = new Map(lines.map((l) => [l.code.toUpperCase(), l]));
    const prodBySku = new Map(products.map((p) => [p.sku.toUpperCase(), p]));

    const existingDupCheck = db.prepare(
      `SELECT id FROM production_records
       WHERE production_date = ? AND shift_id = ? AND operator_id = ? AND line_id = ? AND product_id = ?`
    );

    const seenInBatch = new Set<string>();
    const validatedRows = rows.map((raw: any, index: number) => {
      const messages: string[] = [];
      const production_date = String(raw.production_date || raw.data || '').trim();
      const shift_code = String(raw.shift_code || raw.turno || '').trim().toUpperCase();
      const operator_username = String(raw.operator_username || raw.usuario || '').trim().toLowerCase();
      const sector_code = String(raw.sector_code || raw.setor || '').trim().toUpperCase();
      const line_code = String(raw.line_code || raw.linha || '').trim().toUpperCase();
      const product_sku = String(raw.product_sku || raw.produto || '').trim().toUpperCase();
      const planned_quantity = Number(raw.planned_quantity ?? raw.planejado ?? 0);
      const produced_quantity = Number(raw.produced_quantity ?? raw.produzido ?? 0);
      const approved_quantity = Number(raw.approved_quantity ?? raw.aprovado ?? produced_quantity);
      const loss_quantity = Number(raw.loss_quantity ?? raw.perdas ?? 0);
      const total_downtime_minutes = Number(raw.total_downtime_minutes ?? raw.parada_minutos ?? 0);
      const has_downtime = total_downtime_minutes > 0 || Boolean(raw.has_downtime);
      const downtime_reason = String(raw.downtime_reason || raw.motivo_parada || '').trim();
      const notes = String(raw.notes || raw.observacoes || '').trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(production_date)) {
        messages.push('Data inválida (use AAAA-MM-DD)');
      }

      const shift_id = shiftByCode.get(shift_code);
      if (!shift_id) messages.push(`Turno não encontrado (${shift_code || 'vazio'})`);

      const operator_id = opByUser.get(operator_username);
      if (!operator_id) messages.push(`Usuário não encontrado (${operator_username || 'vazio'})`);

      const sector_id = sectorByCode.get(sector_code);
      if (!sector_id) messages.push(`Setor não encontrado (${sector_code || 'vazio'})`);

      const lineObj = lineByCode.get(line_code);
      if (!lineObj) {
        messages.push(`Linha não encontrada (${line_code || 'vazio'})`);
      } else if (sector_id && lineObj.sector_id !== sector_id) {
        messages.push(`Linha ${line_code} não pertence ao setor ${sector_code}`);
      }

      const prodObj = prodBySku.get(product_sku);
      if (!prodObj) messages.push(`Produto SKU não encontrado (${product_sku || 'vazio'})`);

      if (!Number.isFinite(planned_quantity) || planned_quantity <= 0) {
        messages.push('Quantidade planejada deve ser > 0');
      }
      if (produced_quantity < 0 || approved_quantity < 0 || loss_quantity < 0) {
        messages.push('Quantidades não podem ser negativas');
      }
      if (approved_quantity > produced_quantity) {
        messages.push('Aprovado não pode superar o produzido');
      }

      let status: 'valid' | 'duplicate' | 'error' = messages.length > 0 ? 'error' : 'valid';
      if (status === 'valid' && shift_id && operator_id && lineObj && prodObj) {
        const batchKey = `${production_date}|${shift_id}|${operator_id}|${lineObj.id}|${prodObj.id}`;
        const existsInDb = existingDupCheck.get(production_date, shift_id, operator_id, lineObj.id, prodObj.id);
        if (existsInDb || seenInBatch.has(batchKey)) {
          status = 'duplicate';
          messages.push('Registro duplicado detectado (mesma data, turno, operador, linha e produto)');
        } else {
          seenInBatch.add(batchKey);
        }
      }

      return {
        rowIndex: index + 1,
        production_date,
        shift_code,
        operator_username,
        sector_code,
        line_code,
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
        resolvedIds:
          status === 'valid' && shift_id && operator_id && sector_id && lineObj && prodObj
            ? {
                shift_id,
                operator_id,
                sector_id,
                line_id: lineObj.id,
                product_id: prodObj.id,
                unit_of_measure: prodObj.unit_of_measure,
              }
            : undefined,
      };
    });

    res.json({ rows: validatedRows });
  });

  app.post('/api/admin/imports/commit', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { filename, source_type, rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'Nenhum dado válido para importação.' });
      return;
    }

    const validRows = rows.filter((r: any) => r.status === 'valid' && r.resolvedIds);
    const duplicateCount = rows.filter((r: any) => r.status === 'duplicate').length;
    const errorCount = rows.filter((r: any) => r.status === 'error').length;

    const batchId = `imp-${crypto.randomUUID().slice(0, 10)}`;
    const insertRec = db.prepare(
      `INSERT INTO production_records (
        id, production_date, shift_id, operator_id, sector_id, line_id, product_id,
        planned_quantity, produced_quantity, approved_quantity, loss_quantity, unit_of_measure,
        has_downtime, total_downtime_minutes, notes, additional_notes, is_demo, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    );
    const insertDt = db.prepare(
      `INSERT INTO downtime_records (id, production_record_id, reason, duration_minutes, description)
       VALUES (?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      for (const r of validRows) {
        const recId = `rec-imp-${crypto.randomUUID().slice(0, 10)}`;
        insertRec.run(
          recId,
          r.production_date,
          r.resolvedIds.shift_id,
          r.resolvedIds.operator_id,
          r.resolvedIds.sector_id,
          r.resolvedIds.line_id,
          r.resolvedIds.product_id,
          Number(r.planned_quantity),
          Number(r.produced_quantity),
          Number(r.approved_quantity),
          Number(r.loss_quantity),
          r.resolvedIds.unit_of_measure,
          r.has_downtime ? 1 : 0,
          Math.round(Number(r.total_downtime_minutes || 0)),
          r.notes || `Importado via ${filename || 'planilha'}`,
          `Lote de importação: ${batchId}`,
          req.user!.id
        );
        if (r.has_downtime && Number(r.total_downtime_minutes) > 0) {
          insertDt.run(
            `dt-${crypto.randomUUID().slice(0, 10)}`,
            recId,
            r.downtime_reason || 'Parada informada na importação',
            Math.round(Number(r.total_downtime_minutes)),
            r.notes || null
          );
        }
      }

      db.prepare(
        `INSERT INTO import_batches (
          id, source_type, filename, total_rows, imported_rows, duplicate_rows, error_rows, status, validation_summary, imported_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        batchId,
        source_type === 'csv' || source_type === 'iniflex_api' ? source_type : 'excel',
        String(filename || 'importacao.xlsx'),
        rows.length,
        validRows.length,
        duplicateCount,
        errorCount,
        validRows.length > 0 ? 'completed' : 'validated',
        JSON.stringify({ imported: validRows.length, duplicates: duplicateCount, errors: errorCount }),
        req.user!.id
      );
    });

    tx();

    res.status(201).json({
      batchId,
      imported: validRows.length,
      duplicates: duplicateCount,
      errors: errorCount,
    });
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
