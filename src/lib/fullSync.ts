// src/lib/fullSync.ts
//
// Sincronização completa: com internet, baixa TUDO (clientes, pedidos,
// agenda, feriados e, no app nativo, o conteúdo de cada PDF/arquivo) e
// deixa salvo no aparelho — não é o usuário quem escolhe o que sincronizar
// aqui (isso é só pra download avulso de um arquivo específico via
// fileCache.ts). Roda no boot do app e sempre que a conexão volta — mas só
// conta como "feita" (uma vez por dia) quando chega a 100%: interrompida no
// meio, retoma na próxima abertura pulando o que já foi baixado.
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { offlineCache, CacheKeys } from "./offlineCache";
import { fetchHolidays } from "./holidayService";
import { getCachedUriSePresente, getCachedFileUri } from "./fileCache";
import { listAllPaths, BUCKET as USER_FILES_BUCKET } from "./storageList";
import { queryClient } from "./queryClient";
import { saveOffline, OfflineKeys } from "./offlineStore";
import { fetchReportAnalytics } from "./reportAnalytics";
import type { Client, Order, Appointment } from "../types";

const CLIENT_VAULT_BUCKET = "client_vault";

/** Dados baixados ficam salvos por 1 ano no aparelho (na prática, até a próxima
 *  sincronização trocá-los): o app funciona como "música baixada" — quem passa
 *  semanas sem internet continua vendo tudo da última vez que sincronizou. */
const SYNC_TTL_MS = 365 * 24 * 60 * 60 * 1000;
/** O Supabase devolve no máximo 1000 linhas por consulta — acima disso é preciso paginar. */
const PAGE_SIZE = 1000;
const TABLE_TIMEOUT_MS = 60_000;
const FILE_TIMEOUT_MS = 180_000;
const FILE_CONCURRENCY = 3;

