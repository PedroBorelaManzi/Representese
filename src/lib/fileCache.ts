import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// Armazenamento privado do app (Directory.Data) — não exige nenhuma permissão
// de armazenamento no Android e sobrevive entre sessões, então um arquivo já
// aberto uma vez não precisa ser baixado de novo da próxima.
const CACHE_DIR = Directory.Data;
const CACHE_SUBDIR = "file_cache";

/** Progresso do download: `total` é 0 quando o servidor não informa o tamanho. */
export interface ProgressoDownload {
  baixado: number;
  total: number;
  /** 0–100, ou null quando o tamanho total é desconhecido. */
  percentual: number | null;
}

export type OuvinteDeProgresso = (p: ProgressoDownload) => void;

function localFileName(storagePath: string): string {
  const safe = storagePath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${CACHE_SUBDIR}/${safe}`;
}

/**
 * PDF em cache começa com "%PDF-"? O download nativo grava o corpo da resposta
 * mesmo quando o servidor devolve erro (JSON/HTML), e esse arquivo falso ficava
 * "salvo no app" para sempre — o visualizador nunca conseguia abrir. Só checa
 * quando conseguimos ler o começo; qualquer falha de leitura conta como válido.
 */
async function pdfEmCacheEhValido(path: string): Promise<boolean> {
  try {
    const { data } = await Filesystem.readFile({ path, directory: CACHE_DIR, offset: 0, length: 8 });
    const bin = atob(typeof data === "string" ? data : "");
    return bin.startsWith("%PDF");
  } catch {
    return true;
  }
}

const ehPdf = (storagePath: string) => /\.pdf$/i.test(storagePath);

/** Já existe em cache local? Devolve a URI pronta pro WebView, ou null. */
async function uriEmCache(path: string): Promise<string | null> {
  try {
    await Filesystem.stat({ path, directory: CACHE_DIR });
    const { uri } = await Filesystem.getUri({ path, directory: CACHE_DIR });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null;
  }
}

/**
 * Baixa direto pelo lado nativo, gravando no disco enquanto recebe.
 *
 * A versão anterior fazia fetch → blob → base64 → writeFile: além de manter o
 * arquivo inteiro na memória duas vezes, mandava uma string base64 (~33%
 * maior que o arquivo) pela ponte JS↔nativo. Num catálogo de 27 MB isso
 * significava ~36 MB de texto atravessando a ponte, o que explicava a demora.
 * `downloadFile` faz tudo no nativo e ainda emite progresso.
 */
async function baixarNativo(
  url: string,
  path: string,
  onProgress?: OuvinteDeProgresso
): Promise<void> {
  const listener = onProgress
    ? await Filesystem.addListener("progress", (status) => {
        // O listener é global do plugin — ignora eventos de outro download
        // que esteja acontecendo em paralelo.
        if (status.url !== url) return;
        const total = status.contentLength || 0;
        onProgress({
          baixado: status.bytes,
          total,
          percentual: total > 0 ? Math.min(100, Math.round((status.bytes / total) * 100)) : null,
        });
      })
    : null;

  // Baixa pra um arquivo temporário e só renomeia no fim: se o app for fechado
  // no meio, sobra um .part (ignorado e sobrescrito depois), nunca um arquivo
  // pela metade que pareceria "já em cache" e abriria corrompido offline.
  const tmp = `${path}.part`;
  try {
    await Filesystem.downloadFile({
      url,
      path: tmp,
      directory: CACHE_DIR,
      progress: !!onProgress,
      recursive: true,
    });
    await Filesystem.deleteFile({ path, directory: CACHE_DIR }).catch(() => {});
    await Filesystem.rename({ from: tmp, to: path, directory: CACHE_DIR, toDirectory: CACHE_DIR });
    if (ehPdf(path) && !(await pdfEmCacheEhValido(path))) {
      await Filesystem.deleteFile({ path, directory: CACHE_DIR }).catch(() => {});
      throw new Error("O servidor não devolveu um PDF válido.");
    }
  } finally {
    await listener?.remove();
  }
}

/** Download no navegador, com progresso lido do corpo da resposta. */
async function baixarNaWeb(url: string, onProgress?: OuvinteDeProgresso): Promise<void> {
  if (!onProgress) return;
  const res = await fetch(url);
  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body?.getReader();
  if (!reader) return;
  let baixado = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    baixado += value?.length ?? 0;
    onProgress({
      baixado,
      total,
      percentual: total > 0 ? Math.min(100, Math.round((baixado / total) * 100)) : null,
    });
  }
}

/**
 * Devolve uma URI pronta pra usar em <img src>/visualizador. Se o arquivo já
 * estiver em cache local no dispositivo, devolve na hora; senão baixa, salva e
 * devolve a URI local. No navegador (sem sistema de arquivos nativo) sempre
 * devolve a própria URL de rede — o cache só faz sentido no app.
 */
export async function getCachedFileUri(
  storagePath: string,
  signedUrl: string,
  onProgress?: OuvinteDeProgresso
): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    await baixarNaWeb(signedUrl, onProgress);
    return signedUrl;
  }

  const path = localFileName(storagePath);

  const emCache = await uriEmCacheValido(path);
  if (emCache) {
    // Já está no dispositivo: avisa como concluído pra barra não ficar parada.
    onProgress?.({ baixado: 1, total: 1, percentual: 100 });
    return emCache;
  }

  await baixarNativo(signedUrl, path, onProgress);

  const { uri } = await Filesystem.getUri({ path, directory: CACHE_DIR });
  return Capacitor.convertFileSrc(uri);
}

/** Já está salvo no dispositivo? Devolve a URI local, ou null se ainda não. */
export async function getCachedUriSePresente(storagePath: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  return uriEmCacheValido(localFileName(storagePath));
}

/** Como uriEmCache, mas descarta (apaga) PDF salvo corrompido para forçar novo download. */
async function uriEmCacheValido(path: string): Promise<string | null> {
  const uri = await uriEmCache(path);
  if (uri && ehPdf(path) && !(await pdfEmCacheEhValido(path))) {
    await Filesystem.deleteFile({ path, directory: CACHE_DIR }).catch(() => {});
    return null;
  }
  return uri;
}

/**
 * Baixa para o cache sem travar a tela.
 *
 * Usado ao abrir um PDF que ainda não está salvo: o visualizador começa a ler
 * direto da rede (o pdf.js pede só os trechos das páginas que aparecem, então
 * a primeira página surge quase na hora, sem esperar dezenas de MB), enquanto
 * a cópia local é baixada por trás para a próxima abertura ser instantânea e
 * funcionar offline.
 */
export function baixarParaCacheEmSegundoPlano(
  storagePath: string,
  signedUrl: string,
  /** Avisa quem chamou quando o cache termina — usado só pra atualizar um
   *  selo de "disponível offline" na tela, nunca pra bloquear nada. */
  onComplete?: () => void
): void {
  if (!Capacitor.isNativePlatform()) return;
  const path = localFileName(storagePath);
  void (async () => {
    try {
      if (await uriEmCacheValido(path)) { onComplete?.(); return; }
      await baixarNativo(signedUrl, path);
      onComplete?.();
    } catch (e) {
      // Sem cache o app segue funcionando (lê da rede) — não vale alertar.
      console.warn("Não foi possível salvar o arquivo em cache:", e);
    }
  })();
}

/** Remove um arquivo do cache local — chamar ao excluir/substituir no Storage,
 *  senão o app continuaria mostrando a versão antiga salva localmente. */
export async function evictCachedFile(storagePath: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Filesystem.deleteFile({ path: localFileName(storagePath), directory: CACHE_DIR });
  } catch {
    // Não estava em cache — sem problema.
  }
}

/**
 * Lê os bytes de um arquivo local direto pelo plugin de arquivos, sem passar
 * pelo fetch do WebView. No iOS o fetch para a URL convertida
 * (capacitor://localhost/_capacitor_file_/…) falha com "TypeError: Load failed",
 * mesmo o arquivo existindo — por isso o visualizador de PDF lê por aqui.
 * Aceita a URL já convertida (convertFileSrc) ou um file://.
 */
export async function lerBytesDeUrlLocal(url: string): Promise<Uint8Array> {
  const marca = "/_capacitor_file_";
  const i = url.indexOf(marca);
  const caminho = i >= 0 ? "file://" + decodeURI(url.slice(i + marca.length)) : url;
  const { data } = await Filesystem.readFile({ path: caminho });
  if (typeof data !== "string") {
    return new Uint8Array(await (data as Blob).arrayBuffer());
  }
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  return bytes;
}

/**
 * Abre a folha de compartilhar do sistema com a cópia salva (Salvar em
 * Arquivos, AirDrop, WhatsApp…). O cache fica na pasta privada do app, que o
 * usuário não enxerga sozinho — "baixar" precisava dar um jeito de levar o
 * arquivo para fora quando ele quiser.
 */
export async function compartilharArquivoDoCache(storagePath: string, nome: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const path = localFileName(storagePath);
  const { uri } = await Filesystem.getUri({ path, directory: CACHE_DIR });
  try {
    await Share.share({ title: nome, files: [uri], dialogTitle: "Salvar ou enviar arquivo" });
  } catch {
    // Folha fechada sem escolher destino — o arquivo continua salvo no app.
  }
}
