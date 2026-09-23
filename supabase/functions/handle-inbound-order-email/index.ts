// supabase/functions/handle-inbound-order-email/index.ts
//
// Recebe pedidos que uma empresa representada manda por e-mail, usando
// plus-addressing: cada empresa cadastrada em `represented_companies` ganha
// um endereço tipo contato+cosimax@representese.com (uma caixa só de
// verdade — o "+cosimax" é só a etiqueta de roteamento). Um serviço de
// inbound-parse (Mailgun Routes ou SendGrid Inbound Parse) recebe o e-mail
// de verdade e faz o POST pra cá.
//
// Fluxo: identifica a empresa pelo endereço → lê o anexo (ou o corpo do
// e-mail, se não tiver anexo) com a mesma extração de pedido do resto do
// app (_shared/orderExtractionCore.ts) → tenta achar o CNPJ do comprador
// entre os CLIENTES dos vendedores vinculados a essa empresa
// (company_reps) → se achar um só, lança o pedido direto pra ele; se achar
// mais de um (dois vendedores da mesma representada com o mesmo cliente) ou
// nenhum, guarda em `incoming_orders` pra um admin resolver na mão (uma vez
// só — fica lembrado pra sempre em `company_client_resolutions`).
//
// Autenticação do webhook (não tem sessão Supabase, quem chama é o serviço
// de e-mail): aceita OU a assinatura HMAC do Mailgun (timestamp+token+
// signature, verificada com MAILGUN_SIGNING_KEY) OU um segredo simples na
// própria URL (?key=...), configurado como INBOUND_EMAIL_WEBHOOK_SECRET —
// esse segundo caminho existe pra funcionar com qualquer provedor (SendGrid
// Inbound Parse, por exemplo) que deixe você escolher a URL de destino.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts";
import {
  ORDER_EXTRACTION_SYSTEM_INSTRUCTION,
  buildOrderExtractionPrompt,
  extractCNPJLocally,
  extractValueLocally,
  reconcileExtractionResult,
} from "./_shared/orderExtractionCore.ts";
import { salvarItensDoPedido } from "./_shared/orderItems.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const MAILGUN_SIGNING_KEY = Deno.env.get("MAILGUN_SIGNING_KEY");
const INBOUND_EMAIL_WEBHOOK_SECRET = Deno.env.get("INBOUND_EMAIL_WEBHOOK_SECRET");

const STAGING_BUCKET = "company_intake_staging";
const FINAL_BUCKET = "client_vault";
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/* ─────────────────── Autenticação do webhook ─────────────────── */

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEquals(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes);
}

/** true = requisição aceita. Nunca revela QUAL verificação falhou (só existe
 *  um "não autorizado" genérico), pra não virar oráculo de tentativa. */
async function isAuthorizedWebhook(req: Request, form: FormData): Promise<boolean> {
  // Caminho 1: assinatura do Mailgun (timestamp+token+signature nos campos
  // do próprio POST, não em header — é assim que o Mailgun Routes assina).
  const timestamp = form.get("timestamp");
  const token = form.get("token");
  const signature = form.get("signature");
  if (MAILGUN_SIGNING_KEY && typeof timestamp === "string" && typeof token === "string" && typeof signature === "string") {
    const ageMs = Date.now() - Number(timestamp) * 1000;
    // Mailgun recomenda rejeitar assinatura velha — evita replay de um POST
    // capturado antes.
    if (isFinite(ageMs) && ageMs >= 0 && ageMs < 15 * 60 * 1000) {
      const expected = await hmacSha256Hex(MAILGUN_SIGNING_KEY, `${timestamp}${token}`);
      if (constantTimeEquals(expected, signature)) return true;
    }
  }

  // Caminho 2: segredo simples na URL (?key=...) — funciona com qualquer
  // provedor que deixe configurar a URL de destino (ex.: SendGrid Inbound
  // Parse), sem depender de um esquema de assinatura específico.
  if (INBOUND_EMAIL_WEBHOOK_SECRET) {
    const url = new URL(req.url);
    const providedKey = url.searchParams.get("key");
    if (providedKey && constantTimeEquals(providedKey, INBOUND_EMAIL_WEBHOOK_SECRET)) return true;
  }

  return false;
}

/* ─────────────────── Extrair dados do POST do provedor ─────────────────── */

