import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { Settings, TrendingUp, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

const RevenueChart = ({ data, loading, currentDate, onPrevMonth, onNextMonth }) => {
  const [selectedIdx, setSelectedIdx] = React.useState(null);
  const [showSettings, setShowSettings] = React.useState(false);
  const [ceilingInput, setCeilingInput] = React.useState('');
  const [localCeiling, setLocalCeiling] = React.useState(1000000);
  const [saving, setSaving] = React.useState(false);
  const { settings, updateSettings } = useSettings();

  React.useEffect(() => { setLocalCeiling(settings.revenue_ceiling ?? 1000000); }, [settings.revenue_ceiling]);

  const MAX_REVENUE = React.useMemo(() => {
    const values = data.map(d => Number(d.value) || 0);
    return Math.max(...values, localCeiling, 1);
  }, [data, localCeiling]);

  const formatShortCurrency = (val) => `R$ ${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`;
  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

  const handleSaveCeiling = async () => {
    if (!ceilingInput) return;
    // Better parsing for PT-BR (10.000,00 -> 10000.00)
    const clean = ceilingInput.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    if (isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    try {
      await updateSettings({ revenue_ceiling: parsed });
      setLocalCeiling(parsed);
      setShowSettings(false);
      setCeilingInput('');
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  return (
    
<div className="bg-white dark:bg-zinc-900 rounded-[32px] border-2 border-emerald-600/20 p-6 shadow-xl">
<div className="flex flex-col h-full relative" style={{ minHeight: '350px' }}>
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute inset-x-0 top-0 z-[100] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[32px] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Ajustar Teto</p>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="flex gap-2">
              <input type="text" value={ceilingInput} onChange={e => setCeilingInput(e.target.value)} placeholder={`Ex: 1.000.000`} className="flex-1 text-sm font-black border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 rounded-2xl px-4 py-3 outline-none" onKeyDown={e => e.key === 'Enter' && handleSaveCeiling()} />
              <button onClick={handleSaveCeiling} className="bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-6 rounded-2xl text-[10px] font-black uppercase disabled:opacity-50" disabled={saving}>{saving ? '...' : 'OK'}</button>
            </div>
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
        <button onClick={() => setShowSettings(!showSettings)} className="p-3 bg-slate-50 dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-2xl transition-all">
          <Settings className={cn("w-4 h-4 text-slate-400", showSettings && "rotate-45")} />
        </button>
      </div>
      <div className="flex-1 flex gap-4 min-h-0 pt-4">
        <div className="relative w-14 flex flex-col justify-between pb-12 pr-3 border-r border-slate-200 dark:border-zinc-800/50">
           {[4,3,2,1,0].map(i => (
             <span key={i} className="text-[9px] font-black text-slate-500">{formatShortCurrency(Math.round((MAX_REVENUE/4)*i))}</span>
           ))}
        </div>
        {MAX_REVENUE === 1 ? (
          <div className="flex-1 flex flex-col items-center justify-center h-full pb-10 opacity-60">
             <TrendingUp className="w-8 h-8 text-slate-300 mb-2" />
             <p className="text-sm font-black text-slate-400 uppercase tracking-widest text-center">Nenhum faturamento registrado</p>
             <p className="text-[10px] font-bold text-slate-400 text-center max-w-[200px] mt-1">Seus ganhos mensais aparecerão aqui</p>
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
            return (
              <div key={idx} className="flex-1 relative flex flex-col items-center justify-end group h-full pb-10" onMouseEnter={() => setSelectedIdx(idx)} onMouseLeave={() => setSelectedIdx(null)}>
                <motion.div 
                  initial={{ height: 0 }} 
                  animate={{ height: h + '%' }} 
                  className={cn(
                    "w-full rounded-t-xl transition-all relative flex flex-col items-center justify-start pt-2", 
                    data.length < 5 ? "max-w-[80px]" : "max-w-full",
                    isSelected ? "bg-emerald-600 shadow-[0_0_20px_rgba(79,70,229,0.3)]" : "bg-emerald-500/80"
                  )}
                >
                   <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-t-xl" />
                   
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
                           <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 dark:bg-zinc-100 rotate-45" />
                         </div>
                       </motion.div>
                     )}
                   </AnimatePresence>
                </motion.div>
                <div className="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center">
                  <p className={cn("font-black uppercase truncate px-1", data.length > 6 ? "text-[7px]" : "text-[8px]", isSelected ? "text-emerald-600" : "text-slate-900 dark:text-zinc-100")}>{item.name}</p>
                </div>
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

