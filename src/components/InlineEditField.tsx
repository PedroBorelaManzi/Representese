import React, { useEffect, useRef, useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { toast } from "sonner";

type FieldType = "date" | "text" | "currency" | "textarea";

interface InlineEditFieldProps {
  /** ISO date ("2026-08-26"/timestamp), texto puro, ou número — conforme `type`. */
  value: string | number | null | undefined;
  type: FieldType;
  onSave: (newValue: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  /** Rótulo pro leitor de tela quando o valor está vazio (ex.: "Data de entrega"). */
  label?: string;
}

const formatBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

/** yyyy-mm-dd (o que <input type="date"> espera) a partir de qualquer string
 *  ISO de data/timestamp — sem passar por `new Date()` pra não sofrer com
 *  fuso (um `created_at` de meia-noite UTC não pode "voltar um dia" na tela). */
const toDateInputValue = (v: string | number | null | undefined): string => {
  if (!v) return "";
  const s = String(v);
  const match = s.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
};

const displayValue = (value: InlineEditFieldProps["value"], type: FieldType): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "date") {
    const iso = toDateInputValue(value);
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  if (type === "currency") {
    const n = typeof value === "number" ? value : parseFloat(String(value));
    return isFinite(n) ? formatBRL(n) : "—";
  }
  return String(value);
};

/** Campo editável in-place — clique revela um input, salva no blur/Enter,
 *  Escape cancela. Uma implementação só, reaproveitada nos cards de
 *  Pedidos/Empresas e na tabela de Entregas. */
export function InlineEditField({ value, type, onSave, placeholder, className, label }: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(type === "date" ? toDateInputValue(value) : type === "currency" ? String(value ?? "") : String(value ?? ""));
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEditing = () => {
    if (saving) return;
    setEditing(true);
  };

  const commit = async () => {
    setEditing(false);
    const original = type === "date" ? toDateInputValue(value) : String(value ?? "");
    if (draft === original) return;
    setSaving(true);
    try {
      await onSave(draft);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    if (type === "textarea") {
      return (
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder={placeholder}
          aria-label={label}
          rows={2}
          className={cn(
            "w-full min-w-0 resize-none bg-slate-50 dark:bg-zinc-800 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/30",
            className
          )}
        />
      );
    }
    return (
      <input
        ref={inputRef}
        type={type === "date" ? "date" : type === "currency" ? "number" : "text"}
        step={type === "currency" ? "0.01" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        aria-label={label}
        className={cn(
          "w-full min-w-0 bg-slate-50 dark:bg-zinc-800 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/30",
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); startEditing(); }}
      disabled={saving}
      aria-label={label}
      className={cn(
        "group/field inline-flex items-center gap-1.5 text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-60 min-w-0",
        type === "textarea" && "items-start",
        className
      )}
    >
      <span className={cn(type === "textarea" ? "line-clamp-2 whitespace-pre-line" : "truncate", value === null || value === undefined || value === "" ? "text-slate-300 dark:text-zinc-600" : "text-slate-900 dark:text-zinc-100")}>
        {displayValue(value, type)}
      </span>
      {saving ? (
        <Loader2 className="w-3 h-3 text-emerald-500 animate-spin shrink-0" />
      ) : (
        <Pencil className="w-3 h-3 text-slate-300 dark:text-zinc-600 opacity-0 group-hover/field:opacity-100 transition-opacity shrink-0 mt-0.5" />
      )}
    </button>
  );
}
