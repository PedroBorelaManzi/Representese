import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, FileDown, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "./ui";
import { supabase } from "../lib/supabase";
import { posthog } from "../lib/posthog";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { ajustarFaturamento } from "../lib/faturamento";
import { chaveDoProduto } from "../lib/orderItems";
import { clampPct, computeOrderTotals, itemTotal, type AmountInput, type AmountMode, type OrderPricing } from "../lib/orderBuilder";
import { prepareOrderPdf, refreshOrderPdf, type OrderPdfView } from "../lib/orderPdfLoad";
import { PdfViewerModal } from "./PdfViewerModal";
import { cn } from "../lib/utils";
import type { CatalogItem } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Chamado depois de gravar, pra tela de trás recarregar a lista de pedidos. */
  onCreated?: () => void;
  /** Empresa já escolhida na tela de trás (filtro) — vem pré-selecionada. */
  defaultCompany?: string;
}

interface Row {
  key: number;
  name: string;
  code: string;
  qty: string;
  price: string;
  discount: string;
  /** Veio do catálogo (não precisa cadastrar de novo ao salvar). */
  fromCatalog: boolean;
}

interface ClientOption { id: string; name: string; cnpj?: string | null }

const BRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

/** "1.234,50" e "12.5" → número. Vazio/inválido → 0. */
function parseNum(s: string): number {
  const t = (s || "").trim();
  if (!t) return 0;
  const n = t.includes(",") ? parseFloat(t.replace(/\./g, "").replace(",", ".")) : parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

const inputCls =
  "w-full px-3 py-2.5 rounded-xl text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400";
const labelCls = "block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-1";

const emptyRow = (key: number): Row => ({ key, name: "", code: "", qty: "1", price: "", discount: "", fromCatalog: false });

/** Campo "valor + alternar % / R$" usado em desconto, impostos e frete. */
function AmountField({ label, value, mode, onValue, onMode }: {
  label: string; value: string; mode: AmountMode; onValue: (v: string) => void; onMode: (m: AmountMode) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex gap-1.5">
        <input inputMode="decimal" value={value} onChange={(e) => onValue(e.target.value)} placeholder="0" className={inputCls} />
        <div className="flex shrink-0 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
          {(["pct", "brl"] as AmountMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              className={cn(
                "px-3 text-xs font-black transition-colors",
                mode === m ? "bg-emerald-600 text-white" : "bg-white dark:bg-zinc-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-zinc-800"
              )}
            >
              {m === "pct" ? "%" : "R$"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Campo com lista de sugestões (clique escolhe). Substitui <select> nativo,
 *  que dentro do modal não deixava escolher o cliente. */
function Combo<T>({ value, onChange, options, getLabel, onPick, placeholder, disabled, allowFree }: {
  value: string; onChange: (v: string) => void; options: T[]; getLabel: (o: T) => string;
  onPick: (o: T) => void; placeholder?: string; disabled?: boolean; allowFree?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const list = options.filter((o) => !q || getLabel(o).toLowerCase().includes(q)).slice(0, 50);
  return (
    <div className="relative">
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputCls}
      />
      {open && list.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
          {list.map((o, i) => (
            <li key={i}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(o); setOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm text-slate-800 dark:text-zinc-100 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                {getLabel(o)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {allowFree && open && list.length === 0 && q && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl px-3 py-2 text-xs text-slate-500">Nova condição: fica salva pras próximas vezes.</div>
      )}
    </div>
  );
}

const DEFAULT_PAYMENT_TERMS = ["À vista", "7 dias", "14 dias", "21 dias", "28 dias", "30 dias", "45 dias", "60 dias", "15/30", "30/60", "15/30/45", "28/35/42", "30/60/90", "30/60/90/120"];

export function NewOrderModal({ isOpen, onClose, onCreated, defaultCompany }: Props) {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const companies: string[] = settings.categories || [];

  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [company, setCompany] = useState(defaultCompany && companies.includes(defaultCompany) ? defaultCompany : "");
  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);
  const [generatedPdf, setGeneratedPdf] = useState<OrderPdfView | null>(null);
  const [openSuggest, setOpenSuggest] = useState<number | null>(null);
  const [discount, setDiscount] = useState({ value: "", mode: "pct" as AmountMode });
  const [tax, setTax] = useState({ value: "", mode: "pct" as AmountMode });
  const [freight, setFreight] = useState({ value: "", mode: "brl" as AmountMode });
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["order_builder_clients", user?.id],
    queryFn: async (): Promise<ClientOption[]> => {
      const { data, error } = await supabase.from("clients").select("id, name, cnpj").eq("user_id", user!.id).order("name");
      if (error) throw error;
      return (data as ClientOption[]) || [];
    },
    enabled: !!user && isOpen,
  });

  // Mesma chave do CatalogoProdutos: cadastrar aqui já aparece lá, e vice-versa.
  const { data: catalog = [] } = useQuery({
    queryKey: ["product_catalog", user?.id],
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await supabase.from("product_catalog").select("*").eq("user_id", user!.id).order("name");
      if (error) throw error;
      return (data as CatalogItem[]) || [];
    },
    enabled: !!user && isOpen,
    refetchOnMount: "always",
  });

  const termOptions = useMemo(
    () => [...(settings.custom_payment_terms || []), ...DEFAULT_PAYMENT_TERMS.filter((t) => !(settings.custom_payment_terms || []).includes(t))],
    [settings.custom_payment_terms]
  );

  const companyCatalog = useMemo(() => catalog.filter((c) => c.category === company), [catalog, company]);

  const pricing: OrderPricing = {
    discount: { mode: discount.mode, value: parseNum(discount.value) },
    tax: { mode: tax.mode, value: parseNum(tax.value) },
    freight: { mode: freight.mode, value: parseNum(freight.value) },
  };
  const priced = rows.map((r) => ({ quantity: parseNum(r.qty), unit_value: parseNum(r.price), discount_pct: clampPct(parseNum(r.discount)) }));
  const totals = computeOrderTotals(priced, pricing);

  const patchRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pickProduct = (key: number, p: CatalogItem) =>
    patchRow(key, { name: p.name, code: p.code || "", price: p.price != null ? String(p.price).replace(".", ",") : "", discount: p.discount_pct ? String(p.discount_pct).replace(".", ",") : "", fromCatalog: true });

  const reset = () => {
    setClientId(""); setClientSearch(""); setCompany(defaultCompany && companies.includes(defaultCompany) ? defaultCompany : "");
    setRows([emptyRow(1)]); setDiscount({ value: "", mode: "pct" }); setTax({ value: "", mode: "pct" });
    setFreight({ value: "", mode: "brl" }); setPaymentTerms(""); setNotes(""); setSavedOrderId(null);
  };
  const close = () => { onClose(); setTimeout(reset, 200); };

  const save = async () => {
    if (!user) return;
    if (!clientId) { toast.error("Escolha o cliente."); return; }
    if (!company) { toast.error("Escolha a empresa."); return; }
    const valid = rows.filter((r) => r.name.trim());
    if (valid.length === 0) { toast.error("Adicione pelo menos um produto."); return; }
    if (valid.some((r) => parseNum(r.qty) <= 0)) { toast.error("Todo produto precisa de quantidade."); return; }
    if (valid.some((r) => parseNum(r.price) <= 0)) { toast.error("Informe o preço de todos os produtos."); return; }
    if (!navigator.onLine) { toast.error("Sem internet: conecte-se para criar o pedido."); return; }

    setSaving(true);
    let orderId: string | null = null;
    try {
      const items = valid.map((r) => ({
        name: r.name.trim(), code: r.code.trim() || null, quantity: parseNum(r.qty), unit_value: parseNum(r.price),
        discount_pct: clampPct(parseNum(r.discount)), fromCatalog: r.fromCatalog,
      }));
      const t = computeOrderTotals(items, pricing);
      if (t.total <= 0) { toast.error("O total do pedido está zerado."); setSaving(false); return; }

      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert([{
          user_id: user.id, client_id: clientId, category: company, value: t.total, source: "builder",
          pricing, payment_terms: paymentTerms.trim() || null, notes: notes.trim() || null,
        }])
        .select("id, created_at")
        .single();
      if (oErr) throw oErr;
      orderId = order.id;

      const { error: iErr } = await supabase.from("order_items").insert(
        items.map((i) => ({
          user_id: user.id, order_id: order.id, client_id: clientId, category: company,
          product_name: i.name, product_key: chaveDoProduto(i.name), product_code: i.code,
          quantity: i.quantity, unit_value: i.unit_value, discount_pct: i.discount_pct || null,
          total_value: itemTotal(i), order_date: order.created_at,
        }))
      );
      if (iErr) throw iErr;

      // Produto digitado à mão entra no catálogo da empresa na primeira vez;
      // da próxima, aparece na lista pra escolher.
      const known = new Set(companyCatalog.map((c) => chaveDoProduto(c.name)));
      const novos = new Map<string, typeof items[number]>();
      items.forEach((i) => {
        const k = chaveDoProduto(i.name);
        if (!i.fromCatalog && !known.has(k) && !novos.has(k)) novos.set(k, i);
      });
      if (novos.size > 0) {
        const { data: criados, error: cErr } = await supabase.from("product_catalog").insert(
          [...novos.values()].map((i) => ({ user_id: user.id, category: company, name: i.name, code: i.code, unit_type: "unidade", price: i.unit_value }))
        ).select();
        if (cErr) {
          console.warn("Não consegui cadastrar os produtos novos no catálogo:", cErr.message);
          toast.error("Pedido salvo, mas não consegui cadastrar os produtos novos no catálogo.");
        } else if (criados) {
          // Entra direto no cache (que o app guarda entre sessões) pra aparecer no catálogo na hora.
          queryClient.setQueryData<CatalogItem[]>(["product_catalog", user.id], (old) => [...(old || []), ...(criados as CatalogItem[])]);
        }
        queryClient.invalidateQueries({ queryKey: ["product_catalog", user.id] });
      }

      const { data: c } = await supabase.from("clients").select("faturamento").eq("id", clientId).single();
      if (c) {
        await supabase.from("clients").update({ faturamento: ajustarFaturamento(c.faturamento, company, t.total) }).eq("id", clientId).eq("user_id", user.id);
      }

      // Condição digitada que ainda não existe na lista fica salva pras próximas.
      const termo = paymentTerms.trim();
      if (termo && !termOptions.some((t) => t.toLowerCase() === termo.toLowerCase())) {
        updateSettings({ custom_payment_terms: [termo, ...(settings.custom_payment_terms || [])].slice(0, 30) }).catch(() => {});
      }

      queryClient.invalidateQueries({ queryKey: ["clients"] });
      posthog.capture("order_logged", { category: company, source: "builder" });
      onCreated?.();
      setSavedOrderId(order.id);
      void refreshOrderPdf(order.id); // já deixa o PDF guardado no aparelho
      toast.success("Pedido criado!");
    } catch (err) {
      // Pedido sem itens ficaria órfão e somaria valor sem produto nenhum.
      if (orderId) await supabase.from("orders").delete().eq("id", orderId).eq("user_id", user.id);
      toast.error(err instanceof Error ? err.message : "Não consegui criar o pedido.");
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!savedOrderId) return;
    setGeneratingPdf(true);
    try {
      const view = await prepareOrderPdf(savedOrderId);
      if (!view) toast.error("Não consegui gerar o PDF.");
      else setGeneratedPdf(view);
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (savedOrderId) {
    return (
      <>
      <Modal isOpen={isOpen} onClose={close} title="Pedido criado">
        <div className="p-6 flex flex-col items-center text-center gap-4">
          <CheckCircle2 className="w-14 h-14 text-emerald-500" />
          <div>
            <p className="text-lg font-black text-slate-900 dark:text-zinc-100">{BRL(totals.total)}</p>
            <p className="text-sm text-slate-500 dark:text-zinc-400">O pedido já está salvo em Empresas &amp; Pedidos. O PDF pode ser baixado agora ou depois, abrindo o pedido.</p>
          </div>
          <button disabled={generatingPdf} onClick={downloadPdf} className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all disabled:opacity-60">
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {generatingPdf ? "Gerando PDF..." : "Ver / salvar PDF"}
          </button>
          <button onClick={close} className="text-xs font-bold text-slate-400 hover:text-slate-600">Fechar</button>
        </div>
      </Modal>
      <PdfViewerModal
        isOpen={!!generatedPdf}
        onClose={() => { generatedPdf?.dispose(); setGeneratedPdf(null); }}
        url={generatedPdf?.url ?? null}
        fileName={generatedPdf?.fileName}
        onDownload={() => { generatedPdf?.share().catch(() => toast.error("Não consegui abrir o compartilhamento.")); }}
      />
      </>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title="Novo pedido" maxWidth="max-w-3xl">
      <div className="p-5 sm:p-6 space-y-6">
        {/* Cliente e empresa */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Cliente</label>
            <Combo
              value={clientSearch}
              onChange={(v) => { setClientSearch(v); setClientId(""); }}
              options={clients}
              getLabel={(c) => c.name}
              onPick={(c) => { setClientId(c.id); setClientSearch(c.name); }}
              placeholder="Buscar e escolher o cliente…"
            />
            {clientId && <p className="text-[11px] text-emerald-600 mt-1.5 font-bold">Cliente selecionado ✓</p>}
          </div>
          <div>
            <label className={labelCls}>Empresa representada</label>
            <select
              value={company}
              onChange={(e) => { setCompany(e.target.value); setRows((rs) => rs.map((r) => ({ ...r, fromCatalog: false }))); }}
              className={inputCls}
            >
              <option value="">Selecione…</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {company && (
              <p className="text-[11px] text-slate-400 mt-1.5">
                {companyCatalog.length > 0 ? `${companyCatalog.length} produto(s) cadastrado(s) nesta empresa.` : "Nenhum produto cadastrado ainda: o que você digitar fica salvo pra próxima."}
              </p>
            )}
          </div>
        </div>

        {/* Produtos */}
        <div>
          <label className={labelCls}>Produtos</label>
          <div className="space-y-3">
            {rows.map((r) => {
              const q = r.name.trim().toLowerCase();
              const suggestions = companyCatalog.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q)).slice(0, 8);
              return (
                <div key={r.key} className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-3 space-y-2.5 bg-slate-50/50 dark:bg-zinc-900/50">
                  <div className="relative">
                    <input
                      value={r.name}
                      onChange={(e) => patchRow(r.key, { name: e.target.value, fromCatalog: false })}
                      onFocus={() => setOpenSuggest(r.key)}
                      onBlur={() => setTimeout(() => setOpenSuggest((k) => (k === r.key ? null : k)), 150)}
                      placeholder={company ? "Produto: escolha da lista ou digite" : "Escolha a empresa primeiro"}
                      disabled={!company}
                      className={inputCls}
                    />
                    {openSuggest === r.key && suggestions.length > 0 && (
                      <ul className="absolute z-20 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                        {suggestions.map((p) => (
                          <li key={p.id}>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { pickProduct(r.key, p); setOpenSuggest(null); }}
                              className="w-full flex justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                              <span className="truncate text-slate-800 dark:text-zinc-100">{p.name}{p.code ? <span className="text-slate-400"> · {p.code}</span> : null}</span>
                              {p.price != null && <span className="shrink-0 font-bold text-emerald-600">{BRL(Number(p.price))}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_1.4fr_1fr] sm:grid-cols-[1fr_1.4fr_1fr_1.4fr_auto] gap-2 items-end">
                    <div><label className={labelCls}>Qtd</label><input inputMode="decimal" value={r.qty} onChange={(e) => patchRow(r.key, { qty: e.target.value })} className={inputCls} /></div>
                    <div><label className={labelCls}>Preço un. (R$)</label><input inputMode="decimal" value={r.price} onChange={(e) => patchRow(r.key, { price: e.target.value })} placeholder="0,00" className={inputCls} /></div>
                    <div><label className={labelCls}>Desc. %</label><input inputMode="decimal" value={r.discount} onChange={(e) => patchRow(r.key, { discount: e.target.value })} placeholder="0" className={inputCls} /></div>
                    <div className="col-span-2 sm:col-span-1 text-right">
                      <label className={labelCls}>Total</label>
                      <div className="py-2.5 text-sm font-black text-slate-900 dark:text-zinc-100 tabular-nums">{BRL(itemTotal({ quantity: parseNum(r.qty), unit_value: parseNum(r.price), discount_pct: clampPct(parseNum(r.discount)) }))}</div>
                    </div>
                    <button type="button" aria-label="Remover produto" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [emptyRow(r.key)]))}
                      className="justify-self-end p-2.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow(Math.max(...rs.map((x) => x.key)) + 1)])}
            className="mt-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700">
            <Plus className="w-4 h-4" /> Adicionar produto
          </button>
        </div>

        {/* Desconto geral, impostos e frete */}
        <div className="grid sm:grid-cols-3 gap-4">
          <AmountField label="Desconto no pedido" value={discount.value} mode={discount.mode} onValue={(v) => setDiscount((d) => ({ ...d, value: v }))} onMode={(m) => setDiscount((d) => ({ ...d, mode: m }))} />
          <AmountField label="Impostos" value={tax.value} mode={tax.mode} onValue={(v) => setTax((d) => ({ ...d, value: v }))} onMode={(m) => setTax((d) => ({ ...d, mode: m }))} />
          <AmountField label="Frete" value={freight.value} mode={freight.mode} onValue={(v) => setFreight((d) => ({ ...d, value: v }))} onMode={(m) => setFreight((d) => ({ ...d, mode: m }))} />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Condição de pagamento (opcional)</label>
            <Combo value={paymentTerms} onChange={setPaymentTerms} options={termOptions} getLabel={(t) => t} onPick={(t: string) => setPaymentTerms(t)} placeholder="Escolha ou digite (ex.: 30/60/90)" allowFree />
          </div>
          <div><label className={labelCls}>Observações (opcional)</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></div>
        </div>

        {/* Resumo */}
        <div className="rounded-2xl bg-slate-50 dark:bg-zinc-800/50 p-4 space-y-1.5 text-sm tabular-nums">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{BRL(totals.subtotal)}</span></div>
          {totals.orderDiscount > 0 && <div className="flex justify-between text-red-500"><span>Desconto</span><span>− {BRL(totals.orderDiscount)}</span></div>}
          {totals.tax > 0 && <div className="flex justify-between text-slate-500"><span>Impostos</span><span>+ {BRL(totals.tax)}</span></div>}
          {totals.freight > 0 && <div className="flex justify-between text-slate-500"><span>Frete</span><span>+ {BRL(totals.freight)}</span></div>}
          <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-zinc-700 text-base font-black text-slate-900 dark:text-zinc-100"><span>Total</span><span className="text-emerald-600">{BRL(totals.total)}</span></div>
        </div>

        <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-lg shadow-emerald-600/25 active:scale-95 transition-all">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Salvar pedido
        </button>
      </div>
    </Modal>
  );
}
