import { useMemo, useState } from 'react';
import { CalendarClock, CreditCard, ExternalLink, Loader2, X } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

const WARNING_WINDOW_DAYS = 15;

/**
 * Aviso não-bloqueante de renovação para planos anual/semestral. O mensal
 * renova sozinho no cartão (assinatura recorrente no Asaas), então não
 * precisa disso — mas o anual/semestral é uma cobrança única, sem cobrança
 * automática de novo ao vencer (decisão explícita: só avisar, nunca cobrar
 * sozinho). Sem este aviso, a única sinalização de vencimento era a tela de
 * bloqueio total (SubscriptionGuard) já DEPOIS do plano vencer.
 */
export default function RenewalBanner() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const daysLeft = useMemo(() => {
    if (!settings.current_period_end) return null;
    const diffMs = new Date(settings.current_period_end).getTime() - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }, [settings.current_period_end]);

  const isAnnualLike = settings.billing_cycle === 'ANNUAL' || settings.billing_cycle === 'SEMIANNUAL';
  const shouldShow =
    !dismissed &&
    settings.subscription_status === 'active' &&
    isAnnualLike &&
    daysLeft !== null &&
    daysLeft >= 0 &&
    daysLeft <= WARNING_WINDOW_DAYS;

  // "Dispensar" vale só pro dia — o vencimento se aproximando é importante
  // demais pra sumir de vez com um clique sem querer.
  const dismissKey = `renewal_banner_dismissed_${settings.current_period_end}`;
  useState(() => {
    if (localStorage.getItem(dismissKey) === new Date().toDateString()) setDismissed(true);
  });

  if (!shouldShow) return null;

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, new Date().toDateString());
    setDismissed(true);
  };

  const handleRenew = async () => {
    if (!user) return;
    setIsGeneratingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke('regularize-subscription', {
        body: { userId: user.id },
      });
      if (error) {
        toast.error(`Erro de conexão: ${error.message || 'Tente novamente em instantes.'}`);
        return;
      }
      if (data && !data.success) {
        toast.error(`Erro no Asaas: ${data.message || 'Erro desconhecido'}`);
        return;
      }
      if (data?.success && data.invoiceUrl) {
        toast.success('Fatura de renovação gerada!');
        setTimeout(() => window.open(data.invoiceUrl, '_blank'), 800);
      } else {
        toast.error('Resposta inválida do servidor de pagamentos.');
      }
    } catch (err: any) {
      toast.error(`Erro crítico: ${err.message || 'Falha na comunicação'}`);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const cycleLabel = settings.billing_cycle === 'SEMIANNUAL' ? 'semestral' : 'anual';
  const dateLabel = settings.current_period_end
    ? new Date(settings.current_period_end).toLocaleDateString('pt-BR')
    : '';

  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-5 py-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-amber-500 text-white flex items-center justify-center">
          <CalendarClock className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
            {daysLeft === 0 ? 'Seu plano vence hoje' : `Seu plano ${cycleLabel} vence em ${daysLeft} dia${daysLeft === 1 ? '' : 's'}`}
          </p>
          <p className="text-xs font-medium text-amber-700/80 dark:text-amber-300/70">
            Vencimento em {dateLabel} · renove agora pra não perder o acesso.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleRenew}
          disabled={isGeneratingLink}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
        >
          {isGeneratingLink ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <CreditCard className="w-3.5 h-3.5" />
              Renovar agora
              <ExternalLink className="w-3 h-3 opacity-60" />
            </>
          )}
        </button>
        <button
          onClick={handleDismiss}
          className="p-2 rounded-xl text-amber-700/60 hover:text-amber-900 hover:bg-amber-500/10 dark:text-amber-300/60 dark:hover:text-amber-200 transition-all"
          title="Lembrar amanhã"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
