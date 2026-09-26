// supabase/functions/_shared/orderExtractionCore.ts
//
// Cópia Deno de src/lib/orderExtractionCore.ts — o arquivo original não tem
// NENHUM import (é puro TS sem DOM/Node), então dá pra manter os dois em
// sincronia copiando o conteúdo. Usado pela Edge Function
// handle-inbound-order-email pra ler pedido chegado por e-mail exatamente
// do mesmo jeito que o app e o link do colaborador (api/order-intake.ts)
// já leem — mesmo prompt, mesma extração local por regex.
//
// IMPORTANTE: qualquer ajuste na leitura de pedido (prompt, regex de CNPJ/
// valor/categoria) feito em src/lib/orderExtractionCore.ts deve ser
// replicado aqui também.

/** Um produto do pedido — venha de uma tabela ou descrito no corpo do texto
 *  ("2 kit porta onix branco"). Só o que a IA consegue ler: a extração
 *  local (regex) não tenta achar itens, só o cabeçalho do documento
 *  (CNPJ/valor/representada). */
export interface ItemExtraido {
  /** Nome do produto exatamente como está escrito no documento. */
  description: string;
  code?: string;
  quantity: number;
  unitValue?: number;
  totalValue?: number;
}

export interface OrderExtractionResult {
  client: string;
  cnpj: string;
  category: string;
  value: number;
  address?: string;
  paymentTerms?: string;
  /** Número do pedido de venda impresso no documento (ex.: "PEDIDO Nº 12345"). */
  orderNumber?: string;
  status: "ready" | "error";
  error?: string;
  method?: "local" | "ai";
  confidence?: { client?: string; category?: string; value?: string };
  items: ItemExtraido[];
}

