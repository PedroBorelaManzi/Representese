import { useEffect, RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Prende o Tab dentro do painel enquanto o modal está aberto (extraído de
 * ui/Modal.tsx pra dar pra usar nos modais feitos na mão em vez desse
 * componente — cada um tem cabeçalho/layout próprio, mas todos merecem o
 * mesmo comportamento de teclado). Sem isso, Tab "vaza" pro conteúdo atrás
 * do modal, que fica escondido visualmente mas continua alcançável.
 */
export function useFocusTrap(panelRef: RefObject<HTMLElement | null>, isOpen: boolean) {
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable || panel).focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', handleTab);
    return () => {
      panel.removeEventListener('keydown', handleTab);
      previouslyFocused?.focus();
    };
  }, [isOpen, panelRef]);
}
