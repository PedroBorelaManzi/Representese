import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, CreditCard, QrCode, Lock, CheckCircle2,
  ArrowLeft, ChevronRight, Loader2, Eye, EyeOff,
  ShieldAlert, Crown, Gem, Trophy, Check, User, Mail, Phone, Hash, Tag,
} from "lucide-react";
import { cn } from '../lib/utils';
import { Logo } from '../components/Logo';
import { toast } from "sonner";
import { supabase } from "../lib/supabase";

const plans = {
  exclusivo: {
    id: 'exclusivo',
    name: 'Exclusivo',
    icon: Trophy,
    color: 'text-slate-400',
    prices: { MONTHLY: 97, ANNUAL: 1044 }
  },
  profissional: {
    id: 'profissional',
    name: 'Profissional',
    icon: Gem,
    color: 'text-emerald-500',
    prices: { MONTHLY: 147, ANNUAL: 1584 }
  },
  master: {
    id: 'master',
    name: 'Master',
    icon: Crown,
    color: 'text-amber-500',
    prices: { MONTHLY: 197, ANNUAL: 2124 }
  }
};

function isValidCPF(value: string): boolean {
  if (!value) return false;
  const clean = value.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10))) return false;

  return true;
}

function isValidCNPJ(value: string): boolean {
  if (!value) return false;
  const clean = value.replace(/\D/g, '');
  if (clean.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(clean)) return false;

  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const digits = clean.substring(size);
  let sum = 0, pos = size - 7;
  for (let i = size; i >= 1; i--) { sum += parseInt(numbers.charAt(size - i)) * pos--; if (pos < 2) pos = 9; }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0; pos = size - 7;
  for (let i = size; i >= 1; i--) { sum += parseInt(numbers.charAt(size - i)) * pos--; if (pos < 2) pos = 9; }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
}

