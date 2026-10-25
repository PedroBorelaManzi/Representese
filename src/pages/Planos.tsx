import React, { useState, useEffect } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  Sparkles,
  Crown,
  ShieldCheck,
  RefreshCw,
  CalendarClock,
  ChevronDown,
  Check,
  Ticket,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Logo } from "../components/Logo";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { cn } from "../lib/utils";
import { metaAddToCart } from "../lib/metaPixel";
import { plans } from "../lib/plansData";
import { PlanCards } from "../components/plans/PlanCards";
import { usePageMeta } from "../hooks/usePageMeta";
import { isStoreApp, store } from "../lib/iapPolicy";
import { supabase } from "../lib/supabase";
import { loadLeadData } from "../lib/leadStorage";
import { FunnelPoll } from "../components/FunnelPoll";
import { loadIosPlanPrices, purchasePlan, restorePurchases, openManageSubscriptions, redeemOfferCode, IosPlanPrices } from "../lib/iap";

const faqItems = [
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Não há fidelidade nem multa de cancelamento. Você pode cancelar a qualquer momento pelo suporte, e o acesso continua até o fim do período já pago.",
  },
  {
    q: "Como funciona o teste de 7 dias?",
    a: "Você usa o sistema completo por 7 dias sem cobrança. A cobrança só acontece automaticamente após esse período, conforme o plano e ciclo (mensal ou anual) escolhidos no cadastro.",
  },
  {
    q: "Posso trocar de plano depois?",
    a: "Sim, a qualquer momento. Se você representa mais empresas do que seu plano permite, é só fazer upgrade — você paga apenas a diferença entre os planos e as próximas cobranças já vêm no valor do plano novo.",
  },
  {
    q: "O que acontece se eu ultrapassar o limite de empresas do meu plano?",
    a: "Você recebe um aviso no painel e pode fazer upgrade a qualquer momento. Seus dados nunca são apagados ou bloqueados por causa disso.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Sim. Toda a infraestrutura roda em nuvem com criptografia e backups automáticos, e cada conta só acessa os próprios dados — clientes, pedidos e agenda ficam isolados por usuário.",
  },
];

const trustItems = [
  { icon: ShieldCheck, title: "7 dias de garantia", desc: "Satisfação garantida ou seu dinheiro de volta." },
  { icon: RefreshCw, title: "Sem fidelidade", desc: "Cancele quando quiser, sem multa." },
  { icon: CalendarClock, title: "Cobrança só após o teste", desc: "Após os 7 dias, a renovação é automática conforme o plano." },
];

