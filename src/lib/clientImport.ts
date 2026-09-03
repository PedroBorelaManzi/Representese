import { callGeminiProxy } from "./geminiProxy";

// pdfjs (~1,3 MB) só é carregado quando um PDF é de fato processado.
// Worker local (bundle) — o unpkg.com é bloqueado pelo CSP do vercel.json.
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}


export function extractCnpjs(text: string): string[] {
  const cnpjRegex = /\d{2}[\.\s]*\d{3}[\.\s]*\d{3}[\/\s]*\d{4}[\-\s]*\d{2}/g;
  const matches = text.match(cnpjRegex) || [];
  const uniqueCnpjs = Array.from(new Set(matches.map(cnpj => cnpj.replace(/\D/g, ''))));
  return uniqueCnpjs.filter(cnpj => cnpj.length === 14);
}

async function detectFileType(file: File): Promise<{ type: 'pdf' | 'excel' | 'image' | 'text' | 'unknown', mimeType?: string }> {
  try {
    const buffer = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { type: 'pdf', mimeType: 'application/pdf' };
    if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) return { type: 'excel' };
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) return { type: 'excel' };
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return { type: 'image', mimeType: 'image/jpeg' };
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return { type: 'image', mimeType: 'image/png' };
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) return { type: 'excel' };
    if (name.endsWith('.txt')) return { type: 'text' };
    return { type: 'unknown' };
  } catch (e) { return { type: 'unknown' }; }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result.split(',')[1] : "");
    reader.onerror = reject;
  });
}



/** Conteúdo do arquivo pronto pro Gemini: texto (planilha/pdf/txt) OU imagem. */
async function fileContentForAI(
  file: File
): Promise<{ text?: string; imageData?: string; imageMimeType?: string; detected: Awaited<ReturnType<typeof detectFileType>> }> {
  const detected = await detectFileType(file);
  if (detected.type === 'image') {
    return { imageData: await fileToBase64(file), imageMimeType: detected.mimeType || 'image/jpeg', detected };
  }
  let text = "";
  if (detected.type === 'excel') {
    const buffer = await file.arrayBuffer();
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    workbook.worksheets.forEach((worksheet) => {
      worksheet.eachRow((row) => {
        text += (Array.isArray(row.values) ? row.values.slice(1).join(',') : '') + '\n';
      });
    });
  } else if (detected.type === 'pdf') {
    text = (await extractTextFromPDF(file)).join('\n');
  } else {
    text = await file.text();
  }
  return { text: text.substring(0, 30000), detected };
}

async function askGemini(parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>): Promise<any> {
  const resText = await callGeminiProxy({ contents: [{ role: "user", parts }], model: "gemini-2.5-flash" });
  return JSON.parse(resText.replace(/```json/g, "").replace(/```/g, "").trim());
}

async function processWithGemini(file: File): Promise<string[]> {
  const prompt =
    "ATENÇÃO: Extraia os números de CNPJ (14 dígitos) apenas dos CLIENTES/COMPRADORES contidos neste documento. Ignore o CNPJ da Fábrica/Emissor.\n" +
    'Retorne APENAS um Array JSON puro: ["12345678000199", "98765432000111"]';
  const { text, imageData, imageMimeType, detected } = await fileContentForAI(file);
  try {
    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [
      { text: imageData ? prompt : `${prompt}\n\nConteúdo:\n${text}` },
    ];
    if (imageData && imageMimeType) parts.push({ inlineData: { data: imageData, mimeType: imageMimeType } });
    const cnpjs = await askGemini(parts);
    return Array.isArray(cnpjs) ? cnpjs.map(String).map((s) => s.replace(/\D/g, '')).filter((s) => s.length === 14) : [];
  } catch {
    if (detected.type === 'pdf') return extractCnpjsFallbackFromPDF(file);
    return [];
  }
}

export interface ImportedClientRow {
  name: string;
  cnpj?: string;
  city?: string;
  state?: string;
}

/**
 * Extrai uma LISTA DE CLIENTES de qualquer arquivo (planilha, PDF, foto, txt) —
 * pra quando o documento tem os nomes dos clientes mas nenhum CNPJ (ex.: um
 * relatório de entregas ou uma lista de lojas). Devolve nome + cidade/UF +
 * CNPJ quando aparecer. Deduplica por nome.
 */
export async function parseFileForClients(file: File): Promise<ImportedClientRow[]> {
  const prompt =
    "Este documento contém uma lista de CLIENTES/COMPRADORES (lojas, empresas, redes) de um representante comercial. " +
    "Extraia CADA cliente distinto. Para cada um devolva: name (o nome mais específico do cliente/loja, sem o nome da fábrica/emissor), " +
    "cnpj (só se aparecer no documento, 14 dígitos, senão omita), city e state (UF de 2 letras) se der pra inferir do texto. " +
    "Ignore linhas de cabeçalho, totais e o emissor. Deduplique. " +
    'Retorne APENAS um Array JSON: [{"name":"...","cnpj":"...","city":"...","state":"SP"}]';
  try {
    const { text, imageData, imageMimeType } = await fileContentForAI(file);
    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [
      { text: imageData ? prompt : `${prompt}\n\nConteúdo:\n${text}` },
    ];
    if (imageData && imageMimeType) parts.push({ inlineData: { data: imageData, mimeType: imageMimeType } });
    const rows = await askGemini(parts);
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    const out: ImportedClientRow[] = [];
    for (const r of rows) {
      const name = String(r?.name || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cnpj = String(r?.cnpj || "").replace(/\D/g, "");
      out.push({
        name,
        cnpj: cnpj.length === 14 ? cnpj : undefined,
        city: (r?.city && String(r.city).trim()) || undefined,
        state: (r?.state && String(r.state).trim().toUpperCase().slice(0, 2)) || undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}


async function extractTextFromPDF(file: File): Promise<string[]> {
  try {
    const pdfjs = await loadPdfjs();
    const arrayBuffer = await file.arrayBuffer();
    // pdf.js v6 removeu eval() do motor de renderização/parsing por completo —
    // não existe mais a opção isEvalSupported (nem falta fazer nada pelo CSP).
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const pagesText: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pagesText.push(content.items.map((item: any) => item.str).join(' '));
    }
    return pagesText;
  } catch (e) {
    return [];
  }
}

async function extractCnpjsFallbackFromPDF(file: File): Promise<string[]> {
  const texts = await extractTextFromPDF(file);
  const results = extractCnpjs(texts.join('\n'));
  return results;
}

export async function parseFileForCnpjs(file: File): Promise<string[]> {
  try {
    const cnpjs = await processWithGemini(file);
    return Array.from(new Set(cnpjs));
  } catch (error) {
    return [];
  }
}
