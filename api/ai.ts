import express from 'express';
import cors from 'cors';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';
// A extensão .js é obrigatória aqui: o package.json tem "type": "module",
// então a Vercel roda estas funções com o resolvedor nativo de ESM do
// Node — que, ao contrário do bundler do Vite, não aceita import relativo
// sem extensão. Sem ela, a função inteira crasha no cold start com
// ERR_MODULE_NOT_FOUND antes de responder a qualquer requisição.
import { corsOriginCheck } from './_lib/cors.js';
import { extrairUsuario } from './_lib/authUser.js';

const app = express();

app.use(cors({ origin: corsOriginCheck }));

// Limite elevado para aceitar imagens (pedido por foto) em base64.
// A Vercel ainda limita o corpo a ~4,5MB; o cliente comprime antes de enviar.
app.use(express.json({ limit: '10mb' }));

let ratelimit: Ratelimit | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, '60 s')
  });
} else {
  // Sem isso, a chamada à IA fica sem limite nenhum e o erro só aparece como
  // custo inesperado da API do Gemini — nunca como um log óbvio. Em produção
  // as env vars do Upstash devem estar sempre configuradas.
  console.error(
    'ATENÇÃO: UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN não configuradas — ' +
    'rate limit da IA está DESLIGADO. Qualquer usuário autenticado pode chamar o Gemini sem limite.'
  );
}

app.use(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase config missing' });
  }

  try {
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      // Auth fora do ar não pode segurar a função serverless até o limite da Vercel
      signal: AbortSignal.timeout(10_000),
    });

    if (!authRes.ok) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // O /auth/v1/user devolve o usuário na RAIZ do JSON, não em `user`. Ler
    // `corpo.user` dava undefined: aqui isso passava despercebido só porque
    // o rate limit está desligado (sem UPSTASH configurado) e ninguém mais
    // usa req.user — no dia em que o Upstash fosse ligado, `user.id` estouraria
    // e derrubaria TODA a IA com "Auth check failed". Ver api/_lib/authUser.ts.
    const user = extrairUsuario(await authRes.json().catch(() => null));
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    (req as any).user = user;

    if (ratelimit) {
      const { success } = await ratelimit.limit(user.id);
      if (!success) {
        return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
      }
    }
    
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Auth check failed' });
  }
});

/**
 * Detecta erros transitórios do Gemini que valem a pena repetir:
 * 503 (sobrecarga), 429 (rate limit do Google) e 500 (erro interno momentâneo).
 */
function isTransientGeminiError(error: any): boolean {
  const msg = String(error?.message || error || '');
  return /\b(503|429|500)\b/.test(msg) ||
    /service unavailable|overloaded|currently experiencing|try again|internal error/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Só os modelos que o produto realmente usa. Sem isso, qualquer usuário
// autenticado podia apontar payload.model para um modelo mais caro (Pro etc.)
// e a conta da API pagava a diferença.
const ALLOWED_MODELS = new Set(['gemini-2.5-flash']);
const resolveModel = (requested?: string): string => {
  const model = requested || 'gemini-2.5-flash';
  return ALLOWED_MODELS.has(model) ? model : 'gemini-2.5-flash';
};

/**
 * Executa uma chamada ao Gemini com tentativas automáticas.
 * Em erros transitórios (503/429/500), espera com backoff exponencial e tenta de novo.
 * Erros definitivos (400, chave inválida, etc.) sobem na hora.
 */
async function withGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt === maxAttempts || !isTransientGeminiError(error)) throw error;
      // backoff: 500ms, 1s, 2s (+ jitter) — dá tempo do modelo desafogar
      const delay = 500 * 2 ** (attempt - 1) + Math.random() * 300;
      await sleep(delay);
    }
  }
  throw lastError;
}

