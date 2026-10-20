// PDF do pedido criado em "Novo pedido" — mesmo padrão dos extratos
// (commissionsExport.ts): abre uma janela com HTML pronto e dispara a
// impressão, de onde o usuário escolhe "Salvar como PDF". Gerado sempre a
// partir dos dados salvos, então reflete edições feitas depois.

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

export function buildOrderPdfHtml(o: OrderPdfData): string {
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

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Pedido ${esc(o.orderNumber)} — ${esc(o.client.name)}</title>
<style>
  * { box-sizing: border-box; }
  body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;padding:44px;margin:0;background:#fff;font-size:13px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #10b981;padding-bottom:18px;margin-bottom:24px}
  .brand{font-size:24px;font-weight:900;letter-spacing:-.5px}.brand span{color:#10b981}
  .logo{display:block;max-height:64px;max-width:220px;object-fit:contain}
  .doc{font-size:12px;color:#475569;font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
  .meta{text-align:right;font-size:12px;color:#475569;font-weight:600;line-height:1.6}
  .parties{display:flex;gap:16px;margin-bottom:24px}
  .box{flex:1;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px}
  .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;font-weight:800;margin-bottom:6px}
  .box .n{font-size:15px;font-weight:800;margin-bottom:4px}
  .box .d{font-size:12px;color:#475569;line-height:1.5}
  table{width:100%;border-collapse:collapse}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;font-weight:800;text-align:left;padding:8px 10px;border-bottom:2px solid #0f172a}
  td{padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th.r,td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .center{text-align:center}.muted{color:#94a3b8}.strong{font-weight:800}
  .sub{font-size:11px;color:#94a3b8;margin-top:2px}
  .sum{width:300px;margin:20px 0 0 auto}
  .sum td{border:none;padding:5px 10px}
  .sum .neg td.num{color:#dc2626}
  .sum .grand td{border-top:2px solid #0f172a;padding-top:12px;font-size:16px;font-weight:900}
  .sum .grand td.num{color:#059669}
  .info{margin-top:24px;font-size:12px;color:#475569;line-height:1.6}
  .info b{color:#0f172a}
  .foot{margin-top:36px;font-size:10.5px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:14px}
  tr{page-break-inside:avoid}
  @media print { body{padding:24px} }
</style></head><body>
  <div class="head">
    <div>${/^data:image\//.test(o.logoUrl || "") ? `<img class="logo" src="${esc(o.logoUrl)}" alt="">` : '<div class="brand">Represente<span>-Se!</span></div>'}<div class="doc">Pedido de venda</div></div>
    <div class="meta"><b>Nº ${esc(o.orderNumber)}</b><br>${date}${o.sellerName ? `<br>Representante: ${esc(o.sellerName)}` : ""}</div>
  </div>
  <div class="parties">
    <div class="box"><div class="lbl">Empresa representada</div><div class="n">${esc(o.company)}</div></div>
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
  <div class="foot">Gerado pelo Represente-Se! · www.representese.com</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
</body></html>`;
}

/** Abre o PDF numa nova janela. Retorna false se o navegador bloqueou o pop-up. */
export function openOrderPdf(data: OrderPdfData): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildOrderPdfHtml(data));
  win.document.close();
  return true;
}
