/* Botão para exportar o extrato de comissões do mês (PDF impresso ou Excel). */
import React, { useState } from "react";
import { FileDown, Loader2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { exportCommissionsAsPDF, exportCommissionsAsExcel, type CommissionRow, type CommissionTotals } from "../lib/commissionsExport";
import { toast } from "sonner";
import { cn } from "../lib/utils";

interface ExportCommissionsButtonProps {
  rows: CommissionRow[];
  totals: CommissionTotals;
  month: string;
  year: number;
  userName?: string;
}

export function ExportCommissionsButton({ rows, totals, month, year, userName }: ExportCommissionsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPdf = () => {
    setIsExporting(true);
    try {
      const ok = exportCommissionsAsPDF(rows, totals, month, year);
      if (!ok) toast.error("Permita pop-ups para gerar o relatório.");
      setIsOpen(false);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportCommissionsAsExcel(rows, totals, month, year, userName);
      toast.success("Extrato Excel gerado com sucesso!");
      setIsOpen(false);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao gerar extrato Excel");
    } finally {
      setIsExporting(false);
    }
  };

  const hasData = rows.some((r) => r.faturamento > 0);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!hasData || isExporting}
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-colors",
          !hasData || isExporting
            ? "text-slate-300 dark:text-zinc-700 cursor-not-allowed"
            : "text-slate-500 dark:text-zinc-400 hover:text-emerald-600"
        )}
      >
        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
        Extrato do Mês
        <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && !isExporting && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full right-0 mt-2 w-60 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-slate-100 dark:border-zinc-800 overflow-hidden z-50"
            >
              <div className="p-3 border-b border-slate-100 dark:border-zinc-800">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500">
                  Formato do Extrato
                </p>
              </div>

              <button
                onClick={handleExportPdf}
                className="w-full px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors flex items-start gap-3 group"
              >
                <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-lg group-hover:bg-red-100 dark:group-hover:bg-red-950/50 transition-colors mt-0.5">
                  <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-tight text-slate-900 dark:text-zinc-100">
                    PDF para Impressão
                  </div>
                  <p className="text-[9px] text-slate-500 dark:text-zinc-500 mt-0.5">
                    Extrato pronto pra imprimir ou salvar
                  </p>
                </div>
              </button>

              <button
                onClick={handleExportExcel}
                className="w-full px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors flex items-start gap-3 group border-t border-slate-100 dark:border-zinc-800"
              >
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg group-hover:bg-emerald-100 dark:group-hover:bg-emerald-950/50 transition-colors mt-0.5">
                  <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v2H7V5zm0 4h6v2H7V9z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-tight text-slate-900 dark:text-zinc-100">
                    Excel Detalhado
                  </div>
                  <p className="text-[9px] text-slate-500 dark:text-zinc-500 mt-0.5">
                    Resumo + detalhe por empresa e variação
                  </p>
                </div>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
