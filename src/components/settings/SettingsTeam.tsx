import React, { useEffect, useState } from 'react';
import { Users, Link as LinkIcon, Copy, Trash2, KeyRound, Plus, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { setIntakePin } from '../../lib/orderIntakeClient';
import { useConfirm } from '../ui';

interface IntakeLink {
  id: string;
  token: string;
  label: string;
  active: boolean;
  pin_hash: string | null;
  created_at: string;
}

/** Um PIN de 6 dígitos gerado aqui mesmo — mais fácil pro representante só
 *  aceitar o sugerido do que ter que inventar e decorar um novo toda vez. */
function randomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const SettingsTeam = React.memo(function SettingsTeam() {
  const { user } = useAuth();
  const confirm = useConfirm();

  const [links, setLinks] = useState<IntakeLink[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPin, setNewPin] = useState(randomPin());
  const [savingNew, setSavingNew] = useState(false);

  const [rotatingPinFor, setRotatingPinFor] = useState<string | null>(null);
  const [rotatePin, setRotatePin] = useState('');
  const [savingRotate, setSavingRotate] = useState(false);

  const loadLinks = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('order_intake_links')
      .select('id, token, label, active, pin_hash, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error) setLinks((data as IntakeLink[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/enviar/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado!');
    } catch {
      toast.error('Não consegui copiar. Copie manualmente: ' + url);
    }
  };

  const handleCreate = async () => {
    if (!user) return;
    const label = newLabel.trim() || 'Link para pedidos';
    if (!/^\d{6}$/.test(newPin)) {
      toast.error('O PIN precisa ter 6 dígitos.');
      return;
    }
    setSavingNew(true);
    let created: { id: string } | null = null;
    try {
      const { data, error } = await supabase
        .from('order_intake_links')
        .insert([{ user_id: user.id, label }])
        .select('id')
        .single();
      if (error || !data) throw error || new Error('Erro ao criar link.');
      created = data;

      // Recarrega assim que o link existe no banco — antes disso ficava só no
      // catch abaixo, então se o passo do PIN falhasse (ou demorasse), o link
      // recém-criado ficava invisível na lista até a página ser recarregada
      // na mão, mesmo já existindo de verdade.
      await loadLinks();

      await setIntakePin(created.id, newPin);

      toast.success('Link criado! Copie e envie pro funcionário.');
      setIsCreating(false);
      setNewLabel('');
      setNewPin(randomPin());
    } catch (err: any) {
      if (created) {
        // O link já está na lista (Sem PIN ainda); só o PIN falhou — dá pra
        // definir de novo pelo botão "Definir PIN" ali, sem recriar o link.
        toast.error((err.message || 'Erro ao definir o PIN.') + ' O link foi criado — defina o PIN pela lista abaixo.');
      } else {
        toast.error(err.message || 'Erro ao criar link.');
      }
    } finally {
      setSavingNew(false);
    }
  };

  const handleRotatePin = async (linkId: string) => {
    if (!/^\d{6}$/.test(rotatePin)) {
      toast.error('O PIN precisa ter 6 dígitos.');
      return;
    }
    setSavingRotate(true);
    try {
      await setIntakePin(linkId, rotatePin);
      toast.success('PIN atualizado — sessões abertas com o PIN antigo param de funcionar na hora.');
      setRotatingPinFor(null);
      setRotatePin('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao trocar o PIN.');
    } finally {
      setSavingRotate(false);
    }
  };

  const toggleActive = async (link: IntakeLink) => {
    const { error } = await supabase.from('order_intake_links').update({ active: !link.active }).eq('id', link.id);
    if (error) {
      toast.error('Erro ao atualizar o link.');
      return;
    }
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, active: !l.active } : l)));
    toast.success(link.active ? 'Link desativado — para de funcionar na hora.' : 'Link reativado.');
  };

  const handleDelete = async (link: IntakeLink) => {
    if (!(await confirm({ title: 'Excluir link', message: `Excluir "${link.label}"? Quem tiver esse link não vai mais conseguir enviar pedidos por ele.` }))) return;
    const { error } = await supabase.from('order_intake_links').delete().eq('id', link.id);
    if (error) {
      toast.error('Erro ao excluir o link.');
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
    toast.success('Link excluído.');
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Equipe</h2>
        <p className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
          Links pra um funcionário só enviar pedidos, sem ver nada da sua conta
        </p>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          links.map((link) => (
            <div key={link.id} className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm shrink-0 ${link.active ? 'text-emerald-500' : 'text-slate-300 dark:text-zinc-600'}`}>
                    <LinkIcon className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white truncate">{link.label}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                      {link.active ? 'Ativo' : 'Desativado'} · {link.pin_hash ? 'PIN definido' : 'Sem PIN ainda'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(link)}
                  className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${link.active ? 'bg-red-50 dark:bg-red-900/20 text-red-500' : 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'}`}
                >
                  {link.active ? 'Desativar' : 'Ativar'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => copyLink(link.token)}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-zinc-300 hover:border-emerald-300 hover:text-emerald-600 transition-all"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar link
                </button>
                <button
                  onClick={() => { setRotatingPinFor(rotatingPinFor === link.id ? null : link.id); setRotatePin(randomPin()); }}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-zinc-300 hover:border-emerald-300 hover:text-emerald-600 transition-all"
                >
                  <KeyRound className="w-3.5 h-3.5" /> {link.pin_hash ? 'Trocar PIN' : 'Definir PIN'}
                </button>
                <button
                  onClick={() => handleDelete(link)}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:border-red-300 hover:text-red-500 transition-all ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              </div>

              <AnimatePresence>
                {rotatingPinFor === link.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-4 border-t border-slate-200 dark:border-zinc-800 space-y-3 overflow-hidden"
                  >
                    <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase leading-relaxed">
                      Novo PIN de 6 dígitos — anote pra passar pro funcionário. O PIN antigo para de funcionar assim que você confirmar.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={rotatePin}
                        onChange={(e) => setRotatePin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="flex-1 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-black tracking-[0.3em] text-center outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
                      />
                      <button
                        onClick={() => handleRotatePin(link.id)}
                        disabled={savingRotate}
                        className="bg-emerald-600 text-white px-6 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
                      >
                        {savingRotate ? 'Salvando...' : 'Confirmar'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}

        {!isCreating ? (
          <button
            onClick={() => { setIsCreating(true); setNewPin(randomPin()); }}
            className="w-full flex items-center justify-center gap-2 p-4 md:p-6 rounded-2xl md:rounded-[32px] border-2 border-dashed border-slate-200 dark:border-zinc-800 text-slate-400 hover:border-emerald-300 hover:text-emerald-600 transition-all text-[10px] font-black uppercase tracking-widest"
          >
            <Plus className="w-4 h-4" /> Novo link
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-xs md:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Novo link</h3>
              </div>
              <button onClick={() => setIsCreating(false)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Nome do link (opcional)</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: João da expedição"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">PIN de 6 dígitos</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-black tracking-[0.3em] text-center outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
              />
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight px-1">Já sugerimos um — pode trocar se preferir.</p>
            </div>

            <button
              onClick={handleCreate}
              disabled={savingNew}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {savingNew ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {savingNew ? 'Criando...' : 'Criar link'}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
});