export type FullSyncResult = "complete" | "incomplete" | "busy" | "offline";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timeout`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

/** Lê a tabela inteira, página a página (ordenada por id pra a paginação ser estável). */
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withTimeout(Promise.resolve(build(from, from + PAGE_SIZE - 1)), TABLE_TIMEOUT_MS, "tabela");
    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

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
  if (data) offlineCache.set(CacheKeys.USER_SETTINGS, data, SYNC_TTL_MS);
}

async function syncClients(userId: string): Promise<Client[]> {
  const clients = await fetchAllRows<Client>((f, t) =>
    supabase.from("clients").select("*").eq("user_id", userId).order("id").range(f, t)
  );
  offlineCache.set(CacheKeys.CLIENTS, clients, SYNC_TTL_MS);
  return clients;
}

async function syncAppointments(userId: string): Promise<void> {
  const appointments = await fetchAllRows<Appointment>((f, t) =>
    supabase.from("appointments").select("*").eq("user_id", userId).order("id").range(f, t)
  );
  offlineCache.set(CacheKeys.APPOINTMENTS, appointments, SYNC_TTL_MS);
}

async function syncOrders(userId: string): Promise<Order[]> {
  const orders = await fetchAllRows<Order>((f, t) =>
    supabase.from("orders").select("*").eq("user_id", userId).order("id").range(f, t)
  );
  offlineCache.set(CacheKeys.ORDERS, orders, SYNC_TTL_MS);
  return orders;
}

/** Produtos e parcelas de cada pedido — o detalhe do pedido abre offline com eles. */
async function syncOrderDetails(userId: string): Promise<void> {
  const [items, installments] = await Promise.all([
    fetchAllRows<any>((f, t) => supabase.from("order_items").select("*").eq("user_id", userId).order("id").range(f, t)),
    fetchAllRows<any>((f, t) => supabase.from("order_installments").select("*").eq("user_id", userId).order("id").range(f, t)),
  ]);
  offlineCache.set(CacheKeys.ALL_ORDER_ITEMS, items, SYNC_TTL_MS);
  offlineCache.set(CacheKeys.ALL_ORDER_INSTALLMENTS, installments, SYNC_TTL_MS);
}

/**
 * Gera (no aparelho) e guarda o PDF de cada pedido criado no app, pra abrir
 * sem internet. Só no nativo. Falha aqui nunca deixa a sincronização
 * "incompleta" — o PDF também é refeito na hora quando a pessoa abre o pedido.
 */
async function syncOrderPdfs(orders: Order[], clients: Client[]): Promise<void> {
  const alvo = orders.filter((o) => o.pricing);
  if (alvo.length === 0) return;
  const { cacheOrderPdf } = await import("./orderPdfLoad");
  const itens = offlineCache.get<any[]>(CacheKeys.ALL_ORDER_ITEMS) || [];
  const porPedido = new Map<string, any[]>();
  for (const i of itens) {
    const l = porPedido.get(i.order_id);
    if (l) l.push(i);
    else porPedido.set(i.order_id, [i]);
  }
  const porCliente = new Map(clients.map((c) => [c.id, c]));
  const logo = offlineCache.get<{ logo_url?: string | null }>(CacheKeys.USER_SETTINGS)?.logo_url;
  for (const o of alvo) {
    try {
      await cacheOrderPdf(o, porCliente.get(o.client_id), porPedido.get(o.id) || [], logo);
    } catch (e) {
      console.warn("fullSync: PDF do pedido não gerado", o.id, e);
    }
    // respira entre um PDF e outro pra tela continuar respondendo
    await new Promise((r) => setTimeout(r, 0));
  }
}


/**
 * Catálogo de produtos, exceções por cliente, anotações do dia e avisos
 * dispensados: entram no cache das telas (mesmas chaves das consultas delas)
 * pra abrirem e funcionarem sem internet — inclusive criar pedido com o
 * catálogo — mesmo que a pessoa nunca tenha aberto essas telas antes.
 */
async function syncExtras(userId: string): Promise<void> {
  const [catalog, overrides, notes, dismissals] = await Promise.all([
    fetchAllRows<any>((f, t) => supabase.from("product_catalog").select("*").eq("user_id", userId).order("name").range(f, t)),
    fetchAllRows<any>((f, t) => supabase.from("client_product_settings").select("product_key, category").eq("user_id", userId).order("id").range(f, t)),
    fetchAllRows<any>((f, t) => supabase.from("daily_notes").select("date, content").eq("user_id", userId).order("date").range(f, t)),
    fetchAllRows<any>((f, t) => supabase.from("alert_dismissals").select("client_name_key, company, last_order_at").eq("user_id", userId).order("client_name_key").range(f, t)),
  ]);

  queryClient.setQueryData(["product_catalog", userId], catalog);

  const porCategoria = new Map<string, string[]>();
  for (const o of overrides) {
    const l = porCategoria.get(o.category);
    if (l) l.push(o.product_key);
    else porCategoria.set(o.category, [o.product_key]);
  }
  const categorias = new Set<string>(catalog.map((c: any) => c.category).filter(Boolean));
  porCategoria.forEach((_, c) => categorias.add(c));
  categorias.forEach((c) => queryClient.setQueryData(["client_product_settings_counts", userId, c], porCategoria.get(c) || []));

  for (const n of notes) {
    offlineCache.set(`rm_cache_daily_notes_${userId}_${n.date}`, n.content || "", SYNC_TTL_MS);
  }

  queryClient.setQueryData(
    ["clients", userId, "alert_dismissals"],
    dismissals.map((d: any) => ({ clientNameKey: d.client_name_key, company: d.company, lastOrderAt: d.last_order_at }))
  );
}

/**
 * Conversa inteira com o Assistente, lista de entregas (pedidos + cliente) e
 * vínculo das empresas: cópia permanente pra essas telas abrirem sem internet.
 */
async function syncOfflineExtras(userId: string, orders: Order[], clients: Client[]): Promise<void> {
  const [chats, reps] = await Promise.all([
    fetchAllRows<any>((f, t) =>
      supabase.from("ai_chats").select("id, role, content, created_at").eq("user_id", userId).order("created_at", { ascending: true }).range(f, t)
    ),
    fetchAllRows<any>((f, t) => supabase.from("company_reps").select("category_name").eq("user_id", userId).range(f, t)),
  ]);
  await saveOffline(OfflineKeys.aiChats(userId), chats);
  await saveOffline(OfflineKeys.companyReps(userId), reps);

  // Mesmo formato da consulta da tela de Entregas (pedido + cliente resumido).
  const porCliente = new Map(clients.map((c) => [c.id, c]));
  const entregas = [...orders]
    .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .map((o: any) => {
      const c: any = porCliente.get(o.client_id);
      return { ...o, client: c ? { id: c.id, name: c.name, cnpj: c.cnpj, city: c.city, state: c.state } : null };
    });
  await saveOffline(OfflineKeys.entregas(userId), entregas);
}

/** Relatórios dos últimos meses já calculados e guardados (mesma chave da tela de Relatórios). */
async function syncReports(userId: string): Promise<void> {
  const settings = offlineCache.get<any>(CacheKeys.USER_SETTINGS) || {};
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    await queryClient.prefetchQuery({
      queryKey: ["reportAnalytics", "v3", userId, year, month],
      queryFn: () =>
        fetchReportAnalytics(userId, year, month, settings.commissions || {}, {
          alertaDays: settings.alerta_days || 30,
          criticoDays: settings.critico_days || 45,
          inativoDays: settings.inativo_days || 90,
        }),
      staleTime: 0,
    });
  }
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
): Promise<{ failed: number }> {
  const orderTargets = orders
    .filter((o) => !!o.file_path)
    .map((o) => ({ bucket: CLIENT_VAULT_BUCKET, path: o.file_path as string }));

  let listFailed = 0;
  const generalPaths = await listAllPaths(USER_FILES_BUCKET, userId).catch((e) => {
    console.warn("fullSync: falha ao listar Arquivos gerais", e);
    listFailed = 1;
    return [] as string[];
  });
  const generalTargets = generalPaths.map((p) => ({ bucket: USER_FILES_BUCKET, path: p }));

  // Dois pedidos podem apontar pro mesmo arquivo: baixa uma vez só.
  const seen = new Set<string>();
  const targets = [...orderTargets, ...generalTargets].filter((t) => {
    const k = `${t.bucket}/${t.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  let done = 0;
  let failed = listFailed;
  let next = 0;
  onFileProgress?.(0, targets.length);

  // Arquivo que não existe mais no Storage não é "falha": não adianta tentar
  // de novo, e se contasse a sincronização nunca fecharia 100%.
  const isMissing = (err: any) => /not.?found|does not exist|404/i.test(String(err?.message || err?.error || err || ""));

  const worker = async () => {
    while (next < targets.length) {
      const t = targets[next++];
      try {
        const jaEmCache = await getCachedUriSePresente(t.path);
        if (!jaEmCache) {
          const { data, error } = await supabase.storage.from(t.bucket).createSignedUrl(t.path, 60 * 60);
          if (error || !data?.signedUrl) {
            if (!isMissing(error)) failed++;
          } else {
            await withTimeout(getCachedFileUri(t.path, data.signedUrl), FILE_TIMEOUT_MS, t.path);
          }
        }
      } catch (e) {
        // Um arquivo com problema não trava os outros — mas a sincronização
        // fica "incompleta" e retoma só o que faltou na próxima vez.
        failed++;
        console.warn("fullSync: falha ao cachear arquivo", t.path, e);
      }
      done++;
      onFileProgress?.(done, targets.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FILE_CONCURRENCY, targets.length) }, worker));
  return { failed };
}

