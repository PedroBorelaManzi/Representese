import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, Phone, Mail, MessageCircle, Users, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logClientFollowup, getMethodLabel, getOutcomeLabel } from '../lib/followupService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface ClientFollowupModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  userId: string;
  onFollowupLogged?: () => void;
}

const METHODS = [
  { value: 'call' as const, label: '📞 Chamada', icon: Phone },
  { value: 'email' as const, label: '📧 E-mail', icon: Mail },
  { value: 'whatsapp' as const, label: '💬 WhatsApp', icon: MessageCircle },
  { value: 'visit' as const, label: '👤 Visita', icon: Users },
];

const OUTCOMES = [
  { value: 'positive' as const, label: '✅ Positivo', color: 'emerald' },
  { value: 'pending' as const, label: '⏳ Pendente', color: 'amber' },
  { value: 'no_response' as const, label: '🔇 Sem resposta', color: 'slate' },
  { value: 'negative' as const, label: '❌ Negativo', color: 'red' },
];

export default function ClientFollowupModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  userId,
  onFollowupLogged
}: ClientFollowupModalProps) {
  const [method, setMethod] = useState<'call' | 'email' | 'whatsapp' | 'visit'>('call');
  const [outcome, setOutcome] = useState<'positive' | 'pending' | 'negative' | 'no_response'>('positive');
  const [notes, setNotes] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!notes.trim()) {
      toast.error('Adicione uma nota sobre o contato');
      return;
    }

    setIsLoading(true);
    try {
      const result = await logClientFollowup(
        userId,
        clientId,
        method,
        notes,
        outcome,
        nextFollowup || null
      );

      if (result) {
        toast.success(`Follow-up registrado com sucesso para ${clientName}!`);
        onFollowupLogged?.();
        onClose();
        // Reset form
        setMethod('call');
        setOutcome('positive');
        setNotes('');
        setNextFollowup('');
      } else {
        toast.error('Erro ao registrar follow-up. Tente novamente.');
      }
    } catch (error) {
      console.error('Error logging followup:', error);
      toast.error('Erro ao registrar follow-up.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-200 dark:border-zinc-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter">Registrar Follow-up</h2>
            <p className="text-xs font-medium text-slate-400 mt-1">{clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Method Selection */}
          <div>
            <label className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-3 block">
              Método de Contato
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    'p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 font-bold text-xs uppercase tracking-widest',
                    method === m.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'
                      : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-zinc-700'
                  )}
                >
                  <m.icon className="w-5 h-5" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Outcome Selection */}
          <div>
            <label className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-3 block">
              Resultado do Contato
            </label>
            <div className="grid grid-cols-2 gap-3">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(o.value)}
                  className={cn(
                    'p-3 rounded-xl border-2 transition-all font-bold text-xs uppercase tracking-widest',
                    outcome === o.value
                      ? `border-${o.color}-500 bg-${o.color}-50 dark:bg-${o.color}-950/20 text-${o.color}-700 dark:text-${o.color}-400`
                      : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-zinc-700'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2 block">
              Notas sobre o Contato
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Descreva o contato: o que conversou, próximos passos, interessante em algum produto..."
              className="w-full p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
              rows={4}
              required
            />
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-2">
              Seja específico para futuras referências
            </p>
          </div>

          {/* Next Followup Date */}
          <div>
            <label className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2 block">
              Próximo Follow-up (Opcional)
            </label>
            <input
              type="date"
              value={nextFollowup}
              onChange={(e) => setNextFollowup(e.target.value)}
              className="w-full p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-2">
              Defina uma data para se lembrar de voltar a contatar este cliente
            </p>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 dark:text-blue-200 font-medium">
              Este registro atualizará o "Último Contato" do cliente e ajudará a rastrear seus follow-ups ao longo do tempo.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !notes.trim()}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Registrar Follow-up
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
