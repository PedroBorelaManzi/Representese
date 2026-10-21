// PDF do pedido criado em "Novo pedido". Gera o PDF de verdade no cliente
// (html2canvas captura o layout + jsPDF monta o arquivo) e dispara o download
// direto, sem abrir janela nova — window.open()/print() era bloqueado pelo
// navegador como pop-up, principalmente no celular, e mesmo quando não
// bloqueava dependia da pessoa escolher manualmente "Salvar como PDF" na
// caixa de impressão (que no navegador mobile nem sempre tem essa opção).

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

const BRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const pctLabel = (n: number) => `${String(Number(n.toFixed(2))).replace(".", ",")}%`;

function formatCnpj(raw?: string | null): string {
  const d = (raw || "").replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : raw || "";
}

const PDF_STYLES = `
  * { box-sizing: border-box; }
  #order-pdf-root{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;padding:44px;margin:0;background:#fff;font-size:13px;width:780px}
  #order-pdf-root .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #10b981;padding-bottom:18px;margin-bottom:24px}
  #order-pdf-root .brand{font-size:24px;font-weight:900;letter-spacing:-.5px}#order-pdf-root .brand span{color:#10b981}
  #order-pdf-root .logo{display:block;max-height:64px;max-width:220px;object-fit:contain}
  #order-pdf-root .doc{font-size:12px;color:#475569;font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
  #order-pdf-root .meta{text-align:right;font-size:12px;color:#475569;font-weight:600;line-height:1.6}
  #order-pdf-root .parties{display:flex;align-items:flex-start;gap:16px;margin-bottom:24px}
  #order-pdf-root .box{flex:1 1 0;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px}
  #order-pdf-root .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;font-weight:800;margin-bottom:6px}
  #order-pdf-root .box.co{flex:0 0 auto;max-width:34%}
  #order-pdf-root .box.co .n{margin-bottom:0}
  #order-pdf-root .box .n{font-size:15px;font-weight:800;margin-bottom:4px}
  #order-pdf-root .box .d{font-size:12px;color:#475569;line-height:1.5}
  #order-pdf-root table{width:100%;border-collapse:collapse}
  #order-pdf-root th{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;font-weight:800;text-align:left;padding:8px 10px;border-bottom:2px solid #0f172a}
  #order-pdf-root td{padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  #order-pdf-root th.r,#order-pdf-root td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  #order-pdf-root .center{text-align:center}#order-pdf-root .muted{color:#94a3b8}#order-pdf-root .strong{font-weight:800}
  #order-pdf-root .sub{font-size:11px;color:#94a3b8;margin-top:2px}
  #order-pdf-root .sum{width:300px;margin:20px 0 0 auto}
  #order-pdf-root .sum td{border:none;padding:5px 10px}
  #order-pdf-root .sum .neg td.num{color:#dc2626}
  #order-pdf-root .sum .grand td{border-top:2px solid #0f172a;padding-top:12px;font-size:16px;font-weight:900}
  #order-pdf-root .sum .grand td.num{color:#059669}
  #order-pdf-root .info{margin-top:24px;font-size:12px;color:#475569;line-height:1.6}
  #order-pdf-root .info b{color:#0f172a}
  #order-pdf-root .foot{margin-top:36px;font-size:10.5px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:14px}
`;

