// src/lib/offlineTileLayer.ts
//
// TileLayer do Leaflet com cache local (mapTileCache) para o Mapa continuar
// mostrando as ruas offline, em vez de virar um quadriculado cinza com só os
// pinos por cima.
//
// REGRA CENTRAL DESTE ARQUIVO: o cache nunca fica no caminho da exibição.
// A imagem é sempre carregada como <img src>, igual ao TileLayer padrão do
// Leaflet; guardar a cópia é um efeito colateral em segundo plano que pode
// falhar sem afetar nada do que aparece na tela.
//
// A primeira versão fazia o contrário — buscava o tile com fetch() e só então
// mostrava o resultado. Só que fetch() cross-origin exige que o servidor
// devolva Access-Control-Allow-Origin, e <img src> não exige nada disso.
// Quando esse cabeçalho não vinha, TODO tile caía no catch e o mapa ficava
// 100% cinza — inclusive online, com internet perfeita. Reproduzido em
// navegador: camada antiga renderizava 0 de 10 tiles, TileLayer padrão
// renderizava 10 de 10.
import L from "leaflet";
import { getCachedTile, cacheTile } from "./mapTileCache";

/** Guarda uma cópia do tile sem interferir na imagem que já está na tela.
 *  Se o servidor não permitir leitura por fetch (CORS), só não guarda: o
 *  mapa online continua normal e esse tile específico não fica disponível
 *  offline. */
function guardarCopiaEmSegundoPlano(url: string): void {
  void (async () => {
    try {
      // force-cache: a imagem acabou de ser baixada pelo <img>, então o
      // normal é esta segunda chamada ser servida do cache HTTP do próprio
      // navegador, sem custo de rede.
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) return;
      void cacheTile(url, await res.blob());
    } catch {
      // Silêncio proposital: falhar aqui é aceitável e não é visível pro
      // usuário. O que NÃO pode acontecer é isso impedir o tile de aparecer.
    }
  })();
}

export function createOfflineTileLayer(urlTemplate: string, options: L.TileLayerOptions): L.TileLayer {
  const OfflineTileLayer = L.TileLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const tile = document.createElement("img");
      tile.alt = "";

      const layer = this as unknown as L.TileLayer;
      const url = layer.getTileUrl(coords);

      let settled = false;
      let objectUrl: string | null = null;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        done(error, tile);
      };

      tile.onload = () => {
        // A imagem já foi decodificada; liberar o blob aqui evita segurar
        // memória de um tile por toda a sessão de uso do mapa.
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        finish();
      };
      tile.onerror = () => finish(new Error(`Falha ao carregar tile: ${url}`));

      void (async () => {
        const cached = await getCachedTile(url);
        if (cached) {
          objectUrl = URL.createObjectURL(cached);
          tile.src = objectUrl;
          return;
        }

        if (!navigator.onLine) {
          // Sem rede e sem cópia guardada: deixa em branco em vez de segurar
          // o carregamento do mapa esperando uma resposta que não vem.
          finish();
          return;
        }

        tile.src = url;
        guardarCopiaEmSegundoPlano(url);
      })();

      return tile;
    },
  });

  return new (OfflineTileLayer as any)(urlTemplate, options);
}
