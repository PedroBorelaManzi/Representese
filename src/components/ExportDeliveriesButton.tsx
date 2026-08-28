/* Botão para exportar o relatório de entregas do filtro atual (PDF impresso ou Excel). */
import React, { useState } from "react";
import { FileDown, Loader2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { exportDeliveriesAsPDF, exportDeliveriesAsExcel, type DeliveryReportRow } from "../lib/deliveriesExport";
import { toast } from "sonner";
import { cn } from "../lib/utils";

interface ExportDeliveriesButtonProps {
  rows: DeliveryReportRow[];
  filterLabel: string;
}

export function ExportDeliveriesButton({ rows, filterLabel }: ExportDeliveriesButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPdf = () => {
    setIsExporting(true);
    try {
      const ok = exportDeliveriesAsPDF(rows, filterLabel);
      if (!ok) toast.error("Permita pop-ups para gerar o relatório.");
      setIsOpen(false);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportDeliveriesAsExcel(rows, filterLabel);
      toast.success("Relatório Excel gerado com sucesso!");
      setIsOpen(false);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao gerar relatório Excel");
    } finally {
      setIsExporting(false);
    }
  };

  const hasData = rows.length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!hasData || isExporting}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm transition-all",
          !hasData || isExporting
            ? "text-slate-300 dark:text-zinc-700 cursor-not-allowed"
            : "text-slate-900 dark:text-zinc-100 hover:bg-slate-50 dark:hover:bg-zinc-700"
        )}
      >
        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
        Gerar relatório
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
              className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-slate-100 dark:border-zinc-800 overflow-hidden z-50"
            >
              <div className="p-3 border-b border-slate-100 dark:border-zinc-800">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500">
                  Formato do relatório
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
                    Lista dos pedidos filtrados, pronta pra imprimir
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
                    Todos os campos, filtrável e pronto pra planilha
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
