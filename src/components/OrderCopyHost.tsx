import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PdfViewerModal } from "./PdfViewerModal";
import { OPEN_ORDER_COPY_EVENT } from "../lib/openOrderCopy";
import { obterBytesArquivo } from "../lib/fileCache";
import { prepareOrderPdf } from "../lib/orderPdfLoad";
import { montarFichaPedido } from "../lib/fichaPedido";
import { saveFile } from "../lib/saveFile";

type Aberto = {
  name: string;
  url: string;
  data?: Uint8Array;
  path?: string;
  baixar: () => Promise<void>;
  dispose?: () => void;
};

/** Abre a cópia do pedido: o arquivo original (PDF anexado), senão o PDF gerado com os produtos, senão a ficha. */
export default function OrderCopyHost() {
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const ocupado = useRef(false);

  useEffect(() => {
    const abrir = async (ev: Event) => {
      const order = (ev as CustomEvent).detail;
      if (!order?.id || ocupado.current) return;
      ocupado.current = true;
      const toastId = toast.loading("Abrindo a cópia do pedido...");
      try {
        if (order.file_path) {
          const nome = order.file_name || "pedido.pdf";
          const bytes = await obterBytesArquivo("client_vault", order.file_path);
          const baixar = async () => {
            await saveFile(new Blob([bytes.slice()], { type: "application/pdf" }), nome.split("___").pop() || nome, "application/pdf");
          };
          setAberto({ name: nome, url: "", data: bytes, path: order.file_path, baixar });
          return;
        }
        // Pedido feito no app: PDF com os produtos (guardado no aparelho ou gerado na hora).
        const view = await prepareOrderPdf(order.id).catch(() => null);
        if (view) {
          setAberto({
            name: view.fileName,
            url: view.url,
            baixar: () => view.share(),
            dispose: view.dispose,
          });
          return;
        }
        // Sem arquivo e sem produtos (importado de relatório): ficha com os dados que existem.
        const ficha = await montarFichaPedido(order);
        setAberto({ name: ficha.nome, url: "", data: ficha.bytes, baixar: () => saveFile(ficha.blob, ficha.nome, "application/pdf") });
      } catch (e: any) {
        console.error("Erro ao abrir a cópia do pedido:", e);
        toast.error(`Não foi possível abrir a cópia: ${e?.message || e}`, { duration: 8000 });
      } finally {
        toast.dismiss(toastId);
        ocupado.current = false;
      }
    };
    window.addEventListener(OPEN_ORDER_COPY_EVENT, abrir);
    return () => window.removeEventListener(OPEN_ORDER_COPY_EVENT, abrir);
  }, []);

  const fechar = () => {
    aberto?.dispose?.();
    setAberto(null);
  };

  return (
    <PdfViewerModal
      isOpen={!!aberto}
      onClose={fechar}
      url={aberto?.url || null}
      data={aberto?.data ?? null}
      fileName={aberto?.name}
      storagePath={aberto?.path}
      onDownload={() => { aberto?.baixar().catch((e: any) => toast.error(`Não foi possível salvar: ${e?.message || e}`)); }}
    />
  );
}
