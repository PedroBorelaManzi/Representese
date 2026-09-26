import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Network, Pencil, Sparkles, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { useAssignNetwork } from "../hooks/useAssignNetwork";
import { aggregateNetworks, suggestNetworks, existingNetworks, type RedeClient, type RedeOrder } from "../lib/redes";
import { brl, dateBR } from "../lib/format";
import { cn } from "../lib/utils";
import NetworkAssignModal from "./NetworkAssignModal";

type Mode = "mes" | "ano" | "tudo";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Visão "Redes": faturamento agrupado por rede, com os CDs de cada uma. */
export default function RedesView({ clients }: { clients: RedeClient[] }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { assign, saving } = useAssignNetwork();

  const now = new Date();
  const [mode, setMode] = useState<Mode>("mes");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [company, setCompany] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ name: string; ids: string[] } | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // sugestão: nome editável + CDs desmarcados, por chave
  const [names, setNames] = useState<Record<string, string>>({});
  const [skip, setSkip] = useState<Set<string>>(new Set());

  // Chave começa com 'clients' pra os invalidateQueries(['clients']) do app atualizarem junto.
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["clients", user?.id, "network-orders"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("client_id, value, category, created_at")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []) as RedeOrder[];
    },
  });

  const inRange = useMemo(() => {
    if (mode === "tudo") return undefined;
    return (iso: string) => {
      const d = new Date(iso);
      return d.getFullYear() === year && (mode === "ano" || d.getMonth() === month);
    };
  }, [mode, year, month]);

  const redes = useMemo(
    () => aggregateNetworks(clients, orders, { inRange, company: company || null }),
    [clients, orders, inRange, company]
  );
  const total = redes.reduce((s, r) => s + r.revenue, 0);
  const suggestions = useMemo(() => suggestNetworks(clients).filter((s) => !dismissed.has(s.key)), [clients, dismissed]);
  const networks = useMemo(() => existingNetworks(clients), [clients]);

  const step = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  // Quem ficou desmarcado NÃO some: continua sem rede, então a sugestão volta
  // (agora só com eles) pra você criar a outra rede — mesmo prefixo de nome,
  // redes diferentes. Só "ignorar" (X) esconde a sugestão.
  const applySuggestion = async (key: string, list: RedeClient[], name: string) => {
    const ids = list.filter((c) => !skip.has(`${key}:${c.id}`)).map((c) => c.id);
    const clean = name.trim();
    if (!clean || ids.length === 0) return;
    if (await assign(ids, clean)) {
      setNames((p) => { const n = { ...p }; delete n[key]; return n; });
      setSkip((p) => new Set([...p].filter((k) => !k.startsWith(`${key}:`))));
    }
  };

  return (
    <div className="p-4 md:p-5 space-y-5">
      {/* Período + representada */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-slate-100 dark:bg-zinc-800 rounded-full p-0.5">
          {(["mes", "ano", "tudo"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn("px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide transition-all",
                mode === m ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-slate-500")}
            >
              {m === "mes" ? "Mês" : m === "ano" ? "Ano" : "Tudo"}
            </button>
          ))}
        </div>
        {mode !== "tudo" && (
          <div className="flex items-center gap-1">
            <button onClick={() => (mode === "mes" ? step(-1) : setYear((y) => y - 1))} aria-label="Anterior" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-black uppercase tracking-wide min-w-[110px] text-center">
              {mode === "mes" ? `${MESES[month]} ${year}` : year}
            </span>
            <button onClick={() => (mode === "mes" ? step(1) : setYear((y) => y + 1))} aria-label="Próximo" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          aria-label="Filtrar por representada"
          className="ml-auto px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none"
        >
          <option value="">Todas as representadas</option>
          {(settings.categories || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Sugestões automáticas */}
      {suggestions.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <Sparkles className="w-4 h-4" />
            <p className="text-xs font-black uppercase tracking-widest">
              {suggestions.length} possível{suggestions.length === 1 ? "" : "is"} rede{suggestions.length === 1 ? "" : "s"} encontrada{suggestions.length === 1 ? "" : "s"}
            </p>
          </div>
          {suggestions.map((s) => (
            <div key={s.key} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={names[s.key] ?? (s.existing ? "" : s.name)}
                  onChange={(e) => setNames((p) => ({ ...p, [s.key]: e.target.value }))}
                  placeholder={s.existing ? "Nome de uma nova rede" : "Nome da rede"}
                  aria-label="Nome da rede"
                  className="flex-1 min-w-[140px] px-3 py-2 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={() => applySuggestion(s.key, s.clients, names[s.key] ?? s.name)}
                  disabled={saving || !(names[s.key] ?? (s.existing ? "" : s.name)).trim()}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50"
                >
                  Criar rede
                </button>
                {s.existing && (
                  <button
                    onClick={() => applySuggestion(s.key, s.clients, s.existing!)}
                    disabled={saving}
                    className="px-4 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50"
                  >
                    Adicionar a “{s.existing}”
                  </button>
                )}
                <button onClick={() => setDismissed((p) => new Set(p).add(s.key))} aria-label="Ignorar sugestão" className="p-2 rounded-lg text-slate-300 hover:text-slate-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ul className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                {s.clients.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!skip.has(`${s.key}:${c.id}`)}
                        onChange={() => setSkip((p) => {
                          const n = new Set(p);
                          const k = `${s.key}:${c.id}`;
                          n.has(k) ? n.delete(k) : n.add(k);
                          return n;
                        })}
                        className="accent-emerald-600"
                      />
                      <span className="truncate">{c.name}{c.city ? ` · ${c.city}` : ""}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Lista de redes */}
      {isLoading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></div>
      ) : redes.length === 0 ? (
        <div className="py-14 text-center">
          <Network className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-black text-slate-500">Nenhuma rede cadastrada ainda</p>
          <p className="text-xs text-slate-400 font-medium mt-1 max-w-sm mx-auto">
            Na lista de clientes, toque em “Selecionar”, marque os CDs da mesma rede e use “Definir rede”.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-400 px-1">
            {redes.length} rede{redes.length === 1 ? "" : "s"} · total {brl(total)}
          </p>
          {redes.map((r) => {
            const isOpen = open === r.key;
            return (
              <div key={r.key} className="rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : r.key)}
                  aria-expanded={isOpen}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-zinc-800/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0"><Network className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 dark:text-zinc-100 truncate">{r.name}</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                      {r.cdsBought} de {r.cdsTotal} CD{r.cdsTotal === 1 ? "" : "s"} compraram · {r.orders} pedido{r.orders === 1 ? "" : "s"}
                      {total > 0 && ` · ${((r.revenue / total) * 100).toFixed(1)}% do total`}
                    </p>
                  </div>
                  <span className="text-sm font-black tabular-nums shrink-0">{brl(r.revenue)}</span>
                  <ChevronDown className={cn("w-4 h-4 text-slate-300 transition-transform shrink-0", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-950/20 p-4 space-y-3">
                    {r.byCompany.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {r.byCompany.map((c) => (
                          <span key={c.name} className="px-2.5 py-1 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[10px] font-black uppercase tracking-wide">
                            {c.name} <span className="text-emerald-600 tabular-nums">{brl(c.revenue)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <ul className="divide-y divide-slate-100 dark:divide-zinc-800/70">
                      {r.cds.map((cd) => (
                        <li key={cd.id} className="py-2 flex items-center gap-3">
                          <Link to={`/dashboard/clientes/${cd.id}`} className="flex-1 min-w-0 hover:text-emerald-600 transition-colors">
                            <p className="text-xs font-bold truncate">{cd.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold">
                              {cd.city || "Cidade não informada"}
                              {cd.lastOrderAt ? ` · último pedido ${dateBR(cd.lastOrderAt)}` : ""}
                            </p>
                          </Link>
                          {cd.orders === 0 ? (
                            <span className="text-[10px] font-black uppercase text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full shrink-0">Sem compra</span>
                          ) : (
                            <span className="text-xs font-black tabular-nums shrink-0">{brl(cd.revenue)}</span>
                          )}
                          <button
                            onClick={() => assign([cd.id], "")}
                            disabled={saving}
                            title="Tirar este CD da rede"
                            aria-label={`Tirar ${cd.name} da rede`}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => setRenaming({ name: r.name, ids: r.cds.map((c) => c.id) })}
                      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600"
                    >
                      <Pencil className="w-3 h-3" /> Renomear rede
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <NetworkAssignModal
        isOpen={!!renaming}
        count={renaming?.ids.length || 0}
        networks={networks}
        initialName={renaming?.name || ""}
        saving={saving}
        onClose={() => setRenaming(null)}
        onConfirm={async (name) => { if (renaming && (await assign(renaming.ids, name))) setRenaming(null); }}
      />
    </div>
  );
}
