import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

// Armazenamento privado do app (Directory.Data) — não exige nenhuma permissão
// de armazenamento no Android e sobrevive entre sessões, então um arquivo já
// aberto uma vez não precisa ser baixado de novo da próxima.
const CACHE_DIR = Directory.Data;
const CACHE_SUBDIR = "file_cache";

function localFileName(storagePath: string): string {
  const safe = storagePath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${CACHE_SUBDIR}/${safe}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove o prefixo "data:<mime>;base64," — Filesystem.writeFile espera só o payload.
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Devolve uma URI pronta pra usar em <img src>/visualizador (já em cache local
 * no dispositivo, se existir) ou baixa da URL assinada, salva localmente e
 * devolve a URI local. No navegador (sem sistema de arquivos nativo) sempre
 * devolve a própria URL de rede — o cache só faz sentido no app.
 */
export async function getCachedFileUri(storagePath: string, signedUrl: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) return signedUrl;

  const path = localFileName(storagePath);

  try {
    await Filesystem.stat({ path, directory: CACHE_DIR });
    const { uri } = await Filesystem.getUri({ path, directory: CACHE_DIR });
    return Capacitor.convertFileSrc(uri);
  } catch {
    // Ainda não está em cache — baixa abaixo.
  }

  const res = await fetch(signedUrl);
  if (!res.ok) return signedUrl;
  const blob = await res.blob();
  const base64 = await blobToBase64(blob);

  await Filesystem.writeFile({ path, directory: CACHE_DIR, data: base64, recursive: true });
  const { uri } = await Filesystem.getUri({ path, directory: CACHE_DIR });
  return Capacitor.convertFileSrc(uri);
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
