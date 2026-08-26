// src/lib/orderExtractionCore.ts
//
// Núcleo puro (sem DOM, sem nada específico de navegador) da leitura de
// pedido: o prompt que manda pra IA e as extrações locais por regex/palavra-
// chave. Extraído de orderProcessor.ts pra poder ser importado tanto pelo
// app (Vite/browser) quanto pelo endpoint serverless de enviar pedido por
// link (api/order-intake.ts, roda em Node na Vercel) — assim as duas
// entradas de pedido (pelo painel e pelo link do colaborador) sempre leem o
// documento exatamente do mesmo jeito, sem duas versões do prompt que podem
// desalinhar com o tempo.

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
  /** Condição de pagamento em dias a partir da data do pedido/faturamento,
   *  ex.: "30/60/90" — vira parcelas automaticamente (ver Order.payment_terms).
   *  "" quando o documento não menciona ou é à vista. */
  paymentTerms?: string;
  /** Prazo de entrega em dias corridos a partir do pedido, quando o próprio
   *  documento menciona ("prazo de entrega: 10 dias" etc.) — usado pra
   *  pré-preencher Order.delivery_date. Sem menção no documento, undefined
   *  (aí quem decide é o prazo padrão configurado pra empresa, se houver). */
  deliveryLeadDays?: number;
  status: "ready" | "error";
  error?: string;
  method?: "local" | "ai";
  /** A própria IA avaliando quanto confia em cada campo — pedido no prompt,
   *  mas até agora nunca lido de volta. Usado pra decidir quando confiar no
   *  valor da IA (ver `reconcileExtractionResult`) e pra avisar o usuário
   *  quando o campo merece conferência, em vez de cadastrar calado. */
  confidence?: { client?: string; category?: string; value?: string };
  /** Produtos do pedido, pra área de Produtos (unidades vendidas por
   *  representada). Sempre [] no modo local — só a IA lê os produtos,
   *  estejam em tabela ou descritos no corpo do texto. */
  items: ItemExtraido[];
}

/** "Prazo de entrega: 10 dias" lido do documento → data de entrega (ISO,
 *  yyyy-mm-dd), contando a partir de agora. Usado nos pontos que gravam o
 *  pedido (Pedidos.tsx, Empresas.tsx, api/order-intake.ts) quando
 *  `OrderExtractionResult.deliveryLeadDays` veio preenchido — o valor lido
 *  do PRÓPRIO documento sempre tem prioridade sobre o prazo padrão da
 *  empresa (esse último é aplicado por um trigger no banco só quando o
 *  pedido chega com delivery_date vazia). */
export function deliveryLeadDaysToISODate(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
}

/** Tira acentos e pontuação pra comparar texto sem depender de como o
 *  documento foi digitado/digitalizado. Também é a chave usada pra agrupar
 *  produtos na área de Produtos (orderItems.ts): duas grafias do mesmo nome
 *  ("Kit Porta 80cm" / "KIT PORTA 80 CM") caem na mesma chave. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s/.,-]/g, " ")
    .replace(/\s+/g, " ");
}

export const ORDER_EXTRACTION_SYSTEM_INSTRUCTION = `Você lê pedidos de venda e notas fiscais brasileiras (impressas, digitalizadas ou escritas à mão) e extrai os dados para lançamento.

Devolva SOMENTE um objeto JSON com este formato exato:
{ "client": string, "cnpj": string, "category": string, "value": number, "address": string, "paymentTerms": string, "deliveryLeadDays": number, "confidence": { "client": "alta"|"media"|"baixa", "category": "alta"|"media"|"baixa", "value": "alta"|"media"|"baixa" }, "items": [{ "description": string, "code": string, "quantity": number, "unitValue": number, "totalValue": number }] }

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

=== address ===
Endereço de entrega/faturamento do COMPRADOR. Se não houver, "".

=== paymentTerms (condição de pagamento) ===
Procure por "condição de pagamento", "forma de pagamento", "parcelas", "boleto", "duplicata" etc.
- Quando for parcelado em dias corridos (o formato mais comum: "30/60/90 dias", "30/60", "a combinar 45 dias"), devolva só os números separados por "/", na ordem, ex.: "30/60/90" ou "45".
- Quando for à vista, no ato, ou não houver menção nenhuma a prazo/parcelamento, devolva "".
- Nunca invente um prazo que não está escrito.

=== deliveryLeadDays (prazo de entrega) ===
Procure por "prazo de entrega", "entrega em X dias", "prazo de produção/expedição" etc.
- Quando o documento disser um número de dias até a entrega, devolva esse número (ex.: "prazo de entrega: 10 dias" → 10).
- Quando não houver menção nenhuma a prazo de entrega, omita o campo (não devolva 0).
- Isso é DIFERENTE de paymentTerms: um é quando o produto chega, o outro é quando a fatura vence.

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

/** Marcadores que dizem de quem é o CNPJ que vem logo depois. */
const MARCADORES_COMPRADOR = [
  "destinatario", "destinatario/remetente", "cliente", "comprador", "sacado",
  "faturar para", "entregar em", "entrega em", "endereco de entrega", "tomador",
];
const MARCADORES_VENDEDOR = [
  "emitente", "emissor", "fornecedor", "remetente", "vendedor", "representada",
  "razao social do emitente", "dados do emitente",
];

