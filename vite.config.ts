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

/**
 * Inlina o CSS principal (~27 KB gzip) direto no <head> como <style>, em vez de
 * um <link rel="stylesheet"> externo. O PageSpeed marcava a folha de estilo
 * como "render-blocking resource": o navegador não pinta nada até baixá-la.
 * Inline, o CSS já chega junto do HTML (mesma resposta, gzipada pela Vercel) —
 * some da lista de recursos que bloqueiam a primeira pintura, sem risco de FOUC
 * de um carregamento assíncrono. Só o CSS de rotas lazy (ex.: Map/Leaflet)
 * continua em arquivo separado, carregado sob demanda.
 */
function inlineCssPlugin(): Plugin {
  return {
    name: 'inline-critical-css',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      const linkRe = /<link[^>]+rel="stylesheet"[^>]+href="\/([^"]+\.css)"[^>]*>/;
      const m = html.match(linkRe);
      if (!m || !ctx.bundle) return html;
      const asset = ctx.bundle[m[1]];
      if (!asset || asset.type !== 'asset') return html;
      const css = String(asset.source);
      // Só inlina se for pequeno o suficiente pra valer a pena (guarda-chuva
      // caso o CSS cresça muito no futuro — aí volta a compensar o arquivo).
      if (css.length > 300_000) return html;
      delete ctx.bundle[m[1]];
      return html.replace(linkRe, `<style>${css}</style>`);
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), devApiPlugin(env), inlineCssPlugin()],
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
      // Sentry (~147 KB gzip) e PostHog (~50 KB gzip) são carregados de
      // propósito só no primeiro idle (ver src/main.tsx / src/lib/*). Sem
      // tirá-los da lista de modulepreload, o Vite baixava os dois já no boot,
      // competindo por banda com o que a primeira pintura precisa.
      modulePreload: {
        resolveDependencies: (_file, deps) =>
          deps.filter((d) => !/[\\/]assets[\\/]vendor-(sentry|posthog)-/.test(d)),
      },
      rollupOptions: {
        output: {
          // recharts NÃO entra aqui de propósito: forçar o chunk colocava
          // vendor-charts no modulepreload do index.html, então TODO visitante
          // da landing baixava ~106 KB de gráficos usados só em
          // /dashboard/admin/analytics. Sem a entrada, o Rollup separa sozinho
          // junto do lazy() da página. Mesma lógica pro framer-motion.
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (/[\\/]@sentry[\\/]/.test(id)) return 'vendor-sentry';
            if (/[\\/]posthog-js[\\/]/.test(id)) return 'vendor-posthog';
            if (/[\\/]react-router|[\\/]react-dom[\\/]|[\\/]react[\\/]/.test(id)) return 'vendor-react';
            if (/[\\/]@supabase[\\/]/.test(id)) return 'vendor-supabase';
            // lucide-react: ~150 ícones distintos no app viravam ~150 chunks
            // minúsculos (um por ícone), cada um com seu <link modulepreload>.
            // Junta num chunk só — o Rollup ainda só inclui os ícones de fato
            // importados (tree-shake), então continua sendo o subconjunto usado.
            if (/[\\/]lucide-react[\\/]/.test(id)) return 'vendor-icons';
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
