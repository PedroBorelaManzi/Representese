/* Exportação dos contatos brutos capturados no formulário simples de /register
   (Admin > Analytics > aba Leads) — Excel com o mesmo sistema de design dos
   outros relatórios (banner, KPIs, zebra stripe) + CSV corrigido de fallback.

   O CSV manual anterior corrompia o arquivo por dois motivos: usava a string
   literal '\\n' (backslash + n) em vez de quebra de linha real, e não escapava
   vírgulas/aspas/quebras de linha dentro dos campos — um nome ou empresa com
   vírgula ou quebra de linha deslocava todas as colunas seguintes. */
import ExcelJS from 'exceljs';
import {
  BRAND,
  INT_FMT,
  addBanner,
  addFootnote,
  addKpiGrid,
  autoFilter,
  styleTableHeader,
  zebraStripe,
  type KpiTile,
} from './excelTheme';
import { saveFile } from './saveFile';

export interface RawLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string | null;
  created_at: string;
}

export interface SubscriptionLead {
  user_id: string;
  email: string;
  phone?: string | null;
  subscription_status: string;
  created_at: string;
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/* ═══════════════════════════ Excel: contatos capturados (/register) ═══════════════════════════ */
export async function exportRawLeadsAsExcel(leads: RawLead[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = 'Represente-Se';

  const now = new Date();
  const last7d = leads.filter((l) => (now.getTime() - new Date(l.created_at).getTime()) / 86400000 <= 7).length;
  const last30d = leads.filter((l) => (now.getTime() - new Date(l.created_at).getTime()) / 86400000 <= 30).length;
  const comEmpresa = leads.filter((l) => l.company && l.company.trim()).length;

  // ── Aba 1: Resumo ──
  const summarySheet = workbook.addWorksheet('📊 Resumo');
  summarySheet.columns = Array.from({ length: 8 }, () => ({ width: 15 }));
  let row = addBanner(summarySheet, {
    title: 'Contatos Capturados no Cadastro',
    subtitle: `${leads.length} contatos · gerado em ${now.toLocaleDateString('pt-BR')}`,
    cols: 8,
  });
  row += 1;

  const tiles: KpiTile[] = [
    { label: 'Total de Contatos', value: leads.length, numFmt: INT_FMT, accent: BRAND.primaryDark },
    { label: 'Últimos 7 dias', value: last7d, numFmt: INT_FMT, accent: BRAND.primary },
    { label: 'Últimos 30 dias', value: last30d, numFmt: INT_FMT, accent: BRAND.accentBlue },
    { label: 'Informaram Empresa', value: comEmpresa, numFmt: INT_FMT, accent: BRAND.accentIndigo, sub: `${leads.length ? ((comEmpresa / leads.length) * 100).toFixed(0) : 0}% do total` },
  ];
  row = addKpiGrid(summarySheet, row, tiles, { tileCols: 2, perRow: 4 }) + 1;
  addFootnote(summarySheet, row, 8);

  // ── Aba 2: Contatos ──
  const sheet = workbook.addWorksheet('📋 Contatos');
  sheet.columns = [
    { header: 'Data', key: 'date', width: 14 },
    { header: 'Dia da Semana', key: 'weekday', width: 14 },
    { header: 'Nome', key: 'name', width: 28 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'WhatsApp', key: 'phone', width: 18 },
    { header: 'Empresa', key: 'company', width: 26 },
  ];

  leads.forEach((lead) => {
    const d = new Date(lead.created_at);
    sheet.addRow({
      date: d.toLocaleDateString('pt-BR'),
      weekday: WEEKDAYS[d.getDay()],
      name: lead.name || '—',
      email: lead.email || '—',
      phone: lead.phone || '—',
      company: lead.company || '—',
    });
  });

  styleTableHeader(sheet.getRow(1), BRAND.primary);
  zebraStripe(sheet, 2, leads.length + 1);
  if (leads.length > 0) autoFilter(sheet, 1, 6, leads.length + 1);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `contatos-representese-${new Date().toISOString().split('T')[0]}.xlsx`);
}

/* ═══════════════════════════ Excel: base de leads/assinantes ═══════════════════════════ */
export async function exportSubscriptionLeadsAsExcel(leads: SubscriptionLead[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = 'Represente-Se';

  const now = new Date();
  const statusCounts = new Map<string, number>();
  leads.forEach((l) => {
    const key = l.subscription_status || 'desconhecido';
    statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
  });
  const topStatuses = Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

  // ── Aba 1: Resumo ──
  const summarySheet = workbook.addWorksheet('📊 Resumo');
  summarySheet.columns = Array.from({ length: 8 }, () => ({ width: 15 }));
  let row = addBanner(summarySheet, {
    title: 'Base de Leads e Clientes',
    subtitle: `${leads.length} cadastros · gerado em ${now.toLocaleDateString('pt-BR')}`,
    cols: 8,
  });
  row += 1;

  const accents = [BRAND.primaryDark, BRAND.primary, BRAND.accentBlue, BRAND.accentIndigo];
  const tiles: KpiTile[] = topStatuses.map(([status, count], i) => ({
    label: status,
    value: count,
    numFmt: INT_FMT,
    accent: accents[i % accents.length],
    sub: `${leads.length ? ((count / leads.length) * 100).toFixed(0) : 0}% do total`,
  }));
  row = addKpiGrid(summarySheet, row, tiles, { tileCols: 2, perRow: 4 }) + 1;
  addFootnote(summarySheet, row, 8);

  // ── Aba 2: Base de Leads ──
  const sheet = workbook.addWorksheet('📋 Base de Leads');
  sheet.columns = [
    { header: 'Data de Cadastro', key: 'date', width: 18 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'WhatsApp', key: 'phone', width: 18 },
    { header: 'Status', key: 'status', width: 18 },
  ];

  leads.forEach((lead) => {
    sheet.addRow({
      date: new Date(lead.created_at).toLocaleDateString('pt-BR'),
      email: lead.email || '—',
      phone: lead.phone || '—',
      status: lead.subscription_status || '—',
    });
  });

  styleTableHeader(sheet.getRow(1), BRAND.primary);
  zebraStripe(sheet, 2, leads.length + 1);
  if (leads.length > 0) autoFilter(sheet, 1, 4, leads.length + 1);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `leads-representese-${new Date().toISOString().split('T')[0]}.xlsx`);
}

/* ═══════════════════════════ CSV corrigido (fallback) ═══════════════════════════ */
/** Escapa um campo pro padrão CSV: aspas duplicadas e o campo inteiro entre aspas
 *  sempre que contiver vírgula, aspas ou quebra de linha — sem isso qualquer
 *  vírgula/quebra dentro de um nome ou empresa desalinha as colunas seguintes. */
const csvField = (value: unknown) => {
  const s = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const buildCsv = (headers: string[], rows: unknown[][]) =>
  [headers, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');

export function exportRawLeadsAsCSV(leads: RawLead[]) {
  const csv = buildCsv(
    ['Data', 'Nome', 'Email', 'WhatsApp', 'Empresa'],
    leads.map((lead) => [
      new Date(lead.created_at).toLocaleDateString('pt-BR'),
      lead.name,
      lead.email,
      lead.phone,
      lead.company || '',
    ])
  );
  downloadBlob(
    new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }),
    `contatos-representese-${new Date().toISOString().split('T')[0]}.csv`
  );
}

export function exportSubscriptionLeadsAsCSV(leads: SubscriptionLead[]) {
  const csv = buildCsv(
    ['Data de Cadastro', 'Email', 'WhatsApp', 'Status'],
    leads.map((lead) => [
      new Date(lead.created_at).toLocaleDateString('pt-BR'),
      lead.email,
      lead.phone || '',
      lead.subscription_status,
    ])
  );
  downloadBlob(
    new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }),
    `leads-representese-${new Date().toISOString().split('T')[0]}.csv`
  );
}

function downloadBlob(blob: Blob, filename: string) {
  // No app, saveFile abre a folha de compartilhamento do Android para o
  // usuário escolher o destino; no site continua o download do navegador.
  void saveFile(blob, filename);
}
