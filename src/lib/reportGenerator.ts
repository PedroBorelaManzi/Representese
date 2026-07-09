import ExcelJS from 'exceljs';
import { supabase } from './supabase';

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
    createdAt: string;
    status: string;
  }>;
  appointments: Array<{
    id: string;
    title: string;
    clientName: string;
    date: string;
    time: string;
  }>;
  summary: {
    totalClients: number;
    activeClients: number;
    totalRevenue: number;
    averageOrderValue: number;
    ordersCount: number;
    appointmentsCount: number;
  };
}

async function fetchReportData(userId: string, year: number, month: number): Promise<ReportData> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const [clientsRes, ordersRes, appointmentsRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, city, last_contact, status')
      .eq('user_id', userId),
    supabase
      .from('orders')
      .select('id, client_id, category, value, created_at, status, clients(name)')
      .eq('user_id', userId)
      .gte('created_at', startDateStr)
      .lte('created_at', endDateStr),
    supabase
      .from('appointments')
      .select('id, title, date, time, clients(name)')
      .eq('user_id', userId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
  ]);

  const clients = (clientsRes.data || []).map(c => ({
    id: c.id,
    name: c.name,
    city: c.city || 'Não informado',
    lastContact: c.last_contact,
    status: c.status,
  }));

  const orders = (ordersRes.data || []).map((o: any) => ({
    id: o.id,
    clientId: o.client_id,
    clientName: o.clients?.name || 'Cliente desconhecido',
    category: o.category,
    value: o.value || 0,
    createdAt: o.created_at,
    status: o.status,
  }));

  const appointments = (appointmentsRes.data || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    clientName: a.clients?.name || 'Cliente desconhecido',
    date: a.date,
    time: a.time,
  }));

  const totalRevenue = orders.reduce((sum, o) => sum + o.value, 0);
  const activeClients = clients.filter(c => c.status === 'Ativo').length;

  return {
    month: startDate,
    userId,
    clients,
    orders,
    appointments,
    summary: {
      totalClients: clients.length,
      activeClients,
      totalRevenue,
      averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      ordersCount: orders.length,
      appointmentsCount: appointments.length,
    }
  };
}

export async function generateExcelReport(userId: string, year: number, month: number): Promise<Buffer> {
  const data = await fetchReportData(userId, year, month);
  const workbook = new ExcelJS.Workbook();

  // Summary sheet
  const summarySheet = workbook.addWorksheet('Resumo');
  summarySheet.columns = [
    { header: 'Métrica', key: 'metric', width: 30 },
    { header: 'Valor', key: 'value', width: 20 }
  ];

  const monthName = data.month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  summarySheet.addRows([
    { metric: 'Período', value: monthName },
    { metric: 'Total de Clientes', value: data.summary.totalClients },
    { metric: 'Clientes Ativos', value: data.summary.activeClients },
    { metric: 'Total de Pedidos', value: data.summary.ordersCount },
    { metric: 'Receita Total', value: `R$ ${data.summary.totalRevenue.toFixed(2)}` },
    { metric: 'Ticket Médio', value: `R$ ${data.summary.averageOrderValue.toFixed(2)}` },
    { metric: 'Compromissos Realizados', value: data.summary.appointmentsCount }
  ]);

  // Format summary sheet
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

  // Clients sheet
  const clientsSheet = workbook.addWorksheet('Clientes');
  clientsSheet.columns = [
    { header: 'Nome', key: 'name', width: 30 },
    { header: 'Cidade', key: 'city', width: 20 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Último Contato', key: 'lastContact', width: 15 }
  ];

  clientsSheet.addRows(data.clients.map(c => ({
    name: c.name,
    city: c.city,
    status: c.status === 'Ativo' ? 'Ativo' : 'Inativo',
    lastContact: c.lastContact ? new Date(c.lastContact).toLocaleDateString('pt-BR') : 'Nunca'
  })));

  clientsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  clientsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

  // Orders sheet
  const ordersSheet = workbook.addWorksheet('Pedidos');
  ordersSheet.columns = [
    { header: 'Cliente', key: 'clientName', width: 25 },
    { header: 'Categoria', key: 'category', width: 20 },
    { header: 'Valor', key: 'value', width: 15 },
    { header: 'Data', key: 'createdAt', width: 15 },
    { header: 'Status', key: 'status', width: 15 }
  ];

  ordersSheet.addRows(data.orders.map(o => ({
    clientName: o.clientName,
    category: o.category,
    value: `R$ ${o.value.toFixed(2)}`,
    createdAt: new Date(o.createdAt).toLocaleDateString('pt-BR'),
    status: o.status
  })));

  ordersSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ordersSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

  // Format value column as currency
  ordersSheet.getColumn('value').alignment = { horizontal: 'right' };

  // Appointments sheet
  if (data.appointments.length > 0) {
    const appointmentsSheet = workbook.addWorksheet('Compromissos');
    appointmentsSheet.columns = [
      { header: 'Título', key: 'title', width: 25 },
      { header: 'Cliente', key: 'clientName', width: 25 },
      { header: 'Data', key: 'date', width: 15 },
      { header: 'Horário', key: 'time', width: 12 }
    ];

    appointmentsSheet.addRows(data.appointments.map(a => ({
      title: a.title,
      clientName: a.clientName,
      date: new Date(a.date).toLocaleDateString('pt-BR'),
      time: a.time
    })));

    appointmentsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    appointmentsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

export async function downloadExcelReport(userId: string, year: number, month: number) {
  try {
    const buffer = await generateExcelReport(userId, year, month);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const monthName = new Date(year, month - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    link.download = `Relatório_${monthName.replace(' ', '_')}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  }
}

export async function generateCSVReport(userId: string, year: number, month: number): Promise<string> {
  const data = await fetchReportData(userId, year, month);

  let csv = 'RESUMO MENSAL\n';
  csv += `Período,${data.month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}\n`;
  csv += `Total de Clientes,${data.summary.totalClients}\n`;
  csv += `Clientes Ativos,${data.summary.activeClients}\n`;
  csv += `Total de Pedidos,${data.summary.ordersCount}\n`;
  csv += `Receita Total,R$ ${data.summary.totalRevenue.toFixed(2)}\n`;
  csv += `Ticket Médio,R$ ${data.summary.averageOrderValue.toFixed(2)}\n\n`;

  csv += 'CLIENTES\n';
  csv += 'Nome,Cidade,Status,Último Contato\n';
  data.clients.forEach(c => {
    const lastContact = c.lastContact ? new Date(c.lastContact).toLocaleDateString('pt-BR') : 'Nunca';
    csv += `"${c.name}","${c.city}","${c.status}","${lastContact}"\n`;
  });

  csv += '\nPEDIDOS\n';
  csv += 'Cliente,Categoria,Valor,Data,Status\n';
  data.orders.forEach(o => {
    csv += `"${o.clientName}","${o.category}","R$ ${o.value.toFixed(2)}","${new Date(o.createdAt).toLocaleDateString('pt-BR')}","${o.status}"\n`;
  });

  return csv;
}

export async function downloadCSVReport(userId: string, year: number, month: number) {
  try {
    const csv = await generateCSVReport(userId, year, month);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const monthName = new Date(year, month - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    link.download = `Relatório_${monthName.replace(' ', '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating CSV report:', error);
    throw error;
  }
}
