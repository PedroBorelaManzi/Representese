import { normalizeKey, toTitleCase } from "./utils";

/**
 * Redes (grupos de clientes): vários CNPJs/CDs do mesmo cliente compram
 * separado, mas o representante quer ver o faturamento da rede toda. A rede é
 * só o campo `clients.network_name` — nenhum cadastro é mesclado.
 */

export interface RedeClient {
  id: string;
  name?: string | null;
  nome_fantasia?: string | null;
  city?: string | null;
  network_name?: string | null;
}

export interface RedeOrder {
  client_id: string;
  value?: number | string | null;
  category?: string | null;
  created_at: string;
}

export interface RedeCd {
  id: string;
  name: string;
  city: string;
  revenue: number;
  orders: number;
  lastOrderAt: string | null;
}

export interface RedeSummary {
  /** chave normalizada (case/acento-insensível) */
  key: string;
  name: string;
  revenue: number;
  orders: number;
  /** total de CDs cadastrados na rede */
  cdsTotal: number;
  /** CDs que compraram no período */
  cdsBought: number;
  cds: RedeCd[];
  byCompany: { name: string; revenue: number }[];
}

export const redeKey = (name?: string | null): string => normalizeKey(name || "");

/** Nomes de rede já cadastrados (sem duplicar por grafia), em ordem alfabética. */
export function existingNetworks(clients: RedeClient[]): string[] {
  const map = new Map<string, string>();
  clients.forEach((c) => {
    const n = (c.network_name || "").trim();
    if (n && !map.has(redeKey(n))) map.set(redeKey(n), n);
  });
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

/**
 * Soma pedidos por rede (só clientes com `network_name`). `inRange` filtra por
 * data do pedido; sem ele conta tudo. Redes sem compra no período continuam na
 * lista (com R$ 0) — a rede ter CDs parados também é informação.
 */
export function aggregateNetworks(
  clients: RedeClient[],
  orders: RedeOrder[],
  opts: { inRange?: (createdAt: string) => boolean; company?: string | null } = {}
): RedeSummary[] {
  const { inRange, company } = opts;
  const companyKey = company ? normalizeKey(company) : null;

  const byClient = new Map<string, { revenue: number; orders: number; last: string | null; comp: Map<string, number> }>();
  orders.forEach((o) => {
    if (inRange && !inRange(o.created_at)) return;
    const cat = (o.category || "").trim();
    if (companyKey && normalizeKey(cat) !== companyKey) return;
    const agg = byClient.get(o.client_id) || { revenue: 0, orders: 0, last: null, comp: new Map() };
    const value = Number(o.value) || 0;
    agg.revenue += value;
    agg.orders += 1;
    if (!agg.last || o.created_at > agg.last) agg.last = o.created_at;
    const label = cat || "Sem empresa";
    agg.comp.set(label, (agg.comp.get(label) || 0) + value);
    byClient.set(o.client_id, agg);
  });

  const networks = new Map<string, RedeSummary & { comp: Map<string, number> }>();
  clients.forEach((c) => {
    const n = (c.network_name || "").trim();
    if (!n) return;
    const key = redeKey(n);
    let net = networks.get(key);
    if (!net) {
      net = { key, name: n, revenue: 0, orders: 0, cdsTotal: 0, cdsBought: 0, cds: [], byCompany: [], comp: new Map() };
      networks.set(key, net);
    }
    const agg = byClient.get(c.id);
    net.cdsTotal += 1;
    if (agg && agg.orders > 0) {
      net.cdsBought += 1;
      net.revenue += agg.revenue;
      net.orders += agg.orders;
      agg.comp.forEach((v, k) => net!.comp.set(k, (net!.comp.get(k) || 0) + v));
    }
    net.cds.push({
      id: c.id,
      name: c.name || c.nome_fantasia || "Cliente sem nome",
      city: c.city || "",
      revenue: agg?.revenue || 0,
      orders: agg?.orders || 0,
      lastOrderAt: agg?.last || null,
    });
  });

  return Array.from(networks.values())
    .map(({ comp, ...net }) => ({
      ...net,
      cds: net.cds.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)),
      byCompany: Array.from(comp.entries())
        .map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Sugestão automática de redes
// ---------------------------------------------------------------------------

/** Palavras genéricas: sozinhas não identificam uma rede ("Supermercado X" ≠ "Supermercado Y"). */
const GENERIC = new Set([
  "SUPERMERCADO", "SUPERMERCADOS", "MERCADO", "MERCADINHO", "COMERCIO", "COMERCIAL", "COM", "DE", "DA", "DO", "DAS", "DOS", "E",
  "CASA", "CASAS", "LOJA", "LOJAS", "ATACADO", "ATACADAO", "ATACADISTA", "VAREJO", "VAREJISTA", "DISTRIBUIDORA", "DISTRIBUIDOR",
  "INDUSTRIA", "INDUSTRIAL", "EMPRESA", "GRUPO", "REDE", "CENTRO", "CENTER", "PADARIA", "RESTAURANTE", "BAR", "HOTEL",
  "FARMACIA", "DROGARIA", "AUTO", "POSTO", "MATERIAIS", "CONSTRUCAO", "MAGAZINE", "EMPORIO", "ARMAZEM", "SUPER", "HIPER",
  "HIPERMERCADO", "MINI", "MINIMERCADO", "ME", "EPP", "LTDA", "EIREL", "EIRELI", "SA", "S", "A", "MEI", "FILIAL", "MATRIZ",
  // ramo de materiais de construção / varejo em geral
  "PARA", "DEPOSITO", "DEPOSITOS", "MADEIREIRA", "MADEIREIRAS", "MATERIAL", "MAT", "BASICO", "BASICOS", "CONSTRUCAO", "CONSTRUCOES",
  "ACABAMENTO", "ACABAMENTOS", "REVESTIMENTO", "REVESTIMENTOS", "PISOS", "PORCELANATOS", "LAR", "UTILIDADES", "DOMESTICAS",
  "TRANSPORTES", "REPRESENTACOES", "SERVICOS", "PRODUTOS", "TIJOLOS", "BLOCOS", "LAJES", "FERRAGENS", "TINTAS", "SHOPPING",
  "SOCIEDADE", "UNIPESSOAL", "SAO", "SANTA", "SANTO", "NOSSA", "SENHORA", "IRMAOS", "JARDIM", "VILA", "PARQUE", "NOVA", "NOVO",
  "DOS", "DAS", "COMERCIAL", "INDUSTRIA", "COMERCIO",
  // primeiros nomes comuns: "Antonio X" e "Antonio Y" são pessoas diferentes, não uma rede
  "ANTONIO", "JOSE", "JOAO", "MARIA", "ANA", "PAULO", "CARLOS", "LUIZ", "LUIS", "LUCAS", "PEDRO", "FRANCISCO", "MARCOS", "MARCO",
  "ROBERTO", "ANGELO", "ELIANA", "ADRIANA", "ALEXANDRE", "ANDRE", "FERNANDO", "FABIO", "FLAVIO", "RICARDO", "RODRIGO", "SERGIO",
  "MARCIA", "MARCELO", "CLAUDIO", "CLAUDIA", "LUCIANA", "SANDRA", "VANDERLEIA", "LIDIA", "LEONARDO", "DANIEL", "EDUARDO",
  "GABRIEL", "GUSTAVO", "JULIO", "JOSIEL", "JOSETY", "NILTON", "OCIMAR", "AGNALDO", "IRENE", "CELIA", "CLEUZA", "LETICIA",
  "DONIZETE", "VANDERLEI", "APARECIDA", "APARECIDO", "SEBASTIAO", "BENEDITO", "MANOEL", "MANUEL", "OSVALDO", "ANTONIA",
]);

function tokens(name: string): string[] {
  return normalizeKey(name)
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Marca do nome = a PRIMEIRA palavra (ex.: "Caetano De Boituva …" → CAETANO).
 * Só ela: pular palavras genéricas fazia sobrenomes do meio do nome casarem
 * ("Rodrigo Aparecido de Assis" com "Assis Materiais"). Exceções: "Casa do X"
 * / "Loja da X" (marca = X) e "Rede X" / "Grupo X" (marca = X).
 * Primeira palavra genérica, primeiro nome comum, número ou < 4 letras → sem marca.
 */
export function networkPrefix(name?: string | null): string | null {
  const t = tokens(name || "");
  let i = 0;
  if (["REDE", "GRUPO"].includes(t[0])) i = 1;
  else if (["CASA", "CASAS", "LOJA", "LOJAS"].includes(t[0]) && ["DO", "DA", "DE", "DOS", "DAS"].includes(t[1])) i = 2;
  const w = t[i];
  if (!w || w.length < 4 || /^\d+$/.test(w) || GENERIC.has(w)) return null;
  return w;
}

export interface NetworkSuggestion {
  key: string;
  /** nome sugerido para a rede (editável na tela) */
  name: string;
  /** rede já cadastrada que casa com o prefixo, se houver */
  existing: string | null;
  clients: RedeClient[];
}

/**
 * Sugere redes olhando clientes AINDA sem rede: os que compartilham a mesma
 * primeira palavra "de marca" (≥ 2 cadastros). Se já existe uma rede cadastrada
 * com esse prefixo, a sugestão é adicionar os clientes a ela — mesmo com 1 só.
 * É só sugestão: quem confirma é o usuário.
 */
export function suggestNetworks(clients: RedeClient[]): NetworkSuggestion[] {
  const existing = new Map<string, string>(); // prefixo → nome da rede
  clients.forEach((c) => {
    const n = (c.network_name || "").trim();
    const p = networkPrefix(n);
    if (n && p && !existing.has(p)) existing.set(p, n);
  });

  const groups = new Map<string, RedeClient[]>();
  clients.forEach((c) => {
    if ((c.network_name || "").trim()) return;
    const p = networkPrefix(c.nome_fantasia || c.name) || networkPrefix(c.name);
    if (!p) return;
    groups.set(p, [...(groups.get(p) || []), c]);
  });

  const out: NetworkSuggestion[] = [];
  groups.forEach((list, prefix) => {
    const ex = existing.get(prefix) || null;
    if (!ex && list.length < 2) return;
    out.push({ key: prefix, name: ex || toTitleCase(prefix), existing: ex, clients: list });
  });
  return out.sort((a, b) => b.clients.length - a.clients.length || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Relatórios: agrupar "top clientes" por rede
// ---------------------------------------------------------------------------

export interface TopLike {
  id: string;
  name: string;
  revenue: number;
  orders: number;
  share: number;
  network?: string | null;
}

export interface TopGrouped extends TopLike {
  /** quantos cadastros (CDs) entraram na linha; 1 = cliente avulso */
  members: number;
  isNetwork: boolean;
}

/** Junta clientes da mesma rede numa linha só; quem não tem rede continua avulso. */
export function groupTopByNetwork(list: TopLike[]): TopGrouped[] {
  const nets = new Map<string, TopGrouped>();
  const out: TopGrouped[] = [];
  list.forEach((c) => {
    const net = (c.network || "").trim();
    if (!net) {
      out.push({ ...c, members: 1, isNetwork: false });
      return;
    }
    const key = redeKey(net);
    const cur = nets.get(key);
    if (cur) {
      cur.revenue += c.revenue;
      cur.orders += c.orders;
      cur.share += c.share;
      cur.members += 1;
    } else {
      const row: TopGrouped = { id: `rede:${key}`, name: net, revenue: c.revenue, orders: c.orders, share: c.share, network: net, members: 1, isNetwork: true };
      nets.set(key, row);
      out.push(row);
    }
  });
  return out.sort((a, b) => b.revenue - a.revenue);
}
