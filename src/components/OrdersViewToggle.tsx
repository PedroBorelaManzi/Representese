import { LayoutGrid, List } from "lucide-react";
import { cn } from "../lib/utils";
import type { OrdersView } from "../hooks/useOrdersView";

/** Botão segmentado grade x lista, no estilo "ícones / lista" do Finder. */
export function OrdersViewToggle({
  value,
  onChange,
  className,
}: {
  value: OrdersView;
  onChange: (v: OrdersView) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Visualização dos pedidos"
      className={cn(
        "inline-flex items-center gap-0.5 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/70 dark:border-zinc-700/60 shrink-0",
        className
      )}
    >
      {(
        [
          { v: "grid" as const, Icon: LayoutGrid, label: "Grade" },
          { v: "list" as const, Icon: List, label: "Lista" },
        ]
      ).map(({ v, Icon, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          title={label}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95",
            value === v
              ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 shadow-sm"
              : "text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
