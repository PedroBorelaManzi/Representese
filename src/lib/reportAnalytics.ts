import { supabase } from './supabase';
import { CommissionMap, commissionPctFor, monthRange } from './reportGenerator';
import { FollowupLog } from './followupService';
import { computeWalletHealthGrouped, clientGroupKey, HealthBucket } from './clientAlerts';

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

export interface PortfolioHealthClient {
  /** Chave de agrupamento (matriz + filiais de mesmo nome compartilham uma). */
  key: string;
  /** Primeiro id de cadastro do grupo — usado pra abrir a ficha do cliente. */
  clientId: string;
  name: string;
  city: string;
  bucket: HealthBucket;
}

export interface PortfolioHealth {
  emDia: number;
  alerta: number;
  critico: number;
  inativo: number;
  total: number;
  clients: PortfolioHealthClient[];
}

export interface WeekdayPoint {
  /** 0 = domingo ... 6 = sábado */
  key: number;
  label: string;
  revenue: number;
  orders: number;
}

export interface NewVsReturning {
  newRevenue: number;
  returningRevenue: number;
  newOrders: number;
  returningOrders: number;
  newClientsCount: number;
  returningClientsCount: number;
}

export interface RetentionStats {
  activeLastMonth: number;
  retained: number;
  /** 0..1 */
  retentionRate: number;
}

export interface CityBreakdown {
  city: string;
  revenue: number;
  clients: number;
  /** participação na receita do mês, 0..1 */
  share: number;
}

export interface FollowupStats {
  total: number;
  byOutcome: Record<FollowupLog['outcome'], number>;
  /** % de follow-ups com desfecho positivo, 0..1 */
  conversionRate: number;
}

export interface YtdStats {
  revenue: number;
  commission: number;
  orders: number;
}

/** Mesmos 3 tópicos da aba Entregas: entregue (data marcada já passou),
 *  não entregue (data marcada, ainda no futuro) e sem data de entrega
 *  ainda — dos pedidos lançados no mês selecionado. */
export interface DeliveryStats {
  delivered: number;
  pending: number;
  noDate: number;
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
  weekday: WeekdayPoint[];
  newVsReturning: NewVsReturning;
  retention: RetentionStats;
  topCities: CityBreakdown[];
  followups: FollowupStats;
  ytd: YtdStats;
  delivery: DeliveryStats;
}

export interface HealthThresholds {
  alertaDays: number;
  criticoDays: number;
  inativoDays: number;
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Uma leitura só para toda a página de Relatórios: pedidos dos últimos 12 meses
 * (alimenta tendência + KPIs + tops + análises derivadas), clientes (saúde da
 * carteira, novos, cidade), compromissos e follow-ups do mês. Erros sobem — a
 * página trata, nada de dashboard zerado fingindo que está tudo bem.
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
  const yearStart = new Date(year, 0, 1);

