import React, { createContext, useCallback, useContext, useState, ReactNode, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useModalEsc } from '../../hooks/useModalEsc';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { cn } from '../../lib/utils';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' (padrão) para exclusões; 'default' para ações neutras. */
  tone?: 'danger' | 'default';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

/**
 * Substituto do window.confirm no idioma visual do app. Uso:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ message: 'Excluir este cliente?' }))) return;
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  useModalEsc(() => settle(false), !!pending);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, !!pending);

  const tone = pending?.options.tone ?? 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => settle(false)}
          >
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              role="alertdialog"
              aria-modal="true"
              aria-label={pending.options.title || 'Confirmação'}
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 outline-none"
            >
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0',
                    tone === 'danger'
                      ? 'bg-red-50 dark:bg-red-950/30 text-red-500'
                      : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {tone === 'danger' ? <Trash2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div className="min-w-0 pt-0.5">
                  <h2 className="text-base font-black text-slate-900 dark:text-zinc-50 leading-tight">
                    {pending.options.title || (tone === 'danger' ? 'Confirmar exclusão' : 'Confirmar ação')}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium mt-1.5 leading-relaxed">
                    {pending.options.message}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => settle(false)}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-black uppercase tracking-wider transition-all active:scale-[0.98]"
                >
                  {pending.options.cancelLabel || 'Cancelar'}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => settle(true)}
                  className={cn(
                    'flex-1 py-3 rounded-2xl text-white text-xs font-black uppercase tracking-wider transition-all active:scale-[0.98] shadow-lg',
                    tone === 'danger'
                      ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  )}
                >
                  {pending.options.confirmLabel || (tone === 'danger' ? 'Excluir' : 'Confirmar')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
