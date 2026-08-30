import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, Lock, Check, BarChart3, MapPin } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { hashCommissionPassword } from '../../lib/commissionPrivacy';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useConsent } from '../../hooks/useConsent';
import { setConsent } from '../../lib/cookieConsent';
import { capturarLocalizacao, limparLocalizacao } from '../../lib/geoTracking';

export const SettingsPrivacy = React.memo(function SettingsPrivacy() {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);

  const hasPassword = !!settings.commission_password_hash;
  const isHiding = !!settings.hide_commissions;

  const { categorias, decididoEm } = useConsent();

  const toggleAnalytics = () => {
    const novo = !categorias.analiticos;
    setConsent({ preferencias: categorias.preferencias, analiticos: novo }, 'settings_change');
    toast.success(
      novo
        ? 'Análise de uso ativada. Obrigado por ajudar a melhorar o app!'
        : 'Análise de uso desativada. Nenhum dado de navegação será coletado.'
    );
  };

  const compartilhaLocal = settings.share_location !== false;
  const toggleLocal = async () => {
    if (!user) return;
    const novo = !compartilhaLocal;
    await updateSettings({ share_location: novo });
    if (novo) {
      toast.success('Localização ativada.');
      capturarLocalizacao(user.id, true);
    } else {
      toast.success('Localização desativada. O último ponto foi apagado.');
      limparLocalizacao(user.id);
    }
  };

  const savePassword = async () => {
    if (!user) return;
    if (newPassword.length < 4) {
      toast.error('A senha precisa ter pelo menos 4 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }
    setSaving(true);
    try {
      const hash = await hashCommissionPassword(newPassword, user.id);
      await updateSettings({ commission_password_hash: hash, hide_commissions: true });
      toast.success('Senha salva! Valores de comissão agora ficam escondidos.');
      setNewPassword('');
      setConfirmPassword('');
      setEditingPassword(false);
    } catch {
      toast.error('Erro ao salvar a senha.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (isHiding) {
      // Desliga sem apagar a senha — liga de novo depois sem precisar recriar.
      try {
        await updateSettings({ hide_commissions: false });
        toast.success('Comissões visíveis novamente.');
      } catch {
        toast.error('Erro ao atualizar.');
      }
      return;
    }
    if (hasPassword) {
      try {
        await updateSettings({ hide_commissions: true });
        toast.success('Comissões agora ficam escondidas até digitar a senha.');
      } catch {
        toast.error('Erro ao atualizar.');
      }
    } else {
      setEditingPassword(true);
    }
  };

  return (
    <div className="space-y-8">
      <h2 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Privacidade</h2>

      <div className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm text-amber-500">
              <EyeOff className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Esconder Comissão</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Borra os valores de comissão até digitar a senha</p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            className={cn(
              "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
              isHiding ? "bg-red-50 dark:bg-red-900/20 text-red-500" : "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
            )}
          >
            {isHiding ? "Desativar" : "Ativar"}
          </button>
        </div>

        {hasPassword && !editingPassword && (
          <button
            onClick={() => setEditingPassword(true)}
            className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors"
          >
            Trocar senha de revelar comissão
          </button>
        )}

        {editingPassword && (
          <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-500">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase leading-relaxed">
                {hasPassword ? "Definir uma nova senha" : "Defina a senha usada pra revelar a comissão"}
              </p>
            </div>
            <div className="space-y-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nova senha (mín. 4 caracteres)"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar senha"
                onKeyDown={(e) => e.key === 'Enter' && savePassword()}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setEditingPassword(false); setNewPassword(''); setConfirmPassword(''); }}
                className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={savePassword}
                disabled={saving}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? "Salvando..." : <><Check className="w-4 h-4" /> Salvar</>}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm text-sky-500">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Análise de Uso</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                Métricas de navegação (PostHog) para melhorar o app
              </p>
            </div>
          </div>
          <button
            onClick={toggleAnalytics}
            className={cn(
              "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
              categorias.analiticos
                ? "bg-red-50 dark:bg-red-900/20 text-red-500"
                : "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
            )}
          >
            {categorias.analiticos ? "Desativar" : "Ativar"}
          </button>
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight leading-relaxed">
          O monitoramento de erros (Sentry) roda sob legítimo interesse e não coleta perfil.{' '}
          <Link to="/cookies" className="text-emerald-600 underline">Política de Cookies</Link>
          {decididoEm && (
            <> · escolha registrada em {new Date(decididoEm).toLocaleDateString('pt-BR')}</>
          )}
        </p>
      </div>

      <div className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm text-rose-500">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Compartilhar Localização</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                Centraliza o mapa em você e mostra sua cobertura ao Represente-Se
              </p>
            </div>
          </div>
          <button
            onClick={toggleLocal}
            className={cn(
              "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
              compartilhaLocal
                ? "bg-red-50 dark:bg-red-900/20 text-red-500"
                : "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
            )}
          >
            {compartilhaLocal ? "Desativar" : "Ativar"}
          </button>
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight leading-relaxed">
          Só enquanto o app ou o site está aberto — nunca em segundo plano.{' '}
          <Link to="/privacy" className="text-emerald-600 underline">Política de Privacidade</Link>
          {settings.last_location_at && (
            <> · último ponto em {new Date(settings.last_location_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</>
          )}
        </p>
      </div>
    </div>
  );
});
