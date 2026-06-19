import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin, type ViteDevServer} from 'vite';

/**
 * Dev-only: serve a função serverless de `api/ai.ts` durante o `npm run dev`.
 * Em produção a Vercel executa essa função sozinha; localmente o Vite puro não,
 * então montamos o app Express como middleware apenas para rotas /api/*.
 */
function devApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api-functions',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // Injeta as variáveis do .env no process.env para a função (GEMINI_API_KEY etc.)
      for (const [key, value] of Object.entries(env)) {
        if (value && process.env[key] === undefined) process.env[key] = value;
      }

      let appPromise: Promise<any> | null = null;
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        if (!appPromise) {
          appPromise = server.ssrLoadModule('/api/ai.ts').then((m) => m.default);
        }
        appPromise
          .then((app) => app(req, res, next))
          .catch((err) => {
            console.error('[dev-api] falha ao processar', req.url, err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: String(err?.message || err) }));
          });
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), devApiPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    build: {
      chunkSizeWarningLimit: 2000,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
