import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, X, Users, CalendarPlus, ShoppingBag, FileSpreadsheet, Building2, ChevronRight, PartyPopper } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { cn } from "../lib/utils";

interface GettingStartedCardProps {
  clientsCount: number;
  appointmentsCount: number;
  ordersCount: number;
  hasImportedSpreadsheet: boolean;
  onNewAppointment: () => void;
}

/**
 * Checklist de primeiros passos exibido no Início até o usuário completar
 * (ou dispensar) a jornada inicial. O progresso é calculado dos dados reais —
 * nada é marcado à mão. Usuários antigos que já fizeram tudo nunca veem o
 * card: sem a flag "started", ele se auto-oculta em silêncio.
 */
export default function GettingStartedCard({
  clientsCount,
  appointmentsCount,
  ordersCount,
  hasImportedSpreadsheet,
  onNewAppointment,
}: GettingStartedCardProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const hiddenKey = user ? `rm_getting_started_hidden_${user.id}` : null;
  const startedKey = user ? `rm_getting_started_started_${user.id}` : null;
  const [hidden, setHidden] = useState(() => (hiddenKey ? localStorage.getItem(hiddenKey) === "true" : true));

  const steps = [
    {
      id: "empresas",
      label: "Configurar suas empresas",
      description: "Feito no seu primeiro acesso",
      done: (settings.categories?.length ?? 0) > 0,
      icon: Building2,
      onClick: () => navigate("/dashboard/empresas", { state: { openAddCompany: true } }),
    },
    {
      id: "cliente",
      label: "Cadastrar seu primeiro cliente",
      description: "Pelo CNPJ, os dados da empresa vêm sozinhos",
      done: clientsCount > 0,
      icon: Users,
      onClick: () => navigate("/dashboard/clientes"),
    },
    {
      id: "planilhas",
      label: "Importe suas planilhas",
      description: "Centralize seus arquivos e relatórios",
      done: hasImportedSpreadsheet,
      icon: FileSpreadsheet,
      onClick: () => navigate("/dashboard/arquivos"),
    },
    {
      id: "visita",
      label: "Agendar sua primeira visita",
      description: "Organize a semana direto na agenda",
      done: appointmentsCount > 0,
      icon: CalendarPlus,
      onClick: onNewAppointment,
    },
    {
      id: "pedido",
      label: "Lançar seu primeiro pedido",
      description: "Envie foto ou PDF — a IA extrai cliente e valor",
      done: ordersCount > 0,
      icon: ShoppingBag,
      onClick: () => navigate("/dashboard/empresas"),
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const started = startedKey ? localStorage.getItem(startedKey) === "true" : false;
  // Conta já rodando antes do checklist existir: some sem nunca aparecer.
  const silentlyHide = allDone && !started;

  // Marca que o usuário viu o checklist incompleto — só quem passou por aqui
  // ganha a celebração ao concluir. Usuário antigo (tudo pronto de cara) nunca vê nada.
  useEffect(() => {
    if (!hidden && !allDone && startedKey) {
      localStorage.setItem(startedKey, "true");
    }
  }, [hidden, allDone, startedKey]);

  useEffect(() => {
    if (silentlyHide && hiddenKey && !hidden) {
      localStorage.setItem(hiddenKey, "true");
      setHidden(true);
    }
  }, [silentlyHide, hiddenKey, hidden]);

  if (!user || hidden || silentlyHide) return null;

  const dismiss = () => {
    if (hiddenKey) localStorage.setItem(hiddenKey, "true");
    setHidden(true);
  };

  if (allDone) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-emerald-600 rounded-[28px] p-5 sm:p-6 flex items-center gap-4 shadow-xl shadow-emerald-600/20"
      >
        <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
          <PartyPopper className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-white uppercase tracking-tight">Configuração completa!</h3>
          <p className="text-xs text-emerald-50/90 font-medium mt-0.5">
            Sua operação está rodando: clientes, agenda, pedidos e sincronização ativos.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="px-4 py-2.5 bg-white text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50 transition-all active:scale-95 shrink-0"
        >
          Concluir
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-zinc-900 rounded-[28px] border border-slate-200/80 dark:border-zinc-800/80 shadow-sm p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900 dark:text-zinc-50 uppercase tracking-tight">Primeiros passos</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium mt-0.5">
            Complete a jornada e veja seu painel ganhar vida.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="p-2 rounded-xl text-slate-300 hover:text-slate-500 hover:bg-slate-50 dark:text-zinc-600 dark:hover:text-zinc-400 dark:hover:bg-zinc-800 transition-all shrink-0"
          title="Ocultar primeiros passos"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(doneCount / steps.length) * 100}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full bg-emerald-500 rounded-full"
          />
        </div>
        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest shrink-0 tabular-nums">
          {doneCount} de {steps.length}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
        {steps.map((step) => {
          const Interactive = !step.done && step.onClick;
          const Wrapper = Interactive ? "button" : "div";
          return (
            <Wrapper
              key={step.id}
              onClick={Interactive ? step.onClick : undefined}
              className={cn(
                "flex lg:flex-col items-center lg:items-start gap-3 lg:gap-2 p-3 rounded-2xl border text-left transition-all",
                step.done
                  ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30"
                  : Interactive
                    ? "bg-slate-50 dark:bg-zinc-950 border-slate-100 dark:border-zinc-800 hover:border-emerald-500/40 hover:shadow-md hover:shadow-emerald-500/5 active:scale-[0.98] cursor-pointer group"
                    : "bg-slate-50 dark:bg-zinc-950 border-slate-100 dark:border-zinc-800"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                  step.done
                    ? "bg-emerald-500 text-white"
                    : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-400 group-hover:text-emerald-600 group-hover:border-emerald-500/40"
                )}
              >
                {step.done ? <Check className="w-4 h-4" strokeWidth={3} /> : <step.icon className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-[11px] font-black uppercase tracking-tight leading-tight",
                    step.done ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-zinc-200"
                  )}
                >
                  {step.label}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium leading-snug mt-0.5 hidden sm:block">
                  {step.description}
                </p>
              </div>
              {Interactive && (
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition-colors shrink-0 lg:hidden" />
              )}
            </Wrapper>
          );
        })}
      </div>
    </motion.div>
  );
}
