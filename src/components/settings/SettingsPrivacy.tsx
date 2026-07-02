import React, { useState } from 'react';
import { FileDown, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

/* Privacidade & Dados (LGPD): portabilidade (exportar tudo em JSON)
   e direito ao esquecimento (excluir a conta definitivamente). */
export const SettingsPrivacy = React.memo(function SettingsPrivacy() {
  const { user, signOut } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleExport = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const tables = ['clients', 'orders', 'appointments', 'daily_notes', 'user_settings'] as const;
      const exportData: Record<string, unknown> = {
        exportado_em: new Date().toISOString(),
        email: user.email,
      };

      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').eq('user_id', user.id);
        if (error) throw error;
        exportData[table] = data || [];
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `representese-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Dados exportados com sucesso!');
    } catch (e: any) {
      console.error('Erro na exportação:', e);
      toast.error('Erro ao exportar dados. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== 'EXCLUIR') {
      toast.error('Digite EXCLUIR para confirmar.');
      return;
    }
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.message || 'Falha na exclusão');

      toast.success('Conta excluída. Sentiremos sua falta!');
      await signOut();
      window.location.href = '/';
    } catch (e: any) {
      console.error('Erro ao excluir conta:', e);
      toast.error('Erro ao excluir a conta. Fale com o suporte: pedroborelamanzi@gmail.com');
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <h2 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Privacidade & Dados</h2>
      <div className="space-y-4">

        {/* Exportar dados (portabilidade — LGPD art. 18) */}
        <div className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm text-emerald-500">
                <FileDown className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Exportar Meus Dados</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Baixe clientes, pedidos e agenda em JSON</p>
              </div>
            </div>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2 shrink-0"
            >
              {isExporting && <Loader2 className="w-3 h-3 animate-spin" />}
              {isExporting ? 'Exportando...' : 'Exportar'}
            </button>
          </div>
        </div>

        {/* Excluir conta (direito ao esquecimento — LGPD art. 18) */}
        <div className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm text-red-500">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Excluir Minha Conta</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Apaga tudo definitivamente — sem volta</p>
              </div>
            </div>
            {!showDeleteConfirm && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all shrink-0"
              >
                Excluir
              </button>
            )}
          </div>

          {showDeleteConfirm && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="pt-4 border-t border-red-100 dark:border-red-900/30 space-y-4"
            >
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase leading-relaxed">
                  Isso apaga PERMANENTEMENTE seus clientes, pedidos, agenda, arquivos e a assinatura será cancelada. Exporte seus dados antes. Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="confirm-delete" className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                  Digite EXCLUIR para confirmar
                </label>
                <div className="flex gap-2">
                  <input
                    id="confirm-delete"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    placeholder="EXCLUIR"
                    className="flex-1 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none text-center tracking-widest focus:ring-4 focus:ring-red-500/10 transition-all"
                  />
                  <button
                    onClick={handleDeleteAccount}
                    disabled={isDeleting || confirmText !== 'EXCLUIR'}
                    className="bg-red-600 text-white px-6 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-40 flex items-center gap-2"
                  >
                    {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                    {isDeleting ? 'Excluindo...' : 'Confirmar'}
                  </button>
                </div>
              </div>
              <button
                onClick={() => { setShowDeleteConfirm(false); setConfirmText(''); }}
                className="text-[9px] font-black text-slate-400 uppercase hover:text-slate-600 dark:hover:text-white transition-colors block text-center w-full"
              >
                Cancelar
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
});
