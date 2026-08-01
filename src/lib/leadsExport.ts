/* Gerador do relatório de carteira de clientes em Excel — visão executiva
   (cards de KPI, top clientes, concentração de receita, distribuição
   geográfica e por representada) além da lista completa e dos status. */
import ExcelJS from 'exceljs';
import {
  BRAND,
  CURRENCY_FMT,
  INT_FMT,
  PERCENT_FMT,
  addBanner,
  addDataBars,
  addFootnote,
  addKpiGrid,
  autoFilter,
  styleTableHeader,
  zebraStripe,
  type KpiTile,
} from './excelTheme';

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
  created_at?: string;
  faturamento?: Record<string, number> | null;
  notes?: string;
}

const leadTotal = (l: Lead) => Object.values(l.faturamento || {}).reduce((s, v) => s + (v || 0), 0);

const statusFill: Record<string, string> = {
  Ativo: 'FFD1FAE5',
  Alerta: 'FFFEF3C7',
  Crítico: 'FFFECACA',
  Inativo: 'FFE5E7EB',
};
const statusFont: Record<string, string> = {
  Ativo: 'FF065F46',
  Alerta: 'FF78350F',
  Crítico: 'FF7F1D1D',
  Inativo: 'FF374151',
};

async function generateLeadsReport(leads: Lead[], userName: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = userName || 'Represente-Se';

  const totalFaturamento = leads.reduce((sum, l) => sum + leadTotal(l), 0);
  const statusCounts = {
    Ativo: leads.filter((l) => l.status === 'Ativo').length,
    Alerta: leads.filter((l) => l.status === 'Alerta').length,
    Crítico: leads.filter((l) => l.status === 'Crítico').length,
    Inativo: leads.filter((l) => l.status === 'Inativo').length,
  };
  const clientsWithRevenue = leads.filter((l) => leadTotal(l) > 0);
  const ticketMedio = clientsWithRevenue.length > 0 ? totalFaturamento / clientsWithRevenue.length : 0;
  const semCompra = leads.length - clientsWithRevenue.length;

  const now = new Date();
  const novosNoMes = leads.filter((l) => {
    if (!l.created_at) return false;
    const d = new Date(l.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const ranked = [...leads].sort((a, b) => leadTotal(b) - leadTotal(a));
  const top5Total = ranked.slice(0, 5).reduce((s, l) => s + leadTotal(l), 0);
  const concentracao = totalFaturamento > 0 ? top5Total / totalFaturamento : 0;

  // ═════════════════════════════════════════════════════════════════
  // ABA 1: RESUMO EXECUTIVO
  // ═════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet('📊 Resumo');
  summarySheet.columns = Array.from({ length: 8 }, () => ({ width: 15 }));
  const period = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  let row = addBanner(summarySheet, {
    title: 'Relatório de Carteira de Clientes',
    subtitle: `${leads.length} clientes · gerado em ${now.toLocaleDateString('pt-BR')} (${period})`,
    cols: 8,
  });
  row += 1;

  const tiles: KpiTile[] = [
    { label: 'Total de Clientes', value: leads.length, numFmt: INT_FMT, accent: BRAND.primaryDark },
    { label: 'Ativos', value: statusCounts.Ativo, numFmt: INT_FMT, accent: BRAND.primary, sub: `${leads.length ? ((statusCounts.Ativo / leads.length) * 100).toFixed(0) : 0}% da carteira` },
    { label: 'Em Alerta', value: statusCounts.Alerta, numFmt: INT_FMT, accent: BRAND.accentAmber },
    { label: 'Crítico + Inativo', value: statusCounts.Crítico + statusCounts.Inativo, numFmt: INT_FMT, accent: BRAND.danger },
    { label: 'Faturamento Total', value: totalFaturamento, numFmt: CURRENCY_FMT, accent: BRAND.primaryDark },
    { label: 'Ticket Médio', value: ticketMedio, numFmt: CURRENCY_FMT, accent: BRAND.accentIndigo, sub: 'por cliente com compra' },
    { label: 'Nunca Compraram', value: semCompra, numFmt: INT_FMT, accent: BRAND.accentPurple, sub: `${leads.length ? ((semCompra / leads.length) * 100).toFixed(0) : 0}% da carteira` },
    { label: 'Novos este Mês', value: novosNoMes, numFmt: INT_FMT, accent: BRAND.accentBlue },
  ];
  row = addKpiGrid(summarySheet, row, tiles, { tileCols: 2, perRow: 4 }) + 1;

  summarySheet.mergeCells(`A${row}:H${row}`);
  const concCell = summarySheet.getCell(`A${row}`);
  concCell.value = {
    richText: [
      { text: 'Concentração de receita: ', font: { bold: true, size: 10, color: { argb: BRAND.ink } } },
      { text: `os 5 maiores clientes respondem por ${(concentracao * 100).toFixed(1)}% do faturamento total.`, font: { size: 10, color: { argb: BRAND.slate } } },
    ],
  };
  row += 2;
  addFootnote(summarySheet, row, 8);

  // ═════════════════════════════════════════════════════════════════
  // ABA 2: TOP CLIENTES
  // ═════════════════════════════════════════════════════════════════
  const topSheet = workbook.addWorksheet('⭐ Top Clientes');
  topSheet.columns = [
    { header: '#', key: 'rank', width: 6 },
    { header: 'Cliente', key: 'name', width: 28 },
    { header: 'Cidade/UF', key: 'location', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Empresa Principal', key: 'topCompany', width: 22 },
    { header: 'Faturamento Total', key: 'total', width: 18 },
    { header: '% da Carteira', key: 'share', width: 14 },
  ];
  const top15 = ranked.slice(0, 15).filter((l) => leadTotal(l) > 0);
  top15.forEach((l, i) => {
    const total = leadTotal(l);
    const faturamento = l.faturamento || {};
    const topCompany = Object.entries(faturamento).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    topSheet.addRow({
      rank: i + 1,
      name: l.name || '—',
      location: [l.city, l.state].filter(Boolean).join('/') || '—',
      status: l.status || '—',
      topCompany,
      total,
      share: totalFaturamento > 0 ? total / totalFaturamento : 0,
    });
  });
  topSheet.getColumn('total').numFmt = CURRENCY_FMT;
  topSheet.getColumn('share').numFmt = PERCENT_FMT;
  styleTableHeader(topSheet.getRow(1), BRAND.accentIndigo);
  for (let i = 2; i <= top15.length + 1; i++) {
    const statusCell = topSheet.getRow(i).getCell('status');
    const s = statusCell.value as string;
    if (statusFill[s]) {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill[s] } };
      statusCell.font = { color: { argb: statusFont[s] }, bold: true };
    }
  }
  zebraStripe(topSheet, 2, top15.length + 1);
  if (top15.length > 0) addDataBars(topSheet, `F2:F${top15.length + 1}`, BRAND.accentIndigo);
  topSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ═════════════════════════════════════════════════════════════════
  // ABA 3: LISTA COMPLETA
  // ═════════════════════════════════════════════════════════════════
  const listSheet = workbook.addWorksheet('📋 Lista Completa');
  listSheet.columns = [
    { header: 'Nome', key: 'name', width: 25 },
    { header: 'CNPJ', key: 'cnpj', width: 18 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Telefone', key: 'phone', width: 18 },
    { header: 'Cidade/UF', key: 'location', width: 18 },
    { header: 'Endereço', key: 'address', width: 36 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Faturamento', key: 'total', width: 16 },
    { header: 'Último Contato', key: 'last_contact', width: 15 },
    { header: 'Observações', key: 'notes', width: 28 },
  ];

  const listData = leads.map((l) => ({
    name: l.name || '—',
    cnpj: l.cnpj || '—',
    email: l.email || '—',
    phone: l.phone || '—',
    location: l.city || l.state ? `${l.city || ''}/${l.state || ''}`.trim() : '—',
    address: l.address || '—',
    status: l.status || '—',
    total: leadTotal(l),
    last_contact: l.last_contact ? new Date(l.last_contact).toLocaleDateString('pt-BR') : '—',
    notes: l.notes || '—',
  }));
  listSheet.addRows(listData);
  listSheet.getColumn('total').numFmt = CURRENCY_FMT;
  styleTableHeader(listSheet.getRow(1), BRAND.accentBlue);

  for (let i = 2; i <= listData.length + 1; i++) {
    const statusCell = listSheet.getRow(i).getCell('status');
    const s = statusCell.value as string;
    if (statusFill[s]) {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill[s] } };
      statusCell.font = { color: { argb: statusFont[s] }, bold: true };
    }
  }
  zebraStripe(listSheet, 2, listData.length + 1);
  if (listData.length > 0) autoFilter(listSheet, 1, 10, listData.length + 1);
  listSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ═════════════════════════════════════════════════════════════════
  // ABA 4: POR STATUS
  // ═════════════════════════════════════════════════════════════════
  const statusSheet = workbook.addWorksheet('🎯 Por Status');
  statusSheet.columns = [
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Quantidade', key: 'count', width: 14 },
    { header: 'Percentual', key: 'percentage', width: 14 },
    { header: 'Faturamento', key: 'total', width: 18 },
  ];
  const byStatus = (['Ativo', 'Alerta', 'Crítico', 'Inativo'] as const).map((s) => ({
    status: s,
    count: statusCounts[s],
    percentage: leads.length ? statusCounts[s] / leads.length : 0,
    total: leads.filter((l) => l.status === s).reduce((sum, l) => sum + leadTotal(l), 0),
  }));
  statusSheet.addRows(byStatus);
  statusSheet.getColumn('percentage').numFmt = PERCENT_FMT;
  statusSheet.getColumn('total').numFmt = CURRENCY_FMT;
  styleTableHeader(statusSheet.getRow(1), BRAND.accentAmber);
  for (let i = 2; i <= byStatus.length + 1; i++) {
    const row2 = statusSheet.getRow(i);
    const s = row2.getCell('status').value as string;
    if (statusFill[s]) {
      row2.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill[s] } };
      row2.getCell('status').font = { color: { argb: statusFont[s] }, bold: true };
    }
    row2.getCell('count').alignment = { horizontal: 'center' };
    row2.getCell('percentage').alignment = { horizontal: 'center' };
  }
  addDataBars(statusSheet, `D2:D${byStatus.length + 1}`, BRAND.accentAmber);

  // ═════════════════════════════════════════════════════════════════
  // ABA 5: POR EMPRESA REPRESENTADA
  // ═════════════════════════════════════════════════════════════════
  const companyMap = new Map<string, number>();
  leads.forEach((l) => {
    Object.entries(l.faturamento || {}).forEach(([company, value]) => {
      companyMap.set(company, (companyMap.get(company) || 0) + (value || 0));
    });
  });
  const companyRows = Array.from(companyMap.entries())
    .map(([company, total]) => ({ company, total, share: totalFaturamento > 0 ? total / totalFaturamento : 0 }))
    .sort((a, b) => b.total - a.total);

  if (companyRows.length > 0) {
    const companySheet = workbook.addWorksheet('🏢 Por Representada');
    companySheet.columns = [
      { header: 'Empresa Representada', key: 'company', width: 30 },
      { header: 'Faturamento', key: 'total', width: 18 },
      { header: '% da Carteira', key: 'share', width: 16 },
    ];
    companySheet.addRows(companyRows);
    companySheet.getColumn('total').numFmt = CURRENCY_FMT;
    companySheet.getColumn('share').numFmt = PERCENT_FMT;
    styleTableHeader(companySheet.getRow(1), BRAND.primary);
    zebraStripe(companySheet, 2, companyRows.length + 1);
    addDataBars(companySheet, `B2:B${companyRows.length + 1}`, BRAND.primary);
  }

  // ═════════════════════════════════════════════════════════════════
  // ABA 6: POR ESTADO
  // ═════════════════════════════════════════════════════════════════
  const stateMap = new Map<string, { count: number; total: number }>();
  leads.forEach((l) => {
    const key = l.state?.trim() || 'Não informado';
    const cur = stateMap.get(key) || { count: 0, total: 0 };
    cur.count += 1;
    cur.total += leadTotal(l);
    stateMap.set(key, cur);
  });
  const stateRows = Array.from(stateMap.entries())
    .map(([state, v]) => ({ state, count: v.count, total: v.total }))
    .sort((a, b) => b.count - a.count);

  const geoSheet = workbook.addWorksheet('📍 Por Estado');
  geoSheet.columns = [
    { header: 'Estado', key: 'state', width: 16 },
    { header: 'Clientes', key: 'count', width: 12 },
    { header: 'Faturamento', key: 'total', width: 18 },
  ];
  geoSheet.addRows(stateRows);
  geoSheet.getColumn('total').numFmt = CURRENCY_FMT;
  styleTableHeader(geoSheet.getRow(1), BRAND.accentPurple);
  zebraStripe(geoSheet, 2, stateRows.length + 1);
  if (stateRows.length > 0) addDataBars(geoSheet, `B2:B${stateRows.length + 1}`, BRAND.accentPurple);

  // ═════════════════════════════════════════════════════════════════
  // ABA 7: CONTATOS RECENTES
  // ═════════════════════════════════════════════════════════════════
  const recentSheet = workbook.addWorksheet('📞 Contatos Recentes');
  recentSheet.columns = [
    { header: 'Nome', key: 'name', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Telefone', key: 'phone', width: 18 },
    { header: 'Último Contato', key: 'last_contact', width: 16 },
    { header: 'Dias sem Contato', key: 'days_since', width: 16 },
  ];
  const recentData = leads
    .filter((l) => l.last_contact)
    .map((l) => {
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
  recentSheet.getColumn('days_since').numFmt = INT_FMT;
  styleTableHeader(recentSheet.getRow(1), BRAND.accentPurple);
  for (let i = 2; i <= recentData.length + 1; i++) {
    const daysCell = recentSheet.getRow(i).getCell('days_since');
    const days = daysCell.value as number;
    const color = days <= 7 ? 'FFD1FAE5' : days <= 30 ? 'FFFEF3C7' : 'FFFECACA';
    daysCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  }
  zebraStripe(recentSheet, 2, recentData.length + 1);
  recentSheet.views = [{ state: 'frozen', ySplit: 1 }];

  return workbook;
}

export async function exportLeadsAsExcel(leads: Lead[], userName: string) {
  const workbook = await generateLeadsReport(leads, userName);
  const buffer = await workbook.xlsx.writeBuffer();

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
  const headers = ['Nome', 'CNPJ', 'Email', 'Telefone', 'Cidade/UF', 'Endereço', 'Status', 'Faturamento', 'Último Contato', 'Observações'];
  const csvField = (value: unknown) => {
    const s = String(value ?? '').replace(/\r?\n/g, ' ').trim();
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = leads.map((l) => [
    l.name || '—',
    l.cnpj || '—',
    l.email || '—',
    l.phone || '—',
    `${l.city || ''}/${l.state || ''}`.trim() || '—',
    l.address || '—',
    l.status || '—',
    leadTotal(l).toFixed(2),
    l.last_contact ? new Date(l.last_contact).toLocaleDateString('pt-BR') : '—',
    l.notes || '—',
  ]);

  const csv = [headers, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio-leads-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
