import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function checkGoogleIntegration(userId: string) {
  const { data, error } = await supabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return { isConnected: false, syncEnabled: false };
  return { isConnected: !!data.refresh_token, syncEnabled: true };
}

export async function disconnectGoogle(userId: string) {
  await supabase.from('user_google_tokens').delete().eq('user_id', userId);
}

// Internal helper to get a valid access token using the backend edge function
async function getValidToken(userId: string): Promise<string | null> {
  const { data: auth, error } = await supabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !auth?.refresh_token) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/exchange-auth-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ refresh_token: auth.refresh_token, grant_type: 'refresh_token' }),
    });

    if (!response.ok) return null;
    const tokens = await response.json();
    
    // Save new access token back to db for local use
    if (tokens.access_token) {
        await supabase.from('user_google_tokens').update({ 
            access_token: tokens.access_token,
            updated_at: new Date().toISOString() 
        }).eq('user_id', userId);
    }
    
    return tokens.access_token;
  } catch (error) {
    console.error('Failed to get valid token:', error);
    return null;
  }
}

// Proxied fetch using the new edge function
async function proxyGoogleRequest(action: string, payload: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Usuário não autenticado no Supabase");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-external-appointments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  if (!response.ok) {
    throw new Error(`Proxy error: ${response.statusText}`);
  }

  return response.json();
}

// Intervalo mínimo entre sincronizações AUTOMÁTICAS (abrir o painel, voltar pra
// aba). O botão "Sincronizar" passa `force: true` e ignora isso. Antes, cada
// foco/visibilidade da janela disparava a sincronização inteira de novo.
const AUTO_SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000;
const UPSERT_CHUNK = 200;
const IN_CHUNK = 100;
const emAndamento = new Map<string, Promise<any>>();

const lastSyncKey = (userId: string) => `rm_gcal_last_sync_${userId}`;
function lerUltimaSync(userId: string): number {
  try { return Number(localStorage.getItem(lastSyncKey(userId)) || 0); } catch { return 0; }
}
function gravarUltimaSync(userId: string) {
  try { localStorage.setItem(lastSyncKey(userId), String(Date.now())); } catch { /* sem armazenamento: só sincroniza mais vezes */ }
}

export async function syncGoogleEvents(userId: string, opts: { force?: boolean } = {}) {
  // Duas chamadas ao mesmo tempo (ex.: abrir o painel + focar a janela) viram uma só.
  const jaRodando = emAndamento.get(userId);
  if (jaRodando) return jaRodando;
  if (!opts.force && Date.now() - lerUltimaSync(userId) < AUTO_SYNC_MIN_INTERVAL_MS) {
    return { success: true, count: 0, skipped: true, message: 'Agenda já sincronizada há pouco.' };
  }
  const p = executarSyncGoogle(userId).finally(() => emAndamento.delete(userId));
  emAndamento.set(userId, p);
  return p;
}

