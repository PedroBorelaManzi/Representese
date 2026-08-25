import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';
// A extensão .js é obrigatória em todos os imports relativos abaixo: o
// package.json tem "type": "module", então a Vercel roda estas funções com
// o resolvedor nativo de ESM do Node — que, ao contrário do bundler do
// Vite, não aceita import relativo sem extensão. Sem ela, a função inteira
// crasha no cold start com ERR_MODULE_NOT_FOUND antes de responder a
// qualquer requisição (é o que estava derrubando 100% das chamadas a este
// endpoint desde que ele foi criado).
import { corsOriginCheck } from './_lib/cors.js';
import { hashPin, verifyPin, isValidPinFormat } from './_lib/pinHash.js';
import { signSession, verifySession } from './_lib/sessionToken.js';
import {
  ORDER_EXTRACTION_SYSTEM_INSTRUCTION,
  buildOrderExtractionPrompt,
  extractCNPJLocally,
  extractCategoryLocally,
  extractValueLocally,
  reconcileExtractionResult,
} from '../src/lib/orderExtractionCore.js';
import { ajustarFaturamento } from '../src/lib/faturamento.js';

/**
 * Backend do link de "enviar pedido" (funcionário sem login na conta real —
 * ver src/pages/OrderIntake.tsx). Duas formas de autenticação convivem aqui:
 *
 *  - 'set_pin' exige uma sessão Supabase de verdade (o DONO da conta,
 *    gerenciando o próprio link pelas Configurações).
 *  - 'verify'/'parse'/'prepare_upload'/'submit' NÃO usam sessão Supabase
 *    nenhuma — o funcionário nunca tem uma. A identidade dele é o par
 *    token+PIN (uma vez, em 'verify') e depois um token de sessão assinado
 *    (api/_lib/sessionToken.ts) enviado como Bearer nas chamadas seguintes.
 *
 * Erros de autenticação/PIN sempre devolvem a MESMA mensagem genérica —
 * "link não existe", "link desativado" e "PIN errado" não podem ser
 * distinguíveis de fora, senão viram um jeito de enumerar/adivinhar.
 */

const app = express();
app.use(cors({ origin: corsOriginCheck }));
app.use(express.json({ limit: '10mb' }));

const BUCKET = 'client_vault';
const GENERIC_AUTH_ERROR = 'Link ou PIN inválido.';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function getServiceClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role não configurado no servidor.');
  return createClient(url, key, { auth: { persistSession: false } });
}

function getSessionSecret(): string {
  const secret = process.env.ORDER_INTAKE_SESSION_SECRET;
  if (!secret) throw new Error('ORDER_INTAKE_SESSION_SECRET não configurado no servidor.');
  return secret;
}

function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

let verifyTokenLimiter: Ratelimit | null = null;
let verifyIpLimiter: Ratelimit | null = null;
let parseLimiter: Ratelimit | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = Redis.fromEnv();
  verifyTokenLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '15 m'), prefix: 'order-intake-verify-token' });
  verifyIpLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '15 m'), prefix: 'order-intake-verify-ip' });
  parseLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '10 m'), prefix: 'order-intake-parse' });
} else {
  // Sem isso, o PIN de 6 dígitos (1 milhão de combinações) fica só protegido
  // pelo travamento no banco (5 erradas) — ainda funciona, mas o Upstash é a
  // primeira linha de defesa contra tentativa em massa. Mesmo aviso alto que
  // api/ai.ts já dá pro rate limit da IA.
  console.error(
    'ATENÇÃO: UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN não configuradas — ' +
    'rate limit do link de enviar pedido está DESLIGADO no nível de rede.'
  );
}

/** Valida o Bearer do DONO da conta (mesma checagem de api/ai.ts) — só usada
 *  por 'set_pin', onde quem chama é o representante logado de verdade. */
async function requireOwnerAuth(req: express.Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader) { console.error('[requireOwnerAuth] sem header Authorization'); return null; }
  const token = authHeader.replace('Bearer ', '');
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[requireOwnerAuth] env ausente: url=%s anonKey=%s', !!supabaseUrl, !!supabaseAnonKey);
    return null;
  }

  try {
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!authRes.ok) {
      // Corpo do erro do GoTrue ajuda a distinguir token expirado de
      // apikey rejeitada — nenhum dos dois é exposto ao cliente (a rota
      // sempre devolve "Sessão inválida." genérico), só fica no log.
      const corpo = await authRes.text().catch(() => '');
      console.error('[requireOwnerAuth] /auth/v1/user recusou: status=%d corpo=%s', authRes.status, corpo.slice(0, 300));
      return null;
    }
    const { user } = await authRes.json();
    return user || null;
  } catch (e) {
    console.error('[requireOwnerAuth] exceção ao validar token:', e);
    return null;
  }
}

