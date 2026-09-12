// supabase/functions/resolve-incoming-order/index.ts
//
// Usado só pela tela de admin (AdminCompanies.tsx) pra resolver um pedido
// capturado por e-mail/Drive que ficou "ambiguous" — dois vendedores da
// MESMA empresa representada têm um cliente com o mesmo CNPJ cadastrado
// (ex.: dois representantes da mesma fábrica atendendo o mesmo depósito).
// O admin escolhe pra qual vendedor vai; se marcar "lembrar", a escolha
// fica salva em company_client_resolutions e todo pedido futuro desse
// CNPJ+empresa cai direto nesse vendedor, sem perguntar de novo.
//
// Só aceita quem é admin da plataforma (user_settings.is_admin) — verificado
// aqui dentro, não só por RLS, porque a partir daqui a function passa a usar
// a service role (que ignora RLS) pra fazer as escritas de verdade (criar o
// pedido, mover o arquivo do staging pro client_vault, atualizar
// faturamento).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { salvarItensDoPedido } from "./_shared/orderItems.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STAGING_BUCKET = "company_intake_staging";
const FINAL_BUCKET = "client_vault";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: corsHeaders });
  }

  const supabase = admin();

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return new Response(JSON.stringify({ error: "Não autorizado." }), { status: 401, headers: corsHeaders });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401, headers: corsHeaders });
  }

  const { data: callerSettings } = await supabase.from("user_settings").select("is_admin").eq("user_id", user.id).maybeSingle();
  if (!callerSettings?.is_admin) {
    return new Response(JSON.stringify({ error: "Acesso restrito ao admin." }), { status: 403, headers: corsHeaders });
  }

  const { incomingOrderId, assignedUserId, remember } = await req.json().catch(() => ({}));
  if (!incomingOrderId || !assignedUserId) {
    return new Response(JSON.stringify({ error: "Dados incompletos." }), { status: 400, headers: corsHeaders });
  }

  const { data: incoming } = await supabase
    .from("incoming_orders")
    .select("id, company_id, source, extracted, matched_client_cnpj, raw_file_name, raw_file_path, status")
    .eq("id", incomingOrderId)
    .maybeSingle();

  if (!incoming) return new Response(JSON.stringify({ error: "Pedido pendente não encontrado." }), { status: 404, headers: corsHeaders });
  if (incoming.status === "imported") {
    return new Response(JSON.stringify({ ok: true, already: true }), { status: 200, headers: corsHeaders });
  }

  const { data: repLink } = await supabase
    .from("company_reps")
    .select("category_name")
    .eq("company_id", incoming.company_id)
    .eq("user_id", assignedUserId)
    .maybeSingle();
  if (!repLink) {
    return new Response(JSON.stringify({ error: "Esse vendedor não está vinculado a esta empresa." }), { status: 400, headers: corsHeaders });
  }

  const cleanCnpj = (incoming.matched_client_cnpj || "").replace(/\D/g, "");
  if (!cleanCnpj) {
    return new Response(JSON.stringify({ error: "Pedido sem CNPJ de cliente identificado — resolva direto no cadastro do vendedor." }), { status: 400, headers: corsHeaders });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, faturamento")
    .eq("user_id", assignedUserId)
    .eq("cnpj", cleanCnpj)
    .maybeSingle();
  if (!client) {
    return new Response(JSON.stringify({ error: "Esse vendedor não tem um cliente com esse CNPJ cadastrado." }), { status: 400, headers: corsHeaders });
  }

  const extraction = incoming.extracted || {};
  const category = repLink.category_name;
  const value = Number(extraction.value) || 0;

  let filePath: string | null = null;
  if (incoming.raw_file_path) {
    const { data: fileData } = await supabase.storage.from(STAGING_BUCKET).download(incoming.raw_file_path);
    if (fileData) {
      const ext = incoming.raw_file_name || incoming.raw_file_path.split("/").pop() || "arquivo";
      filePath = `${assignedUserId}/${client.id}/${category}___VALOR_${value}___${incoming.source}_${Date.now()}_${ext}`;
      await supabase.storage.from(FINAL_BUCKET).upload(filePath, fileData, { upsert: true });
      await supabase.storage.from(STAGING_BUCKET).remove([incoming.raw_file_path]);
    }
  }

  const { data: insertedOrder, error: insertError } = await supabase
    .from("orders")
    .insert({
      user_id: assignedUserId,
      client_id: client.id,
      category,
      value,
      file_name: incoming.raw_file_name || null,
      file_path: filePath,
      source: incoming.source === "email" ? "company_email_intake" : "company_drive_intake",
      payment_terms: extraction.paymentTerms || null,
    })
    .select("id")
    .single();

  if (insertError || !insertedOrder) {
    return new Response(JSON.stringify({ error: insertError?.message || "Erro ao criar pedido." }), { status: 500, headers: corsHeaders });
  }

  if (Array.isArray(extraction.items) && extraction.items.length > 0) {
    await salvarItensDoPedido(supabase, {
      userId: assignedUserId, orderId: insertedOrder.id, clientId: client.id,
      category, orderDate: new Date().toISOString(), items: extraction.items,
    });
  }

  const fat = client.faturamento || {};
  const atual = Number(fat[category]) || 0;
  await supabase.from("clients").update({ faturamento: { ...fat, [category]: Math.max(0, atual + value) } }).eq("id", client.id);

  await supabase.from("incoming_orders").update({
    status: "imported", assigned_user_id: assignedUserId, order_id: insertedOrder.id,
  }).eq("id", incoming.id);

  if (remember) {
    await supabase.from("company_client_resolutions").upsert({
      company_id: incoming.company_id, client_cnpj: cleanCnpj,
      resolved_user_id: assignedUserId, resolved_by: user.id,
    }, { onConflict: "company_id,client_cnpj" });
  }

  return new Response(JSON.stringify({ ok: true, orderId: insertedOrder.id }), { status: 200, headers: corsHeaders });
}

Deno.serve(handler);
