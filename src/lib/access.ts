import type { UserProfile } from '../types';

/** Administração completa do portal. */
export const isAdminUser = (u: Pick<UserProfile, 'role'> | null | undefined) => u?.role === 'admin' || u?.role === 'ti';

/**
 * Dashboards IROG: administrador, TI, diretoria, gestor industrial e gestor de setor
 * (o gestor de setor só recebe do Supabase os dados do próprio setor, via RLS),
 * ou qualquer usuário com a permissão can_view_irog_dashboards.
 */
export const canViewIrog = (u: Pick<UserProfile, 'role' | 'permissions'> | null | undefined) =>
  !!u &&
  (['admin', 'ti', 'director', 'industrial_manager', 'sector_manager'].includes(u.role) || u.permissions?.can_view_irog_dashboards === true);
