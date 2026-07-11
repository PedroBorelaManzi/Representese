import ExcelJS from 'exceljs';
import { supabase } from './supabase';
import { getMethodLabel, getOutcomeLabel, FollowupLog } from './followupService';

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

const BRAND = {
  primary: 'FF059669', // emerald-600
  primaryDark: 'FF047857', // emerald-700
  tint: 'FFECFDF5', // emerald-50
  dark: 'FF0F172A', // slate-900
  darkAlt: 'FF334155', // slate-700
  border: 'FFE2E8F0', // slate-200
  zebra: 'FFF8FAFC', // slate-50
  white: 'FFFFFFFF',
  gray: 'FF64748B', // slate-500
};

const CURRENCY_FMT = '"R$" #,##0.00';
const PERCENT_FMT = '0.00"%"';
const DATE_FMT = 'dd/mm/yyyy';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BRAND.border } },
  bottom: { style: 'thin', color: { argb: BRAND.border } },
  left: { style: 'thin', color: { argb: BRAND.border } },
  right: { style: 'thin', color: { argb: BRAND.border } },
};

type ReportColumn = {
  header: string;
  key: string;
  width: number;
  numFmt?: string;
  align?: 'left' | 'right' | 'center';
};

/** Cria uma aba com banner de marca (título + subtítulo), cabeçalho escuro,
 *  zebra striping, bordas, congelamento do cabeçalho e autofiltro — mesmo
 *  visual em todas as abas do relatório. */
function buildSheet(
  workbook: ExcelJS.Workbook,
  opts: {
    name: string;
    subtitle: string;
    columns: ReportColumn[];
    rows: Record<string, unknown>[];
    totalsRow?: Record<string, unknown>;
  }
): ExcelJS.Worksheet {
  const { name, subtitle, columns, rows, totalsRow } = opts;
  const colCount = columns.length;
  const sheet = workbook.addWorksheet(name, { views: [{ showGridLines: false }] });

  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));

  sheet.mergeCells(1, 1, 1, colCount);
  const title = sheet.getCell(1, 1);
  title.value = 'REPRESENTE-SE!';
  title.font = { bold: true, size: 16, color: { argb: BRAND.white } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.primary } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, colCount);
  const sub = sheet.getCell(2, 1);
  sub.value = subtitle;
  sub.font = { italic: true, size: 10, color: { argb: BRAND.primaryDark } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.tint } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 18;

  const headerRowNum = 3;
  const headerRow = sheet.getRow(headerRowNum);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.border = thinBorder;
  });
  headerRow.font = { bold: true, color: { argb: BRAND.white } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.dark } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 20;

  rows.forEach((r, idx) => {
    const zebra = idx % 2 === 1;
    const row = sheet.getRow(headerRowNum + 1 + idx);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = r[c.key] as ExcelJS.CellValue;
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.alignment = { horizontal: c.align || 'left', vertical: 'middle' };
      cell.border = thinBorder;
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
    });
  });

  if (totalsRow) {
    const row = sheet.getRow(headerRowNum + 1 + rows.length);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = totalsRow[c.key] as ExcelJS.CellValue;
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.alignment = { horizontal: c.align || 'left', vertical: 'middle' };
      cell.font = { bold: true };
      cell.border = { ...thinBorder, top: { style: 'medium', color: { argb: BRAND.dark } } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.tint } };
    });
  }

  sheet.views = [{ state: 'frozen', ySplit: headerRowNum, showGridLines: false }];
  sheet.autoFilter = { from: { row: headerRowNum, column: 1 }, to: { row: headerRowNum, column: colCount } };

  return sheet;
}

function addKpiTile(
  sheet: ExcelJS.Worksheet,
  range: string,
  label: string,
  value: string,
  bg: string
) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  cell.value = {
    richText: [
      { text: `${label}\n`, font: { size: 9, bold: true, color: { argb: BRAND.white } } },
      { text: value, font: { size: 18, bold: true, color: { argb: BRAND.white } } },
    ],
  };
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
}

