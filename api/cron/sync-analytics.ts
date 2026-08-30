import express from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* Sincroniza dados de analytics externos (PostHog, Sentry) para o Postgres do
 * Supabase, para aparecerem na "Ficha Completa" do painel admin sem depender
 * de abrir cada dashboard.
 *
 * Roda como Vercel Cron (ver vercel.json → crons). No plano Hobby o cron
 * dispara 1x por dia. Também dá pra chamar na mão:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/sync-analytics
 *
 * Env vars necessárias (todas opcionais — cada bloco pula sozinho se faltar):
 *   SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL   (já existem)
 *   CRON_SECRET                                    (proteção do endpoint)
 *   POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID   (aba Personal API Keys / Project settings)
 *   POSTHOG_API_HOST                               (default https://us.posthog.com)
 *   SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT  (Settings → Auth Tokens; slugs da org/projeto)
 */

const app = express();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function service(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------- PostHog
async function syncPostHog(db: SupabaseClient): Promise<string> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!key || !projectId) return 'PostHog: pulado (sem POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID)';

  const host = process.env.POSTHOG_API_HOST || 'https://us.posthog.com';
  const hogql = `
    SELECT distinct_id,
           count() AS total,
           countIf(event = '$pageview') AS pageviews,
           countIf(timestamp > now() - INTERVAL 30 DAY) AS sessions_30d,
           min(timestamp) AS first_seen,
           max(timestamp) AS last_seen,
           argMax(properties.$browser, timestamp) AS browser,
           argMax(properties.$os, timestamp) AS os,
           argMax(properties.$geoip_city_name, timestamp) AS city,
           argMax(properties.$geoip_country_name, timestamp) AS country,
           topK(5)(event) AS top_events
    FROM events
    WHERE timestamp > now() - INTERVAL 90 DAY
    GROUP BY distinct_id
    LIMIT 2000`;

  const resp = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
  });
  if (!resp.ok) return `PostHog: erro ${resp.status} — ${(await resp.text()).slice(0, 200)}`;

  const json = (await resp.json()) as { results?: unknown[][] };
  const rows = json.results || [];
  const upserts = rows
    .filter((r) => UUID_RE.test(String(r[0])))
    .map((r) => ({
      user_id: String(r[0]),
      distinct_id: String(r[0]),
      total_events: Number(r[1]) || 0,
      total_pageviews: Number(r[2]) || 0,
      sessions_30d: Number(r[3]) || 0,
      first_seen: r[4] ? new Date(String(r[4])).toISOString() : null,
      last_seen: r[5] ? new Date(String(r[5])).toISOString() : null,
      properties: { $browser: r[6] ?? null, $os: r[7] ?? null, $geoip_city_name: r[8] ?? null, $geoip_country_name: r[9] ?? null },
      top_events: Array.isArray(r[10]) ? (r[10] as string[]).map((event) => ({ event, count: 0 })) : null,
      synced_at: new Date().toISOString(),
    }));

  if (upserts.length === 0) return 'PostHog: 0 pessoas com id de usuário válido';
  const { error } = await db.from('posthog_person_stats').upsert(upserts, { onConflict: 'user_id' });
  if (error) return `PostHog: erro no upsert — ${error.message}`;
  return `PostHog: ${upserts.length} usuários sincronizados`;
}

// ---------------------------------------------------------------- Sentry
async function syncSentry(db: SupabaseClient): Promise<string> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!token || !org || !project) return 'Sentry: pulado (sem SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT)';

  type SentryEvent = {
    title?: string;
    dateCreated?: string;
    groupID?: string;
    'event.type'?: string;
    user?: { id?: string } | null;
    tags?: { key: string; value: string }[];
  };

  const perUser = new Map<string, { total: number; last_at: string | null; last_title: string | null; issues: Map<string, { title: string; count: number }> }>();
  let url: string | null =
    `https://sentry.io/api/0/projects/${org}/${project}/events/?statsPeriod=30d&full=true`;
  let pages = 0;

  while (url && pages < 5) {
    const resp: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return `Sentry: erro ${resp.status} — ${(await resp.text()).slice(0, 200)}`;
    const events = (await resp.json()) as SentryEvent[];

    for (const ev of events) {
      const uid =
        ev.user?.id ||
        ev.tags?.find((t) => t.key === 'user' || t.key === 'user.id')?.value;
      if (!uid || !UUID_RE.test(uid)) continue;
      const bucket =
        perUser.get(uid) || { total: 0, last_at: null, last_title: null, issues: new Map() };
      bucket.total += 1;
      if (!bucket.last_at || (ev.dateCreated && ev.dateCreated > bucket.last_at)) {
        bucket.last_at = ev.dateCreated || bucket.last_at;
        bucket.last_title = ev.title || bucket.last_title;
      }
      if (ev.groupID) {
        const iss = bucket.issues.get(ev.groupID) || { title: ev.title || 'erro', count: 0 };
        iss.count += 1;
        bucket.issues.set(ev.groupID, iss);
      }
      perUser.set(uid, bucket);
    }

    const link = resp.headers.get('link') || '';
    const next = link.split(',').find((p) => p.includes('rel="next"'));
    url = next && next.includes('results="true"') ? next.slice(next.indexOf('<') + 1, next.indexOf('>')) : null;
    pages += 1;
  }

  const upserts = Array.from(perUser.entries()).map(([user_id, b]) => ({
    user_id,
    errors_30d: b.total,
    total_errors: b.total,
    last_error_at: b.last_at ? new Date(b.last_at).toISOString() : null,
    last_error_title: b.last_title,
    top_issues: Array.from(b.issues.values()).sort((a, z) => z.count - a.count).slice(0, 5),
    synced_at: new Date().toISOString(),
  }));

  if (upserts.length === 0) return 'Sentry: 0 erros com id de usuário nos últimos 30 dias';
  const { error } = await db.from('sentry_user_stats').upsert(upserts, { onConflict: 'user_id' });
  if (error) return `Sentry: erro no upsert — ${error.message}`;
  return `Sentry: ${upserts.length} usuários sincronizados`;
}

// ---------------------------------------------------------------- handler
app.all('/api/cron/sync-analytics', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'não autorizado' });
  }

  const db = service();
  if (!db) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY ausente' });

  const resultados: string[] = [];
  for (const fn of [syncPostHog, syncSentry]) {
    try {
      resultados.push(await fn(db));
    } catch (e) {
      resultados.push(`${fn.name}: exceção — ${(e as Error).message}`);
    }
  }

  return res.status(200).json({ ok: true, em: new Date().toISOString(), resultados });
});

export default app;
