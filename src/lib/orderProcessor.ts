import { geminiWithSystem } from "./geminiProxy";
import { prepareOrderDocument, type OrderDocumentKind } from "./orderDocument";
import {
  ORDER_EXTRACTION_SYSTEM_INSTRUCTION,
  buildOrderExtractionPrompt,
  extractCNPJLocally,
  extractCategoryLocally,
  extractCategoryLocallyDetailed,
  extractValueLocally,
  reconcileExtractionResult,
  type OrderExtractionResult,
} from "./orderExtractionCore";

export type { OrderExtractionResult };
export { extractCNPJLocally, extractCategoryLocally, extractValueLocally };

export type DetectedFileType = OrderDocumentKind;

export interface LocalFileData {
  type: DetectedFileType;
  /** Texto extraído localmente (PDF/planilha) — pode vir vazio (PDF
   *  escaneado, foto) sem que isso seja um erro: o documento em si ainda
   *  vai pra IA pelo `imageData` abaixo. */
  extractedText: string;
  /** Bytes do documento (imagem OU pdf) prontos pra IA ler, em base64. O
   *  nome é herdado de quando só existia imagem — hoje carrega qualquer
   *  anexo que o Gemini aceita. */
  imageData?: string;
  imageMimeType?: string;
  /** Preenchido quando a leitura local falhou mas o fluxo seguiu de
   *  qualquer forma — vai pro log do servidor, não pro usuário. */
  localError?: string;
}

/** Lê o arquivo localmente (sem IA nenhuma): texto de PDF/planilha quando dá,
 *  e os bytes do documento prontos pra IA ler. Usado tanto pelo upload normal
 *  (processOrderFile abaixo) quanto pela tela de enviar pedido por link
 *  (OrderIntake.tsx), que manda esse resultado pro servidor pra IA ler.
 *
 *  Delega pra prepareOrderDocument (orderDocument.ts), que NUNCA lança —
 *  antes, uma falha aqui (pdf.js quebrando, PDF escaneado, HEIC não
 *  reconhecido) derrubava a tela inteira de enviar pedido antes mesmo de a
 *  IA ser chamada. */
export async function extractLocalFileData(file: File): Promise<LocalFileData> {
  const prepared = await prepareOrderDocument(file);
  if (prepared.fatalMessage) {
    throw new Error(prepared.fatalMessage);
  }
  return {
    type: prepared.kind,
    extractedText: prepared.extractedText,
    imageData: prepared.inlineData?.data,
    imageMimeType: prepared.inlineData?.mimeType,
    localError: prepared.localError,
  };
}

export async function processOrderFile(file: File, knownClients: string[] = [], categories: string[] = []): Promise<OrderExtractionResult> {
  try {
    const local = await extractLocalFileData(file);
    const { extractedText, imageData, imageMimeType } = local;
    if (local.localError) console.warn("Leitura local do pedido com ressalva:", local.localError);

    const localCnpj = extractCNPJLocally(extractedText);
    const localValue = extractValueLocally(extractedText);
    const localCategoria = extractCategoryLocallyDetailed(extractedText, categories);

    // knownClients já vinha preenchido pelas três telas que chamam isto
    // (Pedidos, Empresas e ClientDetails) e era simplesmente ignorado aqui —
    // a IA nunca via a carteira. Passando a lista, ela devolve o nome na
    // grafia exata do cadastro, que é o que faz o pedido casar sozinho com o
    // cliente certo em vez de cair como "cliente novo".
    const userPrompt = buildOrderExtractionPrompt(extractedText, localCnpj, localValue, categories, knownClients);

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

    return reconcileExtractionResult(
      textResult, localCnpj, localValue,
      localCategoria.category, categories, localCategoria.score,
    );

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
        error: err instanceof Error ? err.message : "Erro desconhecido",
        items: [],
    };
  }
}
// v2.3 - Motor Híbrido Blindado contra Pontuação e Acentos