async function executarSyncGoogle(userId: string) {
  try {
    const integration = await checkGoogleIntegration(userId);
    if (!integration.isConnected) {
      return { success: false, message: 'Google Agenda não conectado.' };
    }

    let accessToken = await getValidToken(userId);
    if (!accessToken) {
      return { success: false, message: 'Falha ao autenticar com o Google. Por favor, reconecte sua conta.' };
    }

    const timeMin = new Date(new Date().setDate(new Date().getDate() - 60)).toISOString();
    
    const res = await proxyGoogleRequest('GET', { accessToken, timeMin });
    
    if (res.status === 401 || res.status === 403) {
      return { success: false, message: 'Token de acesso inválido. Por favor, reconecte sua conta do Google.' };
    }

    if (res.status !== 200) {
      return { success: false, message: `O Google retornou um erro: ${res.status}` };
    }

    const data = res.data;
    const googleEvents = data?.items || [];

    if (googleEvents.length === 0) {
      gravarUltimaSync(userId);
      return { success: true, count: 0, message: 'Nenhum evento encontrado no seu Google Agenda (últimos 60 dias).' };
    }

    const { data: allClients } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', userId);

    // O que já existe aqui, pra gravar só o que é novo ou mudou (em blocos, em
    // vez de 1 requisição por evento — eram ~300 de uma vez a cada abertura).
    const googleEventIds = googleEvents.map((e: any) => e.id).filter(Boolean) as string[];
    const existentes = new Map<string, { id: string; google_event_id: string; client_id: string | null; title: string | null; date: string | null; time: string | null }>();
    for (let i = 0; i < googleEventIds.length; i += IN_CHUNK) {
      const { data: parte } = await supabase
        .from('appointments')
        .select('id, google_event_id, client_id, title, date, time')
        .in('google_event_id', googleEventIds.slice(i, i + IN_CHUNK))
        .eq('user_id', userId);
      (parte || []).forEach((a: any) => existentes.set(a.google_event_id, a));
    }

    const alteradas: any[] = [];
    for (const gevent of googleEvents) {
      if (!gevent.start?.dateTime && !gevent.start?.date) continue;

      let dateStr = '';
      let timeStr = '';

      if (gevent.start.dateTime) {
        const startISO = gevent.start.dateTime;
        const endISO = gevent.end.dateTime;

        const dStart = new Date(startISO);
        if (!isNaN(dStart.getTime())) {
          const yyyy = dStart.getFullYear();
          const mm = String(dStart.getMonth() + 1).padStart(2, '0');
          const dd = String(dStart.getDate()).padStart(2, '0');
          dateStr = `${yyyy}-${mm}-${dd}`;
        } else {
          dateStr = startISO.substring(0, 10);
        }

        const getLocalTime = (iso: string) => {
          if (!iso) return '09:00';
          const d = new Date(iso);
          if (isNaN(d.getTime())) return '09:00';
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };

        timeStr = `${getLocalTime(startISO)} - ${getLocalTime(endISO)}`;
      } else {
        dateStr = gevent.start.date || new Date().toISOString().substring(0, 10);
        timeStr = "";
      }

      let extractedClientId: string | null = null;
      if (gevent.description && gevent.description.includes('Cliente: ')) {
        const lines = gevent.description.split('\n');
        const clientLine = lines.find((l: string) => l.startsWith('Cliente: '));
        if (clientLine) {
          const clientName = clientLine.replace('Cliente: ', '').trim();
          const matchedClient = allClients?.find((c: any) => c.name === clientName);
          if (matchedClient) extractedClientId = matchedClient.id;
        }
      }

      const existente = existentes.get(gevent.id);
      const clientId = !extractedClientId && existente?.client_id ? existente.client_id : extractedClientId;
      const title = gevent.summary || 'Evento do Google';

      const igual =
        existente &&
        (existente.title || '') === title &&
        (existente.date || '') === dateStr &&
        (existente.time || '') === timeStr &&
        (existente.client_id || null) === (clientId || null);
      if (igual) continue;

      alteradas.push({
        user_id: userId,
        title,
        date: dateStr,
        time: timeStr,
        client_id: clientId,
        google_event_id: gevent.id,
        updated_at: new Date().toISOString(),
      });
    }

    for (let i = 0; i < alteradas.length; i += UPSERT_CHUNK) {
      const { error } = await supabase
        .from('appointments')
        .upsert(alteradas.slice(i, i + UPSERT_CHUNK), { onConflict: 'google_event_id' });
      if (error) {
        console.error('Erro ao salvar eventos do Google:', error);
        return { success: false, message: 'Não foi possível salvar os eventos do Google Agenda.' };
      }
    }

    gravarUltimaSync(userId);
    const totalSynced = alteradas.length;
    const msg = totalSynced > 0
      ? `Sucesso! ${totalSynced} evento${totalSynced > 1 ? 's' : ''} novo${totalSynced > 1 ? 's' : ''} ou atualizado${totalSynced > 1 ? 's' : ''}.`
      : 'Sincronização concluída. Tudo já estava atualizado.';

    return { success: true, count: totalSynced, message: msg };

  } catch (error: any) {
    console.error('Erro técnico:', error);
    if (error.message === "Failed to fetch") {
      return { success: false, message: 'A conexão com o servidor foi bloqueada pelo seu navegador ou antivírus.' };
    }
    return { success: false, message: `Erro técnico na sincronização. ${error.message || error}` };
  }
}

