import { useEffect, useRef, useState } from "react";
import { Loader2, Network, X } from "lucide-react";
import { useModalEsc } from "../hooks/useModalEsc";
import { useFocusTrap } from "../hooks/useFocusTrap";

/** Pede o nome da rede para os clientes selecionados (vazio = tirar da rede). */
export default function NetworkAssignModal({
  isOpen,
  count,
  networks,
  initialName = "",
  saving,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  count: number;
  networks: string[];
  initialName?: string;
  saving: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalEsc(() => { if (!saving) onClose(); }, isOpen);
  useFocusTrap(panelRef, isOpen);
  useEffect(() => { if (isOpen) setName(initialName); }, [isOpen, initialName]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Definir rede"
        tabIndex={-1}
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-200 dark:border-zinc-800 shadow-2xl p-7 outline-none"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Definir rede</h3>
              <p className="text-xs font-bold text-slate-400 dark:text-zinc-500">
                {count} cliente{count === 1 ? "" : "s"} selecionado{count === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Fechar" className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); onConfirm(name); }}
          className="space-y-4"
        >
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nome da rede</label>
            <input
              list="redes-existentes"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Carrefour"
              autoFocus
              className="w-full px-5 py-3.5 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <datalist id="redes-existentes">
              {networks.map((n) => <option key={n} value={n} />)}
            </datalist>
            <p className="mt-2.5 text-[11px] text-slate-400 font-medium leading-relaxed">
              Cada cliente continua com o próprio cadastro, pedidos e comissão — a rede só junta o faturamento na visão “Redes” e nos relatórios.
              Deixe em branco para tirar os clientes da rede.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {name.trim() ? "Salvar rede" : "Tirar da rede"}
          </button>
        </form>
      </div>
    </div>
  );
}
