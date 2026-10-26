// src/lib/offlineStore.ts
//
// Cópia permanente (sem prazo de validade) de dados grandes no IndexedDB do
// aparelho — conversa do assistente, entregas, e-mails. Funciona como "baixar
// uma música": fica guardado até a pessoa sair da conta ou apagar, e só é
// trocado quando uma sincronização nova com internet traz dados atualizados.
// localStorage (offlineCache) tem limite de ~5 MB, por isso estes dados vêm pra cá.
import { getFromIndexedDB, saveToIndexedDB, removeFromIndexedDB } from "./storage";

const PREFIX = "rm_offline_";

export const OfflineKeys = {
  aiChats: (userId: string) => `${PREFIX}ai_chats_${userId}`,
  entregas: (userId: string) => `${PREFIX}entregas_${userId}`,
  companyReps: (userId: string) => `${PREFIX}company_reps_${userId}`,
  emails: (userId: string, account: string, folder: string, category: string) =>
    `${PREFIX}emails_${userId}_${account}_${folder}_${category || "all"}`,
};

export async function saveOffline<T>(key: string, data: T): Promise<void> {
  try {
    await saveToIndexedDB(key, { data, savedAt: Date.now() });
  } catch (e) {
    console.warn("offlineStore: falha ao gravar", key, e);
  }
}

export async function loadOffline<T>(key: string): Promise<{ data: T; savedAt: number } | null> {
  try {
    const rec = await getFromIndexedDB(key);
    return rec && "data" in rec ? (rec as { data: T; savedAt: number }) : null;
  } catch {
    return null;
  }
}

export async function removeOffline(key: string): Promise<void> {
  try {
    await removeFromIndexedDB(key);
  } catch {
    /* nada a fazer */
  }
}