function buildCapaSheet(workbook: ExcelJS.Workbook, data: ReportData, monthName: string) {
  const capa = workbook.addWorksheet('Capa', { views: [{ showGridLines: false }] });
  capa.columns = [{ key: 'a', width: 26 }, { key: 'b', width: 26 }, { key: 'c', width: 26 }, { key: 'd', width: 26 }];

  capa.mergeCells('A1:D1');
  const title = capa.getCell('A1');
  title.value = 'REPRESENTE-SE!';
  title.font = { bold: true, size: 20, color: { argb: BRAND.white } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.primary } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  capa.getRow(1).height = 40;

  capa.mergeCells('A2:D2');
  const subtitle = capa.getCell('A2');
  subtitle.value = `Relatório Mensal de Vendas — ${monthName}`;
  subtitle.font = { bold: true, size: 12, color: { argb: BRAND.dark } };
  subtitle.alignment = { vertical: 'middle', horizontal: 'center' };
  capa.getRow(2).height = 22;

  capa.mergeCells('A3:D3');
  const generated = capa.getCell('A3');
  generated.value = `Gerado em ${new Date().toLocaleString('pt-BR')}`;
  generated.font = { size: 9, italic: true, color: { argb: BRAND.gray } };
  generated.alignment = { horizontal: 'center' };
  capa.getRow(3).height = 16;
  capa.getRow(4).height = 6;

  capa.getRow(5).height = 50;
  capa.getRow(6).height = 6;
  addKpiTile(capa, 'A5:B6', 'RECEITA TOTAL', BRL(data.summary.totalRevenue), BRAND.primary);
  addKpiTile(capa, 'C5:D6', 'COMISSÃO ESTIMADA', BRL(data.summary.totalCommission), BRAND.primaryDark);

  capa.getRow(7).height = 50;
  capa.getRow(8).height = 6;
  addKpiTile(capa, 'A7:B8', 'PEDIDOS NO MÊS', String(data.summary.ordersCount), BRAND.dark);
  addKpiTile(capa, 'C7:D8', 'TICKET MÉDIO', BRL(data.summary.averageOrderValue), BRAND.darkAlt);

  capa.getRow(9).height = 50;
  capa.getRow(10).height = 6;
  addKpiTile(capa, 'A9:B10', 'CLIENTES ATIVOS / TOTAL', `${data.summary.activeClients} / ${data.summary.totalClients}`, BRAND.primary);
  addKpiTile(capa, 'C9:D10', 'COMPROMISSOS / FOLLOW-UPS', `${data.summary.appointmentsCount} / ${data.followups.length}`, BRAND.primaryDark);

  capa.getRow(11).height = 10;

  capa.mergeCells('A12:D12');
  const sectionHeader = capa.getCell('A12');
  sectionHeader.value = 'INDICADORES DETALHADOS';
  sectionHeader.font = { bold: true, size: 11, color: { argb: BRAND.white } };
  sectionHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.dark } };
  sectionHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  capa.getRow(12).height = 20;

  const detailRows: [string, string][] = [
    ['Período', monthName],
    ['Receita Total', BRL(data.summary.totalRevenue)],
    ['Comissão Estimada', BRL(data.summary.totalCommission)],
    ['Total de Pedidos', String(data.summary.ordersCount)],
    ['Ticket Médio', BRL(data.summary.averageOrderValue)],
    ['Total de Clientes', String(data.summary.totalClients)],
    ['Clientes Ativos', String(data.summary.activeClients)],
    ['Compromissos no Período', String(data.summary.appointmentsCount)],
    ['Follow-ups Registrados', String(data.followups.length)],
  ];
  detailRows.forEach(([metric, value], idx) => {
    const rowNum = 13 + idx;
    const zebra = idx % 2 === 1;
    capa.mergeCells(`A${rowNum}:B${rowNum}`);
    capa.mergeCells(`C${rowNum}:D${rowNum}`);
    const metricCell = capa.getCell(`A${rowNum}`);
    const valueCell = capa.getCell(`C${rowNum}`);
    metricCell.value = metric;
    metricCell.font = { bold: true, size: 10, color: { argb: BRAND.dark } };
    valueCell.value = value;
    valueCell.font = { size: 10, color: { argb: BRAND.dark } };
    valueCell.alignment = { horizontal: 'right' };
    [metricCell, valueCell].forEach((cell) => {
      cell.border = thinBorder;
      cell.alignment = { ...cell.alignment, vertical: 'middle', indent: cell === metricCell ? 1 : 0 };
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
    });
  });

  capa.views = [{ showGridLines: false }];
}

