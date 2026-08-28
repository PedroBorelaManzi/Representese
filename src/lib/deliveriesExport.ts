/* Gerador do relatório de entregas — PDF (impressão) e Excel. Mesmo sistema
   de design (excelTheme.ts) dos outros relatórios do app (comissões, leads).
   Quem chama já entrega as linhas prontas (formatadas a partir de Order),
   pra não duplicar aqui a lógica de status que já existe em Entregas.tsx. */
import {
  BRAND,
  CURRENCY_FMT,
  addBanner,
  addFootnote,
  autoFilter,
  styleTableHeader,
  zebraStripe,
} from './excelTheme';
import { saveFile } from './saveFile';

export interface DeliveryReportRow {
  clientName: string;
  category: string;
  orderDate: string | null;
  deliverySchedule: string | null;
  deliveryDate: string | null;
  nfNumber: string | null;
  invoiceDate: string | null;
  value: number;
  deliveryStatusLabel: string;
  nfCommissionStatusLabel: string;
}

const BRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

const dateBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

/* ═══════════════════════════════ PDF (impressão) ═══════════════════════════════ */
export function exportDeliveriesAsPDF(rows: DeliveryReportRow[], filterLabel: string) {
  const win = window.open('', '_blank');
  if (!win) return false;

  const generatedAt = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  const rowsHtml = rows
    .map(
      (r, i) => `<tr>
        <td class="num muted">${i + 1}</td>
        <td><div class="company">${r.clientName}</div></td>
        <td class="muted">${r.category}</td>
        <td>${dateBR(r.orderDate)}</td>
        <td>${r.deliverySchedule || '—'}</td>
        <td>${dateBR(r.deliveryDate)}</td>
        <td>${r.nfNumber || '—'}</td>
        <td>${dateBR(r.invoiceDate)}</td>
        <td class="num strong">${BRL(r.value)}</td>
        <td class="center">${r.deliveryStatusLabel}</td>
        <td class="center">${r.nfCommissionStatusLabel}</td>
      </tr>`
    )
    .join('');

  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de Entregas</title>
<style>
  * { box-sizing: border-box; }
  body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;padding:40px;margin:0;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #10b981;padding-bottom:20px;margin-bottom:24px}
  .brand{font-size:22px;font-weight:900;letter-spacing:-.5px}.brand span{color:#10b981}
  .period{font-size:12px;color:#475569;font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
  .meta{text-align:right;font-size:11px;color:#94a3b8;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:8px}
  th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;border-bottom:2px solid #e2e8f0;padding:8px}
  td{padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tr:nth-child(even) td{background:#f8fafc}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .center{text-align:center}
  .strong{font-weight:800;color:#059669}
  .muted{color:#94a3b8}
  .company{font-weight:700}
  tfoot td{border-top:2px solid #0f172a;border-bottom:none;font-weight:900;padding-top:12px}
  .foot{margin-top:28px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:14px}
  @media print { body{padding:20px} }
</style></head><body>
  <div class="head">
    <div>
      <div class="brand">Represente<span>-Se!</span></div>
      <div class="period">Relatório de Entregas · ${filterLabel}</div>
    </div>
    <div class="meta">Gerado em ${generatedAt}<br>${rows.length} pedido${rows.length !== 1 ? 's' : ''}</div>
  </div>

  <table>
    <thead><tr><th>Nº</th><th>Cliente</th><th>Empresa</th><th>Data</th><th>Agenda da entrega</th><th>Data de entrega</th><th>Nº NF</th><th>Faturamento</th><th style="text-align:right">Valor</th><th style="text-align:center">Entrega</th><th style="text-align:center">Comissão NF</th></tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="11" style="color:#94a3b8;text-align:center;padding:24px">Nenhum pedido encontrado.</td></tr>`}</tbody>
    ${rows.length > 0 ? `<tfoot><tr><td colspan="8">Total</td><td class="num" style="color:#059669">${BRL(totalValue)}</td><td colspan="2"></td></tr></tfoot>` : ''}
  </table>

  <div class="foot">Gerado pelo Represente-Se! · www.representese.com</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
</body></html>`);
  win.document.close();
  return true;
}

/* ═══════════════════════════════ Excel ═══════════════════════════════ */
export async function exportDeliveriesAsExcel(rows: DeliveryReportRow[], filterLabel: string) {
  const { default: ExcelJS } = await import('exceljs'); // ~940 kB: só carrega quando o usuário exporta
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = 'Represente-Se';

  const sheet = workbook.addWorksheet('🚚 Entregas', { views: [{ showGridLines: false }] });
  const colWidths = [6, 28, 20, 16, 22, 16, 14, 18, 16, 18, 16];
  colWidths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  let nextRow = addBanner(sheet, {
    title: 'Relatório de Entregas',
    subtitle: `${filterLabel} · gerado em ${new Date().toLocaleString('pt-BR')} · ${rows.length} pedido${rows.length !== 1 ? 's' : ''}`,
    cols: 11,
  });
  nextRow += 1; // linha em branco antes da tabela

  const headerRowIdx = nextRow;
  const headers = ['Nº', 'Cliente', 'Empresa', 'Data do pedido', 'Agenda da entrega', 'Data de entrega', 'Nº NF', 'Data de faturamento', 'Valor', 'Status da entrega', 'Comissão da NF'];
  const headerRow = sheet.getRow(headerRowIdx);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  styleTableHeader(headerRow, BRAND.primary);

  const firstDataRow = headerRowIdx + 1;
  rows.forEach((r, idx) => {
    const excelRow = sheet.getRow(firstDataRow + idx);
    const values: (string | number | Date | null)[] = [
      idx + 1,
      r.clientName,
      r.category,
      r.orderDate ? new Date(r.orderDate) : null,
      r.deliverySchedule || '—',
      r.deliveryDate ? new Date(r.deliveryDate) : null,
      r.nfNumber || '—',
      r.invoiceDate ? new Date(r.invoiceDate) : null,
      r.value,
      r.deliveryStatusLabel,
      r.nfCommissionStatusLabel,
    ];
    values.forEach((v, i) => { excelRow.getCell(i + 1).value = v; });
    excelRow.getCell(4).numFmt = 'dd/mm/yyyy';
    excelRow.getCell(6).numFmt = 'dd/mm/yyyy';
    excelRow.getCell(8).numFmt = 'dd/mm/yyyy';
    excelRow.getCell(9).numFmt = CURRENCY_FMT;
    excelRow.getCell(9).font = { bold: true, color: { argb: BRAND.primaryDark } };
  });

  const lastDataRow = firstDataRow + rows.length - 1;
  if (rows.length > 0) {
    zebraStripe(sheet, firstDataRow, lastDataRow);
    autoFilter(sheet, headerRowIdx, 11, lastDataRow);
  } else {
    sheet.mergeCells(firstDataRow, 1, firstDataRow, 11);
    const emptyCell = sheet.getCell(firstDataRow, 1);
    emptyCell.value = 'Nenhum pedido encontrado.';
    emptyCell.font = { italic: true, size: 9, color: { argb: BRAND.slateLight } };
    emptyCell.alignment = { horizontal: 'center' };
  }

  sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: headerRowIdx }];
  addFootnote(sheet, Math.max(lastDataRow, firstDataRow) + 2, 11);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await saveFile(blob, `entregas-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
