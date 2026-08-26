import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  PackageSearch, ChevronLeft, ChevronRight, Boxes, Building2, Layers,
  Search, X, ArrowUpDown, DollarSign, ShoppingBag, TrendingUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { offlineCache, CacheKeys } from "../lib/offlineCache";
import { PageHeader, EmptyState, Skeleton } from "../components/ui";
import { cn } from "../lib/utils";
import {
  aggregateProductRanking,
  monthlySeries,
  filterByPeriod,
  type OrderItemRow,
  type RankedProduct,
  type PeriodoTipo,
} from "../lib/productAnalytics";

const COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f97316", "#0ea5e9",
];

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

const numero = (v: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v || 0);

const PERIODOS: { tipo: PeriodoTipo; label: string }[] = [
  { tipo: "mes", label: "Mês" },
  { tipo: "trimestre", label: "Trimestre" },
  { tipo: "ano", label: "Ano" },
  { tipo: "tudo", label: "Tudo" },
];

function labelDoPeriodo(tipo: PeriodoTipo, refDate: Date): string {
  if (tipo === "tudo") return "Desde o início";
  if (tipo === "ano") return String(refDate.getFullYear());
  if (tipo === "trimestre") {
    const t = Math.floor(refDate.getMonth() / 3) + 1;
    return `${t}º trimestre de ${refDate.getFullYear()}`;
  }
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${meses[refDate.getMonth()]} de ${refDate.getFullYear()}`;
}

export default function ProdutosPage() {
  const { user } = useAuth();
  const { settings } = useSettings();

  const [periodo, setPeriodo] = useState<PeriodoTipo>("mes");
  const [refDate, setRefDate] = useState(() => new Date());
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [sortBy, setSortBy] = useState<"quantity" | "revenue">("quantity");
  const [produtoSelecionado, setProdutoSelecionado] = useState<RankedProduct | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["order_items", user?.id],
    queryFn: async (): Promise<OrderItemRow[]> => {
      if (!offlineCache.isOnline()) {
        return offlineCache.get<OrderItemRow[]>(CacheKeys.ORDER_ITEMS) || [];
      }
      const { data, error } = await supabase
        .from("order_items")
        .select("product_key, product_name, category, client_id, quantity, unit_value, total_value, order_date, order_id")
        .eq("user_id", user!.id)
        .order("order_date", { ascending: false });
      if (error) throw error;
      const linhas = (data || []) as OrderItemRow[];
      offlineCache.set(CacheKeys.ORDER_ITEMS, linhas);
      return linhas;
    },
    enabled: !!user,
    // O padrão do app é staleTime:Infinity (só sincroniza na mão) — bom pra
    // telas que o usuário mesmo edita, ruim aqui: pedido pelo link do
    // funcionário chega por uma sessão completamente separada (o celular
    // dele), então nada dispara o invalidateQueries local pra avisar esta
    // aba. Sem isso, quem abria Produtos uma vez ficava preso naquele
    // instantâneo pra sempre, mesmo lançando pedidos novos depois — sempre
    // busca de novo ao abrir a tela, pra nunca mostrar dado velho aqui.
    refetchOnMount: "always",
  });

  const { data: clientNames = {} } = useQuery({
    queryKey: ["clients_names", user?.id],
    queryFn: async (): Promise<Record<string, string>> => {
      if (!offlineCache.isOnline()) return {};
      const { data } = await supabase.from("clients").select("id, name").eq("user_id", user!.id);
      const mapa: Record<string, string> = {};
      (data || []).forEach((c: any) => { mapa[c.id] = c.name; });
      return mapa;
    },
    enabled: !!user,
    refetchOnMount: "always",
  });

  const irParaAnterior = () => {
    setRefDate((d) => {
      if (periodo === "ano") return new Date(d.getFullYear() - 1, d.getMonth(), 1);
      if (periodo === "trimestre") return new Date(d.getFullYear(), d.getMonth() - 3, 1);
      return new Date(d.getFullYear(), d.getMonth() - 1, 1);
    });
  };
  const irParaProximo = () => {
    setRefDate((d) => {
      if (periodo === "ano") return new Date(d.getFullYear() + 1, d.getMonth(), 1);
      if (periodo === "trimestre") return new Date(d.getFullYear(), d.getMonth() + 3, 1);
      return new Date(d.getFullYear(), d.getMonth() + 1, 1);
    });
  };

  const categoriasDisponiveis = useMemo(() => {
    const doCadastro = (settings?.categories || []).filter(Boolean);
    const dosItens = Array.from(new Set(rows.map((r) => r.category))).filter(Boolean);
    return Array.from(new Set([...doCadastro, ...dosItens])).sort((a, b) => a.localeCompare(b));
  }, [settings?.categories, rows]);

  const rowsNoPeriodo = useMemo(() => filterByPeriod(rows, periodo, refDate), [rows, periodo, refDate]);
  const rowsFiltrados = useMemo(
    () => (categoriaFiltro ? rowsNoPeriodo.filter((r) => r.category === categoriaFiltro) : rowsNoPeriodo),
    [rowsNoPeriodo, categoriaFiltro]
  );

  const ranking = useMemo(() => aggregateProductRanking(rowsFiltrados), [rowsFiltrados]);

  const rankingExibido = useMemo(() => {
    let lista = ranking;
    if (busca.trim()) {
      const b = busca.trim().toLowerCase();
      lista = lista.filter((r) => r.productName.toLowerCase().includes(b) || r.category.toLowerCase().includes(b));
    }
    return [...lista].sort((a, b) =>
      sortBy === "quantity" ? b.totalQuantity - a.totalQuantity : b.totalRevenue - a.totalRevenue
    );
  }, [ranking, busca, sortBy]);

  const kpis = useMemo(() => {
    const totalUnidades = ranking.reduce((s, r) => s + r.totalQuantity, 0);
    const totalReceita = ranking.reduce((s, r) => s + r.totalRevenue, 0);
    const representadasDistintas = new Set(ranking.map((r) => r.category)).size;
    return { totalUnidades, totalReceita, produtosDistintos: ranking.length, representadasDistintas };
  }, [ranking]);

  const top10ParaGrafico = useMemo(() => {
    const base = [...ranking].sort((a, b) => b.totalQuantity - a.totalQuantity);
    return base.slice(0, 10).map((r) => ({
      nome: r.productName.length > 22 ? r.productName.slice(0, 20) + "…" : r.productName,
      nomeCompleto: r.productName,
      categoria: r.category,
      unidades: r.totalQuantity,
    })).reverse(); // reverse: barra horizontal fica com o maior no topo
  }, [ranking]);

  const serieMensal = useMemo(() => {
    const base = categoriaFiltro ? rows.filter((r) => r.category === categoriaFiltro) : rows;
    return monthlySeries(base, periodo === "ano" ? 12 : 6, refDate);
  }, [rows, categoriaFiltro, periodo, refDate]);

  const detalheProduto = useMemo(() => {
    if (!produtoSelecionado) return null;
    const doProduto = rows.filter(
      (r) => r.category === produtoSelecionado.category && r.product_key === produtoSelecionado.productKey
    );
    const serie = monthlySeries(doProduto, 6, refDate);

    const porCliente = new Map<string, number>();
    doProduto.forEach((r) => {
      const chave = r.client_id || "sem-cliente";
      porCliente.set(chave, (porCliente.get(chave) || 0) + r.quantity);
    });
    const topClientes = Array.from(porCliente.entries())
      .map(([clientId, quantidade]) => ({
        clientId,
        nome: clientId === "sem-cliente" ? "Sem cliente identificado" : (clientNames[clientId] || "Cliente"),
        quantidade,
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 6);

    return { serie, topClientes };
  }, [produtoSelecionado, rows, refDate, clientNames]);

  const semNadaAindaNoTotal = !isLoading && rows.length === 0;
  const semResultadoNoFiltro = !isLoading && rows.length > 0 && ranking.length === 0;

  return (
    <div>
      <PageHeader
        icon={PackageSearch}
        title="Produtos"
        subtitle="Unidades vendidas por produto, separadas por representada"
        actions={
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-1">
            {PERIODOS.map((p) => (
              <button
                key={p.tipo}
                onClick={() => setPeriodo(p.tipo)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all",
                  periodo === p.tipo
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                    : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {periodo !== "tudo" && (
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={irParaAnterior}
            className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-500 hover:text-emerald-600 transition-all"
            aria-label="Período anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-black text-slate-700 dark:text-zinc-200 min-w-[180px] text-center">
            {labelDoPeriodo(periodo, refDate)}
          </span>
          <button
            onClick={irParaProximo}
            className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-500 hover:text-emerald-600 transition-all"
            aria-label="Próximo período"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-3xl" />)}
          </div>
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      ) : semNadaAindaNoTotal ? (
        <EmptyState
          icon={PackageSearch}
          title="Nenhum produto registrado ainda"
          description="Assim que um pedido com produtos identificáveis for lançado (pelo painel ou pelo link de enviar pedido), eles aparecem aqui — quantas peças de cada, separado por representada."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard icon={Boxes} label="Unidades vendidas" value={numero(kpis.totalUnidades)} accent="emerald" />
            <KpiCard icon={DollarSign} label="Receita em produtos" value={brl(kpis.totalReceita)} accent="sky" />
            <KpiCard icon={ShoppingBag} label="Produtos distintos" value={String(kpis.produtosDistintos)} accent="violet" />
            <KpiCard icon={Building2} label="Representadas" value={String(kpis.representadasDistintas)} accent="amber" />
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setCategoriaFiltro("")}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-black transition-all border",
                  !categoriaFiltro
                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent"
                    : "bg-white dark:bg-zinc-900 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-800 hover:border-slate-300"
                )}
              >
                Todas as representadas
              </button>
              {categoriasDisponiveis.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoriaFiltro(cat)}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-black transition-all border",
                    categoriaFiltro === cat
                      ? "bg-emerald-600 text-white border-transparent shadow-md shadow-emerald-600/25"
                      : "bg-white dark:bg-zinc-900 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-800 hover:border-slate-300"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar produto..."
                className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all dark:text-white"
              />
              {busca && (
                <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {semResultadoNoFiltro ? (
            <EmptyState
              icon={Search}
              title="Nada por aqui"
              description="Nenhum produto vendido nesse período/representada. Tente 'Tudo' ou outra representada."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> Top 10 — unidades vendidas
                  </h3>
                  <div style={{ height: Math.max(220, top10ParaGrafico.length * 34) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={top10ParaGrafico} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.08} horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis dataKey="nome" type="category" width={140} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          cursor={{ fill: "rgba(16, 185, 129, 0.05)" }}
                          contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 12 }}
                          formatter={(value: number, _n: any, ctx: any) => [`${numero(value)} un.`, ctx?.payload?.categoria || ""]}
                          labelFormatter={(_l: any, payload: any) => payload?.[0]?.payload?.nomeCompleto || ""}
                        />
                        <Bar dataKey="unidades" radius={[0, 6, 6, 0]}>
                          {top10ParaGrafico.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    Evolução mensal {categoriaFiltro ? `— ${categoriaFiltro}` : "— todas as representadas"}
                  </h3>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={serieMensal} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.08} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip
                          cursor={{ fill: "rgba(16, 185, 129, 0.05)" }}
                          contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 12 }}
                          formatter={(value: number) => [`${numero(value)} un.`, "Unidades"]}
                        />
                        <Bar dataKey="quantity" fill="#10b981" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Ranking de produtos ({rankingExibido.length})
                  </h3>
                  <button
                    onClick={() => setSortBy((s) => (s === "quantity" ? "revenue" : "quantity"))}
                    className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 dark:text-zinc-400 hover:text-emerald-600 transition-all"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    Ordenar por {sortBy === "quantity" ? "unidades" : "receita"}
                  </button>
                </div>

                <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800">
                  {rankingExibido.map((r, idx) => (
                    <button
                      key={r.groupKey}
                      onClick={() => setProdutoSelecionado(r)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-all text-left"
                    >
                      <div
                        className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-black text-white"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      >
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 dark:text-zinc-100 truncate">{r.productName}</p>
                        <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 truncate">
                          {r.category} · {r.orderCount} pedido{r.orderCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-slate-900 dark:text-white">{numero(r.totalQuantity)} un.</p>
                        <p className="text-[11px] font-bold text-emerald-600">{brl(r.totalRevenue)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {produtoSelecionado && detalheProduto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setProdutoSelecionado(null)} />
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="relative w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-zinc-800 p-6 max-h-[85vh] overflow-y-auto"
            >
              <button
                onClick={() => setProdutoSelecionado(null)}
                className="absolute top-5 right-5 p-2 rounded-xl bg-slate-50 dark:bg-zinc-800 text-slate-400 hover:text-red-500 transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 mb-1">{produtoSelecionado.category}</p>
              <h2 className="text-xl font-black text-slate-900 dark:text-white pr-10 mb-4">{produtoSelecionado.productName}</h2>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-slate-50 dark:bg-zinc-950/50 rounded-2xl p-3 text-center">
                  <p className="text-lg font-black text-slate-900 dark:text-white">{numero(produtoSelecionado.totalQuantity)}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Unidades</p>
                </div>
                <div className="bg-slate-50 dark:bg-zinc-950/50 rounded-2xl p-3 text-center">
                  <p className="text-lg font-black text-slate-900 dark:text-white">{brl(produtoSelecionado.totalRevenue)}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Receita</p>
                </div>
                <div className="bg-slate-50 dark:bg-zinc-950/50 rounded-2xl p-3 text-center">
                  <p className="text-lg font-black text-slate-900 dark:text-white">{brl(produtoSelecionado.avgUnitValue)}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Ticket médio</p>
                </div>
              </div>

              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Últimos 6 meses</h3>
              <div style={{ height: 160 }} className="mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={detalheProduto.serie} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 12 }}
                      formatter={(value: number) => [`${numero(value)} un.`, "Unidades"]}
                    />
                    <Bar dataKey="quantity" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Principais clientes</h3>
              <div className="space-y-2">
                {detalheProduto.topClientes.map((c) => (
                  <div key={c.clientId} className="flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-700 dark:text-zinc-300 truncate">{c.nome}</span>
                    <span className="font-black text-slate-900 dark:text-white shrink-0 ml-3">{numero(c.quantidade)} un.</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, accent,
}: { icon: React.ElementType; label: string; value: string; accent: "emerald" | "sky" | "violet" | "amber" }) {
  const cores: Record<string, string> = {
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600",
    sky: "bg-sky-50 dark:bg-sky-500/10 text-sky-600",
    violet: "bg-violet-50 dark:bg-violet-500/10 text-violet-600",
    amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600",
  };
  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-4 lg:p-5">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", cores[accent])}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <p className="text-lg lg:text-xl font-black text-slate-900 dark:text-white truncate">{value}</p>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  );
}
