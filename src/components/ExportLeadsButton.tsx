/* Botão para exportar leads em Excel profissional ou CSV.
   Integra-se ao CRM para gerar relatórios bem organizados. */
import React, { useState } from "react";
import { FileDown, Loader2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { exportLeadsAsExcel, exportLeadsAsCSV } from "../lib/leadsExport";
import { toast } from "sonner";
import { cn } from "../lib/utils";

interface ExportLeadsButtonProps {
  leads: Array<{
    id: string;
    name: string;
    cnpj?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    status?: 'Ativo' | 'Alerta' | 'Crítico' | 'Inativo' | string;
    last_contact?: string;
    faturamento?: Record<string, number>;
    notes?: string;
    [key: string]: any;
  }>;
  userName?: string;
}

export function ExportLeadsButton({ leads, userName }: ExportLeadsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const typedLeads = leads as any[];
      await exportLeadsAsExcel(typedLeads, userName || "Representese");
      toast.success("Relatório Excel gerado com sucesso!");
      setIsOpen(false);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao gerar relatório Excel");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const typedLeads = leads as any[];
      await exportLeadsAsCSV(typedLeads);
      toast.success("Relatório CSV gerado com sucesso!");
      setIsOpen(false);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao gerar relatório CSV");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={leads.length === 0 || isExporting}
        className={cn(
          "flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95",
          leads.length === 0 || isExporting
            ? "bg-slate-100 text-slate-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed"
            : isOpen
              ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
              : "bg-white border border-slate-200 text-slate-700 hover:border-emerald-300 hover:text-emerald-600 shadow-sm dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        )}
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            GERANDO...
          </>
        ) : (
          <>
            <FileDown className="w-4 h-4" />
            EXPORTAR
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
          </>
        )}
      </button>

      <AnimatePresence>
        {isOpen && !isExporting && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-slate-100 dark:border-zinc-800 overflow-hidden z-50"
          >
            <div className="p-3 border-b border-slate-100 dark:border-zinc-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500">
                Formato de Exportação
              </p>
            </div>

            <button
              onClick={handleExportExcel}
              className="w-full px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors flex items-start gap-3 group"
            >
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg group-hover:bg-emerald-100 dark:group-hover:bg-emerald-950/50 transition-colors mt-0.5">
                <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v2H7V5zm0 4h6v2H7V9z" />
                </svg>
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-tight text-slate-900 dark:text-zinc-100">
                  Excel Profissional
                </div>
                <p className="text-[9px] text-slate-500 dark:text-zinc-500 mt-0.5">
                  4 abas: Resumo, Lista, Status, Contatos Recentes
                </p>
              </div>
            </button>

            <button
              onClick={handleExportCSV}
              className="w-full px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors flex items-start gap-3 group border-t border-slate-100 dark:border-zinc-800"
            >
              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg group-hover:bg-blue-100 dark:group-hover:bg-blue-950/50 transition-colors mt-0.5">
                <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v2H7V5z" />
                </svg>
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-tight text-slate-900 dark:text-zinc-100">
                  CSV / Spreadsheet
                </div>
                <p className="text-[9px] text-slate-500 dark:text-zinc-500 mt-0.5">
                  Compatível com Google Sheets, Numbers, Excel
                </p>
              </div>
            </button>

            <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-100 dark:border-zinc-800">
              <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500">
                📊 {leads.length} leads inclusos no relatório
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
