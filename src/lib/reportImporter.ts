import { loadPdfjs } from "./pdfjsLoader";

/** Uma linha de pedido extraída do relatório da fábrica. */
export interface ParsedReportRow {
  orderNumber: string;
  /** Data do pedido no formato ISO (yyyy-mm-dd). */
  date: string;
  /** Data como aparece no relatório (dd/mm/aaaa) — usado na conferência visual. */
  rawDate: string;
  /** Código do cliente no sistema da fábrica, quando o relatório traz. */
  clientCode?: string;
  /** Nome do cliente como veio no relatório (costuma vir truncado). */
  clientName: string;
  /** Todas as colunas de dinheiro da linha, na ordem em que aparecem. */
  values: number[];
  city?: string;
  state?: string;
}

export interface ParsedReport {
  rows: ParsedReportRow[];
  /** Primeira linha do cabeçalho — normalmente o nome da fábrica. */
  headerHint?: string;
  /** Quantas colunas de dinheiro a maioria das linhas tem. */
  valueColumnCount: number;
  warnings: string[];
}

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Reconhece um número em formato monetário com 2 casas decimais, aceitando
 * tanto o padrão americano (1,234.56) quanto o brasileiro (1.234,56).
 * Quantidades (1,889) e pesos (133,4 / 1,300.7) ficam de fora justamente
 * porque não têm exatamente 2 casas decimais.
 */
function looksLikeMoney(token: string): boolean {
  return /^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(token)   // 1,234.56
    || /^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(token)     // 1.234,56
    || /^\d+\.\d{2}$/.test(token)                    // 1234.56
    || /^\d+,\d{2}$/.test(token);                    // 1234,56
}

/** Converte o token monetário para número, detectando qual separador é o decimal. */
export function parseMoney(token: string): number {
  const lastDot = token.lastIndexOf(".");
  const lastComma = token.lastIndexOf(",");
  let normalized: string;
  if (lastComma > lastDot) {
    // vírgula é o separador decimal (padrão brasileiro)
    normalized = token.replace(/\./g, "").replace(",", ".");
  } else {
    // ponto é o separador decimal (padrão americano)
    normalized = token.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function isNumericToken(token: string): boolean {
  return /^[\d.,]+$/.test(token);
}

/**
 * Agrupa os fragmentos de texto do PDF em linhas visuais (mesma coordenada Y),
 * ordenando cada linha da esquerda para a direita.
 */
async function extractLines(file: File): Promise<{ lines: string[][]; warnings: string[] }> {
  const warnings: string[] = [];
  const pdfjs = await loadPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer, isEvalSupported: false }).promise;

  const lines: string[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    const byY = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as any[]) {
      const str = item?.str;
      if (!str || !str.trim()) continue;
      // arredonda o Y para juntar fragmentos da mesma linha
      const y = Math.round(item.transform[5]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x: item.transform[4], s: str.trim() });
    }

    const ordered = [...byY.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, items] of ordered) {
      items.sort((a, b) => a.x - b.x);
      // Cada fragmento pode conter várias "colunas" separadas por espaços largos,
      // então quebramos também por espaço para normalizar em tokens.
      const tokens = items.flatMap(i => i.s.split(/\s{1,}/)).filter(Boolean);
      if (tokens.length) lines.push(tokens);
    }
  }

  if (!lines.length) {
    warnings.push("Não foi possível ler texto deste PDF. Se ele for um arquivo escaneado (imagem), a leitura automática não funciona.");
  }
  return { lines, warnings };
}

/**
 * Interpreta as linhas já extraídas do relatório. Separado da leitura do PDF
 * para poder ser testado sem depender do pdfjs.
 *
 * A leitura é por heurística (não amarrada ao layout de uma fábrica específica):
 * uma linha só vira pedido se tiver exatamente uma data, um número de pedido e
 * pelo menos um valor monetário. Cabeçalhos, linhas de agrupamento por vendedor
 * e as linhas de Sub-Total/Total são descartadas naturalmente por essa regra.
 */
