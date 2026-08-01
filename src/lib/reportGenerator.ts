// Só os TIPOS entram no bundle — o runtime (~940 kB) é carregado sob demanda
// dentro de generateExcelReport, no clique de exportar.
import type ExcelJS from 'exceljs';
import { supabase } from './supabase';
import { FollowupLog } from './followupService';
import type { ReportAnalytics } from './reportAnalytics';

export interface ReportData {
  month: Date;
  userId: string;
  clients: Array<{
    id: string;
    name: string;
    city: string;
    lastContact: string | null;
    status: string;
  }>;
  orders: Array<{
    id: string;
    clientId: string;
    clientName: string;
    category: string;
    value: number;
    commission: number;
    createdAt: string;
  }>;
  appointments: Array<{
    id: string;
    title: string;
    clientName: string;
    date: string;
    time: string;
  }>;
  followups: Array<{
    contactDate: string;
    clientName: string;
    method: FollowupLog['method'];
    outcome: FollowupLog['outcome'];
    notes: string;
    nextFollowup: string | null;
  }>;
  byCompany: Array<{
    name: string;
    revenue: number;
    commissionPct: number;
    commissionValue: number;
  }>;
  summary: {
    totalClients: number;
    activeClients: number;
    totalRevenue: number;
    totalCommission: number;
    averageOrderValue: number;
    ordersCount: number;
    appointmentsCount: number;
  };
}

export type CommissionMap = Record<string, number>;

/** % de comissão da empresa, tolerante a diferenças de caixa/espaços. */
export function commissionPctFor(category: string, commissions: CommissionMap): number {
  const key = (category || '').trim().toUpperCase();
  for (const [name, pct] of Object.entries(commissions)) {
    if (name.trim().toUpperCase() === key) return Number(pct) || 0;
  }
  return 0;
}

/** Início e fim do mês no fuso local — fim inclui o dia inteiro (23:59:59.999),
 *  senão pedidos do último dia ficam de fora da comparação com timestamptz. */
export function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDateStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { start, end, startDateStr, endDateStr };
}

