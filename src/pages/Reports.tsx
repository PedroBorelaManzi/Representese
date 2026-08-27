import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileSpreadsheet,
  Download,
  FileText,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingBag,
  Wallet,
  Users,
  Trophy,
  Building2,
  HeartPulse,
  CheckCircle2,
  AlertTriangle,
  Flame,
  XCircle,
  RefreshCw,
  CalendarDays,
  UserPlus,
  Repeat,
  Target,
  PhoneCall,
  MapPin,
  CalendarRange,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { downloadExcelReport, downloadCSVReport } from '../lib/reportGenerator';
import { CommissionValue } from '../components/CommissionValue';
import {
  fetchReportAnalytics,
  TrendPoint,
  WeekdayPoint,
  NewVsReturning,
  RetentionStats,
  FollowupStats,
  CityBreakdown,
  TopClient,
  CompanySlice,
  PortfolioHealthClient,
} from '../lib/reportAnalytics';
import { getOutcomeLabel } from '../lib/followupService';
import { PageHeader, Skeleton } from '../components/ui';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const BRLfull = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const shortBRL = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `R$ ${Math.round(v)}`);

interface MonthOption {
  year: number;
  month: number;
  label: string;
  fullLabel: string;
}

function buildMonthOptions(): MonthOption[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: `${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${String(d.getFullYear()).slice(2)}`,
      fullLabel: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    };
  });
}

/** Variação vs. mês anterior. `prev === 0` não vira porcentagem infinita. */
function DeltaChip({ current, prev, invert = false }: { current: number; prev: number; invert?: boolean }) {
  if (prev === 0 && current === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
        <Minus className="w-3 h-3" /> estável
      </span>
    );
  }
  if (prev === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
        <TrendingUp className="w-3 h-3" /> novo
      </span>
    );
  }
  const pct = ((current - prev) / prev) * 100;
  const up = pct >= 0;
  const good = invert ? !up : up;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider tabular-nums',
        Math.abs(pct) < 0.5
          ? 'text-slate-400 dark:text-zinc-500'
          : good
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-500 dark:text-red-400'
      )}
      title="Comparado ao mês anterior"
    >
      {Math.abs(pct) < 0.5 ? <Minus className="w-3 h-3" /> : up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct) < 0.5 ? 'estável' : `${up ? '+' : ''}${pct.toFixed(0)}%`}
    </span>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  current,
  prev,
  hideable,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  current: number;
  prev: number;
  /** Comissão em R$ — some no `title` também (senão vazaria no hover mesmo com o blur visual). */
  hideable?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{label}</span>
        <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
      </div>
      <p className="text-2xl font-black text-slate-900 dark:text-zinc-50 tabular-nums leading-none truncate" title={hideable ? undefined : value}>
        {hideable ? <CommissionValue>{value}</CommissionValue> : value}
      </p>
      <DeltaChip current={current} prev={prev} />
    </div>
  );
}

/** Barra de 12 meses, série única (receita). Mês selecionado ganha destaque e
 *  rótulo direto; o resto responde no hover. */
