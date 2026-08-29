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
      // Sentry (~147 KB gzip) e PostHog são carregados de propósito só no
      // primeiro idle (ver src/main.tsx). Sem tirá-los da lista de
      // modulepreload, o Vite baixava os dois já no boot, competindo por
      // banda com o que a primeira pintura precisa — anulando o adiamento.
      modulePreload: {
        resolveDependencies: (_file, deps) =>
          deps.filter((d) => !/[\\/]assets[\\/](sentry|posthog)-/.test(d)),
      },
      rollupOptions: {
        output: {
          // Separa libs pesadas do chunk principal: páginas sem animações não
          // pagam o custo de framer-motion no primeiro load.
          //
          // recharts saiu daqui de propósito: forçar o chunk colocava
          // vendor-charts no modulepreload do index.html, então TODO visitante
          // da landing baixava ~106 KB de biblioteca de gráficos usada só em
          // /dashboard/admin/analytics. Sem a entrada, o Rollup separa sozinho
          // junto do lazy() da página.
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
            // framer-motion saiu do manualChunks: com o Layout agora lazy e o
            // uso de motion concentrado em páginas/modais lazy, deixar o Rollup
            // dividir sozinho evita que o chunk nomeado 'vendor-motion' fosse
            // parar no modulepreload do index.html por causa de um único
            // símbolo puxado pela árvore de entrada (~46 KB gzip no 1º load da
            // landing por nada).
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
