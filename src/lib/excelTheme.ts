/* Sistema de design compartilhado para os relatórios Excel (ExcelJS).
   Usado por leadsExport.ts, commissionsExport.ts e rawLeadsExport.ts —
   garante que todo relatório gerado pelo app tenha a mesma identidade visual
   (cores da marca, tipografia, cards de KPI, tabelas) em vez de cada um
   inventar o próprio estilo. */
import type ExcelJS from 'exceljs';

export const BRAND = {
  primaryDark: 'FF065F46', // emerald-800
  primary: 'FF059669', // emerald-600
  primaryLight: 'FF10B981', // emerald-500
  primaryPale: 'FFD1FAE5', // emerald-100
  accentBlue: 'FF2563EB',
  accentIndigo: 'FF4F46E5',
  accentPurple: 'FF7C3AED',
  accentAmber: 'FFD97706',
  danger: 'FFDC2626',
  dangerPale: 'FFFECACA',
  warnPale: 'FFFEF3C7',
  warnText: 'FF92400E',
  ink: 'FF0F172A',
  slate: 'FF475569',
  slateLight: 'FF94A3B8',
  border: 'FFE2E8F0',
  zebra: 'FFF9FAFB',
  panel: 'FFF5F5F7',
  white: 'FFFFFFFF',
} as const;

export const CURRENCY_FMT = '"R$" #,##0.00';
export const INT_FMT = '#,##0';
export const PERCENT_FMT = '0.0%';
export const SIGNED_PERCENT_FMT = '+0.0%;-0.0%;0.0%';

/** Converte índice de coluna (1-based) em letra(s) — suporta além de Z. */
export function colLetter(n: number): string {
  let s = '';
  let i = n;
  while (i > 0) {
    const rem = (i - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/** Faixa de título no topo da aba: nome do relatório + período/subtítulo,
 *  em fundo sólido na cor da marca — dá a sensação de "capa" de cada aba. */
export function addBanner(
  sheet: ExcelJS.Worksheet,
  opts: { title: string; subtitle?: string; cols: number }
) {
  const { title, subtitle, cols } = opts;
  const lastCol = colLetter(cols);

  sheet.mergeCells(`A1:${lastCol}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 15, color: { argb: BRAND.white }, name: 'Calibri' };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.primaryDark } };
  sheet.getRow(1).height = 30;

  if (subtitle) {
    sheet.mergeCells(`A2:${lastCol}2`);
    const subCell = sheet.getCell('A2');
    subCell.value = subtitle;
    subCell.font = { bold: true, size: 10, color: { argb: BRAND.white } };
    subCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.primary } };
    sheet.getRow(2).height = 20;
  }
  return subtitle ? 3 : 2; // próxima linha livre
}

export interface KpiTile {
  label: string;
  value: number | string;
  numFmt?: string;
  sub?: string;
  accent?: string;
}

/** Grade de "cards" de KPI feita com células mescladas (label + valor grande +
 *  linha de contexto), lado a lado — a versão em planilha de um dashboard. */
export function addKpiGrid(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  tiles: KpiTile[],
  opts: { tileCols?: number; perRow?: number } = {}
): number {
  const tileCols = opts.tileCols ?? 2;
  const perRow = opts.perRow ?? 4;
  const rowsPerTile = 3;
  const gap = 1;

  tiles.forEach((tile, i) => {
    const rowBlock = Math.floor(i / perRow);
    const colBlock = i % perRow;
    const startColIdx = colBlock * tileCols + 1;
    const endColIdx = startColIdx + tileCols - 1;
    const r0 = startRow + rowBlock * (rowsPerTile + gap);
    const startColL = colLetter(startColIdx);
    const endColL = colLetter(endColIdx);
    const accent = tile.accent ?? BRAND.primary;

    sheet.mergeCells(`${startColL}${r0}:${endColL}${r0}`);
    const labelCell = sheet.getCell(`${startColL}${r0}`);
    labelCell.value = tile.label.toUpperCase();
    labelCell.font = { bold: true, size: 8, color: { argb: BRAND.white } };
    labelCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
    sheet.getRow(r0).height = 16;

    sheet.mergeCells(`${startColL}${r0 + 1}:${endColL}${r0 + 1}`);
    const valueCell = sheet.getCell(`${startColL}${r0 + 1}`);
    valueCell.value = tile.value;
    if (tile.numFmt) valueCell.numFmt = tile.numFmt;
    valueCell.font = { bold: true, size: 17, color: { argb: BRAND.white } };
    valueCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
    sheet.getRow(r0 + 1).height = 27;

    sheet.mergeCells(`${startColL}${r0 + 2}:${endColL}${r0 + 2}`);
    const subCell = sheet.getCell(`${startColL}${r0 + 2}`);
    subCell.value = tile.sub ?? ' ';
    subCell.font = { size: 8, italic: true, color: { argb: BRAND.white } };
    subCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
    sheet.getRow(r0 + 2).height = 14;
  });

  const rowsUsed = Math.ceil(tiles.length / perRow) * (rowsPerTile + gap);
  return startRow + rowsUsed; // próxima linha livre
}

export function styleTableHeader(row: ExcelJS.Row, color: string = BRAND.primary) {
  row.font = { bold: true, size: 10.5, color: { argb: BRAND.white } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  row.alignment = { horizontal: 'center', vertical: 'middle' };
  row.height = 20;
}

export function zebraStripe(sheet: ExcelJS.Worksheet, firstDataRow: number, lastDataRow: number) {
  for (let i = firstDataRow; i <= lastDataRow; i++) {
    if ((i - firstDataRow) % 2 === 1) {
      sheet.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
    }
  }
}

let cfPriority = 1;
/** Barra de dados dentro da célula (mini gráfico de barras nativo do Excel) —
 *  ótimo pra comparar faturamento/comissão entre linhas sem precisar de um
 *  gráfico separado (ExcelJS não gera gráficos nativos). */
export function addDataBars(sheet: ExcelJS.Worksheet, ref: string, color: string = BRAND.primaryLight) {
  sheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'dataBar',
        gradient: true,
        border: false,
        minLength: 0,
        maxLength: 100,
        cfvo: [{ type: 'min' }, { type: 'max' }],
        color: { argb: color },
        priority: cfPriority++,
      } as ExcelJS.DataBarRuleType,
    ],
  });
}

export function autoFilter(sheet: ExcelJS.Worksheet, headerRow: number, lastCol: number, lastRow: number) {
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: lastRow, column: lastCol },
  };
}

export const FOOTER_NOTE = 'Gerado pelo Represente-Se! · www.representese.com';

export function addFootnote(sheet: ExcelJS.Worksheet, row: number, cols: number, text: string = FOOTER_NOTE) {
  const lastCol = colLetter(cols);
  sheet.mergeCells(`A${row}:${lastCol}${row}`);
  const cell = sheet.getCell(`A${row}`);
  cell.value = text;
  cell.font = { size: 8, italic: true, color: { argb: BRAND.slateLight } };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
}
