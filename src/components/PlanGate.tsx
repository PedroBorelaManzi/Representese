import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import { useSettings } from "../contexts/SettingsContext";
import { planBloqueiaRota } from "../lib/planAccess";

/* Envolve as telas que começam no plano Profissional. Quem está no Exclusivo vê
   um convite para fazer o upgrade; os demais passam direto. */
export function PlanGate({ children }: { children: React.ReactElement }) {
  const { settings, loading } = useSettings();
  const { pathname } = useLocation();
  if (loading || !planBloqueiaRota(settings.plan_id, pathname)) return children;

  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center space-y-5" data-testid="plan-gate">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mx-auto">
        <Lock className="w-7 h-7 text-emerald-600" />
      </div>
      <h1 className="text-xl font-black text-slate-900 dark:text-white">Disponível a partir do plano Profissional</h1>
      <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">
        Relatórios, comissões, análise de produtos, ranking e e-mails fazem parte do plano Profissional.
        Seus clientes, pedidos, agenda e mapa continuam funcionando normalmente.
      </p>
      <Link to="/planos" className="inline-block px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black uppercase tracking-wide">
        Ver planos
      </Link>
    </div>
  );
}
