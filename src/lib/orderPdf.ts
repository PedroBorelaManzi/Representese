// PDF do pedido criado em "Novo pedido". Desenhado direto com o jsPDF (texto e
// linhas vetoriais), sem captura de tela: nada de html2canvas, canvas gigante
// ou DOM escondido, que travavam o WebView do iOS. Gera um Blob; quem chama
// decide se mostra, salva no aparelho ou compartilha (ver orderPdfStore.ts).

import { computeOrderTotals, itemTotal, type OrderPricing, type PricedItem } from "./orderBuilder";

export interface OrderPdfItem extends PricedItem {
  product_name: string;
  product_code?: string | null;
}

export interface OrderPdfData {
  orderNumber: string;
  date: string; // ISO
  sellerName?: string;
  /** Logo da representação (data URL) — substitui a marca do app no cabeçalho. */
  logoUrl?: string | null;
  company: string;
  client: { name: string; cnpj?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  items: OrderPdfItem[];
  pricing?: OrderPricing | null;
  paymentTerms?: string | null;
  notes?: string | null;
}

const BRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0).replace(/ /g, " ");
const pctLabel = (n: number) => `${String(Number(n.toFixed(2))).replace(".", ",")}%`;

function formatCnpj(raw?: string | null): string {
  const d = (raw || "").replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : raw || "";
}

// Helvetica padrão do PDF só tem o alfabeto latino (WinAnsi): troca o que fica
// fora (sinal de menos, aspas curvas, espaços especiais) por equivalentes.
const pdfText = (s: unknown) =>
  String(s ?? "")
    .replace(/−/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[   ]/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e¡-ÿ–—•€]/g, "");

const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_600: [number, number, number] = [71, 85, 105];
const SLATE_400: [number, number, number] = [148, 163, 184];
const SLATE_200: [number, number, number] = [226, 232, 240];
const EMERALD: [number, number, number] = [16, 185, 129];
const EMERALD_DARK: [number, number, number] = [5, 150, 105];
const RED: [number, number, number] = [220, 38, 38];

/** Converte a logo (qualquer formato que o WebView leia, ex.: webp) em PNG pro jsPDF. */
function logoToPng(dataUrl: string): Promise<{ data: string; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 3000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) return resolve(null);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve({ data: canvas.toDataURL("image/png"), w, h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = dataUrl;
  });
}

