import { useEffect, useState } from 'react';
import { Gift, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import {
  REFERRAL_NUDGE_CLICK_DAYS,
  REFERRAL_NUDGE_DISMISS_DAYS,
  readReferralNudgeHiddenUntil,
  shouldShowReferralNudge,
  writeReferralNudgeHiddenUntil,
} from '../lib/referralNudge';

/**
 * Cartãozinho no canto da página de início chamando para o programa de indicação.
 * Fica acima do botão do chat de suporte; X silencia por 14 dias, clicar por 30.
 */
export function ReferralNudge({ onOpen }: { onOpen: () => void }) {
  const { pathname } = useLocation();
  const { settings } = useSettings();
  const [ready, setReady] = useState(false);
  const [hiddenUntil, setHiddenUntil] = useState<number | null>(() => readReferralNudgeHiddenUntil());

  // Espera um pouco depois de abrir a tela, para não competir com o carregamento nem com o onboarding.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 5000);
    return () => clearTimeout(t);
  }, []);

  if (!ready || !shouldShowReferralNudge({ pathname, subscriptionStatus: settings.subscription_status, hiddenUntil })) return null;

  const hide = (days: number) => {
    writeReferralNudgeHiddenUntil(days);
    setHiddenUntil(readReferralNudgeHiddenUntil());
  };

  return (
    <div
      className="fixed right-4 sm:right-6 z-[8000] w-[min(280px,calc(100vw-2rem))] animate-in fade-in slide-in-from-bottom-2 duration-500"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)' }}
    >
      <div className="relative bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl shadow-xl shadow-emerald-600/10 pl-3 pr-9 py-3">
        <button
          onClick={() => hide(REFERRAL_NUDGE_DISMISS_DAYS)}
          aria-label="Dispensar aviso de indicação"
          className="absolute top-2 right-2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            hide(REFERRAL_NUDGE_CLICK_DAYS);
            onOpen();
          }}
          className="flex items-center gap-3 text-left w-full"
        >
          <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0">
            <Gift className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white leading-tight">
              Indique e ganhe desconto
            </span>
            <span className="block text-[11px] font-medium text-slate-500 dark:text-zinc-400 leading-snug mt-0.5">
              10% por amigo que assinar, até 20%.
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
