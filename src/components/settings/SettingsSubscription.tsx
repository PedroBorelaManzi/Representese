import React from 'react';
import { Trophy, Crown, Gem, CheckCircle2, Clock, TrendingUp, Building2, Map as MapIcon, MessageCircle, ChevronRight, Sparkles, Zap, Check, Mail, BarChart3, Star, Infinity } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { isIOSApp, SITE_DOMAIN } from '../../lib/iapPolicy';

interface SettingsSubscriptionProps {
  onClose: () => void;
}

const planInfo = {
  exclusivo: { 
    name: 'Exclusivo', 
    icon: Trophy, 
    color: 'text-slate-400 dark:text-slate-300', 
    bg: 'bg-slate-50 dark:bg-zinc-800/50', 
    border: 'border-slate-100 dark:border-zinc-800' 
  },
  profissional: { 
    name: 'Profissional', 
    icon: Gem, 
    color: 'text-emerald-500 dark:text-emerald-400', 
    bg: 'bg-emerald-50 dark:bg-emerald-950/20', 
    border: 'border-emerald-100 dark:border-emerald-900/30' 
  },
  premium: { 
    name: 'Profissional', 
    icon: Gem, 
    color: 'text-emerald-500 dark:text-emerald-400', 
    bg: 'bg-emerald-50 dark:bg-emerald-950/20', 
    border: 'border-emerald-100 dark:border-emerald-900/30' 
  },
  master: { 
    name: 'Master', 
    icon: Crown, 
    color: 'text-amber-500 dark:text-amber-400', 
    bg: 'bg-amber-50 dark:bg-amber-950/20', 
    border: 'border-amber-100 dark:border-amber-900/30' 
  }
};

const tierSequence = ['exclusivo', 'profissional', 'master'];

