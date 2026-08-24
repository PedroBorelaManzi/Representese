// src/lib/offlineTileLayer.ts
//
// TileLayer do Leaflet que passa por um cache local (mapTileCache) antes da
// rede: online, busca cada tile normalmente e guarda uma cópia; offline,
// serve o que já tiver guardado e deixa em branco o que nunca foi visto (em
// vez de travar o mapa esperando uma resposta que nunca chega). É a diferença
// entre o mapa virar um quadriculado cinza fora de área com sinal e continuar
// mostrando as ruas de qualquer lugar que o usuário já tenha aberto antes.
import L from "leaflet";
import { getCachedTile, cacheTile } from "./mapTileCache";

export function createOfflineTileLayer(urlTemplate: string, options: L.TileLayerOptions): L.TileLayer {
  const OfflineTileLayer = L.TileLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const tile = document.createElement("img");
      tile.alt = "";

      const layer = this as unknown as L.TileLayer;
      const url = layer.getTileUrl(coords);
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        done(error, tile);
      };

      void (async () => {
        const cached = await getCachedTile(url);
        if (cached) {
          tile.src = URL.createObjectURL(cached);
          finish();
        }

        if (!navigator.onLine) {
          // Sem cache e sem rede: deixa o tile em branco em vez de travar o
          // carregamento do mapa esperando uma resposta que nunca chega.
          if (!cached) finish();
          return;
        }

        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Tile ${res.status}`);
          const blob = await res.blob();
          if (!cached) {
            tile.src = URL.createObjectURL(blob);
            finish();
          }
          void cacheTile(url, blob);
        } catch (e) {
          if (!cached) finish(e as Error);
        }
      })();

      return tile;
    },
  });

  return new (OfflineTileLayer as any)(urlTemplate, options);
}
