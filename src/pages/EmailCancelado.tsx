import React from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Logo } from "../components/Logo";
import { usePageMeta } from "../hooks/usePageMeta";

/* Destino do link "Parar de receber estes e-mails" (função nurture-leads). */
export default function EmailCancelado() {
  const [params] = useSearchParams();
  const erro = params.get("erro") === "1";
  usePageMeta("Cancelamento de e-mails", "Confirmação de cancelamento de e-mails do Represente-Se!", "/email-cancelado");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-6">
        <div className="flex justify-center"><Logo size="md" showText /></div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 space-y-4 shadow-sm">
          {erro ? (
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          ) : (
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          )}
          <h1 className="text-xl font-black text-slate-900 dark:text-white">
            {erro ? "Link inválido ou expirado" : "Pronto, você não receberá mais estes e-mails"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">
            {erro
              ? "Não conseguimos confirmar o cancelamento. Escreva para contato@representese.com que removemos você da lista."
              : "Seu e-mail foi removido da nossa sequência de lembretes. Avisos importantes sobre a sua conta continuam chegando."}
          </p>
          <Link to="/" className="inline-block text-sm font-bold text-emerald-600 hover:text-emerald-500">
            Voltar ao site
          </Link>
        </div>
      </div>
    </div>
  );
}
