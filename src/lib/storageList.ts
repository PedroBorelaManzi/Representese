// src/lib/storageList.ts
//
// Listagem de pastas/arquivos da aba Arquivos, extraída de Arquivos.tsx pra
// poder ser testada isoladamente.
import { supabase } from "./supabase";
import { offlineCache } from "./offlineCache";

export const BUCKET = "user_files";
export const PLACEHOLDER = ".keep";

export interface StorageItem {
  name: string;
  isFolder: boolean;
  size: number;
  updatedAt: string | null;
}

export async function listFolder(prefix: string): Promise<StorageItem[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw error;

  const mapped: StorageItem[] = (data || [])
    .filter((it) => it.name !== PLACEHOLDER && it.name !== ".emptyFolderPlaceholder")
    .map((it) => ({
      name: it.name,
      isFolder: it.id === null,
      size: (it as any).metadata?.size || 0,
      updatedAt: (it as any).updated_at || null,
    }));

  // pastas primeiro, depois arquivos
  mapped.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1));
  return mapped;
}

export const storageListCacheKey = (prefix: string) => `rm_cache_storage_list_${prefix}`;

/**
 * Diferente do conteúdo dos arquivos (que o usuário escolhe baixar ou não),
 * a ESTRUTURA de pastas/arquivos (nomes, tamanhos) fica salva sozinha, sem
 * pedir nada — é só texto pequeno, então guardar é barato, e sem isso a aba
 * Arquivos aparecia vazia sempre que abria offline uma pasta que não estava
 * mais quente no cache do React Query.
 */
export async function listFolderCached(prefix: string): Promise<StorageItem[]> {
  if (offlineCache.isOnline()) {
    const items = await listFolder(prefix);
    offlineCache.set(storageListCacheKey(prefix), items, 30 * 24 * 60 * 60 * 1000);
    return items;
  }
  return offlineCache.get<StorageItem[]>(storageListCacheKey(prefix)) || [];
}

/** Varre recursivamente uma pasta do Storage e devolve o caminho de todo
 *  arquivo dentro dela (pastas não entram na lista, só o que tem conteúdo). */
export async function listAllPaths(bucket: string, folderPrefix: string): Promise<string[]> {
  const { data } = await supabase.storage.from(bucket).list(folderPrefix, { limit: 1000 });
  let paths: string[] = [];
  for (const it of data || []) {
    if (it.name === PLACEHOLDER || it.name === ".emptyFolderPlaceholder") continue;
    const full = `${folderPrefix}/${it.name}`;
    if (it.id === null) paths = paths.concat(await listAllPaths(bucket, full));
    else paths.push(full);
  }
  return paths;
}
