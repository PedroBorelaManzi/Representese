// src/lib/pendingFileUploads.ts
//
// Fila de arquivos anexados a um pedido offline (foto/PDF de nota) que ainda
// não subiram pro Storage. O syncQueue já garante que o REGISTRO do pedido
// (linha na tabela orders) chega no banco assim que a internet volta — mas o
// arquivo em si é um File do navegador, que não cabe num payload de
// localStorage. Aqui ele fica guardado no IndexedDB (mesmo mecanismo já usado
// pelos rascunhos de upload em UploadContext.tsx) até dar pra subir de verdade.
import { supabase } from "./supabase";
import { getFileFromIndexedDB, deleteFileFromIndexedDB } from "./storage";

const PENDING_KEY = "rm_pending_file_uploads";
const BUCKET = "client_vault";

function getPending(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setPending(paths: string[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(paths));
  } catch (e) {
    console.error("Erro ao gravar fila de arquivos pendentes:", e);
  }
}

/** Marca um caminho do Storage como "tem arquivo esperando upload no IndexedDB". */
export function queuePendingFileUpload(storagePath: string): void {
  const pending = getPending();
  if (!pending.includes(storagePath)) setPending([...pending, storagePath]);
}

export function getPendingFileUploadCount(): number {
  return getPending().length;
}

/** Sobe cada arquivo pendente pro Storage. Um arquivo com problema não trava
 *  os outros — cada um só sai da fila se realmente subiu. */
export async function processPendingFileUploads(): Promise<{ success: boolean; errors: number }> {
  const pending = getPending();
  if (pending.length === 0) return { success: true, errors: 0 };

  let errors = 0;
  const stillPending: string[] = [];

  for (const storagePath of pending) {
    try {
      const file = await getFileFromIndexedDB(storagePath);
      if (!file) continue; // sem arquivo local pra subir: nada a fazer, sai da fila

      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, { upsert: true });
      if (error) throw error;

      await deleteFileFromIndexedDB(storagePath);
    } catch (e) {
      console.warn("Falha ao subir arquivo pendente:", storagePath, e);
      errors++;
      stillPending.push(storagePath);
    }
  }

  setPending(stillPending);
  return { success: errors === 0, errors };
}
