import React from 'react';
import { Building2 } from 'lucide-react';
import { offlineCache } from '../../lib/offlineCache';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';

// O toggle de biometria vive só em Configurações → Segurança
// (SettingsSecurity.tsx), que pede a senha num campo mascarado de verdade.
// Havia uma segunda cópia desse toggle aqui que usava window.prompt() —
// sem máscara, a senha fica visível na tela pra quem estiver por perto.
export const SettingsMobile = React.memo(function SettingsMobile() {
  return (
    <div className="space-y-8">
      <h2 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Recursos do Aplicativo</h2>

      <div className="space-y-6">
        {/* Cache Management */}
        <div className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm text-emerald-500">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Gerenciamento de Dados Offline</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Verifique ou limpe as informações salvas no celular</p>
              </div>
            </div>
            
            <button 
              onClick={() => {
                offlineCache.clear();
                toast.success("Cache offline removido com sucesso!");
              }}
              className="px-6 py-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
            >
              Limpar Cache
            </button>
          </div>
          
          {Capacitor.isNativePlatform() && (
          <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs font-bold text-slate-500">
            <span className="uppercase text-[9px] tracking-wider text-slate-400">Status da Sincronização</span>
            <span className="uppercase text-emerald-600">Dados Protegidos Localmente</span>
          </div>
          )}
        </div>

      </div>
    </div>
  );
});
