// api/_lib/cors.ts
//
// Lista de origens permitidas, compartilhada entre api/ai.ts e
// api/order-intake.ts — extraída pra nunca ficar uma cópia desatualizada
// enquanto a outra é ajustada (essa lista é sensível: é ela que decide quem
// pode chamar o backend).
export const ALLOWED_ORIGINS = [
  'https://www.representese.com',
  'https://representese.com',
  'http://localhost:3000',
];

export function isOriginAllowed(origin: string | undefined): boolean {
  return (
    !origin ||
    ALLOWED_ORIGINS.includes(origin) ||
    /\.representese\.com$/.test(origin) || // qualquer subdomínio (www, app, etc.)
    // Só previews DESTE projeto (representese-*.vercel.app) — antes qualquer
    // site *.vercel.app podia chamar a API (defesa em profundidade).
    /^https:\/\/representese[a-z0-9-]*\.vercel\.app$/.test(origin) ||
    origin.startsWith('capacitor://') || // app nativo iOS
    origin === 'http://localhost' || // app nativo Android
    origin === 'https://localhost' // app nativo
  );
}

export function corsOriginCheck(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (isOriginAllowed(origin)) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
}
