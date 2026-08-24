/* Gerador do extrato mensal de comissões — PDF (impressão) e Excel.
   O Excel usa o mesmo sistema de design (excelTheme.ts) do relatório de
   leads: banner de capa, cards de KPI, barras de dados e tabelas com
   zebra stripe — além de mais métricas (ticket médio, comissão média por
   pedido, projeção anual, ranking das 3 maiores empresas). */
import {
  BRAND,
  CURRENCY_FMT,
  INT_FMT,
  SIGNED_PERCENT_FMT,
  addBanner,
  addDataBars,
  addFootnote,
  addKpiGrid,
  autoFilter,
  styleTableHeader,
  zebraStripe,
  type KpiTile,
} from './excelTheme';
import { saveFile } from './saveFile';

export interface CommissionRow {
  key: string;
  name: string;
  faturamento: number;
  faturamentoPrev: number;
  pedidos: number;
  pct: number;
  comissao: number;
}

export interface CommissionTotals {
  faturamento: number;
  comissao: number;
  comissaoPrev: number;
  semConfig: number;
}

const BRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const deltaOf = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

/* ═══════════════════════════════ PDF (impressão) ═══════════════════════════════ */
export function exportCommissionsAsPDF(
  rows: CommissionRow[],
  totals: CommissionTotals,
  month: string,
  year: number
) {
  const win = window.open("", "_blank");
  if (!win) return false;

  const active = rows.filter((r) => r.faturamento > 0);
  const totalPedidos = active.reduce((s, r) => s + r.pedidos, 0);
  const deltaPct = deltaOf(totals.comissao, totals.comissaoPrev);
  const ticketMedio = totalPedidos > 0 ? totals.faturamento / totalPedidos : 0;
  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const rowsHtml = active
    .map((r) => {
      const delta = deltaOf(r.faturamento, r.faturamentoPrev);
      const deltaHtml =
        delta === null
          ? '<span class="muted">—</span>'
          : `<span class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}%</span>`;
      const pctHtml =
        r.pct > 0
          ? `${r.pct}%`
          : '<span class="warn">não configurado</span>';
      return `<tr>
        <td><div class="company"><span class="avatar">${r.name.substring(0, 2).toUpperCase()}</span>${r.name}</div></td>
        <td class="num">${BRL(r.faturamento)}</td>
        <td class="num muted">${r.pedidos}</td>
        <td class="center">${pctHtml}</td>
        <td class="num strong">${BRL(r.comissao)}</td>
        <td class="center">${deltaHtml}</td>
      </tr>`;
    })
    .join("");

  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Extrato de Comissões — ${month}/${year}</title>
<style>
  * { box-sizing: border-box; }
  body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;padding:48px;margin:0;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #10b981;padding-bottom:20px;margin-bottom:28px}
  .brand{font-size:24px;font-weight:900;letter-spacing:-.5px}.brand span{color:#10b981}
  .period{font-size:13px;color:#475569;font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
  .meta{text-align:right;font-size:11px;color:#94a3b8;font-weight:600}

  .kpis{display:flex;gap:16px;margin-bottom:32px}
  .kpi{flex:1;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px}
  .kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;font-weight:800}
  .kpi-value{font-size:24px;font-weight:900;margin-top:6px;color:#0f172a}
  .kpi.highlight{background:linear-gradient(135deg,#059669,#10b981);border:none}
  .kpi.highlight .kpi-label{color:#d1fae5}
  .kpi.highlight .kpi-value{color:#fff}
  .kpi-sub{font-size:11px;font-weight:700;margin-top:4px}
  .kpi-sub.up{color:#10b981}
  .kpi-sub.down{color:#ef4444}
  .kpi.highlight .kpi-sub.up{color:#d1fae5}
  .kpi.highlight .kpi-sub.down{color:#fecaca}

  table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}
  th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;border-bottom:2px solid #e2e8f0;padding:10px}
  td{padding:11px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tr:nth-child(even) td{background:#f8fafc}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .center{text-align:center}
  .strong{font-weight:800;color:#059669}
  .muted{color:#94a3b8}
  .warn{color:#d97706;font-weight:700}
  .up{color:#10b981;font-weight:800}
  .down{color:#ef4444;font-weight:800}
  .company{display:flex;align-items:center;gap:10px;font-weight:700}
  .avatar{width:26px;height:26px;border-radius:8px;background:#d1fae5;color:#065f46;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0}

  tfoot td{border-top:2px solid #0f172a;border-bottom:none;font-weight:900;padding-top:14px}

  .foot{margin-top:36px;font-size:10.5px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:16px}
  @media print { body{padding:24px} }
</style></head><body>
  <div class="head">
    <div>
      <div class="brand">Represente<span>-Se!</span></div>
      <div class="period">Extrato de Comissões · ${month} de ${year}</div>
    </div>
    <div class="meta">Gerado em ${generatedAt}</div>
  </div>

  <div class="kpis">
    <div class="kpi highlight">
      <div class="kpi-label">Comissão total do mês</div>
      <div class="kpi-value">${BRL(totals.comissao)}</div>
      ${deltaPct !== null ? `<div class="kpi-sub ${deltaPct >= 0 ? "up" : "down"}">${deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(deltaPct).toFixed(0)}% vs. mês anterior</div>` : ""}
    </div>
    <div class="kpi">
      <div class="kpi-label">Faturamento total</div>
      <div class="kpi-value">${BRL(totals.faturamento)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Pedidos no mês</div>
      <div class="kpi-value">${totalPedidos}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Ticket médio</div>
      <div class="kpi-value">${BRL(ticketMedio)}</div>
    </div>
  </div>

  ${totals.semConfig > 0 ? `<div style="margin-bottom:20px;padding:12px 16px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a;font-size:12px;color:#92400e;font-weight:700">⚠️ ${totals.semConfig} empresa(s) com faturamento mas sem % de comissão configurado.</div>` : ""}

  <table>
    <thead><tr><th>Empresa</th><th style="text-align:right">Faturamento</th><th style="text-align:right">Pedidos</th><th style="text-align:center">Comissão %</th><th style="text-align:right">Comissão</th><th style="text-align:center">Var. mês</th></tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="6" style="color:#94a3b8;text-align:center;padding:24px">Nenhum pedido neste mês.</td></tr>`}</tbody>
    ${active.length > 0 ? `<tfoot><tr><td>Total</td><td class="num">${BRL(totals.faturamento)}</td><td class="num">${totalPedidos}</td><td></td><td class="num" style="color:#059669">${BRL(totals.comissao)}</td><td></td></tr></tfoot>` : ""}
  </table>

  <div class="foot">Gerado pelo Represente-Se! · www.representese.com</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
</body></html>`);
  win.document.close();
  return true;
}

/* ═══════════════════════════════ Excel ═══════════════════════════════ */
export async function exportCommissionsAsExcel(
  rows: CommissionRow[],
  totals: CommissionTotals,
  month: string,
  year: number,
  userName?: string
) {
  const { default: ExcelJS } = await import('exceljs'); // ~940 kB: só carrega quando o usuário exporta a planilha
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = userName || 'Represente-Se';

  const active = rows.filter((r) => r.faturamento > 0);
  const totalPedidos = active.reduce((s, r) => s + r.pedidos, 0);
  const deltaPct = deltaOf(totals.comissao, totals.comissaoPrev);
  const ticketMedio = totalPedidos > 0 ? totals.faturamento / totalPedidos : 0;
  const comissaoMediaPedido = totalPedidos > 0 ? totals.comissao / totalPedidos : 0;
  const top3 = [...active].sort((a, b) => b.comissao - a.comissao).slice(0, 3);

  // ── Aba 1: Resumo ──
  const summarySheet = workbook.addWorksheet('📊 Resumo');
  summarySheet.columns = Array.from({ length: 8 }, () => ({ width: 15 }));
  let row = addBanner(summarySheet, {
    title: 'Extrato de Comissões',
    subtitle: `${month} de ${year} · gerado em ${new Date().toLocaleString('pt-BR')}`,
    cols: 8,
  });
  row += 1;

  const tiles: KpiTile[] = [
    { label: 'Comissão Total', value: totals.comissao, numFmt: CURRENCY_FMT, accent: BRAND.primaryDark, sub: deltaPct !== null ? `${deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(deltaPct).toFixed(1)}% vs. mês anterior` : 'sem base de comparação' },
    { label: 'Faturamento Total', value: totals.faturamento, numFmt: CURRENCY_FMT, accent: BRAND.primary },
    { label: 'Pedidos no Mês', value: totalPedidos, numFmt: INT_FMT, accent: BRAND.accentBlue },
    { label: 'Empresas Ativas', value: active.length, numFmt: INT_FMT, accent: BRAND.accentIndigo },
    { label: 'Ticket Médio', value: ticketMedio, numFmt: CURRENCY_FMT, accent: BRAND.accentPurple, sub: 'por pedido' },
    { label: 'Comissão Média', value: comissaoMediaPedido, numFmt: CURRENCY_FMT, accent: BRAND.accentPurple, sub: 'por pedido' },
    { label: 'Projeção Anual', value: totals.comissao * 12, numFmt: CURRENCY_FMT, accent: BRAND.accentAmber, sub: 'comissão do mês × 12' },
    { label: 'Sem % Configurado', value: totals.semConfig, numFmt: INT_FMT, accent: BRAND.danger },
  ];
  row = addKpiGrid(summarySheet, row, tiles, { tileCols: 2, perRow: 4 }) + 1;

  if (top3.length > 0) {
    summarySheet.mergeCells(`A${row}:H${row}`);
    const rankCell = summarySheet.getCell(`A${row}`);
    const parts = top3.map((r, i) => `${i + 1}º ${r.name} (${BRL(r.comissao)})`).join('  ·  ');
    rankCell.value = { richText: [
      { text: 'Top 3 empresas do mês: ', font: { bold: true, size: 10, color: { argb: BRAND.ink } } },
      { text: parts, font: { size: 10, color: { argb: BRAND.slate } } },
    ] };
    row += 2;
  }
  addFootnote(summarySheet, row, 8);

  // ── Aba 2: Detalhe por Empresa ──
  const detailSheet = workbook.addWorksheet('🏢 Detalhe por Empresa');
  detailSheet.columns = [
    { header: 'Empresa', key: 'name', width: 28 },
    { header: 'Faturamento', key: 'faturamento', width: 18 },
    { header: 'Pedidos', key: 'pedidos', width: 12 },
    { header: 'Ticket Médio', key: 'ticket', width: 16 },
    { header: 'Comissão %', key: 'pct', width: 14 },
    { header: 'Comissão (R$)', key: 'comissao', width: 18 },
    { header: 'Faturamento Mês Anterior', key: 'faturamentoPrev', width: 22 },
    { header: 'Variação %', key: 'delta', width: 14 },
  ];

  active.forEach((r) => {
    const delta = deltaOf(r.faturamento, r.faturamentoPrev);
    detailSheet.addRow({
      name: r.name,
      faturamento: r.faturamento,
      pedidos: r.pedidos,
      ticket: r.pedidos > 0 ? r.faturamento / r.pedidos : 0,
      pct: r.pct > 0 ? r.pct / 100 : null,
      comissao: r.comissao,
      faturamentoPrev: r.faturamentoPrev,
      delta: delta !== null ? delta / 100 : null,
    });
  });

  detailSheet.getColumn('faturamento').numFmt = CURRENCY_FMT;
  detailSheet.getColumn('ticket').numFmt = CURRENCY_FMT;
  detailSheet.getColumn('comissao').numFmt = CURRENCY_FMT;
  detailSheet.getColumn('faturamentoPrev').numFmt = CURRENCY_FMT;
  detailSheet.getColumn('pct').numFmt = '0.0%';
  detailSheet.getColumn('delta').numFmt = SIGNED_PERCENT_FMT;

  styleTableHeader(detailSheet.getRow(1), BRAND.primary);

  for (let i = 2; i <= active.length + 1; i++) {
    const r = detailSheet.getRow(i);
    const pctCell = r.getCell('pct');
    if (pctCell.value === null) {
      pctCell.value = 'Não configurado';
      pctCell.font = { color: { argb: BRAND.accentAmber }, bold: true };
      pctCell.numFmt = 'General';
    }
    const deltaCell = r.getCell('delta');
    if (deltaCell.value === null) {
      deltaCell.value = '—';
      deltaCell.numFmt = 'General';
    } else if ((deltaCell.value as number) >= 0) {
      deltaCell.font = { color: { argb: BRAND.primaryDark }, bold: true };
    } else {
      deltaCell.font = { color: { argb: BRAND.danger }, bold: true };
    }
    r.getCell('comissao').font = { bold: true, color: { argb: BRAND.primaryDark } };
  }
  zebraStripe(detailSheet, 2, active.length + 1);
  if (active.length > 0) {
    addDataBars(detailSheet, `F2:F${active.length + 1}`, BRAND.primary);
    autoFilter(detailSheet, 1, 8, active.length + 1);
  }

  // Linha de total
  if (active.length > 0) {
    const totalRow = detailSheet.addRow({
      name: 'TOTAL',
      faturamento: totals.faturamento,
      pedidos: totalPedidos,
      ticket: ticketMedio,
      pct: null,
      comissao: totals.comissao,
      faturamentoPrev: '',
      delta: null,
    });
    totalRow.font = { bold: true, size: 11 };
    totalRow.border = { top: { style: 'double', color: { argb: BRAND.ink } } };
    totalRow.getCell('faturamento').numFmt = CURRENCY_FMT;
    totalRow.getCell('ticket').numFmt = CURRENCY_FMT;
    totalRow.getCell('comissao').numFmt = CURRENCY_FMT;
    totalRow.getCell('pct').value = '';
    totalRow.getCell('pct').numFmt = 'General';
    totalRow.getCell('delta').value = '';
    totalRow.getCell('delta').numFmt = 'General';
  }

  detailSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await saveFile(blob, `comissoes-${month.toLowerCase()}-${year}.xlsx`);
}