  const [ordersRes, clientsRes, appointmentsRes, followupsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, client_id, category, value, created_at, delivery_date')
      .eq('user_id', userId)
      .gte('created_at', trendStart.toISOString())
      .lte('created_at', end.toISOString()),
    supabase
      .from('clients')
      .select('id, name, city, status, last_contact, created_at, network_name')
      .eq('user_id', userId),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('date', startDateStr)
      .lte('date', endDateStr),
    supabase
      .from('client_followup_logs')
      .select('outcome')
      .eq('user_id', userId)
      .gte('contact_date', startDateStr)
      .lte('contact_date', endDateStr),
  ]);

  const firstError = ordersRes.error || clientsRes.error || appointmentsRes.error || followupsRes.error;
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

  // Mês corrente ainda em andamento: o recorte do mês anterior tem que parar
  // no mesmo dia, senão a variação é sempre negativa por construção.
  const hoje = new Date();
  const mesEmAndamento = selectedKey === monthKey(hoje);
  const diaDeCorte = hoje.getDate();
  const clientCreatedAt = new Map(clients.map((c) => [c.id, c.created_at ? new Date(c.created_at) : null]));
  const clientCity = new Map(clients.map((c) => [c.id, (c.city || '').trim() || 'Não informado']));

  const clientAgg = new Map<string, { revenue: number; orders: number }>();
  const companyAgg = new Map<string, { name: string; revenue: number }>();
  const weekdayAgg = WEEKDAY_LABELS.map((label, key) => ({ key, label, revenue: 0, orders: 0 }));
  const prevMonthClientIds = new Set<string>();
  let revenue = 0;
  let ordersCount = 0;
  let commission = 0;
  let revenuePrev = 0;
  let ordersPrev = 0;
  let commissionPrev = 0;
  let newRevenue = 0;
  let returningRevenue = 0;
  let newOrders = 0;
  let returningOrders = 0;
  const newClientIds = new Set<string>();
  const returningClientIds = new Set<string>();
  let ytdRevenue = 0;
  let ytdCommission = 0;
  let ytdOrders = 0;
  let deliveredCount = 0;
  let pendingCount = 0;
  let noDateCount = 0;
  const today = new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd local, comparável direto com delivery_date

  orders.forEach((o) => {
    const created = new Date(o.created_at);
    const key = monthKey(created);
    const value = Number(o.value) || 0;
    const pct = commissionPctFor(o.category, commissions);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.revenue += value;
      bucket.orders += 1;
    }

    if (created >= yearStart && created <= end) {
      ytdRevenue += value;
      ytdCommission += value * (pct / 100);
      ytdOrders += 1;
    }

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

      const wd = weekdayAgg[created.getDay()];
      wd.revenue += value;
      wd.orders += 1;

      if (!o.delivery_date) noDateCount += 1;
      else if (o.delivery_date <= today) deliveredCount += 1;
      else pendingCount += 1;

      const clientCreated = clientCreatedAt.get(o.client_id);
      const isNewClient = !!clientCreated && monthKey(clientCreated) === selectedKey;
      if (isNewClient) {
        newRevenue += value;
        newOrders += 1;
        newClientIds.add(o.client_id);
      } else {
        returningRevenue += value;
        returningOrders += 1;
        returningClientIds.add(o.client_id);
      }
    } else if (key === prevKey) {
      // Comparação justa: quando o mês selecionado é o corrente, só entram os
      // pedidos do mês anterior até o mesmo dia. Comparar 7 dias contra 31
      // fazia todo início de mês exibir "-100%" nos KPIs.
      if (!mesEmAndamento || created.getDate() <= diaDeCorte) {
        revenuePrev += value;
        ordersPrev += 1;
        commissionPrev += value * (pct / 100);
        prevMonthClientIds.add(o.client_id);
      }
    }
  });

  // ---- Clientes do mês, por receita (lista completa — a tela mostra os 5
  //      primeiros e oferece "ver todos" pra essa lista inteira) -----------
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const topClients: TopClient[] = Array.from(clientAgg.entries())
    .map(([id, agg]) => ({
      id,
      name: clientNames.get(id) || 'Cliente removido',
      revenue: agg.revenue,
      orders: agg.orders,
      share: revenue > 0 ? agg.revenue / revenue : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

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

  // ---- Receita por cidade --------------------------------------------------
  const cityAgg = new Map<string, { revenue: number; clients: Set<string> }>();
  clientAgg.forEach((agg, clientId) => {
    const city = clientCity.get(clientId) || 'Não informado';
    const entry = cityAgg.get(city) || { revenue: 0, clients: new Set<string>() };
    entry.revenue += agg.revenue;
    entry.clients.add(clientId);
    cityAgg.set(city, entry);
  });
  const topCities: CityBreakdown[] = Array.from(cityAgg.entries())
    .map(([city, agg]) => ({
      city,
      revenue: agg.revenue,
      clients: agg.clients.size,
      share: revenue > 0 ? agg.revenue / revenue : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ---- Saúde da carteira (mesma régua dos alertas de inatividade) ---------
  // Pela última compra registrada em qualquer representada — não por
  // last_contact, que só muda em follow-up manual e ficava desencontrado de
  // quem realmente comprou (a carteira aparecia quase toda "inativa" mesmo
  // com pedido lançado há poucos dias).
  //
  // Agrupada por nome de cliente (matriz + filiais viram um só): senão um
  // cliente com várias filiais cadastradas infla o número de inativos —
  // 3 cadastros sem pedido nenhum contavam como 3 inativos, não como 1.
  const now = Date.now();
  const healthByGroup = computeWalletHealthGrouped(
    clients,
    orders,
    { alerta: thresholds.alertaDays, critico: thresholds.criticoDays, inativo: thresholds.inativoDays },
    now
  );
  const health: PortfolioHealth = { emDia: 0, alerta: 0, critico: 0, inativo: 0, total: healthByGroup.size, clients: [] };
  healthByGroup.forEach((bucket) => { health[bucket] += 1; });

  // Um representante por grupo (matriz + filiais de mesmo nome) pra listar na
  // tela — sem isso um cliente com 3 cadastros apareceria 3x na mesma lista.
  const seenHealthGroups = new Set<string>();
  clients.forEach((c) => {
    const key = clientGroupKey(c);
    if (seenHealthGroups.has(key)) return;
    seenHealthGroups.add(key);
    const bucket = healthByGroup.get(key);
    if (!bucket) return;
    health.clients.push({ key, clientId: c.id, name: c.name || 'Sem nome', city: (c.city || '').trim() || 'Não informado', bucket });
  });
  health.clients.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

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

  // ---- Retenção: quem comprou no mês anterior comprou de novo neste mês? --
  let retained = 0;
  prevMonthClientIds.forEach((id) => {
    if (clientAgg.has(id)) retained += 1;
  });
  const retention: RetentionStats = {
    activeLastMonth: prevMonthClientIds.size,
    retained,
    retentionRate: prevMonthClientIds.size > 0 ? retained / prevMonthClientIds.size : 0,
  };

  // ---- Eficácia dos follow-ups do mês --------------------------------------
  const followupRows = (followupsRes.data || []) as { outcome: FollowupLog['outcome'] }[];
  const byOutcome: Record<FollowupLog['outcome'], number> = { positive: 0, pending: 0, negative: 0, no_response: 0 };
  followupRows.forEach((f) => {
    if (f.outcome in byOutcome) byOutcome[f.outcome] += 1;
  });
  const followups: FollowupStats = {
    total: followupRows.length,
    byOutcome,
    conversionRate: followupRows.length > 0 ? byOutcome.positive / followupRows.length : 0,
  };

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
    weekday: weekdayAgg,
    newVsReturning: {
      newRevenue,
      returningRevenue,
      newOrders,
      returningOrders,
      newClientsCount: newClientIds.size,
      returningClientsCount: returningClientIds.size,
    },
    retention,
    topCities,
    followups,
    ytd: { revenue: ytdRevenue, commission: ytdCommission, orders: ytdOrders },
    delivery: { delivered: deliveredCount, pending: pendingCount, noDate: noDateCount, total: ordersCount },
  };
}
