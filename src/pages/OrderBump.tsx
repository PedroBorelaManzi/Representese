import React, { useState } from "react";
import { 
  Crown, 
  Star, 
  Gem, 
  Check, 
  ArrowRight, 
  Sparkles, 
  Home, 
  Ticket, 
  ArrowLeft, 
  Building2, 
  ShieldCheck,
  CheckCircle2,
  Clock,
  HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../contexts/SettingsContext";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "../lib/utils";

const planDetails = {
  exclusivo: {
    name: "Exclusivo",
    price: 97,
    annualPrice: 87,
    originalPrice: 134,
    icon: Building2,
    color: "text-slate-500",
    bg: "bg-slate-50 dark:bg-zinc-800/50",
    border: "border-slate-100 dark:border-zinc-700/50",
    features: ["1 Empresa cadastrada", "Mapa Territorial Básico", "CRM Essencial", "Suporte por E-mail"]
  },
  profissional: {
    name: "Profissional",
    price: 147,
    annualPrice: 132,
    originalPrice: 210,
    icon: Gem,
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-100 dark:border-emerald-900/30",
    features: [
      "Até 5 Empresas",
      "Mapa Territorial Básico",
      "CRM Essencial",
      "Busca CNPJ Automática",
      "Dashboard de Faturamento",
      "Exportação de Relatórios",
      "Suporte via WhatsApp"
    ]
  },
  master: {
    name: "Master",
    price: 197,
    annualPrice: 177,
    originalPrice: 303,
    icon: Crown,
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    border: "border-amber-100 dark:border-amber-900/30",
    features: [
      "Empresas Ilimitadas",
      "Radar Territorial Avançado",
      "CRM Essencial",
      "Busca CNPJ Automática",
      "BI & Analytics Avançado",
      "Exportação de Relatórios",
      "Assistente IA para clientes",
      "Digitalização de Pedidos por IA",
      "Integração com Inbox",
      "Suporte via WhatsApp Prioritário"
    ]
  }
};

export default function OrderBump() {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [activeCoupon, setActiveCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // Checkout states
  const [showCheckout, setShowCheckout] = useState(false);
  const billingCycle = (localStorage.getItem('rm_billing_cycle') || 'Mensal') as 'Mensal' | 'Anual';
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const currentTier = settings.plan_id ? (settings.plan_id === 'premium' ? 'profissional' : settings.plan_id) : 'exclusivo';

  const getExpirationDate = (cycle: 'Mensal' | 'Anual') => {
    const date = new Date();
    if (cycle === 'Mensal') {
      date.setDate(date.getDate() + 30);
    } else if (cycle === 'Anual') {
      date.setFullYear(date.getFullYear() + 1);
    }
    return date.toLocaleDateString('pt-BR');
  };

  const getExpirationMonthName = (cycle: 'Mensal' | 'Anual') => {
    const date = new Date();
    if (cycle === 'Mensal') {
      date.setDate(date.getDate() + 30);
    } else if (cycle === 'Anual') {
      date.setFullYear(date.getFullYear() + 1);
    }
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const validateCard = () => {
    if (!cardHolder.trim() || cardHolder.trim().length < 3) {
      toast.error("Por favor, insira o nome completo do titular do cartão.");
      return false;
    }
    const cleanNum = cardNumber.replace(/\D/g, '');
    if (cleanNum.length !== 16) {
      toast.error("O número do cartão de crédito deve conter exatamente 16 dígitos.");
      return false;
    }
    const expiryMatch = cardExpiry.match(/^(\d{2})\/(\d{2})$/);
    if (!expiryMatch) {
      toast.error("A data de validade deve estar no formato MM/AA.");
      return false;
    }
    const month = parseInt(expiryMatch[1], 10);
    const year = parseInt("20" + expiryMatch[2], 10);
    if (month < 1 || month > 12) {
      toast.error("Mês de validade inválido. Deve ser entre 01 e 12.");
      return false;
    }
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      toast.error("O cartão informado está vencido.");
      return false;
    }
    if (cardCvv.length !== 3) {
      toast.error("O código de segurança CVV deve conter exatamente 3 dígitos.");
      return false;
    }
    return true;
  };

  // Master is index 2, if they are already on Master, handle gracefully
  if (currentTier === 'master') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-[32px] p-8 border border-slate-100 dark:border-zinc-800 text-center space-y-6 shadow-xl">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500">
            <Crown className="w-10 h-10 animate-bounce" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Você é Nível Master!</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed font-medium">
            Sua assinatura já está no nível máximo com todos os recursos premium, IA avançada e suporte ultra priorizado habilitados.
          </p>
          <button 
            onClick={() => navigate('/dashboard')}
            className="w-full py-5 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" /> Ir para o Início
          </button>
        </div>
      </div>
    );
  }

  const nextTier = currentTier === 'exclusivo' ? 'profissional' : 'master';
  
  const currentPlan = planDetails[currentTier as keyof typeof planDetails];
  const nextPlan = planDetails[nextTier as keyof typeof planDetails];
  
  const currentPrice = billingCycle === 'Anual' ? currentPlan.annualPrice : currentPlan.price;
    const nextPrice = billingCycle === 'Anual' ? nextPlan.annualPrice : nextPlan.price;
    const standardDiff = nextPrice - currentPrice; // R$ 50
  
  // Calculate discount
  let discountAmount = 0;
  if (activeCoupon === 'REPRESENTE95') {
    discountAmount = Math.round((standardDiff * 95) / 100);
  } else if (activeCoupon === 'TESTE') {
    discountAmount = Math.round((standardDiff * 50) / 100);
  }

  const finalDiff = standardDiff - discountAmount;

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError("");
    const normalized = couponCode.toUpperCase().trim();
    
    if (normalized === 'REPRESENTE95') {
        setActiveCoupon('REPRESENTE95');
        toast.success("Cupom aplicado com sucesso!");
      } else if (normalized === 'TESTE') {
        setActiveCoupon('TESTE');
        toast.success("Cupom aplicado com sucesso!");
      } else if (couponCode === "") {
      setCouponError("Insira um código válido.");
    } else {
      setCouponError("Cupom inválido ou expirado.");
    }
  };

  const handleRemoveCoupon = () => {
    setActiveCoupon(null);
    setCouponCode("");
    toast.info("Cupom removido.");
  };

  const handleConfirmUpgrade = async () => {
    if (showCheckout) {
      if (!validateCard()) {
        return; // Validation failed
      }
      setLoading(true);
      try {
        // Simulate gateway transaction
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Update in local settings context which syncs online and offline cache
        await updateSettings({ plan_id: nextTier });
        
        // Save cycle and calculated expiration in localStorage
        const expDate = getExpirationDate(billingCycle);
        localStorage.setItem('rm_billing_cycle', billingCycle);
        localStorage.setItem('rm_expiration_date', expDate);
        
        setIsSuccess(true);
        toast.success("Parabéns! Seu upgrade para o plano " + nextPlan.name + " foi processado!");
      } catch (e) {
        toast.error("Erro ao processar o seu upgrade de assinatura. Tente novamente.");
      } finally {
        setLoading(false);
      }
    } else {
      setShowCheckout(true);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-lg w-full bg-white dark:bg-zinc-900 rounded-[48px] p-10 border border-slate-100 dark:border-zinc-800 text-center space-y-8 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="w-24 h-24 rounded-[36px] bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-12 h-12 animate-pulse" />
          </div>
          
          <div className="space-y-3">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Upgrade Concluído!</h2>
            <p className="text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
              Assinatura atualizada com sucesso para {nextPlan.name}
            </p>
            <p className="text-slate-400 dark:text-zinc-500 text-xs leading-relaxed font-medium">
              Todos os benefícios e recursos de inteligência do plano **{nextPlan.name}** já estão ativos e liberados em sua conta. Nosso motor neural já reconfigurou seus limites de acesso.
              <br />
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block mt-3 bg-emerald-500/10 py-2 px-4 rounded-xl border border-emerald-500/20">
                ðŸ“… Válido até {localStorage.getItem('rm_expiration_date') || "N/A"} (Ciclo {localStorage.getItem('rm_billing_cycle') || 'Mensal'})
              </span>
            </p>
          </div>

          <div className="p-6 bg-slate-50 dark:bg-zinc-800/40 rounded-3xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between text-left">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500 text-white rounded-xl" style={{ backgroundColor: '#10b981' }}>
                <nextPlan.icon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">{nextPlan.name}</h4>
                <p className="text-[9px] font-bold text-slate-400 uppercase">Ativo</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">R$ {billingCycle === 'Anual' ? nextPlan.annualPrice : nextPlan.price}/mês</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase">Faturamento {localStorage.getItem('rm_billing_cycle') || 'Mensal'}</p>
            </div>
          </div>

          <button 
            onClick={() => navigate('/dashboard')}
            className="w-full py-5 bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-white rounded-3xl font-black uppercase text-xs tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            Acessar minha Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 lg:p-12 transition-colors duration-300 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Back Link */}
        <button 
          onClick={() => navigate('/dashboard')}
          className="mb-8 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Início
        </button>

        {/* Title Block */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[10px] font-black uppercase tracking-widest border border-amber-100 dark:border-amber-900/30 mb-6">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            Upgrade de Assinatura Exclusivo
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none mb-4">
            Desbloqueie o próximo nível com <span className="text-emerald-600">{nextPlan.name}</span>
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 font-medium max-w-xl mx-auto text-sm leading-relaxed">
            Turbine o seu dia a dia de vendas com limites maiores, inteligência artificial integrada e relatórios exclusivos criados para alta conversão.
          </p>
        </div>

        {/* Split Screen Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Compare current and next plan benefits */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Split Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Current Plan Mini Box */}
              <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800/80 text-left relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-slate-500/5 rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 bg-slate-50 dark:bg-zinc-800 rounded-xl text-slate-400">
                    <currentPlan.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider border border-slate-100 dark:border-zinc-800 px-2 py-0.5 rounded-full">Plano Atual</span>
                </div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-tight leading-none mb-1">{currentPlan.name}</h3>
                <p className="text-lg font-black text-slate-500">R$ {billingCycle === 'Anual' ? currentPlan.annualPrice : currentPlan.price}<span className="text-[9px] font-bold">/mês</span></p>
              </div>

              {/* Next Plan Upsell Mini Box */}
              <div className="p-6 rounded-3xl bg-emerald-600/10 dark:bg-emerald-500/5 border-2 border-emerald-500 text-left relative overflow-hidden ring-4 ring-emerald-500/5 shadow-xl">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/30 flex items-center justify-center">
                    <nextPlan.icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-full animate-pulse">Recomendado</span>
                </div>
                <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tight leading-none mb-1">{nextPlan.name}</h3>
                <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <span>R$ {nextPlan.price}<span className="text-[9px] font-bold">/mï¿½s</span></span>
                  {nextPlan.originalPrice && (
                    <span className="px-3 py-1 bg-amber-500 text-white text-[10px] font-black uppercase rounded-lg tracking-widest shadow-sm shadow-amber-500/20">
                      {nextTier === 'profissional' ? '30' : '35'}% DE DESCONTO LANÇAMENTO
                    </span>
                  )}
                </p>
              </div>

            </div>

            {/* Premium Benefits Checklist */}
            <div className="p-8 bg-white dark:bg-zinc-900 rounded-[32px] border-2 border-emerald-500/20 dark:border-zinc-800 text-left space-y-6 shadow-xl">
              <h3 className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" /> O que você está desbloqueando:
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {nextPlan.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3 bg-slate-50/80 dark:bg-zinc-800/50 p-3.5 rounded-2xl border-2 border-slate-200/50 dark:border-zinc-700/40 shadow-sm transition-all hover:border-emerald-500/35">
                    <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-emerald-500/20">
                      <Check className="w-4 h-4 font-bold text-white" />
                    </div>
                    <span className="text-[10px] font-black text-slate-800 dark:text-zinc-200 uppercase tracking-tight leading-tight">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column: Checkout Summary, Coupon & Confirm Button */}
          <div className="lg:col-span-5 space-y-6">
            
            {showCheckout ? (
              <div className="p-8 bg-white dark:bg-zinc-900 rounded-[36px] border border-slate-100 dark:border-zinc-800 text-left space-y-6 shadow-lg shadow-slate-100/50 dark:shadow-none">
                <div className="flex items-center justify-between pb-3 border-b border-slate-50 dark:border-zinc-800">
                  <button 
                    onClick={() => setShowCheckout(false)}
                    className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 hover:text-emerald-600 uppercase tracking-widest"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                  </button>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Checkout Seguro</h3>
                </div>

                {/* Pricing Summary */}
                <div className="p-5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/5 border-2 border-emerald-500/30 dark:border-emerald-900/20 text-left shadow-lg shadow-emerald-500/5">
                  <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider bg-emerald-500/15 px-2 py-0.5 rounded-full mb-2 inline-block">Valor Adicional</span>
                  <div className="flex justify-between items-baseline mt-1">
                    <p className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">A partir deste mês:</p>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-400">R$</span>
                      <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter"> {finalDiff}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">/mês a mais</span>
                    </div>
                  </div>
                </div>

                {/* Billing Cycle Selection */}
                <div className="space-y-3">
                  {/* Dynamic Expiration Wording */}
                  <div className="p-4 bg-amber-500/10 dark:bg-amber-500/5 border-2 border-amber-500/30 dark:border-amber-500/20 rounded-2xl space-y-2 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/10">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 font-black uppercase tracking-tight">
                      â„¹ï¸ O seu plano atual encerra no mês de <span className="underline">{getExpirationMonthName(billingCycle)}</span>.
                    </p>
                    <p className="text-[9px] text-amber-600 dark:text-amber-500 font-bold leading-relaxed">
                      Você está contratando o upgrade para o plano {nextPlan.name} até o final do seu plano anterior.
                    </p>
                  </div>
                </div>

                {/* Simulated Payment Form */}
                <div className="space-y-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Informações de Pagamento</p>
                  
                  <div className="space-y-3">
                    <div>
                      <input 
                        type="text" 
                        placeholder="Nome no Cartão" 
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-zinc-900 transition-all placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal"
                      />
                    </div>
                    
                    <div>
                      <input 
                        type="text" 
                        placeholder="Número do Cartão" 
                        value={cardNumber}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').substring(0, 16);
                          const matches = val.match(/\d{4,16}/g);
                          const match = matches && matches[0] || '';
                          const parts = [];
                          for (let i = 0, len = match.length; i < len; i += 4) {
                            parts.push(match.substring(i, i + 4));
                          }
                          if (parts.length > 0) {
                            setCardNumber(parts.join(' '));
                          } else {
                            setCardNumber(val);
                          }
                        }}
                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-zinc-900 transition-all placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <input 
                        type="text" 
                        placeholder="Validade (MM/AA)" 
                        value={cardExpiry}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').substring(0, 4);
                          if (val.length >= 2) {
                            setCardExpiry(val.substring(0, 2) + '/' + val.substring(2));
                          } else {
                            setCardExpiry(val);
                          }
                        }}
                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-zinc-900 transition-all placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal"
                      />
                      <input 
                        type="password" 
                        placeholder="CVV" 
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').substring(0, 3))}
                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-zinc-900 transition-all placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal"
                      />
                    </div>
                  </div>
                </div>

                {/* Finalize Payment Button */}
                <button 
                  onClick={handleConfirmUpgrade}
                  disabled={loading}
                  className="w-full py-5 rounded-[24px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 active:scale-98 disabled:opacity-50 transition-all relative overflow-hidden"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Processando Pagamento...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Confirmar e Pagar +R$ {finalDiff}</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-zinc-500 pt-2 border-t border-slate-50 dark:border-zinc-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600/30" />
                  <span className="text-[8px] font-bold uppercase tracking-widest">Upgrade seguro & Criptografado</span>
                </div>
              </div>
            ) : (
              <div className="p-8 bg-white dark:bg-zinc-900 rounded-[36px] border border-slate-100 dark:border-zinc-800 text-left space-y-6 shadow-lg shadow-slate-100/50 dark:shadow-none">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white pb-3 border-b border-slate-50 dark:border-zinc-800">Resumo da Assinatura</h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span>Novo Plano ({nextPlan.name})</span>
                    <span>R$ {billingCycle === 'Anual' ? nextPlan.annualPrice : nextPlan.price}/mês</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-slate-400">
                    <span>Crédito do Plano Atual ({currentPlan.name})</span>
                    <span>-R$ {billingCycle === 'Anual' ? currentPlan.annualPrice : currentPlan.price}/mês</span>
                  </div>
                  
                  {activeCoupon && (
                    <div className="flex justify-between text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5 rounded-xl border border-emerald-100/30 dark:border-emerald-900/30">
                      <div className="flex items-center gap-1.5">
                        <Ticket className="w-3.5 h-3.5" />
                        <span>Cupom {activeCoupon?.code}</span>
                      </div>
                      <span>-R$ {discountAmount}/mês</span>
                    </div>
                  )}

                  <div className="p-5 bg-slate-50 dark:bg-zinc-950 border-2 border-slate-100 dark:border-zinc-800/80 rounded-2xl flex justify-between items-center shadow-inner">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Diferença Mensal</h4>
                      <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Cobrado apenas o delta proporcional</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-400">R$</span>
                      <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">{finalDiff}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">/mês</span>
                    </div>
                  </div>
                </div>

                {/* Coupon Form */}
                <div className="pt-6 border-t border-slate-50 dark:border-zinc-800 space-y-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Possui um cupom de desconto?</p>
                  
                  {!activeCoupon ? (
                    <form onSubmit={handleApplyCoupon} className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Código do cupom (opcional)" 
                        value={couponCode}
                        onChange={(e) => { setCouponCode(e.target.value); setCouponError(""); }}
                        className="flex-1 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 rounded-2xl px-4 py-3.5 text-xs font-bold uppercase tracking-widest outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-zinc-900 transition-all placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal"
                      />
                      <button 
                        type="submit"
                        className="px-5 bg-slate-900 dark:bg-zinc-800 hover:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-md shrink-0"
                      >
                        Aplicar
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-zinc-850/50 rounded-2xl border border-slate-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">{activeCoupon?.code}</span>
                      </div>
                      <button 
                        onClick={handleRemoveCoupon}
                        className="text-[9px] font-black text-red-500 hover:text-red-600 uppercase tracking-widest"
                      >
                        Remover
                      </button>
                    </div>
                  )}

                  {couponError && (
                    <p className="text-[9px] font-bold text-red-500 uppercase tracking-wide text-left pl-1">{couponError}</p>
                  )}
                </div>

                {/* Confirm Upgrade Button */}
                <button 
                  onClick={handleConfirmUpgrade}
                  disabled={loading}
                  className="w-full py-5 rounded-[24px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 active:scale-98 disabled:opacity-50 transition-all relative overflow-hidden"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Processando Upgrade...</span>
                    </>
                  ) : (
                    <>
                      <Crown className="w-4 h-4" />
                      <span>Confirmar Meu Upgrade</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-zinc-500 pt-2 border-t border-slate-50 dark:border-zinc-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600/30" />
                  <span className="text-[8px] font-bold uppercase tracking-widest">Upgrade seguro & Criptografado</span>
                </div>

              </div>
            )}

            {/* Satisfaction Banner */}
            <div className="p-6 bg-emerald-500/10 dark:bg-emerald-500/5 border-2 border-emerald-500/30 dark:border-emerald-500/20 rounded-[28px] text-left flex items-start gap-4 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/10">
              <Clock className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0 animate-pulse" />
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-900 dark:text-emerald-400">Migração Proporcional</h4>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-500 font-bold leading-relaxed mt-1">
                  Seu faturamento é recalculado proporcionalmente aos dias restantes no ciclo de cobrança. Nenhum centavo é desperdiçado.
                </p>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
