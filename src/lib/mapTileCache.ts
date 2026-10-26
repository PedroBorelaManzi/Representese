// src/lib/mapTileCache.ts
//
// Cache local das imagens (tiles) do mapa, para o Mapa continuar mostrando
// ruas e cidades mesmo sem internet — antes disso, offline o mapa virava um
// quadriculado cinza vazio (só os pinos dos clientes apareciam, sem nenhum
// contexto visual por baixo). Segue o mesmo padrão de IndexedDB cru já usado
// em storage.ts, só que num banco próprio: aqui o volume de registros é bem
// maior (um tile por quadradinho visto na tela), então convém poder podar
// isso sem mexer no banco que guarda rascunhos de upload e o cache do React
// Query.

const DB_NAME = "MapTilesCache";
const STORE = "tiles";
const DB_VERSION = 1;

// Teto de tiles guardados — cada um tem uns 10-30KB, então isso fica na casa
// de poucas dezenas de MB no pior caso. Sem teto, meses de uso do mapa
// acumulariam um cache sem limite no aparelho do usuário.
const MAX_TILES = 6000;
// Checar o total a cada gravação exigiria contar todas as chaves toda vez
// (caro — um único pan/zoom já desenha dezenas de tiles de uma vez). Em vez
// disso, cada gravação tem uma chance pequena de disparar a poda.
const PRUNE_CHANCE = 0.02;

interface TileRecord {
  blob: Blob;
  ts: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

/** a/b/c.tile.openstreetmap.org servem a mesma imagem: guarda sob uma chave só pra o cache valer qualquer que seja o subdomínio sorteado. */
const chave = (url: string) => url.replace(/^https:\/\/[abc]\.tile\.openstreetmap\.org/, "https://tile.openstreetmap.org");

export async function getCachedTile(url: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(chave(url));
      req.onsuccess = () => resolve((req.result as TileRecord | undefined)?.blob ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function cacheTile(url: string, blob: Blob): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ blob, ts: Date.now() } as TileRecord, chave(url));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if (Math.random() < PRUNE_CHANCE) void prune();
  } catch {
    // Sem cache de tile o mapa segue funcionando puxando da rede — não é crítico.
  }
}

/** Remove os tiles mais antigos quando o total passa do teto. */
async function prune(): Promise<void> {
  try {
    const db = await getDB();
    const entries = await new Promise<{ key: IDBValidKey; ts: number }[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const out: { key: IDBValidKey; ts: number }[] = [];
      const cursorReq = tx.objectStore(STORE).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          out.push({ key: cursor.primaryKey, ts: (cursor.value as TileRecord).ts });
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });

    if (entries.length <= MAX_TILES) return;

    entries.sort((a, b) => a.ts - b.ts);
    const toRemove = entries.slice(0, entries.length - MAX_TILES);

    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    toRemove.forEach((e) => store.delete(e.key));
  } catch {
    // Poda é só limpeza — falhar aqui não pode afetar o mapa.
  }
}

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const PREFETCH_ZOOMS = [11, 13];
/** Teto por sincronização: a política de uso do OpenStreetMap desencoraja download em massa. */
const PREFETCH_MAX = 400;
const PREFETCH_CONCURRENCY = 2;

function tileXY(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x, y };
}

/**
 * Baixa de antemão os quadradinhos do mapa onde há clientes (visão da região e
 * da rua), pra o Mapa mostrar ruas sem internet. Mesma URL que a camada do Mapa
 * usa (subdomínio "a"), então o que for guardado aqui é reaproveitado por ela.
 */
export async function prefetchTilesForClients(clients: { lat?: number | null; lng?: number | null }[]): Promise<void> {
  const urls = new Set<string>();
  for (const c of clients) {
    if (typeof c.lat !== "number" || typeof c.lng !== "number") continue;
    for (const z of PREFETCH_ZOOMS) {
      const { x, y } = tileXY(c.lat, c.lng, z);
      urls.add(TILE_URL.replace("{s}", "a").replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
    }
  }
  const lista = Array.from(urls).slice(0, PREFETCH_MAX);
  let next = 0;
  const worker = async () => {
    while (next < lista.length) {
      const url = lista[next++];
      try {
        if (await getCachedTile(url)) continue;
        const res = await fetch(url);
        if (res.ok) await cacheTile(url, await res.blob());
      } catch {
        // Tile que não baixou só não fica disponível offline — não é erro da sincronização.
      }
    }
  };
  await Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, worker));
}
