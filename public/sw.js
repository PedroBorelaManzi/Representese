// Service worker mínimo — existe só pra satisfazer o critério de "app
// instalável" dos navegadores (sem ele, o manifest.json fica decorativo e o
// Chrome/Edge nunca oferece "Instalar app"). De propósito NÃO faz cache de
// nada: um service worker que guarda os arquivos do app corre o risco real
// de servir uma versão antiga depois de um deploy novo, e esse app já tem
// seu próprio mecanismo de detectar chunk desatualizado (vite:preloadError
// em main.tsx).
//
// NÃO ADICIONE UM LISTENER DE 'fetch' AQUI.
//
// A versão anterior tinha um que parecia inofensivo:
//
//     self.addEventListener("fetch", (e) => e.respondWith(fetch(e.request)));
//
// "só repassa pra rede, não intercepta nada" — mas repassar É interceptar.
// Ao responder com fetch(), toda requisição da página deixa de ser o que
// era e vira uma chamada de fetch feita pelo service worker. E fetch é
// regido pela diretiva connect-src da CSP, não pela diretiva do tipo
// original do recurso. Na prática: as imagens dos mapas, que o img-src
// libera explicitamente, passaram a ser barradas pelo connect-src, e o Mapa
// virou um retângulo cinza com só os pinos por cima — online, com internet
// perfeita.
//
// Reproduzido em Chromium, com o mesmo código de tiles do app:
//   SW repassando  + connect-src sem o domínio dos tiles → 0/8 tiles
//   SW repassando  + connect-src com  o domínio dos tiles → 8/8 tiles
//   SW sem 'fetch' + connect-src sem o domínio dos tiles → 8/8 tiles
//
// A última linha é o motivo desta escolha: sem listener de fetch, o
// navegador atende cada requisição nativamente, cada recurso volta a ser
// regido pela diretiva certa da CSP, e o mapa não depende mais de o
// connect-src estar lembrado corretamente.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // clients.claim() faz este service worker assumir as abas já abertas, o
  // que é o que troca o worker antigo (aquele com o listener de fetch) sem
  // depender de o usuário fechar e reabrir o app.
  event.waitUntil(self.clients.claim());
});