/** Tira acentos e pontuação pra comparar texto sem depender de como o
 *  documento foi digitado/digitalizado. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s/.,-]/g, " ")
    .replace(/\s+/g, " ");
}

export const ORDER_EXTRACTION_SYSTEM_INSTRUCTION = `Você lê pedidos de venda e notas fiscais brasileiras (impressas, digitalizadas ou escritas à mão) e extrai os dados para lançamento.

Devolva SOMENTE um objeto JSON com este formato exato:
{ "client": string, "cnpj": string, "category": string, "value": number, "address": string, "paymentTerms": string, "orderNumber": string, "confidence": { "client": "alta"|"media"|"baixa", "category": "alta"|"media"|"baixa", "value": "alta"|"media"|"baixa" }, "items": [{ "description": string, "code": string, "quantity": number, "unitValue": number, "totalValue": number }] }

=== A DISTINÇÃO MAIS IMPORTANTE ===
Todo pedido tem DUAS empresas. Não as confunda:
- EMITENTE / FORNECEDOR / REMETENTE / VENDEDOR = quem VENDE. É a REPRESENTADA. Vai no campo "category".
- DESTINATÁRIO / CLIENTE / COMPRADOR / SACADO / "FATURAR PARA" / "ENTREGAR EM" = quem COMPRA. Vai em "client", "cnpj" e "address".
Em nota fiscal o emitente costuma vir no TOPO (com logo e inscrição estadual) e o destinatário LOGO ABAIXO, num quadro próprio. Na dúvida sobre qual é qual, prefira deixar "client" vazio a chutar o emitente — um cliente errado corrompe o faturamento.

=== client (quem compra) ===
- Nome da empresa compradora, sem o CNPJ junto.
- Se a lista CLIENTES JÁ CADASTRADOS for fornecida e o comprador for claramente um deles, copie o nome EXATAMENTE como está na lista (mesma grafia, acentos e pontuação). Isso é o que permite lançar o pedido automaticamente no cadastro certo.
- Só use um nome da lista se tiver certeza de que é a mesma empresa (CNPJ igual, ou nome praticamente igual). Semelhança vaga não basta — nesse caso escreva o nome como aparece no documento.
- Se não identificar o comprador, devolva "".

=== cnpj (do comprador) ===
- Só dígitos, 14 posições. É o CNPJ do DESTINATÁRIO, nunca o do emitente.
- Se houver só um CNPJ no documento e não der pra saber de quem é, devolva "".

=== value (valor total do pedido) ===
- É o valor final que o cliente vai pagar por este pedido.
- Prefira, nesta ordem: "Total da nota" / "Valor total da nota" > "Total geral" / "Total do pedido" / "Valor a pagar" > "Total dos produtos" > soma dos itens.
- NUNCA use: base de cálculo (ICMS/ST), valor do ICMS/IPI/ST, valor do frete isolado, valor do desconto isolado, valor aproximado dos tributos, total de itens/volumes (isso é contagem, não dinheiro), peso.
- NÃO devolva simplesmente o maior número da página: em nota fiscal a base de cálculo costuma ser maior que o total.
- Se houver desconto, o valor é o líquido (depois do desconto).
- Formato brasileiro: "1.234,56" é mil duzentos e trinta e quatro reais e cinquenta e seis centavos. Devolva 1234.56 (ponto decimal, sem separador de milhar, sem "R$").
- Pedido escrito à mão: some os itens se não houver um total escrito. Se não conseguir chegar a um número confiável, devolva 0 em vez de inventar.

=== category (a representada / fornecedor) ===
- REGRA ABSOLUTA: só pode ser um valor EXATO da lista CATEGORIAS CONHECIDAS, copiado letra por letra. Nunca invente nem devolva um nome que não esteja na lista.
- Case a razão social do EMITENTE com a lista, ignorando sufixos societários e palavras genéricas ("Indústria Cozimax Ltda" → "Cozimax"; "AGROMAX INSUMOS AGRICOLAS S/A" → "AgroMax").
- Cuidado: a marca do fornecedor pode aparecer também no nome de produtos ou no rodapé. O que vale é quem EMITIU o documento.
- Se nenhuma categoria da lista corresponder ao emitente, devolva "".

=== confidence ===
Diga honestamente o quanto tem certeza de cada campo. Use "baixa" quando estiver chutando — é melhor o usuário conferir do que gravar errado.

=== orderNumber (número do pedido) ===
- É o número do PEDIDO DE VENDA / ordem de compra, normalmente impresso nas primeiras linhas do documento, perto de rótulos como "Pedido", "Pedido nº", "Nº do pedido", "Pedido de venda", "Ordem de compra", "OC", "Nº pedido".
- Devolva só o identificador (dígitos, letras, hífen ou barra), sem o rótulo. Ex.: "PEDIDO Nº 348291" → "348291".
- NÃO confunda com: CNPJ, inscrição estadual, código do cliente/loja, número da nota fiscal, série, telefone, CEP, data, número de página, código de produto.
- Se houver mais de um número que pareça de pedido (ex.: pedido da fábrica e pedido do cliente), prefira o do pedido de venda impresso mais ao topo.
- Se não achar com segurança, devolva "". Nunca invente.

=== address ===
Endereço de entrega/faturamento do COMPRADOR. Se não houver, "".

=== paymentTerms (condição de pagamento) ===
Procure por "condição de pagamento", "forma de pagamento", "parcelas", "boleto", "duplicata" etc. — é sobre quando a FATURA vence, não sobre quando o produto chega ("prazo de entrega" é outra coisa, não é este campo).
- Cada fábrica/fornecedor usa um padrão diferente — não existe um formato fixo. Pode ser 1 prazo só ("60 dias", "90 dias líquido") ou vários parcelados ("30/60/90 dias", "30/60", "7/14/21", "28/35/42"). Leia o que o documento realmente diz, não assuma que é sempre 3 parcelas.
- Devolva só os números de dias separados por "/", na ordem em que aparecem — 1 número se for prazo único (ex.: "60"), ou vários se for parcelado (ex.: "30/60/90", "7/14/21").
- Quando for à vista, no ato, ou não houver menção nenhuma a prazo/parcelamento, devolva "".
- Nunca invente um prazo que não está escrito.

=== items (os produtos do pedido) ===
Todo produto que o pedido menciona, mesmo sem tabela nenhuma — é o que permite ver depois quantas unidades de cada produto foram vendidas. A MAIORIA dos pedidos reais não tem coluna/tabela: o produto está descrito no CORPO/TEXTO do pedido, junto com a quantidade, do jeito que a pessoa escreveu (impresso, digitado ou à mão). Leia essas descrições como leria uma lista de compras:
  "2 kit porta onix branco, 3 gabinete aço jupiter 1171mm pr" → dois produtos: quantidade 2 e quantidade 3.
  Uma lista com um produto por linha (com ou sem marcador "-"/"•") → um item por linha.
  Um parágrafo corrido citando os produtos em sequência → separe cada produto citado.
Só quando não há tabela NEM lista, aplique as mesmas regras:
- "description": nome/descrição do produto EXATAMENTE como está escrito (não resuma, não traduza, não corrija abreviação).
- "code": código/referência do produto, se aparecer (coluna própria ou junto do nome). Senão "".
- "quantity": quantidade deste item, como número (aceita casas decimais, ex: 2.5 metros). Sem quantidade legível — nem no texto corrido, nem numa tabela — não inclua o item; não invente "1".
- "unitValue" e "totalValue": mesmo formato de "value" (ponto decimal, sem separador de milhar, sem "R$"). Se só um dos dois estiver escrito, calcule o outro (totalValue = unitValue × quantity) — mas só quando a conta bater com o resto do documento; senão devolva só o que está escrito e omita o outro. Pedido sem valor por item (só o total geral) — devolva quantity mesmo sem unitValue/totalValue.
- Documento onde REALMENTE não dá pra identificar produto nenhum (ex: só um total resumido, sem nada que se pareça com item) → devolva "items": [].
- NUNCA invente um item que não está no documento. Melhor "items": [] do que um item chutado.`;

/* ─────────────────── CNPJ ─────────────────── */