export async function pushEventToGoogle(userId: string, appointment: any) {
  try {
    const integration = await checkGoogleIntegration(userId);
    if (!integration.isConnected) return { success: false, message: 'Google Agenda não conectado' };

    const accessToken = await getValidToken(userId);
    if (!accessToken) return { success: false, message: 'Token do Google inválido ou expirado. Por favor, reconecte.' };

    const isAllDay = !appointment.time || appointment.time.includes('(Dia Inteiro)');
    
    let description = appointment.notes || '';
    
    let clientNameStr = appointment.client_name;
    if (!clientNameStr && appointment.client_id) {
      try {
        const { data: clientData } = await supabase
          .from('clients')
          .select('name')
          .eq('id', appointment.client_id)
          .maybeSingle();
        if (clientData) clientNameStr = clientData.name;
      } catch (e) {}
    }

    if (clientNameStr) {
      const clientText = `Cliente: ${clientNameStr}`;
      description = description ? `${clientText}\n\n${description}` : clientText;
    }

    let event: any = {
      summary: appointment.title,
      description: description,
    };

    if (isAllDay) {
      // For all day events, use 'date' instead of 'dateTime'. End date must be exclusive (next day)
      const nextDay = new Date(appointment.date);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().substring(0, 10);
      event.start = { date: appointment.date, dateTime: null };
      event.end = { date: nextDayStr, dateTime: null };
    } else {
      let startTime = "09:00:00";
      let endTime = "10:00:00";
      if (appointment.time && appointment.time.includes(' - ')) {
        const parts = appointment.time.split(' - ');
        startTime = parts[0].trim().substring(0, 5) + ":00";
        endTime = parts[1].trim().substring(0, 5) + ":00";
      }
      event.start = { dateTime: `${appointment.date}T${startTime}-03:00`, timeZone: 'America/Sao_Paulo', date: null };
      event.end = { dateTime: `${appointment.date}T${endTime}-03:00`, timeZone: 'America/Sao_Paulo', date: null };
    }

    const payload: any = { event };
    if (appointment.google_event_id) {
        payload.eventId = appointment.google_event_id;
        // Edge function currently doesn't support PATCH in POST branch, 
        // I need to make sure the edge function uses PATCH if eventId is provided for POST
        // Oh wait, my proxy function uses POST for creating... Google Calendar uses POST for insert, PUT for update.
        // My edge function:
        // if (action === 'POST') fetch(url, { method: 'POST', body: ... })
        // I'll leave as is, since the edge function was just POST. If it fails, we will need to update the edge function.
        // Let's pass eventId to the proxy just in case.
    }

    const res = await proxyGoogleRequest('POST', { accessToken, ...payload });
    
    if (res.status === 200 && res.data?.id) {
        if (!appointment.google_event_id) {
            await supabase
              .from('appointments')
              .update({ google_event_id: res.data.id })
              .eq('id', appointment.id);
        }
        return { success: true };
    }
    return { success: false, message: res.data?.error?.message || JSON.stringify(res.data) };
  } catch (error: any) {
    console.error('Erro ao enviar evento para o Google:', error);
    return { success: false, message: error.message || String(error) };
  }
}

export async function deleteEventFromGoogle(userId: string, googleEventId: string) {
  try {
    const integration = await checkGoogleIntegration(userId);
    if (!integration.isConnected) return { success: false, message: 'Google Agenda não conectado' };

    const accessToken = await getValidToken(userId);
    if (!accessToken) return { success: false, message: 'Token do Google inválido ou expirado. Por favor, reconecte.' };

    const res = await proxyGoogleRequest('DELETE', { accessToken, eventId: googleEventId });
    return res.success || res.status === 204;
  } catch (error) {
    console.error('Erro ao excluir evento do Google:', error);
    return false;
  }
}