interface IntakeSession {
  linkId: string;
  linkLabel: string;
  ownerId: string;
  supabase: SupabaseClient;
}

/** Valida o token de sessão do funcionário E reconfirma no banco que o link
 *  segue ativo e o PIN não mudou desde que a sessão foi emitida — é isso que
 *  faz "desativar link" / "trocar PIN" cortar o acesso na hora, mesmo pra
 *  quem já tinha "entrado" antes. Em caso de falha, já escreve a resposta de
 *  erro e devolve null; quem chama só precisa checar `if (!session) return;`. */
async function requireIntakeSession(req: express.Request, res: express.Response): Promise<IntakeSession | null> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const payload = verifySession(token, getSessionSecret());
  if (!payload) {
    res.status(401).json({ error: 'Sessão expirada. Digite o PIN novamente.' });
    return null;
  }

  const supabase = getServiceClient();
  const { data: link } = await supabase
    .from('order_intake_links')
    .select('id, user_id, active, session_epoch, label')
    .eq('id', payload.linkId)
    .maybeSingle();

  if (!link || !link.active || link.session_epoch !== payload.sessionEpoch) {
    res.status(401).json({ error: 'Sessão expirada. Digite o PIN novamente.' });
    return null;
  }

  return { linkId: link.id, linkLabel: link.label, ownerId: link.user_id, supabase };
}

async function handleSetPin(req: express.Request, res: express.Response, payload: any) {
  const user = await requireOwnerAuth(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida.' });

  const { linkId, pin } = payload || {};
  if (!isValidPinFormat(pin)) return res.status(400).json({ error: 'PIN deve ter 6 dígitos numéricos.' });

  const supabase = getServiceClient();
  const { data: link } = await supabase
    .from('order_intake_links')
    .select('id, user_id, session_epoch')
    .eq('id', linkId)
    .maybeSingle();

  if (!link || link.user_id !== user.id) return res.status(404).json({ error: 'Link não encontrado.' });

  const { error } = await supabase
    .from('order_intake_links')
    .update({ pin_hash: hashPin(pin), session_epoch: link.session_epoch + 1, updated_at: new Date().toISOString() })
    .eq('id', linkId);

  if (error) return res.status(500).json({ error: 'Erro ao salvar PIN.' });
  return res.status(200).json({ ok: true });
}

async function handleVerify(req: express.Request, res: express.Response, payload: any) {
  const { token, pin } = payload || {};
  if (!token || !pin) return res.status(400).json({ error: GENERIC_AUTH_ERROR });

  if (verifyTokenLimiter) {
    const { success } = await verifyTokenLimiter.limit(token);
    if (!success) return res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
  }
  if (verifyIpLimiter) {
    const { success } = await verifyIpLimiter.limit(getClientIp(req));
    if (!success) return res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
  }

  const supabase = getServiceClient();
  const { data: link } = await supabase
    .from('order_intake_links')
    .select('id, user_id, pin_hash, active, failed_attempts, locked_until, session_epoch')
    .eq('token', token)
    .maybeSingle();

  if (!link || !link.active || !link.pin_hash) {
    return res.status(401).json({ error: GENERIC_AUTH_ERROR });
  }

  if (link.locked_until && new Date(link.locked_until).getTime() > Date.now()) {
    return res.status(423).json({ error: GENERIC_AUTH_ERROR });
  }

  if (!verifyPin(pin, link.pin_hash)) {
    const attempts = (link.failed_attempts || 0) + 1;
    const update: Record<string, unknown> = { failed_attempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      update.locked_until = new Date(Date.now() + LOCKOUT_MS).toISOString();
      update.failed_attempts = 0;
    }
    await supabase.from('order_intake_links').update(update).eq('id', link.id);
    return res.status(401).json({ error: GENERIC_AUTH_ERROR });
  }

  await supabase
    .from('order_intake_links')
    .update({ failed_attempts: 0, locked_until: null, last_used_at: new Date().toISOString() })
    .eq('id', link.id);

  const { data: settings } = await supabase.from('user_settings').select('categories').eq('user_id', link.user_id).maybeSingle();

  const sessionToken = signSession({ linkId: link.id, ownerId: link.user_id, sessionEpoch: link.session_epoch }, getSessionSecret());
  return res.status(200).json({ sessionToken, categories: settings?.categories || [] });
}

async function handleParse(req: express.Request, res: express.Response, payload: any) {
  const session = await requireIntakeSession(req, res);
  if (!session) return;

  if (parseLimiter) {
    const { success } = await parseLimiter.limit(session.linkId);
    if (!success) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um pouco.' });
  }

  const { extractedText = '', imageData, imageMimeType } = payload || {};
  if (!extractedText && !imageData) return res.status(400).json({ error: 'Arquivo vazio ou não suportado.' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'IA não configurada no servidor.' });

  const { data: settingsRow } = await session.supabase
    .from('user_settings')
    .select('categories')
    .eq('user_id', session.ownerId)
    .maybeSingle();
  const categories: string[] = settingsRow?.categories || [];

  const localCnpj = extractCNPJLocally(extractedText);
  const localValue = extractValueLocally(extractedText);
  const localCategory = extractCategoryLocally(extractedText, categories);
  const userPrompt = buildOrderExtractionPrompt(extractedText, localCnpj, localValue, categories);

  let rawText = '';
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: ORDER_EXTRACTION_SYSTEM_INSTRUCTION,
    });
    const parts: any[] = [{ text: userPrompt }];
    if (imageData && imageMimeType) parts.push({ inlineData: { data: imageData, mimeType: imageMimeType } });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json' },
    } as any);
    rawText = result.response.text();
  } catch (err) {
    console.warn('[order-intake parse] IA falhou:', err);
    // Foto não tem NENHUMA extração local (orderExtractionCore não lê texto
    // de imagem) — sem a IA não sobra nada útil pra devolver. Documento de
    // texto (PDF/planilha) ainda cai pro modo local abaixo.
    if (imageData && !extractedText) {
      return res.status(200).json({ status: 'error', error: 'ai_failed', categories });
    }
    rawText = '{}';
  }

  const extraction = reconcileExtractionResult(rawText, localCnpj, localValue, localCategory, categories);

  // Mesma regra de match do resto do app (Pedidos.tsx): só exato (CNPJ ou
  // nome idênticos) auto-seleciona; qualquer outra coisa vira "cliente novo"
  // pro funcionário conferir, nunca um cadastro escondido.
  let clientMatch: { id: string; name: string } | null = null;
  const cleanCnpj = extraction.cnpj?.replace(/\D/g, '');
  const cleanName = extraction.client?.trim().toLowerCase();
  if (cleanCnpj || cleanName) {
    const { data: clientsRows } = await session.supabase
      .from('clients')
      .select('id, name, cnpj')
      .eq('user_id', session.ownerId);
    const match = (clientsRows || []).find((c: any) => {
      const cCnpj = c.cnpj?.replace(/\D/g, '');
      const cName = c.name?.trim().toLowerCase();
      return (cleanCnpj && cCnpj === cleanCnpj) || (cName && cName === cleanName);
    });
    if (match) clientMatch = { id: match.id, name: match.name };
  }

  return res.status(200).json({ ...extraction, categories, clientMatch });
}