function isValidPhone(value: string): boolean {
  if (!value) return false;
  const clean = value.replace(/\D/g, '');
  if (clean.length !== 10 && clean.length !== 11) return false;
  const ddd = parseInt(clean.substring(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (clean.length === 11 && clean.charAt(2) !== '9') return false;
  return true;
}

const formatCpfCnpj = (value: string) => {
  const clean = value.replace(/\D/g, '').slice(0, 14);
  if (clean.length <= 11) return clean.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return clean.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

const formatPhone = (value: string) => {
  const clean = value.replace(/\D/g, '').slice(0, 11);
  if (clean.length <= 10) return clean.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return clean.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
};

const formatCardNumber = (value: string) => value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatExpiry = (value: string) => {
  const clean = value.replace(/\D/g, '').slice(0, 4);
  return clean.length <= 2 ? clean : `${clean.slice(0, 2)}/${clean.slice(2)}`;
};
const formatCcv = (value: string) => value.replace(/\D/g, '').slice(0, 4);

function Requirement({ label, met }: { label: string; met: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300", met ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400")}>
        <Check className="w-2.5 h-2.5" strokeWidth={3} />
      </div>
      <span className={cn("text-[11px] font-bold transition-colors", met ? "text-emerald-700" : "text-slate-400")}>{label}</span>
    </div>
  );
}

// input com ícone à esquerda, estilo consistente
const inputBase = "w-full rounded-2xl border bg-slate-50 pl-11 pr-4 py-3.5 text-[15px] font-medium outline-none transition-all";
const inputOk = "border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white";
const inputErr = "border-red-400 bg-red-50/40 text-red-900 focus:ring-4 focus:ring-red-500/10";

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawPlanId = searchParams.get("plan")?.toLowerCase() || "profissional";
  let planId = rawPlanId === 'premium' ? 'profissional' : rawPlanId;
  const [selectedPlan] = useState<any>(plans[planId as keyof typeof plans] || plans.profissional);

  const urlParams = new URLSearchParams(window.location.search);
  const billingCycle = urlParams.get('period')?.toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  const [paymentMethod, setPaymentMethod] = useState<'CREDIT_CARD' | 'PIX' | 'BOLETO'>('CREDIT_CARD');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [isCheckingUniqueness, setIsCheckingUniqueness] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [installments, setInstallments] = useState(12);

  const [formData, setFormData] = useState({
    name: "", email: "", cpfCnpj: "", phone: "", password: "",
    cardNumber: "", expiry: "", ccv: "", holderName: ""
  });

  const [passwordRequirements, setPasswordRequirements] = useState({
    length: false, upper: false, lower: false, number: false, special: false
  });

  useEffect(() => {
    const pass = formData.password;
    setPasswordRequirements({
      length: pass.length >= 8,
      upper: /[A-Z]/.test(pass),
      lower: /[a-z]/.test(pass),
      number: /[0-9]/.test(pass),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(pass)
    });
  }, [formData.password]);

  const isPasswordValid = Object.values(passwordRequirements).every(req => req);
  const cleanCpfCnpj = formData.cpfCnpj.replace(/\D/g, '');
  const cleanPhone = formData.phone.replace(/\D/g, '');
  const isCpf = cleanCpfCnpj.length <= 11;
  const docValid = isCpf ? isValidCPF(cleanCpfCnpj) : isValidCNPJ(cleanCpfCnpj);

  const isPersonalName = formData.name.trim().split(/\s+/).filter(w => w.length > 0).length >= 2;
  const docNameMatch = isCpf ? (isPersonalName && !/ltda|s\/?a|eireli|me|epp|cnpj/i.test(formData.name)) : (formData.name.trim().length >= 3);
  const phoneValid = isValidPhone(cleanPhone);

  const isStep1Valid = formData.name && formData.email && formData.cpfCnpj && docValid && docNameMatch && formData.phone && phoneValid && isPasswordValid;

  const baseValue = selectedPlan.prices[billingCycle];
  const couponDiscount = appliedCoupon ? (baseValue * appliedCoupon.discount) / 100 : 0;
  const priceAfterCoupon = baseValue - couponDiscount;
  const pixDiscount = paymentMethod === 'PIX' ? (priceAfterCoupon * 5) / 100 : 0;
  const finalPrice = priceAfterCoupon - pixDiscount;

  const handleApplyCoupon = () => {
    setIsApplyingCoupon(true);
    setTimeout(() => {
      const codeUpper = couponCode.trim().toUpperCase();
      if (codeUpper === "REPRESENTE95") { setAppliedCoupon({ code: "REPRESENTE95", discount: 95 }); toast.success("Cupom aplicado!"); }
      else if (codeUpper === "TESTE") { setAppliedCoupon({ code: "TESTE", discount: 50 }); toast.success("Cupom aplicado!"); }
      else if (codeUpper === "GRATIS100") { setAppliedCoupon({ code: "GRATIS100", discount: 100 }); toast.success("Cupom aplicado!"); }
      else toast.error("Cupom inválido");
      setIsApplyingCoupon(false);
    }, 800);
  };

  const checkFieldUniqueness = async (fieldName: string) => {
    const value = (formData as any)[fieldName];
    if (!value) return;
    try {
      const { data } = await supabase.functions.invoke('process-checkout', {
        body: { action: 'check-uniqueness', userId: 'temp', customer: { [fieldName]: value } }
      });
      if (data && !data.success) {
        setFormErrors(prev => ({ ...prev, [fieldName]: data.message }));
      } else {
        setFormErrors(prev => {
          const next = { ...prev };
          delete next[fieldName];
          return next;
        });
      }
    } catch (err) {}
  };

  const handleNextStep = async () => {
    if (!isStep1Valid) return;
    setIsCheckingUniqueness(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-checkout', {
        body: { action: 'check-uniqueness', userId: 'temp', customer: formData }
      });
      if (error) throw error;
      if (!data.success) {
        let field = 'general';
        const msg = data.message.toLowerCase();
        if (msg.includes('e-mail') || msg.includes('email')) field = 'email';
        else if (msg.includes('cpf') || msg.includes('cnpj')) field = 'cpfCnpj';
        else if (msg.includes('whatsapp') || msg.includes('número')) field = 'phone';
        else if (msg.includes('nome')) field = 'name';

        setFormErrors(prev => ({ ...prev, [field]: data.message }));
        toast.error("Verifique os campos destacados em vermelho.");
        return;
      }
      setFormErrors({});
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast.error("Erro ao validar dados no servidor.");
    } finally {
      setIsCheckingUniqueness(false);
    }
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid) return toast.error("Senha não atende aos requisitos.");
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email, password: formData.password,
        options: { data: { full_name: formData.name, phone: formData.phone, cpf_cnpj: formData.cpfCnpj } }
      });

      if (authError) throw new Error(authError.message.includes("already") ? "E-mail já cadastrado." : `Erro: ${authError.message}`);

      const { data, error } = await supabase.functions.invoke('process-checkout', {
        body: {
          userId: authData?.user?.id, planId: selectedPlan.id, billingCycle, paymentMethod, coupon: appliedCoupon?.code, finalPrice,
          customer: { name: formData.name, email: formData.email, cpfCnpj: formData.cpfCnpj, phone: formData.phone },
          creditCard: paymentMethod === 'CREDIT_CARD' ? {
            holderName: formData.holderName, number: formData.cardNumber.replace(/\s/g, ''),
            expiryMonth: formData.expiry.split('/')[0], expiryYear: '20' + formData.expiry.split('/')[1],
            ccv: formData.ccv, installments
          } : null
        }
      });

      if (error) throw error;
      if (data.success) {
        toast.success("Pagamento processado!");
        if (data.invoiceUrl) setTimeout(() => { window.location.href = data.invoiceUrl; }, 1500);
        else navigate("/login");
      } else toast.error(data.message || "Erro no processamento");
    } catch (err: any) {
      toast.error(err.message || "Erro na comunicação");
    } finally {
      setLoading(false);
    }
  };

  const priceFmt = (v: number) => v.toFixed(2).replace('.', ',');

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-5 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Logo size="sm" showText={true} />
          </div>
          <div className="flex items-center gap-2 text-[12px] font-bold text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-100">
            <ShieldCheck className="w-4 h-4" /> Ambiente seguro
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 lg:py-12">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-10">
          {[
            { n: 1, label: "Seus dados" },
            { n: 2, label: "Pagamento" },
          ].map((s, i) => {
            const active = step === s.n;
            const done = step > s.n;
            return (
              <React.Fragment key={s.n}>
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black transition-all",
                    done ? "bg-emerald-500 text-white" : active ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-400"
                  )}>
                    {done ? <Check className="w-4 h-4" strokeWidth={3} /> : s.n}
                  </div>
                  <span className={cn("text-[13px] font-bold hidden sm:block", active || done ? "text-slate-900" : "text-slate-400")}>{s.label}</span>
                </div>
                {i === 0 && <div className={cn("h-0.5 w-10 sm:w-16 rounded-full transition-all", step > 1 ? "bg-emerald-500" : "bg-slate-200")} />}
              </React.Fragment>
            );
          })}
        </div>

        <form id="checkout-form" onSubmit={handleProcessPayment} className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

          {/* LEFT: dados / pagamento */}
          <div className="lg:col-span-7 space-y-6">
            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.div key="step1" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight">Crie sua conta</h2>
                    <p className="text-slate-500 mt-1.5 text-[15px]">Seus dados de acesso ao painel. Leva menos de um minuto.</p>
                  </div>

                  <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-6">
                    {/* email */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold text-slate-700">E-mail</label>
                      <div className="relative">
                        <Mail className="w-[18px] h-[18px] text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input required type="email" autoComplete="email" value={formData.email}
                          onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setFormErrors(prev => ({ ...prev, email: '' })); }}
                          placeholder="nome@empresa.com"
                          className={cn(inputBase, formErrors.email ? inputErr : inputOk)} />
                      </div>
                      {formErrors.email && <p className="text-[12px] text-red-500 font-bold pt-1 animate-in fade-in slide-in-from-top-1">{formErrors.email}</p>}
                    </div>

                    {/* senha */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold text-slate-700">Crie uma senha forte</label>
                      <div className="relative">
                        <Lock className="w-[18px] h-[18px] text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input required type={showPassword ? "text" : "password"} autoComplete="new-password" value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••"
                          className={cn(inputBase, inputOk, "pr-12")} />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 pt-2.5">
                        <Requirement label="Mín. 8 caracteres" met={passwordRequirements.length} />
                        <Requirement label="Letra maiúscula" met={passwordRequirements.upper} />
                        <Requirement label="Letra minúscula" met={passwordRequirements.lower} />
                        <Requirement label="Número" met={passwordRequirements.number} />
                        <Requirement label="Símbolo especial" met={passwordRequirements.special} />
                      </div>
                    </div>

                    <div className="border-t border-slate-100" />

                    {/* nome */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold text-slate-700">Nome completo</label>
                      <div className="relative">
                        <User className="w-[18px] h-[18px] text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input required type="text" autoComplete="name" value={formData.name}
                          onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormErrors(prev => ({ ...prev, name: '' })); }}
                          placeholder="Como no seu documento"
                          className={cn(inputBase, formErrors.name ? inputErr : inputOk)} />
                      </div>
                      {formErrors.name && <p className="text-[12px] text-red-500 font-bold pt-1 animate-in fade-in slide-in-from-top-1">{formErrors.name}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-[13px] font-bold text-slate-700">CPF ou CNPJ</label>
                        <div className="relative">
                          <Hash className="w-[18px] h-[18px] text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                          <input required type="text" value={formData.cpfCnpj}
                            onChange={(e) => { setFormData({ ...formData, cpfCnpj: formatCpfCnpj(e.target.value) }); setFormErrors(prev => ({ ...prev, cpfCnpj: '' })); }}
                            placeholder="000.000.000-00"
                            className={cn(inputBase, formErrors.cpfCnpj ? inputErr : inputOk)} />
                        </div>
                        {formErrors.cpfCnpj && <p className="text-[12px] text-red-500 font-bold pt-1 animate-in fade-in slide-in-from-top-1">{formErrors.cpfCnpj}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[13px] font-bold text-slate-700">WhatsApp</label>
                        <div className="relative">
                          <Phone className="w-[18px] h-[18px] text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                          <input required type="tel" autoComplete="tel" value={formData.phone}
                            onChange={(e) => { setFormData({ ...formData, phone: formatPhone(e.target.value) }); setFormErrors(prev => ({ ...prev, phone: '' })); }}
                            placeholder="(00) 00000-0000"
                            className={cn(inputBase, formErrors.phone ? inputErr : inputOk)} />
                        </div>
                        {formErrors.phone && <p className="text-[12px] text-red-500 font-bold pt-1 animate-in fade-in slide-in-from-top-1">{formErrors.phone}</p>}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button" disabled={isCheckingUniqueness || !isStep1Valid}
                    onClick={handleNextStep}
                    className="w-full py-4 rounded-2xl font-black text-[15px] bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10"
                  >
                    {isCheckingUniqueness ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continuar para pagamento <ChevronRight className="w-5 h-5" /></>}
                  </button>
                </motion.div>
              ) : (
                <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight">Pagamento</h2>
                    <p className="text-slate-500 mt-1.5 flex items-center gap-1.5 text-[15px]"><Lock className="w-4 h-4 text-emerald-600" /> Conexão criptografada e segura.</p>
                  </div>

                  <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-7">
                    <div className={`grid gap-3 ${billingCycle === 'ANNUAL' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {[
                        { id: 'CREDIT_CARD', icon: CreditCard, label: 'Cartão de crédito' },
                        ...(billingCycle === 'ANNUAL' ? [{ id: 'PIX', icon: QrCode, label: 'Pix' }] : [])
                      ].map((m) => (
                        <button key={m.id} type="button" onClick={() => setPaymentMethod(m.id as any)}
                          className={cn("flex items-center justify-center gap-2.5 py-4 rounded-2xl border-2 transition-all relative",
                            paymentMethod === m.id ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-100 bg-white text-slate-500 hover:border-slate-200")}>
                          {m.id === 'PIX' && <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-black rounded-full">5% OFF</span>}
                          <m.icon className="w-5 h-5" />
                          <span className="text-[14px] font-bold">{m.label}</span>
                        </button>
                      ))}
                    </div>

                    {paymentMethod === 'CREDIT_CARD' && (
                      <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
                        <div className="space-y-1.5">
                          <label className="text-[13px] font-bold text-slate-700">Número do cartão</label>
                          <div className="relative">
                            <CreditCard className="w-[18px] h-[18px] text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                            <input type="text" value={formData.cardNumber} onChange={(e) => setFormData({ ...formData, cardNumber: formatCardNumber(e.target.value) })} placeholder="0000 0000 0000 0000" className={cn(inputBase, inputOk)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                          <div className="space-y-1.5">
                            <label className="text-[13px] font-bold text-slate-700">Validade</label>
                            <input type="text" value={formData.expiry} onChange={(e) => setFormData({ ...formData, expiry: formatExpiry(e.target.value) })} placeholder="MM/AA" className={cn(inputBase, inputOk, "pl-4")} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[13px] font-bold text-slate-700">CVC</label>
                            <input type="text" value={formData.ccv} onChange={(e) => setFormData({ ...formData, ccv: formatCcv(e.target.value) })} placeholder="123" className={cn(inputBase, inputOk, "pl-4")} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[13px] font-bold text-slate-700">Nome do titular</label>
                          <div className="relative">
                            <User className="w-[18px] h-[18px] text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                            <input type="text" value={formData.holderName} onChange={(e) => setFormData({ ...formData, holderName: e.target.value })} placeholder="Como impresso no cartão" className={cn(inputBase, inputOk, "uppercase")} />
                          </div>
                        </div>
                        {billingCycle === 'ANNUAL' && (
                          <div className="space-y-1.5">
                            <label className="text-[13px] font-bold text-slate-700">Parcelamento</label>
                            <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-[15px] font-bold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 appearance-none cursor-pointer">
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                                <option key={num} value={num}>{num}x de R$ {priceFmt(finalPrice / num)} sem juros</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {paymentMethod === 'PIX' && (
                      <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in fade-in duration-200">
                        <div className="flex gap-4 items-start">
                          <QrCode className="w-8 h-8 text-emerald-600 shrink-0" />
                          <div>
                            <h4 className="font-black text-slate-900">Pagamento instantâneo via Pix</h4>
                            <p className="text-[13px] text-slate-600 mt-1 leading-relaxed">Ao finalizar, geramos o QR Code para você pagar e liberar o acesso na hora — com 5% de desconto.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button type="button" onClick={() => setStep(1)} className="text-[13px] font-bold text-slate-500 hover:text-slate-800 flex items-center justify-center w-full transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para os dados
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* RIGHT: resumo */}
          <div className="lg:col-span-5">
            <div className="sticky top-28 bg-slate-950 text-white rounded-3xl p-7 lg:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute -top-16 -right-16 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-7">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-black tracking-tight">Resumo do pedido</h3>
                  <span className="px-3 py-1 bg-white/10 text-emerald-400 text-[11px] font-bold rounded-full border border-white/10">{billingCycle === 'ANNUAL' ? 'Plano anual' : 'Plano mensal'}</span>
                </div>

                <div className="flex items-center gap-3 pb-1">
                  <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center">
                    <selectedPlan.icon className={cn("w-6 h-6", selectedPlan.color)} />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">Plano</p>
                    <p className="text-[15px] font-black">Acesso {selectedPlan.name}</p>
                  </div>
                </div>

                <div>
                  {paymentMethod === 'CREDIT_CARD' && billingCycle === 'ANNUAL' ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-medium text-slate-400">{installments}x</span>
                      <span className="text-4xl font-black tracking-tighter">R$ {priceFmt(finalPrice / installments)}</span>
                      <span className="text-slate-400">/mês</span>
                    </div>
                  ) : paymentMethod === 'CREDIT_CARD' && billingCycle === 'MONTHLY' ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black tracking-tighter">R$ {priceFmt(finalPrice)}</span>
                      <span className="text-slate-400">/mês</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black tracking-tighter">R$ {priceFmt(finalPrice)}</span>
                      <span className="text-emerald-400 font-bold">à vista</span>
                    </div>
                  )}
                </div>

                {/* Cupom */}
                <div className="space-y-3 pt-5 border-t border-white/10">
                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="Cupom de desconto" className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3 py-3 text-[14px] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 uppercase" />
                    </div>
                    <button type="button" onClick={handleApplyCoupon} disabled={isApplyingCoupon} className="bg-white/10 hover:bg-white/20 px-5 rounded-xl text-[13px] font-bold transition-colors text-white whitespace-nowrap flex items-center">
                      {isApplyingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar"}
                    </button>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between items-center text-[13px] font-bold text-emerald-400 bg-emerald-500/10 px-4 py-2.5 rounded-xl">
                      <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Cupom {appliedCoupon.code}</span>
                      <span>- {appliedCoupon.discount}%</span>
                    </div>
                  )}
                </div>

                {/* Linhas */}
                <div className="space-y-2.5 pt-5 border-t border-white/10 text-[13px] font-medium text-slate-300">
                  <div className="flex justify-between">
                    <span>{billingCycle === 'ANNUAL' ? 'Plano anual (12 meses)' : 'Assinatura mensal'}</span>
                    <span className="font-bold text-white">R$ {priceFmt(baseValue)}</span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Cupom {appliedCoupon.code}</span>
                      <span>- R$ {priceFmt(couponDiscount)}</span>
                    </div>
                  )}
                  {paymentMethod === 'PIX' && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Desconto Pix (5%)</span>
                      <span>- R$ {priceFmt(pixDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-black text-white pt-2.5 border-t border-white/10">
                    <span>Total</span>
                    <span>R$ {priceFmt(finalPrice)}{billingCycle === 'MONTHLY' ? '/mês' : ''}</span>
                  </div>
                  {paymentMethod === 'CREDIT_CARD' && (
                    <p className="text-[11px] text-slate-400 leading-relaxed pt-2">
                      {billingCycle === 'ANNUAL'
                        ? `Acesso liberado por 1 ano. Cobrança de ${installments}x de R$ ${priceFmt(finalPrice / installments)} no cartão.`
                        : 'Renovação automática todo mês. Cancele quando quiser.'}
                    </p>
                  )}
                </div>

                <button type="submit" disabled={loading || step === 1} className={cn("w-full py-4 rounded-2xl font-black text-[15px] flex items-center justify-center gap-2 transition-all shadow-xl",
                  (loading || step === 1) ? "bg-white/10 text-white/40 cursor-not-allowed" : "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20 hover:scale-[1.01]")}>
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Lock className="w-4 h-4" /> Ativar assinatura</>}
                </button>

                {step === 1 && <p className="text-center text-[12px] text-emerald-400 font-medium">Preencha seus dados ao lado para continuar.</p>}

                <div className="flex items-start gap-3 text-slate-400">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
                  <p className="text-[12px] leading-relaxed">7 dias de garantia incondicional. Se não gostar, devolvemos 100% do valor.</p>
                </div>
              </div>
            </div>
          </div>

        </form>
      </main>
    </div>
  );
}
