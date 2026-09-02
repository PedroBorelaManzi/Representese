import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { motion, AnimatePresence } from 'framer-motion';
import { StickyNote, CheckCircle2, Loader2, ListTodo, Plus, Trash2, CheckSquare, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import { syncQueue } from '../lib/syncQueue';
import { offlineCache } from '../lib/offlineCache';

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

interface DailyData {
  notes: string;
  tasks: Task[];
}

interface DailyNotesProps {
  selectedDate: Date;
  className?: string;
}

const formatDateLocal = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function DailyNotes({ selectedDate, className }: DailyNotesProps) {
  const { user } = useAuth();
  const { isOnline } = useSync();
  const [dailyData, setDailyData] = useState<DailyData>({ notes: '', tasks: [] });
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedRaw, setLastSavedRaw] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const dateIso = formatDateLocal(selectedDate);

  const parseContent = (raw: string): DailyData => {
    try {
      if (!raw) return { notes: '', tasks: [] };
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && ('notes' in parsed || 'tasks' in parsed)) {
        return {
          notes: parsed.notes || '',
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
        };
      }
    } catch (e) {}
    return { notes: raw || '', tasks: [] };
  };

  useEffect(() => {
    const fetchNote = async () => {
      if (!user) return;
      setLoading(true);
      setSaveStatus('idle');
      
      const cacheKey = `rm_cache_daily_notes_${user.id}_${dateIso}`;

      if (!offlineCache.isOnline()) {
        const cachedRaw = offlineCache.get(cacheKey);
        if (cachedRaw && typeof cachedRaw === 'string') {
          const structured = parseContent(cachedRaw);
          setDailyData(structured);
          setLastSavedRaw(cachedRaw);
        }
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('daily_notes')
        .select('content')
        .eq('user_id', user.id)
        .eq('date', dateIso)
        .maybeSingle();

      if (!error) {
        const raw = data?.content || '';
        offlineCache.set(cacheKey, raw);
        const structured = parseContent(raw);
        setDailyData(structured);
        setLastSavedRaw(raw);
      }
      setLoading(false);
    };

    fetchNote();
  }, [user, dateIso]);

  useEffect(() => {
    const currentRaw = JSON.stringify(dailyData);
    if (currentRaw === lastSavedRaw || loading) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    setSaveStatus('saving');
    saveTimeoutRef.current = setTimeout(async () => {
      if (!user) return;
      
      const cacheKey = `rm_cache_daily_notes_${user.id}_${dateIso}`;

      if (!offlineCache.isOnline()) {
         syncQueue.enqueue('daily_notes', 'UPSERT', { user_id: user.id, date: dateIso, content: currentRaw }, 'user_id,date');
         offlineCache.set(cacheKey, currentRaw);
         setSaveStatus('saved');
         setLastSavedRaw(currentRaw);
         setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 3000);
         return;
      }

      const { error } = await supabase
        .from('daily_notes')
        .upsert(
          { user_id: user.id, date: dateIso, content: currentRaw },
          { onConflict: 'user_id,date' }
        );

      if (!error) {
        offlineCache.set(cacheKey, currentRaw);
        setSaveStatus('saved');
        setLastSavedRaw(currentRaw);
        setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 3000);
      } else {
        setSaveStatus('error');
      }
    }, 1500);

    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [dailyData, user, dateIso, lastSavedRaw, loading]);

  const addTask = () => {
    if (!newTaskText.trim()) return;
    const newTask: Task = {
      id: Math.random().toString(36).substring(2, 9),
      text: newTaskText.trim(),
      completed: false
    };
    setDailyData(prev => ({
      ...prev,
      tasks: [...prev.tasks, newTask]
    }));
    setNewTaskText('');
  };

  const toggleTask = (id: string) => {
    setDailyData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
    }));
  };

  const deleteTask = (id: string) => {
    setDailyData(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== id)
    }));
  };

  const formattedDateDisplay = selectedDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long'
  });

  return (
    <div className={cn(
      "bg-white dark:bg-zinc-900 rounded-[32px] border-2 border-emerald-600/20 p-6 shadow-xl flex flex-col h-full",
      className
    )}>
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-0 overflow-y-auto xl:overflow-y-hidden custom-scrollbar">
        
        {/* Coluna de Anotações */}
        <div className="flex flex-col h-full min-h-[150px]">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-xl">
                <StickyNote className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Anotações</h2>
                <p className="text-[10px] font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter mt-0.5">
                  {formattedDateDisplay}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm z-50 rounded-2xl">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              </div>
            )}
            <textarea
              value={dailyData.notes}
              onChange={(e) => setDailyData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Escreva suas anotações aqui..."
              className="w-full h-full p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/5 transition-all text-sm font-medium text-slate-700 dark:text-zinc-300 resize-none custom-scrollbar"
            />
          </div>
        </div>

        {/* Coluna de Tarefas */}
        <div className="flex flex-col h-full min-h-[200px] xl:border-l xl:border-slate-200 dark:xl:border-zinc-800 xl:pl-6">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-xl">
                <ListTodo className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Tarefas</h2>
                <p className="text-[10px] font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter mt-0.5">
                  {dailyData.tasks.filter(t => t.completed).length}/{dailyData.tasks.length} Concluídas
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex gap-2 flex-shrink-0 w-full">
              <input 
                type="text" 
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
                placeholder="Adicionar tarefa..."
                className="flex-1 min-w-0 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <button onClick={addTask} className="p-2 flex-shrink-0 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
              <AnimatePresence initial={false}>
                {dailyData.tasks.length > 0 ? (
                  dailyData.tasks.map((task) => (
                    <motion.div 
                      key={task.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className={cn(
                        "group flex items-center gap-3 p-3 rounded-2xl border transition-all",
                        task.completed 
                          ? "bg-slate-50 dark:bg-zinc-800/40 border-slate-100 dark:border-zinc-700/50 opacity-60" 
                          : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 shadow-sm"
                      )}
                    >
                      <button onClick={() => toggleTask(task.id)} className="text-emerald-600">
                        {task.completed ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                      </button>
                      <span className={cn(
                        "flex-1 min-w-0 text-sm font-medium transition-all break-words whitespace-normal",
                        task.completed ? "line-through text-slate-400" : "text-slate-700 dark:text-zinc-200"
                      )}>
                        {task.text}
                      </span>
                      <button 
                        onClick={() => deleteTask(task.id)}
                        className="hover-reveal p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                    <ListTodo className="w-12 h-12 mb-2 opacity-10" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma tarefa pendente</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800/50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Salvo na nuvem</p>
          <AnimatePresence mode="wait">
            {saveStatus === 'saving' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                <Loader2 className="w-2.5 h-2.5 text-slate-400 animate-spin" />
                <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Sincronizando</span>
              </motion.div>
            )}
            {saveStatus === 'saved' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                <span className="text-[7px] font-black text-emerald-600 uppercase tracking-widest">Ok</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1">
          <div className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-500" : "bg-amber-500")} />
          <span className="text-[9px] font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter">
            {isOnline ? "Sincronizado" : "Offline (Local)"}
          </span>
        </div>
      </div>
    </div>
  );
}