function buildOrderPdfBody(o: OrderPdfData): string {
  const t = computeOrderTotals(o.items, o.pricing);
  const hasItemDiscount = o.items.some((i) => (i.discount_pct || 0) > 0);
  const date = new Date(o.date).toLocaleDateString("pt-BR");

  const rows = o.items
    .map(
      (i, idx) => `<tr>
        <td class="center muted">${idx + 1}</td>
        <td>${esc(i.product_name)}${i.product_code ? `<div class="sub">Cód. ${esc(i.product_code)}</div>` : ""}</td>
        <td class="num">${esc(i.quantity)}</td>
        <td class="num">${BRL(Number(i.unit_value) || 0)}</td>
        ${hasItemDiscount ? `<td class="num">${(i.discount_pct || 0) > 0 ? pctLabel(Number(i.discount_pct)) : "—"}</td>` : ""}
        <td class="num strong">${BRL(itemTotal(i))}</td>
      </tr>`
    )
    .join("");

  const line = (label: string, value: string, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="num">${value}</td></tr>`;
  const mode = (a?: { mode: string; value: number } | null) => (a && a.mode === "pct" ? ` (${pctLabel(a.value)})` : "");
  const totals = [
    t.itemDiscounts > 0 || t.orderDiscount > 0 || t.tax > 0 || t.freight > 0 ? line("Subtotal", BRL(t.subtotal)) : "",
    t.orderDiscount > 0 ? line(`Desconto${mode(o.pricing?.discount)}`, `− ${BRL(t.orderDiscount)}`, "neg") : "",
    t.tax > 0 ? line(`Impostos${mode(o.pricing?.tax)}`, `+ ${BRL(t.tax)}`) : "",
    t.freight > 0 ? line(`Frete${mode(o.pricing?.freight)}`, `+ ${BRL(t.freight)}`) : "",
    line("Total do pedido", BRL(t.total), "grand"),
  ].join("");

  return `
  <div class="head">
    <div>${/^data:image\//.test(o.logoUrl || "") ? `<img class="logo" src="${esc(o.logoUrl)}" alt="">` : '<div class="brand">Represente<span>-Se!</span></div>'}<div class="doc">Pedido de venda</div></div>
    <div class="meta"><b>Nº ${esc(o.orderNumber)}</b><br>${date}${o.sellerName ? `<br>Representante: <b>${esc(o.sellerName)}</b>` : ""}</div>
  </div>
  <div class="parties">
    <div class="box co"><div class="lbl">Representada</div><div class="n">${esc(o.company)}</div></div>
    <div class="box"><div class="lbl">Cliente</div><div class="n">${esc(o.client.name)}</div>
      <div class="d">${[o.client.cnpj ? `CNPJ ${esc(formatCnpj(o.client.cnpj))}` : "", o.client.address ? esc(o.client.address) : "", [o.client.phone, o.client.email].filter(Boolean).map(esc).join(" · ")].filter(Boolean).join("<br>")}</div>
    </div>
  </div>
  <table>
    <thead><tr><th class="center" style="width:32px">#</th><th>Produto</th><th class="r">Qtd</th><th class="r">Preço un.</th>${hasItemDiscount ? '<th class="r">Desc.</th>' : ""}<th class="r">Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="sum"><tbody>${totals}</tbody></table>
  ${o.paymentTerms || o.notes ? `<div class="info">${o.paymentTerms ? `<div><b>Condição de pagamento:</b> ${esc(o.paymentTerms)}</div>` : ""}${o.notes ? `<div><b>Observações:</b> ${esc(o.notes)}</div>` : ""}</div>` : ""}
  <div class="foot">Gerado pelo Represente-Se! · www.representese.com</div>`;
}

/** Espera imagens dentro do elemento carregarem (ex.: logo em base64) antes de
 *  capturar — sem isso o html2canvas podia tirar a "foto" com a logo em branco. */
function waitForImages(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();
  return Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 2000);
          })
    )
  ).then(() => undefined);
}

/**
 * Gera o PDF do pedido e baixa direto — sem janela nova, sem depender de
 * pop-up. Renderiza o layout fora da tela (mesma página, elemento escondido),
 * captura com html2canvas e monta o PDF com jsPDF, paginando se o conteúdo
 * passar de uma folha A4. Retorna false só se algo der errado na geração
 * (não existe mais o caso "bloqueado pelo navegador").
 */
export async function downloadOrderPdf(data: OrderPdfData): Promise<boolean> {
  let container: HTMLDivElement | null = null;
  try {
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);

    const styleEl = document.createElement("style");
    styleEl.textContent = PDF_STYLES;

    container = document.createElement("div");
    // Fora da tela, mas ainda no fluxo normal do layout (não display:none —
    // html2canvas não renderiza elementos sem dimensão).
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "-99999px";
    container.style.zIndex = "-1";
    container.id = "order-pdf-root";
    container.innerHTML = buildOrderPdfBody(data);
    container.appendChild(styleEl);
    document.body.appendChild(container);

    await waitForImages(container);

    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff", useCORS: true });

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const imgData = canvas.toDataURL("image/png");

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    } else {
      // Conteúdo mais alto que uma página: fatia a MESMA imagem em pedaços de
      // altura de página, desenhando cada fatia numa página nova (mesma
      // técnica usada em qualquer export html2canvas+jsPDF multi-página).
      let renderedHeight = 0;
      let page = 0;
      while (renderedHeight < imgHeight) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, -renderedHeight, imgWidth, imgHeight);
        renderedHeight += pageHeight;
        page++;
      }
    }

    pdf.save(`pedido-${(data.orderNumber || "representese").replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`);
    return true;
  } catch (e) {
    console.error("Erro ao gerar PDF do pedido:", e);
    return false;
  } finally {
    container?.remove();
  }
}
