import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Percent, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { Modal } from "./ui/Modal";
import { SearchableClientPicker } from "./SearchableClientPicker";
import { HideableCommissionField } from "./HideableCommissionField";
import type { ClientProductSetting } from "../types";

interface ClientLite {
  id: string;
  name: string;
  cnpj?: string;
}

interface ClientProductOverridesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  category: string;
  productKey: string;
  productName: string;
}

const inputCls =
  "w-full px-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-colors";

/** Modal aberto a partir de uma linha do catálogo (CatalogoProdutos.tsx) pra
 *  gerenciar exceções por cliente daquele produto: o código que ESSE cliente
 *  usa pra pedir esse produto (ver resolução automática em orderItems.ts) e/ou
 *  uma comissão % que só vale pra ESSE cliente (sobrepõe
 *  settings.product_commissions no blend de Comissoes.tsx). */
export function ClientProductOverridesModal({
  isOpen,
  onClose,
  userId,
  category,
  productKey,
  productName,
}: ClientProductOverridesModalProps) {
  const queryClient = useQueryClient();
  const [newClientId, setNewClientId] = useState("");
  const [newClientCode, setNewClientCode] = useState("");
  const [newCommissionPct, setNewCommissionPct] = useState("");
  const [saving, setSaving] = useState(false);

  const overridesKey = ["client_product_settings", userId, category, productKey];

  const { data: overrides = [], isLoading: loadingOverrides } = useQuery({
    queryKey: overridesKey,
    queryFn: async (): Promise<ClientProductSetting[]> => {
      const { data, error } = await supabase
        .from("client_product_settings")
        .select("*")
        .eq("user_id", userId)
        .eq("category", category)
        .eq("product_key", productKey)
        .order("created_at");
      if (error) throw error;
      return (data as ClientProductSetting[]) || [];
    },
    enabled: isOpen && !!userId,
  });

  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["client_product_settings_clients", userId],
    queryFn: async (): Promise<ClientLite[]> => {
      const { data, error } = await supabase.from("clients").select("id, name, cnpj").eq("user_id", userId).order("name");
      if (error) throw error;
      return (data as ClientLite[]) || [];
    },
    enabled: isOpen && !!userId,
  });

  // Cliente que já tem exceção pra este produto some do seletor de "adicionar"
  // — edita a linha existente em vez de criar outra (a constraint unique do
  // banco também bloqueia isso, mas evita o erro na maioria dos casos).
  const clientesComOverride = useMemo(() => new Set(overrides.map((o) => o.client_id)), [overrides]);
  const clientesDisponiveis = useMemo(
    () => clients.filter((c) => !clientesComOverride.has(c.id)),
    [clients, clientesComOverride]
  );
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const invalidarTudo = () => {
    queryClient.invalidateQueries({ queryKey: overridesKey });
    queryClient.invalidateQueries({ queryKey: ["client_product_settings_counts", userId, category] });
    // Página de Comissões não tem client_product_settings na queryKey (é
    // tabela do banco, não settings) — sem isso o número mostrado lá ficaria
    // parado até o usuário trocar de mês ou recarregar a página.
    queryClient.invalidateQueries({ queryKey: ["comissoes-orders"] });
  };

  const resetForm = () => {
    setNewClientId("");
    setNewClientCode("");
    setNewCommissionPct("");
  };

  const handleAdd = async () => {
    if (!newClientId) {
      toast.error("Escolha um cliente.");
      return;
    }
    const code = newClientCode.trim() || null;
    const pct = newCommissionPct.trim() ? Number(newCommissionPct.replace(",", ".")) : null;
    if (!code && pct === null) {
      toast.error("Preencha o código do cliente ou a comissão — pelo menos um dos dois.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("client_product_settings").insert({
        user_id: userId,
        client_id: newClientId,
        category,
        product_key: productKey,
        client_code: code,
        commission_pct: pct,
      });
      if (error) {
        if (error.code === "23505") {
          toast.error("Esse cliente já tem uma exceção configurada pra este produto.");
        } else {
          toast.error("Erro ao salvar: " + error.message);
        }
        return;
      }
      resetForm();
      invalidarTudo();
      toast.success("Exceção adicionada!");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateField = async (row: ClientProductSetting, field: "client_code" | "commission_pct", rawValue: string) => {
    const value = field === "commission_pct" ? (rawValue.trim() ? Number(rawValue.replace(",", ".")) : null) : rawValue.trim() || null;
    if (field === "commission_pct" && typeof value === "number" && !isFinite(value)) return;

    const { error } = await supabase.from("client_product_settings").update({ [field]: value }).eq("id", row.id);
    if (error) {
      toast.error("Erro ao salvar.");
      return;
    }
    queryClient.setQueryData<ClientProductSetting[]>(overridesKey, (old) =>
      (old || []).map((o) => (o.id === row.id ? { ...o, [field]: value } : o))
    );
    queryClient.invalidateQueries({ queryKey: ["comissoes-orders"] });
  };

  const handleDelete = async (row: ClientProductSetting) => {
    const { error } = await supabase.from("client_product_settings").delete().eq("id", row.id);
    if (error) {
      toast.error("Erro ao excluir.");
      return;
    }
    queryClient.setQueryData<ClientProductSetting[]>(overridesKey, (old) => (old || []).filter((o) => o.id !== row.id));
    queryClient.invalidateQueries({ queryKey: ["client_product_settings_counts", userId, category] });
    queryClient.invalidateQueries({ queryKey: ["comissoes-orders"] });
    toast.success("Exceção removida.");
  };

  const loading = loadingOverrides || loadingClients;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Exceções por cliente — ${productName}`} maxWidth="max-w-2xl">
      <p className="text-xs font-medium text-slate-400 dark:text-zinc-500 mb-5 -mt-2">
        Código que o cliente usa pra pedir esse produto e/ou uma comissão só pra ele —
        sobrepõe o % do produto quando configurado. O sistema passa a reconhecer esse
        código sozinho nos próximos pedidos desse cliente.
      </p>

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="space-y-2 mb-5">
          {overrides.length === 0 ? (
            <p className="text-xs font-bold text-slate-400 dark:text-zinc-500 text-center py-6">
              Nenhuma exceção configurada ainda pra este produto.
            </p>
          ) : (
            overrides.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-900 dark:text-zinc-100 truncate">
                    {clientById.get(row.client_id)?.name || "Cliente"}
                  </p>
                </div>
                <input
                  type="text"
                  defaultValue={row.client_code || ""}
                  placeholder="Código do cliente"
                  onBlur={(e) => e.target.value !== (row.client_code || "") && handleUpdateField(row, "client_code", e.target.value)}
                  className={`${inputCls} w-36 shrink-0`}
                />
                <div className="relative w-24 shrink-0">
                  <HideableCommissionField>
                    {() => (
                      <>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          defaultValue={row.commission_pct ?? ""}
                          placeholder="—"
                          onBlur={(e) =>
                            e.target.value !== String(row.commission_pct ?? "") && handleUpdateField(row, "commission_pct", e.target.value)
                          }
                          className={`${inputCls} pr-7 text-right`}
                        />
                        <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                      </>
                    )}
                  </HideableCommissionField>
                </div>
                <button
                  onClick={() => handleDelete(row)}
                  className="p-2 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                  title="Remover exceção"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="pt-4 border-t border-slate-100 dark:border-zinc-800">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-3">
          Adicionar exceção
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0">
            <SearchableClientPicker clients={clientesDisponiveis} value={newClientId} onChange={setNewClientId} />
          </div>
          <input
            type="text"
            value={newClientCode}
            onChange={(e) => setNewClientCode(e.target.value)}
            placeholder="Código do cliente"
            className={`${inputCls} sm:w-36`}
          />
          <div className="relative sm:w-24">
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={newCommissionPct}
              onChange={(e) => setNewCommissionPct(e.target.value)}
              placeholder="—"
              className={`${inputCls} pr-7 text-right`}
            />
            <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 shrink-0"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Adicionar
          </button>
        </div>
      </div>
    </Modal>
  );
}
