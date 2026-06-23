import express from 'express';
import cors from 'cors';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();

const allowedOrigins = [
  'https://www.representese.com',
  'https://representese.com',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    const ok =
      !origin ||
      allowedOrigins.includes(origin) ||
      /\.representese\.com$/.test(origin) ||   // qualquer subdomínio (www, app, etc.)
      /\.vercel\.app$/.test(origin) ||         // deploys de preview da Vercel
      origin.startsWith('capacitor://') ||     // app nativo iOS
      origin === 'http://localhost' ||         // app nativo Android
      origin === 'https://localhost';          // app nativo
    if (ok) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

let ratelimit: Ratelimit | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, '60 s')
  });
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
    });

    if (!authRes.ok) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const { user } = await authRes.json();
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
      const result = await model.generateContent(prompt);
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
      const modelConfig: any = { model: modelName || 'gemini-2.5-flash' };
      if (systemInstruction) modelConfig.systemInstruction = systemInstruction;
      if (generationConfig) modelConfig.generationConfig = generationConfig;
      const model = genAI.getGenerativeModel(modelConfig);
      const result = await model.generateContent({ contents });
      return res.status(200).json({ text: result.response.text() });
    }

    if (action === 'gemini_text' || action === 'gemini_system') {
      const { prompt, systemInstruction } = payload;
      const modelName = payload?.model || "gemini-2.5-flash";
      
      const modelConfig: any = { model: modelName };
      if (systemInstruction) {
        modelConfig.systemInstruction = systemInstruction;
      }
      
      const model = genAI.getGenerativeModel(modelConfig);
      const result = await model.generateContent(prompt);
      return res.status(200).json({ text: result.response.text() });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default app;
