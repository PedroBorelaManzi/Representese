// Service worker mínimo — existe só pra satisfazer o critério de "app
// instalável" dos navegadores (sem ele, o manifest.json fica decorativo e o
// Chrome/Edge nunca oferece "Instalar app"). De propósito NÃO faz cache de
// nada: um service worker que guarda os arquivos do app corre o risco real
// de servir uma versão antiga depois de um deploy novo, e esse app já tem
// seu próprio mecanismo de detectar chunk desatualizado (vite:preloadError
// em main.tsx). Cada fetch aqui vai direto pra rede, sem interceptar nada.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