export function parseReportLines(lines: string[][], warnings: string[] = []): ParsedReport {
  const rows: ParsedReportRow[] = [];
  let headerHint: string | undefined;

  for (const tokens of lines) {
    if (!headerHint && tokens.length) {
      const candidate = tokens.join(" ").trim();
      if (candidate.length > 3) headerHint = candidate.replace(/^\d+\s+/, "").split("Pagina")[0].trim();
    }

    const dateIdxs = tokens.map((t, i) => (DATE_RE.test(t) ? i : -1)).filter(i => i >= 0);
    if (dateIdxs.length !== 1) continue; // linha de cabeçalho ("período de X a Y") tem 2 datas

    const dateIdx = dateIdxs[0];
    const moneyIdxs = tokens.map((t, i) => (looksLikeMoney(t) ? i : -1)).filter(i => i > dateIdx);
    if (!moneyIdxs.length) continue; // sem valor: não é linha de pedido

    // Número do pedido: último token puramente numérico antes da data
    let orderNumber = "";
    for (let i = dateIdx - 1; i >= 0; i--) {
      if (/^\d+$/.test(tokens[i])) { orderNumber = tokens[i]; break; }
    }
    if (!orderNumber) continue;

    // Depois da data pode vir o código do cliente (numérico) e então o nome
    let cursor = dateIdx + 1;
    let clientCode: string | undefined;
    if (cursor < tokens.length && /^\d+$/.test(tokens[cursor])) {
      clientCode = tokens[cursor];
      cursor++;
    }

    const nameParts: string[] = [];
    while (cursor < tokens.length && !isNumericToken(tokens[cursor])) {
      nameParts.push(tokens[cursor]);
      cursor++;
    }
    const clientName = nameParts.join(" ").trim();
    if (!clientName) continue;

    const values = moneyIdxs.map(i => parseMoney(tokens[i]));

    // Cidade/UF: o que sobra depois da última coluna de dinheiro
    let city: string | undefined;
    let state: string | undefined;
    const tail = tokens.slice(moneyIdxs[moneyIdxs.length - 1] + 1).filter(t => !isNumericToken(t));
    if (tail.length) {
      const last = tail[tail.length - 1];
      if (/^[A-Za-z]{2}$/.test(last)) {
        state = last.toUpperCase();
        city = tail.slice(0, -1).join(" ") || undefined;
      } else {
        // Cidades longas às vezes colam na UF ("RIBEIRAO GRANDESP")
        const merged = tail.join(" ");
        const m = merged.match(/^(.*?)([A-Z]{2})$/);
        if (m && m[1].trim()) { city = m[1].trim(); state = m[2]; }
        else city = merged;
      }
    }

    const [, dd, mm, yyyy] = tokens[dateIdx].match(DATE_RE)!;
    rows.push({
      orderNumber,
      date: `${yyyy}-${mm}-${dd}`,
      rawDate: tokens[dateIdx],
      clientCode,
      clientName,
      values,
      city,
      state,
    });
  }

  // Quantas colunas de dinheiro a maioria das linhas tem — define as opções de valor
  const counts = new Map<number, number>();
  rows.forEach(r => counts.set(r.values.length, (counts.get(r.values.length) || 0) + 1));
  let valueColumnCount = 0;
  let best = 0;
  counts.forEach((qty, len) => { if (qty > best) { best = qty; valueColumnCount = len; } });

  if (!rows.length && lines.length) {
    warnings.push("Nenhum pedido foi reconhecido neste relatório. Confira se o arquivo é mesmo uma relação de pedidos.");
  }

  return { rows, headerHint, valueColumnCount, warnings };
}

/** Lê o PDF do relatório e devolve os pedidos reconhecidos. */
export async function parseOrderReport(file: File): Promise<ParsedReport> {
  const { lines, warnings } = await extractLines(file);
  return parseReportLines(lines, warnings);
}

/**
 * Escolhe o valor de uma linha contando a partir da direita: 0 = última coluna
 * de dinheiro (normalmente o valor total do pedido), 1 = a anterior, e assim por diante.
 */
export function pickValue(row: ParsedReportRow, indexFromEnd: number): number {
  if (!row.values.length) return 0;
  const idx = row.values.length - 1 - indexFromEnd;
  return row.values[idx >= 0 ? idx : 0];
}

/** Tira acentos, pontuação e espaços repetidos para comparar nomes de clientes. */
export function normalizeName(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.,\-/&']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ClientLike { id: string; name: string; cnpj?: string | null; created_at?: string | null }

export type MatchStatus = "matched" | "unmatched";

/** Como o cliente foi escolhido quando havia mais de um cadastro com o mesmo nome. */
export type PickedBy = "matriz" | "first";

export interface ClientMatch {
  status: MatchStatus;
  clientId?: string;
  /** Todos os cadastros que serviam para esse nome (matriz + filiais). */
  candidates: ClientLike[];
  pickedBy?: PickedBy;
}

/**
 * Matriz é o CNPJ cujo bloco de filial (9º ao 12º dígito) é 0001 — as filiais
 * seguem em 0002, 0003 e assim por diante.
 */
export function isMatrizCnpj(cnpj?: string | null): boolean {
  const digits = (cnpj || "").replace(/\D/g, "");
  return digits.length === 14 && digits.slice(8, 12) === "0001";
}

/** O cadastro mais antigo da lista; sem data, mantém a ordem em que veio. */
function firstRegistered(list: ClientLike[]): ClientLike {
  return [...list].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
    const tb = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
    return (Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta) - (Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb);
  })[0];
}

/**
 * Desempata quando o mesmo nome tem vários cadastros (o caso de matriz e filiais).
 * Preferimos a matriz (CNPJ 0001); não havendo nenhuma, fica o cadastro mais antigo.
 */
function resolveCandidates(candidates: ClientLike[]): ClientMatch {
  if (candidates.length === 1) {
    return { status: "matched", clientId: candidates[0].id, candidates };
  }
  const matrizes = candidates.filter(c => isMatrizCnpj(c.cnpj));
  if (matrizes.length) {
    return { status: "matched", clientId: firstRegistered(matrizes).id, candidates, pickedBy: "matriz" };
  }
  return { status: "matched", clientId: firstRegistered(candidates).id, candidates, pickedBy: "first" };
}

/**
 * Casa o nome vindo do relatório com a carteira do usuário.
 *
 * O nome do relatório costuma vir cortado (ex.: "GRANTEL COMERCIO DE MATER"),
 * por isso além da igualdade exata aceitamos que o nome cadastrado comece com
 * o nome do relatório. Quando o mesmo nome tem vários cadastros (matriz e
 * filiais), já deixamos um escolhido — a matriz na frente — e sinalizamos na
 * tela de conferência para o usuário poder trocar se quiser.
 */
export function matchClient(reportName: string, clients: ClientLike[]): ClientMatch {
  const target = normalizeName(reportName);
  if (!target) return { status: "unmatched", candidates: [] };

  const exact = clients.filter(c => normalizeName(c.name) === target);
  if (exact.length) return resolveCandidates(exact);

  const prefix = clients.filter(c => {
    const n = normalizeName(c.name);
    return n.startsWith(target) || target.startsWith(n);
  });
  if (prefix.length) return resolveCandidates(prefix);

  return { status: "unmatched", candidates: [] };
}

/**
 * Monta a data do pedido ao meio-dia local. Guardar à meia-noite faria o
 * fuso do Brasil (UTC-3) exibir o dia anterior na tela.
 */
export function orderDateToTimestamp(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