async function fetchReportData(
  userId: string,
  year: number,
  month: number,
  commissions: CommissionMap = {}
): Promise<ReportData> {
  const { start, end, startDateStr, endDateStr } = monthRange(year, month);

  const [clientsRes, ordersRes, appointmentsRes, followupsRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, city, last_contact, status')
      .eq('user_id', userId),
    supabase
      .from('orders')
      .select('id, client_id, category, value, created_at, clients(name)')
      .eq('user_id', userId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString()),
    supabase
      .from('appointments')
      .select('id, title, date, time, clients(name)')
      .eq('user_id', userId)
      .gte('date', startDateStr)
      .lte('date', endDateStr),
    supabase
      .from('client_followup_logs')
      .select('contact_date, method, outcome, notes, next_followup, clients(name)')
      .eq('user_id', userId)
      .gte('contact_date', startDateStr)
      .lte('contact_date', endDateStr)
      .order('contact_date', { ascending: true }),
  ]);

  // Erro de query não pode virar relatório vazio silencioso — o usuário
  // exportaria um arquivo "sem pedidos" achando que não vendeu nada.
  const firstError = clientsRes.error || ordersRes.error || appointmentsRes.error || followupsRes.error;
  if (firstError) throw firstError;

  const clients = (clientsRes.data || []).map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city || 'Não informado',
    lastContact: c.last_contact,
    status: c.status || 'Não informado',
  }));

  type OrderRow = { id: string; client_id: string; category: string; value: number | null; created_at: string; clients: { name: string } | null };
  const orders = ((ordersRes.data || []) as unknown as OrderRow[]).map((o) => {
    const value = Number(o.value) || 0;
    const pct = commissionPctFor(o.category, commissions);
    return {
      id: o.id,
      clientId: o.client_id,
      clientName: o.clients?.name || 'Cliente desconhecido',
      category: o.category,
      value,
      commission: value * (pct / 100),
      createdAt: o.created_at,
    };
  });

  type AppointmentRow = { id: string; title: string; date: string; time: string; clients: { name: string } | null };
  const appointments = ((appointmentsRes.data || []) as unknown as AppointmentRow[]).map((a) => ({
    id: a.id,
    title: a.title,
    clientName: a.clients?.name || 'Sem cliente',
    date: a.date,
    time: a.time,
  }));

  type FollowupRow = { contact_date: string; method: FollowupLog['method']; outcome: FollowupLog['outcome']; notes: string; next_followup: string | null; clients: { name: string } | null };
  const followups = ((followupsRes.data || []) as unknown as FollowupRow[]).map((f) => ({
    contactDate: f.contact_date,
    clientName: f.clients?.name || 'Cliente desconhecido',
    method: f.method,
    outcome: f.outcome,
    notes: f.notes,
    nextFollowup: f.next_followup,
  }));

  // Receita e comissão agregadas por empresa representada
  const companyMap = new Map<string, { name: string; revenue: number }>();
  orders.forEach((o) => {
    const key = (o.category || 'Outros').trim().toUpperCase();
    const existing = companyMap.get(key);
    if (existing) existing.revenue += o.value;
    else companyMap.set(key, { name: (o.category || 'Outros').trim(), revenue: o.value });
  });
  const byCompany = Array.from(companyMap.values())
    .map((c) => {
      const pct = commissionPctFor(c.name, commissions);
      return { name: c.name, revenue: c.revenue, commissionPct: pct, commissionValue: c.revenue * (pct / 100) };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = orders.reduce((sum, o) => sum + o.value, 0);
  const totalCommission = orders.reduce((sum, o) => sum + o.commission, 0);
  const activeClients = clients.filter((c) => c.status === 'Ativo').length;

  return {
    month: start,
    userId,
    clients,
    orders,
    appointments,
    followups,
    byCompany,
    summary: {
      totalClients: clients.length,
      activeClients,
      totalRevenue,
      totalCommission,
      averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      ordersCount: orders.length,
      appointmentsCount: appointments.length,
    },
  };
}

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const OUTCOME_LABELS: Record<FollowupLog['outcome'], string> = {
  positive: 'Positivo',
  pending: 'Pendente',
  negative: 'Negativo',
  no_response: 'Sem resposta',
};

function thinBorder(theme: typeof import('./excelTheme')): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: theme.BRAND.border } },
    bottom: { style: 'thin', color: { argb: theme.BRAND.border } },
    left: { style: 'thin', color: { argb: theme.BRAND.border } },
    right: { style: 'thin', color: { argb: theme.BRAND.border } },
  };
}

/** Desenha o calendário do mês (7 colunas, DOM–SÁB) a partir de `startRow`,
 *  mostrando até 3 compromissos por dia. Retorna a próxima linha livre. */
