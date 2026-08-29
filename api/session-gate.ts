import express from 'express';
import cors from 'cors';
// A extensão .js é obrigatória nos imports relativos: package.json tem
// "type": "module" e a Vercel roda com o resolvedor ESM nativo do Node.
import { corsOriginCheck } from './_lib/cors.js';
import { verifyBearer } from './_lib/verifyJwt.js';
import { acquireSlot, releaseSlot, countActive, SESSION_LIMIT } from './_lib/sessionGate.js';

// Endpoint do teto global de sessões simultâneas (ver api/_lib/sessionGate.ts).
//
//   POST /api/session-gate   { action: 'acquire' }   -> 200 { ok, active, limit } | 503 { ok:false, ... }
//   POST /api/session-gate   { action: 'release' }   -> 204
//   GET  /api/session-gate                           -> 200 { active, limit }  (observabilidade)

const app = express();
app.use(cors({ origin: corsOriginCheck }));
app.use(express.json({ limit: '4kb' }));

app.get('/api/session-gate', async (_req, res) => {
  const r = await countActive();
  return res.status(200).json({ active: r.active, limit: r.limit, degraded: !!r.degraded });
});

app.post('/api/session-gate', async (req, res) => {
  const user = await verifyBearer(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Sessão inválida.' });

  const action = (req.body?.action as string) || 'acquire';

  try {
    if (action === 'release') {
      await releaseSlot(user.id);
      return res.status(204).end();
    }

    // 'acquire' (também usado como heartbeat)
    const r = await acquireSlot(user.id);
    if (!r.ok) {
      // 503 + Retry-After: o app mostra a tela "sistema cheio" e tenta de novo.
      res.setHeader('Retry-After', '15');
      return res.status(503).json({ ok: false, active: r.active, limit: r.limit });
    }
    return res.status(200).json({ ok: true, active: r.active, limit: r.limit, degraded: !!r.degraded });
  } catch (err) {
    console.error('[api/session-gate] erro:', err);
    // Fail-open: erro aqui não pode impedir o usuário de trabalhar.
    return res.status(200).json({ ok: true, active: 0, limit: SESSION_LIMIT, degraded: true });
  }
});

export default app;
