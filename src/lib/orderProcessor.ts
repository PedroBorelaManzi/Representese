import { geminiWithSystem } from "./geminiProxy";
import { loadPdfjs } from "./pdfjsLoader";
import { compressImage } from "./imageCompression";
import {
  ORDER_EXTRACTION_SYSTEM_INSTRUCTION,
  buildOrderExtractionPrompt,
  extractCNPJLocally,
  extractCategoryLocally,
  extractValueLocally,
  reconcileExtractionResult,
  type OrderExtractionResult,
} from "./orderExtractionCore";

export type { OrderExtractionResult };
export { extractCNPJLocally, extractCategoryLocally, extractValueLocally };

export type DetectedFileType = "pdf" | "excel" | "image" | "unknown";

export async function detectFileType(file: File): Promise<{ type: DetectedFileType; mimeType: string }> {
  const buffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x25 && bytes[1] === 0x50) return { type: "pdf", mimeType: "application/pdf" };
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) return { type: "excel", mimeType: "application/vnd.openxmlformats" };

  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return { type: "pdf", mimeType: "application/pdf" }; // Fallback
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".webp")) return { type: "image", mimeType: file.type };

  return { type: "unknown", mimeType: file.type };
}

export interface LocalFileData {
  type: DetectedFileType;
  /** Texto extraído localmente (PDF/planilha) — vazio pra imagem, que não
   *  tem extração local nenhuma (só a IA lê foto). */
  extractedText: string;
  /** Preenchido só pra imagem: base64 já comprimido, pronto pra mandar pra IA. */
  imageData?: string;
  imageMimeType?: string;
}

/** Lê o arquivo localmente (sem IA nenhuma): texto de PDF/planilha, ou
 *  compressão + base64 de imagem. Usado tanto pelo upload normal
 *  (processOrderFile abaixo) quanto pela tela de enviar pedido por link
 *  (OrderIntake.tsx), que manda esse resultado pro servidor pra IA ler. */
export async function extractLocalFileData(file: File): Promise<LocalFileData> {
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
    return { type: detected.type, extractedText };
  }

  if (detected.type === "excel") {
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
    return { type: detected.type, extractedText };
  }

  if (detected.type === "image") {
    const compressed = await compressImage(file);
    return { type: detected.type, extractedText: "", imageData: compressed.base64, imageMimeType: compressed.mime };
  }

  return { type: detected.type, extractedText: "" };
}

export async function processOrderFile(file: File, knownClients = [], categories = []): Promise<OrderExtractionResult> {
  try {
    const local = await extractLocalFileData(file);
    const { extractedText, imageData, imageMimeType } = local;

    const localCnpj = extractCNPJLocally(extractedText);
    const localValue = extractValueLocally(extractedText);
    const localCategory = extractCategoryLocally(extractedText, categories as string[]);

    const userPrompt = buildOrderExtractionPrompt(extractedText, localCnpj, localValue, categories as string[]);

    let textResult = "";
    try {
        const geminiCall = geminiWithSystem(userPrompt, ORDER_EXTRACTION_SYSTEM_INSTRUCTION, {
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

    return reconcileExtractionResult(textResult, localCnpj, localValue, localCategory, categories as string[]);

  } catch (err) {
    console.error("AI Reader Error Details:", err);
    // Mesmo se a IA der erro (ex: 500 no proxy), tenta usar os dados locais salvos
    // para não travar o usuário
    return {
        client: "",
        cnpj: "",
        category: "",
        value: 0,
        address: "",
        status: "error",
        error: err instanceof Error ? err.message : "Erro desconhecido"
    };
  }
}
// v2.3 - Motor Híbrido Blindado contra Pontuação e Acentos