/** O endereço de destino pode vir em campos diferentes conforme o provedor:
 *  Mailgun manda `recipient` (o endereço exato do envelope SMTP); SendGrid
 *  manda `to` (cabeçalho, pode ter nome junto) e também `envelope` (JSON com
 *  o endereço real) — preferimos sempre o envelope/recipient, nunca o
 *  cabeçalho "To" de exibição, porque só o envelope garante o plus-tag. */
function extractRecipient(form: FormData): string {
  const recipient = form.get("recipient");
  if (typeof recipient === "string" && recipient.includes("@")) return recipient;

  const envelope = form.get("envelope");
  if (typeof envelope === "string") {
    try {
      const parsed = JSON.parse(envelope);
      const to = Array.isArray(parsed?.to) ? parsed.to[0] : parsed?.to;
      if (typeof to === "string" && to.includes("@")) return to;
    } catch {
      // segue pro próximo campo
    }
  }

  const to = form.get("to");
  if (typeof to === "string") {
    const match = to.match(/[^\s<>"]+@[^\s<>"]+/);
    if (match) return match[0];
  }

  return "";
}

/** contato+cosimax@representese.com → "cosimax". */
function extractPlusTag(address: string): string {
  const match = address.match(/\+([^@]+)@/);
  return match ? match[1].toLowerCase() : "";
}

function extractMessageId(form: FormData): string {
  const id = form.get("Message-Id") || form.get("message-id") || form.get("Message-Id:") || "";
  if (typeof id === "string" && id.trim()) return id.trim();
  // Sem Message-Id (raro, mas existe) — uma referência ainda assim estável
  // pro MESMO POST, só não protege contra reenvio manual do provedor.
  const recipient = form.get("recipient") || form.get("to") || "";
  const subject = form.get("subject") || "";
  const timestamp = form.get("timestamp") || Date.now().toString();
  return `sem-message-id:${recipient}:${subject}:${timestamp}`.slice(0, 500);
}

function extractBodyText(form: FormData): string {
  const camposDeTexto = ["body-plain", "stripped-text", "text", "body-html", "html"];
  for (const campo of camposDeTexto) {
    const valor = form.get(campo);
    if (typeof valor === "string" && valor.trim()) return valor;
  }
  return "";
}

/** Primeiro anexo com um tipo que a IA consegue ler (imagem ou PDF) — v1
 *  processa só um anexo por e-mail, que é o caso da grande maioria dos
 *  pedidos reais (uma nota, um PDF, uma foto). */