/**
 * CNPJ do COMPRADOR (destinatário).
 *
 * A versão anterior, quando não achava palavra-chave por perto, devolvia
 * `matches[0]` — o primeiro CNPJ do documento. Em nota fiscal o primeiro é
 * quase sempre o do EMITENTE (o fornecedor vem no topo), então o campo mais
 * confiável pra casar o cliente no cadastro vinha sistematicamente errado, e
 * ainda era mandado pra IA como "CNPJ detectado", puxando a resposta dela
 * junto pro erro. Agora, quando os CNPJs encontrados são todos claramente do
 * emitente, devolve "" — um palpite errado aqui é pior que nenhum palpite.
 */
export function extractCNPJLocally(text: string): string {
  if (!text) return "";
  const cnpjRegex = /\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/g;

  const achados: { digitos: string; papel: "comprador" | "vendedor" | "indefinido" }[] = [];
  let m: RegExpExecArray | null;
  while ((m = cnpjRegex.exec(text)) !== null) {
    // Só o trecho ANTES do CNPJ importa: o rótulo vem antes do número.
    // "DESTINATARIO / REMETENTE" é o nome do quadro do COMPRADOR na DANFE.
    // Sem colapsar isso, o "remetente" (marcador de vendedor) vinha depois de
    // "destinatario" na janela e o CNPJ do cliente era lido como do emitente.
    const antes = normalizar(text.substring(Math.max(0, m.index - 160), m.index))
      .replace(/destinatario\s*\/\s*remetente/g, "destinatario");
    const posComprador = Math.max(...MARCADORES_COMPRADOR.map((k) => antes.lastIndexOf(k)));
    const posVendedor = Math.max(...MARCADORES_VENDEDOR.map((k) => antes.lastIndexOf(k)));

    let papel: "comprador" | "vendedor" | "indefinido" = "indefinido";
    // Vence o marcador MAIS PRÓXIMO do número, não o primeiro que aparecer:
    // num quadro de destinatário logo abaixo do emitente, os dois rótulos
    // caem na janela, e o que vale é o de baixo.
    if (posComprador >= 0 || posVendedor >= 0) {
      papel = posComprador > posVendedor ? "comprador" : "vendedor";
    }
    achados.push({ digitos: m[0].replace(/\D/g, ""), papel });
  }

  if (achados.length === 0) return "";

  const doComprador = achados.find((a) => a.papel === "comprador");
  if (doComprador) return doComprador.digitos;

  const semRotulo = achados.filter((a) => a.papel === "indefinido");
  // Documento simples com um CNPJ só (muito comum em pedido de balcão): é do
  // cliente, porque o representante não precisa registrar o próprio fornecedor.
  if (semRotulo.length > 0) return semRotulo[0].digitos;

  return "";
}

/* ─────────────────── CATEGORIA (representada) ─────────────────── */

export interface CategoriaDetectada {
  category: string;
  /** >= 100 significa que o nome inteiro da categoria apareceu no documento. */
  score: number;
}

/** Quanto do começo do texto conta como "cabeçalho" (onde fica o emitente). */
const TAMANHO_CABECALHO = 700;

/**
 * Acha a representada no texto, com a pontuação da evidência.
 *
 * A pontuação existe pra quem chama poder decidir se confia: um acerto de
 * palavra solta ("Distribuidora") é fraquíssimo perto do nome inteiro da
 * categoria aparecendo no cabeçalho.
 */
