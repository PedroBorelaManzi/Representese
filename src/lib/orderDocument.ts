// src/lib/orderDocument.ts
//
// Prepara um arquivo de pedido para a leitura por IA — e NUNCA lança.
//
// Antes, a leitura local (pdf.js pra PDF, ExcelJS pra planilha) era o único
// caminho pra tudo que não fosse foto: o texto extraído aqui era o que a IA
// recebia. Isso fazia dela um ponto único de falha em três situações que
// acontecem o tempo todo em pedido de verdade:
//
//   1. a biblioteca quebra no navegador (foi o "undefined is not a function"
//      que apareceu no iPhone e derrubou a tela inteira de enviar pedido);
//   2. o PDF é escaneado/fotografado e não tem camada de texto — a extração
//      "funciona" e devolve string vazia, e a IA recebe nada;
//   3. a foto é HEIC de iPhone, que nem era reconhecida como imagem.
//
// Agora o DOCUMENTO em si vai pra IA (o Gemini lê PDF e HEIC nativamente) e a
// extração local vira só uma dica a mais. Se ela quebrar, o motivo vai em
// `localError` — que o servidor registra no log — e o fluxo segue.

import { compressImage } from "./imageCompression";
import { loadPdfjs } from "./pdfjsLoader";

export type OrderDocumentKind = "pdf" | "excel" | "image" | "unknown";

export interface PreparedOrderDocument {
  kind: OrderDocumentKind;
  /** Texto lido localmente. Vazio não é erro: foto e PDF escaneado não têm. */
  extractedText: string;
  /** O documento em si, pronto pra ir como anexo pra IA. */
  inlineData?: { data: string; mimeType: string };
  /** Por que a leitura local não rendeu. Diagnóstico, não erro fatal. */
  localError?: string;
  /** Só quando não sobrou NADA pra mandar pra IA — mensagem pro usuário. */
  fatalMessage?: string;
}

/** Tipos que o Gemini aceita como anexo. Qualquer outro não adianta mandar. */
export const MIMES_ACEITOS_PELA_IA = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

/**
 * Teto do anexo em bytes CRUS.
 *
 * O corpo de uma função serverless da Vercel para em ~4,5 MB e base64 infla
 * 33%, então 3 MB crus viram ~4 MB de JSON — com folga pro resto do payload.
 * Acima disso o arquivo degrada (imagem recomprime, PDF vai só de texto) em
 * vez de tomar 413 na cara do usuário.
 */
export const LIMITE_ANEXO_BYTES = 3 * 1024 * 1024;

function comeca(bytes: Uint8Array, assinatura: number[], offset = 0): boolean {
  if (bytes.length < offset + assinatura.length) return false;
  return assinatura.every((b, i) => bytes[offset + i] === b);
}

/** Lê os bytes como texto ASCII — pra conferir marcas tipo "ftyp" e "WEBP". */
function marca(bytes: Uint8Array, de: number, ate: number): string {
  if (bytes.length < ate) return "";
  return String.fromCharCode(...bytes.subarray(de, ate));
}

export interface TipoDetectado {
  kind: OrderDocumentKind;
  /** MIME real do arquivo — pode não ser o que o `file.type` diz. */
  mimeType: string;
  /** Formato reconhecido, porém sem leitura possível (ex: .xls antigo). */
  semSuporte?: string;
}

/**
 * Descobre o tipo do arquivo pelos BYTES primeiro, MIME depois, extensão por
 * último. A ordem importa: celular e app de mensagem mandam arquivo com nome
 * aleatório (sem extensão) e MIME genérico "application/octet-stream" — só os
 * bytes dizem a verdade nesses casos.
 */
