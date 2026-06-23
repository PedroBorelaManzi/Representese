import { lazy, ComponentType } from "react";

/* ────────────────────────────────────────────────────────────────
   Carregamento lazy resiliente a deploys.

   Problema: o app é uma SPA com páginas em React.lazy() (chunks com hash
   no nome, ex.: CRM-CfuCKWBB.js). Quando sai um deploy novo na Vercel,
   os chunks antigos somem. Se o usuário tinha o index.html antigo aberto
   e navega para uma página lazy, o navegador tenta buscar o chunk velho
   e falha com "Failed to fetch dynamically imported module".

   Solução: ao falhar o import, recarrega a página UMA vez para pegar o
   index.html novo (com os hashes atualizados). Um guard em sessionStorage
   evita loop infinito de reload caso a falha seja por outro motivo
   (ex.: offline) — aí o erro sobe para o ErrorBoundary normalmente.
   ──────────────────────────────────────────────────────────────── */

const RELOAD_FLAG = "rm_chunk_reload";

/** É uma falha de carregamento de chunk (módulo dinâmico)? */
function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || "");
  return (
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg) ||
    /Unable to preload CSS/i.test(msg)
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Carregou: re-arma o guard para futuros deploys
      sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (err) {
      if (isChunkLoadError(err) && !sessionStorage.getItem(RELOAD_FLAG)) {
        // Provável chunk órfão após deploy: recarrega uma vez para pegar os assets novos
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
        // Promise que nunca resolve — a página vai recarregar antes de renderizar
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
