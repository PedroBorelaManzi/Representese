import React, { useEffect, useState } from 'react';
import { Gift, Copy, Users, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { isIOSApp } from '../../lib/iapPolicy';

interface ReferralRow {
  referred_user_id: string;
  created_at: string;
  platform: 'web' | 'android' | 'ios';
}

// Programa de indicação: cada assinante pagante gera um código próprio (é
// um cupom de desconto, por trás — reaproveita o mesmo mecanismo do
// checkout). Quem usa o código ganha 10% na 1ª fatura; quem indicou ganha
// 10% recorrente por indicado pagante ativo, até 20% (2 indicados),
// enquanto esse indicado continuar pagando. No site/Android o desconto se
// ajusta sozinho na cobrança; no iOS a Apple exige que a própria pessoa
// resgate dentro do app — ver nota abaixo.
export const SettingsReferral = React.memo(function SettingsReferral() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const iosApp = isIOSApp();

  const isPayingSubscriber = settings.subscription_status === 'active' || settings.subscription_status === 'past_due';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const { data } = await supabase.from('coupons').select('code').eq('referrer_user_id', user.id).maybeSingle();
      if (!cancelled) {
        setCode(data?.code || null);
        setLoading(false);
      }
      const { data: refs } = await supabase
        .from('referrals')
        .select('referred_user_id, created_at, platform')
        .eq('referrer_user_id', user.id)
        .order('created_at', { ascending: false });
      if (!cancelled) setReferrals((refs || []) as ReferralRow[]);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_my_referral_code');
      if (error) throw error;
      setCode(data as string);
      toast.success('Código de indicação gerado!');
    } catch (err: any) {
      toast.error(err.message?.includes('assinantes pagantes')
        ? 'Assine um plano pra gerar seu código de indicação.'
        : 'Erro ao gerar código. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const referralLink = code ? `https://www.representese.com/register?ref=${code}` : '';

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copiado!`),
      () => toast.error('Não foi possível copiar.')
    );
  };

  const pct = settings.referral_discount_pct || 0;
  const appliedPct = settings.referral_discount_applied_pct || 0;
  const hasUnclaimedIosDiscount = iosApp && pct > appliedPct;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
          Indique e Ganhe
        </h2>
      </div>

      <div className="p-6 md:p-10 rounded-3xl md:rounded-[48px] border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/20">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm">
            <Gift className="w-7 h-7 text-emerald-500" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.3em]">Como funciona</p>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
              10% pra você, 10% pra quem indicar
            </h3>
          </div>
        </div>
        <p className="text-xs font-medium text-slate-600 dark:text-zinc-300 leading-relaxed">
          Compartilhe seu código com outro representante. Quando ele assinar, ganha <strong>10% na primeira fatura</strong> —
          e você ganha <strong>10% de desconto recorrente</strong> enquanto ele continuar assinante, acumulando até{' '}
          <strong>20% (2 indicados)</strong>.
        </p>
      </div>

      {!isPayingSubscriber ? (
        <div className="p-8 rounded-3xl border border-dashed border-slate-200 dark:border-zinc-800 text-center">
          <p className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            Assine um plano pra liberar seu código de indicação.
          </p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : !code ? (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-5 rounded-[24px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 active:scale-98 transition-all disabled:opacity-60"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Gerar meu código de indicação
        </button>
      ) : (
        <div className="space-y-4">
          <div className="p-5 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
            <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Seu código</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-lg font-black text-slate-900 dark:text-white tracking-widest">{code}</span>
              <button onClick={() => copyToClipboard(code, 'Código')} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 text-slate-500 hover:text-emerald-600 transition-colors">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-5 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
            <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Link pra compartilhar</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs font-bold text-slate-600 dark:text-zinc-300 truncate">{referralLink}</span>
              <button onClick={() => copyToClipboard(referralLink, 'Link')} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 text-slate-500 hover:text-emerald-600 transition-colors shrink-0">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-3xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-100 dark:border-zinc-800 text-center">
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{referrals.length}</p>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Indicados</p>
            </div>
            <div className="p-5 rounded-3xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-100 dark:border-zinc-800 text-center">
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{pct}%</p>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Desconto atual</p>
            </div>
          </div>

          {hasUnclaimedIosDiscount && (
            <div className="p-5 rounded-3xl border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 leading-relaxed">
                Você já tem {pct}% de desconto conquistado! No iOS o resgate ainda não está disponível por aqui —
                em breve você vai poder aplicar isso direto no app.
              </p>
            </div>
          )}

          {referrals.length > 0 && (
            <div className="p-5 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Users className="w-3.5 h-3.5" /> Pessoas que usaram seu código
              </p>
              <div className="space-y-2">
                {referrals.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-zinc-300">
                    <span>Indicado #{i + 1}</span>
                    <span className="text-slate-400 dark:text-zinc-500 uppercase text-[10px]">{r.platform}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
