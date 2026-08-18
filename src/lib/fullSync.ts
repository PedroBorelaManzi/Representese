// src/lib/fullSync.ts
//
// Sincronização completa: com internet, baixa TUDO (clientes, pedidos,
// agenda, feriados e, no app nativo, o conteúdo de cada PDF/arquivo) e
// deixa salvo no aparelho — não é o usuário quem escolhe o que sincronizar
// aqui (isso é só pra download avulso de um arquivo específico via
// fileCache.ts). Roda no boot do app e sempre que a conexão volta.
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { offlineCache, CacheKeys } from "./offlineCache";
import { fetchHolidays } from "./holidayService";
import { getCachedUriSePresente, getCachedFileUri } from "./fileCache";
import { listAllPaths, BUCKET as USER_FILES_BUCKET } from "./storageList";
import type { Client, Order, Appointment } from "../types";

const CLIENT_VAULT_BUCKET = "client_vault";

export interface FullSyncProgress {
  etapaIndex: number;
  etapaTotal: number;
  etapaLabel: string;
  /** Só preenchido na etapa de arquivos, onde há progresso dentro da etapa. */
  subAtual?: number;
  subTotal?: number;
}

const ETAPA_TOTAL_COM_ARQUIVOS = 6;
const ETAPA_TOTAL_SEM_ARQUIVOS = 5;

let syncing = false;

export function isFullSyncRunning(): boolean {
  return syncing;
}

async function syncUserSettings(userId: string): Promise<void> {
  const { data, error } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data) offlineCache.set(CacheKeys.USER_SETTINGS, data);
}

async function syncClients(userId: string): Promise<Client[]> {
  const { data, error } = await supabase.from("clients").select("*").eq("user_id", userId);
  if (error) throw error;
  const clients = (data || []) as Client[];
  offlineCache.set(CacheKeys.CLIENTS, clients);
  return clients;
}

async function syncAppointments(userId: string): Promise<void> {
  const { data, error } = await supabase.from("appointments").select("*").eq("user_id", userId);
  if (error) throw error;
  offlineCache.set(CacheKeys.APPOINTMENTS, (data || []) as Appointment[]);
}

async function syncOrders(userId: string): Promise<Order[]> {
  const { data, error } = await supabase.from("orders").select("*").eq("user_id", userId);
  if (error) throw error;
  const orders = (data || []) as Order[];
  offlineCache.set(CacheKeys.ORDERS, orders);
  return orders;
}

async function syncHolidays(clients: Client[]): Promise<void> {
  const year = new Date().getFullYear();
  const locations = clients
    .filter((c) => c.city)
    .map((c) => ({ city: c.city as string, state: c.state }));
  // fetchHolidays já salva em offlineCache internamente quando a chamada dá certo.
  await fetchHolidays(year, locations);
  // Cobre também dezembro olhando pra virada do ano.
  if (new Date().getMonth() === 11) {
    await fetchHolidays(year + 1, locations).catch(() => {});
  }
}

/**
 * Baixa o conteúdo de cada arquivo (anexos de pedidos + Arquivos gerais) pro
 * armazenamento do próprio app. Só roda no nativo — no navegador não existe
 * esse cache local. Pula o que já está baixado, então uma sincronização
 * interrompida "retoma" sozinha na próxima.
 */
async function syncFiles(
  userId: string,
  orders: Order[],
  onFileProgress?: (atual: number, total: number) => void
): Promise<void> {
  const orderTargets = orders
    .filter((o) => !!o.file_path)
    .map((o) => ({ bucket: CLIENT_VAULT_BUCKET, path: o.file_path as string }));

  const generalPaths = await listAllPaths(USER_FILES_BUCKET, userId).catch((e) => {
    console.warn("fullSync: falha ao listar Arquivos gerais", e);
    return [] as string[];
  });
  const generalTargets = generalPaths.map((p) => ({ bucket: USER_FILES_BUCKET, path: p }));

  const targets = [...orderTargets, ...generalTargets];
  let done = 0;
  onFileProgress?.(0, targets.length);

  for (const t of targets) {
    try {
      const jaEmCache = await getCachedUriSePresente(t.path);
      if (!jaEmCache) {
        const { data, error } = await supabase.storage.from(t.bucket).createSignedUrl(t.path, 60 * 60);
        if (!error && data?.signedUrl) {
          await getCachedFileUri(t.path, data.signedUrl);
        }
      }
    } catch (e) {
      // Um arquivo com problema não pode travar a sincronização dos outros.
      console.warn("fullSync: falha ao cachear arquivo", t.path, e);
    }
    done++;
    onFileProgress?.(done, targets.length);
  }
}

/**
 * Roda a sincronização completa. Cada etapa é isolada: se uma falhar (ex.
 * feriados fora do ar), as outras seguem normalmente em vez de travar tudo.
 */
export async function runFullSync(userId: string, onProgress?: (p: FullSyncProgress) => void): Promise<void> {
  if (syncing) return;
  if (!offlineCache.isOnline()) return;

  syncing = true;
  const comArquivos = Capacitor.isNativePlatform();
  const etapaTotal = comArquivos ? ETAPA_TOTAL_COM_ARQUIVOS : ETAPA_TOTAL_SEM_ARQUIVOS;
  const report = (etapaIndex: number, etapaLabel: string, sub?: { atual: number; total: number }) =>
    onProgress?.({ etapaIndex, etapaTotal, etapaLabel, subAtual: sub?.atual, subTotal: sub?.total });

  try {
    report(1, "Configurações...");
    await syncUserSettings(userId).catch((e) => console.warn("fullSync: user_settings falhou", e));

    report(2, "Clientes...");
    const clients = await syncClients(userId).catch((e) => {
      console.warn("fullSync: clientes falhou", e);
      return [] as Client[];
    });

    report(3, "Agenda...");
    await syncAppointments(userId).catch((e) => console.warn("fullSync: agenda falhou", e));

    report(4, "Pedidos...");
    const orders = await syncOrders(userId).catch((e) => {
      console.warn("fullSync: pedidos falhou", e);
      return [] as Order[];
    });

    report(5, "Feriados...");
    await syncHolidays(clients).catch((e) => console.warn("fullSync: feriados falhou", e));

    if (comArquivos) {
      report(6, "Arquivos...", { atual: 0, total: 0 });
      await syncFiles(userId, orders, (atual, total) => report(6, "Arquivos...", { atual, total })).catch((e) =>
        console.warn("fullSync: arquivos falhou", e)
      );
    }
  } finally {
    syncing = false;
  }
}