const MARCADORES_COMPRADOR = [
  "destinatario", "destinatario/remetente", "cliente", "comprador", "sacado",
  "faturar para", "entregar em", "entrega em", "endereco de entrega", "tomador",
];
const MARCADORES_VENDEDOR = [
  "emitente", "emissor", "fornecedor", "remetente", "vendedor", "representada",
  "razao social do emitente", "dados do emitente",
];

export function extractCNPJLocally(text: string): string {
  if (!text) return "";
  const cnpjRegex = /\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/g;

  const achados: { digitos: string; papel: "comprador" | "vendedor" | "indefinido" }[] = [];
  let m: RegExpExecArray | null;
  while ((m = cnpjRegex.exec(text)) !== null) {
    const antes = normalizar(text.substring(Math.max(0, m.index - 160), m.index))
      .replace(/destinatario\s*\/\s*remetente/g, "destinatario");
    const posComprador = Math.max(...MARCADORES_COMPRADOR.map((k) => antes.lastIndexOf(k)));
    const posVendedor = Math.max(...MARCADORES_VENDEDOR.map((k) => antes.lastIndexOf(k)));

    let papel: "comprador" | "vendedor" | "indefinido" = "indefinido";
    if (posComprador >= 0 || posVendedor >= 0) {
      papel = posComprador > posVendedor ? "comprador" : "vendedor";
    }
    achados.push({ digitos: m[0].replace(/\D/g, ""), papel });
  }

  if (achados.length === 0) return "";

  const doComprador = achados.find((a) => a.papel === "comprador");
  if (doComprador) return doComprador.digitos;

  const semRotulo = achados.filter((a) => a.papel === "indefinido");
  if (semRotulo.length > 0) return semRotulo[0].digitos;

  return "";
}

/* ─────────────────── CATEGORIA (representada) ─────────────────── */

export interface CategoriaDetectada {
  category: string;
  score: number;
}

const TAMANHO_CABECALHO = 700;

export function extractCategoryLocallyDetailed(text: string, categories: string[]): CategoriaDetectada {
  if (!categories || categories.length === 0 || !text) return { category: "", score: 0 };

  const textoTodo = normalizar(text);
  const cabecalho = normalizar(text.substring(0, TAMANHO_CABECALHO));

  const notas = categories.map((cat) => {
    const limpa = normalizar(cat).trim();
    if (!limpa) return { category: cat, score: 0 };

    let score = 0;
    if (textoTodo.includes(limpa)) score += 100;
    if (cabecalho.includes(limpa)) score += 60;

    limpa.split(/\s+/).forEach((palavra) => {
      if (palavra.length > 3 && textoTodo.includes(palavra)) score += 15;
      if (palavra.length > 3 && cabecalho.includes(palavra)) score += 10;
    });

    return { category: cat, score };
  });

  notas.sort((a, b) => b.score - a.score);
  return notas[0] && notas[0].score > 0 ? notas[0] : { category: "", score: 0 };
}

export function extractCategoryLocally(text: string, categories: string[]): string {
  return extractCategoryLocallyDetailed(text, categories).category;
}

/* ─────────────────── VALOR ─────────────────── */

