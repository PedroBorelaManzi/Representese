import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useModalEsc } from '../../hooks/useModalEsc';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/* Exclusão de conta pelo próprio usuário (LGPD + exigência das lojas:
   App Store 5.1.1(v) e Google Play exigem um caminho de exclusão de conta
   de dentro do app). Coleta o motivo da saída e uma sugestão de melhoria
   antes de chamar a Edge Function `delete-account`, que:
   - grava o feedback em account_deletion_feedback
   - cancela a assinatura no Asaas (para cobranças futuras; sem reembolso
     de período já pago, mensal ou anual)
   - apaga storage + todas as tabelas do usuário + o usuário do Auth */

const MOTIVOS: { slug: string; label: string }[] = [
  { slug: 'nao_uso', label: 'Não estou usando o suficiente' },
  { slug: 'caro', label: 'Ficou caro pra mim' },
  { slug: 'faltam_recursos', label: 'Faltam funcionalidades que eu preciso' },
  { slug: 'concorrente', label: 'Encontrei outra ferramenta melhor' },
  { slug: 'bugs', label: 'Tive problemas técnicos ou bugs' },
  { slug: 'dificil', label: 'Achei difícil de usar' },
  { slug: 'parei_representar', label: 'Parei de trabalhar como representante' },
  { slug: 'privacidade', label: 'Preocupação com a privacidade dos meus dados' },
  { slug: 'outro', label: 'Outro motivo' },
];

const CONFIRMACAO = 'EXCLUIR';

export const DeleteAccountSection = React.memo(function DeleteAccountSection() {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-10 mt-4 border-t border-slate-100 dark:border-zinc-800">
      <div className="rounded-3xl border border-red-200/70 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950/40 text-red-500 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100 uppercase tracking-wider">
              Excluir minha conta
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium mt-1.5 leading-relaxed">
              Apaga <strong>permanentemente</strong> seus clientes, pedidos, comissões, agenda,
              arquivos e conversas com a IA. Se você tem assinatura ativa, ela é cancelada e
              não há novas cobranças. Não dá pra desfazer.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-red-300 dark:border-red-900/60 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all active:scale-[0.98]"
        >
          Quero excluir minha conta
        </button>
      </div>

      {open && (
        <DeleteAccountModal onClose={() => setOpen(false)} onDeleted={signOut} />
      )}
    </div>
  );
});

function DeleteAccountModal({
  onClose,
  onDeleted,
}: {
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const [melhoria, setMelhoria] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  useModalEsc(() => { if (!loading) onClose(); }, true);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const podeExcluir = !!motivo && confirmText.trim().toUpperCase() === CONFIRMACAO && !loading;

  const handleDelete = async () => {
    if (!podeExcluir) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: {
          reason_category: motivo,
          reason_text: detalhe.trim() || null,
          improvement_text: melhoria.trim() || null,
        },
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.message || 'Erro desconhecido');

      toast.success('Sua conta foi excluída. Sentiremos sua falta!');
      await onDeleted();
    } catch (err: any) {
      console.error('Erro ao excluir conta:', err);
      toast.error(`Não foi possível excluir a conta: ${err.message || 'tente novamente'}`);
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-150',
        shown ? 'opacity-100' : 'opacity-0'
      )}
      onClick={() => { if (!loading) onClose(); }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label="Excluir minha conta"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 sm:p-8 outline-none transition-all duration-150',
          shown ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2.5'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/30 text-red-500 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-zinc-50 leading-tight">
              Excluir minha conta
            </h2>
          </div>
          <button
            type="button"
            onClick={() => { if (!loading) onClose(); }}
            className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-red-50/70 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/40 p-4 text-xs text-slate-600 dark:text-zinc-300 font-medium leading-relaxed space-y-2">
          <p>Ao confirmar, apagamos <strong>para sempre</strong>:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>login, dados da conta e da assinatura;</li>
            <li>clientes, pedidos, comissões e histórico de faturamento;</li>
            <li>compromissos da agenda e conexões com Google/Gmail;</li>
            <li>arquivos enviados e conversas com a IA.</li>
          </ul>
          <p className="text-red-600 dark:text-red-400">
            Se você tem assinatura ativa, ela é cancelada agora e não haverá novas cobranças.
            Valores já pagos (mensais ou anuais) não são reembolsados.
          </p>
        </div>

        {/* Motivo — obrigatório */}
        <div className="mt-6 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            Por que você está excluindo sua conta? <span className="text-red-500">*</span>
          </label>
          <div className="space-y-1.5">
            {MOTIVOS.map((m) => (
              <label
                key={m.slug}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-all text-xs font-bold',
                  motivo === m.slug
                    ? 'border-red-400 bg-red-50 dark:bg-red-950/30 text-slate-900 dark:text-zinc-100'
                    : 'border-slate-100 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:border-slate-200 dark:hover:border-zinc-700'
                )}
              >
                <input
                  type="radio"
                  name="motivo-exclusao"
                  value={m.slug}
                  checked={motivo === m.slug}
                  onChange={() => setMotivo(m.slug)}
                  className="accent-red-500"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        {/* Detalhe do motivo — opcional */}
        <div className="mt-5 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            Quer contar mais? (opcional)
          </label>
          <textarea
            value={detalhe}
            onChange={(e) => setDetalhe(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="O que te levou a essa decisão…"
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl px-4 py-3 text-xs font-medium outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-300 transition-all dark:text-zinc-200 resize-none"
          />
        </div>

        {/* Sugestão de melhoria — opcional, com enquadramento caloroso */}
        <div className="mt-5 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            O que a gente poderia ter feito melhor?
          </label>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium px-1 -mt-1 leading-relaxed">
            A gente lê cada resposta. Se tem algo que faria você repensar — um recurso,
            um preço, um problema que travou seu dia — conta aqui. Ajuda demais.
          </p>
          <textarea
            value={melhoria}
            onChange={(e) => setMelhoria(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Uma ideia, uma crítica, um pedido…"
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl px-4 py-3 text-xs font-medium outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all dark:text-zinc-200 resize-none"
          />
        </div>

        {/* Confirmação digitada */}
        <div className="mt-6 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            Digite <span className="text-red-500">{CONFIRMACAO}</span> para confirmar
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl px-4 py-3 text-sm font-black tracking-widest uppercase outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-300 transition-all dark:text-zinc-200"
            placeholder={CONFIRMACAO}
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-7">
          <button
            type="button"
            onClick={() => { if (!loading) onClose(); }}
            className="flex-1 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-black uppercase tracking-wider transition-all active:scale-[0.98]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!podeExcluir}
            className="flex-1 py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:hover:bg-red-500 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider transition-all active:scale-[0.98] shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Excluindo…' : 'Excluir minha conta para sempre'}
          </button>
        </div>
      </div>
    </div>
  );
}
