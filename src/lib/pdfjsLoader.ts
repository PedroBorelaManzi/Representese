// pdfjs (~1,3 MB) só é carregado quando um PDF é de fato aberto ou
// processado, não junto com o chunk das páginas que importam este módulo.
export async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}
