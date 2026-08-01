/* Gerador de relatórios de leads em Excel com formatação profissional.
   Cria abas para diferentes visões dos dados: lista completa, por status,
   por data de contato, com gráficos de resumo. */
import ExcelJS from 'exceljs';

export interface Lead {
  id: string;
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  status?: 'Ativo' | 'Alerta' | 'Crítico' | 'Inativo';
  last_contact?: string;
  faturamento?: Record<string, number>;
  notes?: string;
}

async function generateLeadsReport(leads: Lead[], userName: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = userName || 'Represente-Se';

  // ═════════════════════════════════════════════════════════════════
  // ABA 1: RESUMO EXECUTIVO
  // ═════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet('📊 Resumo');
  summarySheet.columns = [
    { header: 'Métrica', key: 'metric', width: 30 },
    { header: 'Valor', key: 'value', width: 20 },
  ];

  const statusCounts = {
    Ativo: leads.filter(l => l.status === 'Ativo').length,
    Alerta: leads.filter(l => l.status === 'Alerta').length,
    Crítico: leads.filter(l => l.status === 'Crítico').length,
    Inativo: leads.filter(l => l.status === 'Inativo').length,
  };

  const totalFaturamento = leads.reduce((sum, l) => {
    if (l.faturamento) {
      return sum + Object.values(l.faturamento).reduce((s, v) => s + v, 0);
    }
    return sum;
  }, 0);

  const data = [
    { metric: '📈 Total de Clientes', value: leads.length },
    { metric: '✅ Ativos', value: statusCounts.Ativo },
    { metric: '⚠️  Alerta', value: statusCounts.Alerta },
    { metric: '🔴 Crítico', value: statusCounts.Crítico },
    { metric: '⛔ Inativos', value: statusCounts.Inativo },
    { metric: '💰 Faturamento Total', value: `R$ ${totalFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { metric: '📅 Data do Relatório', value: new Date().toLocaleDateString('pt-BR') },
  ];

  summarySheet.addRows(data);

  // Formatar header
  summarySheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10b981' } };
  summarySheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Colorir linhas de resumo
  for (let i = 2; i <= data.length + 1; i++) {
    const row = summarySheet.getRow(i);
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F7' } };
    if (i % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 2: LISTA COMPLETA
  // ═════════════════════════════════════════════════════════════════
  const listSheet = workbook.addWorksheet('📋 Lista Completa');
  listSheet.columns = [
    { header: 'Nome', key: 'name', width: 25 },
    { header: 'CNPJ', key: 'cnpj', width: 18 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Telefone', key: 'phone', width: 18 },
    { header: 'Cidade/UF', key: 'location', width: 18 },
    { header: 'Endereço', key: 'address', width: 40 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Último Contato', key: 'last_contact', width: 15 },
    { header: 'Observações', key: 'notes', width: 30 },
  ];

  const listData = leads.map(l => ({
    name: l.name || '—',
    cnpj: l.cnpj || '—',
    email: l.email || '—',
    phone: l.phone || '—',
    location: l.city || l.state ? `${l.city || ''}/${l.state || ''}`.trim() : '—',
    address: l.address || '—',
    status: l.status || '—',
    last_contact: l.last_contact ? new Date(l.last_contact).toLocaleDateString('pt-BR') : '—',
    notes: l.notes || '—',
  }));

  listSheet.addRows(listData);

  // Formatar header
  const headerRow = listSheet.getRow(1);
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3b82f6' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Colorir status
  for (let i = 2; i <= listData.length + 1; i++) {
    const row = listSheet.getRow(i);
    const statusCell = row.getCell('status');
    const status = statusCell.value;

    if (status === 'Ativo') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFd1fae5' } };
      statusCell.font = { color: { argb: 'FF065f46' }, bold: true };
    } else if (status === 'Alerta') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfef3c7' } };
      statusCell.font = { color: { argb: 'FF78350f' }, bold: true };
    } else if (status === 'Crítico') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfecaca' } };
      statusCell.font = { color: { argb: 'FF7f1d1d' }, bold: true };
    } else if (status === 'Inativo') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe5e7eb' } };
      statusCell.font = { color: { argb: 'FF374151' } };
    }

    // Zebra stripes
    if (i % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    }
  }

  // Congelar primeira linha
  listSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ═════════════════════════════════════════════════════════════════
  // ABA 3: POR STATUS
  // ═════════════════════════════════════════════════════════════════
  const statusSheet = workbook.addWorksheet('🎯 Por Status');
  statusSheet.columns = [
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Quantidade', key: 'count', width: 15 },
    { header: 'Percentual', key: 'percentage', width: 15 },
  ];

  const statusData = [
    { status: '✅ Ativo', count: statusCounts.Ativo, percentage: `${((statusCounts.Ativo / leads.length) * 100).toFixed(1)}%` },
    { status: '⚠️  Alerta', count: statusCounts.Alerta, percentage: `${((statusCounts.Alerta / leads.length) * 100).toFixed(1)}%` },
    { status: '🔴 Crítico', count: statusCounts.Crítico, percentage: `${((statusCounts.Crítico / leads.length) * 100).toFixed(1)}%` },
    { status: '⛔ Inativo', count: statusCounts.Inativo, percentage: `${((statusCounts.Inativo / leads.length) * 100).toFixed(1)}%` },
  ];

  statusSheet.addRows(statusData);

  // Formatar
  const statusHeaderRow = statusSheet.getRow(1);
  statusHeaderRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  statusHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59e0b' } };

  for (let i = 2; i <= statusData.length + 1; i++) {
    const row = statusSheet.getRow(i);
    row.getCell('count').alignment = { horizontal: 'center' };
    row.getCell('percentage').alignment = { horizontal: 'center' };
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 4: CONTATOS RECENTES
  // ═════════════════════════════════════════════════════════════════
  const recentSheet = workbook.addWorksheet('📞 Contatos Recentes');
  recentSheet.columns = [
    { header: 'Nome', key: 'name', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Telefone', key: 'phone', width: 18 },
    { header: 'Último Contato', key: 'last_contact', width: 20 },
    { header: 'Dias desde contato', key: 'days_since', width: 18 },
  ];

  const recentData = leads
    .filter(l => l.last_contact)
    .map(l => {
      const lastContactDate = new Date(l.last_contact!);
      const daysSince = Math.floor((Date.now() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        name: l.name || '—',
        email: l.email || '—',
        phone: l.phone || '—',
        last_contact: lastContactDate.toLocaleDateString('pt-BR'),
        days_since: daysSince,
      };
    })
    .sort((a, b) => a.days_since - b.days_since)
    .slice(0, 50);

  recentSheet.addRows(recentData);

  // Formatar
  const recentHeaderRow = recentSheet.getRow(1);
  recentHeaderRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  recentHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8b5cf6' } };

  for (let i = 2; i <= recentData.length + 1; i++) {
    const row = recentSheet.getRow(i);
    const daysCell = row.getCell('days_since');
    const days = daysCell.value as number;

    if (days <= 7) {
      daysCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFd1fae5' } };
    } else if (days <= 30) {
      daysCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfef3c7' } };
    } else {
      daysCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfecaca' } };
    }

    if (i % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    }
  }

  recentSheet.views = [{ state: 'frozen', ySplit: 1 }];

  return workbook;
}

export async function exportLeadsAsExcel(leads: Lead[], userName: string) {
  const workbook = await generateLeadsReport(leads, userName);
  const buffer = await workbook.xlsx.writeBuffer();

  // Criar blob e download
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-leads-${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportLeadsAsCSV(leads: Lead[]) {
  const headers = ['Nome', 'CNPJ', 'Email', 'Telefone', 'Cidade/UF', 'Endereço', 'Status', 'Último Contato', 'Observações'];
  const rows = leads.map(l => [
    l.name || '—',
    l.cnpj || '—',
    l.email || '—',
    l.phone || '—',
    `${l.city || ''}/${l.state || ''}`.trim() || '—',
    l.address || '—',
    l.status || '—',
    l.last_contact ? new Date(l.last_contact).toLocaleDateString('pt-BR') : '—',
    (l.notes || '—').replace(/"/g, '""'), // Escape quotes para CSV
  ]);

  const csv = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(r => r.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio-leads-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