export function detectDocumentKind(bytes: Uint8Array, fileName = "", declaredMime = ""): TipoDetectado {
  // ── Bytes mágicos ──
  if (comeca(bytes, [0x25, 0x50, 0x44, 0x46])) return { kind: "pdf", mimeType: "application/pdf" }; // %PDF
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mimeType: "image/jpeg" };
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47])) return { kind: "image", mimeType: "image/png" };
  if (marca(bytes, 0, 4) === "GIF8") return { kind: "image", mimeType: "image/gif" };
  if (marca(bytes, 0, 4) === "RIFF" && marca(bytes, 8, 12) === "WEBP") {
    return { kind: "image", mimeType: "image/webp" };
  }
  // Família ISO-BMFF: HEIC/HEIF (foto de iPhone) e AVIF têm "ftyp" no byte 4.
  if (marca(bytes, 4, 8) === "ftyp") {
    const brand = marca(bytes, 8, 12).toLowerCase();
    if (brand.startsWith("hei") || brand === "mif1" || brand === "msf1" || brand === "hevc") {
      return { kind: "image", mimeType: "image/heic" };
    }
    if (brand.startsWith("avi")) return { kind: "image", mimeType: "image/avif" };
    return { kind: "unknown", mimeType: declaredMime, semSuporte: "vídeo" };
  }
  // OLE2: o .xls antigo do Excel 97-2003. O ExcelJS NÃO lê esse formato — sem
  // reconhecer aqui, ele caía em "unknown" e o usuário só via "arquivo vazio".
  if (comeca(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    return { kind: "unknown", mimeType: "application/vnd.ms-excel", semSuporte: "planilha .xls antiga" };
  }
  if (comeca(bytes, [0x50, 0x4b])) {
    // ZIP. Pode ser .xlsx (que interessa) ou .docx/.odt/.zip (que não).
    const nome = fileName.toLowerCase();
    if (nome.endsWith(".docx")) return { kind: "unknown", mimeType: "", semSuporte: "documento Word" };
    return { kind: "excel", mimeType: "application/vnd.openxmlformats" };
  }

  // ── MIME declarado ──
  const mime = (declaredMime || "").toLowerCase();
  if (mime === "application/pdf") return { kind: "pdf", mimeType: "application/pdf" };
  if (mime.startsWith("image/")) return { kind: "image", mimeType: mime };
  if (mime.includes("spreadsheet") || mime.includes("excel")) {
    return { kind: "excel", mimeType: "application/vnd.openxmlformats" };
  }

  // ── Extensão ──
  const nome = fileName.toLowerCase();
  if (nome.endsWith(".pdf")) return { kind: "pdf", mimeType: "application/pdf" };
  if (nome.endsWith(".xlsx")) return { kind: "excel", mimeType: "application/vnd.openxmlformats" };
  if (nome.endsWith(".xls")) {
    return { kind: "unknown", mimeType: "application/vnd.ms-excel", semSuporte: "planilha .xls antiga" };
  }
  if (/\.(jpe?g|png|webp|heic|heif|gif|avif)$/.test(nome)) {
    const ext = nome.split(".").pop() as string;
    const porExtensao: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
      heic: "image/heic", heif: "image/heif", gif: "image/gif", avif: "image/avif",
    };
    return { kind: "image", mimeType: porExtensao[ext] || "image/jpeg" };
  }

  return { kind: "unknown", mimeType: declaredMime };
}

/** Converte bytes em base64 sem estourar a pilha com arquivo grande. */
export function bytesParaBase64(bytes: Uint8Array): string {
  let binario = "";
  const PEDACO = 0x8000; // 32k args por chamada: acima disso o JS engasga
  for (let i = 0; i < bytes.length; i += PEDACO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + PEDACO));
  }
  return btoa(binario);
}

function motivo(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Texto das 3 primeiras páginas do PDF. Só dica — pode falhar sem problema. */
async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfjs();
  // Cópia própria: o pdf.js toma posse do buffer que recebe (chega a
  // "destacá-lo"), e a gente ainda precisa dos bytes originais pro anexo.
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  let texto = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texto += content.items.map((item: any) => item.str).join(" ") + "\n";
  }
  return texto;
}

async function textoDaPlanilha(buffer: ArrayBuffer): Promise<string> {
  const { default: ExcelJS } = await import("exceljs"); // ~940 kB: só quando tem planilha
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (workbook.worksheets.length === 0) return "";
  let texto = "";
  workbook.worksheets[0].eachRow((row) => {
    texto += (Array.isArray(row.values) ? row.values.slice(1).join(",") : "") + "\n";
  });
  return texto;
}

