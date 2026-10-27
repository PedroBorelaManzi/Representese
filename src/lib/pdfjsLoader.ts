// pdfjs (~1,3 MB) só é carregado quando um PDF é de fato aberto ou
// processado, não junto com o chunk das páginas que importam este módulo.
//
// `legacy` troca para o build de compatibilidade do pdfjs (transpilado, sem
// APIs novas como Promise.try / Map.getOrInsert). O worker roda num contexto
// separado, que não recebe os polyfills do app — num WKWebView mais antigo o
// build moderno pode falhar só lá dentro. O visualizador tenta o moderno e,
// se falhar, cai para este.
export async function loadPdfjs(legacy = false) {
  if (legacy) {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs as unknown as typeof import("pdfjs-dist");
  }
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}