export function parseMoedaBR(bruto: string): number {
  const valor = bruto.trim();
  const temPonto = valor.includes(".");
  const temVirgula = valor.includes(",");

  if (temPonto && temVirgula) {
    return valor.lastIndexOf(",") > valor.lastIndexOf(".")
      ? parseFloat(valor.replace(/\./g, "").replace(",", "."))
      : parseFloat(valor.replace(/,/g, ""));
  }
  if (temVirgula) return parseFloat(valor.replace(/\./g, "").replace(",", "."));
  if (temPonto) {
    return /^\d{1,3}(\.\d{3})+$/.test(valor)
      ? parseFloat(valor.replace(/\./g, ""))
      : parseFloat(valor);
  }
  return parseFloat(valor);
}

const NUMERO = String.raw`\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d{1,3}(?:\.\d{3})+(?!\d)|\d+[.,]\d{2}(?!\d)|\d+(?!\d)`;

const ROTULOS: { termos: string[]; rank: number }[] = [
  {
    rank: 1,
    termos: [
      "total da nota", "valor total da nota", "total da nf", "valor total da nf",
      "total geral", "total do pedido", "valor do pedido", "total liquido",
      "valor liquido", "valor a pagar", "total a pagar", "total final",
    ],
  },
  { rank: 2, termos: ["total dos produtos", "valor dos produtos", "valor total", "vlr total"] },
  { rank: 3, termos: ["total"] },
];

const NAO_E_TOTAL_ANTES = [
  "base de calculo", "base calculo", "peso", "quantidade", "qtd",
];

const NAO_E_TOTAL_DEPOIS = [
  "do icms", "de icms", "icms", "do ipi", "de ipi", "ipi",
  "do frete", "de frete", "frete", "do seguro", "de seguro",
  "do desconto", "de desconto", "de itens", "de volumes",
  "de impostos", "dos impostos", "aproximado", "tributos",
];

export function extractValueLocally(text: string): number {
  if (!text) return 0;
  const texto = normalizar(text);

  let melhor: { rank: number; posicao: number; valor: number } | null = null;

  for (const { termos, rank } of ROTULOS) {
    for (const termo of termos) {
      let de = 0;
      for (;;) {
        const i = texto.indexOf(termo, de);
        if (i < 0) break;
        de = i + termo.length;

        const anterior = i > 0 ? texto[i - 1] : " ";
        if (/[a-z0-9]/.test(anterior)) continue;

        const antes = texto.substring(Math.max(0, i - 22), i);
        const depois = texto.substring(i + termo.length, i + termo.length + 16);
        if (NAO_E_TOTAL_ANTES.some((ruim) => antes.includes(ruim))) continue;
        if (NAO_E_TOTAL_DEPOIS.some((ruim) => depois.includes(ruim))) continue;

        const trecho = texto.substring(de, de + 70);
        const num = trecho.match(new RegExp(`^[^0-9]{0,20}(${NUMERO})`));
        if (!num) continue;

        const valor = parseMoedaBR(num[1]);
        if (!isFinite(valor) || valor <= 0) continue;

        if (!melhor || rank < melhor.rank || (rank === melhor.rank && i > melhor.posicao)) {
          melhor = { rank, posicao: i, valor };
        }
      }
    }
  }

  if (melhor) return melhor.valor;

  let maior = 0;
  const todos = new RegExp(`(?:r\\$\\s*)?(${NUMERO})`, "g");
  let m: RegExpExecArray | null;
  while ((m = todos.exec(texto)) !== null) {
    const v = parseMoedaBR(m[1]);
    if (isFinite(v) && v > maior) maior = v;
  }
  return maior;
}

/* ─────────────────── PROMPT ─────────────────── */

export function buildOrderExtractionPrompt(
  extractedText: string,
  localCnpj: string,
  localValue: number,
  categories: string[],
  knownClients: string[] = []
): string {
  const LIMITE_CLIENTES = 400;
  const listaClientes = knownClients.filter(Boolean).slice(0, LIMITE_CLIENTES);

  return `Analise este documento e devolva o JSON pedido.

DICAS DA LEITURA LOCAL (regex, podem estar erradas — confira no documento):
- CNPJ do comprador, provável: ${localCnpj || "não detectado"}
- Valor total, provável: ${localValue || "não detectado"}

CATEGORIAS CONHECIDAS (o campo "category" só pode ser um destes, copiado exatamente):
${categories.length ? categories.join(" | ") : "(nenhuma cadastrada — devolva category vazia)"}

CLIENTES JÁ CADASTRADOS (se o comprador for um destes, copie o nome exatamente assim):
${listaClientes.length ? listaClientes.join(" | ") : "(nenhum cadastrado)"}${
    knownClients.length > LIMITE_CLIENTES ? `\n(+${knownClients.length - LIMITE_CLIENTES} outros não listados)` : ""
  }

CONTEÚDO DO DOCUMENTO:
${extractedText.substring(0, 10000)}
`;
}

