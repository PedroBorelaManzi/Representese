// Só os TIPOS entram no bundle — o runtime (~940 kB) é carregado sob demanda
// dentro de generateExcelReport, no clique de exportar.
import type ExcelJS from 'exceljs';
import { supabase } from './supabase';
import { FollowupLog } from './followupService';
import type { ReportAnalytics } from './reportAnalytics';
import { saveFile } from './saveFile';

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

/** Faixa colorida de título de seção dentro de uma aba com várias tabelas empilhadas. */
function addSectionHeader(
  sheet: ExcelJS.Worksheet,
  row: number,
  cols: number,
  title: string,
  color: string,
  theme: typeof import('./excelTheme')
): number {
  const { BRAND } = theme;
  sheet.mergeCells(row, 1, row, cols);
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.font = { bold: true, size: 11, color: { argb: BRAND.white } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(row).height = 22;
  return row + 1;
}

/** Escreve uma tabela simples (header + linhas) a partir de `startRow`, usando
 *  células por posição — várias tabelas cabem lado a lado na mesma aba, cada
 *  uma seguida da próxima assim que a anterior termina. */
function addSimpleTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  headers: string[],
  rows: (string | number)[][],
  opts: { theme: typeof import('./excelTheme'); numFmtByCol?: Record<number, string>; headerColor?: string; dataBarCol?: number; emptyLabel?: string }
): { nextRow: number; dataStart: number; dataEnd: number } {
  const { BRAND, styleTableHeader, addDataBars, colLetter } = opts.theme;
  const headerRow = sheet.getRow(startRow);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  styleTableHeader(headerRow, opts.headerColor || BRAND.primary);

  let r = startRow + 1;
  const dataStart = r;
  rows.forEach((values, idx) => {
    const dataRow = sheet.getRow(r);
    values.forEach((v, i) => {
      const cell = dataRow.getCell(i + 1);
      cell.value = v;
      const fmt = opts.numFmtByCol?.[i + 1];
      if (fmt) cell.numFmt = fmt;
    });
    if (idx % 2 === 1) dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
    r++;
  });
  const dataEnd = r - 1;

  if (rows.length === 0) {
    sheet.mergeCells(startRow + 1, 1, startRow + 1, headers.length);
    const emptyCell = sheet.getCell(startRow + 1, 1);
    emptyCell.value = opts.emptyLabel || 'Sem dados neste período.';
    emptyCell.font = { italic: true, size: 9, color: { argb: BRAND.slateLight } };
    emptyCell.alignment = { horizontal: 'center' };
    r = startRow + 2;
  } else if (opts.dataBarCol) {
    const cl = colLetter(opts.dataBarCol);
    addDataBars(sheet, `${cl}${dataStart}:${cl}${dataEnd}`, opts.headerColor || BRAND.primary);
  }

  return { nextRow: r + 1, dataStart, dataEnd };
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
  const { BRAND, CURRENCY_FMT, INT_FMT, PERCENT_FMT, addBanner, addKpiGrid, addFootnote, autoFilter } = theme;

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
  // ABA 2: DESEMPENHO (tendência 12 meses + dia da semana + novos vs. recorrentes)
  // ═════════════════════════════════════════════════════════════════
  if (analytics) {
    const perfSheet = workbook.addWorksheet('📈 Desempenho', { views: [{ showGridLines: false }] });
    for (let i = 1; i <= 5; i++) perfSheet.getColumn(i).width = i === 1 ? 26 : 16;
    let prow = 1;

    prow = addSectionHeader(perfSheet, prow, 5, 'TENDÊNCIA — ÚLTIMOS 12 MESES', BRAND.primary, theme);
    const trend = addSimpleTable(
      perfSheet, prow, ['Mês', 'Receita', 'Pedidos'],
      analytics.trend.map((t) => [t.fullLabel, t.revenue, t.orders]),
      { theme, numFmtByCol: { 2: CURRENCY_FMT }, dataBarCol: 2, headerColor: BRAND.primary }
    );
    analytics.trend.forEach((t, i) => {
      if (t.isSelected) perfSheet.getRow(trend.dataStart + i).font = { bold: true, color: { argb: BRAND.primaryDark } };
    });
    prow = trend.nextRow;

    prow = addSectionHeader(perfSheet, prow, 5, 'VENDAS POR DIA DA SEMANA', BRAND.accentAmber, theme);
    prow = addSimpleTable(
      perfSheet, prow, ['Dia', 'Receita', 'Pedidos'],
      analytics.weekday.map((w) => [w.label, w.revenue, w.orders]),
      { theme, numFmtByCol: { 2: CURRENCY_FMT }, dataBarCol: 2, headerColor: BRAND.accentAmber }
    ).nextRow;

    prow = addSectionHeader(perfSheet, prow, 5, 'NOVOS VS. RECORRENTES', BRAND.accentIndigo, theme);
    const nv = analytics.newVsReturning;
    const nvTotal = nv.newRevenue + nv.returningRevenue;
    addSimpleTable(
      perfSheet, prow, ['Categoria', 'Receita', '% do Mês', 'Clientes', 'Pedidos'],
      [
        ['Novos', nv.newRevenue, nvTotal ? nv.newRevenue / nvTotal : 0, nv.newClientsCount, nv.newOrders],
        ['Recorrentes', nv.returningRevenue, nvTotal ? nv.returningRevenue / nvTotal : 0, nv.returningClientsCount, nv.returningOrders],
      ],
      { theme, numFmtByCol: { 2: CURRENCY_FMT, 3: PERCENT_FMT }, dataBarCol: 2, headerColor: BRAND.accentIndigo }
    );
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 3: CLIENTES & EMPRESAS (top clientes + saúde da carteira + empresas + cidades)
  // ═════════════════════════════════════════════════════════════════
  const clientsSheet = workbook.addWorksheet('🏆 Clientes & Empresas', { views: [{ showGridLines: false }] });
  for (let i = 1; i <= 8; i++) clientsSheet.getColumn(i).width = i === 1 ? 8 : i === 2 ? 26 : 16;
  let srow = 1;

  if (analytics?.topClients) {
    srow = addSectionHeader(clientsSheet, srow, 8, 'CLIENTES DO MÊS, POR RECEITA', BRAND.accentIndigo, theme);
    srow = addSimpleTable(
      clientsSheet, srow, ['#', 'Cliente', 'Receita', 'Pedidos', '% do Mês'],
      analytics.topClients.map((c, i) => [i + 1, c.name, c.revenue, c.orders, c.share]),
      { theme, numFmtByCol: { 3: CURRENCY_FMT, 5: PERCENT_FMT }, dataBarCol: 3, headerColor: BRAND.accentIndigo, emptyLabel: 'Nenhum pedido lançado neste período.' }
    ).nextRow;
  }

  if (analytics?.health) {
    const h = analytics.health;
    const healthRowsData: { label: string; count: number; fill: string; font: string; bucket: string }[] = [
      { label: 'Em Dia', count: h.emDia, fill: 'FFD1FAE5', font: 'FF065F46', bucket: 'emDia' },
      { label: 'Alerta', count: h.alerta, fill: 'FFFEF3C7', font: 'FF78350F', bucket: 'alerta' },
      { label: 'Crítico', count: h.critico, fill: 'FFFED7AA', font: 'FF7C2D12', bucket: 'critico' },
      { label: 'Inativo', count: h.inativo, fill: 'FFFECACA', font: 'FF7F1D1D', bucket: 'inativo' },
    ];
    srow = addSectionHeader(clientsSheet, srow, 8, 'SAÚDE DA CARTEIRA', BRAND.danger, theme);
    const healthSummary = addSimpleTable(
      clientsSheet, srow, ['Status', 'Quantidade', 'Percentual'],
      healthRowsData.map((r) => [r.label, r.count, h.total ? r.count / h.total : 0]),
      { theme, numFmtByCol: { 3: PERCENT_FMT }, headerColor: BRAND.danger }
    );
    healthRowsData.forEach((r, i) => {
      const statusCell = clientsSheet.getRow(healthSummary.dataStart + i).getCell(1);
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.fill } };
      statusCell.font = { color: { argb: r.font }, bold: true };
    });
    srow = healthSummary.nextRow;

    const bucketOrder = ['emDia', 'alerta', 'critico', 'inativo'];
    const sortedHealthClients = [...h.clients].sort((a, b) => bucketOrder.indexOf(a.bucket) - bucketOrder.indexOf(b.bucket) || a.name.localeCompare(b.name, 'pt-BR'));
    const bucketLabel: Record<string, string> = { emDia: 'Em Dia', alerta: 'Alerta', critico: 'Crítico', inativo: 'Inativo' };
    srow = addSectionHeader(clientsSheet, srow, 8, 'CLIENTES POR STATUS DE ATIVIDADE', BRAND.danger, theme);
    srow = addSimpleTable(
      clientsSheet, srow, ['Cliente', 'Cidade', 'Status'],
      sortedHealthClients.map((c) => [c.name, c.city, bucketLabel[c.bucket] || c.bucket]),
      { theme, headerColor: BRAND.danger, emptyLabel: 'Nenhum cliente cadastrado.' }
    ).nextRow;
  }

  srow = addSectionHeader(clientsSheet, srow, 8, 'EMPRESAS REPRESENTADAS', BRAND.primary, theme);
  const companyClientMap = new Map<string, Map<string, number>>();
  data.orders.forEach((o) => {
    const key = (o.category || 'Outros').trim().toUpperCase();
    if (!companyClientMap.has(key)) companyClientMap.set(key, new Map());
    const m = companyClientMap.get(key)!;
    m.set(o.clientName, (m.get(o.clientName) || 0) + o.value);
  });
  const companiesForSheet = analytics?.byCompany?.length ? analytics.byCompany : data.byCompany.map((c) => ({ ...c, share: 0 }));

  if (companiesForSheet.length === 0) {
    clientsSheet.mergeCells(srow, 1, srow, 8);
    const empty = clientsSheet.getCell(srow, 1);
    empty.value = 'Nenhum pedido registrado neste período.';
    empty.font = { italic: true, size: 10, color: { argb: BRAND.slateLight } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    clientsSheet.getRow(srow).height = 20;
    srow++;
  }

  companiesForSheet.forEach((company) => {
    clientsSheet.mergeCells(srow, 1, srow, 6);
    clientsSheet.mergeCells(srow, 7, srow, 8);
    const nameCell = clientsSheet.getCell(srow, 1);
    const revenueCell = clientsSheet.getCell(srow, 7);
    nameCell.value = company.name;
    nameCell.font = { bold: true, size: 11, color: { argb: BRAND.white } };
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    revenueCell.value = company.revenue;
    revenueCell.numFmt = CURRENCY_FMT;
    revenueCell.font = { bold: true, size: 11, color: { argb: BRAND.white } };
    revenueCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    [nameCell, revenueCell].forEach((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.primary } }; });
    clientsSheet.getRow(srow).height = 22;
    srow++;

    clientsSheet.mergeCells(srow, 1, srow, 6);
    clientsSheet.mergeCells(srow, 7, srow, 8);
    const clientHeaderCell = clientsSheet.getCell(srow, 1);
    const valueHeaderCell = clientsSheet.getCell(srow, 7);
    clientHeaderCell.value = 'Cliente';
    valueHeaderCell.value = 'Valor';
    [clientHeaderCell, valueHeaderCell].forEach((c) => {
      c.font = { bold: true, size: 9, color: { argb: BRAND.slate } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
      c.border = border;
    });
    clientHeaderCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 };
    valueHeaderCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    clientsSheet.getRow(srow).height = 16;
    srow++;

    const clientsMap = companyClientMap.get(company.name.trim().toUpperCase()) || new Map();
    const clientEntries = Array.from(clientsMap.entries()).sort((a, b) => b[1] - a[1]);
    clientEntries.forEach(([clientName, value], idx) => {
      clientsSheet.mergeCells(srow, 1, srow, 6);
      clientsSheet.mergeCells(srow, 7, srow, 8);
      const nameC = clientsSheet.getCell(srow, 1);
      const valueC = clientsSheet.getCell(srow, 7);
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
      clientsSheet.getRow(srow).height = 16;
      srow++;
    });
    srow++; // espaço entre empresas
  });
  srow++;

  if (analytics?.topCities) {
    srow = addSectionHeader(clientsSheet, srow, 8, 'RECEITA POR CIDADE', BRAND.accentPurple, theme);
    addSimpleTable(
      clientsSheet, srow, ['Cidade', 'Receita', 'Clientes', '% do Mês'],
      analytics.topCities.map((c) => [c.city, c.revenue, c.clients, c.share]),
      { theme, numFmtByCol: { 2: CURRENCY_FMT, 4: PERCENT_FMT }, dataBarCol: 2, headerColor: BRAND.accentPurple, emptyLabel: 'Nenhum pedido lançado neste período.' }
    );
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 4: DETALHAMENTO (pedidos + follow-ups + agenda do mês)
  // ═════════════════════════════════════════════════════════════════
  const detailSheet = workbook.addWorksheet('📋 Detalhamento', { views: [{ showGridLines: false }] });
  for (let i = 1; i <= 7; i++) detailSheet.getColumn(i).width = 18;
  let drow = 1;

  drow = addSectionHeader(detailSheet, drow, 7, 'PEDIDOS DO MÊS', BRAND.primary, theme);
  const ordersTable = addSimpleTable(
    detailSheet, drow, ['Cliente', 'Empresa', 'Valor', 'Comissão', 'Data'],
    data.orders.map((o) => [o.clientName, o.category, o.value, o.commission, new Date(o.createdAt).toLocaleDateString('pt-BR')]),
    { theme, numFmtByCol: { 3: CURRENCY_FMT, 4: CURRENCY_FMT }, headerColor: BRAND.primary, emptyLabel: 'Nenhum pedido lançado neste período.' }
  );
  if (data.orders.length > 0) autoFilter(detailSheet, drow, 5, ordersTable.dataEnd);
  drow = ordersTable.nextRow;

  drow = addSectionHeader(detailSheet, drow, 7, 'FOLLOW-UPS DO MÊS', BRAND.accentIndigo, theme);
  drow = addSimpleTable(
    detailSheet, drow, ['Cliente', 'Data', 'Canal', 'Resultado', 'Observações'],
    data.followups.map((f) => [f.clientName, new Date(f.contactDate).toLocaleDateString('pt-BR'), f.method, OUTCOME_LABELS[f.outcome] || f.outcome, f.notes || '—']),
    { theme, headerColor: BRAND.accentIndigo, emptyLabel: 'Nenhum follow-up registrado neste período.' }
  ).nextRow;

  drow = addSectionHeader(detailSheet, drow, 7, 'AGENDA DO MÊS', BRAND.ink, theme);
  if (data.appointments.length > 0) {
    writeCalendarGrid(detailSheet, data, drow, theme);
  } else {
    detailSheet.mergeCells(drow, 1, drow, 7);
    const empty = detailSheet.getCell(drow, 1);
    empty.value = 'Nenhum compromisso registrado neste período.';
    empty.font = { italic: true, size: 10, color: { argb: BRAND.slateLight } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    detailSheet.getRow(drow).height = 20;
  }

  summarySheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

function triggerDownload(blob: Blob, filename: string) {
  // No app, saveFile abre a folha de compartilhamento do Android para o
  // usuário escolher o destino; no site continua o download do navegador.
  void saveFile(blob, filename);
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