async function handlePrepareUpload(req: express.Request, res: express.Response, payload: any) {
  const session = await requireIntakeSession(req, res);
  if (!session) return;

  const { clientId, newClient, category, value, fileName } = payload || {};
  if (!category || !value || !fileName) return res.status(400).json({ error: 'Dados incompletos.' });

  let finalClientId: string | undefined = clientId || undefined;

  // O clientId vem do navegador do funcionário (foi ele quem escolheu o
  // "match" que a IA sugeriu) — sem essa checagem, um clientId de OUTRA
  // conta (adivinhado ou reaproveitado de outra sessão) criaria um pedido
  // referenciando um cliente que não é do dono deste link.
  if (finalClientId) {
    const { data: ownedClient } = await session.supabase
      .from('clients').select('id').eq('id', finalClientId).eq('user_id', session.ownerId).maybeSingle();
    if (!ownedClient) return res.status(400).json({ error: 'Cliente inválido.' });
  }

  if (!finalClientId && newClient?.name) {
    // Dedupe antes de criar — mesma checagem de registerNewClient em
    // Pedidos.tsx, pra dois pedidos seguidos do mesmo cliente novo não
    // criarem dois cadastros.
    const cleanCnpj = newClient.cnpj ? String(newClient.cnpj).replace(/\D/g, '') : '';
    const cleanName = String(newClient.name).trim();

    if (cleanCnpj) {
      const { data: existing } = await session.supabase
        .from('clients').select('id').eq('cnpj', cleanCnpj).eq('user_id', session.ownerId).maybeSingle();
      if (existing) finalClientId = existing.id;
    }
    if (!finalClientId && cleanName) {
      const { data: existingName } = await session.supabase
        .from('clients').select('id').eq('name', cleanName).eq('user_id', session.ownerId).maybeSingle();
      if (existingName) finalClientId = existingName.id;
    }
    if (!finalClientId) {
      // Sem geocodificação nesta v1 (exigiria duplicar a chamada de IA de
      // geocode aqui) — cai na mesma coordenada padrão que o resto do app já
      // usa quando a geocodificação falha; o representante ajusta o pino
      // depois pelo mapa, como faria de qualquer forma nesse caso.
      const { data: created, error } = await session.supabase
        .from('clients')
        .insert([{ user_id: session.ownerId, name: cleanName, cnpj: cleanCnpj, address: newClient.address || '', lat: -23.5505, lng: -46.6333, status: 'Ativo' }])
        .select('id')
        .single();
      if (error || !created) return res.status(500).json({ error: 'Erro ao cadastrar cliente.' });
      finalClientId = created.id;
    }
  }

  if (!finalClientId) return res.status(400).json({ error: 'Selecione ou cadastre um cliente.' });

  const cleanFileName = String(fileName).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
  const formattedName = `${category}___VALOR_${value}___${cleanFileName}`;
  const filePath = `${session.ownerId}/${finalClientId}/${formattedName}`;

  const { data: signedUpload, error: signError } = await session.supabase.storage.from(BUCKET).createSignedUploadUrl(filePath);
  if (signError || !signedUpload) return res.status(500).json({ error: 'Erro ao preparar o envio do arquivo.' });

  return res.status(200).json({
    clientId: finalClientId,
    filePath,
    signedUrl: signedUpload.signedUrl,
    uploadToken: signedUpload.token,
    orderId: randomUUID(),
  });
}

