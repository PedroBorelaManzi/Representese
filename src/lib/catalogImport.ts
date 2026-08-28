import { callGeminiProxy } from "./geminiProxy";

export interface CatalogItemExtraido {
  name: string;
  code?: string;
  unitType: "unidade" | "caixa";
  price?: number;
  discountPct?: number;
  commissionPct?: number;
}

// pdfjs (~1,3 MB) só é carregado quando um PDF é de fato processado — mesmo
// padrão de clientImport.ts.
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

async function detectFileType(file: File): Promise<{ type: "pdf" | "excel" | "image" | "text" | "unknown"; mimeType?: string }> {
  try {
    const buffer = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { type: "pdf", mimeType: "application/pdf" };
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return { type: "excel" };
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return { type: "excel" };
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image", mimeType: "image/jpeg" };
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: "image", mimeType: "image/png" };
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) return { type: "excel" };
    if (name.endsWith(".txt")) return { type: "text" };
    return { type: "unknown" };
  } catch {
    return { type: "unknown" };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result.split(",")[1] : "");
    reader.onerror = reject;
  });
}

async function extractTextFromPDF(file: File): Promise<string[]> {
  try {
    const pdfjs = await loadPdfjs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const pagesText: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pagesText.push(content.items.map((item: any) => item.str).join(" "));
    }
    return pagesText;
  } catch {
    return [];
  }
}

const PROMPT = `Você está lendo uma LISTA DE PREÇOS / CATÁLOGO de produtos de uma fábrica/fornecedor
(não é um pedido de venda). Extraia TODOS os produtos listados no documento.

Para cada produto, identifique:
- name: nome/descrição do produto (obrigatório)
- code: código/referência do produto, se houver
- unitType: "caixa" se o preço listado é por caixa/pacote/fardo (qualquer embalagem com múltiplas
  unidades), ou "unidade" se o preço é por peça/unidade avulsa. Quando o documento não deixar claro,
  responda "unidade".
- price: preço numérico (sem "R$", use ponto como separador decimal), correspondente ao unitType
  identificado
- discountPct: percentual de desconto do produto, se o documento indicar um (número, sem "%")
- commissionPct: percentual de comissão do produto, se o documento indicar um (número, sem "%")

Campos não encontrados no documento: omita a chave (não invente valor).

Retorne APENAS um Array JSON puro, sem markdown, sem comentários:
[{"name":"...","code":"...","unitType":"unidade","price":12.5,"discountPct":5,"commissionPct":8}, ...]`;

async function processWithGemini(file: File): Promise<CatalogItemExtraido[]> {
  const detected = await detectFileType(file);

  let imageData: string | undefined;
  let imageMimeType: string | undefined;
  let fullPrompt = PROMPT;

  if (detected.type === "image") {
    imageData = await fileToBase64(file);
    imageMimeType = detected.mimeType || "image/jpeg";
  } else {
    let text = "";
    if (detected.type === "excel") {
      const buffer = await file.arrayBuffer();
      const { default: ExcelJS } = await import("exceljs"); // ~940 kB: só carrega quando o usuário sobe planilha
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      workbook.worksheets.forEach((worksheet) => {
        worksheet.eachRow((row) => {
          const rowValues = Array.isArray(row.values) ? row.values.slice(1).join(",") : "";
          text += rowValues + "\n";
        });
      });
    } else if (detected.type === "pdf") {
      const pages = await extractTextFromPDF(file);
      text = pages.join("\n");
    } else {
      text = await file.text();
    }
    fullPrompt = PROMPT + "\n\nConteúdo do documento:\n" + text.substring(0, 40000);
  }

  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [{ text: fullPrompt }];
  if (imageData && imageMimeType) {
    parts.push({ inlineData: { data: imageData, mimeType: imageMimeType } });
  }

  const resText = await callGeminiProxy({
    contents: [{ role: "user", parts }],
    model: "gemini-2.5-flash",
  });
  const cleaned = resText.replace(/```json/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item: any): CatalogItemExtraido | null => {
      const name = String(item?.name || "").trim();
      if (!name) return null;
      const unitType = item?.unitType === "caixa" ? "caixa" : "unidade";
      const toNum = (v: any) => (v !== undefined && v !== null && v !== "" && isFinite(Number(v)) ? Number(v) : undefined);
      return {
        name,
        code: item?.code ? String(item.code).trim() : undefined,
        unitType,
        price: toNum(item?.price),
        discountPct: toNum(item?.discountPct),
        commissionPct: toNum(item?.commissionPct),
      };
    })
    .filter((item): item is CatalogItemExtraido => item !== null);
}

/** Lê um arquivo de catálogo/lista de preços (Excel, PDF ou imagem) e devolve
 *  os produtos identificados. Nunca lança — arquivo ilegível ou sem produtos
 *  reconhecíveis volta como lista vazia, pra tela mostrar "nada encontrado"
 *  em vez de travar num erro. */
export async function parseCatalogFile(file: File): Promise<CatalogItemExtraido[]> {
  try {
    return await processWithGemini(file);
  } catch {
    return [];
  }
}
