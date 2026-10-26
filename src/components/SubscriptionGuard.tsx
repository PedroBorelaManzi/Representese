import React, { useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CreditCard, ExternalLink, MessageCircle, Loader2, Sparkles, ArrowRight, LogOut, Clock, RefreshCw, Users, FileText, CalendarCheck, WifiOff, ShieldCheck } from 'lucide-react';
import { Logo } from './Logo';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import { isStoreApp } from '../lib/iapPolicy';
import { openManageSubscriptions } from '../lib/iap';

export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { settings, loading: settingsLoading, refetchSettings } = useSettings();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [, setTick] = useState(0);

  const blocked = settings.subscription_status === 'inactive'
    || settings.subscription_status === 'past_due'
    || settings.subscription_status === 'canceled';

  // Quem acabou de pagar cai aqui antes de o webhook do Asaas gravar o status
  // 'active'. Em vez de exigir recarregar a página, rechecamos sozinho (a cada 5s
  // por até 5 min, e ao voltar para a aba) enquanto o acesso estiver bloqueado.
  useEffect(() => {
    if (settingsLoading || !blocked || !user) return;
    const startedAt = Date.now();
    const tick = async () => {
      if (Date.now() - startedAt > 5 * 60 * 1000) return;
      setTick((n) => n + 1); // reavalia a janela de "acabou de pagar"
      const { data } = await supabase.from('user_entitlements')
        .select('subscription_status').eq('user_id', user.id).maybeSingle();
      // Só recarrega as configurações quando o status mudou de verdade — o
      // refetch liga o loading e faria a tela piscar a cada checagem.
      if (data && data.subscription_status !== settings.subscription_status) refetchSettings();
    };
    const interval = setInterval(tick, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [settingsLoading, blocked, user, settings.subscription_status, refetchSettings]);

  // Quem acabou de pagar no checkout (flag gravada pelo Checkout) vê "configurando"
  // em vez de "escolha um plano"/"pendência" enquanto o webhook ainda não gravou o status.
  const justPaid = (() => {
    try {
      const t = Number(sessionStorage.getItem('rm_just_paid'));
      return !!t && Date.now() - t < 5 * 60 * 1000;
    } catch { return false; }
  })();
  useEffect(() => {
    if (!blocked && !settingsLoading) { try { sessionStorage.removeItem('rm_just_paid'); } catch { /* ignora */ } }
  }, [blocked, settingsLoading]);

  // Se estiver carregando, não bloqueia ainda para evitar flashes
  if (settingsLoading) return <>{children}</>;

  if (blocked && justPaid) {
    return (
      <div data-testid="configurando-acesso" className="fixed inset-0 z-[9999] bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-8">
          <Logo size="lg" />
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-8 rounded-[40px] space-y-6 shadow-xl">
            <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <Loader2 className="w-10 h-10 animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Aguarde um instante</h1>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                Pagamento recebido! Estamos configurando o seu acesso. Isso leva só alguns segundos e a tela libera sozinha.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Quem nunca teve plano (plan_id 'none') é um lead novo; quem já teve e
  // perdeu o acesso vê uma tela de "reativar", e quem está com pagamento
  // atrasado (past_due) vê a de pendência — três situações, três telas.
  const hasHadPlan = !!settings.plan_id && settings.plan_id !== 'none';
  const isLead = settings.subscription_status === 'inactive' && !hasHadPlan;
  const isPastDue = settings.subscription_status === 'past_due';
  const isEnded = !isLead && !isPastDue; // canceled, ou inactive de quem já teve plano
  const firstName = String(user?.user_metadata?.full_name || '').trim().split(/\s+/)[0] || '';
  const planNames: Record<string, string> = { exclusivo: 'Acesso Exclusivo', profissional: 'Acesso Profissional', master: 'Acesso Master' };
  const planName = planNames[settings.plan_id] || '';
  const fimPeriodo = settings.current_period_end
    ? new Date(settings.current_period_end).toLocaleDateString('pt-BR')
    : null;

  const handleRegularize = async () => {
    if (!user) return;
    setIsGeneratingLink(true);
    
    try {
      // Chamada para a Edge Function
      const { data, error } = await supabase.functions.invoke('regularize-subscription', {
        body: { userId: user.id }
      });

      // Se houver erro na chamada (ex: rede ou função não encontrada)
      if (error) {
        console.error('Erro Supabase Function:', error);
        toast.error(`Erro de conexão: ${error.message || 'Verifique se a função está ativa.'}`);
        return;
      }

      // Se a função retornou erro lógico (ex: cliente não existe no Asaas)
      if (data && !data.success) {
        toast.error(`Erro no Asaas: ${data.message || 'Erro desconhecido'}`);
        return;
      }

      if (data && data.success && data.invoiceUrl) {
        toast.success("Fatura de regularização gerada!");
        setTimeout(() => {
          window.open(data.invoiceUrl, '_blank');
        }, 1000);
      } else {
        toast.error("Resposta inválida do servidor de pagamentos.");
      }
    } catch (err: any) {
      toast.error(`Erro crítico: ${err.message || 'Falha na comunicação'}`);
      console.error('Erro Catch:', err);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // Quem entrou com a conta errada (sem plano) precisa conseguir trocar de conta.
  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      navigate('/login', { replace: true });
    }
  };
  const signOutButton = (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      data-testid="guard-sair"
      className="mx-auto flex items-center justify-center gap-2 text-[12px] font-bold text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors disabled:opacity-50"
    >
      {isSigningOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
      Sair e entrar com outra conta
    </button>
  );

  if (isPastDue || isLead || isEnded) {
    const whatsappNumber = "5515997472785";
    const userEmail = user?.email || "não informado";
    
    // UI Amigável para LEADS novos (conta criada, nunca assinou)
    if (isLead) {
      const beneficios = [
        { icon: Users, texto: 'Clientes, contatos e histórico de compras num só lugar' },
        { icon: FileText, texto: 'Pedidos com catálogo e PDF na hora' },
        { icon: CalendarCheck, texto: 'Agenda de visitas com avisos de retorno' },
        { icon: WifiOff, texto: 'Funciona também sem internet' },
      ];
      return (
        <div data-testid="guard-lead" className="fixed inset-0 z-[9999] bg-slate-50 dark:bg-zinc-950 overflow-y-auto">
          <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="max-w-md w-full space-y-6 relative z-10">
              <Logo size="lg" />

              <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-8 rounded-[40px] space-y-6 shadow-xl">
                <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                  <Sparkles className="w-10 h-10" />
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {firstName ? `${firstName}, sua conta está pronta!` : 'Sua conta está pronta!'}
                  </h1>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                    Falta só escolher o plano para liberar o sistema. Seus dados de cadastro já estão salvos.
                  </p>
                </div>

                <ul className="text-left space-y-3">
                  {beneficios.map(({ icon: Icon, texto }) => (
                    <li key={texto} className="flex items-start gap-3 text-[13px] font-semibold text-slate-700 dark:text-zinc-300">
                      <span className="mt-0.5 w-7 h-7 shrink-0 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </span>
                      {texto}
                    </li>
                  ))}
                </ul>

                <div className="pt-1 space-y-2">
                  {/* /planos compra de verdade no iOS/Android via In-App
                      Purchase — não tem mais motivo pra mandar pro site. */}
                  <Link
                    to="/planos"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-5 rounded-2xl font-black uppercase text-[12px] tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-600/20"
                  >
                    Escolher meu plano
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  {!isStoreApp() && (
                    <p className="text-[11px] font-semibold text-slate-400 dark:text-zinc-500">7 dias de garantia: se não gostar, devolvemos 100% do valor.</p>
                  )}
                </div>

                <button
                  className="w-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 py-3 rounded-xl font-bold text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-500/20 transition-all"
                  onClick={() => window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Olá! Criei minha conta no Represente-Se! e tenho uma dúvida sobre os planos. Meu e-mail é: ${userEmail}`)}`, '_blank')}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Tirar dúvidas no WhatsApp
                </button>

                {user?.email && (
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 break-all">Conectado como {user.email}</p>
                )}
                {signOutButton}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // UI de Bloqueio para INADIMPLENTES (past_due)
    const whatsappMessage = encodeURIComponent(`Olá! ${isPastDue ? 'Estou com uma pendência no pagamento do meu acesso ao Represente-Se! e gostaria de regularizar.' : 'Minha assinatura do Represente-Se! terminou e gostaria de reativar.'} Meu e-mail é: ${userEmail}`);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

    // Pagamento atrasado: tom de aviso (âmbar), dados seguros, foco em regularizar.
    // Assinatura encerrada: tom neutro, foco em reativar.
    const Icone = isPastDue ? Clock : RefreshCw;
    const titulo = isPastDue ? 'Pagamento pendente' : 'Sua assinatura terminou';
    const texto = isPastDue
      ? `Não conseguimos confirmar o pagamento${planName ? ` do plano ${planName}` : ' da sua assinatura'}${fimPeriodo ? ` (vencimento em ${fimPeriodo})` : ''}. Assim que for regularizado, o acesso volta na hora.`
      : `${planName ? `O plano ${planName} não está mais ativo` : 'Sua assinatura não está mais ativa'}${fimPeriodo ? ` desde ${fimPeriodo}` : ''}. Para voltar a usar o sistema, é só reativar.`;
    const tom = isPastDue
      ? { card: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20 shadow-amber-500/10', icone: 'bg-amber-500 shadow-amber-500/30' }
      : { card: 'bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 shadow-slate-500/10', icone: 'bg-slate-700 shadow-slate-500/30' };

    return (
      <div data-testid={isPastDue ? 'guard-pendente' : 'guard-encerrada'} className="fixed inset-0 z-[9999] bg-white dark:bg-zinc-950 overflow-y-auto">
        <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-6 relative z-10">
          <Logo size="lg" />

          <div className={`${tom.card} border p-8 rounded-[40px] space-y-6 shadow-2xl`}>
            <div className={`w-20 h-20 ${tom.icone} text-white rounded-3xl flex items-center justify-center mx-auto shadow-lg`}>
              <Icone className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{titulo}</h1>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed">{texto}</p>
            </div>

            <div className="flex items-start gap-2.5 text-left bg-white/70 dark:bg-white/5 rounded-2xl p-4">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
              <p className="text-[12px] font-semibold text-slate-600 dark:text-zinc-300 leading-relaxed">
                Seus clientes, pedidos e anotações estão guardados e seguros. Nada foi apagado.
              </p>
            </div>

            {isStoreApp() ? (
              // No app iOS a recompra é sempre por In-App Purchase: levamos a
              // /planos (comprar ou restaurar). Quem assinou pela App Store
              // também pode abrir o gerenciamento nativo de assinaturas.
              <div className="space-y-3">
                <Link
                  to="/planos"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl"
                >
                  {isPastDue ? 'Regularizar / Restaurar compras' : 'Reativar / Restaurar compras'}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                {(settings.subscription_provider === 'ios_iap' || settings.subscription_provider === 'play_iap') && (
                  <button
                    onClick={() => openManageSubscriptions()}
                    className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 transition-all"
                  >
                    <CreditCard className="w-4 h-4" />
                    Gerenciar Assinatura
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {isEnded ? (
                  <Link
                    to="/planos"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl"
                  >
                    Reativar assinatura
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                <button
                  onClick={handleRegularize}
                  disabled={isGeneratingLink}
                  className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl disabled:opacity-50"
                >
                  {isGeneratingLink ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      {isPastDue ? 'Regularizar agora' : 'Reativar assinatura'}
                      <ExternalLink className="w-3.5 h-3.5 opacity-50" />
                    </>
                  )}
                </button>
                )}

                <button
                  className="w-full bg-emerald-500/10 text-emerald-600 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-500/20 transition-all"
                  onClick={() => window.open(whatsappUrl, '_blank')}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Falar com o suporte no WhatsApp
                </button>
              </div>
            )}
          </div>

          {isPastDue && (
            <p className="text-[11px] font-semibold text-slate-400 leading-relaxed">
              Assim que o pagamento da fatura for identificado, seu acesso será liberado automaticamente.
            </p>
          )}
          {signOutButton}
        </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
