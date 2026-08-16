import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/**
 * Salva um arquivo gerado no próprio app (Excel, CSV, PDF de relatório).
 *
 * No navegador: download normal, o navegador cuida do resto.
 *
 * No app: o Android não tem uma janela "Salvar como" que um app possa abrir
 * sozinho — quem oferece o destino (Drive, Arquivos, WhatsApp, e-mail) é a
 * folha de compartilhamento do sistema. Por isso o arquivo é gravado numa
 * pasta que o sistema consegue compartilhar e a folha é aberta em seguida:
 * é assim que o usuário escolhe onde o arquivo vai parar. Antes disso, o
 * `<a download>` simplesmente não fazia nada de útil dentro da WebView.
 */
export async function saveFile(blob: Blob, fileName: string, mimeType?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  // Cache: some sozinho quando o sistema limpa espaço e não polui a pasta de
  // documentos do usuário com cópias intermediárias — o arquivo que ele
  // guardar de verdade é o que sair da folha de compartilhamento.
  const path = `exports/${sanitizeFileName(fileName)}`;
  const base64 = await blobToBase64(blob);

  await Filesystem.writeFile({
    path,
    directory: Directory.Cache,
    data: base64,
    recursive: true,
  });

  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });

  await Share.share({
    title: fileName,
    files: [uri],
    dialogTitle: "Salvar ou enviar arquivo",
  });
}

/** Salva um texto puro (CSV) reaproveitando o fluxo acima. */
export async function saveTextFile(text: string, fileName: string, mimeType = "text/plain"): Promise<void> {
  return saveFile(new Blob([text], { type: mimeType }), fileName, mimeType);
}

/** Nomes de arquivo com barra ou caractere estranho quebram o caminho no
 *  Filesystem — normaliza mantendo a extensão legível. */
export function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim() || "arquivo";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Reexporta para quem precisar gravar texto direto sem passar por Blob.
export { Encoding };