app.post('/api/ai', async (req, res) => {
  const { action, payload } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  try {
    if (action === 'geocode') {
      const { address, name, cnpj, razaoSocial, nomeFantasia, city, state, cep } = payload;
      const prompt = `Você é um geocodificador especialista em empresas brasileiras. Pense passo a passo antes de responder.

DADOS DA EMPRESA:
Razão Social: ${razaoSocial || name || "Não informado"}
Nome Fantasia: ${nomeFantasia || "Não informado"}
CNPJ: ${cnpj || "Não informado"}
CEP: ${cep || "Não informado"}
Endereço: ${address || "Não informado"}
Cidade: ${city || "Não informado"}
Estado (UF): ${state || "Não informado"}

RACIOCÍNIO (faça mentalmente antes de responder):
1. Você conhece esta empresa pelo CNPJ ou razão social no seu treinamento? Se sim, qual é o endereço registrado?
2. O CEP informado corresponde a qual logradouro? Use-o para confirmar a rua.
3. Qual a latitude/longitude do endereço identificado?
4. Esta coordenada está dentro da cidade "${city || "informada"}" e do estado "${state || "informado"}"? Se não, descarte.

REGRAS ABSOLUTAS:
- Coordenadas DEVEM estar no território brasileiro: lat entre -34 e 6, lng entre -74 e -28.
- Coordenadas DEVEM pertencer à cidade "${city || "informada"}". Se não tiver certeza da cidade, retorne null.
- Jamais retorne a coordenada de uma cidade diferente da informada.
- Prefira retornar null a retornar uma coordenada errada.

RESPOSTA — somente JSON puro, sem markdown, sem explicação:
{"lat": -00.00000, "lng": -00.00000}
ou null`;

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await withGeminiRetry(() => model.generateContent(prompt));
      const responseText = result.response.text();

      let cleanJson = responseText.trim();
      if (responseText.includes("{")) {
         cleanJson = responseText.substring(responseText.indexOf("{"), responseText.lastIndexOf("}") + 1);
      }
      
      try {
        const coords = JSON.parse(cleanJson);
        if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
          return res.status(200).json(coords);
        }
      } catch (e) {}

      return res.status(200).json(null);
    }

    if (action === 'opencage') {
      const apiKey = process.env.OPENCAGE_API_KEY;
      if (!apiKey) return res.status(200).json(null); // chave não configurada: pula silenciosamente

      const { query, cep, city, state } = payload;

      // Prefere busca por CEP quando disponível (mais preciso)
      const searchQuery = cep ? `${cep} Brasil` : query;

      try {
        const ocRes = await fetch(
          `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(searchQuery)}&key=${apiKey}&countrycode=br&limit=1&language=pt&no_annotations=1`,
          { headers: { "User-Agent": "RepresenteSeGeocoding/1.0" } }
        );
        if (!ocRes.ok) return res.status(200).json(null);

        const ocData = await ocRes.json();
        const result = ocData?.results?.[0];
        if (!result) return res.status(200).json(null);

        const lat = result.geometry?.lat;
        const lng = result.geometry?.lng;

        if (typeof lat !== "number" || typeof lng !== "number") return res.status(200).json(null);

        // Valida que está dentro do Brasil
        if (lat < -34 || lat > 6 || lng < -74 || lng > -28) return res.status(200).json(null);

        // Valida que o resultado pertence à cidade esperada (quando disponível)
        if (city) {
          const resultCity = (result.components?.city || result.components?.town || result.components?.municipality || "").toLowerCase();
          const expectedCity = city.toLowerCase();
          if (resultCity && !resultCity.includes(expectedCity) && !expectedCity.includes(resultCity)) {
            return res.status(200).json(null);
          }
        }

        return res.status(200).json({ lat, lng });
      } catch {
        return res.status(200).json(null);
      }
    }

    if (action === 'gemini_proxy') {
      const { contents, model: modelName, systemInstruction, generationConfig } = payload;
      const modelConfig: any = { model: resolveModel(modelName) };
      if (systemInstruction) modelConfig.systemInstruction = systemInstruction;
      if (generationConfig) modelConfig.generationConfig = generationConfig;
      const model = genAI.getGenerativeModel(modelConfig);
      const result = await withGeminiRetry(() => model.generateContent({ contents }));
      return res.status(200).json({ text: result.response.text() });
    }

    if (action === 'gemini_text' || action === 'gemini_system') {
      const { prompt, systemInstruction } = payload;

      const modelConfig: any = { model: resolveModel(payload?.model) };
      if (systemInstruction) {
        modelConfig.systemInstruction = systemInstruction;
      }

      const model = genAI.getGenerativeModel(modelConfig);
      const result = await withGeminiRetry(() => model.generateContent(prompt));
      return res.status(200).json({ text: result.response.text() });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error: any) {
    // Erro transitório que sobreviveu às tentativas → 503 + mensagem amigável
    if (isTransientGeminiError(error)) {
      return res.status(503).json({
        error: 'A IA está sobrecarregada no momento. Tente novamente em alguns segundos.',
      });
    }
    // Detalhe fica no log do servidor; o cliente recebe mensagem genérica
    // (error.message cru vazava internals do SDK/infra para o navegador).
    console.error('[api/ai] erro não transitório:', error);
    return res.status(500).json({ error: 'Erro interno ao processar a solicitação de IA.' });
  }
});

export default app;
