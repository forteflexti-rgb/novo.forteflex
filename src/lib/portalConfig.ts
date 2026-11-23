import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

export interface PortalPillar {
  title: string;
  subtitle: string;
}

export interface PortalConfig {
  logoUrl: string;
  companyName: string;
  tagline: string;
  heading: string;
  description: string;
  accentColor: string;
  pillars: [PortalPillar, PortalPillar, PortalPillar];
  updatedAt?: string;
}

export const DEFAULT_PORTAL_CONFIG: PortalConfig = {
  logoUrl: '/forteflex-logo.png',
  companyName: 'Forteflex',
  tagline: 'Plataforma de Gestão Industrial',
  heading: 'Do apontamento em linha aos indicadores gerenciais em tempo real.',
  description:
    'Registre produção por turno, controle refugos e motivos de parada e acompanhe metas com rastreabilidade completa por operador e setor.',
  accentColor: '#0a3832',
  pillars: [
    { title: 'Chão de Fábrica', subtitle: 'Lançamento guiado' },
    { title: 'Rastreabilidade', subtitle: 'Auditoria por usuário' },
    { title: 'Gestão', subtitle: 'Dashboards & Excel' },
  ],
};

const STORAGE_KEY = 'novo_forteflex_portal_config';
const EVENT_NAME = 'forteflex_portal_config_change';

export function getPortalConfig(): PortalConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PORTAL_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PORTAL_CONFIG,
      ...parsed,
      pillars: Array.isArray(parsed.pillars) && parsed.pillars.length === 3
        ? parsed.pillars
        : DEFAULT_PORTAL_CONFIG.pillars,
    };
  } catch {
    return DEFAULT_PORTAL_CONFIG;
  }
}

export async function savePortalConfig(config: PortalConfig): Promise<void> {
  const dataToSave: PortalConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: dataToSave }));
  } catch (err) {
    console.warn('Erro ao salvar localmente o portal:', err);
  }

  // Sincroniza remotamente se Supabase estiver ativo
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;
      if (currentUserId) {
        const { data: prof } = await supabase.from('profiles').select('permissions').eq('id', currentUserId).maybeSingle();
        if (prof) {
          const currentPerms = prof.permissions || {};
          await supabase.from('profiles').update({
            permissions: { ...currentPerms, portal_config: dataToSave }
          }).eq('id', currentUserId);
        }
      }
    } catch (err) {
      console.warn('Erro ao sincronizar portal_config no Supabase:', err);
    }
  }
}

export function resetPortalConfig(): PortalConfig {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: DEFAULT_PORTAL_CONFIG }));
  } catch {}
  return DEFAULT_PORTAL_CONFIG;
}

export function usePortalConfig(): PortalConfig {
  const [config, setConfig] = useState<PortalConfig>(() => getPortalConfig());

  useEffect(() => {
    const handler = (e: any) => {
      if (e?.detail) {
        setConfig(e.detail);
      } else {
        setConfig(getPortalConfig());
      }
    };

    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return config;
}
