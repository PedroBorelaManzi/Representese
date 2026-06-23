import { supabase } from './supabase';

interface GeminiProxyRequest {
  contents: Array<{
    role: string;
    parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
  }>;
  model: string;
  systemInstruction?: string;
  generationConfig?: Record<string, unknown>;
}

/**
 * Calls the Gemini API through our secure Express backend.
 * The API key never leaves the server.
 */
export async function callGeminiProxy(request: GeminiProxyRequest, signal?: AbortSignal): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Usuario nao autenticado.");
  }

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action: 'gemini_proxy',
      payload: request
    }),
    signal,
  });

  // Lê o corpo como texto primeiro: respostas de erro (413, 502, etc.) podem
  // não ser JSON, e fazer response.json() direto quebraria com erro confuso
  // ("The string did not match the expected pattern" no Safari).
  const rawBody = await response.text();
  let data: any = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error("A imagem é muito grande. Tente uma foto menor ou com menos qualidade.");
    }
    throw new Error(data.error || `Erro na IA (${response.status}). Tente novamente.`);
  }

  return data.text || "";
}

/**
 * Simple text-only Gemini call through the proxy.
 */
export async function geminiText(prompt: string, model = "gemini-2.5-flash"): Promise<string> {
  return callGeminiProxy({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    model,
  });
}

/**
 * Gemini call with system instruction and optional image data.
 */
export async function geminiWithSystem(
  prompt: string,
  systemInstruction: string,
  options?: {
    model?: string;
    imageData?: string;
    imageMimeType?: string;
    generationConfig?: Record<string, unknown>;
    signal?: AbortSignal;
  }
): Promise<string> {
  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [
    { text: prompt },
  ];

  if (options?.imageData && options?.imageMimeType) {
    parts.push({
      inlineData: { data: options.imageData, mimeType: options.imageMimeType },
    });
  }

  return callGeminiProxy({
    contents: [{ role: "user", parts }],
    model: options?.model || "gemini-2.5-flash",
    systemInstruction,
    generationConfig: options?.generationConfig,
  }, options?.signal);
}
