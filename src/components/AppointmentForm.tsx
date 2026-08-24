import { SearchableClientPicker } from './SearchableClientPicker';
import React, { useState, useRef, useEffect } from "react";
import { X, Clock, Plus, Trash2, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { useModalEsc } from "../hooks/useModalEsc";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface Appointment {
  id: string;
  title: string;
  date: string;
  time: string;
  client_id?: string;
}

interface AppointmentFormProps {
  appointment?: Partial<Appointment> | null;
  onClose: () => void;
  onSaved: () => void;
  clients: any[];
  onSave: (payload: any) => Promise<void>;
  onDelete?: () => Promise<void>;
  isSaving: boolean;
}

// Custom Scrollable Time Picker Component
function ScrollableTimePicker({ 
  value, 
  onChange, 
  label 
}: { 
  value: string; 
  onChange: (val: string) => void; 
  label: string; 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);
  
  const [hour, minute] = value.split(":");
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        const hBtn = hourRef.current?.querySelector(`[data-val="${hour}"]`);
        const mBtn = minRef.current?.querySelector(`[data-val="${minute}"]`);
        if (hBtn) hBtn.scrollIntoView({ block: 'center', behavior: 'auto' });
        if (mBtn) mBtn.scrollIntoView({ block: 'center', behavior: 'auto' });
      }, 50);
    }
  }, [isOpen, hour, minute]);
  
  const handleSelect = (newHour: string, newMin: string) => {
    onChange(`${newHour}:${newMin}`);
  };
  
  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-2 px-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-5 py-4 border rounded-[20px] bg-slate-50 dark:bg-zinc-950/50 text-slate-900 dark:text-zinc-100 transition-all font-black text-sm group",
          isOpen ? "border-emerald-600 ring-4 ring-emerald-500/10" : "border-slate-100 dark:border-zinc-800 hover:border-emerald-600"
        )}
      >
        <span>{value}</span>
        <Clock className={cn("w-4 h-4 transition-colors", isOpen ? "text-emerald-600" : "text-slate-400 group-hover:text-emerald-600")} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="absolute z-[100] mt-3 p-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[32px] shadow-2xl flex gap-1 min-w-[200px] left-0 sm:left-auto sm:right-0 overflow-hidden ring-1 ring-black/5"
          >
            <div ref={hourRef} className="flex-1 flex flex-col h-56 overflow-y-auto custom-scrollbar-visible snap-y snap-mandatory py-20">
              {hours.map((h) => (
                <button
                  key={h}
                  data-val={h}
                  type="button"
                  onClick={() => handleSelect(h, minute)}
                  className={cn(
                    "flex-shrink-0 h-10 flex items-center justify-center text-[11px] font-black transition-all snap-center mx-1 rounded-xl uppercase tracking-widest",
                    h === hour 
                      ? "bg-emerald-600 text-white  dark:shadow-none scale-105" 
                      : "text-slate-400 dark:text-zinc-500 hover:bg-slate-50 dark:hover:bg-zinc-800"
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>
            <div className="w-[1px] bg-slate-100 dark:bg-zinc-800 self-stretch my-6" />
            <div ref={minRef} className="flex-1 flex flex-col h-56 overflow-y-auto custom-scrollbar-visible snap-y snap-mandatory py-20">
              {minutes.map((m) => (
                <button
                  key={m}
                  data-val={m}
                  type="button"
                  onClick={() => handleSelect(hour, m)}
                  className={cn(
                    "flex-shrink-0 h-10 flex items-center justify-center text-[11px] font-black transition-all snap-center mx-1 rounded-xl uppercase tracking-widest",
                    m === minute 
                      ? "bg-emerald-600 text-white  dark:shadow-none scale-105" 
                      : "text-slate-400 dark:text-zinc-500 hover:bg-slate-50 dark:hover:bg-zinc-800"
                  )}
                >
                  {m}m
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AppointmentForm({ 
  appointment, 
  onClose, 
  clients, 
  onSave, 
  onDelete, 
  isSaving 
}: AppointmentFormProps) {
  if (!appointment) return null;

  // Determine if the appointment is an all‑day event (no time or marked as Dia Inteiro)
  const isAllDayInitial = !appointment.time || appointment.time.includes("(Dia Inteiro)");
  const cleanTime = appointment.time ? appointment.time.replace(" (Dia Inteiro)", "") : "";
  const initialTimes = (cleanTime || "09:00 - 10:00").split(" - ");
  const [formData, setFormData] = React.useState({
    title: appointment.title || "",
    client_id: appointment.client_id || "",
    date: appointment.date || "",
    startTime: initialTimes[0] || "09:00",
    endTime: initialTimes[1] || "10:00",
    isAllDay: isAllDayInitial,
  });

  // Esc fecha (o hook já é usado por SettingsModal, ConfirmDialog e ui/Modal —
  // justamente o modal mais aberto do sistema estava de fora).
  useModalEsc(onClose);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  // Sem isso a página inteira rolava atrás do modal.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = anterior; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: formData.title,
      date: formData.date,
      time: formData.isAllDay ? "" : `${formData.startTime} - ${formData.endTime}`,
      client_id: formData.client_id || null
    };
    await onSave(payload);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xl animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-label={appointment.id ? "Editar compromisso" : "Novo compromisso"}
    >
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 rounded-[40px] border border-slate-100 dark:border-zinc-800 shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] outline-none"
      >
        <div className="p-8 pb-4 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 mb-1">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Escala de Tempo</span>
            </div>
            <h3 className="text-3xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter leading-none">
              {appointment.id ? "Editar Registro" : "Novo Agendamento"}
            </h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-4 bg-slate-50 dark:bg-zinc-800 rounded-2xl text-slate-400 hover:text-slate-900 transition-all active:scale-90"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-8 overflow-y-auto custom-scrollbar">
          <div>
            <div className="hidden">
              O que faremos?
            </div>
            <input 
              type="text" 
              value={formData.title} 
              autoFocus
              onChange={e => setFormData({...formData, title: e.target.value})} 
              className="w-full px-5 py-4 border border-slate-100 dark:border-zinc-800 rounded-[24px] bg-slate-50 dark:bg-zinc-950/50 text-slate-900 dark:text-zinc-100 focus:ring-4 focus:ring-emerald-600/10 focus:border-emerald-600 font-black text-lg transition-all outline-none" 
              placeholder="Descreva o compromisso..."
              required 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3 px-1">
                Selecionar cliente
              </label>
              <SearchableClientPicker clients={clients} value={formData.client_id} onChange={(id) => setFormData({...formData, client_id: id})} />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3 px-1">
                Quando?
              </label>
              <input 
                type="date"
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
                className="w-full px-5 py-4 border border-slate-100 dark:border-zinc-800 rounded-[24px] bg-slate-50 dark:bg-zinc-950/50 text-slate-900 dark:text-zinc-100 text-sm font-black transition-all focus:ring-4 focus:ring-emerald-600/10 focus:border-emerald-600 outline-none"
              />
              {/* All‑day toggle */}
              <div className="flex items-center mt-3">
                <input
                  id="allDay"
                  type="checkbox"
                  checked={formData.isAllDay}
                  onChange={e => {
                    const checked = e.target.checked;
                    setFormData(prev => ({
                      ...prev,
                      isAllDay: checked,
                      ...(checked ? { startTime: "09:00", endTime: "10:00" } : {}),
                    }));
                  }}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                />
                <label htmlFor="allDay" className="ml-2 text-sm font-black text-slate-400 dark:text-zinc-500">
                  Dia inteiro
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            {/* Show time pickers only when not an all‑day event */}
            {!formData.isAllDay && (
              <>
                <ScrollableTimePicker 
                  label="Check-in"
                  value={formData.startTime}
                  onChange={(val) => setFormData({...formData, startTime: val})}
                />
                <ScrollableTimePicker 
                  label="Check-out"
                  value={formData.endTime}
                  onChange={(val) => setFormData({...formData, endTime: val})}
                />
              </>
            )}
            {formData.isAllDay && (
              <div className="flex items-center justify-center text-sm text-slate-500 dark:text-zinc-400">
                Evento de dia inteiro (sem horário específico)
              </div>
            )}
          </div>

          <div className="pt-4 flex flex-col sm:flex-row gap-4">
            {appointment.id && onDelete && (
              <button 
                type="button" 
                onClick={onDelete} 
                disabled={isSaving}
                className="flex-1 px-8 py-5 rounded-[24px] bg-red-50 dark:bg-red-500/5 text-red-600 dark:text-red-400 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-red-600 hover:text-white transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2 group"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            )}
            <button 
              type="submit" 
              disabled={isSaving}
              className="flex-[2] px-8 py-5 rounded-[24px] bg-slate-900 dark:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl hover:bg-emerald-600 dark:hover:bg-emerald-500 transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2 group"
            >
              {isSaving ? (
                <Clock className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? "Salvando..." : appointment.id ? "Salvar Alterações" : "Agendar Visita"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
