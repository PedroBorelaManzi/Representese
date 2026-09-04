import { Link } from "react-router-dom";
import { UserCog, Truck, ArrowUpRight } from "lucide-react";
import { InlineEditField } from "./InlineEditField";
import { brl } from "../lib/format";
import { cn } from "../lib/utils";

type SaveField = (order: any, field: string) => (value: string) => Promise<void> | void;

/** Card de um pedido — visualização "grade" em "Empresas & Pedidos" e "Entregas". */
export function OrderCard({
  order,
  onSelectOrder,
  saveField,
}: {
  order: any;
  onSelectOrder: (order: any) => void;
  saveField: SaveField;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 p-6 md:p-9 rounded-[32px] md:rounded-[45px] border border-slate-100 dark:border-zinc-800 hover:border-slate-200 dark:hover:border-zinc-700 hover:shadow-xl transition-all group relative overflow-hidden active:scale-[0.98]">
      <div className="flex justify-between items-start mb-4 md:mb-6 relative z-10">
        <div>
          <span className="text-[7px] md:text-[8px] font-black text-slate-400 dark:text-zinc-600 uppercase tracking-[0.2em] mb-1 block">Processamento</span>
          <span className="text-[10px] md:text-xs font-black text-slate-900 dark:text-zinc-100">
            {order.created_at ? new Date(order.created_at).toLocaleDateString("pt-BR") : "---"}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[7px] md:text-[8px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-1 block">Valor Líquido</span>
          <span className="text-lg md:text-xl font-black text-slate-900 dark:text-zinc-100 tracking-tighter tabular-nums">{brl(order.value)}</span>
        </div>
      </div>

      <div className="relative z-10 mb-6 md:mb-8">
        <p className="text-[7px] md:text-[8px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-2">Cliente Adquirente</p>
        <Link to={"/dashboard/clientes/" + order.client_id} className="block">
          <h4 className="text-sm md:text-base font-black uppercase text-slate-900 dark:text-zinc-100 truncate hover:text-emerald-600 transition-colors leading-tight">
            {order.client?.name || "Cliente Desconhecido"}
          </h4>
        </Link>
        {order.intake_link_label && (
          <span title={`Enviado pelo link "${order.intake_link_label}"`} className="mt-2 flex items-center gap-1 w-fit px-2 py-0.5 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-100 dark:border-cyan-900/40 rounded-lg text-[7px] font-black text-cyan-600 uppercase tracking-widest">
            <UserCog className="w-2.5 h-2.5" /> {order.intake_link_label}
          </span>
        )}
      </div>

      <div className="pt-5 md:pt-7 border-t border-slate-50 dark:border-zinc-800/50 flex justify-between items-center relative z-10">
        <span className="px-3 md:px-5 py-1.5 md:py-2 bg-emerald-600 text-white text-[8px] md:text-[9px] font-black uppercase tracking-[0.1em] rounded-full group-hover:bg-slate-900 transition-colors">
          {order.category}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => onSelectOrder(order)} className="p-2 md:p-3 bg-slate-50 dark:bg-zinc-800 rounded-xl md:rounded-2xl hover:bg-emerald-50 transition-colors" title="Ver detalhes do pedido">
            <Truck className="w-4 h-4 md:w-5 md:h-5 text-slate-400 hover:text-emerald-600 transition-colors" />
          </button>
          <Link to={"/dashboard/clientes/" + order.client_id} className="p-2 md:p-3 bg-slate-50 dark:bg-zinc-800 rounded-xl md:rounded-2xl hover:bg-emerald-50 transition-colors group/arrow">
            <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5 text-slate-400 group-hover/arrow:text-emerald-600 transition-colors" />
          </Link>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-50 dark:border-zinc-800/50 flex items-center justify-between gap-3 relative z-10 text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">
        <div className="flex items-center gap-1.5">
          <span>Entrega:</span>
          <InlineEditField type="date" value={order.delivery_date} onSave={saveField(order, "delivery_date")} label="Data de entrega" />
        </div>
        <div className="flex items-center gap-1.5">
          <span>NF:</span>
          <InlineEditField type="text" value={order.nf_number} onSave={saveField(order, "nf_number")} label="Número da NF" placeholder="NF" />
        </div>
        <div className={cn("flex items-center gap-1.5", (order.delivery_pct ?? 100) < 100 && "text-amber-600 dark:text-amber-400")}>
          <span>Entregue:</span>
          <InlineEditField type="percent" value={order.delivery_pct ?? 100} onSave={saveField(order, "delivery_pct")} label="Percentual entregue" />
        </div>
      </div>
      <div className="mt-2 flex items-start gap-1.5 relative z-10 text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">
        <span className="shrink-0 pt-1">Obs:</span>
        <InlineEditField type="textarea" value={order.notes} onSave={saveField(order, "notes")} label="Observações do pedido" placeholder="Nenhuma observação" className="flex-1 normal-case font-medium" />
      </div>
    </div>
  );
}
