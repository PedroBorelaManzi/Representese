import React, { useMemo, useState } from "react";
import { Loader2, PackageOpen, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import type { Order, OrderItem } from "../types";

interface OrderSplitPanelProps {
  order: Order;
  items: OrderItem[];
  userId: string;
  onCancel: () => void;
  /** `novoValor` = valor que sobrou no pedido original, já recalculado. */
  onDone: (novoValor: number) => void;
}

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

interface SelectionState {
  checked: boolean;
  /** Quantidade a mover — default é a quantidade cheia do item (cobre "o
   *  item todo"); reduzir o número cobre "só algumas unidades". */
  qty: number;
}

/** Valor proporcional de `qty` unidades de um item: usa o valor unitário
 *  quando existe (mais preciso); sem ele, rateia o total pela quantidade. */
export function valorDeQtd(item: OrderItem, qty: number): number {
  if (item.unit_value != null) return item.unit_value * qty;
  const total = item.total_value || 0;
  return item.quantity > 0 ? total * (qty / item.quantity) : 0;
}

/** Dentro do detalhe do pedido (OrderDetailModal): separa itens/unidades que
 *  "ficaram de saldo" (não atendidos) num pedido novo — o original é
 *  reduzido pelo que sai, o novo nasce com vida própria (parcelas, entrega,
 *  comissão) igual qualquer outro pedido. */
export function OrderSplitPanel({ order, items, userId, onCancel, onDone }: OrderSplitPanelProps) {
  const [selection, setSelection] = useState<Record<string, SelectionState>>(() =>
    Object.fromEntries(items.map(i => [i.id, { checked: false, qty: i.quantity }]))
  );
  const [saving, setSaving] = useState(false);

  const setChecked = (itemId: string, checked: boolean) =>
    setSelection(prev => ({ ...prev, [itemId]: { ...prev[itemId], checked } }));

  const setQty = (item: OrderItem, rawQty: number) => {
    const qty = Math.max(1, Math.min(item.quantity, Math.round(rawQty) || 1));
    setSelection(prev => ({ ...prev, [item.id]: { ...prev[item.id], qty } }));
  };

  const movidos = useMemo(
    () => items.filter(i => selection[i.id]?.checked && selection[i.id]?.qty > 0),
    [items, selection]
  );

  const totalMovido = useMemo(
    () => movidos.reduce((sum, i) => sum + valorDeQtd(i, selection[i.id].qty), 0),
    [movidos, selection]
  );

  const confirmar = async () => {
    if (!movidos.length) {
      toast.error("Selecione ao menos um item pra desmembrar.");
      return;
    }
    setSaving(true);
    try {
      // 1. Cria o pedido novo com o que saiu.
      const { data: novoPedido, error: errNovo } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          client_id: order.client_id,
          category: order.category,
          value: totalMovido,
          payment_terms: order.payment_terms || null,
          file_name: order.file_name || null,
          file_path: order.file_path || null,
          source: "split",
          notes: `Desmembrado do pedido${order.order_number ? ` nº ${order.order_number}` : ""}`,
        })
        .select("id")
        .single();
      if (errNovo || !novoPedido) throw new Error(errNovo?.message || "Erro ao criar o pedido novo.");

      // 2. Itens do pedido novo — mesma identidade do produto (código/chave),
      // só a quantidade/valor movidos.
      const itensNovoPedido = movidos.map(i => {
        const qty = selection[i.id].qty;
        return {
          user_id: userId,
          order_id: novoPedido.id,
          client_id: order.client_id,
          category: order.category,
          product_name: i.product_name,
          product_key: i.product_key,
          product_code: i.product_code || null,
          quantity: qty,
          unit_value: i.unit_value ?? null,
          total_value: valorDeQtd(i, qty),
          order_date: i.order_date || new Date().toISOString(),
        };
      });
      const { error: errItens } = await supabase.from("order_items").insert(itensNovoPedido);
      if (errItens) throw new Error("Pedido novo criado, mas falhou ao gravar os itens: " + errItens.message);

      // 3. Reduz (ou remove, se moveu tudo) os itens do pedido original.
      for (const item of movidos) {
        const qty = selection[item.id].qty;
        if (qty >= item.quantity) {
          const { error } = await supabase.from("order_items").delete().eq("id", item.id);
          if (error) throw new Error("Erro ao remover item do pedido original: " + error.message);
        } else {
          const novaQtd = item.quantity - qty;
          const novoTotal = item.unit_value != null ? item.unit_value * novaQtd : (item.total_value || 0) - valorDeQtd(item, qty);
          const { error } = await supabase
            .from("order_items")
            .update({ quantity: novaQtd, total_value: novoTotal })
            .eq("id", item.id);
          if (error) throw new Error("Erro ao reduzir item do pedido original: " + error.message);
        }
      }

      // 4. Recalcula o valor do pedido original pela soma real dos itens que
      // sobraram — fonte única de verdade, sem risco de deriva de
      // arredondamento. O UPDATE na coluna `value` já dispara o trigger que
      // recalcula as parcelas sozinho.
      const { data: somaRestante } = await supabase
        .from("order_items")
        .select("total_value")
        .eq("order_id", order.id);
      const novoValor = (somaRestante || []).reduce((sum, r: any) => sum + (Number(r.total_value) || 0), 0);

      const { error: errUpdate } = await supabase.from("orders").update({ value: novoValor }).eq("id", order.id);
      if (errUpdate) throw new Error("Erro ao atualizar o valor do pedido original: " + errUpdate.message);

      toast.success(`Pedido desmembrado — ${brl(totalMovido)} viraram um pedido novo.`);
      onDone(novoValor);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao desmembrar o pedido.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <PackageOpen className="w-4 h-4 text-emerald-600 shrink-0" />
        <p className="text-xs font-black text-slate-900 dark:text-zinc-100">
          Selecione o que ficou de saldo (item inteiro ou só algumas unidades)
        </p>
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const sel = selection[item.id];
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                sel.checked ? "bg-white dark:bg-zinc-900 border-emerald-300 dark:border-emerald-800" : "bg-white/60 dark:bg-zinc-900/40 border-slate-100 dark:border-zinc-800"
              )}
            >
              <input
                type="checkbox"
                checked={sel.checked}
                onChange={e => setChecked(item.id, e.target.checked)}
                className="w-4 h-4 accent-emerald-600 cursor-pointer shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">{item.product_name}</p>
                <p className="text-[10px] font-medium text-slate-400">
                  {item.quantity} unidade{item.quantity === 1 ? "" : "s"} no pedido
                  {item.product_code ? ` · cód. ${item.product_code}` : ""}
                </p>
              </div>
              {sel.checked && (
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={item.quantity}
                    value={sel.qty}
                    onChange={e => setQty(item, Number(e.target.value))}
                    className="w-16 px-2 py-1.5 text-right text-xs font-black bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setQty(item, item.quantity)}
                    className="text-[9px] font-black uppercase text-slate-400 hover:text-emerald-600"
                    title="Mover o item inteiro"
                  >
                    tudo
                  </button>
                  <span className="text-xs font-black text-emerald-600 tabular-nums w-20 text-right">
                    {brl(valorDeQtd(item, sel.qty))}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-emerald-100 dark:border-emerald-900/30">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {movidos.length} item{movidos.length === 1 ? "" : "s"} selecionado{movidos.length === 1 ? "" : "s"} · vai pro pedido novo
        </p>
        <p className="text-sm font-black text-emerald-600 tabular-nums">{brl(totalMovido)}</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-white dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={saving || !movidos.length}
          className="flex-[2] py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Confirmar desmembramento
        </button>
      </div>
    </div>
  );
}
