// Só os TIPOS entram no bundle — o runtime (~940 kB) é carregado sob demanda
// dentro de generateExcelReport, no clique de exportar.
import type ExcelJS from 'exceljs';
import { supabase } from './supabase';
import { FollowupLog } from './followupService';

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

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BRAND.border } },
  bottom: { style: 'thin', color: { argb: BRAND.border } },
  left: { style: 'thin', color: { argb: BRAND.border } },
  right: { style: 'thin', color: { argb: BRAND.border } },
};

function addKpiTile(
  sheet: ExcelJS.Worksheet,
  range: string,
  label: string,
  value: string,
  bg: string,
  sub?: string
) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  const richText: ExcelJS.RichText[] = [
    { text: `${label}\n`, font: { size: 9, bold: true, color: { argb: BRAND.white } } },
    { text: value, font: { size: 18, bold: true, color: { argb: BRAND.white } } },
  ];
  if (sub) richText.push({ text: `\n${sub}`, font: { size: 8, color: { argb: BRAND.white } } });
  cell.value = { richText };
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
}

/** Desenha o calendário do mês (7 colunas, DOM–SÁB) a partir de `startRow`,
 *  mostrando até 3 compromissos por dia. Retorna a próxima linha livre. */
function writeCalendarGrid(sheet: ExcelJS.Worksheet, data: ReportData, startRow: number): number {
  const year = data.month.getFullYear();
  const month = data.month.getMonth() + 1;

  const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const headerRow = sheet.getRow(startRow);
  dayNames.forEach((day, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = day;
    cell.border = thinBorder;
    cell.font = { bold: true, color: { argb: BRAND.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.dark } };
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
      cell.border = thinBorder;
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
          richText.push({ text: `\n(+${appointments.length - 3} mais)`, font: { size: 7, italic: true, color: { argb: BRAND.gray } } });
        }
        cell.value = { richText };
        cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: appointments.length > 0 ? 'FFFEF3C7' : BRAND.white } };
        dayCounter++;
      }
    }
    currentRow++;
    if (dayCounter > daysInMonth) break;
  }
  return currentRow;
}

