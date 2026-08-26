import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { Settings, TrendingUp, X, ChevronLeft, ChevronRight, Target, Check, Loader2 } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';


const RevenueChart = ({ data, loading, currentDate, onPrevMonth, onNextMonth }) => {
  const [selectedIdx, setSelectedIdx] = React.useState(null);
  const [showSettings, setShowSettings] = React.useState(false);
  const [draftGoals, setDraftGoals] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [isNarrow, setIsNarrow] = React.useState(false);
  const { settings, updateSettings } = useSettings();

  React.useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Rascunho das metas por empresa — sincroniza sempre que o painel abre,
  // com o que já estiver salvo (formatado sem separador de milhar, só o
  // número, pra ficar fácil de editar).
  React.useEffect(() => {
    if (showSettings) {
      const draft = {};
      data.forEach(({ name }) => {
        const goal = settings.monthly_goals?.[name];
        draft[name] = goal ? String(goal) : '';
      });
      setDraftGoals(draft);
    }
  }, [showSettings, data, settings.monthly_goals]);

  // A escala segue os DADOS, não uma meta: com uma meta de R$ 1.000.000 e um
  // mês de R$ 9.531, a barra ficaria travada perto do chão, indistinguível
  // de zero. 15% de folga no topo pra barra mais alta não encostar no teto.
  const maiorValor = React.useMemo(
    () => Math.max(0, ...data.map(d => Number(d.value) || 0)),
    [data]
  );
  const semFaturamento = maiorValor <= 0;
  const MAX_REVENUE = React.useMemo(
    () => (semFaturamento ? 1 : maiorValor * 1.15),
    [maiorValor, semFaturamento]
  );

  const formatShortCurrency = (val) => `R$ ${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`;
  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

  const handleSaveGoals = async () => {
    setSaving(true);
    try {
      const merged = { ...(settings.monthly_goals || {}) };
      Object.entries(draftGoals).forEach(([name, raw]) => {
        const clean = String(raw).replace(/\./g, '').replace(',', '.');
        const parsed = parseFloat(clean);
        if (raw && !isNaN(parsed) && parsed > 0) merged[name] = parsed;
        else delete merged[name];
      });
      await updateSettings({ monthly_goals: merged });
      setShowSettings(false);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const rotateLabels = isNarrow || data.length > 5;

  return (

<div className="bg-white dark:bg-zinc-900 rounded-[32px] border-2 border-emerald-600/20 p-6 shadow-xl">
<div className="flex flex-col h-full relative" style={{ minHeight: '350px' }}>
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute inset-x-0 top-0 z-[100] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[32px] p-6 shadow-2xl max-h-[calc(100%-8px)] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Meta mensal por empresa</p>
                <p className="text-[9px] font-bold text-slate-400 mt-0.5">Em branco = sem meta pra essa empresa</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-full transition-colors shrink-0">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {data.map(({ name }) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="flex-1 text-xs font-bold text-slate-700 dark:text-zinc-200 truncate">{name}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draftGoals[name] ?? ''}
                    onChange={e => setDraftGoals(prev => ({ ...prev, [name]: e.target.value }))}
                    placeholder="Ex: 50.000"
                    className="w-32 text-sm font-black border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 rounded-2xl px-4 py-2.5 outline-none text-right focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              ))}
            </div>
            <button onClick={handleSaveGoals} disabled={saving} className="w-full mt-4 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar metas
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
             <TrendingUp className="w-4 h-4 text-emerald-600" />
             <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Faturamento por empresa</h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={onPrevMonth} className="p-1 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-lg transition-colors">
              <ChevronLeft className="w-3 h-3 text-slate-400" />
            </button>
            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest min-w-[100px] text-center">
              {currentDate?.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) || '---'}
            </span>
            <button onClick={onNextMonth} className="p-1 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-lg transition-colors">
              <ChevronRight className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className="p-3 bg-slate-50 dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-2xl transition-all" title="Configurar meta mensal por empresa">
          <Target className={cn("w-4 h-4 text-slate-400", showSettings && "text-emerald-600")} />
        </button>
      </div>
      <div className="flex-1 flex gap-4 min-h-0 pt-4">
        <div className="relative w-14 flex flex-col justify-between pb-12 pr-3 border-r border-slate-200 dark:border-zinc-800/50">
           {[4,3,2,1,0].map(i => (
             <span key={i} className="text-[9px] font-black text-slate-500">{formatShortCurrency(Math.round((MAX_REVENUE/4)*i))}</span>
           ))}
        </div>
        {semFaturamento ? (
          <div className="flex-1 flex flex-col items-center justify-center h-full pb-10">
             <TrendingUp className="w-8 h-8 text-slate-300 mb-2 opacity-60" />
             <p className="text-sm font-black text-slate-400 uppercase tracking-widest text-center opacity-60">Nenhum faturamento registrado</p>
             <p className="text-[10px] font-bold text-slate-400 text-center max-w-[200px] mt-1 opacity-60">Lance seus pedidos e acompanhe seus ganhos por empresa aqui</p>
             <Link
               to="/dashboard/empresas"
               className="mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-600/20"
             >
               Lançar primeiro pedido
             </Link>
          </div>
        ) : (
        <div className={cn(
          "flex-1 flex items-stretch px-4 relative pb-2",
          data.length > 10 ? "gap-1" : data.length > 6 ? "gap-2" : "gap-4"
        )}>
          {data.map((item, idx) => {
            const val = Number(item.value) || 0;
            const h = (val / MAX_REVENUE) * 100;
            const isSelected = selectedIdx === idx;
            const meta = settings.monthly_goals?.[item.name];
            const metaVisivel = meta > 0 && meta <= MAX_REVENUE;
            const metaAltura = metaVisivel ? (meta / MAX_REVENUE) * 100 : 0;
            const bateuMeta = metaVisivel && val >= meta;
            return (
              <div key={idx} className={cn("flex-1 relative flex flex-col items-center justify-end group h-full", rotateLabels ? "pb-[84px]" : "pb-10")} onMouseEnter={() => setSelectedIdx(idx)} onMouseLeave={() => setSelectedIdx(null)}>
                {metaVisivel && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-10"
                    style={{ bottom: `calc(${rotateLabels ? '84px' : '40px'} + ${metaAltura}%)` }}
                  >
                    <div className={cn("border-t-2 border-dashed", bateuMeta ? "border-emerald-400" : "border-amber-400/80")} />
                  </div>
                )}
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: h + '%' }}
                  className={cn(
                    "w-full rounded-t-xl transition-all relative flex flex-col items-center justify-start pt-2",
                    data.length < 5 ? "max-w-[80px]" : "max-w-full",
                    isSelected ? "bg-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.3)]" : "bg-emerald-500/80"
                  )}
                >
                   <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-t-xl" />
                   {bateuMeta && (
                     <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-emerald-500" title="Meta batida">
                       <Check className="w-3.5 h-3.5" strokeWidth={3} />
                     </div>
                   )}

                   {/* Tooltip Pop-up */}
                   <AnimatePresence>
                     {isSelected && (
                       <motion.div
                         initial={{ opacity: 0, y: 10, scale: 0.8 }}
                         animate={{ opacity: 1, y: -45, scale: 1 }}
                         exit={{ opacity: 0, y: 10, scale: 0.8 }}
                         className="absolute z-[100] whitespace-nowrap"
                       >
                         <div className="bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-2xl shadow-2xl flex flex-col items-center gap-0.5">
                           <span className="text-[7px] font-black uppercase tracking-widest opacity-50">Faturamento</span>
                           <span className="text-xs font-black tabular-nums">{formatCurrency(val)}</span>
                           {meta > 0 && (
                             <span className={cn("text-[8px] font-black tabular-nums mt-0.5", bateuMeta ? "text-emerald-400" : "text-amber-400")}>
                               Meta {formatCurrency(meta)}
                             </span>
                           )}
                           <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 dark:bg-zinc-100 rotate-45" />
                         </div>
                       </motion.div>
                     )}
                   </AnimatePresence>
                </motion.div>
                {rotateLabels ? (
                  <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center overflow-hidden" style={{ height: '80px' }}>
                    <p
                      className={cn("font-black uppercase", !isSelected && "text-slate-900 dark:text-zinc-100")}
                      style={{
                        writingMode: 'vertical-rl',
                        textOrientation: 'upright',
                        fontSize: `${Math.max(6, Math.min(12, Math.floor(72 / (item.name.replace(/\s/g, '').length || 1))))}px`,
                        lineHeight: 1,
                        letterSpacing: '0.02em',
                        ...(isSelected ? { color: '#10b981' } : {})
                      }}
                    >{item.name}</p>
                  </div>
                ) : (
                  <div className="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center">
                    <p
                      className={cn("font-black uppercase truncate px-1", data.length > 6 ? "text-[7px]" : "text-[8px]", !isSelected && "text-slate-900 dark:text-zinc-100")}
                      style={isSelected ? { color: '#10b981' } : undefined}
                    >{item.name}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  </div>
  );
};

export default RevenueChart;
