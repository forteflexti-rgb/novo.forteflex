import { supabase, isSupabaseConfigured } from './supabase';
import type {
  CatalogData,
  DashboardFilters,
  DashboardSummary,
  ImportBatch,
  ImportValidationRow,
  ProductionGoal,
  ProductionLine,
  ProductionRecord,
  Product,
  Sector,
  Shift,
  UserProfile,
} from '../types';

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
        throw new Error(error.message === 'Invalid login credentials' ? 'Usuário ou senha inválidos.' : error.message);
      }

      if (!data.user) {
        throw new Error('Falha ao autenticar.');
      }

      const { data: profileRow, error: pErr } = await supabase
        .from('profiles')
        .select('*, sector:sectors(name)')
        .eq('id', data.user.id)
        .single();

      if (pErr || !profileRow) {
        throw new Error('Perfil de usuário não encontrado.');
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
        created_at: profileRow.created_at,
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

      const { data: profileRow, error } = await supabase
        .from('profiles')
        .select('*, sector:sectors(name)')
        .eq('id', currentUser.id)
        .single();

      if (error || !profileRow) {
        throw new Error('Perfil de usuário não encontrado');
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
        created_at: profileRow.created_at,
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

      return {
        sectors: (sectorsRes.data || []) as Sector[],
        lines: (linesRes.data || []) as ProductionLine[],
        products: (productsRes.data || []) as Product[],
        shifts: (shiftsRes.data || []) as Shift[],
        goals: (goalsRes.data || []) as ProductionGoal[],
        operators: (operatorsRes.data || []) as any[],
      };
    }

    return request<CatalogData>('/api/catalog');
  },

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
    role: 'admin' | 'operator';
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

  commitImportRows: async (payload: { filename: string; source_type: 'excel' | 'csv' | 'iniflex_api'; rows: ImportValidationRow[] }) => {
    return request<{ batchId: string; imported: number; duplicates: number; errors: number }>('/api/admin/imports/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
