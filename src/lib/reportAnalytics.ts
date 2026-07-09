import { supabase } from './supabase';
import { CommissionMap, commissionPctFor, monthRange } from './reportGenerator';

export interface TrendPoint {
  /** "2026-07" — chave estável do bucket */
  key: string;
  /** "jul" — rótulo curto do eixo */
  label: string;
  /** "julho 2026" — rótulo completo (tooltip) */
  fullLabel: string;
  revenue: number;
  orders: number;
  isSelected: boolean;
}

export interface TopClient {
  id: string;
  name: string;
  revenue: number;
  orders: number;
  /** participação na receita do mês, 0..1 */
  share: number;
}

export interface CompanySlice {
  name: string;
  revenue: number;
  commissionPct: number;
  commissionValue: number;
  share: number;
}

export interface PortfolioHealth {
  emDia: number;
  alerta: number;
  critico: number;
  inativo: number;
  total: number;
}

export interface ReportKpis {
  revenue: number;
  revenuePrev: number;
  orders: number;
  ordersPrev: number;
  avgTicket: number;
  avgTicketPrev: number;
  commission: number;
  commissionPrev: number;
  newClients: number;
  newClientsPrev: number;
  appointments: number;
}

export interface ReportAnalytics {
  kpis: ReportKpis;
  trend: TrendPoint[];
  topClients: TopClient[];
  byCompany: CompanySlice[];
  health: PortfolioHealth;
}

export interface HealthThresholds {
  alertaDays: number;
  criticoDays: number;
  inativoDays: number;
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * Uma leitura só para toda a página de Relatórios: pedidos dos últimos 12 meses
 * (alimenta tendência + KPIs + tops), clientes (saúde da carteira, novos) e
 * compromissos do mês. Erros sobem — a página trata, nada de dashboard zerado
 * fingindo que está tudo bem.
 */
export async function fetchReportAnalytics(
  userId: string,
  year: number,
  month: number,
  commissions: CommissionMap,
  thresholds: HealthThresholds
): Promise<ReportAnalytics> {
  const { start, end, startDateStr, endDateStr } = monthRange(year, month);
  const trendStart = new Date(year, month - 12, 1); // 12 buckets, terminando no mês selecionado

  const [ordersRes, clientsRes, appointmentsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, client_id, category, value, created_at')
      .eq('user_id', userId)
      .gte('created_at', trendStart.toISOString())
      .lte('created_at', end.toISOString()),
    supabase
      .from('clients')
      .select('id, name, status, last_contact, created_at')
      .eq('user_id', userId),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('date', startDateStr)
      .lte('date', endDateStr),
  ]);

  const firstError = ordersRes.error || clientsRes.error || appointmentsRes.error;
  if (firstError) throw firstError;

  const orders = ordersRes.data || [];
  const clients = clientsRes.data || [];

  // ---- Tendência 12 meses -------------------------------------------------
  const buckets = new Map<string, TrendPoint>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    buckets.set(monthKey(d), {
      key: monthKey(d),
      label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      fullLabel: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      revenue: 0,
      orders: 0,
      isSelected: i === 0,
    });
  }

  const selectedKey = monthKey(start);
  const prevKey = monthKey(new Date(year, month - 2, 1));

  const clientAgg = new Map<string, { revenue: number; orders: number }>();
  const companyAgg = new Map<string, { name: string; revenue: number }>();
  let revenue = 0;
  let ordersCount = 0;
  let commission = 0;
  let revenuePrev = 0;
  let ordersPrev = 0;
  let commissionPrev = 0;

  orders.forEach((o) => {
    const created = new Date(o.created_at);
    const key = monthKey(created);
    const value = Number(o.value) || 0;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.revenue += value;
      bucket.orders += 1;
    }

    const pct = commissionPctFor(o.category, commissions);
    if (key === selectedKey) {
      revenue += value;
      ordersCount += 1;
      commission += value * (pct / 100);

      const cAgg = clientAgg.get(o.client_id) || { revenue: 0, orders: 0 };
      cAgg.revenue += value;
      cAgg.orders += 1;
      clientAgg.set(o.client_id, cAgg);

      const compKey = (o.category || 'Outros').trim().toUpperCase();
      const comp = companyAgg.get(compKey) || { name: (o.category || 'Outros').trim(), revenue: 0 };
      comp.revenue += value;
      companyAgg.set(compKey, comp);
    } else if (key === prevKey) {
      revenuePrev += value;
      ordersPrev += 1;
      commissionPrev += value * (pct / 100);
    }
  });

  // ---- Top clientes do mês ------------------------------------------------
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const topClients: TopClient[] = Array.from(clientAgg.entries())
    .map(([id, agg]) => ({
      id,
      name: clientNames.get(id) || 'Cliente removido',
      revenue: agg.revenue,
      orders: agg.orders,
      share: revenue > 0 ? agg.revenue / revenue : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // ---- Receita por empresa ------------------------------------------------
  const byCompany: CompanySlice[] = Array.from(companyAgg.values())
    .map((c) => {
      const pct = commissionPctFor(c.name, commissions);
      return {
        name: c.name,
        revenue: c.revenue,
        commissionPct: pct,
        commissionValue: c.revenue * (pct / 100),
        share: revenue > 0 ? c.revenue / revenue : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // ---- Saúde da carteira (mesma régua dos alertas de inatividade) ---------
  const now = Date.now();
  const health: PortfolioHealth = { emDia: 0, alerta: 0, critico: 0, inativo: 0, total: clients.length };
  clients.forEach((c) => {
    if (!c.last_contact) {
      health.inativo += 1;
      return;
    }
    const days = Math.floor((now - new Date(c.last_contact).getTime()) / 86400000);
    if (days >= thresholds.inativoDays) health.inativo += 1;
    else if (days >= thresholds.criticoDays) health.critico += 1;
    else if (days >= thresholds.alertaDays) health.alerta += 1;
    else health.emDia += 1;
  });

  // ---- Clientes novos no mês e no anterior ---------------------------------
  const prevStart = new Date(year, month - 2, 1);
  let newClients = 0;
  let newClientsPrev = 0;
  clients.forEach((c) => {
    if (!c.created_at) return;
    const key = monthKey(new Date(c.created_at));
    if (key === selectedKey) newClients += 1;
    else if (key === monthKey(prevStart)) newClientsPrev += 1;
  });

  return {
    kpis: {
      revenue,
      revenuePrev,
      orders: ordersCount,
      ordersPrev,
      avgTicket: ordersCount > 0 ? revenue / ordersCount : 0,
      avgTicketPrev: ordersPrev > 0 ? revenuePrev / ordersPrev : 0,
      commission,
      commissionPrev,
      newClients,
      newClientsPrev,
      appointments: appointmentsRes.count || 0,
    },
    trend: Array.from(buckets.values()),
    topClients,
    byCompany,
    health,
  };
}
