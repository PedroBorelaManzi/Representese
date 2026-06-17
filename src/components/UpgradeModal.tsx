import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Crown, Check, ArrowRight, Building2, Upload, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useModalEsc } from '../hooks/useModalEsc';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: 'empresas' | 'importacao' | 'lote' | 'relatorio';
}

const features = {
  empresas: {
    title: 'Mais Representadas',
    description: 'Você atingiu o limite de empresas do seu plano atual.',
    benefit: 'Gerencie até 5 empresas ou tenha empresas ilimitadas ao mesmo tempo.',
    icon: Building2,
    plan: 'Profissional'
  },
  importacao: {
    title: 'Importação Ilimitada',
    description: 'O plano básico permite importar até 50 clientes.',
    benefit: 'Importe listas inteiras via CSV ou Excel sem restrições.',
    icon: Upload,
    plan: 'Profissional'
  },
  lote: {
    title: 'Envio em Lote (IA)',
    description: 'No plano básico você pode enviar 1 pedido por vez.',
    benefit: 'Economize horas enviando até 10 pedidos em um único clique.',
    icon: ArrowRight,
    plan: 'Profissional'
  },
  relatorio: {
    title: 'Relatório BI Master',
    description: 'Entenda qual representada está performando melhor.',
    benefit: 'Acesso a relatórios comparativos e tendências de crescimento.',
    icon: BarChart3,
    plan: 'Master'
  }
};

export default function UpgradeModal({ isOpen, onClose, feature = 'empresas' }: UpgradeModalProps) {
  const info = (features as any)[feature || 'empresas'];
  const Icon = info.icon;

  useModalEsc(onClose, isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-900 rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl relative border border-slate-100 dark:border-zinc-800 z-10"
          >
            <div className="h-32 bg-gradient-to-br from-emerald-600 via-violet-600 to-purple-600 relative overflow-hidden">
               <button 
                  onClick={onClose}
                  className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
               >
                  <X className="w-5 h-5" />
               </button>
               <div className="absolute inset-0 flex items-center justify-center">
                  <div className="p-4 bg-white/10 rounded-3xl backdrop-blur-md border border-white/20">
                     <Crown className="w-8 h-8 text-amber-300" />
                  </div>
               </div>
            </div>

            <div className="p-8 text-center">
               <span className="inline-block px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-full mb-4">
                  Recurso Premium
               </span>
               <h3 className="text-2xl font-black text-slate-900 dark:text-zinc-100 mb-2">
                  {info.title}
               </h3>
               <p className="text-slate-500 dark:text-zinc-400 text-sm mb-8">
                  {info.description}
               </p>

               <div className="bg-slate-50 dark:bg-zinc-950/50 rounded-2xl p-6 mb-8 border border-slate-100 dark:border-zinc-800 text-left">
                  <p className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-4">No plano {info.plan}:</p>
                  <div className="flex items-start gap-3">
                     <div className="p-1.5 bg-emerald-100 dark:bg-emerald-950/30 rounded-lg shrink-0">
                        <Check className="w-4 h-4 text-emerald-600" />
                     </div>
                     <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                        {info.benefit}
                     </p>
                  </div>
               </div>

               <div className="flex flex-col gap-3">
                  <Link
                    to="/planos"
                    onClick={onClose}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm "
                  >
                    Ver Planos e Desbloquear
                  </Link>
                  <button
                    onClick={onClose}
                    className="w-full py-2 text-slate-400 font-bold text-xs"
                  >
                    Talvez mais tarde
                  </button>
               </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