function writeCalendarGrid(
  sheet: ExcelJS.Worksheet,
  data: ReportData,
  startRow: number,
  theme: typeof import('./excelTheme')
): number {
  const { BRAND } = theme;
  const border = thinBorder(theme);
  const year = data.month.getFullYear();
  const month = data.month.getMonth() + 1;

  const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const headerRow = sheet.getRow(startRow);
  dayNames.forEach((day, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = day;
    cell.border = border;
    cell.font = { bold: true, color: { argb: BRAND.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.ink } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 20;

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const appointmentsByDate = new Map<string, typeof data.appointments>();
  data.appointments.forEach((app) => {
    if (!appointmentsByDate.has(app.date)) appointmentsByDate.set(app.date, []);
    appointmentsByDate.get(app.date)!.push(app);
  });

  let currentRow = startRow + 1;
  let dayCounter = 1;
  for (let week = 0; week < 6; week++) {
    const row = sheet.getRow(currentRow);
    row.height = 76;
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const cell = row.getCell(dayOfWeek + 1);
      cell.border = border;
      const isFirstWeek = week === 0;
      const isAfterMonth = dayCounter > daysInMonth;
      if ((isFirstWeek && dayOfWeek < firstDay) || isAfterMonth) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
      } else {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayCounter).padStart(2, '0')}`;
        const appointments = appointmentsByDate.get(dateStr) || [];
        const richText: ExcelJS.RichText[] = [{ text: `${dayCounter}\n\n`, font: { bold: true, size: 11 } }];
        appointments.slice(0, 3).forEach((app, idx) => {
          if (idx > 0) richText.push({ text: '\n' });
          richText.push({
            text: `• ${app.time} ${app.title.slice(0, 16)}${app.title.length > 16 ? '...' : ''}`,
            font: { size: 8, color: { argb: BRAND.primaryDark } },
          });
        });
        if (appointments.length > 3) {
          richText.push({ text: `\n(+${appointments.length - 3} mais)`, font: { size: 7, italic: true, color: { argb: BRAND.slateLight } } });
        }
        cell.value = { richText };
        cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: appointments.length > 0 ? BRAND.warnPale : BRAND.white } };
        dayCounter++;
      }
    }
    currentRow++;
    if (dayCounter > daysInMonth) break;
  }
  return currentRow;
}

function deltaSub(current: number, prev: number, suffix = 'vs. mês anterior'): string {
  if (prev === 0 && current === 0) return `estável ${suffix}`;
  if (prev === 0) return `novo ${suffix}`;
  const pct = ((current - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return `estável ${suffix}`;
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% ${suffix}`;
}

export async function generateExcelReport(
  userId: string,
  year: number,
  month: number,
  commissions: CommissionMap = {},
  analytics?: ReportAnalytics
): Promise<Buffer> {
  const [{ default: Excel }, theme, data] = await Promise.all([
    import('exceljs'),
    import('./excelTheme'),
    fetchReportData(userId, year, month, commissions),
  ]);
  const { BRAND, CURRENCY_FMT, INT_FMT, PERCENT_FMT, addBanner, addKpiGrid, addDataBars, addFootnote, styleTableHeader, zebraStripe, autoFilter } = theme;

  const workbook = new Excel.Workbook();
  workbook.creator = 'Represente-Se!';
  workbook.created = new Date();

  const monthName = data.month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const border = thinBorder(theme);

  // ═════════════════════════════════════════════════════════════════
  // ABA 1: RESUMO
  // ═════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet('📊 Resumo', { views: [{ showGridLines: false }] });
  summarySheet.columns = Array.from({ length: 8 }, () => ({ width: 15 }));
  let row = addBanner(summarySheet, {
    title: 'Relatório Mensal de Vendas',
    subtitle: `${monthNameCap} · gerado em ${new Date().toLocaleString('pt-BR')}`,
    cols: 8,
  });
  row += 1;

  const k = analytics?.kpis;
  const tiles = [
    { label: 'Receita Total', value: data.summary.totalRevenue, numFmt: CURRENCY_FMT, accent: BRAND.primaryDark, sub: k ? deltaSub(k.revenue, k.revenuePrev) : undefined },
    { label: 'Comissão', value: data.summary.totalCommission, numFmt: CURRENCY_FMT, accent: BRAND.primary, sub: k ? deltaSub(k.commission, k.commissionPrev) : undefined },
    { label: 'Pedidos', value: data.summary.ordersCount, numFmt: INT_FMT, accent: BRAND.accentBlue, sub: k ? deltaSub(k.orders, k.ordersPrev) : undefined },
    { label: 'Ticket Médio', value: data.summary.averageOrderValue, numFmt: CURRENCY_FMT, accent: BRAND.accentIndigo, sub: k ? deltaSub(k.avgTicket, k.avgTicketPrev) : undefined },
    { label: 'Clientes Novos', value: k?.newClients ?? 0, numFmt: INT_FMT, accent: BRAND.accentPurple, sub: k ? deltaSub(k.newClients, k.newClientsPrev) : undefined },
    { label: 'Clientes Ativos', value: data.summary.activeClients, numFmt: INT_FMT, accent: BRAND.accentAmber, sub: `de ${data.summary.totalClients} na carteira` },
    { label: 'Compromissos', value: data.summary.appointmentsCount, numFmt: INT_FMT, accent: BRAND.accentBlue },
    { label: 'Retenção', value: analytics ? analytics.retention.retentionRate : 0, numFmt: PERCENT_FMT, accent: BRAND.accentPurple, sub: analytics ? `${analytics.retention.retained} de ${analytics.retention.activeLastMonth} recompraram` : undefined },
  ];
  row = addKpiGrid(summarySheet, row, tiles, { tileCols: 2, perRow: 4 }) + 1;

  if (analytics?.ytd) {
    summarySheet.mergeCells(`A${row}:H${row}`);
    const ytdCell = summarySheet.getCell(`A${row}`);
    ytdCell.value = {
      richText: [
        { text: `Acumulado ${year}: `, font: { bold: true, size: 10, color: { argb: BRAND.ink } } },
        { text: `${BRL(analytics.ytd.revenue)} em receita · ${BRL(analytics.ytd.commission)} em comissão · ${analytics.ytd.orders} pedidos`, font: { size: 10, color: { argb: BRAND.slate } } },
      ],
    };
    row += 2;
  }
  addFootnote(summarySheet, row, 8);

  // ═════════════════════════════════════════════════════════════════
  // ABA 2: TENDÊNCIA 12 MESES
  // ═════════════════════════════════════════════════════════════════
  if (analytics?.trend?.length) {
    const trendSheet = workbook.addWorksheet('📈 Tendência 12 Meses');
    trendSheet.columns = [
      { header: 'Mês', key: 'label', width: 20 },
      { header: 'Receita', key: 'revenue', width: 18 },
      { header: 'Pedidos', key: 'orders', width: 12 },
    ];
    analytics.trend.forEach((t) => trendSheet.addRow({ label: t.fullLabel, revenue: t.revenue, orders: t.orders }));
    trendSheet.getColumn('revenue').numFmt = CURRENCY_FMT;
    styleTableHeader(trendSheet.getRow(1), BRAND.primary);
    zebraStripe(trendSheet, 2, analytics.trend.length + 1);
    analytics.trend.forEach((t, i) => {
      if (t.isSelected) {
        trendSheet.getRow(i + 2).font = { bold: true };
        trendSheet.getRow(i + 2).getCell('label').font = { bold: true, color: { argb: BRAND.primaryDark } };
      }
    });
    addDataBars(trendSheet, `B2:B${analytics.trend.length + 1}`, BRAND.primary);
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 3: TOP CLIENTES
  // ═════════════════════════════════════════════════════════════════
  if (analytics?.topClients?.length) {
    const topSheet = workbook.addWorksheet('⭐ Top Clientes');
    topSheet.columns = [
      { header: '#', key: 'rank', width: 6 },
      { header: 'Cliente', key: 'name', width: 28 },
      { header: 'Receita', key: 'revenue', width: 18 },
      { header: 'Pedidos', key: 'orders', width: 12 },
      { header: '% do Mês', key: 'share', width: 14 },
    ];
    analytics.topClients.forEach((c, i) => topSheet.addRow({ rank: i + 1, name: c.name, revenue: c.revenue, orders: c.orders, share: c.share }));
    topSheet.getColumn('revenue').numFmt = CURRENCY_FMT;
    topSheet.getColumn('share').numFmt = PERCENT_FMT;
    styleTableHeader(topSheet.getRow(1), BRAND.accentIndigo);
    zebraStripe(topSheet, 2, analytics.topClients.length + 1);
    addDataBars(topSheet, `C2:C${analytics.topClients.length + 1}`, BRAND.accentIndigo);
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 4: EMPRESAS REPRESENTADAS (com clientes por empresa)
  // ═════════════════════════════════════════════════════════════════
  const companySheet = workbook.addWorksheet('🏢 Empresas Representadas', { views: [{ showGridLines: false }] });
  companySheet.columns = Array.from({ length: 7 }, () => ({ width: 18 }));
  let crow = 1;

  const companyClientMap = new Map<string, Map<string, number>>();
  data.orders.forEach((o) => {
    const key = (o.category || 'Outros').trim().toUpperCase();
    if (!companyClientMap.has(key)) companyClientMap.set(key, new Map());
    const m = companyClientMap.get(key)!;
    m.set(o.clientName, (m.get(o.clientName) || 0) + o.value);
  });

  const companiesForSheet = analytics?.byCompany?.length ? analytics.byCompany : data.byCompany.map((c) => ({ ...c, share: 0 }));

  if (companiesForSheet.length === 0) {
    companySheet.mergeCells(`A${crow}:G${crow}`);
    const empty = companySheet.getCell(`A${crow}`);
    empty.value = 'Nenhum pedido registrado neste período.';
    empty.font = { italic: true, size: 10, color: { argb: BRAND.slateLight } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    companySheet.getRow(crow).height = 20;
    crow++;
  }

  companiesForSheet.forEach((company) => {
    companySheet.mergeCells(`A${crow}:E${crow}`);
    companySheet.mergeCells(`F${crow}:G${crow}`);
    const nameCell = companySheet.getCell(`A${crow}`);
    const revenueCell = companySheet.getCell(`F${crow}`);
    nameCell.value = company.name;
    nameCell.font = { bold: true, size: 11, color: { argb: BRAND.white } };
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    revenueCell.value = company.revenue;
    revenueCell.numFmt = CURRENCY_FMT;
    revenueCell.font = { bold: true, size: 11, color: { argb: BRAND.white } };
    revenueCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    [nameCell, revenueCell].forEach((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.primary } };
    });
    companySheet.getRow(crow).height = 22;
    crow++;

    companySheet.mergeCells(`A${crow}:E${crow}`);
    companySheet.mergeCells(`F${crow}:G${crow}`);
    const clientHeaderCell = companySheet.getCell(`A${crow}`);
    const valueHeaderCell = companySheet.getCell(`F${crow}`);
    clientHeaderCell.value = 'Cliente';
    valueHeaderCell.value = 'Valor';
    [clientHeaderCell, valueHeaderCell].forEach((c) => {
      c.font = { bold: true, size: 9, color: { argb: BRAND.slate } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
      c.border = border;
    });
    clientHeaderCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 };
    valueHeaderCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    companySheet.getRow(crow).height = 16;
    crow++;

    const clientsMap = companyClientMap.get(company.name.trim().toUpperCase()) || new Map();
    const clientEntries = Array.from(clientsMap.entries()).sort((a, b) => b[1] - a[1]);
    clientEntries.forEach(([clientName, value], idx) => {
      companySheet.mergeCells(`A${crow}:E${crow}`);
      companySheet.mergeCells(`F${crow}:G${crow}`);
      const nameC = companySheet.getCell(`A${crow}`);
      const valueC = companySheet.getCell(`F${crow}`);
      nameC.value = clientName;
      nameC.font = { size: 10, color: { argb: BRAND.ink } };
      nameC.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 };
      valueC.value = value;
      valueC.numFmt = CURRENCY_FMT;
      valueC.font = { size: 10, color: { argb: BRAND.ink } };
      valueC.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
      const zebra = idx % 2 === 1;
      [nameC, valueC].forEach((c) => {
        c.border = border;
        if (zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
      });
      companySheet.getRow(crow).height = 16;
      crow++;
    });

    crow++; // espaço entre empresas
  });

  // ═════════════════════════════════════════════════════════════════
  // ABA 5: SAÚDE DA CARTEIRA
  // ═════════════════════════════════════════════════════════════════
  if (analytics?.health) {
    const h = analytics.health;
    const healthSheet = workbook.addWorksheet('🩺 Saúde da Carteira');
    healthSheet.columns = [
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Quantidade', key: 'count', width: 14 },
      { header: 'Percentual', key: 'pct', width: 14 },
    ];
    const rows = [
      { status: 'Em Dia', count: h.emDia, fill: 'FFD1FAE5', font: 'FF065F46' },
      { status: 'Alerta', count: h.alerta, fill: 'FFFEF3C7', font: 'FF78350F' },
      { status: 'Crítico', count: h.critico, fill: 'FFFED7AA', font: 'FF7C2D12' },
      { status: 'Inativo', count: h.inativo, fill: 'FFFECACA', font: 'FF7F1D1D' },
    ];
    rows.forEach((r) => healthSheet.addRow({ status: r.status, count: r.count, pct: h.total ? r.count / h.total : 0 }));
    healthSheet.getColumn('pct').numFmt = PERCENT_FMT;
    styleTableHeader(healthSheet.getRow(1), BRAND.danger);
    rows.forEach((r, i) => {
      const statusCell = healthSheet.getRow(i + 2).getCell('status');
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.fill } };
      statusCell.font = { color: { argb: r.font }, bold: true };
      healthSheet.getRow(i + 2).getCell('count').alignment = { horizontal: 'center' };
    });
    addDataBars(healthSheet, `B2:B${rows.length + 1}`, BRAND.danger);
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 6: VENDAS POR DIA DA SEMANA
  // ═════════════════════════════════════════════════════════════════
  if (analytics?.weekday?.length) {
    const weekdaySheet = workbook.addWorksheet('📅 Por Dia da Semana');
    weekdaySheet.columns = [
      { header: 'Dia', key: 'label', width: 16 },
      { header: 'Receita', key: 'revenue', width: 18 },
      { header: 'Pedidos', key: 'orders', width: 12 },
    ];
    analytics.weekday.forEach((w) => weekdaySheet.addRow({ label: w.label, revenue: w.revenue, orders: w.orders }));
    weekdaySheet.getColumn('revenue').numFmt = CURRENCY_FMT;
    styleTableHeader(weekdaySheet.getRow(1), BRAND.accentAmber);
    zebraStripe(weekdaySheet, 2, analytics.weekday.length + 1);
    addDataBars(weekdaySheet, `B2:B${analytics.weekday.length + 1}`, BRAND.accentAmber);
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 7: NOVOS VS. RECORRENTES
  // ═════════════════════════════════════════════════════════════════
  if (analytics?.newVsReturning) {
    const nv = analytics.newVsReturning;
    const nvSheet = workbook.addWorksheet('🔁 Novos vs Recorrentes');
    nvSheet.columns = Array.from({ length: 8 }, () => ({ width: 15 }));
    let nrow = addBanner(nvSheet, { title: 'Novos vs. Recorrentes', subtitle: `De onde veio a receita de ${monthNameCap}`, cols: 8 });
    nrow += 1;
    const totalRevenue = nv.newRevenue + nv.returningRevenue;
    addKpiGrid(nvSheet, nrow, [
      { label: 'Receita de Novos', value: nv.newRevenue, numFmt: CURRENCY_FMT, accent: BRAND.accentBlue, sub: `${totalRevenue ? ((nv.newRevenue / totalRevenue) * 100).toFixed(0) : 0}% do mês` },
      { label: 'Receita Recorrente', value: nv.returningRevenue, numFmt: CURRENCY_FMT, accent: BRAND.primary, sub: `${totalRevenue ? ((nv.returningRevenue / totalRevenue) * 100).toFixed(0) : 0}% do mês` },
      { label: 'Clientes Novos', value: nv.newClientsCount, numFmt: INT_FMT, accent: BRAND.accentIndigo, sub: `${nv.newOrders} pedidos` },
      { label: 'Clientes Recorrentes', value: nv.returningClientsCount, numFmt: INT_FMT, accent: BRAND.accentPurple, sub: `${nv.returningOrders} pedidos` },
    ], { tileCols: 2, perRow: 2 });
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 8: RECEITA POR CIDADE
  // ═════════════════════════════════════════════════════════════════
  if (analytics?.topCities?.length) {
    const citySheet = workbook.addWorksheet('📍 Por Cidade');
    citySheet.columns = [
      { header: 'Cidade', key: 'city', width: 22 },
      { header: 'Receita', key: 'revenue', width: 18 },
      { header: 'Clientes', key: 'clients', width: 12 },
      { header: '% do Mês', key: 'share', width: 14 },
    ];
    analytics.topCities.forEach((c) => citySheet.addRow(c));
    citySheet.getColumn('revenue').numFmt = CURRENCY_FMT;
    citySheet.getColumn('share').numFmt = PERCENT_FMT;
    styleTableHeader(citySheet.getRow(1), BRAND.accentPurple);
    zebraStripe(citySheet, 2, analytics.topCities.length + 1);
    addDataBars(citySheet, `B2:B${analytics.topCities.length + 1}`, BRAND.accentPurple);
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 9: PEDIDOS DO MÊS
  // ═════════════════════════════════════════════════════════════════
  const ordersSheet = workbook.addWorksheet('📋 Pedidos do Mês');
  ordersSheet.columns = [
    { header: 'Cliente', key: 'clientName', width: 26 },
    { header: 'Empresa', key: 'category', width: 22 },
    { header: 'Valor', key: 'value', width: 16 },
    { header: 'Comissão', key: 'commission', width: 16 },
    { header: 'Data', key: 'date', width: 14 },
  ];
  data.orders.forEach((o) =>
    ordersSheet.addRow({ clientName: o.clientName, category: o.category, value: o.value, commission: o.commission, date: new Date(o.createdAt).toLocaleDateString('pt-BR') })
  );
  ordersSheet.getColumn('value').numFmt = CURRENCY_FMT;
  ordersSheet.getColumn('commission').numFmt = CURRENCY_FMT;
  styleTableHeader(ordersSheet.getRow(1), BRAND.primary);
  zebraStripe(ordersSheet, 2, data.orders.length + 1);
  if (data.orders.length > 0) autoFilter(ordersSheet, 1, 5, data.orders.length + 1);
  ordersSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ═════════════════════════════════════════════════════════════════
  // ABA 10: FOLLOW-UPS DO MÊS
  // ═════════════════════════════════════════════════════════════════
  if (data.followups.length > 0) {
    const followupSheet = workbook.addWorksheet('📞 Follow-ups');
    followupSheet.columns = [
      { header: 'Cliente', key: 'clientName', width: 26 },
      { header: 'Data', key: 'date', width: 14 },
      { header: 'Canal', key: 'method', width: 14 },
      { header: 'Resultado', key: 'outcome', width: 16 },
      { header: 'Observações', key: 'notes', width: 32 },
    ];
    data.followups.forEach((f) =>
      followupSheet.addRow({
        clientName: f.clientName,
        date: new Date(f.contactDate).toLocaleDateString('pt-BR'),
        method: f.method,
        outcome: OUTCOME_LABELS[f.outcome] || f.outcome,
        notes: f.notes || '—',
      })
    );
    styleTableHeader(followupSheet.getRow(1), BRAND.accentIndigo);
    zebraStripe(followupSheet, 2, data.followups.length + 1);
    autoFilter(followupSheet, 1, 5, data.followups.length + 1);
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 11: AGENDA DO MÊS
  // ═════════════════════════════════════════════════════════════════
  const agendaSheet = workbook.addWorksheet('🗓️ Agenda do Mês', { views: [{ showGridLines: false }] });
  agendaSheet.columns = Array.from({ length: 7 }, () => ({ width: 18 }));
  if (data.appointments.length > 0) {
    writeCalendarGrid(agendaSheet, data, 1, theme);
  } else {
    agendaSheet.mergeCells('A1:G1');
    const empty = agendaSheet.getCell('A1');
    empty.value = 'Nenhum compromisso registrado neste período.';
    empty.font = { italic: true, size: 10, color: { argb: BRAND.slateLight } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    agendaSheet.getRow(1).height = 20;
  }

  summarySheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function reportFilename(year: number, month: number, ext: string) {
  const monthName = new Date(year, month - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return `Relatório_${monthName.replace(/\s/g, '_')}.${ext}`;
}

export async function downloadExcelReport(
  userId: string,
  year: number,
  month: number,
  commissions: CommissionMap = {},
  analytics?: ReportAnalytics
) {
  const buffer = await generateExcelReport(userId, year, month, commissions, analytics);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, reportFilename(year, month, 'xlsx'));
}

export async function generateCSVReport(
  userId: string,
  year: number,
  month: number,
  commissions: CommissionMap = {},
  analytics?: ReportAnalytics
): Promise<string> {
  const data = await fetchReportData(userId, year, month, commissions);
  const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;

  let csv = 'RESUMO MENSAL\n';
  csv += `Período,${data.month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}\n`;
  csv += `Receita Total,${esc(BRL(data.summary.totalRevenue))}\n`;
  csv += `Comissão Estimada,${esc(BRL(data.summary.totalCommission))}\n`;
  csv += `Total de Pedidos,${data.summary.ordersCount}\n`;
  csv += `Ticket Médio,${esc(BRL(data.summary.averageOrderValue))}\n`;
  csv += `Total de Clientes,${data.summary.totalClients}\n`;
  csv += `Clientes Ativos,${data.summary.activeClients}\n`;
  if (analytics) {
    csv += `Clientes Novos no Mês,${analytics.kpis.newClients}\n`;
    csv += `Taxa de Retenção,${esc(`${(analytics.retention.retentionRate * 100).toFixed(1)}%`)}\n`;
    csv += `Acumulado no Ano (Receita),${esc(BRL(analytics.ytd.revenue))}\n`;
  }
  csv += '\n';

  csv += 'PEDIDOS\n';
  csv += 'Cliente,Empresa,Valor,Comissão,Data\n';
  data.orders.forEach((o) => {
    csv += `${esc(o.clientName)},${esc(o.category)},${esc(BRL(o.value))},${esc(BRL(o.commission))},${esc(new Date(o.createdAt).toLocaleDateString('pt-BR'))}\n`;
  });

  csv += '\nCOMISSÕES POR EMPRESA\n';
  csv += 'Empresa,Receita,% Comissão,Comissão\n';
  data.byCompany.forEach((c) => {
    csv += `${esc(c.name)},${esc(BRL(c.revenue))},${esc(c.commissionPct > 0 ? `${c.commissionPct}%` : '—')},${esc(BRL(c.commissionValue))}\n`;
  });

  if (analytics?.weekday?.length) {
    csv += '\nVENDAS POR DIA DA SEMANA\n';
    csv += 'Dia,Receita,Pedidos\n';
    analytics.weekday.forEach((w) => {
      csv += `${esc(w.label)},${esc(BRL(w.revenue))},${w.orders}\n`;
    });
  }

  if (analytics?.topCities?.length) {
    csv += '\nRECEITA POR CIDADE\n';
    csv += 'Cidade,Receita,Clientes,% do Mês\n';
    analytics.topCities.forEach((c) => {
      csv += `${esc(c.city)},${esc(BRL(c.revenue))},${c.clients},${esc(`${(c.share * 100).toFixed(1)}%`)}\n`;
    });
  }

  if (analytics?.health) {
    const h = analytics.health;
    csv += '\nSAÚDE DA CARTEIRA\n';
    csv += 'Status,Quantidade\n';
    csv += `Em Dia,${h.emDia}\nAlerta,${h.alerta}\nCrítico,${h.critico}\nInativo,${h.inativo}\n`;
  }

  csv += '\nCLIENTES\n';
  csv += 'Nome,Cidade,Status,Último Contato\n';
  data.clients.forEach((c) => {
    const lastContact = c.lastContact ? new Date(c.lastContact).toLocaleDateString('pt-BR') : 'Nunca';
    csv += `${esc(c.name)},${esc(c.city)},${esc(c.status)},${esc(lastContact)}\n`;
  });

  return csv;
}

export async function downloadCSVReport(
  userId: string,
  year: number,
  month: number,
  commissions: CommissionMap = {},
  analytics?: ReportAnalytics
) {
  const csv = await generateCSVReport(userId, year, month, commissions, analytics);
  // BOM para o Excel abrir acentos corretamente
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, reportFilename(year, month, 'csv'));
}
