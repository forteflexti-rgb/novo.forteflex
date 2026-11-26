import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Shield, ShieldOff, Pencil, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { CatalogData, UserPermissions, UserProfile, UserRole } from '../../types';

interface AdminUsersViewProps {
  catalog: CatalogData;
  onCatalogUpdated: () => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  director: 'Diretoria / Executivo',
  manager: 'Gestor de Setor',
  leader: 'Líder de Produção',
  operator: 'Operador de Produção',
};

const DEFAULT_PERMISSIONS: UserPermissions = {
  can_create_records: true,
  can_edit_own_records: true,
  can_view_own_records: true,
  can_view_sector_records: false,
  can_export_own_records: false,
  can_register_downtime: true,
  can_register_losses: true,
  can_view_irog_dashboards: false,
};

function getDefaultPermsForRole(role: UserRole): UserPermissions {
  if (role === 'admin') {
    return {
      can_create_records: true,
      can_edit_own_records: true,
      can_view_own_records: true,
      can_view_sector_records: true,
      can_export_own_records: true,
      can_register_downtime: true,
      can_register_losses: true,
      can_view_irog_dashboards: true,
    };
  }
  if (role === 'director') {
    return {
      can_create_records: false,
      can_edit_own_records: false,
      can_view_own_records: true,
      can_view_sector_records: true,
      can_export_own_records: true,
      can_register_downtime: false,
      can_register_losses: false,
      can_view_irog_dashboards: true,
    };
  }
  if (role === 'manager') {
    return {
      can_create_records: false,
      can_edit_own_records: false,
      can_view_own_records: true,
      can_view_sector_records: true,
      can_export_own_records: true,
      can_register_downtime: true,
      can_register_losses: true,
      can_view_irog_dashboards: true,
    };
  }
  if (role === 'leader') {
    return {
      can_create_records: true,
      can_edit_own_records: true,
      can_view_own_records: true,
      can_view_sector_records: true,
      can_export_own_records: true,
      can_register_downtime: true,
      can_register_losses: true,
      can_view_irog_dashboards: true,
    };
  }
  return { ...DEFAULT_PERMISSIONS };
}

