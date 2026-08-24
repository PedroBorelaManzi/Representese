import { geminiWithSystem } from "./geminiProxy";
import { loadPdfjs } from "./pdfjsLoader";

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

const SYSTEM_INSTRUCTION = `Você é um especialista em OCR de documentos fiscais brasileiros.
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

async function detectFileType(file: File) {
  const buffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x25 && bytes[1] === 0x50) return { type: "pdf", mimeType: "application/pdf" };
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) return { type: "excel", mimeType: "application/vnd.openxmlformats" };
  
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return { type: "pdf", mimeType: "application/pdf" }; // Fallback
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".webp")) return { type: "image", mimeType: file.type };
  
  return { type: "unknown", mimeType: file.type };
}

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
  
  // Limpeza super agressiva: remove pontuações, acentos, traços, etc.
  const normalizedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ");
  
  // Create an array of objects to store the match score
  const matches = categories.map(cat => {
    const normalizedCat = cat.toLowerCase().trim();
    // Split category into words to check partial matches
    const words = normalizedCat.split(/\s+/);
    let score = 0;
    
    const cleanCat = normalizedCat.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ");
    
    // Exact match is best
    if (normalizedText.includes(cleanCat)) {
      score += 100;
    }
    
    // Partial word matches (e.g., "Cozimax" matching "Indústria Cozimax")
    const cleanWords = cleanCat.split(/\s+/);
    cleanWords.forEach(word => {
        if (word.length > 3 && normalizedText.includes(word)) {
            score += 15;
        }
    });

    return { category: cat, score };
  });

  // Sort by highest score
  matches.sort((a, b) => b.score - a.score);
  
  // Return the best match if it has a meaningful score
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

  // Tenta achar pelas palavras-chave exatas primeiro
  const valueRegex = /(?:total da nota|total geral|valor l[íi]quido|vlr total|total do pedido|valor total|total final|total:|total r\$|valor a pagar|total líquido).*?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/ig;
  let match;
  let lastValidMatch = null;
  while ((match = valueRegex.exec(text)) !== null) {
      lastValidMatch = match[1];
  }
  
  if (lastValidMatch) {
    return parseMoney(lastValidMatch);
  }

  // Se nao achou palavra-chave, pega TODOS os valores monetarios da folha e retorna o MAIOR
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

export async function processOrderFile(file: File, knownClients = [], categories = []) {
  try {
    const detected = await detectFileType(file);
    let extractedText = "";

    if (detected.type === "pdf") {
      const pdfjs = await loadPdfjs();
      const buffer = await file.arrayBuffer();
      // pdf.js v6 removeu eval() do motor de renderização/parsing por completo —
      // não existe mais a opção isEvalSupported (nem falta fazer nada pelo CSP).
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        extractedText += content.items.map((item: any) => item.str).join(" ") + "\n";
      }
    } else if (detected.type === "excel") {
      const buffer = await file.arrayBuffer();
      const { default: ExcelJS } = await import("exceljs"); // ~940 kB: só carrega quando o usuário importa/exporta planilha
        const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      if (workbook.worksheets.length > 0) {
        workbook.worksheets[0].eachRow(row => {
           const rowValues = Array.isArray(row.values) ? row.values.slice(1).join(',') : '';
           extractedText += rowValues + '\n';
        });
      }
    }

    const localCnpj = extractCNPJLocally(extractedText);
    const localValue = extractValueLocally(extractedText);
    const localCategory = extractCategoryLocally(extractedText, categories as string[]);

    // Se o AI falhar instantaneamente, teremos esse backup perfeito
    if (localValue > 0 && !extractedText) {
       // Apenas como precaução, se texto falhou
    }

    const userPrompt = `Analise este documento:
    HINTS LOCAIS (Buscados na leitura lógica):
    - CNPJ detectado: ${localCnpj || "Não detectado"}
    - Valor provável (MAIOR VALOR DO DOC): ${localValue || "Não detectado"}
    
    CATEGORIAS CONHECIDAS: ${categories.join(", ")}
    
    CONTEÚDO DO DOCUMENTO:
    ${extractedText.substring(0, 10000)}
    `;

    let imageData: string | undefined;
    let imageMimeType: string | undefined;
    if (detected.type === "image") {
       const reader = new FileReader();
       const base64Promise = new Promise((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(file);
       });
       imageData = await base64Promise as string;
       imageMimeType = detected.mimeType;
    }

        let textResult = "";
    try {
        const geminiCall = geminiWithSystem(userPrompt, SYSTEM_INSTRUCTION, {
          model: "gemini-2.5-flash",
          imageData,
          imageMimeType,
          generationConfig: { responseMimeType: "application/json" },
        });

        const timeoutLimit = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Timeout_IA_15_segundos")), 15000);
        });

        textResult = await Promise.race([geminiCall, timeoutLimit]) as string;
    } catch (iaError) {
        console.warn("IA falhou, usando modo de backup local. Motivo:", iaError);
        textResult = "{}"; // Força o JSON vazio para cair na leitura local
    }

    if (!textResult) {
        throw new Error("Resposta da IA vazia");
    }

    if (textResult.includes("```")) {
        textResult = textResult.replace(/```(?:json)?\n?([\s\S]*?)```/g, '$1').trim();
    }
    
    let data;
    try {
        data = JSON.parse(textResult);
    } catch (parseError) {
        console.error("Erro no Parse do JSON:", textResult);
        // Fallback: se a IA não mandou JSON válido, usamos a leitura local
        return {
            client: "Desconhecido",
            cnpj: localCnpj || "",
            category: "",
            value: localValue,
            address: "",
            status: "ready",
            method: "local"
        };
    }

    let finalCategory = data.category || "";
    
    // Priority 1: Local similarity matching if it found a strong match
    if (localCategory) {
        finalCategory = localCategory;
    } else if (finalCategory && categories.length > 0) {
        // Priority 2: AI result matching known categories
        const found = categories.find((c: string) => c.toLowerCase() === finalCategory.toLowerCase());
        if (!found) {
            const partial = categories.find((c: string) => finalCategory.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(finalCategory.toLowerCase()));
            finalCategory = partial || ""; 
        } else {
            finalCategory = found;
        }
    }

    return {
      client: data.client || "Desconhecido",
      cnpj: (data.cnpj || localCnpj || "").replace(/\D/g, ""),
      category: finalCategory,
      // Dá prioridade ao valor da IA, se a IA se enrolar (devolver 0), usa a extração do MAIOR VALOR local
      value: (data.value && data.value > 0) ? data.value : localValue,
      address: data.address || "",
      status: "ready",
      method: "ai"
    };

  } catch (err) {
    console.error("AI Reader Error Details:", err);
    // Mesmo se a IA der erro (ex: 500 no proxy), tenta usar os dados locais salvos
    // para não travar o usuário
    return { 
        client: "", 
        cnpj: "", 
        category: "", 
        value: 0, 
        status: "error", 
        error: err instanceof Error ? err.message : "Erro desconhecido"
    };
  }
}
// v2.3 - Motor Híbrido Blindado contra Pontuação e Acentos
