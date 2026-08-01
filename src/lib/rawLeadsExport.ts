/* Exportação dos contatos brutos capturados no formulário simples de /register
   (Admin > Analytics > aba Leads) — Excel bem formatado + CSV corrigido.

   O CSV manual anterior corrompia o arquivo por dois motivos: usava a string
   literal '\\n' (backslash + n) em vez de quebra de linha real, e não escapava
   vírgulas/aspas/quebras de linha dentro dos campos — um nome ou empresa com
   vírgula ou quebra de linha deslocava todas as colunas seguintes. */
import ExcelJS from 'exceljs';

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

/* ═══════════════════════════ Excel: contatos capturados (/register) ═══════════════════════════ */
export async function exportRawLeadsAsExcel(leads: RawLead[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = 'Represente-Se';

  const sheet = workbook.addWorksheet('Contatos');
  sheet.columns = [
    { header: 'Data', key: 'date', width: 14 },
    { header: 'Nome', key: 'name', width: 28 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'WhatsApp', key: 'phone', width: 18 },
    { header: 'Empresa', key: 'company', width: 26 },
  ];

  leads.forEach((lead) => {
    sheet.addRow({
      date: new Date(lead.created_at).toLocaleDateString('pt-BR'),
      name: lead.name || '—',
      email: lead.email || '—',
      phone: lead.phone || '—',
      company: lead.company || '—',
    });
  });

  const header = sheet.getRow(1);
  header.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  header.alignment = { horizontal: 'center', vertical: 'middle' };

  for (let i = 2; i <= leads.length + 1; i++) {
    if (i % 2 === 0) {
      sheet.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    }
  }

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

  const sheet = workbook.addWorksheet('Base de Leads');
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

  const header = sheet.getRow(1);
  header.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  header.alignment = { horizontal: 'center', vertical: 'middle' };

  for (let i = 2; i <= leads.length + 1; i++) {
    if (i % 2 === 0) {
      sheet.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    }
  }

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
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
