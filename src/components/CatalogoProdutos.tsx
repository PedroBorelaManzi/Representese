import React, { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, Trash2, Package, Hash, Percent, Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { parseCatalogFile } from "../lib/catalogImport";
import { chaveDoProduto } from "../lib/orderItems";
import { EmptyState } from "./ui";
import type { CatalogItem } from "../types";

const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const inputCls =
  "w-full bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-zinc-700 focus:border-emerald-400 focus:bg-white dark:focus:bg-zinc-900 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 dark:text-zinc-100 outline-none transition-colors";

interface CatalogoProdutosProps {
  categoriaFiltro: string;
  categoriasDisponiveis: string[];
}

/** Catálogo de produtos por representada: sobe uma planilha/PDF da fábrica
 *  (lista de preços) e a IA extrai nome, código, preço (unitário/caixa),
 *  desconto e comissão de cada item — diferente do ranking de vendas
 *  (order_items), que só existe depois de um pedido lançado. Comissão salva
 *  aqui já alimenta settings.product_commissions (mesma chave usada em
 *  Produtos → detalhe do produto), então passa a valer nos pedidos futuros
 *  desse produto assim que a empresa estiver em modo "Por produto". */
export function CatalogoProdutos({ categoriaFiltro, categoriasDisponiveis }: CatalogoProdutosProps) {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["product_catalog", user?.id],
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await supabase
        .from("product_catalog")
        .select("*")
        .eq("user_id", user!.id)
        .order("name");
      if (error) throw error;
      return (data as CatalogItem[]) || [];
    },
    enabled: !!user,
  });

  const itensDaEmpresa = useMemo(
    () => (categoriaFiltro ? items.filter((i) => i.category === categoriaFiltro) : items),
    [items, categoriaFiltro]
  );

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["product_catalog", user?.id] });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user || !categoriaFiltro) return;

    setUploading(true);
    try {
      const parsed = await parseCatalogFile(file);
      if (parsed.length === 0) {
        toast.error("Não encontrei produtos nesse arquivo. Confira se é a lista de preços certa.");
        return;
      }

      const linhas = parsed.map((item) => ({
        user_id: user.id,
        category: categoriaFiltro,
        name: item.name,
        code: item.code || null,
        unit_type: item.unitType,
        price: item.price ?? null,
        discount_pct: item.discountPct ?? null,
        commission_pct: item.commissionPct ?? null,
      }));

      const { error } = await supabase.from("product_catalog").insert(linhas);
      if (error) throw error;

      // Comissão que já veio no catálogo alimenta o mecanismo de comissão por
      // produto na hora — sem isso, o usuário precisaria abrir cada produto
      // de novo em Produtos pra digitar o mesmo % que acabou de subir.
      const comPct = parsed.filter((p) => p.commissionPct !== undefined);
      if (comPct.length > 0) {
        const merged = { ...(settings?.product_commissions || {}) };
        comPct.forEach((p) => { merged[`${categoriaFiltro}::${chaveDoProduto(p.name)}`] = p.commissionPct!; });
        await updateSettings({ product_commissions: merged });
      }

      toast.success(`${linhas.length} produto${linhas.length !== 1 ? "s" : ""} importado${linhas.length !== 1 ? "s" : ""} pro catálogo!`);
      invalidar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar o catálogo.");
    } finally {
      setUploading(false);
    }
  };

  const saveItemField = async (item: CatalogItem, field: keyof CatalogItem, rawValue: string) => {
    const numericFields: (keyof CatalogItem)[] = ["price", "discount_pct", "commission_pct"];
    const value: string | number | null = numericFields.includes(field)
      ? (rawValue.trim() ? parseFloat(rawValue.replace(",", ".")) : null)
      : (rawValue || null);
    if (typeof value === "number" && !isFinite(value)) return;

    const { error } = await supabase.from("product_catalog").update({ [field]: value }).eq("id", item.id);
    if (error) { toast.error("Erro ao salvar."); return; }

    // % de comissão editado aqui reflete direto no mesmo lugar que o detalhe
    // do produto em Produtos usa — as duas telas ficam sempre em sincronia.
    if (field === "commission_pct") {
      const merged = { ...(settings?.product_commissions || {}) };
      const key = `${item.category}::${chaveDoProduto(item.name)}`;
      if (value === null) delete merged[key]; else merged[key] = value as number;
      await updateSettings({ product_commissions: merged });
    }

    queryClient.setQueryData<CatalogItem[]>(["product_catalog", user?.id], (old) =>
      (old || []).map((i) => (i.id === item.id ? { ...i, [field]: value } : i))
    );
  };

  const deleteItem = async (item: CatalogItem) => {
    const { error } = await supabase.from("product_catalog").delete().eq("id", item.id);
    if (error) { toast.error("Erro ao excluir."); return; }
    queryClient.setQueryData<CatalogItem[]>(["product_catalog", user?.id], (old) => (old || []).filter((i) => i.id !== item.id));
    toast.success("Produto removido do catálogo.");
  };

  if (!categoriaFiltro) {
    return (
      <EmptyState
        icon={Tag}
        title="Escolha uma representada"
        description={
          categoriasDisponiveis.length === 0
            ? "Cadastre uma empresa representada primeiro, na aba Empresas."
            : "O catálogo é separado por representada — selecione uma ali em cima pra subir a lista de preços ou ver os produtos já cadastrados."
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">Catálogo — {categoriaFiltro}</h3>
          <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 mt-0.5">
            Suba a lista de preços (Excel, PDF ou foto) e a IA já cadastra nome, código, preço, desconto e comissão de cada item.
          </p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-50 shrink-0"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Lendo arquivo..." : "Subir lista de preços"}
          </button>
        </div>
      </div>

      {settings?.commission_mode?.[categoriaFiltro] !== "per_product" && itensDaEmpresa.length > 0 && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-900/30 px-4 py-3 text-[11px] font-bold text-amber-700 dark:text-amber-400">
          {categoriaFiltro} está com comissão fixa por empresa hoje — a comissão de cada produto do catálogo só entra na conta depois de ativar "Por produto" em Comissões → Configurar %.
        </div>
      )}

      {isLoading ? (
        <div className="py-16 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : itensDaEmpresa.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto no catálogo ainda"
          description={`Suba a lista de preços de ${categoriaFiltro} pra cadastrar os produtos de uma vez.`}
        />
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <div className="min-w-[880px]">
              <div className="grid grid-cols-12 px-5 py-4 border-b border-slate-100 dark:border-zinc-800 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <div className="col-span-4">Produto</div>
                <div className="col-span-2">Código</div>
                <div className="col-span-2">Preço</div>
                <div className="col-span-2">Desconto</div>
                <div className="col-span-1">Comissão</div>
                <div className="col-span-1" />
              </div>
              <div className="divide-y divide-slate-50 dark:divide-zinc-850">
                {itensDaEmpresa.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 px-5 py-2 items-center hover:bg-slate-50 dark:hover:bg-zinc-950/40 transition-colors">
                    <div className="col-span-4">
                      <input
                        type="text"
                        defaultValue={item.name}
                        onBlur={(e) => e.target.value.trim() && e.target.value !== item.name && saveItemField(item, "name", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <Hash className="w-3 h-3 text-slate-300 shrink-0" />
                      <input
                        type="text"
                        defaultValue={item.code || ""}
                        placeholder="—"
                        onBlur={(e) => e.target.value !== (item.code || "") && saveItemField(item, "code", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <select
                        defaultValue={item.unit_type}
                        onChange={(e) => saveItemField(item, "unit_type", e.target.value)}
                        className="bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-zinc-700 rounded-lg px-1 py-1.5 text-[10px] font-black uppercase text-slate-500 outline-none shrink-0"
                      >
                        <option value="unidade">Un.</option>
                        <option value="caixa">Cx.</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={item.price ?? ""}
                        placeholder={brl(0)}
                        onBlur={(e) => e.target.value !== String(item.price ?? "") && saveItemField(item, "price", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={100}
                        defaultValue={item.discount_pct ?? ""}
                        placeholder="—"
                        onBlur={(e) => e.target.value !== String(item.discount_pct ?? "") && saveItemField(item, "discount_pct", e.target.value)}
                        className={inputCls}
                      />
                      <Percent className="w-3 h-3 text-slate-300 shrink-0" />
                    </div>
                    <div className="col-span-1 flex items-center gap-1">
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={100}
                        defaultValue={item.commission_pct ?? ""}
                        placeholder="—"
                        onBlur={(e) => e.target.value !== String(item.commission_pct ?? "") && saveItemField(item, "commission_pct", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      <button onClick={() => deleteItem(item)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
