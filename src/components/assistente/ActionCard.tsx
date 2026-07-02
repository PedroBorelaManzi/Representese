/* Cartões de ação executável do Assistente IA (rota, WhatsApp, pedido,
   CRUD de cliente e agenda) + render de **negrito**.
   Extraído de pages/AssistenteIA.tsx (auditoria 3.1). */
import React, { useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Route,
  ShoppingBag,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  type AIAction,
  type AIActionClient,
  type AIAppointment,
  findClient,
  buildRoute,
  buildWhatsapp,
  buildOrderDraft,
  commitOrder,
  openCarteiraReport,
  commitUpdateClient,
  commitRelocateClient,
  commitCreateClient,
  commitDeleteClient,
  commitCreateAppointment,
  commitUpdateAppointment,
  commitDeleteAppointment,
  BRL,
} from "../../lib/aiActions";

/* ─── render de texto com **negrito** ───────────────────────── */
export function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-bold">{p.slice(2, -2)}</strong>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </span>
  );
}

/* ─── cartão de ação executável ─────────────────────────────── */
export function ActionCard({
  action,
  clients,
  appointments,
  inativoDays,
  userId,
  onCommitted,
}: {
  action: AIAction;
  clients: AIActionClient[];
  appointments: AIAppointment[];
  inativoDays: number;
  userId: string | undefined;
  onCommitted: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [done, setDone] = useState(false);

  const wrap = "mt-2 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-3.5";
  const dangerWrap = "mt-2 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20 p-3.5";
  const primaryBtn = "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const dangerBtn = "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[12px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

  // Executor genérico: roda o commit, trata loading/erro/sucesso e refaz a query
  const runCommit = async (fn: () => Promise<any>, successMsg: string) => {
    if (!userId || committing || done) return;
    setCommitting(true);
    try {
      await fn();
      setDone(true);
      toast.success(successMsg);
      onCommitted();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao executar a ação.");
    } finally {
      setCommitting(false);
    }
  };

  const doneRow = (label: string) => (
    <div className="flex items-center gap-2 text-emerald-600 text-[12px] font-black uppercase tracking-wider">
      <Check className="w-4 h-4" /> {label}
    </div>
  );

  /* ── ROTA ── */
  if (action.type === "route") {
    const { url, matched, missingCoords, notFound } = buildRoute(clients, action.clients);
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <Route className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Rota · {matched.length} parada{matched.length === 1 ? "" : "s"}
          </span>
        </div>
        {matched.length > 0 && (
          <ol className="flex flex-wrap gap-1.5 mb-3">
            {matched.map((c, i) => (
              <li key={c.id} className="flex items-center gap-1 bg-white dark:bg-zinc-800 border border-emerald-100 dark:border-zinc-700 rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-zinc-200">
                <span className="bg-emerald-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]">{i + 1}</span>
                {c.name}
              </li>
            ))}
          </ol>
        )}
        {(notFound.length > 0 || missingCoords.length > 0) && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              {notFound.length > 0 && <>Não encontrei: {notFound.join(", ")}. </>}
              {missingCoords.length > 0 && <>Sem localização no mapa: {missingCoords.join(", ")}.</>}
            </span>
          </p>
        )}
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
            Abrir rota no Google Maps <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <p className="text-[12px] font-semibold text-slate-500">Nenhum cliente com localização para montar a rota.</p>
        )}
      </div>
    );
  }

  /* ── WHATSAPP ── */
  if (action.type === "whatsapp") {
    const { url, client, message, hasPhone } = buildWhatsapp(clients, action.client, action.message);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        toast.error("Não consegui copiar a mensagem.");
      }
    };
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Mensagem · {client?.name || action.client}
          </span>
        </div>
        <div className="bg-white dark:bg-zinc-800 border border-emerald-100 dark:border-zinc-700 rounded-xl p-3 text-[12.5px] text-slate-700 dark:text-zinc-200 whitespace-pre-wrap mb-3">
          {message}
        </div>
        <div className="flex gap-2">
          <button onClick={copy} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-[12px] font-black uppercase tracking-wider hover:bg-emerald-100/50 transition-all active:scale-95">
            {copied ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
          </button>
          {hasPhone && url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
              Abrir WhatsApp <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <span className="flex items-center text-[11px] text-amber-600 dark:text-amber-400 px-1">
              {client ? "Cliente sem telefone cadastrado." : "Cliente não encontrado."}
            </span>
          )}
        </div>
      </div>
    );
  }

  /* ── PEDIDO ── */
  if (action.type === "order") {
    const draft = buildOrderDraft(clients, action.client, action.category, action.value);
    const valid = !!draft.client && draft.value > 0;
    const confirm = async () => {
      if (!userId || !draft.client) return;
      setCommitting(true);
      try {
        await commitOrder(userId, draft);
        setDone(true);
        toast.success("Pedido lançado com sucesso!");
        onCommitted();
      } catch (e: any) {
        toast.error(e?.message || "Erro ao lançar o pedido.");
      } finally {
        setCommitting(false);
      }
    };
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <ShoppingBag className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Lançar pedido
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-2.5 border border-emerald-100 dark:border-zinc-700">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Cliente</p>
            <p className="text-[12px] font-bold text-slate-800 dark:text-zinc-100 truncate">{draft.client?.name || action.client}</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-2.5 border border-emerald-100 dark:border-zinc-700">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Empresa</p>
            <p className="text-[12px] font-bold text-slate-800 dark:text-zinc-100 truncate">{draft.category}</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-2.5 border border-emerald-100 dark:border-zinc-700">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Valor</p>
            <p className="text-[12px] font-black text-emerald-600">{BRL(draft.value)}</p>
          </div>
        </div>
        {!draft.client && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Cliente "{action.client}" não encontrado na carteira.
          </p>
        )}
        {done ? (
          <div className="flex items-center gap-2 text-emerald-600 text-[12px] font-black uppercase tracking-wider">
            <Check className="w-4 h-4" /> Pedido lançado
          </div>
        ) : (
          <button onClick={confirm} disabled={!valid || committing} className={primaryBtn}>
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lançando...</> : <>Confirmar lançamento <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── RELATÓRIO ── */
  if (action.type === "report") {
    const open = () => {
      try {
        openCarteiraReport(clients, inativoDays);
      } catch (e: any) {
        toast.error(e?.message || "Erro ao gerar o relatório.");
      }
    };
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <FileText className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Relatório da carteira
          </span>
        </div>
        <p className="text-[12px] text-slate-600 dark:text-zinc-300 mb-3">
          Resumo com top clientes, faturamento por empresa e inativos — pronto para salvar em PDF.
        </p>
        <button onClick={open} className={primaryBtn}>
          Gerar relatório PDF <FileText className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  /* ── EDITAR CLIENTE ── */
  if (action.type === "update_client") {
    const client = findClient(clients, action.client);
    const entries = Object.entries(action.changes || {}).filter(([, v]) => v != null && String(v).trim() !== "");
    const fieldLabel: Record<string, string> = {
      name: "Nome", phone: "Telefone", email: "E-mail", address: "Endereço",
      status: "Status", notes: "Notas", city: "Cidade", state: "UF", cnpj: "CNPJ",
    };
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <Pencil className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Editar cliente · {client?.name || action.client}
          </span>
        </div>
        <div className="space-y-1.5 mb-3">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-2 bg-white dark:bg-zinc-800 rounded-xl px-3 py-2 border border-emerald-100 dark:border-zinc-700">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-0.5">{fieldLabel[k] || k}</span>
              <span className="text-[12px] font-bold text-slate-800 dark:text-zinc-100 text-right">{String(v)}</span>
            </div>
          ))}
        </div>
        {!client && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Cliente "{action.client}" não encontrado.
          </p>
        )}
        {done ? doneRow("Cliente atualizado") : (
          <button
            onClick={() => client && runCommit(() => commitUpdateClient(userId!, client.id, action.changes), "Cliente atualizado!")}
            disabled={!client || !entries.length || committing}
            className={primaryBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : <>Confirmar alteração <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── MUDAR LOCALIZAÇÃO ── */
  if (action.type === "relocate_client") {
    const client = findClient(clients, action.client);
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <MapPin className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Mudar localização · {client?.name || action.client}
          </span>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl px-3 py-2 border border-emerald-100 dark:border-zinc-700 mb-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Novo local</p>
          <p className="text-[12.5px] font-bold text-slate-800 dark:text-zinc-100">{action.location}</p>
        </div>
        {!client && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Cliente "{action.client}" não encontrado.
          </p>
        )}
        {done ? doneRow("Localização atualizada") : (
          <button
            onClick={() => client && runCommit(() => commitRelocateClient(userId!, client, action.location), "Localização atualizada no mapa!")}
            disabled={!client || committing}
            className={primaryBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Localizando...</> : <>Confirmar novo local <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── CADASTRAR CLIENTE ── */
  if (action.type === "create_client") {
    const cnpjClean = (action.cnpj || "").replace(/\D/g, "");
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <UserPlus className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Cadastrar cliente
          </span>
        </div>
        <div className="space-y-1.5 mb-3">
          {action.name && (
            <div className="bg-white dark:bg-zinc-800 rounded-xl px-3 py-2 border border-emerald-100 dark:border-zinc-700">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nome</p>
              <p className="text-[12.5px] font-bold text-slate-800 dark:text-zinc-100">{action.name}</p>
            </div>
          )}
          {cnpjClean && (
            <div className="bg-white dark:bg-zinc-800 rounded-xl px-3 py-2 border border-emerald-100 dark:border-zinc-700">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">CNPJ {action.name ? "" : "(buscarei os dados na Receita)"}</p>
              <p className="text-[12.5px] font-bold text-slate-800 dark:text-zinc-100">{action.cnpj}</p>
            </div>
          )}
        </div>
        {!action.name && !cnpjClean && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Informe ao menos um nome ou CNPJ.
          </p>
        )}
        {done ? doneRow("Cliente cadastrado") : (
          <button
            onClick={() => runCommit(() => commitCreateClient(userId!, { cnpj: action.cnpj, name: action.name, address: action.address }), "Cliente cadastrado!")}
            disabled={(!action.name && !cnpjClean) || committing}
            className={primaryBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cadastrando...</> : <>Confirmar cadastro <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── EXCLUIR CLIENTE (destrutivo) ── */
  if (action.type === "delete_client") {
    const client = findClient(clients, action.client);
    return (
      <div className={dangerWrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <Trash2 className="w-4 h-4 text-red-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">
            Excluir cliente
          </span>
        </div>
        <p className="text-[12.5px] text-slate-700 dark:text-zinc-200 mb-3">
          {client
            ? <>Isto vai excluir <b>{client.name}</b> em definitivo. Esta ação não pode ser desfeita.</>
            : <>Cliente "{action.client}" não encontrado na carteira.</>}
        </p>
        {done ? doneRow("Cliente excluído") : (
          <button
            onClick={() => client && runCommit(() => commitDeleteClient(userId!, client.id), "Cliente excluído.")}
            disabled={!client || committing}
            className={dangerBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Excluindo...</> : <>Confirmar exclusão <Trash2 className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── CRIAR COMPROMISSO ── */
  if (action.type === "create_appointment") {
    const client = action.client ? findClient(clients, action.client) : undefined;
    const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(action.date)
      ? new Date(action.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })
      : action.date;
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Novo compromisso
          </span>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl px-3 py-2.5 border border-emerald-100 dark:border-zinc-700 mb-3">
          <p className="text-[13px] font-black text-slate-800 dark:text-zinc-100">{action.title}</p>
          <p className="text-[12px] font-bold text-slate-500 dark:text-zinc-400 mt-0.5 capitalize">{dateLabel} · {action.time || "09:00"}</p>
          {client && <p className="text-[11px] font-semibold text-emerald-600 mt-1">Cliente: {client.name}</p>}
        </div>
        {done ? doneRow("Compromisso criado") : (
          <button
            onClick={() => runCommit(() => commitCreateAppointment(userId!, { title: action.title, date: action.date, time: action.time, client_id: client?.id || null }), "Compromisso agendado!")}
            disabled={committing}
            className={primaryBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Agendando...</> : <>Confirmar agendamento <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── REAGENDAR / EDITAR COMPROMISSO ── */
  if (action.type === "update_appointment") {
    const appt = appointments.find((a) => a.id === action.id);
    const c = action.changes || {};
    const newDateLabel = c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date)
      ? new Date(c.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })
      : c.date;
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <CalendarClock className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Reagendar compromisso
          </span>
        </div>
        {appt ? (
          <div className="bg-white dark:bg-zinc-800 rounded-xl px-3 py-2.5 border border-emerald-100 dark:border-zinc-700 mb-3">
            <p className="text-[13px] font-black text-slate-800 dark:text-zinc-100">{c.title || appt.title}</p>
            <p className="text-[12px] font-bold text-slate-500 dark:text-zinc-400 mt-0.5 capitalize">
              {newDateLabel || new Date(appt.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })} · {c.time || appt.time}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Compromisso não encontrado.
          </p>
        )}
        {done ? doneRow("Compromisso atualizado") : (
          <button
            onClick={() => appt && runCommit(() => commitUpdateAppointment(userId!, appt, action.changes), "Compromisso atualizado!")}
            disabled={!appt || committing}
            className={primaryBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : <>Confirmar mudança <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── EXCLUIR COMPROMISSO (destrutivo) ── */
  if (action.type === "delete_appointment") {
    const appt = appointments.find((a) => a.id === action.id);
    return (
      <div className={dangerWrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <Trash2 className="w-4 h-4 text-red-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">
            Excluir compromisso
          </span>
        </div>
        <p className="text-[12.5px] text-slate-700 dark:text-zinc-200 mb-3">
          {appt
            ? <>Excluir <b>{appt.title}</b> ({new Date(appt.date + "T00:00:00").toLocaleDateString("pt-BR")} · {appt.time})?</>
            : <>Compromisso não encontrado.</>}
        </p>
        {done ? doneRow("Compromisso excluído") : (
          <button
            onClick={() => appt && runCommit(() => commitDeleteAppointment(userId!, appt), "Compromisso excluído.")}
            disabled={!appt || committing}
            className={dangerBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Excluindo...</> : <>Confirmar exclusão <Trash2 className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  return null;
}