function extractFirstAttachment(form: FormData): File | null {
  for (const [, value] of form.entries()) {
    if (value instanceof File && ALLOWED_MIME.includes(value.type)) {
      return value;
    }
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/* ─────────────────── Gemini ─────────────────── */

async function callGemini(prompt: string, fileBase64: string | null, fileMimeType: string | null): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");

  const parts: any[] = [{ text: prompt }];
  if (fileBase64 && fileMimeType) {
    parts.push({ inlineData: { data: fileBase64, mimeType: fileMimeType } });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ORDER_EXTRACTION_SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini falhou: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
}

/* ─────────────────── Handler ─────────────────── */

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    console.error("[handle-inbound-order-email] payload não é multipart/form-data:", e);
    return new Response(JSON.stringify({ error: "payload inválido" }), { status: 400 });
  }

  if (!(await isAuthorizedWebhook(req, form))) {
    console.warn("[handle-inbound-order-email] tentativa não autorizada");
    return new Response(JSON.stringify({ error: "não autorizado" }), { status: 401 });
  }

  const supabase = supabaseAdmin();

  const recipient = extractRecipient(form);
  const slug = extractPlusTag(recipient);
  if (!slug) {
    console.warn("[handle-inbound-order-email] sem plus-tag no destinatário:", recipient);
    // 200 pra não entrar em fila de retry do provedor — não tem o que refazer aqui.
    return new Response(JSON.stringify({ ok: true, ignored: "sem plus-tag" }), { status: 200 });
  }

  const { data: company } = await supabase
    .from("represented_companies")
    .select("id, name, nome_fantasia, city, state")
    .eq("intake_email_slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (!company) {
    console.warn("[handle-inbound-order-email] nenhuma empresa para o slug:", slug);
    return new Response(JSON.stringify({ ok: true, ignored: "empresa não encontrada" }), { status: 200 });
  }

  const sourceRef = extractMessageId(form);

  // Idempotência: o provedor pode reenviar o mesmo e-mail (timeout, retry).
  const { data: existing } = await supabase
    .from("incoming_orders")
    .select("id")
    .eq("company_id", company.id)
    .eq("source", "email")
    .eq("source_ref", sourceRef)
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
  }

  const attachment = extractFirstAttachment(form);
  const bodyText = extractBodyText(form);

  if (!attachment && !bodyText) {
    await supabase.from("incoming_orders").insert({
      company_id: company.id, source: "email", source_ref: sourceRef,
      status: "error", error_message: "E-mail sem anexo legível e sem texto no corpo.",
    });
    return new Response(JSON.stringify({ ok: true, error: "sem conteúdo" }), { status: 200 });
  }

  // ─────────── Quem vende pra essa empresa, e a carteira de cada um ───────────
  const { data: reps } = await supabase
    .from("company_reps")
    .select("user_id, category_name")
    .eq("company_id", company.id);

  if (!reps || reps.length === 0) {
    await supabase.from("incoming_orders").insert({
      company_id: company.id, source: "email", source_ref: sourceRef,
      status: "error", error_message: "Nenhum representante vinculado a esta empresa.",
    });
    return new Response(JSON.stringify({ ok: true, error: "sem representante vinculado" }), { status: 200 });
  }

  const repUserIds = reps.map((r) => r.user_id);
  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, name, cnpj, user_id")
    .in("user_id", repUserIds);

  const allClients = clientRows || [];

  // ─────────────────── Extração (mesmo motor do resto do app) ───────────────────
  let attachmentBytes: Uint8Array | null = null;
  let attachmentBase64: string | null = null;
  let attachmentMime: string | null = null;
  let attachmentFileName = "";
  if (attachment) {
    attachmentBytes = new Uint8Array(await attachment.arrayBuffer());
    attachmentBase64 = bytesToBase64(attachmentBytes);
    attachmentMime = attachment.type;
    attachmentFileName = attachment.name || "anexo";
  }

  const knownClientNames = allClients.map((c) => c.name).filter(Boolean);
  const textoParaRegex = bodyText || "";
  const localCnpj = extractCNPJLocally(textoParaRegex);
  const localValue = extractValueLocally(textoParaRegex);
  // category já é conhecida com certeza (é a empresa dona deste endereço de
  // e-mail) — não precisamos que a IA adivinhe; usamos como única opção da
  // lista só pra manter o resto da extração (client/cnpj/valor) igual ao
  // resto do app.
  const companyLabel = company.nome_fantasia || company.name;
  const userPrompt = buildOrderExtractionPrompt(textoParaRegex, localCnpj, localValue, [companyLabel], knownClientNames);

  let extraction;
  try {
    const rawText = await callGemini(userPrompt, attachmentBase64, attachmentMime);
    extraction = reconcileExtractionResult(rawText, localCnpj, localValue, "", [companyLabel]);
  } catch (e: any) {
    console.error("[handle-inbound-order-email] IA falhou:", e.message);
    extraction = {
      client: "Desconhecido", cnpj: localCnpj, category: companyLabel, value: localValue,
      address: "", paymentTerms: "", status: "ready" as const, method: "local" as const, items: [],
    };
  }
  // category é sempre a empresa deste endereço — nunca o que a IA "achou".
  extraction.category = companyLabel;

  const cleanCnpj = extraction.cnpj?.replace(/\D/g, "") || "";
  const cleanName = extraction.client?.trim().toLowerCase() || "";

  const matches = allClients.filter((c) => {
    const cCnpj = c.cnpj?.replace(/\D/g, "");
    const cName = c.name?.trim().toLowerCase();
    return (cleanCnpj && cCnpj === cleanCnpj) || (!cleanCnpj && cName && cName === cleanName);
  });
  const distinctUserIds = Array.from(new Set(matches.map((m) => m.user_id)));

  // ─────────────────── Resolve pra qual vendedor vai ───────────────────
  let assignedUserId: string | null = null;
  let assignedClientId: string | null = null;
  let status: "assigned" | "ambiguous" | "no_match" = "no_match";

  if (distinctUserIds.length === 1) {
    assignedUserId = distinctUserIds[0];
    assignedClientId = matches.find((m) => m.user_id === assignedUserId)?.id || null;
    status = "assigned";
  } else if (distinctUserIds.length > 1) {
    if (cleanCnpj) {
      const { data: resolution } = await supabase
        .from("company_client_resolutions")
        .select("resolved_user_id")
        .eq("company_id", company.id)
        .eq("client_cnpj", cleanCnpj)
        .maybeSingle();
      if (resolution && distinctUserIds.includes(resolution.resolved_user_id)) {
        assignedUserId = resolution.resolved_user_id;
        assignedClientId = matches.find((m) => m.user_id === assignedUserId)?.id || null;
        status = "assigned";
      }
    }
    if (!assignedUserId) status = "ambiguous";
  } else {
    status = "no_match";
  }

  const timestamp = Date.now();
  const safeFileName = (attachmentFileName || "pedido.txt")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_");

  if (status !== "assigned" || !assignedUserId || !assignedClientId) {
    // Ambíguo ou sem cliente encontrado — guarda o anexo em staging (se
    // houver) e deixa pendente pro admin resolver.
    let stagingPath: string | null = null;
    if (attachment && attachmentBytes) {
      stagingPath = `${company.id}/email_${sourceRef.replace(/[^\w.-]/g, "_")}/${safeFileName}`;
      await supabase.storage.from(STAGING_BUCKET).upload(stagingPath, attachmentBytes, { contentType: attachmentMime || undefined, upsert: true });
    }

    await supabase.from("incoming_orders").insert({
      company_id: company.id, source: "email", source_ref: sourceRef,
      raw_file_name: attachmentFileName || null, raw_file_path: stagingPath,
      extracted: extraction, matched_client_cnpj: cleanCnpj || null,
      status,
    });

    return new Response(JSON.stringify({ ok: true, status }), { status: 200 });
  }

  // ─────────────────── Lançar o pedido de verdade ───────────────────
  const repInfo = reps.find((r) => r.user_id === assignedUserId);
  const categoryForRep = repInfo?.category_name || companyLabel;

  let filePath: string | null = null;
  if (attachment && attachmentBytes) {
    const formattedName = `${categoryForRep}___VALOR_${extraction.value}___email_${timestamp}_${safeFileName}`;
    filePath = `${assignedUserId}/${assignedClientId}/${formattedName}`;
    await supabase.storage.from(FINAL_BUCKET).upload(filePath, attachmentBytes, { contentType: attachmentMime || undefined, upsert: true });
  }

  const { data: insertedOrder, error: insertError } = await supabase
    .from("orders")
    .insert({
      user_id: assignedUserId,
      client_id: assignedClientId,
      category: categoryForRep,
      value: extraction.value,
      file_name: attachmentFileName || null,
      file_path: filePath,
      source: "company_email_intake",
      payment_terms: extraction.paymentTerms || null,
    })
    .select("id")
    .single();

  if (insertError || !insertedOrder) {
    console.error("[handle-inbound-order-email] falha ao criar pedido:", insertError?.message);
    await supabase.from("incoming_orders").insert({
      company_id: company.id, source: "email", source_ref: sourceRef,
      raw_file_name: attachmentFileName || null, extracted: extraction,
      matched_client_cnpj: cleanCnpj || null, status: "error",
      error_message: insertError?.message || "Erro ao criar pedido.",
    });
    return new Response(JSON.stringify({ ok: false, error: "erro ao criar pedido" }), { status: 200 });
  }

  if (extraction.items?.length) {
    await salvarItensDoPedido(supabase, {
      userId: assignedUserId, orderId: insertedOrder.id, clientId: assignedClientId,
      category: categoryForRep, orderDate: new Date().toISOString(), items: extraction.items,
    });
  }

  const { data: clientData } = await supabase.from("clients").select("faturamento").eq("id", assignedClientId).single();
  if (clientData) {
    const fat = clientData.faturamento || {};
    const atual = Number(fat[categoryForRep]) || 0;
    await supabase.from("clients").update({ faturamento: { ...fat, [categoryForRep]: Math.max(0, atual + extraction.value) } }).eq("id", assignedClientId);
  }

  await supabase.from("incoming_orders").insert({
    company_id: company.id, source: "email", source_ref: sourceRef,
    raw_file_name: attachmentFileName || null, extracted: extraction,
    matched_client_cnpj: cleanCnpj || null, status: "imported",
    assigned_user_id: assignedUserId, order_id: insertedOrder.id,
  });

  return new Response(JSON.stringify({ ok: true, status: "imported" }), { status: 200 });
}

Deno.serve(handler);
