import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText, Calendar, Loader2, File, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { downloadExcelReport, downloadCSVReport } from '../lib/reportGenerator';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface MonthOption {
  year: number;
  month: number;
  label: string;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<MonthOption | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([]);

  useEffect(() => {
    // Generate last 12 months
    const months: MonthOption[] = [];
    const now = new Date();

    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        label: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      });
    }

    setMonthOptions(months);
    setSelectedMonth(months[0]); // Select current month
  }, []);

  const handleGenerateExcel = async () => {
    if (!selectedMonth || !user) return;

    setIsGenerating(true);
    try {
      await downloadExcelReport(user.id, selectedMonth.year, selectedMonth.month);
      toast.success(`Relatório de ${selectedMonth.label} gerado com sucesso!`);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar relatório. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCSV = async () => {
    if (!selectedMonth || !user) return;

    setIsGenerating(true);
    try {
      await downloadCSVReport(user.id, selectedMonth.year, selectedMonth.month);
      toast.success(`Relatório de ${selectedMonth.label} gerado com sucesso!`);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar relatório. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-950 dark:to-zinc-900 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter mb-2">Relatórios</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Gere relatórios mensais em Excel ou CSV com dados de clientes, pedidos e compromissos</p>
        </div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-200 dark:border-zinc-800 shadow-xl overflow-hidden"
        >
          {/* Month Selection */}
          <div className="border-b border-slate-200 dark:border-zinc-800 p-8">
            <div className="flex items-center gap-4 mb-6">
              <Calendar className="w-6 h-6 text-emerald-500" />
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter">Selecione o Mês</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Escolha um mês para gerar seu relatório</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {monthOptions.map((month) => (
                <button
                  key={`${month.year}-${month.month}`}
                  onClick={() => setSelectedMonth(month)}
                  className={cn(
                    'p-3 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all text-center',
                    selectedMonth?.year === month.year && selectedMonth?.month === month.month
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 hover:bg-slate-200 dark:hover:bg-zinc-700'
                  )}
                >
                  {month.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div className="p-8">
            <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter mb-6">
              Escolha o Formato
            </h3>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Excel Option */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerateExcel}
                disabled={isGenerating || !selectedMonth}
                className={cn(
                  'p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-4 text-center',
                  isGenerating
                    ? 'opacity-50 cursor-not-allowed'
                    : 'border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:border-emerald-500 dark:hover:border-emerald-500'
                )}
              >
                <div className="p-4 rounded-2xl bg-emerald-100 dark:bg-emerald-950/30">
                  <FileText className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="font-black text-slate-900 dark:text-zinc-100 uppercase tracking-widest">Excel</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-1">Múltiplas abas com dados organizados</p>
                </div>
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-widest mt-2">
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Baixar Excel
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </div>
              </motion.button>

              {/* CSV Option */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerateCSV}
                disabled={isGenerating || !selectedMonth}
                className={cn(
                  'p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-4 text-center',
                  isGenerating
                    ? 'opacity-50 cursor-not-allowed'
                    : 'border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:border-blue-500 dark:hover:border-blue-500'
                )}
              >
                <div className="p-4 rounded-2xl bg-blue-100 dark:bg-blue-950/30">
                  <File className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-black text-slate-900 dark:text-zinc-100 uppercase tracking-widest">CSV</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-1">Compatível com qualquer planilha</p>
                </div>
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest mt-2">
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Baixar CSV
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </div>
              </motion.button>
            </div>
          </div>

          {/* Info Box */}
          <div className="border-t border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50 p-6">
            <div className="flex gap-4">
              <div className="text-emerald-500 flex-shrink-0">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold">✓</div>
              </div>
              <div className="text-sm">
                <p className="font-bold text-slate-900 dark:text-zinc-100">O que está incluído no relatório</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400 font-medium">
                  <li>✓ Resumo de vendas e receita</li>
                  <li>✓ Lista de clientes com status</li>
                  <li>✓ Detalhamento de pedidos</li>
                  <li>✓ Compromissos agendados</li>
                  <li>✓ Métricas de desempenho</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Footer Info */}
        <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-2xl">
          <p className="text-xs text-blue-800 dark:text-blue-200 font-medium">
            💡 <strong>Dica:</strong> Você pode agendar relatórios automáticos para serem gerados todo mês. Configure nas configurações de notificações.
          </p>
        </div>
      </div>
    </div>
  );
}
