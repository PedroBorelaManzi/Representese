// src/lib/orderIntakeClient.ts
//
// Cliente HTTP fino pro backend do link de "enviar pedido" (api/order-intake.ts).
// Duas formas de autenticação, conforme quem está chamando:
//  - useOwnerAuth: true  → o representante logado (Configurações > Equipe),
//    manda a própria sessão do Supabase.
//  - sessionToken        → o funcionário, já verificado com token+PIN, manda
//    o token de sessão emitido por 'verify' — nunca tem sessão do Supabase.
import { supabase } from './supabase';
import type { ItemExtraido } from './orderExtractionCore';

async function callOrderIntakeApi<T>(
  action: string,
  payload: unknown,
  opts?: { sessionToken?: string; useOwnerAuth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (opts?.useOwnerAuth) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sessão inválida. Faça login novamente.');
    headers.Authorization = `Bearer ${session.access_token}`;
  } else if (opts?.sessionToken) {
    headers.Authorization = `Bearer ${opts.sessionToken}`;
  }

  const response = await fetch('/api/order-intake', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload }),
  });

  // Lê como texto primeiro: uma resposta de erro (502, etc.) pode não ser
  // JSON — mesmo cuidado do geminiProxy.ts, pra não quebrar com mensagem
  // confusa em vez de mostrar o erro de verdade.
  const rawBody = await response.text();
  let data: any = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || `Erro (${response.status}). Tente novamente.`);
  }
  return data as T;
}

export async function setIntakePin(linkId: string, pin: string): Promise<void> {
  await callOrderIntakeApi('set_pin', { linkId, pin }, { useOwnerAuth: true });
}

export interface IntakeClientOption {
  id: string;
  name: string;
  cnpj?: string;
}

export interface VerifyIntakeResult {
  sessionToken: string;
  categories: string[];
  clients: IntakeClientOption[];
}
export async function verifyIntakeLink(token: string, pin: string): Promise<VerifyIntakeResult> {
  return callOrderIntakeApi<VerifyIntakeResult>('verify', { token, pin });
}

export interface ParseIntakeResult {
  status: 'ready' | 'error';
  client?: string;
  cnpj?: string;
  category?: string;
  value?: number;
  address?: string;
  categories: string[];
  clientMatch: { id: string; name: string } | null;
  error?: string;
  /** A própria IA avaliando a confiança de cada campo — usado pra decidir se
   *  mostra um aviso de "confira este valor" em vez de aceitar calado. */
  confidence?: { client?: string; category?: string; value?: string };
  /** Produtos lidos do pedido — repassados de volta em 'submit' pra virarem
   *  order_items (área de Produtos). */
  items?: ItemExtraido[];
}
export async function parseIntakeOrder(
  sessionToken: string,
  payload: { extractedText?: string; imageData?: string; imageMimeType?: string }
): Promise<ParseIntakeResult> {
  return callOrderIntakeApi<ParseIntakeResult>('parse', payload, { sessionToken });
}

export interface PrepareIntakeUploadResult {
  clientId: string;
  filePath: string;
  signedUrl: string;
  uploadToken: string;
  orderId: string;
}
export async function prepareIntakeUpload(
  sessionToken: string,
  payload: {
    clientId?: string;
    newClient?: { name: string; cnpj?: string; address?: string };
    /** CNPJ lido do documento pra gravar no cadastro de um cliente
     *  escolhido manualmente que ainda não tinha CNPJ salvo — é o que faz o
     *  próximo pedido desse cliente já vir reconhecido sozinho. */
    learnCnpj?: string;
    category: string;
    value: number;
    fileName: string;
  }
): Promise<PrepareIntakeUploadResult> {
  return callOrderIntakeApi<PrepareIntakeUploadResult>('prepare_upload', payload, { sessionToken });
}

/** Sobe o arquivo original (sem passar pelo servidor) direto pro Storage,
 *  usando a URL de upload assinada que 'prepare_upload' devolveu. */
export async function uploadIntakeFile(filePath: string, uploadToken: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from('client_vault').uploadToSignedUrl(filePath, uploadToken, file);
  if (error) throw error;
}

export async function submitIntakeOrder(
  sessionToken: string,
  payload: { orderId: string; clientId: string; category: string; value: number; filePath: string; fileName: string; items?: ItemExtraido[] }
): Promise<void> {
  await callOrderIntakeApi('submit', payload, { sessionToken });
}