/* ─────────────────── JUNTAR IA + LOCAL ─────────────────── */

const SCORE_CATEGORIA_FORTE = 100;

export function reconcileExtractionResult(
  rawGeminiText: string,
  localCnpj: string,
  localValue: number,
  localCategory: string,
  categories: string[],
  localCategoryScore = SCORE_CATEGORIA_FORTE
): OrderExtractionResult {
  let textResult = rawGeminiText;
  if (textResult.includes("```")) {
    textResult = textResult.replace(/```(?:json)?\n?([\s\S]*?)```/g, "$1").trim();
  }

  let data: any;
  try {
    data = JSON.parse(textResult);
  } catch {
    return {
      client: "Desconhecido",
      cnpj: localCnpj || "",
      category: localCategoryScore >= SCORE_CATEGORIA_FORTE ? localCategory : "",
      value: localValue,
      address: "",
      paymentTerms: "",
      status: "ready",
      method: "local",
      items: [],
    };
  }

  const daIa = typeof data.category === "string" ? data.category.trim() : "";

  let finalCategory = "";
  const casarComLista = (nome: string): string => {
    if (!nome || categories.length === 0) return "";
    const exata = categories.find((c) => c.toLowerCase() === nome.toLowerCase());
    if (exata) return exata;
    const parcial = categories.find(
      (c) => nome.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(nome.toLowerCase())
    );
    return parcial || "";
  };

  if (localCategory && localCategoryScore >= SCORE_CATEGORIA_FORTE) {
    finalCategory = localCategory;
  } else {
    finalCategory = casarComLista(daIa) || (localCategory ? casarComLista(localCategory) : "");
  }

  const paymentTermsBruto = typeof data.paymentTerms === "string" ? data.paymentTerms.trim() : "";
  const paymentTerms = /^[0-9]+(\/[0-9]+)*$/.test(paymentTermsBruto) ? paymentTermsBruto : "";

  const orderNumberBruto = typeof data.orderNumber === "string" || typeof data.orderNumber === "number" ? String(data.orderNumber).trim() : "";
  const orderNumber = /[A-Za-z0-9]/.test(orderNumberBruto) && orderNumberBruto.length <= 40 ? orderNumberBruto : "";

  const valorIa = typeof data.value === "number" ? data.value : parseFloat(data.value);
  const confidence = data.confidence && typeof data.confidence === "object" ? data.confidence : undefined;

  const iaValida = isFinite(valorIa) && valorIa > 0;
  const iaDesconfiaDoValor = confidence?.value === "baixa";
  const finalValue = iaValida && !(iaDesconfiaDoValor && localValue > 0) ? valorIa : localValue;

  return {
    client: data.client || "Desconhecido",
    cnpj: (data.cnpj || localCnpj || "").replace(/\D/g, ""),
    category: finalCategory,
    value: finalValue,
    address: data.address || "",
    paymentTerms,
    orderNumber,
    status: "ready",
    method: "ai",
    confidence,
    items: parseItensDaIa(data.items),
  };
}

function parseItensDaIa(bruto: unknown): ItemExtraido[] {
  if (!Array.isArray(bruto)) return [];

  return bruto
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
    .map((it) => {
      const description = typeof it.description === "string" ? it.description.trim() : "";
      const quantidade = typeof it.quantity === "number" ? it.quantity : parseFloat(String(it.quantity));
      const unitValue = typeof it.unitValue === "number" ? it.unitValue : parseFloat(String(it.unitValue));
      const totalValue = typeof it.totalValue === "number" ? it.totalValue : parseFloat(String(it.totalValue));
      const item: ItemExtraido = {
        description,
        code: typeof it.code === "string" && it.code.trim() ? it.code.trim() : undefined,
        quantity: isFinite(quantidade) && quantidade > 0 ? quantidade : 0,
        unitValue: isFinite(unitValue) && unitValue > 0 ? unitValue : undefined,
        totalValue: isFinite(totalValue) && totalValue > 0 ? totalValue : undefined,
      };
      return item;
    })
    .filter((it) => it.description && it.quantity > 0);
}
