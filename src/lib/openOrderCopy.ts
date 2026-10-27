// O olhinho dos pedidos (cards e tabela) abre a CÓPIA do pedido num visualizador único,
// montado uma vez no Layout (OrderCopyHost). Aqui só fica o "chamar".
export const OPEN_ORDER_COPY_EVENT = "rs:open-order-copy";

export function openOrderCopy(order: any): void {
  window.dispatchEvent(new CustomEvent(OPEN_ORDER_COPY_EVENT, { detail: order }));
}
