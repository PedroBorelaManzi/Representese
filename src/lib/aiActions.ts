import { supabase } from "./supabase";

/* ────────────────────────────────────────────────────────────────
   Ações que o Assistente IA pode executar dentro do app.

   O modelo emite, ao final da resposta, um bloco:

   ```action
   {"type":"route","clients":["Cliente A","Cliente B"]}
   ```

   Este arquivo cuida de: extrair esses blocos, casar nomes de clientes
   com a carteira e executar cada ação (rota, pedido, whatsapp, relatório).
   ──────────────────────────────────────────────────────────────── */

export type ClientChanges = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: string;
  notes?: string;
  city?: string;
  state?: string;
  cnpj?: string;
};

export type AIAction =
  | { type: "route"; clients: string[] }
  | { type: "order"; client: string; category: string; value: number }
  | { type: "whatsapp"; client: string; message: string }
  | { type: "report"; period?: string }
  // ── autonomia: clientes ──
  | { type: "update_client"; client: string; changes: ClientChanges }
  | { type: "relocate_client"; client: string; location: string }
  | { type: "create_client"; cnpj?: string; name?: string; address?: string }
  | { type: "delete_client"; client: string }
  // ── autonomia: agenda ──
  | { type: "create_appointment"; title: string; date: string; time: string; client?: string }
  | { type: "update_appointment"; id: string; changes: { title?: string; date?: string; time?: string } }
  | { type: "delete_appointment"; id: string };

/** Compromisso da agenda no contexto do assistente. */
export interface AIAppointment {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  client_id?: string | null;
  google_event_id?: string | null;
}

/** Cliente da carteira no contexto do assistente (campos usados pelas ações). */
export interface AIActionClient {
  id: string;
  name: string;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
  last_contact: string | null;
  notes: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  faturamento: Record<string, number> | null;
}

/* ─── parsing dos blocos de ação ────────────────────────────────── */

const ACTION_BLOCK = /```action\s*([\s\S]*?)```/gi;

/**
 * Separa o texto "limpo" (sem os blocos de ação) das ações detectadas.
 */
export function parseActions(raw: string): { text: string; actions: AIAction[] } {
  const actions: AIAction[] = [];
  let match: RegExpExecArray | null;

  ACTION_BLOCK.lastIndex = 0;
  while ((match = ACTION_BLOCK.exec(raw)) !== null) {
    const jsonStr = match[1].trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.type === "string") {
        actions.push(parsed as AIAction);
      }
    } catch {
      /* bloco malformado: ignora silenciosamente */
    }
  }

  const text = raw.replace(ACTION_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text, actions };
}

/* ─── helpers de matching ───────────────────────────────────────── */

const normalize = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Encontra um cliente da carteira por nome (exato, depois por inclusão). */
export function findClient(
  clients: AIActionClient[],
  name: string
): AIActionClient | undefined {
  const target = normalize(name);
  if (!target) return undefined;
  return (
    clients.find((c) => normalize(c.name) === target) ||
    clients.find((c) => normalize(c.name).includes(target)) ||
    clients.find((c) => target.includes(normalize(c.name)))
  );
}

/* ─── faturamento ───────────────────────────────────────────────── */