/** Gera o PDF do pedido (A4, várias páginas se precisar) e devolve o arquivo. */
export async function buildOrderPdf(o: OrderPdfData): Promise<Blob> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ unit: "pt", format: "a4", compress: true });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 40;
  const CW = PW - M * 2;
  const BOTTOM = PH - 56; // reserva o rodapé

  const t = computeOrderTotals(o.items, o.pricing);
  const hasItemDiscount = o.items.some((i) => (i.discount_pct || 0) > 0);
  const date = new Date(o.date).toLocaleDateString("pt-BR");

  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (bold: boolean, size: number) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
  };
  const wrap = (text: string, width: number): string[] => doc.splitTextToSize(pdfText(text), width) as string[];
  const hline = (y: number, w: number, c: [number, number, number], x = M, len = CW) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(w);
    doc.line(x, y, x + len, y);
  };

  // ---- Cabeçalho ----
  let y = M;
  const logo = /^data:image\//.test(o.logoUrl || "") ? await logoToPng(o.logoUrl as string) : null;
  let headH = 30;
  if (logo) {
    const maxH = 52;
    const maxW = 170;
    const k = Math.min(maxH / logo.h, maxW / logo.w);
    const lw = logo.w * k;
    const lh = logo.h * k;
    doc.addImage(logo.data, "PNG", M, y, lw, lh);
    headH = lh;
  } else {
    font(true, 22);
    color(SLATE_900);
    doc.text("Represente", M, y + 20);
    const w1 = doc.getTextWidth("Represente");
    color(EMERALD);
    doc.text("-Se!", M + w1 + 0.5, y + 20);
  }
  font(true, 9);
  color(SLATE_600);
  doc.text("PEDIDO DE VENDA", M, y + headH + 14);

  const metaRight = M + CW;
  font(true, 11);
  color(SLATE_600);
  doc.text(pdfText(`Nº ${o.orderNumber}`), metaRight, y + 12, { align: "right" });
  font(false, 10);
  doc.text(date, metaRight, y + 27, { align: "right" });
  if (o.sellerName) {
    const lines = wrap(`Representante: ${o.sellerName}`, 220);
    doc.text(lines, metaRight, y + 41, { align: "right" });
  }
  y += headH + 26;
  hline(y, 2.5, EMERALD);
  y += 20;

  // ---- Representada / Cliente ----
  const coW = 150;
  const gap = 12;
  const clW = CW - coW - gap;
  const pad = 10;
  const coLines = wrap(o.company, coW - pad * 2);
  const clInfo = [
    o.client.cnpj ? `CNPJ ${formatCnpj(o.client.cnpj)}` : "",
    o.client.address || "",
    [o.client.phone, o.client.email].filter(Boolean).join(" • "),
  ].filter(Boolean);
  const clName = wrap(o.client.name, clW - pad * 2);
  const clInfoLines = clInfo.flatMap((l) => wrap(l, clW - pad * 2));
  const boxH = Math.max(
    pad * 2 + 14 + coLines.length * 14,
    pad * 2 + 14 + clName.length * 15 + clInfoLines.length * 12.5
  );
  doc.setDrawColor(SLATE_200[0], SLATE_200[1], SLATE_200[2]);
  doc.setLineWidth(1);
  doc.roundedRect(M, y, coW, boxH, 8, 8);
  doc.roundedRect(M + coW + gap, y, clW, boxH, 8, 8);
  font(true, 7.5);
  color(SLATE_400);
  doc.text("REPRESENTADA", M + pad, y + pad + 8);
  doc.text("CLIENTE", M + coW + gap + pad, y + pad + 8);
  font(true, 11);
  color(SLATE_900);
  doc.text(coLines, M + pad, y + pad + 24, { lineHeightFactor: 1.2 });
  doc.text(clName, M + coW + gap + pad, y + pad + 24, { lineHeightFactor: 1.2 });
  font(false, 9.5);
  color(SLATE_600);
  doc.text(clInfoLines, M + coW + gap + pad, y + pad + 24 + clName.length * 14 + 4, { lineHeightFactor: 1.3 });
  y += boxH + 22;

  // ---- Tabela de itens ----
  const wQtd = 46;
  const wUn = 78;
  const wDesc = hasItemDiscount ? 48 : 0;
  const wTot = 84;
  const wIdx = 24;
  const wProd = CW - wIdx - wQtd - wUn - wDesc - wTot;
  const xQtd = M + wIdx + wProd + wQtd; // alinhamento à direita das colunas numéricas
  const xUn = xQtd + wUn;
  const xDesc = xUn + wDesc;
  const xTot = M + CW;

  const drawTableHeader = () => {
    font(true, 7.5);
    color(SLATE_400);
    doc.text("#", M + wIdx / 2, y + 8, { align: "center" });
    doc.text("PRODUTO", M + wIdx + 4, y + 8);
    doc.text("QTD", xQtd, y + 8, { align: "right" });
    doc.text("PREÇO UN.", xUn, y + 8, { align: "right" });
    if (hasItemDiscount) doc.text("DESC.", xDesc, y + 8, { align: "right" });
    doc.text("TOTAL", xTot, y + 8, { align: "right" });
    hline(y + 14, 1.5, SLATE_900);
    y += 14;
  };

  const newPage = () => {
    doc.addPage();
    y = M;
  };

  drawTableHeader();
  o.items.forEach((i, idx) => {
    font(true, 10);
    const nameLines = wrap(i.product_name, wProd - 8);
    const code = i.product_code ? `Cód. ${i.product_code}` : "";
    const rowH = 10 + nameLines.length * 12 + (code ? 11 : 0);
    if (y + rowH > BOTTOM) {
      newPage();
      drawTableHeader();
    }
    const base = y + 14;
    font(false, 9);
    color(SLATE_400);
    doc.text(String(idx + 1), M + wIdx / 2, base, { align: "center" });
    font(true, 10);
    color(SLATE_900);
    doc.text(nameLines, M + wIdx + 4, base, { lineHeightFactor: 1.2 });
    if (code) {
      font(false, 8);
      color(SLATE_400);
      doc.text(pdfText(code), M + wIdx + 4, base + nameLines.length * 12 - 1);
    }
    font(false, 10);
    color(SLATE_900);
    doc.text(pdfText(i.quantity), xQtd, base, { align: "right" });
    doc.text(BRL(Number(i.unit_value) || 0), xUn, base, { align: "right" });
    if (hasItemDiscount) doc.text((i.discount_pct || 0) > 0 ? pctLabel(Number(i.discount_pct)) : "-", xDesc, base, { align: "right" });
    font(true, 10);
    doc.text(BRL(itemTotal(i)), xTot, base, { align: "right" });
    y += rowH;
    hline(y, 0.6, SLATE_200);
  });
  y += 18;

  // ---- Totais ----
  const mode = (a?: { mode: string; value: number } | null) => (a && a.mode === "pct" ? ` (${pctLabel(a.value)})` : "");
  const sumRows: { label: string; value: string; tone?: "neg" }[] = [];
  if (t.itemDiscounts > 0 || t.orderDiscount > 0 || t.tax > 0 || t.freight > 0) sumRows.push({ label: "Subtotal", value: BRL(t.subtotal) });
  if (t.orderDiscount > 0) sumRows.push({ label: `Desconto${mode(o.pricing?.discount)}`, value: `- ${BRL(t.orderDiscount)}`, tone: "neg" });
  if (t.tax > 0) sumRows.push({ label: `Impostos${mode(o.pricing?.tax)}`, value: `+ ${BRL(t.tax)}` });
  if (t.freight > 0) sumRows.push({ label: `Frete${mode(o.pricing?.freight)}`, value: `+ ${BRL(t.freight)}` });
  const sumW = 240;
  const sumX = M + CW - sumW;
  if (y + sumRows.length * 18 + 44 > BOTTOM) newPage();
  font(false, 10);
  sumRows.forEach((r) => {
    color(SLATE_600);
    font(false, 10);
    doc.text(pdfText(r.label), sumX, y);
    if (r.tone === "neg") color(RED);
    else color(SLATE_900);
    doc.text(pdfText(r.value), M + CW, y, { align: "right" });
    y += 18;
  });
  hline(y - 6, 1.5, SLATE_900, sumX, sumW);
  y += 10;
  font(true, 13);
  color(SLATE_900);
  doc.text("Total do pedido", sumX, y);
  color(EMERALD_DARK);
  doc.text(BRL(t.total), M + CW, y, { align: "right" });
  y += 30;

  // ---- Condição de pagamento / observações ----
  const info: { label: string; text: string }[] = [];
  if (o.paymentTerms) info.push({ label: "Condição de pagamento: ", text: o.paymentTerms });
  if (o.notes) info.push({ label: "Observações: ", text: o.notes });
  for (const it of info) {
    font(true, 10);
    const lw = doc.getTextWidth(it.label);
    font(false, 10);
    const lines = wrap(it.text, CW - lw);
    // primeira linha segue o rótulo; o resto quebra em largura total
    const first = lines[0] ?? "";
    const rest = wrap(lines.slice(1).join(" "), CW);
    const need = 14 + (lines.length > 1 ? rest.length * 13 : 0);
    if (y + need > BOTTOM) newPage();
    font(true, 10);
    color(SLATE_900);
    doc.text(pdfText(it.label), M, y);
    font(false, 10);
    color(SLATE_600);
    doc.text(first, M + lw, y);
    y += 14;
    if (lines.length > 1) {
      doc.text(rest, M, y, { lineHeightFactor: 1.3 });
      y += rest.length * 13;
    }
    y += 4;
  }

  // ---- Rodapé em todas as páginas ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    hline(PH - 44, 0.6, SLATE_200);
    font(false, 8);
    color(SLATE_400);
    doc.text("Gerado pelo Represente-Se! • www.representese.com", PW / 2, PH - 30, { align: "center" });
    if (pages > 1) doc.text(`Página ${p} de ${pages}`, M + CW, PH - 30, { align: "right" });
  }

  return doc.output("blob");
}

export function orderPdfFileName(orderNumber: string): string {
  return `pedido-${(orderNumber || "representese").replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;
}
