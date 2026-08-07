import { supabase } from './supabase';

export type EmailProvider = 'google' | 'microsoft';

export interface EmailMessage {
  id: string;
  from: string;
  fromEmail?: string;
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
  folder: string;
  fullBody?: string;
  isHtml?: boolean;
  to?: string;
  toEmail?: string;
  fullDate?: string;
  attachments?: {
    id: string;
    filename: string;
    mimeType: string;
    size: number; contentId?: string;
  }[];
}

// 1. GERAÇÃO DE URLS DE AUTENTICAÇÃO

// gmail.modify é escopo "restrito" (exige avaliação de segurança CASA paga
// e demorada). O app só lê mensagens/anexos e envia e-mails — não há
// nenhuma chamada de modify/trash/delete na Gmail API — então
// gmail.readonly + gmail.send bastam e são apenas "sensíveis" (verificação
// padrão do Google, sem CASA). Se um dia implementarmos arquivar/excluir
// e-mail de verdade, aí sim precisaria voltar para gmail.modify.
export const GOOGLE_EMAIL_SCOPE = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/directory.readonly'
].join(' ');

export function getGoogleEmailAuthUrl() {
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    redirect_uri: window.location.origin + '/auth/callback/email',
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: GOOGLE_EMAIL_SCOPE
  };
  const qs = new URLSearchParams(options);
  return `${rootUrl}?${qs.toString()}`;
}

export async function getMicrosoftEmailAuthUrl() {
  const { data, error } = await supabase.functions.invoke('microsoft-token', {
    body: { get_client_id: true }
  });
  if (error || !data?.client_id) {
    throw new Error("Não foi possível obter o Client ID da Microsoft: " + (error?.message || "Erro desconhecido"));
  }
  const rootUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
  const options = {
    client_id: data.client_id,
    response_type: 'code',
    redirect_uri: window.location.origin + '/auth/callback/email',
    response_mode: 'query',
    scope: 'offline_access user.read mail.readwrite mail.send contacts.read',
  };
  const qs = new URLSearchParams(options);
  return `${rootUrl}?${qs.toString()}`;
}

// 2. TOKEN MANAGEMENT
async function getValidEmailToken(userId: string, provider: EmailProvider, emailAccount?: string) {
  let query = supabase.from('user_email_tokens').select('*').eq('user_id', userId).eq('provider', provider);
  if (emailAccount) query = query.eq('email_address', emailAccount);
  
  const { data: tokenData, error } = await query.single();
  if (error || !tokenData) return null;

  const now = Math.floor(Date.now() / 1000);
  if (new Date(tokenData.expires_at).getTime() / 1000 > now + 60) return tokenData.access_token;

  if (provider === 'google') {
    try {
      const { refreshGoogleToken } = await import('./googleTokenExchange');
      const newAccessToken = await refreshGoogleToken(tokenData.refresh_token);
      if (newAccessToken) {
        // expires_at é timestamptz: gravar o epoch em segundos estourava o
        // range do Postgres (erro 22008), o update falhava calado e o token
        // era renovado a cada leitura de e-mail.
        const { error: updateError } = await supabase.from('user_email_tokens').update({
          access_token: newAccessToken,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        }).eq('id', tokenData.id);
        if (updateError) console.error("Erro ao gravar o token renovado do Google:", updateError);
        return newAccessToken;
      }
    } catch (e) {
      console.error("Erro ao atualizar token do Google:", e);
    }
    return null;
  }

  try {
    const { data, error } = await supabase.functions.invoke('microsoft-token', {
      body: {
        grant_type: 'refresh_token',
        refresh_token: tokenData.refresh_token
      }
    });
    if (error) throw error;
    if (data && data.access_token) {
      const updatedRefreshToken = data.refresh_token || tokenData.refresh_token;
      // Mesma correção do fluxo do Google: timestamptz, não epoch em segundos.
      const { error: updateError } = await supabase.from('user_email_tokens').update({
        access_token: data.access_token,
        refresh_token: updatedRefreshToken,
        expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
      }).eq('id', tokenData.id);
      if (updateError) console.error("Erro ao gravar o token renovado da Microsoft:", updateError);
      return data.access_token;
    }
  } catch (e) {
    console.error("Erro ao atualizar token da Microsoft via Edge Function:", e);
  }
  return null;
}