/**
 * Ponto de entrada. Devolve sempre um objeto — erro de biblioteca vira
 * `localError`, nunca exceção, porque quem chama está no meio de um fluxo de
 * usuário e não tem o que fazer com um TypeError minificado.
 */
export async function prepareOrderDocument(file: File): Promise<PreparedOrderDocument> {
  let cabecalho = new Uint8Array();
  try {
    cabecalho = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch {
    // Sem os bytes, a detecção cai pra MIME/extensão — que é o suficiente.
  }

  const tipo = detectDocumentKind(cabecalho, file.name, file.type);

  if (tipo.semSuporte) {
    return {
      kind: "unknown",
      extractedText: "",
      fatalMessage: `Não leio ${tipo.semSuporte}. Mande uma foto do pedido, um PDF ou uma planilha .xlsx.`,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (err) {
    return {
      kind: tipo.kind,
      extractedText: "",
      localError: `arquivo ilegível: ${motivo(err)}`,
      fatalMessage: "Não consegui abrir esse arquivo. Tente anexar de novo.",
    };
  }

  if (tipo.kind === "pdf") {
    const resultado: PreparedOrderDocument = { kind: "pdf", extractedText: "" };

    // O anexo é montado ANTES de chamar o pdf.js de propósito: se ele quebrar,
    // o PDF já está guardado e a IA ainda lê o documento inteiro.
    if (bytes.byteLength <= LIMITE_ANEXO_BYTES) {
      resultado.inlineData = { data: bytesParaBase64(bytes), mimeType: "application/pdf" };
    } else {
      resultado.localError = `pdf grande demais pro anexo (${bytes.byteLength} bytes)`;
    }

    try {
      resultado.extractedText = await textoDoPdf(bytes);
    } catch (err) {
      resultado.localError = [resultado.localError, `pdf.js falhou: ${motivo(err)}`]
        .filter(Boolean)
        .join("; ");
    }

    if (!resultado.inlineData && !resultado.extractedText.trim()) {
      resultado.fatalMessage = "Esse PDF é grande demais e não tem texto. Mande uma foto da página do pedido.";
    }
    return resultado;
  }

  if (tipo.kind === "excel") {
    // Planilha não vai como anexo: o Gemini não abre .xlsx. Aqui a leitura
    // local continua sendo o único caminho — por isso o erro é fatal.
    try {
      const texto = await textoDaPlanilha(bytes.buffer as ArrayBuffer);
      return texto.trim()
        ? { kind: "excel", extractedText: texto }
        : { kind: "excel", extractedText: "", fatalMessage: "Essa planilha está vazia na primeira aba." };
    } catch (err) {
      return {
        kind: "excel",
        extractedText: "",
        localError: `exceljs falhou: ${motivo(err)}`,
        fatalMessage: "Não consegui abrir essa planilha. Salve como .xlsx ou mande o pedido em PDF/foto.",
      };
    }
  }

  if (tipo.kind === "image") {
    // Caminho normal: recomprimir pra caber no limite do serverless.
    try {
      const comprimida = await compressImage(file);
      if (comprimida.base64) {
        return {
          kind: "image",
          extractedText: "",
          inlineData: { data: comprimida.base64, mimeType: comprimida.mime },
        };
      }
    } catch (err) {
      // HEIC fora do Safari não decodifica no canvas. Mas o Gemini lê HEIC
      // direto, então os bytes originais servem — desde que caibam.
      const cru = MIMES_ACEITOS_PELA_IA.includes(tipo.mimeType as any);
      if (cru && bytes.byteLength <= LIMITE_ANEXO_BYTES) {
        return {
          kind: "image",
          extractedText: "",
          inlineData: { data: bytesParaBase64(bytes), mimeType: tipo.mimeType },
          localError: `compressão falhou, mandando original: ${motivo(err)}`,
        };
      }
      return {
        kind: "image",
        extractedText: "",
        localError: `compressão falhou: ${motivo(err)}`,
        fatalMessage: "Não consegui ler essa foto. Tente tirar outra ou mandar em JPG.",
      };
    }
  }

  return {
    kind: "unknown",
    extractedText: "",
    fatalMessage: "Formato de arquivo não reconhecido. Mande uma foto, um PDF ou uma planilha .xlsx.",
  };
}