export const SettingsSubscription = React.memo(function SettingsSubscription({ onClose }: SettingsSubscriptionProps) {
  const { settings } = useSettings();
  const navigate = useNavigate();

  const currentPlan = planInfo[settings.plan_id as keyof typeof planInfo] || planInfo.exclusivo;
  const tierId = settings.plan_id ? (settings.plan_id === 'premium' ? 'profissional' : settings.plan_id) : 'exclusivo';
  const currentIndex = tierSequence.indexOf(tierId) !== -1 ? tierSequence.indexOf(tierId) : 0;

  // iOS: nenhum CTA de compra/upgrade/cancelamento (App Store 3.1.1).
  const iosApp = isIOSApp();

  const manageOnWebNote = (
    <div className="p-5 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 text-left space-y-1.5">
      <p className="text-xs font-black text-slate-700 dark:text-zinc-200 uppercase tracking-wider">
        Gerenciar assinatura
      </p>
      <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 leading-relaxed">
        Para trocar de plano, cancelar ou ver faturas, acesse sua conta em{' '}
        <span className="text-emerald-600 dark:text-emerald-400">{SITE_DOMAIN}</span> pelo navegador.
        Você também pode excluir a conta inteira em <strong>Meu Perfil</strong> — isso já cancela a assinatura.
      </p>
    </div>
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <h2 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Sua Assinatura</h2>
        <div className={cn("px-6 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] shadow-sm", currentPlan.bg, currentPlan.border, currentPlan.color)}>
          {currentPlan.name}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={cn("p-6 rounded-3xl border relative overflow-hidden shadow-lg text-left", currentPlan.bg, currentPlan.border)}>
          <div className="absolute top-3 right-3 px-2 py-0.5 bg-emerald-500 text-white text-[7px] rounded-full font-black uppercase tracking-wider animate-pulse">
            Ativo
          </div>
          <div className="flex items-center gap-3 mb-4">
            <currentPlan.icon className={cn("w-5 h-5", currentPlan.color)} />
            <span className={cn("text-[10px] font-black uppercase tracking-widest", currentPlan.color)}>Seu Nível Atual</span>
          </div>
          <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">{currentPlan.name}</h4>
          <p className="text-[8px] font-bold text-slate-400 uppercase mt-2">Status da Assinatura: Ativo</p>
        </div>

        {!iosApp && currentIndex < 2 ? (() => {
          const supId = tierSequence[currentIndex + 1];
          const supPlan = planInfo[supId as keyof typeof planInfo];
          const priceDiff = 50; 
          return (
            <button 
              type="button"
              onClick={() => { onClose(); navigate('/dashboard/order-bump'); }}
              className="p-6 rounded-3xl border border-amber-200/50 dark:border-amber-900/30 bg-amber-50/10 dark:bg-amber-950/5 relative overflow-hidden text-left shadow-[0_0_20px_rgba(245,158,11,0.08)] ring-2 ring-amber-500/10 hover:scale-[1.03] active:scale-98 transition-all group"
            >
              <div className="absolute top-3 right-3 px-2 py-0.5 bg-amber-500 text-white text-[7px] rounded-full font-black uppercase tracking-wider animate-bounce">
                UPGRADE
              </div>
              <div className="flex items-center gap-3 mb-4">
                <supPlan.icon className="w-5 h-5 text-amber-500 animate-pulse" />
                <span className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest">Nível Recomendado</span>
              </div>
              <h4 className="text-lg font-black text-amber-600 dark:text-amber-400 uppercase tracking-tight leading-none">{supPlan.name}</h4>
              <p className="text-[8px] font-black text-amber-700 dark:text-amber-500 uppercase tracking-wide mt-2">
                Apenas +R$ {priceDiff} /mês
              </p>
            </button>
          );
        })() : iosApp ? null : (
          <div className="p-6 rounded-3xl border border-dashed border-amber-200/40 dark:border-amber-900/20 flex flex-col justify-center items-center text-center bg-amber-50/5">
            <Crown className="w-5 h-5 text-amber-500 mb-2 animate-bounce" />
            <span className="text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">Nível Máximo Atingido</span>
          </div>
        )}
      </div>

      <div className={cn("p-6 md:p-10 rounded-3xl md:rounded-[48px] border relative overflow-hidden", currentPlan.bg, currentPlan.border)}>
        <div className="relative z-10 space-y-8">
           <div className="flex items-center gap-6">
              <div className="p-5 bg-white dark:bg-zinc-900 rounded-[28px] shadow-sm">
                <currentPlan.icon className={cn("w-10 h-10", currentPlan.color)} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.3em]">Plano Atual</p>
                <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Acesso {currentPlan.name}</h3>
              </div>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Status', value: 'Ativo', icon: CheckCircle2, color: 'text-emerald-500' },
                { label: 'Renovação', value: localStorage.getItem('rm_billing_cycle') || 'Mensal', icon: TrendingUp, color: 'text-blue-500' },
                { label: 'Vencimento', value: localStorage.getItem('rm_expiration_date') || '30 dias', icon: Clock, color: 'text-amber-500' }
              ].map((stat, i) => (
                <div key={i} className="p-4 bg-white/50 dark:bg-zinc-900/50 rounded-2xl border border-white/20 dark:border-zinc-800 text-left">
                  <p className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1">{stat.label}</p>
                  <div className="flex items-center gap-2">
                    <stat.icon className={cn("w-3 h-3", stat.color)} />
                    <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">{stat.value}</span>
                  </div>
                </div>
              ))}
           </div>

           <div className="space-y-3">
              <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-4 text-left">Seus Benefícios</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tierId === 'exclusivo' && [
                  { text: '1 Empresa cadastrada', icon: Building2 },
                  { text: '1 Usuário Simultâneo', icon: Check },
                  { text: 'Acesso ao App Mobile', icon: Check },
                  { text: 'Suporte por e-mail (até 24h)', icon: Check },
                  { text: 'Histórico de 30 dias', icon: Check },
                  { text: 'Mapa Territorial Básico', icon: MapIcon },
                  { text: 'CRM Essencial', icon: Check },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-3 text-slate-600 dark:text-zinc-300">
                    <b.icon className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-black uppercase tracking-tight">{b.text}</span>
                  </div>
                ))}
                {(tierId === 'profissional' || tierId === 'premium') && [
                  { text: 'Até 5 Empresas', icon: Building2 },
                  { text: 'Mapa Territorial Básico', icon: MapIcon },
                  { text: 'CRM Essencial', icon: Check },
                  { text: 'Busca CNPJ Automática', icon: Zap },
                  { text: 'Dashboard de Faturamento', icon: BarChart3 },
                  { text: 'Exportação de Relatórios', icon: Check },
                  { text: 'Suporte via WhatsApp', icon: Star }
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-3 text-slate-600 dark:text-zinc-300">
                    <b.icon className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-black uppercase tracking-tight">{b.text}</span>
                  </div>
                ))}
                {tierId === 'master' && [
                  { text: 'Empresas Ilimitadas', icon: Infinity },
                  { text: 'Radar Territorial Avançado', icon: MapIcon },
                  { text: 'CRM Essencial', icon: Check },
                  { text: 'Busca CNPJ Automática', icon: Zap },
                  { text: 'BI & Analytics Avançado', icon: BarChart3 },
                  { text: 'Exportação de Relatórios', icon: Check },
                  { text: 'Assistente IA para clientes', icon: Sparkles },
                  { text: 'Digitalização de Pedidos por IA', icon: Zap },
                  { text: 'Integração com Inbox', icon: Mail },
                  { text: 'Suporte via WhatsApp Prioritário', icon: Star }
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-3 text-slate-600 dark:text-zinc-300">
                    <b.icon className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-black uppercase tracking-tight">{b.text}</span>
                  </div>
                ))}
              </div>
           </div>

        </div>
      </div>

      {iosApp ? manageOnWebNote : currentIndex === 2 ? (
        <div className="flex flex-col gap-4">
          <div className="p-8 rounded-[32px] bg-gradient-to-r from-amber-500/5 to-yellow-500/5 border border-amber-500/20 text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500">
              <Crown className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-lg font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Você já está usando o plano Master</h3>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-relaxed">
              Parabéns! Sua assinatura está no nível máximo com acesso ilimitado a todas as ferramentas e recursos da plataforma.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <button 
              onClick={() => {
                onClose();
                setTimeout(() => navigate('/planos'), 100);
              }}
              className="flex-1 py-4 rounded-[20px] bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 dark:hover:bg-zinc-700/50 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Ver Todos os Planos
            </button>
            <button 
              onClick={() => window.open('https://wa.me/5515997472785?text=Ol%C3%A1%2C%20gostaria%20de%20conversar%20sobre%20o%20cancelamento%20do%20meu%20plano...', '_blank')}
                className="flex-1 py-4 rounded-[20px] bg-red-50 dark:bg-zinc-800 border border-red-100 dark:border-zinc-700 text-red-600 dark:text-red-400 font-black uppercase text-[10px] tracking-widest hover:bg-red-100 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              Gerenciar / Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button 
            onClick={() => {
              onClose();
              setTimeout(() => navigate('/dashboard/order-bump'), 100);
            }}
            className="w-full py-5 rounded-[24px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-4 group shadow-xl shadow-emerald-500/20 active:scale-98 transition-all relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Sparkles className="w-4 h-4 animate-pulse" />
            DÊ UM UPGRADE NO SEU PLANO 
            <ChevronRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
          </button>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={() => {
                onClose();
                setTimeout(() => navigate('/planos'), 100);
              }}
              className="flex-1 py-4 rounded-[20px] bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 dark:hover:bg-zinc-700/50 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Ver Todos os Planos
            </button>
            <button 
              onClick={() => window.open('https://wa.me/5515997472785?text=Ol%C3%A1%2C%20gostaria%20de%20conversar%20sobre%20o%20cancelamento%20do%20meu%20plano...', '_blank')}
                className="flex-1 py-4 rounded-[20px] bg-red-50 dark:bg-zinc-800 border border-red-100 dark:border-zinc-700 text-red-600 dark:text-red-400 font-black uppercase text-[10px] tracking-widest hover:bg-red-100 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              Gerenciar / Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