export async function generateExcelReport(
  userId: string,
  year: number,
  month: number,
  commissions: CommissionMap = {}
): Promise<Buffer> {
  const data = await fetchReportData(userId, year, month, commissions);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Represente-Se!';
  workbook.created = new Date();

  const monthName = data.month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  buildCapaSheet(workbook, data, monthNameCap);

  buildSheet(workbook, {
    name: 'Pedidos',
    subtitle: `Pedidos do período — ${monthNameCap}`,
    columns: [
      { header: 'Cliente', key: 'clientName', width: 28 },
      { header: 'Empresa', key: 'category', width: 22 },
      { header: 'Valor', key: 'value', width: 16, numFmt: CURRENCY_FMT, align: 'right' },
      { header: 'Comissão', key: 'commission', width: 16, numFmt: CURRENCY_FMT, align: 'right' },
      { header: 'Data', key: 'createdAt', width: 14, numFmt: DATE_FMT, align: 'center' },
    ],
    rows: data.orders.map((o) => ({
      clientName: o.clientName,
      category: o.category,
      value: o.value,
      commission: o.commission,
      createdAt: new Date(o.createdAt),
    })),
    totalsRow: data.orders.length
      ? { clientName: '', category: 'TOTAL', value: data.summary.totalRevenue, commission: data.summary.totalCommission, createdAt: '' }
      : undefined,
  });

  buildSheet(workbook, {
    name: 'Comissões',
    subtitle: `Comissões por empresa representada — ${monthNameCap}`,
    columns: [
      { header: 'Empresa', key: 'name', width: 28 },
      { header: 'Receita', key: 'revenue', width: 18, numFmt: CURRENCY_FMT, align: 'right' },
      { header: '% Comissão', key: 'pct', width: 14, numFmt: PERCENT_FMT, align: 'center' },
      { header: 'Comissão', key: 'commission', width: 18, numFmt: CURRENCY_FMT, align: 'right' },
    ],
    rows: data.byCompany.map((c) => ({
      name: c.name,
      revenue: c.revenue,
      pct: c.commissionPct,
      commission: c.commissionValue,
    })),
    totalsRow: data.byCompany.length
      ? { name: 'TOTAL', revenue: data.summary.totalRevenue, pct: '', commission: data.summary.totalCommission }
      : undefined,
  });

  const clientsSheet = buildSheet(workbook, {
    name: 'Clientes',
    subtitle: `Carteira de clientes — ${monthNameCap}`,
    columns: [
      { header: 'Nome', key: 'name', width: 32 },
      { header: 'Cidade', key: 'city', width: 20 },
      { header: 'Status', key: 'status', width: 14, align: 'center' },
      { header: 'Último Contato', key: 'lastContact', width: 16, align: 'center' },
    ],
    rows: data.clients.map((c) => ({
      name: c.name,
      city: c.city,
      status: c.status,
      lastContact: c.lastContact ? new Date(c.lastContact).toLocaleDateString('pt-BR') : 'Nunca',
    })),
  });
  data.clients.forEach((c, idx) => {
    const cell = clientsSheet.getCell(4 + idx, 3);
    if (c.status === 'Ativo') {
      cell.font = { bold: true, color: { argb: BRAND.primaryDark } };
    } else if (c.status === 'Inativo') {
      cell.font = { color: { argb: BRAND.gray } };
    }
  });

  if (data.appointments.length > 0) {
    buildSheet(workbook, {
      name: 'Compromissos',
      subtitle: `Agenda do período — ${monthNameCap}`,
      columns: [
        { header: 'Título', key: 'title', width: 28 },
        { header: 'Cliente', key: 'clientName', width: 28 },
        { header: 'Data', key: 'date', width: 14, numFmt: DATE_FMT, align: 'center' },
        { header: 'Horário', key: 'time', width: 14, align: 'center' },
      ],
      rows: data.appointments.map((a) => ({
        title: a.title,
        clientName: a.clientName,
        date: new Date(`${a.date}T12:00:00`),
        time: a.time,
      })),
    });
  }

  if (data.followups.length > 0) {
    buildSheet(workbook, {
      name: 'Follow-ups',
      subtitle: `Histórico de follow-ups — ${monthNameCap}`,
      columns: [
        { header: 'Data', key: 'date', width: 14, numFmt: DATE_FMT, align: 'center' },
        { header: 'Cliente', key: 'clientName', width: 28 },
        { header: 'Método', key: 'method', width: 16 },
        { header: 'Resultado', key: 'outcome', width: 16 },
        { header: 'Notas', key: 'notes', width: 44 },
        { header: 'Próximo Contato', key: 'next', width: 16, align: 'center' },
      ],
      rows: data.followups.map((f) => ({
        date: new Date(`${f.contactDate}T12:00:00`),
        clientName: f.clientName,
        method: getMethodLabel(f.method),
        outcome: getOutcomeLabel(f.outcome),
        notes: f.notes,
        next: f.nextFollowup ? new Date(`${f.nextFollowup}T12:00:00`).toLocaleDateString('pt-BR') : '—',
      })),
    });
  }

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
  commissions: CommissionMap = {}
) {
  const buffer = await generateExcelReport(userId, year, month, commissions);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, reportFilename(year, month, 'xlsx'));
}

export async function generateCSVReport(
  userId: string,
  year: number,
  month: number,
  commissions: CommissionMap = {}
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
  csv += `Clientes Ativos,${data.summary.activeClients}\n\n`;

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
  commissions: CommissionMap = {}
) {
  const csv = await generateCSVReport(userId, year, month, commissions);
  // BOM para o Excel abrir acentos corretamente
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, reportFilename(year, month, 'csv'));
}
