import { Link } from "react-router-dom";
import { UserCog } from "lucide-react";
import { InlineEditField } from "./InlineEditField";
import { NfCommissionStatusDot, type NfCommissionStatus } from "./NfCommissionStatusDot";
import { cn } from "../lib/utils";

type SaveField = (order: any, field: string) => (value: string) => Promise<void> | void;

interface OrdersTableProps {
  orders: any[];
  onSelectOrder: (order: any) => void;
  saveField: SaveField;
  emptyLabel?: string;
  className?: string;
  /** Sem o card externo (borda/sombra) — pra usar dentro de outro container. */
  flush?: boolean;
  /** Se passado, mostra a bolinha de status de comissão da NF (usado em Entregas). */
  onNfStatusChange?: (order: any, status: NfCommissionStatus) => void;
}

/** Quem lançou o pedido: pelo link de "enviar pedido" (colaborador) ou manual. */
function digitadoPor(order: any): { label: string; viaLink: boolean } {
  if (order?.source === "order_intake_link" && order?.intake_link_label) {
    return { label: order.intake_link_label, viaLink: true };
  }
  return { label: "Manual", viaLink: false };
}

const TH = "px-4 py-3 text-left text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest whitespace-nowrap";
const TD = "px-4 py-3 align-middle text-xs text-slate-700 dark:text-zinc-200";

/**
 * Visualização "lista" dos pedidos — a mesma tabela em "Empresas & Pedidos" e
 * "Entregas". 10 colunas, rola na horizontal (não cabem numa tela só). Células
 * de data/agenda/valor/obs/NF/nº continuam editáveis inline, igual aos cards.
 */
export function OrdersTable({ orders, onSelectOrder, saveField, emptyLabel = "Nenhum pedido encontrado.", className, flush, onNfStatusChange }: OrdersTableProps) {
  return (
    <div className={cn(
      "overflow-hidden",
      !flush && "bg-white dark:bg-zinc-900 rounded-[24px] border border-slate-200/80 dark:border-zinc-800/80 shadow-sm",
      className
    )}>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[1360px] border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-950/80 backdrop-blur border-b border-slate-200 dark:border-zinc-800">
            <tr>
              <th className={TH}>Representada</th>
              <th className={TH}>Cliente</th>
              <th className={TH}>Nº do pedido</th>
              <th className={TH}>Data</th>
              <th className={TH}>Agenda de entrega</th>
              <th className={TH}>Data da entrega</th>
              <th className={cn(TH, "min-w-[220px]")}>Observação</th>
              <th className={cn(TH, "text-right")}>Valor</th>
              <th className={TH}>Digitado por</th>
              <th className={TH}>Nº da NF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/70">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-16 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const quem = digitadoPor(order);
                return (
                  <tr key={order.id} className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className={TD}>
                      <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wide whitespace-nowrap">
                        {order.category || "—"}
                      </span>
                    </td>
                    <td className={cn(TD, "font-bold")}>
                      {order.client_id ? (
                        <Link to={`/dashboard/clientes/${order.client_id}`} className="hover:text-emerald-600 transition-colors">
                          {order.client?.name || "Cliente desconhecido"}
                        </Link>
                      ) : (
                        order.client?.name || "—"
                      )}
                    </td>
                    <td className={TD}>
                      <button onClick={() => onSelectOrder(order)} className="font-black text-slate-900 dark:text-zinc-100 hover:text-emerald-600 transition-colors">
                        {order.order_number || "ver"}
                      </button>
                    </td>
                    <td className={TD}>
                      <InlineEditField type="date" value={order.created_at} onSave={saveField(order, "created_at")} label="Data do pedido" />
                    </td>
                    <td className={TD}>
                      <InlineEditField type="text" value={order.delivery_schedule} onSave={saveField(order, "delivery_schedule")} label="Agenda de entrega" placeholder="Ex.: manhã, 14h…" />
                    </td>
                    <td className={TD}>
                      <InlineEditField type="date" value={order.delivery_date} onSave={saveField(order, "delivery_date")} label="Data da entrega" />
                    </td>
                    <td className={cn(TD, "min-w-[220px] max-w-[320px]")}>
                      <InlineEditField type="textarea" value={order.notes} onSave={saveField(order, "notes")} label="Observação" placeholder="Sem observação" className="font-medium" />
                    </td>
                    <td className={cn(TD, "text-right font-black tabular-nums whitespace-nowrap")}>
                      <InlineEditField type="currency" value={order.value} onSave={saveField(order, "value")} label="Valor do pedido" className="justify-end" />
                    </td>
                    <td className={TD}>
                      <span className={cn(
                        "inline-flex items-center gap-1 whitespace-nowrap",
                        quem.viaLink && "text-cyan-600 dark:text-cyan-400 font-bold"
                      )}>
                        {quem.viaLink && <UserCog className="w-3 h-3" />}
                        {quem.label}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="inline-flex items-center gap-1.5">
                        {onNfStatusChange && (
                          <NfCommissionStatusDot status={order.nf_commission_status} onChange={(s) => onNfStatusChange(order, s)} />
                        )}
                        <InlineEditField type="text" value={order.nf_number} onSave={saveField(order, "nf_number")} label="Número da NF" placeholder="NF" />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