export default function Planos() {
  usePageMeta(
    "Planos e Preços",
    "Conheça os planos do Represente-Se! — de R$ 97/mês, sem fidelidade. Escolha o ideal para o número de empresas que você representa.",
    "/planos"
  );
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { user, signOut } = useAuth();
  const { settings, refetchSettings } = useSettings();
  const navigate = useNavigate();
  const iosApp = isStoreApp();
  const [iosPrices, setIosPrices] = useState<IosPlanPrices>({});
  const [iosLoadError, setIosLoadError] = useState<string | null>(null);
  const [iosLoading, setIosLoading] = useState(false);
  const [purchasingPlanId, setPurchasingPlanId] = useState<string | null>(null);
  // iOS: tela de confirmação entre escolher o plano e abrir a folha da Apple.
  const [confirmPlan, setConfirmPlan] = useState<typeof plans[0] | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const carregarPrecosIos = async () => {
    setIosLoading(true);
    setIosLoadError(null);
    const { prices, error } = await loadIosPlanPrices();
    setIosPrices(prices);
    setIosLoadError(error ?? null);
    setIosLoading(false);
  };

  useEffect(() => {
    if (!iosApp) return;
    void carregarPrecosIos();
  }, [iosApp]);

  // Comprado via App Store, quem cuida de reembolso é a própria Apple (não
  // temos como devolver o valor de uma compra IAP), e não existe o teste de
  // 7 dias sem cobrança que o Asaas oferece — por isso essas duas seções
  // trocam de texto no iOS, pra não prometer algo que o app não cumpre ali.
  const displayFaqItems = iosApp
    ? faqItems.map((item) =>
        item.q === "Como funciona o teste de 7 dias?"
          ? { q: "Tem período de teste no app?", a: `A compra pela ${store().name} é cobrada na hora, sem período de teste gratuito. ${store().refund}` }
          : item
      )
    : faqItems;
  const displayTrustItems = iosApp
    ? [
        { icon: ShieldCheck, title: "Compra segura", desc: `Processada e protegida pela própria ${store().name}.` },
        { icon: RefreshCw, title: "Sem fidelidade", desc: "Cancele quando quiser, sem multa." },
        { icon: CalendarClock, title: "Renovação automática", desc: "Cobrança recorrente conforme o plano, até você cancelar." },
      ]
    : trustItems;

  const [restoring, setRestoring] = useState(false);
  const handleRestore = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setRestoring(true);
    const result = await restorePurchases();
    if (!result.success) {
      setRestoring(false);
      toast.error(result.message || 'Erro ao restaurar compras.');
      return;
    }
    // O webhook do RevenueCat atualiza user_entitlements; damos um instante e relemos.
    await new Promise((r) => setTimeout(r, 2500));
    await refetchSettings();
    setRestoring(false);
    toast.success('Compras restauradas. Se houver uma assinatura ativa, seu acesso será liberado.');
  };

  // Espera o webhook do RevenueCat liberar o acesso e vai pro painel, pra não
  // cair de volta na tela "Quase lá!" logo após pagar.
  const aguardarAcessoIos = async (planId: string) => {
    if (!user) return;
    setPurchasingPlanId(planId);
    for (let i = 0; i < 12; i++) {
      const { data } = await supabase.from('user_entitlements')
        .select('subscription_status').eq('user_id', user.id).maybeSingle();
      if (data?.subscription_status === 'active') break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    setPurchasingPlanId(null);
    await refetchSettings();
    navigate('/dashboard');
  };

  const comprarIos = async (plan: typeof plans[0]) => {
    setConfirmPlan(null);
    setPurchasingPlanId(plan.id);
    const result = await purchasePlan(plan.id, billingCycle);
    setPurchasingPlanId(null);
    if (result.success) {
      toast.success('Compra confirmada! Liberando seu acesso...');
      await aguardarAcessoIos(plan.id);
    } else if (!result.userCancelled) {
      toast.error(result.message || 'Erro ao processar a compra.');
    }
  };

  // Offer Code da Apple (único tipo de cupom permitido no iOS).
  const resgatarCodigo = async () => {
    const planId = confirmPlan?.id ?? 'codigo';
    const result = await redeemOfferCode();
    if (!result.success) {
      toast.error(result.message || 'Não foi possível abrir o resgate de código.');
      return;
    }
    setConfirmPlan(null);
    toast.success('Se o código foi aceito, liberamos seu acesso em instantes.');
    await aguardarAcessoIos(planId);
  };

  const handleSubscribe = async (plan: typeof plans[0]) => {
    metaAddToCart({
      planId: plan.id, planName: plan.name, ciclo: billingCycle,
      value: Number(billingCycle === 'ANNUAL' ? plan.annualPrice : plan.price) * (billingCycle === 'ANNUAL' ? 12 : 1),
    });
    if (iosApp) {
      // Sem conta ainda: precisa criá-la antes de comprar via IAP (o
      // formulário de checkout do Asaas não existe no app).
      if (!user) {
        navigate('/register');
        return;
      }
      // Passa antes pela tela de confirmação (plano, preço, código).
      setConfirmPlan(plan);
      return;
    }
    // Checkout público: cria a conta (passo 1) e processa o pagamento (passo 2).
    // Não exige login prévio — a pessoa escolhe o plano, se cadastra e paga.
    // Sem conta e sem cadastro de contato feito: passa antes pela tela de cadastro,
    // que depois devolve a pessoa ao checkout do plano escolhido.
    if (!user && !loadLeadData()) {
      navigate(`/register?plan=${plan.id}&period=${billingCycle}`);
      return;
    }
    navigate(`/checkout?plan=${plan.id}&period=${billingCycle}`);
  };

  // Fonte de verdade é user_entitlements.plan_id (via SettingsContext) — a
  // coluna user_settings.subscription_plan que era usada aqui antes nunca é
  // escrita após o cadastro e ficava travada no valor padrão, fazendo o badge
  // "plano atual" e o upsell para Master nunca refletirem a assinatura real.
  const isPayingCustomer = settings.subscription_status === 'active' || settings.subscription_status === 'trialing';
  const currentPlanId = user && isPayingCustomer ? settings.plan_id : undefined;
  const isProfissional = currentPlanId === 'profissional';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 transition-colors duration-300 font-sans">
      {/* Sem este cabeçalho a página não tinha nenhuma saída: zero links. No app
          instalado (display: standalone) o usuário ficava preso na tela de preços. */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 px-5 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(user ? "/dashboard" : "/")}
              aria-label="Voltar"
              className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-slate-500"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Link to={user ? "/dashboard" : "/"} className="flex items-center">
              <Logo size="sm" showText />
            </Link>
          </div>
          {!user && (
            <Link
              to="/login"
              className="text-[13px] font-bold text-slate-600 dark:text-zinc-300 hover:text-emerald-600 transition-colors whitespace-nowrap"
            >
              Já tenho conta
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-10 lg:px-8 lg:py-14">

        {/* Upsell para quem já é Profissional */}
        {isProfissional && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 p-6 md:p-7 rounded-3xl bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 dark:border-amber-500/30 flex flex-col md:flex-row items-center justify-between gap-5 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-amber-500/20">
                <Crown className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-amber-700 dark:text-amber-400">Suba para o Master</h4>
                <p className="text-[13px] font-medium text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Por apenas <span className="text-amber-600 dark:text-amber-400 font-bold">R$ 50 a mais por mês</span>, tenha empresas ilimitadas, IA avançada, BI Analytics e suporte prioritário.
                </p>
              </div>
            </div>
            <button
              onClick={() => handleSubscribe(plans[2])}
              className="px-7 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[12px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all shrink-0 flex items-center gap-2 relative z-10"
            >
              Ir para o Master <ArrowUpRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Header */}
        <div className="text-center mb-10">
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-black uppercase tracking-widest border border-emerald-100 dark:border-emerald-900/30 mb-6"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Planos & assinaturas
          </motion.span>

          <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-zinc-100 tracking-tight mb-4 leading-[1.05]">
            Escolha o nível do seu <br className="hidden sm:block" />
            <span className="text-emerald-600">sucesso profissional</span>
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 font-medium max-w-xl mx-auto text-base md:text-lg leading-relaxed">
            Seu plano acompanha o número de empresas que você representa. Mude de plano quando quiser, sem fidelidade.
          </p>
        </div>

        {/* Toggle Mensal / Anual */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[13px] font-black transition-all",
                billingCycle === 'MONTHLY'
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300"
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingCycle('ANNUAL')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[13px] font-black transition-all flex items-center gap-2",
                billingCycle === 'ANNUAL'
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300"
              )}
            >
              Anual
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-black">-10%</span>
            </button>
          </div>
        </div>

        {iosApp && iosLoadError && (
          <div role="alert" data-testid="ios-planos-erro" className="max-w-2xl mx-auto mb-6 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-4 text-center">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Não foi possível carregar os planos da {store().name}.</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 break-words">Detalhe: {iosLoadError}</p>
            <button
              onClick={() => void carregarPrecosIos()}
              disabled={iosLoading}
              className="mt-3 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-60"
            >
              {iosLoading ? 'Carregando…' : 'Tentar novamente'}
            </button>
          </div>
        )}

        {/* Cards */}
        <PlanCards
          billingCycle={billingCycle}
          currentSubscriptionPlan={currentPlanId}
          onSubscribe={handleSubscribe}
          nativePrices={iosApp ? iosPrices : undefined}
          purchasingPlanId={purchasingPlanId}
        />

        {/* Selos de confiança */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto mb-16">
          {displayTrustItems.map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-3 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h4 className="text-[13px] font-black text-slate-900 dark:text-zinc-100 mb-0.5">{item.title}</h4>
                <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400 leading-snug">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <FunnelPoll page="planos" />

        {/* FAQ — objeções comuns antes de assinar */}
        <div className="max-w-2xl mx-auto mb-16">
          <h3 className="text-center text-lg font-black text-slate-900 dark:text-zinc-100 mb-6">
            Perguntas frequentes
          </h3>
          <div className="space-y-3">
            {displayFaqItems.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={item.q}
                  className="rounded-2xl border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">{item.q}</span>
                    <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="px-5 pb-4 text-[13px] text-slate-500 dark:text-zinc-400 font-medium leading-relaxed">
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {iosApp ? (
          /* No iOS a assinatura é da App Store: restaurar/gerenciar são nativos
             (Guideline 3.1.1) e os links legais precisam estar perto da compra (3.1.2). */
          <div className="max-w-3xl mx-auto p-8 md:p-10 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-100 dark:border-zinc-800 text-center">
            <h4 className="text-lg font-black text-slate-900 dark:text-zinc-100 mb-2">Já assina o Represente-Se!?</h4>
            <p className="text-slate-500 dark:text-zinc-400 font-medium mb-6 max-w-md mx-auto text-sm leading-relaxed">
              Se você já comprou uma assinatura com esta {store().account}, restaure sua compra. Para alterar ou cancelar, use o gerenciamento de assinaturas da {store().name}.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="w-full sm:w-auto px-8 py-3.5 bg-slate-900 dark:bg-zinc-800 text-white rounded-2xl font-black text-[12px] uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                {restoring ? 'Restaurando...' : 'Restaurar compras'}
              </button>
              <button
                onClick={() => openManageSubscriptions()}
                className="w-full sm:w-auto px-8 py-3.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-2xl font-black text-[12px] uppercase tracking-widest transition-all"
              >
                Gerenciar assinatura
              </button>
            </div>
            <p className="mt-6 text-[11px] text-slate-400 dark:text-zinc-500 leading-relaxed max-w-md mx-auto">
              A assinatura renova automaticamente (mensal ou anual, conforme o plano escolhido) até ser cancelada na {store().name} ({store().manage}), ao menos 24h antes do fim do período. O pagamento é cobrado na sua {store().account}.
            </p>
            <div className="mt-3 flex items-center justify-center gap-4 text-[11px] font-bold">
              <Link to="/terms" className="text-emerald-600 dark:text-emerald-400 underline">Termos de Uso</Link>
              <Link to="/privacy" className="text-emerald-600 dark:text-emerald-400 underline">Política de Privacidade</Link>
            </div>
            {user && (
              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-zinc-800">
                {user.email && <p className="text-[11px] text-slate-400 dark:text-zinc-500 break-all mb-2">Conectado como {user.email}</p>}
                <button
                  type="button"
                  data-testid="planos-sair"
                  onClick={async () => { try { await signOut(); } finally { navigate('/login', { replace: true }); } }}
                  className="text-[12px] font-bold text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 underline"
                >
                  Sair e entrar com outra conta
                </button>
              </div>
            )}
          </div>
        ) : (
        <div className="max-w-3xl mx-auto p-8 md:p-10 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-100 dark:border-zinc-800 text-center">
          <h4 className="text-lg font-black text-slate-900 dark:text-zinc-100 mb-2">Precisa de ajuda com sua conta?</h4>
          <p className="text-slate-500 dark:text-zinc-400 font-medium mb-7 max-w-md mx-auto text-sm leading-relaxed">
            Quer pausar, trocar ou cancelar sua assinatura? Fale com o suporte e a gente resolve com segurança.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => window.open('https://wa.me/5515997472785?text=Ol%C3%A1%2C%20vim%20pela%20plataforma%20e%20gostaria%20de%20suporte%20financeiro.', '_blank')}
              className="w-full sm:w-auto px-8 py-3.5 bg-slate-900 dark:bg-zinc-800 text-white rounded-2xl font-black text-[12px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
            >
              Suporte Financeiro
              <ArrowUpRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => window.open('https://wa.me/5515997472785?text=Ol%C3%A1%2C%20gostaria%20de%20cancelar%20o%20meu%20plano.%20Poderia%20me%20ajudar%3F', '_blank')}
              className="w-full sm:w-auto px-8 py-3.5 bg-white dark:bg-zinc-900 border border-red-100 dark:border-red-900/30 text-red-600 rounded-2xl font-black text-[12px] uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
            >
              Solicitar Cancelamento
            </button>
          </div>
        </div>
        )}
      </div>

      {/* iOS: confirmação antes da folha de pagamento da Apple */}
      <AnimatePresence>
        {iosApp && confirmPlan && (() => {
          const px = iosPrices[confirmPlan.id as keyof IosPlanPrices];
          const anual = billingCycle === 'ANNUAL';
          const preco = anual ? px?.annual : px?.monthly;
          return (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center"
              data-testid="ios-confirmar-plano"
              onClick={() => setConfirmPlan(null)}
            >
              <motion.div
                initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6 [padding-bottom:max(1.5rem,env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">Confirme seu plano</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">{confirmPlan.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">{anual ? 'Plano anual' : 'Plano mensal'}</p>
                  </div>
                  <button onClick={() => setConfirmPlan(null)} aria-label="Fechar" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="rounded-2xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800 p-4 mb-4">
                  <p className="text-3xl font-black text-slate-900 dark:text-white">
                    {preco ?? '—'}<span className="text-sm font-bold text-slate-400"> {anual ? '/ano' : '/mês'}</span>
                  </p>
                  {anual && px?.annualPerMonth && (
                    <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium mt-1">Equivale a {px.annualPerMonth} por mês</p>
                  )}
                </div>

                <ul className="space-y-2 mb-5">
                  {confirmPlan.features.slice(0, 6).map((f) => (
                    <li key={f.text} className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-zinc-300">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />{f.text}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => comprarIos(confirmPlan)}
                  disabled={!preco}
                  data-testid="ios-assinar"
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm disabled:opacity-50"
                >
                  Assinar com {store().provider}
                </button>
                <button
                  onClick={resgatarCodigo}
                  data-testid="ios-tenho-codigo"
                  className="w-full mt-3 py-3.5 rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Ticket className="w-4 h-4" /> Tenho um código
                </button>
                <p className="text-[11px] text-slate-400 text-center mt-3 leading-relaxed">
                  O pagamento é feito com {store().payment}. A assinatura renova sozinha e pode ser cancelada quando quiser em {store().manage}.
                </p>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
