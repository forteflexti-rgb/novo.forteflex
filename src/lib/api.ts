import { supabase, isSupabaseConfigured } from './supabase';
import type {
  CatalogData,
  DashboardFilters,
  DashboardSummary,
  ImportBatch,
  ImportValidationRow,
  IniflexImportSummary,
  ProductionGoal,
  ProductionLine,
  ProductionRecord,
  Product,
  Sector,
  Shift,
  UserProfile,
  ServiceOrder,
  ServiceOrderSummary,
  ServiceOrderNote,
} from '../types';

import * as irogApi from './irog/supabaseApi';

const EMPTY_IROG_CATALOG = {
  machines: [],
  stages: [],
  cycleStandards: [],
  orders: [],
  calendars: [],
  downtimeReasons: [],
  lossReasons: [],
  irogGoals: [],
} satisfies Partial<CatalogData>;

const TOKEN_KEY = 'novo_forteflex_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('Servidor retornou HTML (SPA rewrite). Backend API não disponível nesta rota.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Erro na requisição (${response.status})`);
  }
  return data as T;
}

export const api = {
  health: async () => {
    if (isSupabaseConfigured) {
      return {
        status: 'ok',
        platform: 'vercel',
        database: 'supabase',
        supabaseConfigured: true,
      };
    }
    return request<{ status: string; platform: string; database: string; supabaseConfigured: boolean }>('/api/health');
  },

  login: async (identifier: string, password: string) => {
    if (isSupabaseConfigured && supabase) {
      let email = identifier.trim().toLowerCase();

      // Se for username sem @, converte para o e-mail corporativo ou busca na tabela
      if (!email.includes('@')) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', email)
          .maybeSingle();

        email = profile?.email || `${email}@forteflex.com.br`;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message === 'Invalid login credentials' ? 'Usuário ou senha inválidos. Verifique se digitou corretamente.' : error.message);
      }

      if (!data.user || !data.session) {
        throw new Error('Falha ao autenticar sessão no servidor.');
      }

      let profileRow: any = null;
      const { data: pData } = await supabase
        .from('profiles')
        .select('*, sector:sectors(name)')
        .eq('id', data.user.id)
        .maybeSingle();

      if (pData) {
        profileRow = pData;
      } else {
        const fallbackProfile = {
          id: data.user.id,
          username: data.user.user_metadata?.username || email.split('@')[0],
          email: data.user.email || email,
          full_name: data.user.user_metadata?.full_name || 'Usuário',
          role: (data.user.user_metadata?.role as 'admin' | 'operator') || (email.startsWith('admin') ? 'admin' : 'operator'),
          sector_id: null,
          is_active: true,
          permissions: {
            can_create_records: true,
            can_edit_own_records: true,
            can_view_own_records: true,
            can_view_sector_records: false,
            can_export_own_records: false,
          },
        };
        await supabase.from('profiles').upsert(fallbackProfile);
        profileRow = fallbackProfile;
      }

      if (!profileRow.is_active) {
        await supabase.auth.signOut();
        throw new Error('Seu acesso está bloqueado pelo administrador.');
      }

      const user: UserProfile = {
        id: profileRow.id,
        username: profileRow.username,
        email: profileRow.email,
        full_name: profileRow.full_name,
        role: profileRow.role,
        sector_id: profileRow.sector_id ?? null,
        sector_name: profileRow.sector?.name ?? null,
        is_active: Boolean(profileRow.is_active),
        permissions: profileRow.permissions || {
          can_create_records: true,
          can_edit_own_records: true,
          can_view_own_records: true,
          can_view_sector_records: false,
          can_export_own_records: false,
        },
        created_at: profileRow.created_at || new Date().toISOString(),
      };

      setStoredToken(data.session.access_token);
      return { token: data.session.access_token, user };
    }

    return request<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  },

  me: async () => {
    if (isSupabaseConfigured && supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData?.session?.user;
      if (!currentUser) {
        throw new Error('Sessão expirada');
      }

      let profileRow: any = null;
      const { data: pData } = await supabase
        .from('profiles')
        .select('*, sector:sectors(name)')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (pData) {
        profileRow = pData;
      } else {
        const fallbackProfile = {
          id: currentUser.id,
          username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'usuario',
          email: currentUser.email || '',
          full_name: currentUser.user_metadata?.full_name || 'Usuário',
          role: (currentUser.user_metadata?.role as 'admin' | 'operator') || 'operator',
          sector_id: null,
          is_active: true,
          permissions: {
            can_create_records: true,
            can_edit_own_records: true,
            can_view_own_records: true,
            can_view_sector_records: false,
            can_export_own_records: false,
          },
        };
        await supabase.from('profiles').upsert(fallbackProfile);
        profileRow = fallbackProfile;
      }

      const user: UserProfile = {
        id: profileRow.id,
        username: profileRow.username,
        email: profileRow.email,
        full_name: profileRow.full_name,
        role: profileRow.role,
        sector_id: profileRow.sector_id ?? null,
        sector_name: profileRow.sector?.name ?? null,
        is_active: Boolean(profileRow.is_active),
        permissions: profileRow.permissions,
        created_at: profileRow.created_at || new Date().toISOString(),
      };

      return { user };
    }

    return request<{ user: UserProfile }>('/api/auth/me');
  },

  recoverPassword: async (identifier: string) => {
    if (isSupabaseConfigured && supabase) {
      let email = identifier.trim().toLowerCase();
      if (!email.includes('@')) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', email)
          .maybeSingle();
        email = profile?.email || `${email}@forteflex.com.br`;
      }

      await supabase.auth.resetPasswordForEmail(email);
      return {
        accepted: true,
        message: 'Se o e-mail estiver cadastrado, as instruções de recuperação foram enviadas.',
      };
    }

    return request<{ accepted: boolean; message: string }>('/api/auth/recover', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    });
  },

  getCatalog: async (): Promise<CatalogData> => {
    if (isSupabaseConfigured && supabase) {
      const [sectorsRes, linesRes, productsRes, shiftsRes, goalsRes, operatorsRes] = await Promise.all([
        supabase.from('sectors').select('*').order('name'),
        supabase.from('production_lines').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('shifts').select('*').order('start_time'),
        supabase.from('production_goals').select('*'),
        supabase.from('profiles').select('id, full_name, username, role, sector_id, is_active').order('full_name'),
      ]);

      const sectors = (sectorsRes.data || []) as Sector[];
      const lines = (linesRes.data || []) as ProductionLine[];
      const products = (productsRes.data || []) as Product[];
      const irog = await irogApi.loadIrogCatalog({
        sectors: new Map(sectors.map((s) => [s.id, s.name])),
        lines: new Map(lines.map((l) => [l.id, l.name])),
        products: new Map(products.map((p) => [p.id, { name: p.name, sku: p.sku }])),
      });

      return {
        sectors,
        lines,
        products,
        shifts: (shiftsRes.data || []) as Shift[],
        goals: ((goalsRes.data || []) as any[]).filter((g) => (g.metric ?? 'quantity') === 'quantity') as ProductionGoal[],
        operators: (operatorsRes.data || []) as any[],
        ...irog,
      };
    }

    const local = await request<CatalogData>('/api/catalog');
    return { ...EMPTY_IROG_CATALOG, ...local };
  },

  // IROG, paradas, perdas, alertas e auditoria (Supabase) — ver src/lib/irog/supabaseApi.ts
  getIrogOverview: (filters?: Partial<DashboardFilters>) => irogApi.getIrogOverview(filters),
  getDowntimes: (filters?: { machineId?: string; status?: 'open' | 'closed' }) => irogApi.getDowntimes(filters),
  createDowntime: irogApi.createDowntime,
  closeDowntime: irogApi.closeDowntime,
  getLosses: (filters?: { includeDemo?: boolean }) => irogApi.getLosses(filters),
  createLoss: irogApi.createLoss,
  getAlerts: (includeDemo = true) => irogApi.getAlerts(includeDemo),
  createAlertRule: irogApi.createAlertRule,
  updateAlertRule: irogApi.updateAlertRule,
  getAuditLogs: () => irogApi.getAuditLogs(),

  getProductionRecords: async (filters?: Partial<DashboardFilters>) => {
    if (isSupabaseConfigured && supabase) {
      let query = supabase
        .from('production_records')
        .select(`
          *,
          operator:profiles!operator_id(full_name),
          sector:sectors!sector_id(name),
          line:production_lines!line_id(name),
          product:products!product_id(name, sku),
          shift:shifts!shift_id(name),
          downtime_records(*)
        `)
        .order('production_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.startDate) query = query.gte('production_date', filters.startDate);
      if (filters?.endDate) query = query.lte('production_date', filters.endDate);
      if (filters?.shiftId) query = query.eq('shift_id', filters.shiftId);
      if (filters?.sectorId) query = query.eq('sector_id', filters.sectorId);
      if (filters?.lineId) query = query.eq('line_id', filters.lineId);
      if (filters?.productId) query = query.eq('product_id', filters.productId);
      if (filters?.operatorId) query = query.eq('operator_id', filters.operatorId);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const records: ProductionRecord[] = (data || []).map((row: any) => ({
        ...row,
        operator_name: row.operator?.full_name || '',
        sector_name: row.sector?.name || '',
        line_name: row.line?.name || '',
        product_name: row.product?.name || '',
        product_sku: row.product?.sku || '',
        shift_name: row.shift?.name || '',
        downtime_reason: row.downtime_records?.[0]?.reason || null,
        downtime_description: row.downtime_records?.[0]?.description || null,
      }));

      return { records };
    }

    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          params.set(k, String(v));
        }
      });
    }
    const qs = params.toString();
    return request<{ records: ProductionRecord[] }>(`/api/production-records${qs ? `?${qs}` : ''}`);
  },

  createProductionRecord: async (payload: {
    production_date: string;
    shift_id: string;
    operator_id?: string;
    sector_id: string;
    line_id: string;
    product_id: string;
    planned_quantity: number;
    produced_quantity: number;
    approved_quantity: number;
    loss_quantity: number;
    unit_of_measure: string;
    has_downtime: boolean;
    total_downtime_minutes: number;
    downtime_reason?: string;
    downtime_description?: string;
    notes?: string;
    additional_notes?: string;
  }) => {
    if (isSupabaseConfigured && supabase) {
      const userRes = await supabase.auth.getUser();
      const currentUserId = userRes.data?.user?.id;
      const targetOperatorId = payload.operator_id || currentUserId;

      const { data: record, error } = await supabase
        .from('production_records')
        .insert({
          production_date: payload.production_date,
          shift_id: payload.shift_id,
          operator_id: targetOperatorId,
          sector_id: payload.sector_id,
          line_id: payload.line_id,
          product_id: payload.product_id,
          planned_quantity: payload.planned_quantity,
          produced_quantity: payload.produced_quantity,
          approved_quantity: payload.approved_quantity,
          loss_quantity: payload.loss_quantity,
          unit_of_measure: payload.unit_of_measure,
          has_downtime: payload.has_downtime,
          total_downtime_minutes: payload.total_downtime_minutes || 0,
          notes: payload.notes || null,
          additional_notes: payload.additional_notes || null,
          is_demo: false,
          created_by: currentUserId,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      if (payload.has_downtime && payload.downtime_reason) {
        await supabase.from('downtime_records').insert({
          production_record_id: record.id,
          reason: payload.downtime_reason,
          duration_minutes: payload.total_downtime_minutes || 0,
          description: payload.downtime_description || null,
        });
      }

      return { record: record as ProductionRecord };
    }

    return request<{ record: ProductionRecord }>('/api/production-records', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateProductionRecord: async (id: string, payload: Partial<ProductionRecord>) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('production_records')
        .update(payload)
        .eq('id', id);

      if (error) throw new Error(error.message);
      return { updated: true, id };
    }

    return request<{ updated: boolean; id: string }>(`/api/production-records/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteProductionRecord: async (id: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('production_records')
        .delete()
        .eq('id', id);

      if (error) throw new Error(error.message);
      return { deleted: true };
    }

    return request<{ deleted: boolean }>(`/api/production-records/${id}`, {
      method: 'DELETE',
    });
  },

  getDashboardSummary: async (filters: DashboardFilters): Promise<DashboardSummary> => {
    if (isSupabaseConfigured && supabase) {
      const { records } = await api.getProductionRecords(filters);
      const catalog = await api.getCatalog();

      const todayStr = new Date().toISOString().slice(0, 10);
      const monthStr = todayStr.slice(0, 7);

      let plannedTotal = 0;
      let realizedTotal = 0;
      let approvedTotal = 0;
      let lossesTotal = 0;
      let totalDowntimeMinutes = 0;
      let todayTotal = 0;
      let monthTotal = 0;

      const dailyMap = new Map<string, { planned: number; realized: number; approved: number; losses: number }>();
      const shiftMap = new Map<string, { planned: number; realized: number; losses: number }>();
      const sectorMap = new Map<string, { planned: number; realized: number; losses: number }>();
      const employeeMap = new Map<string, { realized: number; approved: number; losses: number }>();
      const productMap = new Map<string, { planned: number; realized: number }>();
      const downtimeReasonMap = new Map<string, { minutes: number; occurrences: number }>();

      let demoRecordsCount = 0;

      for (const r of records) {
        if (!filters.includeDemo && r.is_demo) {
          continue;
        }

        plannedTotal += r.planned_quantity;
        realizedTotal += r.produced_quantity;
        approvedTotal += r.approved_quantity;
        lossesTotal += r.loss_quantity;
        totalDowntimeMinutes += r.total_downtime_minutes || 0;
        if (r.is_demo) demoRecordsCount++;

        if (r.production_date === todayStr) {
          todayTotal += r.produced_quantity;
        }
        if (r.production_date.slice(0, 7) === monthStr) {
          monthTotal += r.produced_quantity;
        }

        // Daily
        const dEntry = dailyMap.get(r.production_date) || { planned: 0, realized: 0, approved: 0, losses: 0 };
        dEntry.planned += r.planned_quantity;
        dEntry.realized += r.produced_quantity;
        dEntry.approved += r.approved_quantity;
        dEntry.losses += r.loss_quantity;
        dailyMap.set(r.production_date, dEntry);

        // Shift
        const sName = r.shift_name || 'Turno Indefinido';
        const sEntry = shiftMap.get(sName) || { planned: 0, realized: 0, losses: 0 };
        sEntry.planned += r.planned_quantity;
        sEntry.realized += r.produced_quantity;
        sEntry.losses += r.loss_quantity;
        shiftMap.set(sName, sEntry);

        // Sector
        const secName = r.sector_name || 'Setor Indefinido';
        const secEntry = sectorMap.get(secName) || { planned: 0, realized: 0, losses: 0 };
        secEntry.planned += r.planned_quantity;
        secEntry.realized += r.produced_quantity;
        secEntry.losses += r.loss_quantity;
        sectorMap.set(secName, secEntry);

        // Employee
        const empName = r.operator_name || 'Operador Indefinido';
        const empEntry = employeeMap.get(empName) || { realized: 0, approved: 0, losses: 0 };
        empEntry.realized += r.produced_quantity;
        empEntry.approved += r.approved_quantity;
        empEntry.losses += r.loss_quantity;
        employeeMap.set(empName, empEntry);

        // Product
        const prodName = r.product_name || 'Produto';
        const prodEntry = productMap.get(prodName) || { planned: 0, realized: 0 };
        prodEntry.planned += r.planned_quantity;
        prodEntry.realized += r.produced_quantity;
        productMap.set(prodName, prodEntry);

        // Downtime
        if (r.has_downtime && r.total_downtime_minutes > 0) {
          const reason = r.downtime_reason || 'Parada Operacional';
          const dtEntry = downtimeReasonMap.get(reason) || { minutes: 0, occurrences: 0 };
          dtEntry.minutes += r.total_downtime_minutes;
          dtEntry.occurrences += 1;
          downtimeReasonMap.set(reason, dtEntry);
        }
      }

      const goalAttainmentPercent = plannedTotal > 0 ? (realizedTotal / plannedTotal) * 100 : 0;
      const lossPercent = realizedTotal > 0 ? (lossesTotal / realizedTotal) * 100 : 0;

      let productiveEfficiencyPercent = 0;
      if (records.length > 0 && plannedTotal > 0 && realizedTotal > 0) {
        const scheduledMinutes = records.length * 480;
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

      return {
        kpis: {
          todayProduction: Math.round(todayTotal),
          monthProduction: Math.round(monthTotal),
          plannedTotal: Math.round(plannedTotal),
          realizedTotal: Math.round(realizedTotal),
          goalAttainmentPercent: Number(goalAttainmentPercent.toFixed(1)),
          lossesTotal: Math.round(lossesTotal),
          lossPercent: Number(lossPercent.toFixed(2)),
          totalDowntimeMinutes,
          productiveEfficiencyPercent: Number(productiveEfficiencyPercent.toFixed(1)),
          recordsCount: records.length,
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
      };
    }

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.set(k, String(v));
      }
    });
    return request<DashboardSummary>(`/api/dashboard/summary?${params.toString()}`);
  },

  // Admin Users
  getUsers: async () => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, sector:sectors(name)')
        .order('full_name');

      if (error) throw new Error(error.message);
      const users: UserProfile[] = (data || []).map((row: any) => ({
        ...row,
        sector_name: row.sector?.name || null,
        is_active: Boolean(row.is_active),
      }));
      return { users };
    }
    return request<{ users: UserProfile[] }>('/api/admin/users');
  },

  createUser: async (payload: {
    username: string;
    email: string;
    full_name: string;
    password: string;
    role: UserProfile['role'];
    sector_id?: string | null;
    permissions?: UserProfile['permissions'];
  }) => {
    if (isSupabaseConfigured && supabase) {
      const { data: authData, error: aErr } = await supabase.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
          data: {
            username: payload.username,
            full_name: payload.full_name,
            role: payload.role,
          },
        },
      });
      if (aErr) throw new Error(aErr.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error('Não foi possível gerar usuário');

      const { data: user, error: pErr } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          username: payload.username,
          email: payload.email,
          full_name: payload.full_name,
          role: payload.role,
          sector_id: payload.sector_id || null,
          permissions: payload.permissions || {
            can_create_records: true,
            can_edit_own_records: true,
            can_view_own_records: true,
            can_view_sector_records: false,
            can_export_own_records: false,
          },
          is_active: true,
        })
        .select()
        .single();

      if (pErr) throw new Error(pErr.message);
      return { user: user as UserProfile };
    }

    return request<{ user: UserProfile }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateUser: async (id: string, payload: Partial<UserProfile & { password?: string }>) => {
    if (isSupabaseConfigured && supabase) {
      const updateData: any = { ...payload };
      delete updateData.password;
      delete updateData.sector_name;

      const { data: user, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return { user: user as UserProfile };
    }

    return request<{ user: UserProfile }>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Admin Catalog CRUD
  createSector: async (payload: { code: string; name: string; description?: string }) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('sectors').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    return request<{ id: string }>('/api/admin/sectors', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateSector: async (id: string, payload: Record<string, any>) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('sectors').update(payload).eq('id', id);
      if (error) throw new Error(error.message);
      return { updated: true };
    }
    return request<{ updated: boolean }>(`/api/admin/sectors/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  createLine: async (payload: { sector_id: string; code: string; name: string; capacity_per_hour: number }) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('production_lines').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    return request<{ id: string }>('/api/admin/lines', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateLine: async (id: string, payload: Record<string, any>) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('production_lines').update(payload).eq('id', id);
      if (error) throw new Error(error.message);
      return { updated: true };
    }
    return request<{ updated: boolean }>(`/api/admin/lines/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  createProduct: async (payload: {
    sku: string;
    name: string;
    category: string;
    unit_of_measure: string;
    target_cycle_minutes: number;
  }) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('products').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    return request<{ id: string }>('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateProduct: async (id: string, payload: Record<string, any>) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('products').update(payload).eq('id', id);
      if (error) throw new Error(error.message);
      return { updated: true };
    }
    return request<{ updated: boolean }>(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  createShift: async (payload: { code: string; name: string; start_time: string; end_time: string }) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('shifts').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    return request<{ id: string }>('/api/admin/shifts', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateShift: async (id: string, payload: Record<string, any>) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('shifts').update(payload).eq('id', id);
      if (error) throw new Error(error.message);
      return { updated: true };
    }
    return request<{ updated: boolean }>(`/api/admin/shifts/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  createGoal: async (payload: {
    sector_id: string;
    line_id?: string | null;
    product_id?: string | null;
    shift_id?: string | null;
    period_type: 'daily' | 'monthly';
    target_quantity: number;
    max_loss_percent: number;
  }) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('production_goals').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    return request<{ id: string }>('/api/admin/goals', { method: 'POST', body: JSON.stringify(payload) });
  },

  deleteGoal: async (id: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('production_goals').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { deleted: true };
    }
    return request<{ deleted: boolean }>(`/api/admin/goals/${id}`, { method: 'DELETE' });
  },

  clearDemoData: async () => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('production_records').delete().eq('is_demo', true).select('id');
      if (error) throw new Error(error.message);
      return { removed: data?.length || 0 };
    }
    return request<{ removed: number }>('/api/admin/demo-data', { method: 'DELETE' });
  },

  restoreDemoData: async () => {
    if (isSupabaseConfigured && supabase) {
      return { created: 0 };
    }
    return request<{ created: number }>('/api/admin/demo-data', { method: 'POST' });
  },

  // Imports
  getImportBatches: async () => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('import_batches').select('*').order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return { batches: (data || []) as ImportBatch[] };
    }
    return request<{ batches: ImportBatch[] }>('/api/admin/imports');
  },

  validateImportRows: async (rows: Record<string, any>[]) => {
    return request<{ rows: ImportValidationRow[] }>('/api/admin/imports/validate', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
  },

  importIniflexReports: async (payload: { files: Array<{ name: string; contentBase64: string }>; commit: boolean }) => {
    return request<IniflexImportSummary>('/api/admin/imports/iniflex', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  commitImportRows: async (payload: { filename: string; source_type: 'excel' | 'csv' | 'iniflex_api'; rows: ImportValidationRow[] }) => {
    return request<{ batchId: string; imported: number; duplicates: number; errors: number }>('/api/admin/imports/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // ---------------------------------------------------------------------------
  // SERVICE ORDERS (ORDENS DE SERVIÇO / CENTRAL DE TI)
  // ---------------------------------------------------------------------------
  getServiceOrders: async (params?: { status?: string; priority?: string; category?: string; sector_id?: string }) => {
    // 1. Tenta Supabase se configurado
    if (isSupabaseConfigured && supabase) {
      try {
        let q = supabase
          .from('service_orders')
          .select('*, sector:sectors(name), requester:profiles!service_orders_requester_id_fkey(full_name, email), assigned_to:profiles!service_orders_assigned_to_id_fkey(full_name)')
          .order('created_at', { ascending: false });

        if (params?.status) q = q.eq('status', params.status);
        if (params?.priority) q = q.eq('priority', params.priority);
        if (params?.category) q = q.eq('category', params.category);
        if (params?.sector_id) q = q.eq('sector_id', params.sector_id);

        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          const mapped: ServiceOrder[] = data.map((d: any) => ({
            id: d.id,
            ticket_number: d.ticket_number,
            title: d.title,
            description: d.description,
            category: d.category,
            priority: d.priority,
            status: d.status,
            sector_id: d.sector_id,
            sector_name: d.sector?.name || 'Geral',
            line_or_location: d.line_or_location,
            requester_id: d.requester_id,
            requester_name: d.requester?.full_name || 'Usuário',
            requester_email: d.requester?.email,
            assigned_to_id: d.assigned_to_id,
            assigned_to_name: d.assigned_to?.full_name,
            notes: Array.isArray(d.notes) ? d.notes : typeof d.notes === 'string' ? JSON.parse(d.notes) : [],
            solution: d.solution,
            closed_at: d.closed_at,
            created_at: d.created_at,
            updated_at: d.updated_at,
          }));
          return { orders: mapped };
        }
      } catch (err) {
        // Fallback silencioso para local
      }
    }

    // 2. Tenta API Express local
    try {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.priority) searchParams.set('priority', params.priority);
      if (params?.category) searchParams.set('category', params.category);
      if (params?.sector_id) searchParams.set('sector_id', params.sector_id);
      const queryStr = searchParams.toString() ? `?${searchParams.toString()}` : '';

      const res = await request<{ orders: ServiceOrder[] }>(`/api/service-orders${queryStr}`);
      if (res && Array.isArray(res.orders)) {
        return res;
      }
    } catch {
      // Fallback
    }

    // 3. Fallback resiliente para localStorage
    const local = getLocalServiceOrders();
    let filtered = [...local];
    if (params?.status) filtered = filtered.filter((o) => o.status === params.status);
    if (params?.priority) filtered = filtered.filter((o) => o.priority === params.priority);
    if (params?.category) filtered = filtered.filter((o) => o.category === params.category);
    if (params?.sector_id) filtered = filtered.filter((o) => o.sector_id === params.sector_id);
    return { orders: filtered };
  },

  createServiceOrder: async (data: {
    title: string;
    description: string;
    category: string;
    priority: string;
    sector_id: string;
    line_or_location?: string;
  }) => {
    // 1. Tenta Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData?.session?.user?.id;
        const currentUserName = sessionData?.session?.user?.user_metadata?.full_name || sessionData?.session?.user?.email?.split('@')[0] || 'Usuário';

        const countRes = await supabase.from('service_orders').select('id', { count: 'exact', head: true });
        const currentYear = new Date().getFullYear();
        const nextNum = ((countRes.count || 0) + 1).toString().padStart(4, '0');
        const ticketNumber = `OS-${currentYear}-${nextNum}`;

        const newRow = {
          ticket_number: ticketNumber,
          title: data.title,
          description: data.description,
          category: data.category,
          priority: data.priority,
          status: 'open',
          sector_id: data.sector_id,
          line_or_location: data.line_or_location || null,
          requester_id: currentUserId,
          notes: [],
        };

        const { data: inserted, error } = await supabase.from('service_orders').insert(newRow).select().single();
        if (!error && inserted) {
          return { order: inserted as ServiceOrder };
        }
      } catch (err) {
        // Fallback
      }
    }

    // 2. Tenta API Express local
    try {
      const res = await request<{ order: ServiceOrder }>('/api/service-orders', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (res && res.order) return res;
    } catch {
      // Fallback
    }

    // 3. Fallback localStorage
    const local = getLocalServiceOrders();
    const currentYear = new Date().getFullYear();
    const nextNum = (local.length + 1).toString().padStart(4, '0');
    const newOrder: ServiceOrder = {
      id: `so-${Date.now()}`,
      ticket_number: `OS-${currentYear}-${nextNum}`,
      title: data.title,
      description: data.description,
      category: data.category as any,
      priority: data.priority as any,
      status: 'open',
      sector_id: data.sector_id,
      line_or_location: data.line_or_location || null,
      requester_id: 'usr-current',
      requester_name: 'Usuário Conectado',
      notes: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveLocalServiceOrders([newOrder, ...local]);
    return { order: newOrder };
  },

  updateServiceOrder: async (
    id: string,
    updates: {
      status?: string;
      assigned_to_id?: string | null;
      solution?: string;
      priority?: string;
    }
  ) => {
    // 1. Tenta Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const payload: any = { ...updates, updated_at: new Date().toISOString() };
        if (updates.status === 'completed') {
          payload.closed_at = new Date().toISOString();
        }
        const { data: updated, error } = await supabase
          .from('service_orders')
          .update(payload)
          .eq('id', id)
          .select()
          .single();

        if (!error && updated) {
          return { order: updated as ServiceOrder };
        }
      } catch {}
    }

    // 2. Tenta Express local
    try {
      const res = await request<{ order: ServiceOrder }>(`/api/service-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      if (res && res.order) return res;
    } catch {}

    // 3. Fallback localStorage
    const local = getLocalServiceOrders();
    const idx = local.findIndex((o) => o.id === id);
    if (idx >= 0) {
      const item = local[idx];
      const newStatus = (updates.status as any) || item.status;
      const updated: ServiceOrder = {
        ...item,
        status: newStatus,
        assigned_to_id: updates.assigned_to_id !== undefined ? updates.assigned_to_id : item.assigned_to_id,
        solution: updates.solution !== undefined ? updates.solution : item.solution,
        priority: (updates.priority as any) || item.priority,
        closed_at: newStatus === 'completed' && !item.closed_at ? new Date().toISOString() : item.closed_at,
        updated_at: new Date().toISOString(),
      };
      local[idx] = updated;
      saveLocalServiceOrders(local);
      return { order: updated };
    }
    throw new Error('Ordem de serviço não encontrada.');
  },

  addServiceOrderNote: async (id: string, content: string) => {
    // 1. Tenta Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: current } = await supabase.from('service_orders').select('notes').eq('id', id).single();
        const currentNotes = Array.isArray(current?.notes) ? current.notes : [];
        const { data: sessionData } = await supabase.auth.getSession();
        const newNote: ServiceOrderNote = {
          id: `note-${Date.now()}`,
          author_id: sessionData?.session?.user?.id || 'usr-ti-01',
          author_name: sessionData?.session?.user?.user_metadata?.full_name || 'Equipe de TI Forteflex',
          author_role: 'admin',
          content,
          created_at: new Date().toISOString(),
        };
        const updatedNotes = [...currentNotes, newNote];
        const { error } = await supabase
          .from('service_orders')
          .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
          .eq('id', id);

        if (!error) {
          return { note: newNote, notes: updatedNotes };
        }
      } catch {}
    }

    // 2. Tenta Express
    try {
      const res = await request<{ note: ServiceOrderNote; notes: ServiceOrderNote[] }>(`/api/service-orders/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      if (res && res.notes) return res;
    } catch {}

    // 3. Fallback localStorage
    const local = getLocalServiceOrders();
    const idx = local.findIndex((o) => o.id === id);
    if (idx >= 0) {
      const item = local[idx];
      const newNote: ServiceOrderNote = {
        id: `note-${Date.now()}`,
        author_id: 'usr-ti-01',
        author_name: 'Equipe de TI Forteflex',
        author_role: 'admin',
        content,
        created_at: new Date().toISOString(),
      };
      item.notes = [...(item.notes || []), newNote];
      item.updated_at = new Date().toISOString();
      saveLocalServiceOrders(local);
      return { note: newNote, notes: item.notes };
    }
    throw new Error('Ordem de serviço não encontrada.');
  },

  getServiceOrdersSummary: async () => {
    // Tenta Express
    try {
      const res = await request<{ summary: ServiceOrderSummary }>('/api/service-orders-summary');
      if (res && res.summary) return res;
    } catch {}

    // Fallback calculado local
    const orders = getLocalServiceOrders();
    const total = orders.length;
    const open = orders.filter((o) => o.status === 'open').length;
    const in_progress = orders.filter((o) => o.status === 'in_progress').length;
    const critical = orders.filter((o) => o.priority === 'critical' && o.status !== 'completed' && o.status !== 'cancelled').length;
    const currentMonthPrefix = new Date().toISOString().slice(0, 7);
    const completed_this_month = orders.filter((o) => o.status === 'completed' && (o.closed_at || '').startsWith(currentMonthPrefix)).length;

    return {
      summary: {
        total,
        open,
        in_progress,
        critical,
        completed_this_month,
        avg_resolution_hours: 2.4,
        by_category: [
          { category: 'hardware', label: 'Hardware & Equipamentos', count: orders.filter((o) => o.category === 'hardware').length },
          { category: 'printers_labels', label: 'Impressoras & Etiquetas', count: orders.filter((o) => o.category === 'printers_labels').length },
          { category: 'access_passwords', label: 'Acessos & Senhas', count: orders.filter((o) => o.category === 'access_passwords').length },
        ],
        by_sector: [
          { sector_name: 'Extrusão', count: orders.filter((o) => o.sector_id === 'sec-ext').length },
          { sector_name: 'Corte e Solda', count: orders.filter((o) => o.sector_id === 'sec-cs').length },
          { sector_name: 'Impressão Flexo', count: orders.filter((o) => o.sector_id === 'sec-imp').length },
        ],
        by_priority: [
          { priority: 'critical', label: 'Crítica / Linha Parada', count: critical },
          { priority: 'high', label: 'Alta', count: orders.filter((o) => o.priority === 'high').length },
          { priority: 'medium', label: 'Média', count: orders.filter((o) => o.priority === 'medium').length },
          { priority: 'low', label: 'Baixa', count: orders.filter((o) => o.priority === 'low').length },
        ],
      },
    };
  },
};

const LOCAL_SO_KEY = 'novo_forteflex_service_orders';

function getLocalServiceOrders(): ServiceOrder[] {
  try {
    const raw = localStorage.getItem(LOCAL_SO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((o: any) => ({
          ...o,
          notes: Array.isArray(o.notes) ? o.notes : typeof o.notes === 'string' ? JSON.parse(o.notes) : [],
        }));
      }
    }
  } catch {}

  const defaults: ServiceOrder[] = [
    {
      id: 'so-001',
      ticket_number: 'OS-2026-0001',
      title: 'Leitor de código de barras sem comunicação na Extrusão 01',
      description: 'O terminal de apontamento da Extrusora Balão 01 parou de ler os códigos de bobina. Apresenta erro de porta USB/comunicação.',
      category: 'hardware',
      priority: 'critical',
      status: 'in_progress',
      sector_id: 'sec-ext',
      sector_name: 'Extrusão',
      line_or_location: 'Linha EXT-01 (Cabeçote Principal)',
      requester_id: 'usr-op-01',
      requester_name: 'Carlos Eduardo Silva',
      assigned_to_id: 'usr-ti-01',
      assigned_to_name: 'Equipe de TI Forteflex',
      notes: [
        {
          id: 'note-01',
          author_id: 'usr-ti-01',
          author_name: 'Equipe de TI Forteflex',
          author_role: 'admin',
          content: 'Técnico se deslocando para a linha de Extrusão 01 para substituição do cabo de rede e teste do leitor óptico.',
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'so-002',
      ticket_number: 'OS-2026-0002',
      title: 'Falha no alinhamento de impressão térmica de etiquetas',
      description: 'Impressora Zebra da linha de Corte e Solda 01 está pulando 2 etiquetas e cortando o código de barras no meio.',
      category: 'printers_labels',
      priority: 'medium',
      status: 'open',
      sector_id: 'sec-cs',
      sector_name: 'Corte e Solda',
      line_or_location: 'Linha CS-01 (Mesa de Inspeção)',
      requester_id: 'usr-op-02',
      requester_name: 'Mariana Ferreira Costa',
      notes: [],
      created_at: new Date(Date.now() - 18000000).toISOString(),
      updated_at: new Date(Date.now() - 18000000).toISOString(),
    },
    {
      id: 'so-003',
      ticket_number: 'OS-2026-0003',
      title: 'Liberação de perfil para novo operador de Impressão Flexo',
      description: 'Solicitamos criação de login e senha para operador substituto no turno T2 da impressora 8 cores.',
      category: 'access_passwords',
      priority: 'low',
      status: 'completed',
      sector_id: 'sec-imp',
      sector_name: 'Impressão Flexográfica',
      line_or_location: 'Sala de Preparação de Tintas / Flexo',
      requester_id: 'usr-admin-01',
      requester_name: 'Ricardo Almeida (Gestão Industrial)',
      assigned_to_id: 'usr-ti-01',
      assigned_to_name: 'Equipe de TI Forteflex',
      notes: [
        {
          id: 'note-02',
          author_id: 'usr-ti-01',
          author_name: 'Equipe de TI Forteflex',
          author_role: 'admin',
          content: 'Acesso liberado e validado diretamente com o operador no 2º turno.',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      solution: 'Usuário criado com perfil de Operador, vinculado ao setor de Impressão e com permissão padrão de apontamento.',
      closed_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  try {
    localStorage.setItem(LOCAL_SO_KEY, JSON.stringify(defaults));
  } catch {}
  return defaults;
}

function saveLocalServiceOrders(orders: ServiceOrder[]): void {
  try {
    localStorage.setItem(LOCAL_SO_KEY, JSON.stringify(orders));
  } catch {}
}
