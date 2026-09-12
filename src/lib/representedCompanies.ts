// src/lib/representedCompanies.ts
//
// Cliente das funções do banco (ver migration create_represented_companies_intake_system)
// que ligam o representante ao registro GLOBAL de empresas representadas —
// o motor por trás da captura automática de pedidos (e-mail hoje, Drive
// depois). Esse registro é por CNPJ, não por vendedor: é o que permite dois
// representantes da mesma fábrica compartilharem o mesmo cadastro de
// empresa sem duplicar, e é usado pra rotear pedido que chega sozinho
// (e-mail/Drive) pro vendedor certo.
//
// O representante NUNCA lê/escreve a tabela represented_companies direto
// (RLS é admin-only) — toda interação passa por estas RPCs SECURITY
// DEFINER, que devolvem só o que ele precisa ver (nunca o link do Drive).

import { supabase } from "./supabase";
import { normalizar } from "./orderExtractionCore";

export interface RepresentedCompanyMatch {
  id: string;
  cnpj: string;
  name: string;
  nome_fantasia: string | null;
  city: string | null;
  state: string | null;
}

/** Base do endereço contato+{slug}@representese.com — só letras minúsculas,
 *  números e hífen. A garantia de ser ÚNICO (acrescentando um sufixo em
 *  caso de colisão) é feita no banco, dentro de create_represented_company. */
export function slugifyCompanyName(name: string): string {
  const slug = normalizar(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "empresa";
}

/** Procura uma empresa representada já cadastrada (por qualquer vendedor)
 *  com este CNPJ — não cria nem vincula nada. Usado pra mostrar a
 *  confirmação ("já existe, é essa mesma?") antes de decidir. */
export async function findRepresentedCompany(cnpj: string): Promise<RepresentedCompanyMatch | null> {
  const cleanCnpj = cnpj.replace(/\D/g, "");
  if (cleanCnpj.length !== 14) return null;

  const { data, error } = await supabase.rpc("find_represented_company", { p_cnpj: cleanCnpj });
  if (error) {
    console.warn("[representedCompanies] find_represented_company falhou:", error.message);
    return null;
  }
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

/** Vincula o representante logado a uma empresa representada JÁ existente
 *  (fluxo "sim, é essa mesma empresa"). categoryName é o nome que ELE usa
 *  pra essa empresa em user_settings.categories. */
export async function linkRepToCompany(companyId: string, categoryName: string): Promise<void> {
  const { error } = await supabase.rpc("link_rep_to_company", { p_company_id: companyId, p_category_name: categoryName });
  if (error) throw new Error(error.message);
}

export interface CreateRepresentedCompanyParams {
  cnpj: string;
  name: string;
  nomeFantasia?: string | null;
  city?: string | null;
  state?: string | null;
  categoryName: string;
}

/** Cria uma empresa representada nova (CNPJ ainda não cadastrado por
 *  ninguém) e já vincula o representante logado a ela. */
export async function createRepresentedCompany(params: CreateRepresentedCompanyParams): Promise<RepresentedCompanyMatch> {
  const cleanCnpj = params.cnpj.replace(/\D/g, "");
  const { data, error } = await supabase.rpc("create_represented_company", {
    p_cnpj: cleanCnpj,
    p_name: params.name,
    p_nome_fantasia: params.nomeFantasia || null,
    p_city: params.city || null,
    p_state: params.state || null,
    p_base_slug: slugifyCompanyName(params.nomeFantasia || params.name),
    p_category_name: params.categoryName,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Erro ao cadastrar empresa.");
  return row;
}
