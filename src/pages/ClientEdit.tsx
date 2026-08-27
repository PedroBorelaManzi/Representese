import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Building2, MapPin, Phone, Mail, Network } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { offlineCache, CacheKeys } from '../lib/offlineCache';
import { syncQueue } from '../lib/syncQueue';
import type { Client } from '../types';

export default function ClientEdit() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingNetworks, setExistingNetworks] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    cnpj: '',
    address: '',
    phone: '',
    email: '',
    network_name: ''
  });

  useEffect(() => {
    loadClient();
  }, [id]);

  useEffect(() => {
    if (!user || !offlineCache.isOnline()) return;
    supabase
      .from('clients')
      .select('network_name')
      .eq('user_id', user.id)
      .not('network_name', 'is', null)
      .then(({ data }) => {
        const nomes = Array.from(new Set((data || []).map((r) => r.network_name).filter((n): n is string => !!n?.trim())));
        setExistingNetworks(nomes);
      });
  }, [user]);

  const loadClient = async () => {
    try {
      // Offline: usa o retrato da última sincronização (mesmo padrão do
      // ClientDetails.tsx) em vez de tentar a rede e mandar o usuário de
      // volta pra lista antes dele nem conseguir ver os dados do cliente.
      if (!offlineCache.isOnline()) {
        const cachedClients = offlineCache.get<Client[]>(CacheKeys.CLIENTS) || [];
        const cached = cachedClients.find((c) => c.id === id);
        if (cached) {
          setFormData({
            name: cached.name || '',
            cnpj: cached.cnpj || '',
            address: cached.address || '',
            phone: cached.phone || '',
            email: cached.email || '',
            network_name: cached.network_name || ''
          });
        } else {
          toast.error('Cliente ainda não sincronizado — conecte à internet uma vez pra editar offline.');
          navigate('/dashboard/clientes');
        }
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (data) {
        setFormData({
          name: data.name || '',
          cnpj: data.cnpj || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          network_name: data.network_name || ''
        });
      }
    } catch (err) {
      toast.error('Erro ao carregar dados do cliente');
      navigate('/dashboard/clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('O nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (!offlineCache.isOnline()) {
        syncQueue.enqueue('clients', 'UPDATE', formData, id);
        const cachedClients = offlineCache.get<Client[]>(CacheKeys.CLIENTS) || [];
        const idx = cachedClients.findIndex((c) => c.id === id);
        if (idx >= 0) {
          cachedClients[idx] = { ...cachedClients[idx], ...formData };
          offlineCache.set(CacheKeys.CLIENTS, cachedClients);
        }
        toast.success('Cliente atualizado offline — sincroniza quando a internet voltar.');
        navigate(`/dashboard/clientes/${id}`);
        return;
      }

      const { error } = await supabase
        .from('clients')
        .update(formData)
        .eq('id', id);

      if (error) throw error;
      toast.success('Cliente atualizado com sucesso!');
      navigate(`/dashboard/clientes/${id}`);
    } catch (err) {
      toast.error('Erro ao atualizar cliente');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-600 opacity-20" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-20 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-4">
        <button 
          onClick={() => navigate(`/dashboard/clientes/${id}`)} 
          className="p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl text-slate-400 hover:text-emerald-600 transition-all shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter">Editar Cliente</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Atualizar informações cadastrais</p>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-200 dark:border-zinc-800 shadow-sm p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nome da Empresa</label>
            <div className="relative">
              <Building2 className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full pl-16 pr-6 py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-zinc-100"
                placeholder="Nome da empresa..."
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">CNPJ</label>
            <div className="relative">
              <Building2 className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type="text"
                value={formData.cnpj}
                onChange={e => setFormData({ ...formData, cnpj: e.target.value })}
                className="w-full pl-16 pr-6 py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-zinc-100"
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Rede (opcional)</label>
            <div className="relative">
              <Network className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type="text"
                list="redes-existentes"
                value={formData.network_name}
                onChange={e => setFormData({ ...formData, network_name: e.target.value })}
                className="w-full pl-16 pr-6 py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-zinc-100"
                placeholder="Ex.: Rede Supermercados ABC"
              />
              <datalist id="redes-existentes">
                {existingNetworks.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
            <p className="text-[10px] font-bold text-slate-400 px-2 normal-case leading-relaxed">
              Use o mesmo nome de rede em matriz e filiais que compram por um lugar só — as demais deixam de aparecer como inativas enquanto a rede estiver comprando.
            </p>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Endereço</label>
            <div className="relative">
              <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type="text"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="w-full pl-16 pr-6 py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-zinc-100"
                placeholder="Rua, número, bairro..."
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Telefone</label>
            <div className="relative">
              <Phone className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full pl-16 pr-6 py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-zinc-100"
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full pl-16 pr-6 py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-zinc-100"
                placeholder="email@empresa.com.br"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 dark:border-zinc-800">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[24px] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