export async function generateExcelReport(
  userId: string,
  year: number,
  month: number,
  commissions: CommissionMap = {}
): Promise<Buffer> {
  const [{ default: Excel }, data] = await Promise.all([
    import('exceljs'),
    fetchReportData(userId, year, month, commissions),
  ]);
  const workbook = new Excel.Workbook();
  workbook.creator = 'Represente-Se!';
  workbook.created = new Date();

  const monthName = data.month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const sheet = workbook.addWorksheet('Relatório', { views: [{ showGridLines: false }] });
  sheet.columns = Array.from({ length: 7 }, () => ({ width: 18 }));

  // Banner de marca
  sheet.mergeCells('A1:G1');
  const title = sheet.getCell('A1');
  title.value = 'REPRESENTE-SE!';
  title.font = { bold: true, size: 20, color: { argb: BRAND.white } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.primary } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 40;

  sheet.mergeCells('A2:G2');
  const subtitle = sheet.getCell('A2');
  subtitle.value = `Relatório Mensal de Vendas — ${monthNameCap}`;
  subtitle.font = { bold: true, size: 12, color: { argb: BRAND.dark } };
  subtitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(2).height = 22;

  sheet.mergeCells('A3:G3');
  const generated = sheet.getCell('A3');
  generated.value = `Gerado em ${new Date().toLocaleString('pt-BR')}`;
  generated.font = { size: 9, italic: true, color: { argb: BRAND.gray } };
  generated.alignment = { horizontal: 'center' };
  sheet.getRow(3).height = 16;
  sheet.getRow(4).height = 8;

  // KPIs — grade 2x2 nas colunas A–D
  const avgCommissionPct = data.summary.totalRevenue > 0 ? (data.summary.totalCommission / data.summary.totalRevenue) * 100 : 0;
  const activeClientsThisMonth = new Set(data.orders.map((o) => o.clientId)).size;

  sheet.getRow(5).height = 52;
  sheet.getRow(6).height = 6;
  addKpiTile(sheet, 'A5:B6', 'RECEITA TOTAL', BRL(data.summary.totalRevenue), BRAND.primary);
  addKpiTile(sheet, 'C5:D6', 'COMISSÃO', BRL(data.summary.totalCommission), BRAND.primaryDark, `Média de ${avgCommissionPct.toFixed(1)}%`);

  sheet.getRow(7).height = 52;
  sheet.getRow(8).height = 6;
  addKpiTile(sheet, 'A7:B8', 'TICKET MÉDIO', BRL(data.summary.averageOrderValue), BRAND.dark);
  addKpiTile(sheet, 'C7:D8', 'CLIENTES ATIVOS NO MÊS', String(activeClientsThisMonth), BRAND.darkAlt);

  sheet.getRow(9).height = 12;
  let row = 10;

  // Seção: Empresas Representadas
  sheet.mergeCells(`A${row}:G${row}`);
  const empresasHeader = sheet.getCell(`A${row}`);
  empresasHeader.value = 'EMPRESAS REPRESENTADAS';
  empresasHeader.font = { bold: true, size: 12, color: { argb: BRAND.white } };
  empresasHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.dark } };
  empresasHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(row).height = 24;
  row++;

  const companyClientMap = new Map<string, Map<string, number>>();
  data.orders.forEach((o) => {
    const key = (o.category || 'Outros').trim().toUpperCase();
    if (!companyClientMap.has(key)) companyClientMap.set(key, new Map());
    const m = companyClientMap.get(key)!;
    m.set(o.clientName, (m.get(o.clientName) || 0) + o.value);
  });

  if (data.byCompany.length === 0) {
    sheet.mergeCells(`A${row}:G${row}`);
    const empty = sheet.getCell(`A${row}`);
    empty.value = 'Nenhum pedido registrado neste período.';
    empty.font = { italic: true, size: 10, color: { argb: BRAND.gray } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(row).height = 20;
    row++;
  }

  data.byCompany.forEach((company) => {
    sheet.mergeCells(`A${row}:E${row}`);
    sheet.mergeCells(`F${row}:G${row}`);
    const nameCell = sheet.getCell(`A${row}`);
    const revenueCell = sheet.getCell(`F${row}`);
    nameCell.value = company.name;
    nameCell.font = { bold: true, size: 11, color: { argb: BRAND.white } };
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    revenueCell.value = company.revenue;
    revenueCell.numFmt = CURRENCY_FMT;
    revenueCell.font = { bold: true, size: 11, color: { argb: BRAND.white } };
    revenueCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    [nameCell, revenueCell].forEach((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.primaryDark } };
    });
    sheet.getRow(row).height = 22;
    row++;

    sheet.mergeCells(`A${row}:E${row}`);
    sheet.mergeCells(`F${row}:G${row}`);
    const clientHeaderCell = sheet.getCell(`A${row}`);
    const valueHeaderCell = sheet.getCell(`F${row}`);
    clientHeaderCell.value = 'Cliente';
    valueHeaderCell.value = 'Valor';
    [clientHeaderCell, valueHeaderCell].forEach((c) => {
      c.font = { bold: true, size: 9, color: { argb: BRAND.gray } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
      c.border = thinBorder;
    });
    clientHeaderCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 };
    valueHeaderCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    sheet.getRow(row).height = 16;
    row++;

    const clientsMap = companyClientMap.get(company.name.trim().toUpperCase()) || new Map();
    const clientEntries = Array.from(clientsMap.entries()).sort((a, b) => b[1] - a[1]);
    clientEntries.forEach(([clientName, value], idx) => {
      sheet.mergeCells(`A${row}:E${row}`);
      sheet.mergeCells(`F${row}:G${row}`);
      const nameC = sheet.getCell(`A${row}`);
      const valueC = sheet.getCell(`F${row}`);
      nameC.value = clientName;
      nameC.font = { size: 10, color: { argb: BRAND.dark } };
      nameC.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 };
      valueC.value = value;
      valueC.numFmt = CURRENCY_FMT;
      valueC.font = { size: 10, color: { argb: BRAND.dark } };
      valueC.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
      const zebra = idx % 2 === 1;
      [nameC, valueC].forEach((c) => {
        c.border = thinBorder;
        if (zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
      });
      sheet.getRow(row).height = 16;
      row++;
    });

    row++; // espaço entre empresas
  });

  // Seção: Agenda do Mês
  sheet.getRow(row).height = 10;
  row++;
  sheet.mergeCells(`A${row}:G${row}`);
  const agendaHeader = sheet.getCell(`A${row}`);
  agendaHeader.value = `AGENDA DO MÊS — ${monthNameCap}`;
  agendaHeader.font = { bold: true, size: 12, color: { argb: BRAND.white } };
  agendaHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.dark } };
  agendaHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(row).height = 24;
  row++;

  if (data.appointments.length > 0) {
    row = writeCalendarGrid(sheet, data, row);
  } else {
    sheet.mergeCells(`A${row}:G${row}`);
    const empty = sheet.getCell(`A${row}`);
    empty.value = 'Nenhum compromisso registrado neste período.';
    empty.font = { italic: true, size: 10, color: { argb: BRAND.gray } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(row).height = 20;
    row++;
  }

  sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];

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
