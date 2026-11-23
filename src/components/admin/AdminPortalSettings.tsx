import React, { useState } from 'react';
import {
  Palette,
  Image as ImageIcon,
  Type,
  CheckCircle2,
  RotateCcw,
  UploadCloud,
  Eye,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  getPortalConfig,
  savePortalConfig,
  resetPortalConfig,
  DEFAULT_PORTAL_CONFIG,
  type PortalConfig,
} from '../../lib/portalConfig';

const COLOR_PRESETS = [
  { name: 'Verde Água (Padrão)', value: '#0a3832' },
  { name: 'Verde Floresta', value: '#064e3b' },
  { name: 'Azul Industrial', value: '#0f2544' },
  { name: 'Grafite Escuro', value: '#1e293b' },
  { name: 'Azul Petróleo', value: '#0e495a' },
];

export function AdminPortalSettings() {
  const [config, setConfig] = useState<PortalConfig>(() => getPortalConfig());
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'logo' | 'texts' | 'colors'>('logo');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setConfig((prev) => ({ ...prev, logoUrl: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await savePortalConfig(config);
    setSavedMessage('Configurações do portal e logotipo atualizados com sucesso!');
    setTimeout(() => setSavedMessage(null), 4000);
  };

  const handleReset = () => {
    if (window.confirm('Deseja realmente restaurar os textos e logotipo originais da Forteflex?')) {
      const reset = resetPortalConfig();
      setConfig(reset);
      setSavedMessage('Padrão original do portal restaurado.');
      setTimeout(() => setSavedMessage(null), 4000);
    }
  };

  const updatePillar = (index: number, field: 'title' | 'subtitle', value: string) => {
    setConfig((prev) => {
      const newPillars = [...prev.pillars] as [any, any, any];
      newPillars[index] = { ...newPillars[index], [field]: value };
      return { ...prev, pillars: newPillars };
    });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-teal-50/50 to-white">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600/10 text-teal-800 flex items-center justify-center shrink-0">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[11px] font-semibold mb-1">
              <Sparkles className="w-3 h-3" /> Exclusivo para Administradores
            </div>
            <h2 className="text-base font-display font-bold text-slate-900">
              Personalização do Portal de Acesso e Marca
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Altere o logotipo oficial, textos institucionais da tela de entrada e a cor de destaque do sistema.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar Padrão</span>
        </button>
      </div>

      {savedMessage && (
        <div className="mx-6 mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedMessage}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-6 pt-2 gap-4 text-xs font-medium text-slate-600">
        <button
          type="button"
          onClick={() => setActiveTab('logo')}
          className={`py-3 flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'logo'
              ? 'border-teal-600 text-teal-800 font-semibold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Logotipo da Empresa</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('texts')}
          className={`py-3 flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'texts'
              ? 'border-teal-600 text-teal-800 font-semibold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Type className="w-4 h-4" />
          <span>Textos do Portal</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('colors')}
          className={`py-3 flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'colors'
              ? 'border-teal-600 text-teal-800 font-semibold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Cores Institucionais</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="p-6 space-y-6">
        {/* TAB 1: LOGOTIPO */}
        {activeTab === 'logo' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Upload de Novo Logotipo
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-teal-500 hover:bg-teal-50/20 rounded-xl p-6 text-center cursor-pointer transition-colors">
                    <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-xs font-medium text-slate-700">
                      Clique para selecionar a imagem
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1">
                      PNG, SVG, JPG ou WebP (Recomendado fundo transparente, máx 2MB)
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ou informe a URL da Imagem
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={config.logoUrl}
                      onChange={(e) => setConfig((p) => ({ ...p, logoUrl: e.target.value }))}
                      placeholder="/forteflex-logo.png"
                      className="flex-1 min-h-[38px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                    />
                    <button
                      type="button"
                      onClick={() => setConfig((p) => ({ ...p, logoUrl: DEFAULT_PORTAL_CONFIG.logoUrl }))}
                      className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer whitespace-nowrap"
                    >
                      Usar Oficial
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome da Empresa
                  </label>
                  <input
                    type="text"
                    value={config.companyName}
                    onChange={(e) => setConfig((p) => ({ ...p, companyName: e.target.value }))}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Previews */}
              <div className="space-y-4">
                <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-teal-600" />
                  <span>Pré-visualização do Logotipo</span>
                </div>

                {/* Preview fundo escuro (como na barra lateral) */}
                <div
                  className="p-5 rounded-xl flex flex-col justify-center items-center text-center shadow-inner"
                  style={{ backgroundColor: config.accentColor || '#0a3832' }}
                >
                  <span className="text-[10px] uppercase tracking-wider text-teal-200 font-semibold mb-3">
                    Exibição na Barra Lateral (Fundo Escuro)
                  </span>
                  <div className="bg-white/95 rounded-lg px-3 py-1.5 shadow-sm inline-flex items-center justify-center border border-white/20">
                    <img
                      src={config.logoUrl || '/forteflex-logo.png'}
                      alt="Preview"
                      className="h-7 max-w-[200px] object-contain"
                    />
                  </div>
                </div>

                {/* Preview fundo claro */}
                <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-center items-center text-center">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
                    Exibição em Fundo Claro
                  </span>
                  <img
                    src={config.logoUrl || '/forteflex-logo.png'}
                    alt="Preview"
                    className="h-8 max-w-[210px] object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TEXTOS DO PORTAL */}
        {activeTab === 'texts' && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tag / Linha Fina Superior
              </label>
              <input
                type="text"
                value={config.tagline}
                onChange={(e) => setConfig((p) => ({ ...p, tagline: e.target.value }))}
                placeholder="Plataforma de Gestão Industrial"
                className="w-full min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <span className="text-[11px] text-slate-400">Texto pequeno exibido logo acima do título principal.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Título Principal de Boas-Vindas
              </label>
              <input
                type="text"
                value={config.heading}
                onChange={(e) => setConfig((p) => ({ ...p, heading: e.target.value }))}
                placeholder="Do apontamento em linha aos indicadores gerenciais em tempo real."
                className="w-full min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descrição Institucional
              </label>
              <textarea
                rows={3}
                value={config.description}
                onChange={(e) => setConfig((p) => ({ ...p, description: e.target.value }))}
                className="w-full p-3 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-700 mb-3">
                Os 3 Pilares em Destaque no Rodapé da Tela de Entrada
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {config.pillars.map((pillar, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Pilar {idx + 1}</span>
                    <input
                      type="text"
                      value={pillar.title}
                      onChange={(e) => updatePillar(idx, 'title', e.target.value)}
                      placeholder="Título"
                      className="w-full min-h-[32px] px-2.5 py-1 text-xs border border-slate-300 rounded bg-white font-medium"
                    />
                    <input
                      type="text"
                      value={pillar.subtitle}
                      onChange={(e) => updatePillar(idx, 'subtitle', e.target.value)}
                      placeholder="Subtítulo descritivo"
                      className="w-full min-h-[32px] px-2.5 py-1 text-xs border border-slate-300 rounded bg-white text-slate-600"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CORES INSTITUCIONAIS */}
        {activeTab === 'colors' && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Paleta de Cores da Barra Lateral e Portal
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setConfig((p) => ({ ...p, accentColor: preset.value }))}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                      config.accentColor === preset.value
                        ? 'border-teal-600 ring-2 ring-teal-500/20 bg-teal-50/30'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-lg shadow-sm border border-black/10"
                      style={{ backgroundColor: preset.value }}
                    />
                    <span className="text-[11px] font-medium text-slate-700 text-center leading-tight">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <label htmlFor="accent-color-picker" className="text-xs font-semibold text-slate-700 cursor-pointer">
                Cor Personalizada:
              </label>
              <input
                id="accent-color-picker"
                type="color"
                value={config.accentColor}
                onChange={(e) => setConfig((p) => ({ ...p, accentColor: e.target.value }))}
                className="w-10 h-10 rounded border border-slate-300 cursor-pointer"
              />
              <span className="font-mono text-xs text-slate-600 uppercase">{config.accentColor}</span>
            </div>
          </div>
        )}

        {/* Submit bar */}
        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            As alterações são salvas e propagadas automaticamente para todos os usuários do sistema.
          </span>
          <button
            type="submit"
            className="w-full sm:w-auto px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Salvar Alterações do Portal</span>
          </button>
        </div>
      </form>
    </section>
  );
}
