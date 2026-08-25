// src/lib/orderExtractionCore.ts
//
// Núcleo puro (sem DOM, sem nada específico de navegador) da leitura de
// pedido: o prompt que manda pra IA e as extrações locais por regex/palavra-
// chave. Extraído de orderProcessor.ts pra poder ser importado tanto pelo
// app (Vite/browser) quanto pelo endpoint serverless de enviar pedido por
// link (api/order-intake.ts, roda em Node na Vercel) — assim as duas
// entradas de pedido (pelo painel e pelo link do funcionário) sempre leem o
// documento exatamente do mesmo jeito, sem duas versões do prompt que podem
// desalinhar com o tempo.

export interface OrderExtractionResult {
  client: string;
  cnpj: string;
  category: string;
  value: number;
  address?: string;
  status: "ready" | "error";
  error?: string;
  method?: "local" | "ai";
}

export const ORDER_EXTRACTION_SYSTEM_INSTRUCTION = `Você é um especialista em OCR de documentos fiscais brasileiros.
Sua tarefa é extrair quatro informações fundamentais em formato JSON:
1. CLIENTE DESTINATÁRIO: Nome da empresa que está comprando.
2. CNPJ CLIENTE: Extraia o CNPJ do cliente comprador (Destinatário).
3. VALOR TOTAL (number): O valor financeiro final/líquido do documento.
   - Retorne APENAS o número final (float), sem símbolos.
   - O valor total é geralmente o MAIOR valor financeiro do documento.
4. CATEGORIA (FORNECEDOR/REPRESENTADA): O fabricante ou emissor do pedido.
   - REGRA CRÍTICA: Você DEVE selecionar uma das "CATEGORIAS CONHECIDAS" fornecidas.
   - Se o nome do emissor no documento for semelhante a uma categoria conhecida (ex: "Indústria Cozimax" -> "Cozimax"), selecione a categoria conhecida.
   - Retorne a categoria exatamente como escrita na lista. Se não houver correspondência mínima, retorne uma string vazia.
5. ENDEREÇO: O endereço completo de entrega/faturamento do cliente comprador.

Retorne APENAS um objeto JSON válido seguindo este esquema:
{
  "client": string,
  "cnpj": string,
  "category": string,
  "value": number,
  "address": string
}`;

export function extractCNPJLocally(text: string): string {
  const cnpjRegex = /\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/g;
  const matches = text.match(cnpjRegex);
  if (matches && matches.length > 0) {
    const clientKeywords = ["destinatário", "cliente", "comprador", "entregar"];
    for (const match of matches) {
      const index = text.indexOf(match);
      const context = text.toLowerCase().substring(Math.max(0, index - 150), index);
      if (clientKeywords.some(kw => context.includes(kw))) return match.replace(/\D/g, "");
    }
    return matches[0].replace(/\D/g, "");
  }
  return "";
}

export function extractCategoryLocally(text: string, categories: string[]): string {
  if (!categories || categories.length === 0 || !text) return "";

  const normalizedText = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ");

  const matches = categories.map(cat => {
    const normalizedCat = cat.toLowerCase().trim();
    const cleanCat = normalizedCat.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ");
    let score = 0;

    if (normalizedText.includes(cleanCat)) {
      score += 100;
    }

    const cleanWords = cleanCat.split(/\s+/);
    cleanWords.forEach(word => {
      if (word.length > 3 && normalizedText.includes(word)) {
        score += 15;
      }
    });

    return { category: cat, score };
  });

  matches.sort((a, b) => b.score - a.score);

  if (matches[0] && matches[0].score > 0) {
    return matches[0].category;
  }

  return "";
}

export function extractValueLocally(text: string): number {
  const parseMoney = (rawValue: string) => {
    if (rawValue.includes('.') && rawValue.includes(',')) {
      const lastComma = rawValue.lastIndexOf(',');
      const lastDot = rawValue.lastIndexOf('.');
      if (lastComma > lastDot) return parseFloat(rawValue.replace(/\./g, "").replace(",", "."));
      else return parseFloat(rawValue.replace(/,/g, ""));
    }
    if (rawValue.includes(',') && !rawValue.includes('.')) return parseFloat(rawValue.replace(",", "."));
    return parseFloat(rawValue);
  };

  const valueRegex = /(?:total da nota|total geral|valor l[íi]quido|vlr total|total do pedido|valor total|total final|total:|total r\$|valor a pagar|total líquido).*?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/ig;
  let match;
  let lastValidMatch = null;
  while ((match = valueRegex.exec(text)) !== null) {
    lastValidMatch = match[1];
  }

  if (lastValidMatch) {
    return parseMoney(lastValidMatch);
  }

  const allMoneyRegex = /(?:R\$\s*|)(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/ig;
  let maxMoney = 0;

  while ((match = allMoneyRegex.exec(text)) !== null) {
    const val = parseMoney(match[1]);
    if (val > maxMoney) {
      maxMoney = val;
    }
  }

  return maxMoney;
}

/** Monta o prompt de usuário mandado pra IA, com as dicas locais já extraídas
 *  (CNPJ/valor por regex) e a lista de categorias conhecidas do dono da conta. */
export function buildOrderExtractionPrompt(
  extractedText: string,
  localCnpj: string,
  localValue: number,
  categories: string[]
): string {
  return `Analise este documento:
    HINTS LOCAIS (Buscados na leitura lógica):
    - CNPJ detectado: ${localCnpj || "Não detectado"}
    - Valor provável (MAIOR VALOR DO DOC): ${localValue || "Não detectado"}

    CATEGORIAS CONHECIDAS: ${categories.join(", ")}

    CONTEÚDO DO DOCUMENTO:
    ${extractedText.substring(0, 10000)}
    `;
}

/** Junta a resposta bruta da IA com as dicas locais — mesma regra de
 *  prioridade nos dois lugares que chamam isso (app e link do funcionário):
 *  categoria local "forte" ganha da IA, valor da IA ganha do local só se for
 *  positivo, JSON inválido cai pro modo local puro em vez de travar. */
export function reconcileExtractionResult(
  rawGeminiText: string,
  localCnpj: string,
  localValue: number,
  localCategory: string,
  categories: string[]
): OrderExtractionResult {
  let textResult = rawGeminiText;
  if (textResult.includes("```")) {
    textResult = textResult.replace(/```(?:json)?\n?([\s\S]*?)```/g, '$1').trim();
  }

  let data: any;
  try {
    data = JSON.parse(textResult);
  } catch (parseError) {
    return {
      client: "Desconhecido",
      cnpj: localCnpj || "",
      category: "",
      value: localValue,
      address: "",
      status: "ready",
      method: "local",
    };
  }

  let finalCategory = data.category || "";

  if (localCategory) {
    finalCategory = localCategory;
  } else if (finalCategory && categories.length > 0) {
    const found = categories.find((c) => c.toLowerCase() === finalCategory.toLowerCase());
    if (!found) {
      const partial = categories.find((c) => finalCategory.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(finalCategory.toLowerCase()));
      finalCategory = partial || "";
    } else {
      finalCategory = found;
    }
  }

  return {
    client: data.client || "Desconhecido",
    cnpj: (data.cnpj || localCnpj || "").replace(/\D/g, ""),
    category: finalCategory,
    value: (data.value && data.value > 0) ? data.value : localValue,
    address: data.address || "",
    status: "ready",
    method: "ai",
  };
}