export function AdminUsersView({ catalog, onCatalogUpdated }: AdminUsersViewProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('operator');
  const [sectorId, setSectorId] = useState('');
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getUsers();
      setUsers(res.users);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFullName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('operator');
    const firstSec = catalog.sectors[0]?.id || '';
    setSectorId(firstSec);
    setAllowedSectorIds(firstSec ? [firstSec] : []);
    setPermissions(getDefaultPermsForRole('operator'));
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = (u: UserProfile) => {
    setEditingUser(u);
    setFullName(u.full_name);
    setUsername(u.username);
    setEmail(u.email);
    setPassword('');
    setRole(u.role);
    setSectorId(u.sector_id || '');
    setAllowedSectorIds(u.allowed_sector_ids || (u.sector_id ? [u.sector_id] : []));
    setPermissions({ ...getDefaultPermsForRole(u.role), ...u.permissions });
    setError(null);
    setModalOpen(true);
  };

  const handleRoleChange = (nextRole: UserRole) => {
    setRole(nextRole);
    setPermissions(getDefaultPermsForRole(nextRole));
  };

  const toggleAllowedSector = (id: string) => {
    setAllowedSectorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSaving(true);
    try {
      const scopedSectors =
        role === 'manager' || role === 'leader'
          ? allowedSectorIds.length > 0
            ? allowedSectorIds
            : sectorId
            ? [sectorId]
            : []
          : sectorId
          ? [sectorId]
          : [];

      if (editingUser) {
        await api.updateUser(editingUser.id, {
          full_name: fullName,
          username,
          email,
          role,
          sector_id: sectorId || null,
          allowed_sector_ids: scopedSectors,
          permissions,
          ...(password.trim().length >= 6 ? { password } : {}),
        });
        setFeedback(`Usuário ${fullName} atualizado com sucesso.`);
      } else {
        await api.createUser({
          full_name: fullName,
          username,
          email,
          password,
          role,
          sector_id: sectorId || null,
          allowed_sector_ids: scopedSectors,
          permissions,
        });
        setFeedback(`Usuário ${fullName} cadastrado com sucesso.`);
      }
      setModalOpen(false);
      await loadUsers();
      onCatalogUpdated();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: UserProfile) => {
    setError(null);
    setFeedback(null);
    try {
      await api.updateUser(u.id, { is_active: !u.is_active });
      setFeedback(u.is_active ? `Usuário ${u.full_name} bloqueado.` : `Usuário ${u.full_name} desbloqueado.`);
      await loadUsers();
      onCatalogUpdated();
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar status do usuário.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-display font-bold text-[#0f2544]">
            Gestão de Usuários, Perfis e Escopo por Setor
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Controle os 5 níveis de acesso (Administrador, Diretoria, Gestor, Líder e Operador) e permissões granulares.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" />
          <span>Cadastrar usuário</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && !modalOpen && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Nome / Login</th>
                  <th className="px-4 py-3">Perfil</th>
                  <th className="px-4 py-3">Setor / Escopo</th>
                  <th className="px-4 py-3">Permissões</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const scopedNames = (u.allowed_sector_ids || [])
                    .map((sid) => catalog.sectors.find((s) => s.id === sid)?.code || sid)
                    .join(', ');
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{u.full_name}</div>
                        <div className="text-xs font-mono text-slate-500">
                          {u.username} · {u.email}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{ROLE_LABELS[u.role] || u.role}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div>{u.sector_name || 'Todos / Geral'}</div>
                        {(u.role === 'manager' || u.role === 'leader') && scopedNames && (
                          <div className="font-mono text-slate-500">Escopo: {scopedNames}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {u.role === 'admin'
                          ? 'Acesso total administrativo'
                          : u.role === 'director'
                          ? 'Leitura executiva IROG + Relatórios + Auditoria'
                          : [
                              u.permissions.can_view_irog_dashboards && 'Dashboards IROG',
                              u.permissions.can_create_records && 'Produção',
                              u.permissions.can_register_downtime && 'Paradas',
                              u.permissions.can_register_losses && 'Perdas',
                              u.permissions.can_view_sector_records && 'Ver setor',
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Restrito'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                            u.is_active ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {u.is_active ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                          <span>{u.is_active ? 'Ativo' : 'Bloqueado'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            className={`ml-1 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                              u.is_active
                                ? 'text-red-700 hover:bg-red-50'
                                : 'text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            {u.is_active ? 'Bloquear' : 'Desbloquear'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl p-6 space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-display font-bold text-[#0f2544]">
                {editingUser ? `Editar usuário: ${editingUser.full_name}` : 'Novo usuário'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nome completo *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Usuário (login) *</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">E-mail corporativo *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Perfil de acesso *</label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="operator">Operador de Produção</option>
                    <option value="leader">Líder de Produção</option>
                    <option value="manager">Gestor de Setor</option>
                    <option value="director">Diretoria / Executivo</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Setor principal</label>
                  <select
                    value={sectorId}
                    onChange={(e) => setSectorId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Geral / Sem setor fixo</option>
                    {catalog.sectors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {editingUser ? 'Nova senha (deixe em branco para manter a atual)' : 'Senha inicial (mín. 6 caracteres) *'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    minLength={editingUser ? undefined : 6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={editingUser ? 'Opcional' : 'Digite a senha inicial'}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {(role === 'manager' || role === 'leader') && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="text-xs font-semibold text-[#0f2544]">Setores autorizados no escopo (RBAC)</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-700">
                    {catalog.sectors.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowedSectorIds.includes(s.id)}
                          onChange={() => toggleAllowedSector(s.id)}
                        />
                        <span>
                          {s.code} — {s.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {role !== 'admin' && (
                <div className="pt-3 border-t border-slate-100 space-y-2.5">
                  <div className="text-xs font-semibold text-[#0f2544]">Permissões granulares</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions.can_create_records}
                        onChange={(e) =>
                          setPermissions((p) => ({ ...p, can_create_records: e.target.checked }))
                        }
                      />
                      <span>Registrar nova produção</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(permissions.can_register_downtime)}
                        onChange={(e) =>
                          setPermissions((p) => ({ ...p, can_register_downtime: e.target.checked }))
                        }
                      />
                      <span>Registrar / encerrar paradas</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(permissions.can_register_losses)}
                        onChange={(e) =>
                          setPermissions((p) => ({ ...p, can_register_losses: e.target.checked }))
                        }
                      />
                      <span>Registrar perdas e refugos</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions.can_view_own_records}
                        onChange={(e) =>
                          setPermissions((p) => ({ ...p, can_view_own_records: e.target.checked }))
                        }
                      />
                      <span>Consultar próprios registros</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions.can_edit_own_records}
                        onChange={(e) =>
                          setPermissions((p) => ({ ...p, can_edit_own_records: e.target.checked }))
                        }
                      />
                      <span>Editar próprios registros</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions.can_view_sector_records}
                        onChange={(e) =>
                          setPermissions((p) => ({ ...p, can_view_sector_records: e.target.checked }))
                        }
                      />
                      <span>Consultar registros do setor</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(permissions.can_view_irog_dashboards)}
                        onChange={(e) =>
                          setPermissions((p) => ({ ...p, can_view_irog_dashboards: e.target.checked }))
                        }
                      />
                      <span>Visualizar dashboards IROG</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[42px] px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {saving ? 'Salvando...' : editingUser ? 'Salvar alterações' : 'Cadastrar usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
