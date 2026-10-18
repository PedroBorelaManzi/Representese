import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { AI_CONSENT_EVENT, setAiConsent } from '../lib/aiConsent';

/** Diálogo de permissão para enviar dados ao serviço de IA (Google Gemini). Montado uma vez no App;
 *  abre quando algum recurso de IA chama requestAiConsent(). */
export default function AiConsentDialog() {
  const [aberto, setAberto] = useState(false);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  useEffect(() => {
    const abrir = (e: Event) => {
      const detail = (e as CustomEvent<{ resolve: (v: boolean) => void }>).detail;
      resolverRef.current = detail.resolve;
      setAberto(true);
    };
    window.addEventListener(AI_CONSENT_EVENT, abrir);
    return () => window.removeEventListener(AI_CONSENT_EVENT, abrir);
  }, []);

  const responder = (permitiu: boolean) => {
    setAiConsent(permitiu);
    setAberto(false);
    resolverRef.current?.(permitiu);
    resolverRef.current = null;
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 id="ai-consent-title" className="text-lg font-black text-slate-900 dark:text-white">
            Enviar dados para a IA?
          </h2>
        </div>

        <p className="text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
          Para responder, a IA do Represente-Se! usa o serviço <strong>Google Gemini</strong>, de terceiros. Antes de continuar, saiba o que acontece:
        </p>

        <ul className="text-sm text-slate-600 dark:text-zinc-300 space-y-2 list-disc pl-5 leading-relaxed">
          <li>
            <strong>O que é enviado:</strong> o texto que você escreve ou dita, fotos e arquivos que você anexa e, quando necessário
            para a resposta, dados do seu CRM — nomes, contatos e endereços de clientes, pedidos, compromissos e as empresas que você representa.
          </li>
          <li>
            <strong>Para quem:</strong> os dados passam pelos nossos servidores e são enviados à <strong>Google (API Gemini)</strong>.
          </li>
          <li>
            <strong>Para quê:</strong> só para gerar a resposta ou a importação que você pediu. Não vendemos esses dados nem os usamos para publicidade.
          </li>
          <li>Você pode usar o app sem a IA e revogar a permissão a qualquer momento em Configurações.</li>
        </ul>

        <p className="text-xs text-slate-500 dark:text-zinc-400 flex gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>
            Detalhes na <a href="/privacy" className="underline text-emerald-600">Política de Privacidade</a>, seção “Inteligência artificial”.
          </span>
        </p>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            onClick={() => responder(false)}
            className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 font-bold text-sm hover:bg-slate-50 dark:hover:bg-zinc-800"
          >
            Agora não
          </button>
          <button
            onClick={() => responder(true)}
            className="flex-1 px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm"
          >
            Permitir e continuar
          </button>
        </div>
      </div>
    </div>
  );
}
