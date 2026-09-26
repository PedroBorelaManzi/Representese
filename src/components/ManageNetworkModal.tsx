import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Network, Search, X } from "lucide-react";
import { useModalEsc } from "../hooks/useModalEsc";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { normalizeKey } from "../lib/utils";
import { redeKey, type RedeClient } from "../lib/redes";

/**
 * Adiciona/remove clientes de uma rede já existente: a lista mostra todos os
 * clientes; marcado = na rede. Quem é de OUTRA rede aparece com a etiqueta dela
 * (marcar move pra esta).
 */
export default function ManageNetworkModal({
  networkName,
  clients,
  saving,
  onClose,
  onSave,
}: {
  networkName: string | null; // null = fechado
  clients: RedeClient[];
  saving: boolean;
  onClose: () => void;
  onSave: (add: string[], remove: string[]) => void;
}) {
  const isOpen = networkName !== null;
  const key = redeKey(networkName);
  const initial = useMemo(
    () => new Set(clients.filter((c) => c.network_name && redeKey(c.network_name) === key).map((c) => c.id)),
    [clients, key]
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  useModalEsc(() => { if (!saving) onClose(); }, isOpen);
  useFocusTrap(panelRef, isOpen);
  useEffect(() => {
    if (isOpen) { setChecked(new Set(initial)); setSearch(""); }
    // só ao abrir: não zera a seleção quando a lista de clientes recarrega
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, networkName]);

  const visible = useMemo(() => {
    const q = normalizeKey(search);
    return clients
      .filter((c) => !q || normalizeKey(`${c.name || ""} ${c.nome_fantasia || ""} ${c.city || ""}`).includes(q))
      .sort((a, b) => {
        // quem está marcado primeiro, depois ordem alfabética
        const d = Number(checked.has(b.id)) - Number(checked.has(a.id));
        return d || (a.name || "").localeCompare(b.name || "");
      });
  }, [clients, search, checked]);

  if (!isOpen) return null;
  const add = [...checked].filter((id) => !initial.has(id));
  const remove = [...initial].filter((id) => !checked.has(id));
  const toggle = (id: string) => setChecked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Gerenciar clientes da rede ${networkName}`}
        tabIndex={-1}
        className="relative w-full max-w-lg max-h-[85dvh] flex flex-col bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-200 dark:border-zinc-800 shadow-2xl outline-none overflow-hidden"
      >
        <div className="p-6 pb-3 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0"><Network className="w-5 h-5" /></div>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100 truncate">{networkName}</h3>
              <p className="text-xs font-bold text-slate-400">Marque quem faz parte da rede · {checked.size} na rede</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Fechar" className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente por nome ou cidade..."
              aria-label="Buscar cliente"
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto custom-scrollbar px-3 divide-y divide-slate-50 dark:divide-zinc-800/60">
          {visible.length === 0 && <li className="py-10 text-center text-xs font-bold text-slate-400">Nenhum cliente encontrado</li>}
          {visible.map((c) => {
            const other = c.network_name && redeKey(c.network_name) !== key ? c.network_name : null;
            return (
              <li key={c.id}>
                <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800/40 cursor-pointer">
                  <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4 accent-emerald-600 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">{c.name || c.nome_fantasia || "Cliente sem nome"}</span>
                    <span className="block text-[10px] font-bold text-slate-400 truncate">{c.city || "Cidade não informada"}</span>
                  </span>
                  {other && (
                    <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 shrink-0" title="Marcar move este cliente para esta rede">
                      Rede: {other}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        <div className="p-4 border-t border-slate-100 dark:border-zinc-800 flex items-center gap-3">
          <p className="flex-1 text-[11px] font-bold text-slate-400">
            {add.length === 0 && remove.length === 0 ? "Sem alterações" : `${add.length ? `+${add.length} entram` : ""}${add.length && remove.length ? " · " : ""}${remove.length ? `−${remove.length} saem` : ""}`}
          </p>
          <button
            onClick={() => onSave(add, remove)}
            disabled={saving || (add.length === 0 && remove.length === 0)}
            className="px-6 py-3 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
