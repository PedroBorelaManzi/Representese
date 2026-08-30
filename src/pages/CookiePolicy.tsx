import React from "react";
import { Cookie, ArrowLeft, ShieldCheck, BarChart3, Sliders } from "lucide-react";
import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

/* Política de Cookies. Se mudar o que é coletado aqui, atualize também a tabela
 * e suba CONSENT_VERSION em src/lib/cookieConsent.ts para o banner reaparecer. */

type Linha = { nome: string; provedor: string; finalidade: string; duracao: string };

const NECESSARIOS: Linha[] = [
  { nome: "sb-<projeto>-auth-token", provedor: "Supabase", finalidade: "Mantém você logado (sessão e refresh token).", duracao: "Até o logout" },
  { nome: "rm_remember_me", provedor: "Represente-Se!", finalidade: "Lembra o e-mail na tela de login.", duracao: "Persistente" },
  { nome: "rm_sync_queue / cache offline", provedor: "Represente-Se!", finalidade: "Fila de sincronização e dados para uso offline.", duracao: "Persistente" },
  { nome: "rm_chunk_reload", provedor: "Represente-Se!", finalidade: "Evita recarregamento em loop após um novo deploy.", duracao: "Sessão" },
];

const PREFERENCIAS: Linha[] = [
  { nome: "theme", provedor: "Represente-Se!", finalidade: "Guarda o tema claro/escuro escolhido.", duracao: "Persistente" },
  { nome: "rm_map_cluster_enabled, rm_notif_*, crm_shortcut_links", provedor: "Represente-Se!", finalidade: "Preferências de mapa, notificações e atalhos.", duracao: "Persistente" },
];

const ANALITICOS: Linha[] = [
  { nome: "ph_* / posthog", provedor: "PostHog", finalidade: "Métricas de uso do produto e eventos de navegação. Só com seu aceite.", duracao: "Até 12 meses" },
  { nome: "landing_session_id", provedor: "Represente-Se!", finalidade: "Identificador aleatório para não contar a mesma visita duas vezes.", duracao: "Persistente" },
  { nome: "user_events / landing_events", provedor: "Represente-Se! (Supabase)", finalidade: "Tempo em cada tela e seções vistas, para melhorar o app.", duracao: "Armazenado na conta" },
];

const LEGITIMO: Linha[] = [
  { nome: "Sentry", provedor: "Sentry", finalidade: "Registra erros e falhas para corrigirmos rápido. Base legal: legítimo interesse (estabilidade e segurança).", duracao: "Até 90 dias" },
  { nome: "Vercel Speed Insights", provedor: "Vercel", finalidade: "Mede velocidade de carregamento. Anônimo e sem cookies.", duracao: "—" },
];

function Tabela({ linhas }: { linhas: Linha[] }) {
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-left text-[13px] border-separate border-spacing-y-1 px-2">
        <thead>
          <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            <th className="py-2 pr-4 font-black">Nome</th>
            <th className="py-2 pr-4 font-black">Provedor</th>
            <th className="py-2 pr-4 font-black">Finalidade</th>
            <th className="py-2 font-black whitespace-nowrap">Duração</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome} className="align-top">
              <td className="py-2 pr-4 font-mono text-[12px] text-slate-700 dark:text-zinc-300 whitespace-nowrap">{l.nome}</td>
              <td className="py-2 pr-4 font-bold text-slate-600 dark:text-zinc-400 whitespace-nowrap">{l.provedor}</td>
              <td className="py-2 pr-4 font-medium text-slate-500 dark:text-zinc-400">{l.finalidade}</td>
              <td className="py-2 font-medium text-slate-500 dark:text-zinc-400 whitespace-nowrap">{l.duracao}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CookiePolicy() {
  usePageMeta(
    "Política de Cookies",
    "O que o Represente-Se! guarda no seu navegador, para quê, e como controlar o consentimento.",
    "/cookies"
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" /> Voltar para o Início
        </Link>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[40px] p-8 sm:p-16 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-12 opacity-5">
            <Cookie className="w-40 h-40" />
          </div>

          <h1 className="text-4xl font-black text-slate-900 dark:text-zinc-100 mb-8 uppercase tracking-tighter">Política de Cookies</h1>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-12">Atualizada em 30 de Agosto de 2026</p>

          <div className="space-y-10 text-slate-600 dark:text-zinc-400 leading-relaxed font-medium">
            <section className="space-y-4">
              <p>
                Chamamos de "cookies" tudo o que o Represente-Se! guarda no seu navegador — cookies,{" "}
                <code className="text-[12px]">localStorage</code> e <code className="text-[12px]">sessionStorage</code>. Usamos
                o mínimo necessário e nunca para publicidade ou venda de dados. Você decide sobre os itens não essenciais
                no banner que aparece na primeira visita, e pode mudar a qualquer momento em{" "}
                <strong className="font-bold text-slate-700 dark:text-zinc-200">Configurações › Privacidade</strong>.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center text-emerald-600"><ShieldCheck className="w-4 h-4" /></div>
                Essenciais
              </h2>
              <p>Sem eles o app não funciona — mantêm o login, a segurança e o uso offline. Não dependem de consentimento.</p>
              <Tabela linhas={NECESSARIOS} />
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center text-indigo-600"><Sliders className="w-4 h-4" /></div>
                Preferências
              </h2>
              <p>Lembram escolhas suas de interface. Ficam só no seu dispositivo.</p>
              <Tabela linhas={PREFERENCIAS} />
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center text-amber-600"><BarChart3 className="w-4 h-4" /></div>
                Análise de uso
              </h2>
              <p>
                Só são ativados se você aceitar. Ajudam a entender quais telas são usadas e onde o app trava, para
                priorizar melhorias. Se você recusar, nada disso roda.
              </p>
              <Tabela linhas={ANALITICOS} />
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center text-slate-600 dark:text-zinc-300"><ShieldCheck className="w-4 h-4" /></div>
                Monitoramento de erros (legítimo interesse)
              </h2>
              <p>
                Ferramentas de estabilidade que rodam sob a base legal de legítimo interesse (art. 7º, IX da LGPD), por
                serem essenciais para segurança e correção de falhas. Não são usadas para perfilar você nem para anúncios.
              </p>
              <Tabela linhas={LEGITIMO} />
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200">Como controlar</h2>
              <p>
                Além do banner e de <strong className="font-bold text-slate-700 dark:text-zinc-200">Configurações › Privacidade</strong>,
                você pode bloquear ou apagar cookies nas configurações do seu navegador — mas isso pode desligar o login e
                o uso offline. Para excluir seus dados da conta, veja{" "}
                <Link to="/exclusao-de-dados" className="text-emerald-600 underline">Exclusão de Conta e Dados</Link>.
              </p>
              <p className="text-xs text-slate-400 dark:text-zinc-500">
                Veja também a <Link to="/privacy" className="underline">Política de Privacidade</Link>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