/**
 * Roda a sincronização completa. Cada etapa é isolada: se uma falhar (ex.
 * feriados fora do ar), as outras seguem normalmente em vez de travar tudo.
 */
export async function runFullSync(userId: string, onProgress?: (p: FullSyncProgress) => void): Promise<FullSyncResult> {
  if (syncing) return "busy";
  if (!offlineCache.isOnline()) return "offline";

  syncing = true;
  const comArquivos = Capacitor.isNativePlatform();
  const etapaTotal = comArquivos ? ETAPA_TOTAL_COM_ARQUIVOS : ETAPA_TOTAL_SEM_ARQUIVOS;
  const report = (etapaIndex: number, etapaLabel: string, sub?: { atual: number; total: number }) =>
    onProgress?.({ etapaIndex, etapaTotal, etapaLabel, subAtual: sub?.atual, subTotal: sub?.total });

  // Qualquer etapa que falhar deixa a sincronização "incompleta" — as demais
  // seguem, mas o dia só conta como sincronizado quando tudo chegou.
  let complete = true;
  const guard = <T,>(label: string, fallback: T) => (e: unknown): T => {
    complete = false;
    console.warn(`fullSync: ${label} falhou`, e);
    return fallback;
  };

  try {
    // As etapas de dados não dependem umas das outras (só feriados precisa dos
    // clientes e PDFs precisam dos itens), então rodam EM PARALELO — antes eram
    // uma depois da outra e a soma das esperas deixava tudo lento.
    let feitas = 0;
    const concluiu = (label: string) => {
      feitas++;
      report(Math.min(feitas + 1, 5), label);
    };
    report(1, "Baixando dados...");

    let clients: Client[] = [];
    let orders: Order[] = [];
    await Promise.all([
      syncUserSettings(userId).catch(guard("user_settings", undefined)).then(() => concluiu("Configurações...")),
      (async () => {
        clients = await syncClients(userId).catch(guard("clientes", [] as Client[]));
        concluiu("Clientes...");
        await syncHolidays(clients).catch(guard("feriados", undefined));
        concluiu("Feriados...");
      })(),
      syncAppointments(userId).catch(guard("agenda", undefined)).then(() => concluiu("Agenda...")),
      syncExtras(userId).catch(guard("catálogo e anotações", undefined)).then(() => concluiu("Catálogo e anotações...")),
      (async () => {
        const [pedidos] = await Promise.all([
          syncOrders(userId).catch(guard("pedidos", [] as Order[])),
          syncOrderDetails(userId).catch(guard("itens dos pedidos", undefined)),
        ]);
        orders = pedidos;
        concluiu("Pedidos...");
      })(),
    ]);
    await syncOfflineExtras(userId, orders, clients).catch(guard("assistente e entregas", undefined));
    await syncReports(userId).catch((e) => console.warn("fullSync: relatórios", e));
    if (comArquivos) await syncOrderPdfs(orders, clients).catch((e) => console.warn("fullSync: PDFs dos pedidos", e));

    if (comArquivos) {
      report(6, "Arquivos...", { atual: 0, total: 0 });
      const r = await syncFiles(userId, orders, (atual, total) => report(6, "Arquivos...", { atual, total })).catch(
        guard("arquivos", { failed: 0 })
      );
      if (r.failed > 0) complete = false;
    }
    return complete ? "complete" : "incomplete";
  } finally {
    syncing = false;
  }
}
