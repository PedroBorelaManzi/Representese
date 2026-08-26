import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  ChevronLeft,
  ChevronRight,
  Percent,
  TrendingUp,
  TrendingDown,
  Loader2,
  Settings2,
  Check,
  Building2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { offlineCache } from "../lib/offlineCache";
import { cn } from "../lib/utils";
import { PageHeader, Skeleton } from "../components/ui";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ExportCommissionsButton } from "../components/ExportCommissionsButton";
import { computeCommissionRows, computeCommissionTotals, type MonthOrder } from "../lib/commissions";

const BRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function Comissoes() {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();

  const [refDate, setRefDate] = useState(() => new Date());
  const [configOpen, setConfigOpen] = useState(false);
  const [draftCommissions, setDraftCommissions] = useState<Record<string, number>>({});
  const [draftMode, setDraftMode] = useState<Record<string, 'fixed' | 'per_product'>>({});
  const [saving, setSaving] = useState(false);

  const year = refDate.getFullYear();
  const month = refDate.getMonth();

  // Empresas representadas do usuário
  const companies = useMemo(
    () => (settings?.categories || []).filter((c) => c && c.trim()),
    [settings?.categories]
  );

  const commissions = settings?.commissions || {};

  // Sincroniza o rascunho de configuração quando abre o painel
  useEffect(() => {
    if (configOpen) {
      const draft: Record<string, number> = {};
      const draftM: Record<string, 'fixed' | 'per_product'> = {};
      companies.forEach((c) => {
        draft[c] = Number(commissions[c] ?? 0);
        draftM[c] = settings?.commission_mode?.[c] === 'per_product' ? 'per_product' : 'fixed';
      });
      setDraftCommissions(draft);
      setDraftMode(draftM);
    }
  }, [configOpen, companies, commissions, settings?.commission_mode]);

  const commissionMode = settings?.commission_mode || {};
  const productCommissions = settings?.product_commissions || {};

  // Busca pedidos do mês de referência e do mês anterior (para comparação)
  const { data, isLoading } = useQuery({
    queryKey: ["comissoes-orders", user?.id, year, month, commissionMode, productCommissions],
    queryFn: async () => {
      // Sem internet, nem tenta a rede — evita o "Nenhum pedido em [mês]"
      // enganoso quando na verdade é só falta de sinal, e reaproveita o que
      // já tiver em cache em vez de estourar erro.
      if (!offlineCache.isOnline()) {
        return (
          queryClient.getQueryData<{ current: MonthOrder[]; previous: MonthOrder[] }>([
            "comissoes-orders",
            user?.id,
            year,
            month,
          ]) || { current: [], previous: [] }
        );
      }

      const startCurrent = new Date(year, month, 1).toISOString();
      const endCurrent = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const startPrev = new Date(year, month - 1, 1).toISOString();
      const endPrev = new Date(year, month, 0, 23, 59, 59).toISOString();

      // Fonte: order_installments, não orders — cada parcela conta no mês do
      // SEU vencimento (due_date), não no mês em que o pedido foi lançado.
      // Pedido sem condição de pagamento explícita continua com 1 parcela só,
      // vencendo na própria data do pedido (ver trigger
      // regenerate_order_installments), então o comportamento de hoje não
      // muda pra quem nunca usa parcelamento.
      const startCurrentDate = startCurrent.split("T")[0];
      const endCurrentDate = endCurrent.split("T")[0];
      const startPrevDate = startPrev.split("T")[0];
      const endPrevDate = endPrev.split("T")[0];

      const [curRes, prevRes] = await Promise.all([
        supabase
          .from("order_installments")
          .select("due_date, value, order_id, orders!inner(category)")
          .eq("user_id", user!.id)
          .gte("due_date", startCurrentDate)
          .lte("due_date", endCurrentDate),
        supabase
          .from("order_installments")
          .select("due_date, value, order_id, orders!inner(category)")
          .eq("user_id", user!.id)
          .gte("due_date", startPrevDate)
          .lte("due_date", endPrevDate),
      ]);
      if (curRes.error) throw curRes.error;

      const allRows = [...(curRes.data || []), ...(prevRes.data || [])];

      // Empresas em modo "por produto": a comissão de cada parcela precisa do
      // blend dos % de produto do pedido inteiro (não só o valor da parcela),
      // então busca os itens dos pedidos envolvidos — só desses pedidos, não
      // de todos, pra não puxar order_items à toa quando ninguém usa isso.
      const orderIdsPorProduto = Array.from(
        new Set(
          allRows
            .filter((r: any) => commissionMode[r.orders?.category] === "per_product")
            .map((r: any) => r.order_id)
        )
      );

      const blendPctPorPedido = new Map<string, number>();
      if (orderIdsPorProduto.length > 0) {
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("order_id, category, product_key, total_value")
          .in("order_id", orderIdsPorProduto);

        const porPedido = new Map<string, { totalValue: number; totalComissao: number }>();
        (itemsData || []).forEach((item: any) => {
          const valor = Number(item.total_value) || 0;
          if (valor <= 0) return;
          const groupKey = `${item.category}::${item.product_key}`;
          // Produto sem % próprio configurado usa o % da empresa como padrão
          // — assim ativar "por produto" não zera a comissão de produtos que
          // ainda não foram configurados individualmente.
          const pctProduto = Number(
            productCommissions[groupKey] ?? commissions[item.category] ?? 0
          );
          const acc = porPedido.get(item.order_id) || { totalValue: 0, totalComissao: 0 };
          acc.totalValue += valor;
          acc.totalComissao += valor * (pctProduto / 100);
          porPedido.set(item.order_id, acc);
        });
        porPedido.forEach((acc, orderId) => {
          if (acc.totalValue > 0) blendPctPorPedido.set(orderId, (acc.totalComissao / acc.totalValue) * 100);
        });
      }

      const toMonthOrders = (rows: any[] | null): MonthOrder[] =>
        (rows || []).map((r) => {
          const value = Number(r.value) || 0;
          const blendPct = blendPctPorPedido.get(r.order_id);
          return {
            category: r.orders?.category || "",
            value,
            created_at: r.due_date,
            commissionOverride: blendPct !== undefined ? value * (blendPct / 100) : undefined,
          };
        });

      return {
        current: toMonthOrders(curRes.data),
        previous: toMonthOrders(prevRes.data),
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const rows = useMemo(
    () => computeCommissionRows(data?.current || [], data?.previous || [], companies, commissions),
    [data, companies, commissions]
  );

  const totals = useMemo(() => computeCommissionTotals(rows), [rows]);

  const deltaPct =
    totals.comissaoPrev > 0
      ? ((totals.comissao - totals.comissaoPrev) / totals.comissaoPrev) * 100
      : null;

  const goPrevMonth = () => setRefDate(new Date(year, month - 1, 1));
  const goNextMonth = () => setRefDate(new Date(year, month + 1, 1));
  const isCurrentMonth =
    year === new Date().getFullYear() && month === new Date().getMonth();

  const saveConfig = async () => {
    setSaving(true);
    try {
      // Mescla com as comissões existentes (preserva empresas fora da lista atual)
      const merged = { ...commissions, ...draftCommissions };
      const mergedMode = { ...(settings?.commission_mode || {}), ...draftMode };
      await updateSettings({ commissions: merged, commission_mode: mergedMode });
      toast.success("Comissões salvas!");
      setConfigOpen(false);
    } catch {
      toast.error("Erro ao salvar as comissões.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-[calc(100dvh-2rem)] flex flex-col gap-6 overflow-y-auto custom-scrollbar">
      {/* Cabeçalho padrão */}
      <PageHeader
        icon={Wallet}
        className="mb-0 lg:mb-0"
        title="Comissões"
        subtitle="Quanto você ganha por mês"
        actions={
          <>
            <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl px-1 py-1">
              <button onClick={goPrevMonth} aria-label="Mês anterior" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-zinc-300" />
              </button>
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-zinc-200 min-w-[120px] text-center">
                {MONTHS[month]} {year}
              </span>
              <button
                onClick={goNextMonth}
                disabled={isCurrentMonth}
                aria-label="Próximo mês"
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4 text-slate-600 dark:text-zinc-300" />
              </button>
            </div>

            <button
              onClick={() => setConfigOpen(true)}
              className="px-4 py-2.5 bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 dark:hover:bg-zinc-700 transition-all flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4" />
              Configurar %
            </button>
          </>
        }
      />

      <div className="pb-6 flex flex-col gap-6">
        {/* Card de destaque: comissão total */}
        <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 md:p-8 shadow-xl shadow-emerald-500/20 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
          <div className="absolute -right-2 bottom-2 w-24 h-24 rounded-full bg-white/5" />
          <div className="relative">
            <div className="text-[11px] font-black uppercase tracking-widest text-emerald-100">
              Comissão a receber · {MONTHS[month]}
            </div>
            <div className="text-4xl md:text-5xl font-black text-white mt-2 tracking-tight">
              {isLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : BRL(totals.comissao)}
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <div className="text-xs font-bold text-emerald-50/90">
                Sobre {BRL(totals.faturamento)} faturados
              </div>
              {deltaPct !== null && (
                <div
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black",
                    deltaPct >= 0 ? "bg-white/20 text-white" : "bg-red-900/30 text-red-100"
                  )}
                >
                  {deltaPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(0)}% vs. mês anterior
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Aviso de empresas sem % configurado */}
        {totals.semConfig > 0 && (
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-3 text-left rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3"
          >
            <Percent className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="text-xs font-bold text-amber-800 dark:text-amber-300">
              {totals.semConfig} empresa(s) com faturamento mas sem % de comissão configurado.
              <span className="underline ml-1">Configurar agora</span>
            </div>
          </button>
        )}

        {/* Lista por empresa */}
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
            Detalhe por empresa
          </h2>
          <ExportCommissionsButton
            rows={rows}
            totals={totals}
            month={MONTHS[month]}
            year={year}
            userName={user?.email}
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-5 rounded-3xl border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <Skeleton className="w-10 h-10 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/5" />
                </div>
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        ) : rows.filter((r) => r.faturamento > 0).length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-zinc-800 p-10 text-center">
            <Building2 className="w-10 h-10 text-slate-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-500 dark:text-zinc-400">
              Nenhum pedido em {MONTHS[month]} de {year}.
            </p>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
              Lance pedidos para ver suas comissões aqui.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {rows
              .filter((r) => r.faturamento > 0)
              .map((r) => {
                const delta =
                  r.faturamentoPrev > 0
                    ? ((r.faturamento - r.faturamentoPrev) / r.faturamentoPrev) * 100
                    : null;
                return (
                  <div
                    key={r.key}
                    /* min-w-0: como item de grid, o card herda min-width:auto e
                       era dimensionado pelo min-content do nome da empresa (que
                       tem whitespace-nowrap por causa do truncate). No celular
                       isso empurrava o botão "Definir %" para fora da tela. */
                    className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 flex items-center gap-4 min-w-0"
                  >
                    <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xs font-black uppercase shrink-0 ring-1 ring-emerald-100 dark:ring-emerald-900/40">
                      {r.name.substring(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm text-slate-900 dark:text-zinc-100 truncate">
                        {r.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                          {BRL(r.faturamento)}
                        </span>
                        {delta !== null && (
                          <span
                            className={cn(
                              "text-[10px] font-black",
                              delta >= 0 ? "text-emerald-600" : "text-red-500"
                            )}
                          >
                            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {r.pct > 0 ? (
                        <>
                          <div className="text-base font-black text-emerald-600">
                            {BRL(r.comissao)}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                            {r.pct}% de comissão
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfigOpen(true)}
                          className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30"
                        >
                          Definir %
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Painel de configuração de % */}
      <AnimatePresence>
        {configOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfigOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[460px] max-h-[80vh] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden border border-slate-200 dark:border-zinc-800"
            >
              <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800">
                <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">
                  Percentual de comissão
                </h3>
                <p className="text-xs font-bold text-slate-400 dark:text-zinc-500 mt-0.5">
                  Quanto você ganha de cada empresa que representa
                </p>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
                {companies.length === 0 ? (
                  <div className="text-center py-8 text-sm font-bold text-slate-400 dark:text-zinc-500">
                    Nenhuma empresa representada cadastrada ainda.
                    <br />
                    Cadastre na aba Empresas.
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {companies.map((c) => (
                      <div key={c} className="flex flex-col gap-2 pb-3 border-b border-slate-50 dark:border-zinc-800 last:border-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 text-sm font-bold text-slate-700 dark:text-zinc-200 truncate">
                            {c}
                          </div>
                          <div className="relative w-28">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              inputMode="decimal"
                              value={draftCommissions[c] ?? 0}
                              onChange={(e) =>
                                setDraftCommissions((prev) => ({
                                  ...prev,
                                  [c]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                                }))
                              }
                              className="w-full pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm font-black text-right outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pl-0.5">
                          <button
                            type="button"
                            onClick={() => setDraftMode((prev) => ({ ...prev, [c]: 'fixed' }))}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors",
                              (draftMode[c] ?? 'fixed') === 'fixed'
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500"
                            )}
                          >
                            Fixo por empresa
                          </button>
                          <button
                            type="button"
                            onClick={() => setDraftMode((prev) => ({ ...prev, [c]: 'per_product' }))}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors",
                              draftMode[c] === 'per_product'
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500"
                            )}
                          >
                            Por produto
                          </button>
                          {draftMode[c] === 'per_product' && (
                            <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500">
                              % acima = padrão pra produto sem % próprio
                            </span>
                          )}
                        </div>
                        {draftMode[c] === 'per_product' && (
                          <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400">
                            Configure o % de cada produto na aba Produtos.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800 flex gap-3">
                <button
                  onClick={() => setConfigOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveConfig}
                  disabled={saving || companies.length === 0}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