// 3. FETCH EMAILS
export async function fetchEmailsFromApi(
  userId: string, 
  provider: EmailProvider, 
  folder: string = 'inbox', 
  pageToken: string | null = null,
  category: string = "",
  emailAccount?: string,
  searchQuery?: string
) {
  const token = await getValidEmailToken(userId, provider, emailAccount);
  if (!token) return { success: false, error: "Token não disponível" };

  if (provider === 'google') {
    try {
      let q = "";
      if (folder === 'inbox') {
        if (category) {
          const catName = category.replace("CATEGORY_", "").toLowerCase();
          q = `label:INBOX category:${catName}`;
        } else {
          // Gmail's 'category:primary' is the best way to get the Primary tab content
          q = "label:INBOX category:primary";
        }
      } else if (folder === 'sent') q = "label:SENT";
      else if (folder === 'trash') q = "label:TRASH";
      else if (folder === 'spam') q = "label:SPAM";
      else if (folder === 'drafts') q = "label:DRAFT";
      else if (folder === 'starred') q = "label:STARRED";
      else if (folder === 'important') q = "label:IMPORTANT";
      else if (folder === 'snoozed') q = "label:SNOOZED";
      else q = "";

      if (searchQuery) q += ` ${searchQuery}`;

      const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      listUrl.searchParams.append('maxResults', '25');
      if (q) listUrl.searchParams.append('q', q);
      if (pageToken) listUrl.searchParams.append('pageToken', pageToken);

      const listRes = await fetch(listUrl.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (listRes.status === 401 || listRes.status === 403) {
        return { success: false, error: "auth_expired" };
      }
      if (!listRes.ok) return { success: false, error: "Erro na API do Gmail (" + listRes.status + ")" };
      const listData = await listRes.json();

      const emailDetails = await Promise.all((listData.messages || []).map(async (msg: any) => {
        try {
          const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!detailRes.ok) return null;
          const detail = await detailRes.json();
          
          const headers = detail.payload.headers || [];
          const findHeader = (n: string) => headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || "";

          let body = "";
          let isHtml = false;
          let attachments: any[] = [];

          const processParts = (parts: any[]) => {
            parts.forEach((part: any) => {
              const partMime = part.mimeType?.toLowerCase();
              
              if (partMime === "text/plain" && !body) {
                if (part.body?.data) {
                  body = base64Decode(part.body.data);
                  isHtml = false;
                }
              } else if (partMime === "text/html") {
                if (part.body?.data) {
                  body = base64Decode(part.body.data);
                  isHtml = true;
                }
              } else if (part.parts) {
                processParts(part.parts);
              }
              
              if (part.filename && part.body?.attachmentId) {
                const findPartHeader = (n: string) => part.headers?.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
                const contentId = findPartHeader("Content-ID").replace(/[<>]/g, "") || findPartHeader("X-Attachment-Id");
                
                attachments.push({
                  id: part.body.attachmentId,
                  filename: part.filename,
                  mimeType: part.mimeType,
                  size: part.body.size || 0,
                  contentId: contentId || undefined
                });
              }
            });
          };

          if (detail.payload.parts) {
            processParts(detail.payload.parts);
          } else if (detail.payload.body?.data) {
            body = base64Decode(detail.payload.body.data);
            isHtml = detail.payload.mimeType === 'text/html';
          }

          const fromValue = findHeader("From");
          const toValue = findHeader("To");
          const fromEmail = fromValue.match(/<(.+?)>/)?.[1] || fromValue;
          const fromName = fromValue.replace(/<.+?>/, "").replace(/"/g, "").trim() || fromEmail;
          const toEmail = toValue.match(/<(.+?)>/)?.[1] || toValue;
          const toName = toValue.replace(/<.+?>/, "").replace(/"/g, "").trim() || toEmail;

          return {
            id: detail.id,
            from: fromName,
            fromEmail: fromEmail,
            to: toName,
            toEmail: toEmail,
            subject: findHeader("Subject") || "(Sem assunto)",
            preview: detail.snippet || "",
            time: formatTime(findHeader("Date")),
            fullDate: findHeader("Date"),
            unread: detail.labelIds?.includes("UNREAD"),
            folder: folder,
            fullBody: body,
            isHtml,
            attachments
          };
        } catch (e) { return null; }
      }));

      return { success: true, emails: emailDetails.filter(e => e !== null), nextPageToken: listData.nextPageToken || null };
    } catch (err: any) {
        console.error(err);
        return { success: false, error: "Falha ao buscar e-mails: " + err.message };
      }
  }
  return { success: false, error: "Provedor não suportado" };
}

// 4. SEND EMAIL
export async function sendEmailViaApi(
  userId: string, 
  provider: EmailProvider, 
  to: string, 
  subject: string, 
  body: string, 
  emailAccount?: string,
  attachments?: { filename: string, content: string, mimeType: string }[]
) {
  const token = await getValidEmailToken(userId, provider, emailAccount);
  if (!token) return { success: false, error: "Token não disponível" };

  if (provider === 'google') {
    try {
      const boundary = "----------" + Math.random().toString(36).substring(2);
      const utf8Subject = `=?utf-8?B?${btoa(new TextEncoder().encode(subject).reduce((p, c) => p + String.fromCharCode(c), "")) }?=`;
      
      let emailLines = [
        `To: ${to}`,
        `Subject: ${utf8Subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body,
        ''
      ];

      if (attachments && attachments.length > 0) {
        attachments.forEach(att => {
          const base64Data = att.content.includes(',') ? att.content.split(',')[1] : att.content;
          
          emailLines.push(`--${boundary}`);
          emailLines.push(`Content-Type: ${att.mimeType}`);
          emailLines.push('MIME-Version: 1.0');
          emailLines.push('Content-Transfer-Encoding: base64');
          emailLines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
          emailLines.push('');
          emailLines.push(base64Data);
          emailLines.push('');
        });
      }

      emailLines.push(`--${boundary}--`);

      const raw = btoa(new TextEncoder().encode(emailLines.join('\r\n')).reduce((p, c) => p + String.fromCharCode(c), ""))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw })
      });
      if (res.ok) return { success: true };
      const errData = await res.json();
      return { success: false, error: errData.error?.message || "Erro no envio" };
    } catch (e: any) { return { success: false, error: e.message }; }
  }
  return { success: false, error: "Provedor não suportado" };
}

// 5. DOWNLOAD ATTACHMENT
export async function downloadAttachmentFromApi(userId: string, provider: EmailProvider, messageId: string, attachmentId: string, emailAccount?: string) {
  const token = await getValidEmailToken(userId, provider, emailAccount);
  if (!token) return { success: false, error: "Token não disponível" };

  if (provider === 'google') {
    try {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return { success: false, error: "Erro ao baixar anexo" };
      const data = await res.json();
      return { success: true, data: data.data };
    } catch (e: any) { return { success: false, error: e.message }; }
  }
  return { success: false, error: "Provedor não suportado" };
}

// 6. CONTACTS
export async function fetchGoogleContacts(userId: string, emailAccount?: string) {
  const token = await getValidEmailToken(userId, 'google', emailAccount);
  if (!token) return [];

  try {
    const contactsMap = new Map<string, string>();
    const headers = { 'Authorization': `Bearer ${token}` };

    // 1. Connections
    try {
      const resConn = await fetch('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=500', { headers });
      if (resConn.ok) {
        const data = await resConn.json();
        (data.connections || []).forEach((p: any) => {
          const name = p.names?.[0]?.displayName;
          const email = p.emailAddresses?.[0]?.value;
          if (email) contactsMap.set(email, name || email);
        });
      }
    } catch (e) {}

    // 2. OtherContacts (Frequent)
    try {
      const resOther = await fetch('https://people.googleapis.com/v1/otherContacts?readMask=names,emailAddresses&pageSize=500', { headers });
      if (resOther.ok) {
        const data = await resOther.json();
        (data.otherContacts || []).forEach((p: any) => {
          const name = p.names?.[0]?.displayName;
          const email = p.emailAddresses?.[0]?.value;
          if (email) contactsMap.set(email, name || email);
        });
      }
    } catch (e) {}

    return Array.from(contactsMap.entries()).map(([email, name]) => ({ name, email }));
  } catch (err) { return []; }
}

// HELPERS
function base64Decode(str: string) {
  try {
    return decodeURIComponent(
      atob(str.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch (e) {
    try {
      return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    } catch (e2) {
      return "";
    }
  }
}

function formatTime(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

