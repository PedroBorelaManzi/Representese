import { useCallback, useEffect, useState } from "react";

export type OrdersView = "grid" | "list";

const KEY = "rm_orders_view";
const EVENT = "rm-orders-view";

function read(): OrdersView {
  try {
    return localStorage.getItem(KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/**
 * Preferência ÚNICA de visualização dos pedidos (grade de cards x lista/tabela).
 * Vale pra "Empresas & Pedidos" e "Entregas" ao mesmo tempo — trocar numa troca
 * na outra. Guardada no aparelho (localStorage); é conveniência de UI, não
 * precisa sincronizar entre dispositivos. O CustomEvent mantém as duas telas
 * (se abertas juntas) em sincronia sem prop drilling.
 */
export function useOrdersView(): [OrdersView, (v: OrdersView) => void] {
  const [view, setViewState] = useState<OrdersView>(read);

  const setView = useCallback((v: OrdersView) => {
    setViewState(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* modo privado / storage bloqueado — segue só em memória */
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
  }, []);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const v = (e as CustomEvent<OrdersView>).detail;
      if (v === "grid" || v === "list") setViewState(v);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setViewState(read());
    };
    window.addEventListener(EVENT, onEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return [view, setView];
}