export function extractCategoryLocallyDetailed(text: string, categories: string[]): CategoriaDetectada {
  if (!categories || categories.length === 0 || !text) return { category: "", score: 0 };

  const textoTodo = normalizar(text);
  const cabecalho = normalizar(text.substring(0, TAMANHO_CABECALHO));

  const notas = categories.map((cat) => {
    const limpa = normalizar(cat).trim();
    if (!limpa) return { category: cat, score: 0 };

    let score = 0;
    if (textoTodo.includes(limpa)) score += 100;
    // O emitente fica no topo do documento. O mesmo nome achado no cabeçalho
    // vale mais que achado no meio da lista de produtos ou no rodapé.
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

/**
 * Converte um número escrito em texto para float, resolvendo a ambiguidade do
 * separador. "15.400" é quinze mil e quatrocentos (milhar), "199.90" é cento e
 * noventa e nove e noventa (decimal) — a diferença está em quantos dígitos vêm
 * depois do último separador. A versão anterior lia "15.400" como 15,4.
 */
export function parseMoedaBR(bruto: string): number {
  const valor = bruto.trim();
  const temPonto = valor.includes(".");
  const temVirgula = valor.includes(",");

  if (temPonto && temVirgula) {
    // O separador decimal é o que aparece por último.
    return valor.lastIndexOf(",") > valor.lastIndexOf(".")
      ? parseFloat(valor.replace(/\./g, "").replace(",", "."))
      : parseFloat(valor.replace(/,/g, ""));
  }
  if (temVirgula) return parseFloat(valor.replace(/\./g, "").replace(",", "."));
  if (temPonto) {
    // Só pontos: são separadores de milhar se TODOS os grupos depois do
    // primeiro ponto tiverem exatamente 3 dígitos ("1.234", "1.234.567").
    return /^\d{1,3}(\.\d{3})+$/.test(valor)
      ? parseFloat(valor.replace(/\./g, ""))
      : parseFloat(valor);
  }
  return parseFloat(valor);
}

/** Um número monetário: com milhar e centavos, só centavos, só milhar, ou inteiro. */
const NUMERO = String.raw`\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d{1,3}(?:\.\d{3})+(?!\d)|\d+[.,]\d{2}(?!\d)|\d+(?!\d)`;

/** Rótulos de total, do mais confiável (1) pro menos (3). */
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

/** Qualificadores que vêm ANTES do rótulo e mostram que ali não é o total
 *  do pedido ("Base de cálculo do ICMS", "Peso total"). */
const NAO_E_TOTAL_ANTES = [
  "base de calculo", "base calculo", "peso", "quantidade", "qtd",
];

/** Qualificadores que vêm DEPOIS do rótulo ("Valor total DO ICMS", "Total DE
 *  ITENS"). Note que "liquido" não entra: "total líquido" é total de verdade. */
const NAO_E_TOTAL_DEPOIS = [
  "do icms", "de icms", "icms", "do ipi", "de ipi", "ipi",
  "do frete", "de frete", "frete", "do seguro", "de seguro",
  "do desconto", "de desconto", "de itens", "de volumes",
  "de impostos", "dos impostos", "aproximado", "tributos",
];

/**
 * Valor total do pedido, sem IA.
 *
 * Mudou de "pega o maior número da folha" para "pega o número do rótulo mais
 * confiável": em nota fiscal a base de cálculo do ICMS-ST costuma ser MAIOR
 * que o total a pagar, então o maior número era justamente o errado. O maior
 * número continua existindo, mas só como último recurso, quando não há
 * nenhum rótulo de total no documento.
 */
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

        // "subtotal" contém "total": exige que o rótulo comece palavra.
        const anterior = i > 0 ? texto[i - 1] : " ";
        if (/[a-z0-9]/.test(anterior)) continue;

        // Rótulo que não é dinheiro do pedido. As duas janelas são curtas e
        // separadas de propósito: uma janela larga olhando pra frente fazia
        // um "Subtotal" lá atrás derrubar o "Total geral" seguinte.
        const antes = texto.substring(Math.max(0, i - 22), i);
        const depois = texto.substring(i + termo.length, i + termo.length + 16);
        if (NAO_E_TOTAL_ANTES.some((ruim) => antes.includes(ruim))) continue;
        if (NAO_E_TOTAL_DEPOIS.some((ruim) => depois.includes(ruim))) continue;

        // O número vem logo depois do rótulo (pulando ":", "R$", pontilhado).
        const trecho = texto.substring(de, de + 70);
        const num = trecho.match(new RegExp(`^[^0-9]{0,20}(${NUMERO})`));
        if (!num) continue;

        const valor = parseMoedaBR(num[1]);
        if (!isFinite(valor) || valor <= 0) continue;

        // Melhor rótulo vence; empatou, vence o que aparece por último (o
        // total final costuma estar no fim do documento).
        if (!melhor || rank < melhor.rank || (rank === melhor.rank && i > melhor.posicao)) {
          melhor = { rank, posicao: i, valor };
        }
      }
    }
  }

  if (melhor) return melhor.valor;

  // Sem nenhum rótulo de total: aí sim o maior valor da folha é o melhor
  // palpite disponível.
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

