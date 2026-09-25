// src/pages/AdminCompanies.tsx
//
// Painel admin (só Pedro) do registro global de empresas representadas —
// o motor por trás da captura automática de pedidos por e-mail (e Drive,
// mais pra frente). Duas partes:
//  1) Lista das empresas cadastradas: CNPJ, quantos vendedores vinculados,
//     endereço de e-mail de captura (contato+slug@representese.com) e
//     status do Drive.
//  2) Fila de pedidos capturados que precisam de uma decisão manual —
//     "ambiguous" (dois vendedores da mesma empresa têm o mesmo cliente
//     cadastrado) ou "no_match"/"error" (não achou ninguém, ou algo falhou).
//
// O representante nunca vê nada desta tela nem da tabela por trás dela —
// RLS de represented_companies/company_reps/incoming_orders é admin-only.

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSettings } from "../contexts/SettingsContext";
import { toast } from "sonner";
import { Building2, Mail, Users, Loader2, AlertTriangle, HelpCircle, CheckCircle2, Copy } from "lucide-react";
import { PageHeader } from "../components/ui";

const INTAKE_DOMAIN = "pedidos.representese.com";

export default function AdminCompanies() {
  const { settings, loading } = useSettings();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!settings.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <AdminCompaniesContent />;
}

interface CompanyRow {
  id: string;
  cnpj: string;
  name: string;
  nome_fantasia: string | null;
  city: string | null;
  state: string | null;
  intake_email_slug: string;
  drive_status: string;
  drive_folder_link: string | null;
  status: string;
  created_at: string;
  company_reps: { user_id: string; category_name: string }[];
}

interface PendingRow {
  id: string;
  company_id: string;
  source: string;
  status: string;
  extracted: { client?: string; cnpj?: string; value?: number } | null;
  matched_client_cnpj: string | null;
  raw_file_name: string | null;
  error_message: string | null;
  created_at: string;
}

function formatCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function AdminCompaniesContent() {
  const queryClient = useQueryClient();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [chosenRep, setChosenRep] = useState<Record<string, string>>({});
  const [rememberChoice, setRememberChoice] = useState<Record<string, boolean>>({});

  const { data: companies, isLoading: loadingCompanies } = useQuery({
    queryKey: ["admin-represented-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("represented_companies")
        .select("id, cnpj, name, nome_fantasia, city, state, intake_email_slug, drive_status, drive_folder_link, status, created_at, company_reps(user_id, category_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CompanyRow[];
    },
  });

  const { data: pending, isLoading: loadingPending } = useQuery({
    queryKey: ["admin-incoming-orders-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incoming_orders")
        .select("id, company_id, source, status, extracted, matched_client_cnpj, raw_file_name, error_message, created_at")
        .in("status", ["ambiguous", "no_match", "error"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PendingRow[];
    },
  });

  const allRepIds = useMemo(
    () => Array.from(new Set((companies || []).flatMap((c) => c.company_reps.map((r) => r.user_id)))),
    [companies]
  );

  const { data: repEmails } = useQuery({
    queryKey: ["admin-rep-emails", allRepIds],
    queryFn: async () => {
      if (allRepIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from("user_settings").select("user_id, email").in("user_id", allRepIds);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.user_id] = r.email || r.user_id.slice(0, 8); });
      return map;
    },
    enabled: allRepIds.length > 0,
  });

  const companyById = useMemo(() => {
    const map: Record<string, CompanyRow> = {};
    (companies || []).forEach((c) => { map[c.id] = c; });
    return map;
  }, [companies]);

  const copyEmail = (slug: string) => {
    const address = `contato+${slug}@${INTAKE_DOMAIN}`;
    navigator.clipboard.writeText(address);
    toast.success(`Copiado: ${address}`);
  };

  const handleResolve = async (incomingOrderId: string) => {
    const assignedUserId = chosenRep[incomingOrderId];
    if (!assignedUserId) {
      toast.error("Escolha pra qual vendedor vai este pedido.");
      return;
    }
    setResolvingId(incomingOrderId);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-incoming-order", {
        body: { incomingOrderId, assignedUserId, remember: rememberChoice[incomingOrderId] ?? true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Pedido lançado na conta do vendedor.");
      queryClient.invalidateQueries({ queryKey: ["admin-incoming-orders-pending"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao resolver.");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-20">
      <PageHeader icon={Building2} title="Empresas Representadas" subtitle="Registro global por CNPJ — motor da captura automática de pedidos" />

      <section className="bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-100 dark:border-zinc-800 shadow-sm p-6 md:p-8">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-zinc-200 mb-6 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-emerald-600" /> Empresas cadastradas
        </h2>

        {loadingCompanies ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
        ) : !companies || companies.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma empresa cadastrada ainda — o cadastro acontece quando um representante informa o CNPJ ao criar uma empresa em Empresas &amp; Pedidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[9px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 dark:border-zinc-800">
                  <th className="pb-3 pr-4">Empresa</th>
                  <th className="pb-3 pr-4">CNPJ</th>
                  <th className="pb-3 pr-4">Vendedores</th>
                  <th className="pb-3 pr-4">E-mail de captura</th>
                  <th className="pb-3 pr-4">Drive</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 dark:border-zinc-800/50 last:border-0">
                    <td className="py-4 pr-4">
                      <div className="font-bold text-slate-800 dark:text-zinc-100">{c.nome_fantasia || c.name}</div>
                      {c.city && <div className="text-xs text-slate-400">{c.city}{c.state ? `/${c.state}` : ""}</div>}
                    </td>
                    <td className="py-4 pr-4 font-mono text-xs text-slate-500">{formatCnpj(c.cnpj)}</td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Users className="w-3.5 h-3.5 text-slate-300" />
                        {c.company_reps.length}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                        {c.company_reps.map((r) => (
                          <div key={r.user_id}>{repEmails?.[r.user_id] || "…"} <span className="text-slate-300">({r.category_name})</span></div>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <button onClick={() => copyEmail(c.intake_email_slug)} className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 hover:underline">
                        <Mail className="w-3.5 h-3.5" /> contato+{c.intake_email_slug}@{INTAKE_DOMAIN} <Copy className="w-3 h-3" />
                      </button>
                    </td>
                    <td className="py-4 pr-4">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${c.drive_status === "active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                        {c.drive_status === "not_configured" ? "não configurado" : c.drive_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-100 dark:border-zinc-800 shadow-sm p-6 md:p-8">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-zinc-200 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" /> Pedidos pendentes de resolução
        </h2>
        <p className="text-xs text-slate-400 mb-6">Chegaram por e-mail mas o sistema não conseguiu decidir sozinho pra quem lançar.</p>

        {loadingPending ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
        ) : !pending || pending.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-6">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Nenhum pedido pendente — tudo que chegou foi lançado automaticamente.
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((p) => {
              const company = companyById[p.company_id];
              const candidateReps = company?.company_reps || [];
              return (
                <div key={p.id} className="border border-slate-100 dark:border-zinc-800 rounded-2xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-zinc-100 text-sm">
                        {company?.nome_fantasia || company?.name || "Empresa"} — {p.extracted?.client || "cliente não identificado"}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        CNPJ do cliente: {p.matched_client_cnpj ? formatCnpj(p.matched_client_cnpj) : "não identificado"} · Valor: {p.extracted?.value ? `R$ ${Number(p.extracted.value).toFixed(2)}` : "—"} · {p.source === "email" ? "por e-mail" : "pelo Drive"}
                      </div>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full whitespace-nowrap ${p.status === "ambiguous" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>
                      {p.status === "ambiguous" ? "cliente ambíguo" : p.status === "no_match" ? "cliente não encontrado" : "erro"}
                    </span>
                  </div>

                  {p.status === "error" && p.error_message && (
                    <p className="text-xs text-red-500">{p.error_message}</p>
                  )}

                  {p.status === "no_match" && (
                    <p className="text-xs text-slate-400">Nenhum vendedor desta empresa tem esse cliente cadastrado — lance manualmente pelo cadastro do vendedor certo (ou cadastre o cliente antes).</p>
                  )}

                  {p.status === "ambiguous" && candidateReps.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <HelpCircle className="w-4 h-4 text-slate-300" /> Este cliente existe em mais de um vendedor. Atribuir a:
                      </div>
                      <select
                        value={chosenRep[p.id] || ""}
                        onChange={(e) => setChosenRep((s) => ({ ...s, [p.id]: e.target.value }))}
                        className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-850 border border-slate-100 dark:border-zinc-800 outline-none focus:border-emerald-500"
                      >
                        <option value="">selecione…</option>
                        {candidateReps.map((r) => (
                          <option key={r.user_id} value={r.user_id}>{repEmails?.[r.user_id] || r.user_id.slice(0, 8)}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                        <input
                          type="checkbox"
                          checked={rememberChoice[p.id] ?? true}
                          onChange={(e) => setRememberChoice((s) => ({ ...s, [p.id]: e.target.checked }))}
                        />
                        lembrar pra sempre
                      </label>
                      <button
                        onClick={() => handleResolve(p.id)}
                        disabled={resolvingId === p.id}
                        className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
                      >
                        {resolvingId === p.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Lançar pedido
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
