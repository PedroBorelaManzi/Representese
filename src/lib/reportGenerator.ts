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

function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
}

export async function generateExcelReport(
  userId: string,
  year: number,
  month: number,
  commissions: CommissionMap = {}
): Promise<Buffer> {
  const data = await fetchReportData(userId, year, month, commissions);
  const workbook = new ExcelJS.Workbook();

  const monthName = data.month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Resumo
  const summarySheet = workbook.addWorksheet('Resumo');
  summarySheet.columns = [
    { header: 'Métrica', key: 'metric', width: 32 },
    { header: 'Valor', key: 'value', width: 24 },
  ];
  summarySheet.addRows([
    { metric: 'Período', value: monthName },
    { metric: 'Receita Total', value: BRL(data.summary.totalRevenue) },
    { metric: 'Comissão Estimada', value: BRL(data.summary.totalCommission) },
    { metric: 'Total de Pedidos', value: data.summary.ordersCount },
    { metric: 'Ticket Médio', value: BRL(data.summary.averageOrderValue) },
    { metric: 'Total de Clientes', value: data.summary.totalClients },
    { metric: 'Clientes Ativos', value: data.summary.activeClients },
    { metric: 'Compromissos no Período', value: data.summary.appointmentsCount },
    { metric: 'Follow-ups Registrados', value: data.followups.length },
  ]);
  styleHeader(summarySheet);

  // Pedidos
  const ordersSheet = workbook.addWorksheet('Pedidos');
  ordersSheet.columns = [
    { header: 'Cliente', key: 'clientName', width: 28 },
    { header: 'Empresa', key: 'category', width: 22 },
    { header: 'Valor', key: 'value', width: 16 },
    { header: 'Comissão', key: 'commission', width: 16 },
    { header: 'Data', key: 'createdAt', width: 14 },
  ];
  ordersSheet.addRows(
    data.orders.map((o) => ({
      clientName: o.clientName,
      category: o.category,
      value: BRL(o.value),
      commission: BRL(o.commission),
      createdAt: new Date(o.createdAt).toLocaleDateString('pt-BR'),
    }))
  );
  styleHeader(ordersSheet);
  ordersSheet.getColumn('value').alignment = { horizontal: 'right' };
  ordersSheet.getColumn('commission').alignment = { horizontal: 'right' };

  // Comissões por empresa
  const commissionSheet = workbook.addWorksheet('Comissões');
  commissionSheet.columns = [
    { header: 'Empresa', key: 'name', width: 28 },
    { header: 'Receita', key: 'revenue', width: 18 },
    { header: '% Comissão', key: 'pct', width: 14 },
    { header: 'Comissão', key: 'commission', width: 18 },
  ];
  commissionSheet.addRows(
    data.byCompany.map((c) => ({
      name: c.name,
      revenue: BRL(c.revenue),
      pct: c.commissionPct > 0 ? `${c.commissionPct}%` : '—',
      commission: BRL(c.commissionValue),
    }))
  );
  commissionSheet.addRow({});
  commissionSheet.addRow({
    name: 'TOTAL',
    revenue: BRL(data.summary.totalRevenue),
    pct: '',
    commission: BRL(data.summary.totalCommission),
  });
  styleHeader(commissionSheet);
  commissionSheet.getColumn('revenue').alignment = { horizontal: 'right' };
  commissionSheet.getColumn('commission').alignment = { horizontal: 'right' };

  // Clientes
  const clientsSheet = workbook.addWorksheet('Clientes');
  clientsSheet.columns = [
    { header: 'Nome', key: 'name', width: 32 },
    { header: 'Cidade', key: 'city', width: 20 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Último Contato', key: 'lastContact', width: 16 },
  ];
  clientsSheet.addRows(
    data.clients.map((c) => ({
      name: c.name,
      city: c.city,
      status: c.status,
      lastContact: c.lastContact ? new Date(c.lastContact).toLocaleDateString('pt-BR') : 'Nunca',
    }))
  );
  styleHeader(clientsSheet);

  // Compromissos
  if (data.appointments.length > 0) {
    const appointmentsSheet = workbook.addWorksheet('Compromissos');
    appointmentsSheet.columns = [
      { header: 'Título', key: 'title', width: 28 },
      { header: 'Cliente', key: 'clientName', width: 28 },
      { header: 'Data', key: 'date', width: 14 },
      { header: 'Horário', key: 'time', width: 14 },
    ];
    appointmentsSheet.addRows(
      data.appointments.map((a) => ({
        title: a.title,
        clientName: a.clientName,
        date: new Date(`${a.date}T12:00:00`).toLocaleDateString('pt-BR'),
        time: a.time,
      }))
    );
    styleHeader(appointmentsSheet);
  }

  // Follow-ups
  if (data.followups.length > 0) {
    const followupSheet = workbook.addWorksheet('Follow-ups');
    followupSheet.columns = [
      { header: 'Data', key: 'date', width: 14 },
      { header: 'Cliente', key: 'clientName', width: 28 },
      { header: 'Método', key: 'method', width: 16 },
      { header: 'Resultado', key: 'outcome', width: 16 },
      { header: 'Notas', key: 'notes', width: 44 },
      { header: 'Próximo Contato', key: 'next', width: 16 },
    ];
    followupSheet.addRows(
      data.followups.map((f) => ({
        date: new Date(`${f.contactDate}T12:00:00`).toLocaleDateString('pt-BR'),
        clientName: f.clientName,
        method: getMethodLabel(f.method),
        outcome: getOutcomeLabel(f.outcome),
        notes: f.notes,
        next: f.nextFollowup ? new Date(`${f.nextFollowup}T12:00:00`).toLocaleDateString('pt-BR') : '—',
      }))
    );
    styleHeader(followupSheet);
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
