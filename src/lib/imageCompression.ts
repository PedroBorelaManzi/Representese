// src/lib/imageCompression.ts
//
// Comprime/redimensiona uma imagem pra caber no limite de corpo das funções
// serverless da Vercel (~4,5MB) — uma foto de celular sem compressão estoura
// isso fácil. Também normaliza HEIC (foto de iPhone) e PNG pesado para JPEG.
// Extraído de AssistenteIA.tsx pra poder ser usado também pela tela de
// enviar pedido por link (src/pages/OrderIntake.tsx), sem duplicar a lógica.
export interface CompressedImage {
  dataUrl: string;
  base64: string;
  mime: string;
}

export function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.8
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.split(",")[1] || "";
        URL.revokeObjectURL(objectUrl);
        resolve({ dataUrl, base64, mime: "image/jpeg" });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não consegui ler essa imagem."));
    };
    img.src = objectUrl;
  });
}
