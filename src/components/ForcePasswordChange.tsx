import React, { useState } from 'react';
import { KeyRound, Check, Loader2 } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { supabase } from '../lib/supabase';
import { Logo } from './Logo';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { isPasswordValid, passwordRequirementList } from '../lib/passwordPolicy';

/**
 * Tela cheia, intransponível, que aparece antes de qualquer outra coisa
 * quando `user_settings.must_change_password` está true — usada quando a
 * conta foi criada manualmente (ex.: cortesia pro amigo do Pedro) com uma
 * senha provisória escolhida por ele. A pessoa só sai daqui depois de
 * definir a própria senha.
 */
export function ForcePasswordChange({ children }: { children: React.ReactNode }) {
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (settingsLoading) return <>{children}</>;
  if (!settings.must_change_password) return <>{children}</>;

  const checklist = passwordRequirementList(newPassword);

  const handleSubmit = async () => {
    if (!isPasswordValid(newPassword)) {
      toast.error('A senha não atende a todos os requisitos de segurança!');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem!');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error('Erro ao definir senha: ' + error.message);
        return;
      }
      await updateSettings({ must_change_password: false });
      toast.success('Senha definida! Bem-vindo ao Represente-Se!');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
      <div className="max-w-md w-full space-y-8 relative z-10 py-10">
        <Logo size="lg" />

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-8 rounded-[40px] space-y-6 shadow-xl text-left">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <KeyRound className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter pt-2">
              Defina sua senha
            </h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
              Essa conta foi criada pra você com uma senha provisória. Antes de continuar, escolha uma senha só sua.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Nova senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Digite a nova senha"
              autoFocus
              className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
            />
            <div className="grid grid-cols-2 gap-2 mt-3 px-1 py-2 bg-slate-100/50 dark:bg-zinc-900/50 rounded-xl border border-slate-100 dark:border-zinc-800/40">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-2">
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0',
                    item.met ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-zinc-800 text-slate-400'
                  )}>
                    <Check className="w-2.5 h-2.5" />
                  </div>
                  <span className={cn(
                    'text-[8px] font-black uppercase tracking-wider transition-colors leading-none',
                    item.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-zinc-500'
                  )}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Confirmar nova senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirme a nova senha"
              className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-4 rounded-2xl font-black uppercase text-[12px] tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-600/20 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Definir senha e continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