function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(...trend.map((t) => t.revenue), 1);
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div className="flex gap-3 h-56">
      <div className="flex flex-col justify-between pb-7 pr-2 border-r border-slate-100 dark:border-zinc-800/60 text-right shrink-0 w-14">
        {ticks.map((t) => (
          <span key={t} className="text-[9px] font-black text-slate-400 dark:text-zinc-500 tabular-nums">
            {shortBRL(max * t)}
          </span>
        ))}
      </div>
      <div className="flex-1 flex items-stretch gap-1.5 sm:gap-2 min-w-0">
        {trend.map((point, i) => {
          const h = Math.max((point.revenue / max) * 100, point.revenue > 0 ? 2 : 0);
          const active = hovered === point.key || (hovered === null && point.isSelected);
          // O balão é bem mais largo que a coluna da barra. Centralizado, ele
          // vazava da tela nas barras das pontas — e a última é justamente a do
          // mês selecionado, que aparece por padrão. Nas pontas, encosta na
          // borda da barra em vez de centralizar.
          const tooltipAnchor =
            i === 0 ? 'left-0' : i === trend.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2';
          return (
            <div
              key={point.key}
              className="flex-1 flex flex-col items-center justify-end gap-1.5 relative min-w-0 group"
              onMouseEnter={() => setHovered(point.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <AnimatePresence>
                {active && point.revenue > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className={cn('absolute -top-1 z-10 whitespace-nowrap pointer-events-none', tooltipAnchor)}
                  >
                    <div className="bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 rounded-xl shadow-xl flex flex-col items-center">
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-60">{point.fullLabel}</span>
                      <span className="text-[11px] font-black tabular-nums">{BRLfull(point.revenue)}</span>
                      <span className="text-[8px] font-bold opacity-60">{point.orders} pedido{point.orders === 1 ? '' : 's'}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="w-full flex-1 flex items-end pb-0">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={cn(
                    'w-full rounded-t-[4px] transition-colors',
                    point.isSelected
                      ? 'bg-emerald-600 dark:bg-emerald-500'
                      : active
                        ? 'bg-emerald-500'
                        : 'bg-emerald-500/45 dark:bg-emerald-500/35'
                  )}
                />
              </div>
              <span
                className={cn(
                  'text-[8px] sm:text-[9px] font-black uppercase tracking-tight h-5 shrink-0',
                  point.isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-zinc-500'
                )}
              >
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const healthRows = [
  { key: 'emDia' as const, label: 'Em dia', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  { key: 'alerta' as const, label: 'Alerta', icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  { key: 'critico' as const, label: 'Crítico', icon: Flame, color: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500' },
  { key: 'inativo' as const, label: 'Inativo', icon: XCircle, color: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' },
];

function CardShell({
  icon: Icon,
  title,
  subtitle,
  children,
  onExpand,
  expandLabel = 'Ver todos',
}: {
  icon: typeof Wallet;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Se informado, o card vira clicável e ganha um rodapé "ver todos". */
  onExpand?: () => void;
  expandLabel?: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 p-5 sm:p-6">
      <div
        className={cn('flex items-center gap-2 mb-5', onExpand && 'cursor-pointer group')}
        onClick={onExpand}
        role={onExpand ? 'button' : undefined}
      >
        <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <div className="flex-1 min-w-0">
          <h3 className="text-[11px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-[0.18em] leading-none group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            {title}
          </h3>
          {subtitle && <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium mt-1">{subtitle}</p>}
        </div>
        {onExpand && <ChevronRight className="w-4 h-4 text-slate-300 dark:text-zinc-600 group-hover:text-emerald-500 transition-colors shrink-0" />}
      </div>
      {children}
      {onExpand && (
        <button
          onClick={onExpand}
          className="w-full mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex items-center justify-center gap-1.5"
        >
          {expandLabel}
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/** Faixa compacta com os 3 acumulados do ano — contexto rápido sem precisar trocar de mês. */
function YtdBanner({ revenue, commission, orders, year }: { revenue: number; commission: number; orders: number; year: number }) {
  const items = [
    { label: 'Receita no ano', value: BRL(revenue), isCommission: false },
    { label: 'Comissão no ano', value: BRL(commission), isCommission: true },
    { label: 'Pedidos no ano', value: String(orders), isCommission: false },
  ];
  return (
    <div className="bg-slate-900 dark:bg-zinc-950 rounded-3xl border border-slate-800 dark:border-zinc-800 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8">
      <div className="flex items-center gap-2 shrink-0">
        <CalendarRange className="w-4 h-4 text-emerald-400" />
        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.18em]">Acumulado {year}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        {items.map((it) => (
          <div key={it.label} className="flex items-baseline gap-2">
            <span className="text-sm sm:text-base font-black text-white tabular-nums">
              {it.isCommission ? <CommissionValue>{it.value}</CommissionValue> : it.value}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barras simples por dia da semana — ajuda a identificar o melhor dia para focar visitas/ligações. */
function WeekdayChart({ weekday }: { weekday: WeekdayPoint[] }) {
  const max = Math.max(...weekday.map((d) => d.revenue), 1);
  const bestIdx = weekday.reduce((best, d, i) => (d.revenue > weekday[best].revenue ? i : best), 0);
  const hasData = weekday.some((d) => d.revenue > 0);
  return (
    <div>
      <div className="flex items-end gap-2 sm:gap-3 h-40">
        {weekday.map((d, i) => {
          const h = Math.max((d.revenue / max) * 100, d.revenue > 0 ? 3 : 0);
          const isBest = hasData && i === bestIdx;
          return (
            <div key={d.key} className="flex-1 flex flex-col items-center justify-end gap-2 h-full min-w-0">
              <div className="w-full flex-1 flex items-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={cn('w-full rounded-t-[4px]', isBest ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-emerald-500/40 dark:bg-emerald-500/30')}
                  title={`${d.label}: ${BRLfull(d.revenue)} · ${d.orders} pedido${d.orders === 1 ? '' : 's'}`}
                />
              </div>
              <span className={cn('text-[9px] font-black uppercase tracking-tight', isBest ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-zinc-500')}>
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
      {hasData && (
        <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mt-4 text-center">
          Melhor dia: <span className="text-emerald-600 dark:text-emerald-400">{weekday[bestIdx].label}</span> — {BRL(weekday[bestIdx].revenue)}
        </p>
      )}
    </div>
  );
}

/** Split de receita entre clientes novos (primeira compra no mês) e recorrentes. */
function NewVsReturningCard({ data }: { data: NewVsReturning }) {
  const total = data.newRevenue + data.returningRevenue;
  const newPct = total > 0 ? (data.newRevenue / total) * 100 : 0;
  if (total === 0) {
    return <p className="text-sm text-slate-400 dark:text-zinc-500 font-medium py-8 text-center">Sem pedidos no período.</p>;
  }
  return (
    <div className="space-y-5">
      <div className="h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-zinc-800 flex">
        <motion.div initial={{ width: 0 }} animate={{ width: `${newPct}%` }} transition={{ duration: 0.5 }} className="h-full bg-emerald-500" />
        <motion.div initial={{ width: 0 }} animate={{ width: `${100 - newPct}%` }} transition={{ duration: 0.5 }} className="h-full bg-slate-300 dark:bg-zinc-700" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
            <UserPlus className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Clientes novos</span>
          </div>
          <p className="text-lg font-black text-slate-900 dark:text-zinc-100 tabular-nums">{BRL(data.newRevenue)}</p>
          <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500">{data.newClientsCount} cliente{data.newClientsCount === 1 ? '' : 's'}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400 mb-1">
            <Repeat className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Recorrentes</span>
          </div>
          <p className="text-lg font-black text-slate-900 dark:text-zinc-100 tabular-nums">{BRL(data.returningRevenue)}</p>
          <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500">{data.returningClientsCount} cliente{data.returningClientsCount === 1 ? '' : 's'}</p>
        </div>
      </div>
    </div>
  );
}

/** % de clientes do mês anterior que voltaram a comprar neste mês. */
function RetentionCard({ retention, prevLabel }: { retention: RetentionStats; prevLabel: string }) {
  if (retention.activeLastMonth === 0) {
    return <p className="text-sm text-slate-400 dark:text-zinc-500 font-medium py-8 text-center">Nenhum pedido em {prevLabel} para comparar.</p>;
  }
  const pct = Math.round(retention.retentionRate * 100);
  const good = retention.retentionRate >= 0.5;
  return (
    <div className="flex items-center gap-6">
      <div className={cn('shrink-0 w-20 h-20 rounded-full border-4 flex items-center justify-center', good ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-amber-500 text-amber-600 dark:text-amber-400')}>
        <span className="text-xl font-black tabular-nums">{pct}%</span>
      </div>
      <div>
        <p className="text-sm font-bold text-slate-700 dark:text-zinc-300 leading-relaxed">
          <span className="font-black text-slate-900 dark:text-zinc-100">{retention.retained}</span> de{' '}
          <span className="font-black text-slate-900 dark:text-zinc-100">{retention.activeLastMonth}</span> clientes que compraram em {prevLabel} voltaram a comprar este mês.
        </p>
      </div>
    </div>
  );
}

/** Funil de eficácia dos follow-ups registrados no CRM durante o período. */
function FollowupCard({ followups }: { followups: FollowupStats }) {
  if (followups.total === 0) {
    return <p className="text-sm text-slate-400 dark:text-zinc-500 font-medium py-8 text-center">Nenhum follow-up registrado no período.</p>;
  }
  const order: Array<keyof FollowupStats['byOutcome']> = ['positive', 'pending', 'negative', 'no_response'];
  const barColor: Record<keyof FollowupStats['byOutcome'], string> = {
    positive: 'bg-emerald-500',
    pending: 'bg-amber-500',
    negative: 'bg-red-500',
    no_response: 'bg-slate-400 dark:bg-zinc-600',
  };
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-900 dark:text-zinc-100 tabular-nums">{Math.round(followups.conversionRate * 100)}%</span>
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
          de conversão positiva em {followups.total} follow-up{followups.total === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-2.5">
        {order.map((key) => {
          const count = followups.byOutcome[key] || 0;
          const pct = followups.total > 0 ? (count / followups.total) * 100 : 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-300">{getOutcomeLabel(key)}</span>
                <span className="text-[11px] font-black text-slate-900 dark:text-zinc-100 tabular-nums">{count}</span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} className={cn('h-full rounded-full', barColor[key])} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Reaproveita o mesmo padrão de "lista com barra" usado em Receita por empresa. */
function CityBreakdownCard({ cities }: { cities: CityBreakdown[] }) {
  if (cities.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-zinc-500 font-medium py-8 text-center">Nenhum pedido lançado no período.</p>;
  }
  return (
    <div className="space-y-4">
      {cities.map((c) => (
        <div key={c.city}>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="flex items-center gap-1.5 min-w-0 text-sm font-bold text-slate-800 dark:text-zinc-200">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{c.city}</span>
            </span>
            <div className="flex items-baseline gap-3 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 whitespace-nowrap">{c.clients} cliente{c.clients === 1 ? '' : 's'}</span>
              <span className="text-sm font-black text-slate-900 dark:text-zinc-100 tabular-nums">{BRL(c.revenue)}</span>
            </div>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${c.share * 100}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} className="h-full bg-emerald-500 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Cabeçalho padrão das telas de detalhe (lista completa) com botão de voltar. */
function DetailHeader({ icon: Icon, title, subtitle, onBack }: { icon: typeof Wallet; title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        aria-label="Voltar"
        className="p-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shrink-0"
      >
        <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-zinc-300" />
      </button>
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-sm font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight truncate">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

/** Lista completa de clientes do mês por receita (a versão "ver todos" do card Top Clientes). */
function TopClientsDetail({ clients }: { clients: TopClient[] }) {
  if (clients.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-zinc-500 font-medium py-8 text-center">Nenhum pedido lançado no período.</p>;
  }
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 p-3 sm:p-4">
      <div className="space-y-1">
        {clients.map((client, idx) => (
          <Link
            key={client.id}
            to={`/dashboard/clientes/${client.id}`}
            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors group"
          >
            <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-black text-slate-500 dark:text-zinc-400 shrink-0 tabular-nums">
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-800 dark:text-zinc-200 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {client.name}
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-zinc-100 tabular-nums shrink-0">{BRL(client.revenue)}</span>
              </div>
              <div className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 mt-0.5">
                {client.orders} pedido{client.orders === 1 ? '' : 's'} · {(client.share * 100).toFixed(1)}% do mês
              </div>
              <div className="h-1 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-1.5">
                <div style={{ width: `${client.share * 100}%` }} className="h-full bg-emerald-500 rounded-full" />
              </div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-700 group-hover:text-emerald-500 transition-colors shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Saúde da carteira detalhada: um cliente pode ser aberto direto da lista. */
function HealthDetail({ clients }: { clients: PortfolioHealthClient[] }) {
  return (
    <div className="space-y-4">
      {healthRows.map((row) => {
        const group = clients.filter((c) => c.bucket === row.key);
        return (
          <div key={row.key} className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 p-5 sm:p-6">
            <div className={cn('flex items-center gap-2 mb-4', row.color)}>
              <row.icon className="w-4 h-4" />
              <h3 className="text-[11px] font-black uppercase tracking-[0.18em]">{row.label}</h3>
              <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 ml-auto tabular-nums">
                {group.length} cliente{group.length === 1 ? '' : 's'}
              </span>
            </div>
            {group.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium py-2">Nenhum cliente neste grupo.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {group.map((c) => (
                  <Link
                    key={c.key}
                    to={`/dashboard/clientes/${c.clientId}`}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 transition-colors group"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {c.name}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{c.city}</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-700 group-hover:text-emerald-500 transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Lista completa de empresas representadas (a versão "ver todos" do card Receita por empresa). */
function ByCompanyDetail({ companies }: { companies: CompanySlice[] }) {
  if (companies.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-zinc-500 font-medium py-8 text-center">Nenhum pedido lançado no período.</p>;
  }
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 p-5 sm:p-6">
      <div className="space-y-4">
        {companies.map((company) => (
          <div key={company.name}>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-sm font-bold text-slate-800 dark:text-zinc-200 truncate uppercase tracking-tight">{company.name}</span>
              <div className="flex items-baseline gap-3 shrink-0">
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 tabular-nums">
                  {company.commissionPct > 0 ? (
                    <>{company.commissionPct}% → <CommissionValue>{BRL(company.commissionValue)}</CommissionValue></>
                  ) : 'comissão não configurada'}
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-zinc-100 tabular-nums">{BRL(company.revenue)}</span>
              </div>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div style={{ width: `${company.share * 100}%` }} className="h-full bg-emerald-500 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-20 rounded-3xl" />
      <Skeleton className="h-72 rounded-3xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const monthOptions = useMemo(buildMonthOptions, []);
  const [selected, setSelected] = useState<MonthOption>(monthOptions[0]);
  const [exporting, setExporting] = useState<'excel' | 'csv' | null>(null);
  const [detailView, setDetailView] = useState<'topClients' | 'health' | 'byCompany' | 'byCity' | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    // 'v2': dados persistidos em IndexedDB de antes da expansão do relatório
    // (ytd, weekday, newVsReturning, ...) não tinham esses campos — reidratar
    // esse formato velho quebrava a tela com "Cannot read properties of
    // undefined". Versionar a key invalida o cache antigo em vez de servi-lo.
    queryKey: ['reportAnalytics', 'v2', user?.id, selected.year, selected.month],
    queryFn: () =>
      fetchReportAnalytics(user!.id, selected.year, selected.month, settings.commissions || {}, {
        alertaDays: settings.alerta_days || 30,
        criticoDays: settings.critico_days || 45,
        inativoDays: settings.inativo_days || 90,
      }),
    enabled: !!user && !settingsLoading,
    staleTime: 5 * 60 * 1000,
  });

  const handleExport = async (format: 'excel' | 'csv') => {
    if (!user || exporting) return;
    setExporting(format);
    try {
      if (format === 'excel') await downloadExcelReport(user.id, selected.year, selected.month, settings.commissions || {}, data);
      else await downloadCSVReport(user.id, selected.year, selected.month, settings.commissions || {}, data);
      toast.success(`Relatório de ${selected.fullLabel} gerado com sucesso!`);
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error('Erro ao gerar relatório. Tente novamente.');
    } finally {
      setExporting(null);
    }
  };

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileSpreadsheet}
        title="Relatórios"
        subtitle="Receita, comissões e saúde da carteira — na tela e no Excel"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('excel')}
              disabled={!!exporting}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-100 dark:shadow-none disabled:opacity-60 active:scale-95"
            >
              {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Excel
            </button>
            <button
              onClick={() => handleExport('csv')}
              disabled={!!exporting}
              className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all hover:border-emerald-500/40 disabled:opacity-60 active:scale-95"
            >
              {exporting === 'csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              CSV
            </button>
          </div>
        }
      />

      {/* Seletor de mês */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {monthOptions.map((m) => {
          const isActive = m.year === selected.year && m.month === selected.month;
          return (
            <button
              key={`${m.year}-${m.month}`}
              onClick={() => { setSelected(m); setDetailView(null); }}
              className={cn(
                'shrink-0 px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all',
                isActive
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                  : 'bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:border-emerald-500/40 hover:text-slate-800 dark:hover:text-zinc-200'
              )}
              title={m.fullLabel}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {isLoading || settingsLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 p-12 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-3xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
            <XCircle className="w-7 h-7 text-red-500" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Não foi possível carregar os dados</h3>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Verifique sua conexão e tente novamente.</p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95"
          >
            <RefreshCw className="w-4 h-4" /> Tentar novamente
          </button>
        </div>
      ) : data && kpis && detailView ? (
        <motion.div key={detailView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {detailView === 'topClients' && (
            <>
              <DetailHeader icon={Trophy} title="Todos os clientes do mês" subtitle={`Ordenados por receita em ${selected.fullLabel}`} onBack={() => setDetailView(null)} />
              <TopClientsDetail clients={data.topClients} />
            </>
          )}
          {detailView === 'health' && (
            <>
              <DetailHeader icon={HeartPulse} title="Saúde da carteira" subtitle={`${data.health.total} cliente${data.health.total === 1 ? '' : 's'} · régua de ${settings.alerta_days || 30}/${settings.critico_days || 45}/${settings.inativo_days || 90} dias`} onBack={() => setDetailView(null)} />
              <HealthDetail clients={data.health.clients} />
            </>
          )}
          {detailView === 'byCompany' && (
            <>
              <DetailHeader icon={Building2} title="Receita por empresa" subtitle={`Todas as representadas em ${selected.fullLabel}`} onBack={() => setDetailView(null)} />
              <ByCompanyDetail companies={data.byCompany} />
            </>
          )}
          {detailView === 'byCity' && (
            <>
              <DetailHeader icon={MapPin} title="Receita por cidade" subtitle={`Todas as cidades em ${selected.fullLabel}`} onBack={() => setDetailView(null)} />
              <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 p-5 sm:p-6">
                <CityBreakdownCard cities={data.topCities} />
              </div>
            </>
          )}
        </motion.div>
      ) : data && kpis ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Acumulado do ano */}
          <YtdBanner revenue={data.ytd.revenue} commission={data.ytd.commission} orders={data.ytd.orders} year={selected.year} />

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <KpiTile icon={Wallet} label="Receita" value={BRL(kpis.revenue)} current={kpis.revenue} prev={kpis.revenuePrev} />
            <KpiTile icon={ShoppingBag} label="Pedidos" value={String(kpis.orders)} current={kpis.orders} prev={kpis.ordersPrev} />
            <KpiTile icon={TrendingUp} label="Ticket Médio" value={BRL(kpis.avgTicket)} current={kpis.avgTicket} prev={kpis.avgTicketPrev} />
            <KpiTile icon={Trophy} label="Comissão Estimada" value={BRL(kpis.commission)} current={kpis.commission} prev={kpis.commissionPrev} hideable />
            <KpiTile icon={Users} label="Clientes Novos" value={String(kpis.newClients)} current={kpis.newClients} prev={kpis.newClientsPrev} />
          </div>

          {/* Tendência 12 meses */}
          <CardShell icon={TrendingUp} title="Receita — últimos 12 meses" subtitle={`Terminando em ${selected.fullLabel}`}>
            <TrendChart trend={data.trend} />
          </CardShell>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Vendas por dia da semana */}
            <CardShell icon={CalendarDays} title="Vendas por dia da semana" subtitle={`Receita em ${selected.fullLabel}`}>
              <WeekdayChart weekday={data.weekday} />
            </CardShell>

            {/* Novos vs. recorrentes */}
            <CardShell icon={UserPlus} title="Novos vs. recorrentes" subtitle="De onde veio a receita do mês">
              <NewVsReturningCard data={data.newVsReturning} />
            </CardShell>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top clientes */}
            <CardShell
              icon={Trophy}
              title="Top clientes do mês"
              subtitle="Participação na receita do período"
              onExpand={data.topClients.length > 5 ? () => setDetailView('topClients') : undefined}
            >
              {data.topClients.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-zinc-500 font-medium py-8 text-center">
                  Nenhum pedido lançado em {selected.fullLabel}.
                </p>
              ) : (
                <div className="space-y-4">
                  {data.topClients.slice(0, 5).map((client, idx) => (
                    <div key={client.id}>
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-black text-slate-500 dark:text-zinc-400 shrink-0 tabular-nums">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-bold text-slate-800 dark:text-zinc-200 truncate">{client.name}</span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 shrink-0">
                            {client.orders} ped.
                          </span>
                        </div>
                        <span className="text-sm font-black text-slate-900 dark:text-zinc-100 tabular-nums shrink-0">{BRL(client.revenue)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${client.share * 100}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="h-full bg-emerald-500 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardShell>

            {/* Saúde da carteira */}
            <CardShell
              icon={HeartPulse}
              title="Saúde da carteira"
              subtitle={`Régua de inatividade: ${settings.alerta_days || 30} / ${settings.critico_days || 45} / ${settings.inativo_days || 90} dias sem comprar`}
              onExpand={data.health.total > 0 ? () => setDetailView('health') : undefined}
              expandLabel="Ver clientes por status"
            >
              <div className="space-y-4">
                {healthRows.map((row) => {
                  const count = data.health[row.key];
                  const pct = data.health.total > 0 ? (count / data.health.total) * 100 : 0;
                  return (
                    <div key={row.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={cn('flex items-center gap-2 text-sm font-bold', row.color)}>
                          <row.icon className="w-4 h-4" /> {row.label}
                        </span>
                        <span className="text-sm font-black text-slate-900 dark:text-zinc-100 tabular-nums">
                          {count}
                          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 ml-1.5">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className={cn('h-full rounded-full', row.bar)}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider pt-1">
                  {data.health.total} cliente{data.health.total === 1 ? '' : 's'} na carteira
                </p>
              </div>
            </CardShell>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Retenção */}
            <CardShell icon={Target} title="Retenção de clientes" subtitle="Quem comprou de novo este mês">
              <RetentionCard retention={data.retention} prevLabel={data.trend[data.trend.length - 2]?.fullLabel || 'mês anterior'} />
            </CardShell>

            {/* Follow-ups */}
            <CardShell icon={PhoneCall} title="Eficácia dos follow-ups" subtitle="Desfechos registrados no CRM no período">
              <FollowupCard followups={data.followups} />
            </CardShell>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Receita por empresa */}
            <CardShell
              icon={Building2}
              title="Receita por empresa"
              subtitle="Com comissão estimada pelo percentual configurado"
              onExpand={data.byCompany.length > 5 ? () => setDetailView('byCompany') : undefined}
            >
              {data.byCompany.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-zinc-500 font-medium py-8 text-center">
                  Nenhum pedido lançado em {selected.fullLabel}.
                </p>
              ) : (
                <div className="space-y-4">
                  {data.byCompany.slice(0, 5).map((company) => (
                    <div key={company.name}>
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span className="text-sm font-bold text-slate-800 dark:text-zinc-200 truncate uppercase tracking-tight">{company.name}</span>
                        <div className="flex items-baseline gap-3 shrink-0">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 tabular-nums">
                            {company.commissionPct > 0 ? (
                              <>{company.commissionPct}% → <CommissionValue>{BRL(company.commissionValue)}</CommissionValue></>
                            ) : 'comissão não configurada'}
                          </span>
                          <span className="text-sm font-black text-slate-900 dark:text-zinc-100 tabular-nums">{BRL(company.revenue)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${company.share * 100}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="h-full bg-emerald-500 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardShell>

            {/* Receita por cidade */}
            <CardShell
              icon={MapPin}
              title="Receita por cidade"
              subtitle="Onde está concentrada a carteira ativa do mês"
              onExpand={data.topCities.length > 5 ? () => setDetailView('byCity') : undefined}
            >
              <CityBreakdownCard cities={data.topCities.slice(0, 5)} />
            </CardShell>
          </div>

          {/* Exportação */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">
                  Exportar {selected.fullLabel}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium mt-0.5 max-w-md">
                  Excel em página única: indicadores do mês, vendas por empresa representada e agenda visual. CSV compatível com qualquer planilha.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => handleExport('excel')}
                disabled={!!exporting}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-60 active:scale-95"
              >
                {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Excel
              </button>
              <button
                onClick={() => handleExport('csv')}
                disabled={!!exporting}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-60 active:scale-95"
              >
                {exporting === 'csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                CSV
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