async function handleSubmit(req: express.Request, res: express.Response, payload: any) {
  const session = await requireIntakeSession(req, res);
  if (!session) return;

  const { orderId, clientId, category, value, filePath, fileName } = payload || {};
  if (!orderId || !clientId || !category || !value || !filePath) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }
  // O caminho no Storage sempre começa com o id do dono do link — se não
  // bater, é sinal de um filePath adulterado entre o prepare_upload e aqui.
  if (!String(filePath).startsWith(`${session.ownerId}/`)) {
    return res.status(400).json({ error: 'Caminho de arquivo inválido.' });
  }

  // Idempotência: reenvio depois de uma conexão que caiu no meio não pode
  // duplicar o pedido nem somar o faturamento duas vezes.
  const { data: existingOrder } = await session.supabase.from('orders').select('id').eq('id', orderId).maybeSingle();
  if (existingOrder) return res.status(200).json({ ok: true });

  // Mesma checagem de prepare_upload, repetida aqui de propósito: o clientId
  // que chega neste payload passou pelo navegador do funcionário entre as
  // duas chamadas, então não dá pra confiar cegamente que segue sendo o
  // mesmo cliente já validado como do dono do link.
  const { data: ownedClient } = await session.supabase
    .from('clients').select('id').eq('id', clientId).eq('user_id', session.ownerId).maybeSingle();
  if (!ownedClient) return res.status(400).json({ error: 'Cliente inválido.' });

  const numericValue = parseFloat(value);

  const { error: insertError } = await session.supabase.from('orders').insert([{
    id: orderId,
    user_id: session.ownerId,
    client_id: clientId,
    category,
    value: numericValue,
    file_name: fileName || String(filePath).split('/').pop(),
    file_path: filePath,
    source: 'order_intake_link',
    intake_link_label: session.linkLabel,
  }]);

  if (insertError) {
    // Corrida rara: outra chamada com o mesmo orderId inseriu entre o SELECT
    // acima e este INSERT — trata como já concluído, não como erro.
    if ((insertError as any).code === '23505') return res.status(200).json({ ok: true });
    return res.status(500).json({ error: 'Erro ao registrar pedido.' });
  }

  const { data: clientData } = await session.supabase.from('clients').select('faturamento').eq('id', clientId).single();
  if (clientData) {
    const updatedFat = ajustarFaturamento(clientData.faturamento, category, numericValue);
    await session.supabase.from('clients').update({ faturamento: updatedFat }).eq('id', clientId);
  }

  return res.status(200).json({ ok: true });
}

app.post('/api/order-intake', async (req, res) => {
  const { action, payload } = req.body || {};
  try {
    if (action === 'set_pin') return await handleSetPin(req, res, payload);
    if (action === 'verify') return await handleVerify(req, res, payload);
    if (action === 'parse') return await handleParse(req, res, payload);
    if (action === 'prepare_upload') return await handlePrepareUpload(req, res, payload);
    if (action === 'submit') return await handleSubmit(req, res, payload);
    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (err) {
    console.error('[api/order-intake] erro:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

export default app;
