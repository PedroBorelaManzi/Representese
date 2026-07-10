import React, { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ShieldAlert, CreditCard, ExternalLink, MessageCircle, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { Logo } from './Logo';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { settings, loading: settingsLoading } = useSettings();
  const { user } = useAuth();
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  // Se estiver carregando, não bloqueia ainda para evitar flashes
  if (settingsLoading) return <>{children}</>;

  // Se o status for 'past_due', mostramos a tela de bloqueio financeiro
  const isPastDue = settings.subscription_status === 'past_due' || settings.subscription_status === 'canceled';
  
  // Se for 'inactive', é um lead novo que ainda não escolheu o plano
  const isLead = settings.subscription_status === 'inactive';

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

  if (isPastDue || isLead) {
    const whatsappNumber = "5515997472785";
    const userEmail = user?.email || "não informado";
    
    // UI Amigável para LEADS novos (inactive)
    if (isLead) {
      return (
        <div className="fixed inset-0 z-[9999] bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full space-y-8 relative z-10">
            <Logo size="lg" />
            
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-8 rounded-[40px] space-y-6 shadow-xl">
              <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                <Sparkles className="w-10 h-10" />
              </div>
              
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Quase lá!</h1>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                  Sua conta foi criada com sucesso. Para começar a usar o sistema e gerenciar suas representações, você precisa escolher um plano.
                </p>
              </div>

              <div className="pt-2">
                <Link 
                  to="/planos"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-5 rounded-2xl font-black uppercase text-[12px] tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-600/20"
                >
                  Ver Planos Disponíveis
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // UI de Bloqueio para INADIMPLENTES (past_due)
    const whatsappMessage = encodeURIComponent(`Olá! Estou com uma pendência no meu acesso ao Representese e gostaria de regularizar. Meu e-mail é: ${userEmail}`);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

    return (
      <div className="fixed inset-0 z-[9999] bg-white dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 dark:opacity-10">
          <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-400 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-400 rounded-full blur-[120px]" />
        </div>

        <div className="max-w-md w-full space-y-8 relative z-10">
          <Logo size="lg" />
          
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 p-8 rounded-[40px] space-y-6 shadow-2xl shadow-red-500/10">
            <div className="w-20 h-20 bg-red-500 text-white rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-red-500/30">
              <ShieldAlert className="w-10 h-10" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Acesso Suspenso</h1>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] leading-relaxed">
                Identificamos uma pendência no seu pagamento recorrente. Seus dados estão salvos e seguros, mas o acesso ao painel foi temporariamente bloqueado.
              </p>
            </div>

            <div className="space-y-3">
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
                    Regularizar Agora
                    <ExternalLink className="w-3.5 h-3.5 opacity-50" />
                  </>
                )}
              </button>
              
              <button 
                className="w-full bg-emerald-500/10 text-emerald-600 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-500/20 transition-all"
                onClick={() => window.open(whatsappUrl, '_blank')}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Falar com Suporte (WhatsApp)
              </button>
            </div>
          </div>

          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Assim que o pagamento da fatura for identificado, seu acesso será liberado automaticamente.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
