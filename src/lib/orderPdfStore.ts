// Cópia local dos PDFs de pedido gerados pelo app (Novo pedido). No app fica
// gravada no armazenamento privado (Directory.Data), junto do cache de
// arquivos, então abre mesmo sem internet. No navegador não há pasta local:
// o PDF só vive em memória enquanto é mostrado.

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { saveFile } from "./saveFile";

const DIR = Directory.Data;
const SUBDIR = "order_pdfs";

const pathFor = (orderId: string) => `${SUBDIR}/${String(orderId).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result || "").split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Grava (ou sobrescreve) a cópia local. Devolve a URI do WebView, ou null fora do app. */
export async function saveOrderPdfLocal(orderId: string, blob: Blob): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const path = pathFor(orderId);
  await Filesystem.writeFile({ path, directory: DIR, data: await blobToBase64(blob), recursive: true });
  const { uri } = await Filesystem.getUri({ path, directory: DIR });
  return Capacitor.convertFileSrc(uri);
}

/** URI do PDF já guardado no aparelho (pronta pro visualizador), ou null se ainda não existe. */
export async function getOrderPdfLocalUri(orderId: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    await Filesystem.stat({ path: pathFor(orderId), directory: DIR });
    const { uri } = await Filesystem.getUri({ path: pathFor(orderId), directory: DIR });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null;
  }
}

export async function hasOrderPdfLocal(orderId: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await Filesystem.stat({ path: pathFor(orderId), directory: DIR });
    return true;
  } catch {
    return false;
  }
}

/** Abre a folha de compartilhar do sistema (Salvar em Arquivos, WhatsApp, e-mail…) com o PDF. */
export async function shareOrderPdf(orderId: string, blob: Blob | null, fileName: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    if (blob) await saveFile(blob, fileName, "application/pdf");
    return;
  }
  const { uri } = await Filesystem.getUri({ path: pathFor(orderId), directory: DIR });
  await Share.share({ title: fileName, files: [uri], dialogTitle: "Salvar ou enviar PDF" });
}