export function totalFaturamento(fat: Record<string, number> | null): number {
  if (!fat || typeof fat !== "object") return 0;
  return Object.values(fat).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

const BRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

/* ─── 1. ROTA ───────────────────────────────────────────────────── */

export interface RouteResult {
  url: string | null;
  matched: AIActionClient[];
  missingCoords: string[];
  notFound: string[];
}

/** Distância em km entre dois pontos (fórmula de Haversine). */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Reordena os clientes pelo algoritmo do vizinho mais próximo:
 * começa pelo primeiro da lista e sempre vai para o cliente mais próximo
 * ainda não visitado — minimiza distância total percorrida.
 */
function nearestNeighborOrder(stops: AIActionClient[]): AIActionClient[] {
  if (stops.length <= 2) return stops;
  const remaining = [...stops.slice(1)];
  const ordered = [stops[0]];

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;

    remaining.forEach((c, i) => {
      const dist = haversineKm(current.lat!, current.lng!, c.lat!, c.lng!);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    });

    ordered.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return ordered;
}

/**
 * Monta a URL do Google Maps com as paradas (máx. 10) otimizadas pelo
 * algoritmo do vizinho mais próximo para minimizar deslocamento total.
 */
export function buildRoute(
  clients: AIActionClient[],
  names: string[]
): RouteResult {
  const matched: AIActionClient[] = [];
  const missingCoords: string[] = [];
  const notFound: string[] = [];

  for (const name of names) {
    const c = findClient(clients, name);
    if (!c) {
      notFound.push(name);
    } else if (!c.lat || !c.lng) {
      missingCoords.push(c.name);
    } else if (!matched.some((m) => m.id === c.id)) {
      matched.push(c);
    }
  }

  const stops = nearestNeighborOrder(matched.slice(0, 10));
  const url =
    stops.length > 0
      ? `https://www.google.com/maps/dir/${stops.map((c) => `${c.lat},${c.lng}`).join("/")}`
      : null;

  return { url, matched: stops, missingCoords, notFound };
}

/* ─── 2. WHATSAPP ───────────────────────────────────────────────── */

export interface WhatsappResult {
  url: string | null;
  client: AIActionClient | undefined;
  message: string;
  hasPhone: boolean;
}

/** Normaliza o telefone BR e monta o link wa.me com a mensagem pré-preenchida. */
export function buildWhatsapp(
  clients: AIActionClient[],
  clientName: string,
  message: string
): WhatsappResult {
  const client = findClient(clients, clientName);
  const digits = (client?.phone || "").replace(/\D/g, "");
  let phone = digits;
  if (digits.length === 10 || digits.length === 11) phone = `55${digits}`;
  const hasPhone = phone.length >= 12;
  const url = hasPhone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : null;
  return { url, client, message, hasPhone };
}

/* ─── 3. PEDIDO MANUAL ──────────────────────────────────────────── */

export interface OrderDraft {
  client: AIActionClient | undefined;
  category: string;
  value: number;
}

/** Resolve o rascunho do pedido (sem persistir nada ainda). */
export function buildOrderDraft(
  clients: AIActionClient[],
  clientName: string,
  category: string,
  value: number
): OrderDraft {
  return {
    client: findClient(clients, clientName),
    category: category?.trim() || "GERAL",
    value: Number(value) || 0,
  };
}

/**
 * Persiste o pedido lançado via assistente: cria o registro em `orders`
 * e soma o valor ao faturamento (jsonb) do cliente, por categoria.
 */
export async function commitOrder(
  userId: string,
  draft: OrderDraft
): Promise<void> {
  if (!draft.client) throw new Error("Cliente não encontrado na carteira.");
  if (draft.value <= 0) throw new Error("Valor do pedido inválido.");

  const orderPayload = {
    user_id: userId,
    client_id: draft.client.id,
    category: draft.category,
    value: draft.value,
    file_name: "Pedido lançado via Assistente IA",
    file_path: `ia-manual/${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("orders").insert([orderPayload]);
  if (error) throw error;

  // Atualiza faturamento acumulado do cliente
  const { data: clientData } = await supabase
    .from("clients")
    .select("faturamento")
    .eq("id", draft.client.id)
    .single();

  const fat = (clientData?.faturamento as Record<string, number>) || {};
  const catKey = draft.category || "GERAL";
  const updatedFat = { ...fat, [catKey]: Number(fat[catKey] || 0) + draft.value };

  await supabase
    .from("clients")
    .update({ faturamento: updatedFat, last_contact: new Date().toISOString().slice(0, 10) })
    .eq("id", draft.client.id)
    .eq("user_id", userId);
}

/* ─── AUTONOMIA: CLIENTES ───────────────────────────────────────── */

/** Consulta um CNPJ na BrasilAPI e devolve dados completos para cadastro e geocoding. */
export async function lookupCnpj(cnpj: string): Promise<{
  name: string;
  fantasia: string;
  address: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  cnpj: string;
} | null> {
  const clean = (cnpj || "").replace(/\D/g, "");
  if (clean.length !== 14) throw new Error("CNPJ inválido (precisa de 14 dígitos).");

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
  if (!res.ok) throw new Error("CNPJ não encontrado na Receita.");
  const d = await res.json();

  const streetType = d.tipo_logradouro ? `${d.tipo_logradouro} ` : "";
  const street = `${streetType}${d.logradouro || ""}`.trim();
  const number = d.numero || "S/N";
  const neighborhood = d.bairro || "";
  const city = d.municipio || "";
  const state = d.uf || "";
  const cep = (d.cep || "").replace(/\D/g, "");

  const address = `${street}, ${number} - ${neighborhood}, ${city} - ${state}`
    .replace(/\s+/g, " ")
    .trim();

  return {
    name: d.razao_social || d.nome_fantasia || "",
    fantasia: d.nome_fantasia || "",
    address,
    street,
    number,
    neighborhood,
    city,
    state,
    cep,
    cnpj: clean,
  };
}

/** Filtra as mudanças permitidas (evita escrever colunas inesperadas). */
function sanitizeClientChanges(changes: ClientChanges): ClientChanges {
  const allowed: (keyof ClientChanges)[] = [
    "name", "phone", "email", "address", "status", "notes", "city", "state", "cnpj",
  ];
  const out: ClientChanges = {};
  for (const k of allowed) {
    const v = (changes as any)[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      (out as any)[k] = typeof v === "string" ? v.trim() : v;
    }
  }
  return out;
}

/** Edita informações cadastrais de um cliente existente. */
export async function commitUpdateClient(
  userId: string,
  clientId: string,
  changes: ClientChanges
): Promise<void> {
  const payload = sanitizeClientChanges(changes);
  if (Object.keys(payload).length === 0) throw new Error("Nenhuma alteração válida informada.");
  if (payload.cnpj) payload.cnpj = payload.cnpj.replace(/\D/g, "");

  const { error } = await supabase
    .from("clients")
    .update(payload)
    .eq("id", clientId)
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * Muda a localização de um cliente: geocodifica o destino (cidade ou endereço)
 * e atualiza lat/lng + address.
 */
/**
 * Extrai cidade e estado de uma string de localização livre.
 * Suporta formatos: "São Paulo - SP", "São Paulo/SP", "São Paulo SP", "São Paulo"
 */
function parseLocationString(location: string): { city: string; state: string } {
  const trimmed = location.trim();
  // "Cidade - UF" ou "Cidade/UF"
  const m = trimmed.match(/^(.+?)[\s\/\-]+([A-Z]{2})\s*$/);
  if (m) return { city: m[1].trim(), state: m[2].trim() };
  return { city: trimmed, state: "" };
}

export async function commitRelocateClient(
  userId: string,
  client: AIActionClient,
  location: string
): Promise<{ lat: number; lng: number }> {
  const { getHighPrecisionCoordinates } = await import("./geminiGeocoding");

  // Extrai cidade/estado da string de localização para validar o resultado
  const { city, state } = parseLocationString(location);

  // Se o cliente tem CNPJ, enriquece com dados da Receita (endereço oficial)
  let extra = { city, state, razaoSocial: client.name } as Parameters<typeof getHighPrecisionCoordinates>[3];
  if (client.cnpj) {
    try {
      const info = await lookupCnpj(client.cnpj);
      if (info) {
        extra = {
          ...extra,
          // Usa cidade/estado da BrasilAPI se a localização passada for só a cidade
          city: city || info.city,
          state: state || info.state,
          street: info.street,
          number: info.number,
          neighborhood: info.neighborhood,
          cep: info.cep,
          razaoSocial: client.name,
          nomeFantasia: info.fantasia,
        };
      }
    } catch { /* sem enriquecimento — geocodifica só com o que temos */ }
  }

  const coords = await getHighPrecisionCoordinates(location, client.name, client.cnpj || undefined, extra);
  if (!coords) throw new Error(`Não consegui localizar "${location}" no mapa.`);

  const { error } = await supabase
    .from("clients")
    .update({ lat: coords.lat, lng: coords.lng, address: location })
    .eq("id", client.id)
    .eq("user_id", userId);
  if (error) throw error;
  return coords;
}

/**
 * Cria um cliente novo. Se vier CNPJ, puxa os dados na Receita e geocodifica.
 */
export async function commitCreateClient(
  userId: string,
  data: { cnpj?: string; name?: string; address?: string }
): Promise<{ id: string; name: string }> {
  let name = data.name?.trim() || "";
  let address = data.address?.trim() || "";
  let cnpj = (data.cnpj || "").replace(/\D/g, "");
  let city = "";
  let state = "";

  let street = "";
  let number = "";
  let neighborhood = "";
  let fantasia = "";
  let cep = "";

  if (cnpj) {
    const info = await lookupCnpj(cnpj);
    if (info) {
      name = name || info.name;
      fantasia = info.fantasia;
      address = address || info.address;
      street = info.street;
      number = info.number;
      neighborhood = info.neighborhood;
      city = info.city;
      state = info.state;
      cep = info.cep;
    }
  }

  if (!name) throw new Error("Preciso de um nome ou um CNPJ válido para cadastrar.");

  // Evita duplicar por CNPJ
  if (cnpj) {
    const { data: existing } = await supabase
      .from("clients")
      .select("id, name")
      .eq("cnpj", cnpj)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) throw new Error(`"${existing.name}" já está cadastrado com esse CNPJ.`);
  }

  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const { getHighPrecisionCoordinates } = await import("./geminiGeocoding");
    const coords = await getHighPrecisionCoordinates(address, name, cnpj || undefined, {
      razaoSocial: name,
      nomeFantasia: fantasia,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
    });
    if (coords) { lat = coords.lat; lng = coords.lng; }
  } catch { /* sem coordenadas — o pin não aparecerá até editar o endereço */ }

  const { data: inserted, error } = await supabase
    .from("clients")
    .insert([{ user_id: userId, name, cnpj, address, city, state, lat, lng, status: "Ativo", last_contact: new Date().toISOString().slice(0, 10) }])
    .select("id, name")
    .single();
  if (error) throw error;
  return inserted as { id: string; name: string };
}

/** Exclui um cliente (ação destrutiva — sempre via confirmação na UI). */
export async function commitDeleteClient(userId: string, clientId: string): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("user_id", userId);
  if (error) {
    throw new Error(
      error.code === "23503"
        ? "Cliente vinculado a pedidos/compromissos — remova-os antes."
        : "Erro ao excluir o cliente."
    );
  }
}

/* ─── AUTONOMIA: AGENDA ─────────────────────────────────────────── */

/** Cria um compromisso na agenda (e tenta espelhar no Google Calendar). */
export async function commitCreateAppointment(
  userId: string,
  payload: { title: string; date: string; time: string; client_id?: string | null }
): Promise<void> {
  if (!payload.title?.trim()) throw new Error("O compromisso precisa de um título.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) throw new Error("Data inválida (use AAAA-MM-DD).");

  const savePayload = {
    user_id: userId,
    title: payload.title.trim(),
    date: payload.date,
    time: payload.time || "09:00",
    client_id: payload.client_id || null,
  };

  const { data, error } = await supabase
    .from("appointments")
    .insert([savePayload])
    .select()
    .single();
  if (error) throw error;

  try {
    const { pushEventToGoogle } = await import("./googleSync");
    await pushEventToGoogle(userId, data);
  } catch { /* Google opcional */ }
}

/** Edita / reagenda um compromisso existente. */
export async function commitUpdateAppointment(
  userId: string,
  appt: AIAppointment,
  changes: { title?: string; date?: string; time?: string }
): Promise<void> {
  const payload: Record<string, string> = {};
  if (changes.title?.trim()) payload.title = changes.title.trim();
  if (changes.date && /^\d{4}-\d{2}-\d{2}$/.test(changes.date)) payload.date = changes.date;
  if (changes.time) payload.time = changes.time;
  if (Object.keys(payload).length === 0) throw new Error("Nenhuma alteração válida no compromisso.");

  const { data, error } = await supabase
    .from("appointments")
    .update(payload)
    .eq("id", appt.id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;

  try {
    const { pushEventToGoogle } = await import("./googleSync");
    await pushEventToGoogle(userId, data);
  } catch { /* Google opcional */ }
}

/** Exclui um compromisso (e tenta remover do Google Calendar). */
export async function commitDeleteAppointment(userId: string, appt: AIAppointment): Promise<void> {
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", appt.id)
    .eq("user_id", userId);
  if (error) throw error;

  if (appt.google_event_id) {
    try {
      const { deleteEventFromGoogle } = await import("./googleSync");
      await deleteEventFromGoogle(userId, appt.google_event_id);
    } catch { /* Google opcional */ }
  }
}

/* ─── 4. RELATÓRIO PDF ──────────────────────────────────────────── */

/**
 * Gera o HTML do relatório da carteira e abre uma janela pronta para
 * "Salvar como PDF" (print do navegador) — sem dependências externas.
 */
export function openCarteiraReport(
  clients: AIActionClient[],
  inativoDays = 90
): void {
  const totalClientes = clients.length;
  const totalFat = clients.reduce((s, c) => s + totalFaturamento(c.faturamento), 0);

  const top5 = [...clients]
    .sort((a, b) => totalFaturamento(b.faturamento) - totalFaturamento(a.faturamento))
    .slice(0, 5);

  const inativos = clients
    .map((c) => ({ c, dias: daysSince(c.last_contact) }))
    .filter((x) => x.dias !== null && x.dias >= inativoDays)
    .sort((a, b) => (b.dias || 0) - (a.dias || 0));

  // Faturamento por representada (soma das chaves do jsonb)
  const porEmpresa: Record<string, number> = {};
  clients.forEach((c) => {
    if (c.faturamento && typeof c.faturamento === "object") {
      Object.entries(c.faturamento).forEach(([k, v]) => {
        porEmpresa[k] = (porEmpresa[k] || 0) + (Number(v) || 0);
      });
    }
  });
  const empresas = Object.entries(porEmpresa).sort((a, b) => b[1] - a[1]);

  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const row = (cells: string[]) =>
    `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório da Carteira — Represente-Se</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 40px; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #10b981; padding-bottom: 16px; margin-bottom: 28px; }
  .brand { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; }
  .brand span { color: #10b981; }
  .date { font-size: 12px; color: #64748b; font-weight: 600; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin: 32px 0 12px; }
  .cards { display: flex; gap: 16px; margin-bottom: 8px; }
  .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px 20px; }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 700; }
  .card .value { font-size: 26px; font-weight: 900; margin-top: 6px; color: #0f172a; }
  .card .value.green { color: #10b981; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; border-bottom: 2px solid #e2e8f0; padding: 8px 10px; }
  td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; }
  tr:nth-child(even) td { background: #f8fafc; }
  .muted { color: #94a3b8; }
  .danger { color: #ef4444; font-weight: 700; }
  .foot { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  @media print { body { padding: 24px; } }
</style></head><body>
  <div class="head">
    <div class="brand">Represente<span>-Se!</span></div>
    <div class="date">Relatório da Carteira · ${hoje}</div>
  </div>

  <div class="cards">
    <div class="card"><div class="label">Total de Clientes</div><div class="value">${totalClientes}</div></div>
    <div class="card"><div class="label">Faturamento Total</div><div class="value green">${BRL(totalFat)}</div></div>
    <div class="card"><div class="label">Clientes Inativos</div><div class="value">${inativos.length}</div></div>
  </div>

  <h2>Top 5 Clientes por Faturamento</h2>
  <table>
    <thead><tr><th>#</th><th>Cliente</th><th>Local</th><th>Faturamento</th></tr></thead>
    <tbody>
      ${
        top5.length
          ? top5
              .map((c, i) =>
                row([
                  String(i + 1),
                  c.name,
                  [c.city, c.state].filter(Boolean).join("/") || "—",
                  BRL(totalFaturamento(c.faturamento)),
                ])
              )
              .join("")
          : `<tr><td colspan="4" class="muted">Nenhum cliente com faturamento registrado.</td></tr>`
      }
    </tbody>
  </table>

  <h2>Faturamento por Empresa Representada</h2>
  <table>
    <thead><tr><th>Empresa</th><th>Faturamento</th></tr></thead>
    <tbody>
      ${
        empresas.length
          ? empresas.map(([nome, val]) => row([nome, BRL(val)])).join("")
          : `<tr><td colspan="2" class="muted">Sem dados de faturamento por empresa.</td></tr>`
      }
    </tbody>
  </table>

  <h2>Clientes Inativos (${inativoDays}+ dias sem contato)</h2>
  <table>
    <thead><tr><th>Cliente</th><th>Local</th><th>Dias sem contato</th></tr></thead>
    <tbody>
      ${
        inativos.length
          ? inativos
              .slice(0, 30)
              .map(({ c, dias }) =>
                row([
                  c.name,
                  [c.city, c.state].filter(Boolean).join("/") || "—",
                  `<span class="danger">${dias} dias</span>`,
                ])
              )
              .join("")
          : `<tr><td colspan="3" class="muted">Nenhum cliente inativo. Carteira em dia! 🎉</td></tr>`
      }
    </tbody>
  </table>

  <div class="foot">Gerado pelo Assistente IA do Represente-Se! · www.representese.com</div>
  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("Pop-up bloqueado. Permita pop-ups para gerar o relatório.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ─── BRIEFING DIÁRIO (calculado localmente) ────────────────────── */

export interface DailyBriefing {
  totalClientes: number;
  inativos: number;
  emAlerta: number;
  totalFat: number;
  urgentes: { name: string; dias: number }[];
}

export function buildDailyBriefing(
  clients: AIActionClient[],
  thresholds: { alerta: number; critico: number; inativo: number }
): DailyBriefing {
  let inativos = 0;
  let emAlerta = 0;
  const comDias = clients
    .map((c) => ({ name: c.name, dias: daysSince(c.last_contact) }))
    .filter((x): x is { name: string; dias: number } => x.dias !== null);

  comDias.forEach(({ dias }) => {
    if (dias >= thresholds.inativo) inativos++;
    else if (dias >= thresholds.alerta) emAlerta++;
  });

  const urgentes = comDias
    .filter((x) => x.dias >= thresholds.critico)
    .sort((a, b) => b.dias - a.dias)
    .slice(0, 3);

  return {
    totalClientes: clients.length,
    inativos,
    emAlerta,
    totalFat: clients.reduce((s, c) => s + totalFaturamento(c.faturamento), 0),
    urgentes,
  };
}

export { BRL };