/** Monta o prompt de usuário mandado pra IA, com as dicas locais já extraídas
 *  (CNPJ/valor por regex), as categorias conhecidas e os clientes já
 *  cadastrados do dono da conta. */
export function buildOrderExtractionPrompt(
  extractedText: string,
  localCnpj: string,
  localValue: number,
  categories: string[],
  knownClients: string[] = []
): string {
  // A lista de clientes é o que permite a IA devolver o nome na grafia exata
  // do cadastro — e é isso que faz o pedido cair automaticamente no cliente
  // certo, em vez de virar "cliente novo" pro usuário conferir na mão.
  // Limitada pra não estourar o contexto em carteiras grandes.
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

/** Nota mínima pra confiar mais na heurística local que na IA: o nome inteiro
 *  da categoria apareceu no documento. Abaixo disso é palpite de palavra
 *  solta e a IA, que lê o documento inteiro com contexto, decide melhor. */
const SCORE_CATEGORIA_FORTE = 100;

/** Junta a resposta bruta da IA com as dicas locais — mesma regra de
 *  prioridade nos dois lugares que chamam isso (app e link do colaborador). */
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
      // Modo local não sabe achar produto (tabela ou texto corrido) — só a
      // IA lê. Sem resposta da IA (JSON inválido/vazio), não tem produto
      // pra área de Produtos.
      items: [],
    };
  }

  const daIa = typeof data.category === "string" ? data.category.trim() : "";

  // Regra de categoria. Antes, a heurística local SEMPRE ganhava da IA —
  // inclusive quando tinha achado só uma palavra solta ("Distribuidora"
  // batendo numa categoria "Distribuidora Aurora"). Agora o local só ganha
  // quando a evidência é forte; caso contrário vale a IA, que enxerga quem
  // emitiu o documento.
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

  // Só dígitos e "/" sobrevivem — a mesma validação leve que o trigger do
  // banco faz (ver migração add_order_delivery_and_installments), pra não
  // gravar algo que a IA escreveu por extenso ("30 e 60 dias") sem terminar
  // virando parcela nenhuma.
  const paymentTermsBruto = typeof data.paymentTerms === "string" ? data.paymentTerms.trim() : "";
  const paymentTerms = /^[0-9]+(\/[0-9]+)*$/.test(paymentTermsBruto) ? paymentTermsBruto : "";

  const deliveryLeadDaysBruto = typeof data.deliveryLeadDays === "number" ? data.deliveryLeadDays : parseInt(data.deliveryLeadDays, 10);
  const deliveryLeadDays = isFinite(deliveryLeadDaysBruto) && deliveryLeadDaysBruto > 0 ? deliveryLeadDaysBruto : undefined;

  const valorIa = typeof data.value === "number" ? data.value : parseFloat(data.value);
  const confidence = data.confidence && typeof data.confidence === "object" ? data.confidence : undefined;

  // O prompt pede esse veredito da própria IA desde a primeira versão, mas
  // ninguém nunca olhava de volta. Quando ela mesma marca "baixa" confiança
  // no valor E a regex local achou um número com rótulo confiável, a heurística
  // determinística vale mais que um palpite que a própria IA desconfia.
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
    deliveryLeadDays,
    status: "ready",
    method: "ai",
    confidence,
    items: parseItensDaIa(data.items),
  };
}

/** Filtra e normaliza a lista de itens que a IA devolveu — nunca confia cega
 *  no formato: item sem descrição ou sem quantidade legível é descartado em
 *  vez de virar produto fantasma na área de Produtos. */
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
