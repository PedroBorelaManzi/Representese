import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

/* Relatórios (só admin): fechamento do mês, histórico mês a mês e custos/assinaturas.
 * Fontes: RPC admin_monthly_report (leads, contas, anúncios e custos fixos por mês), tabela
 * finance_costs (assinaturas, domínios, lojas, planos grátis) e ads_campaigns (campanhas).
 * Anúncios: o gasto de cada campanha é dividido igualmente pelos dias do período.
 * Assinaturas anuais/bienais entram rateadas por mês (competência), não no mês da cobrança. */

type Linha = {
  month: string; leads: number; leads_converted: number; accounts: number; ads_meta: number; ads_google: number; fixed_costs: number;
  rev_gross: number; rev_fees: number; rev_net: number; rev_real_gross: number; rev_real_net: number; payers: number;
  /** Receita líquida (já sem taxa do Asaas e comissão das lojas): é a entrada usada no resultado. */
  revenue: number;
};
type Pagamento = {
  id: string; provider: 'asaas' | 'apple' | 'google'; customer_name: string | null; plan_id: string | null;
  gross_brl: number; fee_brl: number; net_brl: number; fee_pct: number | null; paid_at: string; is_test: boolean; note: string | null;
};
const CANAL: Record<Pagamento['provider'], string> = { asaas: 'Site (Asaas)', apple: 'App Store (Apple)', google: 'Google Play' };
type Custo = {
  id: string;
  kind: 'custo' | 'receita';
  name: string;
  category: string;
  cycle: 'monthly' | 'annual' | 'biennial' | 'one_time' | 'free';
  amount_brl: number | null;
  amount_usd: number | null;
  started_on: string | null;
  ends_on: string | null;
  status: 'confirmado' | 'estimado' | 'a_confirmar';
  note: string | null;
};
type Campanha = {
  id: string;
  platform: 'meta' | 'google';
  name: string;
  status: string;
  period_from: string | null;
  period_to: string | null;
  spend: number | null;
  result_label: string | null;
  result_value: number | null;
};

const brl = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const mesLabel = (iso: string) => {
  const t = new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const mesCurto = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
const dia = (iso: string | null) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

const CICLO: Record<Custo['cycle'], string> = { monthly: 'Mensal', annual: 'Anual', biennial: 'A cada 2 anos', one_time: 'Única', free: 'Grátis' };
const STATUS: Record<Custo['status'], { label: string; cls: string }> = {
  confirmado: { label: 'Confirmado', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30' },
  estimado: { label: 'Estimado', cls: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30' },
  a_confirmar: { label: 'A confirmar', cls: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/30' },
};

/** Cotação de reserva, usada só se a busca da cotação do dia falhar (câmbio do recibo do ElevenLabs). */
const DOLAR_RESERVA = 5.56;

/** Valor do item em reais: itens em dólar usam a cotação do dia. */
function emReais(c: Custo, dolar: number): number | null {
  return c.amount_usd != null ? c.amount_usd * dolar : c.amount_brl;
}

/** Quanto o item pesa por mês (rateio). Única e grátis não entram no custo mensal recorrente. */
function porMes(c: Custo, dolar: number): number {
  const v = emReais(c, dolar);
  if (c.kind !== 'custo' || v == null) return 0;
  if (c.cycle === 'monthly') return v;
  if (c.cycle === 'annual') return v / 12;
  if (c.cycle === 'biennial') return v / 24;
  return 0;
}

/** Quanto o item custa dentro de um mês específico (mesmo critério do relatório: anuais ÷ 12, de 2 anos ÷ 24, única só no mês da cobrança). */
function custoNoMes(c: Custo, mes: string, dolar: number): number {
  const v = emReais(c, dolar);
  if (c.kind !== 'custo' || v == null || !c.started_on) return 0;
  const [y, m] = mes.slice(0, 7).split('-').map(Number);
  const [y0, m0] = c.started_on.slice(0, 7).split('-').map(Number);
  const diff = (y - y0) * 12 + (m - m0);
  if (c.cycle === 'monthly') return diff >= 0 && (!c.ends_on || c.ends_on.slice(0, 7) >= mes.slice(0, 7)) ? v : 0;
  if (c.cycle === 'annual') return diff >= 0 && diff < 12 ? v / 12 : 0;
  if (c.cycle === 'biennial') return diff >= 0 && diff < 24 ? v / 24 : 0;
  if (c.cycle === 'one_time') return diff === 0 ? v : 0;
  return 0;
}

/** Parte do gasto da campanha que cai no mês (divisão igual pelos dias do período). */
function gastoNoMes(c: Campanha, mes: string): number {
  if (!c.spend || !c.period_from || !c.period_to) return 0;
  const ini = Date.parse(mes);
  const d = new Date(ini);
  const fim = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
  const de = Math.max(Date.parse(c.period_from), ini);
  const ate = Math.min(Date.parse(c.period_to), fim);
  if (ate < de) return 0;
  const total = (Date.parse(c.period_to) - Date.parse(c.period_from)) / 86400000 + 1;
  return (c.spend * ((ate - de) / 86400000 + 1)) / total;
}

const card = 'rounded-2xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm';
const th = 'px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500';
const td = 'px-4 py-3 align-top';

function Resumo({ titulo, valor, destaque, nota }: { titulo: string; valor: string; destaque?: 'ruim' | 'bom'; nota?: string }) {
  return (
    <div className={cn(card, 'p-4')}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={cn('mt-1 text-2xl font-bold', destaque === 'ruim' ? 'text-rose-600' : destaque === 'bom' ? 'text-emerald-600' : 'text-slate-900 dark:text-white')}>{valor}</p>
      {nota && <p className="mt-1 text-xs text-slate-500">{nota}</p>}
    </div>
  );
}

export default function MonthlyReports() {
  const [sub, setSub] = useState<'fechamento' | 'historico' | 'custos'>('fechamento');
  const [mesSel, setMesSel] = useState<string | null>(null);
  // Parte do lucro que o Pedro quer reinvestir (só uma conveniência de leitura; fica salva neste navegador).
  const [pctInvest, setPctInvest] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('rs_relatorio_pct_invest'));
      return Number.isFinite(v) && v >= 0 && v <= 100 && localStorage.getItem('rs_relatorio_pct_invest') !== null ? v : 30;
    } catch {
      return 30;
    }
  });
  const mudarPct = (v: number) => {
    const n = Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));
    setPctInvest(n);
    try { localStorage.setItem('rs_relatorio_pct_invest', String(n)); } catch { /* sem armazenamento: só não lembra */ }
  };
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const qc = useQueryClient();

  // Cotação do dia (dólar comercial, AwesomeAPI). Se falhar, usa a de reserva e avisa na tela.
  const { data: cot, isFetched: cotBuscada } = useQuery({
    queryKey: ['usd_brl'],
    queryFn: async () => {
      const r = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL');
      if (!r.ok) throw new Error('cotação indisponível');
      const j = await r.json();
      const bid = Number(j?.USDBRL?.bid);
      if (!(bid > 0)) throw new Error('cotação inválida');
      return { rate: bid, at: String(j.USDBRL.create_date ?? '') };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnMount: 'always',
  });
  const dolar = cot?.rate ?? DOLAR_RESERVA;

  const { data: linhas, isLoading, error } = useQuery({
    queryKey: ['admin_monthly_report_v3', dolar],
    enabled: cotBuscada,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_monthly_report_v3', { p_usd_rate: dolar });
      if (error) throw error;
      return ((data ?? []) as Linha[]).map((l) => ({
        ...l,
        ads_meta: Number(l.ads_meta),
        ads_google: Number(l.ads_google),
        fixed_costs: Number(l.fixed_costs),
        rev_gross: Number(l.rev_gross),
        rev_fees: Number(l.rev_fees),
        rev_net: Number(l.rev_net),
        rev_real_gross: Number(l.rev_real_gross),
        rev_real_net: Number(l.rev_real_net),
        revenue: Number(l.rev_net),
      }));
    },
    staleTime: 0,
  });
  const { data: custos } = useQuery({
    queryKey: ['finance_costs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('finance_costs').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Custo[]).map((c) => ({
        ...c,
        amount_brl: c.amount_brl == null ? null : Number(c.amount_brl),
        amount_usd: c.amount_usd == null ? null : Number(c.amount_usd),
      }));
    },
    staleTime: 0,
  });
  // Ao abrir a aba, puxa do Asaas o que for novo (incremental). Apple e Google Play já entram sozinhos pelas compras do app.
  const sync = useQuery({
    queryKey: ['sync_revenue'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-revenue', { body: {} });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['admin_monthly_report_v3'] });
      qc.invalidateQueries({ queryKey: ['subscription_payments'] });
      return { at: new Date(), novos: Number((data as { asaas_payments?: number } | null)?.asaas_payments ?? 0) };
    },
    staleTime: 0,
    gcTime: 0,
    retry: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const { data: pagamentos } = useQuery({
    queryKey: ['subscription_payments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscription_payments').select('*').eq('is_test', false).order('paid_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Pagamento[]).map((x) => ({ ...x, gross_brl: Number(x.gross_brl), fee_brl: Number(x.fee_brl), net_brl: Number(x.net_brl) }));
    },
    staleTime: 0,
  });
  const { data: campanhas } = useQuery({
    queryKey: ['ads_campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ads_campaigns').select('*').order('period_from', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Campanha[]).map((c) => ({ ...c, spend: c.spend == null ? null : Number(c.spend) }));
    },
    staleTime: 0,
  });

  const salvar = useMutation({
    mutationFn: async (c: Custo) => {
      const amount = Number(valor.replace(',', '.'));
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Valor inválido');
      const { error } = await supabase
        .from('finance_costs')
        .update({ amount_brl: amount, started_on: data || c.started_on, status: 'confirmado' })
        .eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Valor salvo');
      setEditando(null);
      qc.invalidateQueries({ queryKey: ['finance_costs'] });
      qc.invalidateQueries({ queryKey: ['admin_monthly_report_v3'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Não foi possível salvar'),
  });

  const meses = linhas ?? [];
  const mes = mesSel ?? (meses.length ? meses[meses.length - 1].month : null);
  const atual = meses.find((l) => l.month === mes) ?? null;
  const pendentes = (custos ?? []).filter((c) => c.status === 'a_confirmar');
  const totalMensal = (custos ?? []).reduce((s, c) => s + porMes(c, dolar), 0);

  const doMes = useMemo(
    () =>
      mes
        ? (campanhas ?? [])
            .map((c) => ({ c, gasto: gastoNoMes(c, mes) }))
            .filter((x) => x.gasto > 0)
            .sort((a, b) => b.gasto - a.gasto)
        : [],
    [campanhas, mes],
  );

  const grafico = meses.map((l) => ({
    mes: mesCurto(l.month),
    Meta: l.ads_meta,
    Google: l.ads_google,
    'Custos fixos': l.fixed_costs,
    'Receita líquida': l.revenue,
    Resultado: Math.round((l.revenue - l.ads_meta - l.ads_google - l.fixed_costs) * 100) / 100,
  }));
  // Entrada líquida do mês mais recente (assinaturas pagas: Asaas, App Store, Google Play, já sem taxas e comissões).
  const receitaMensalHoje = meses.length ? meses[meses.length - 1].revenue : 0;
  const tot = meses.reduce(
    (t, l) => ({ leads: t.leads + l.leads, meta: t.meta + l.ads_meta, google: t.google + l.ads_google, fixo: t.fixo + l.fixed_costs, rec: t.rec + l.revenue }),
    { leads: 0, meta: 0, google: 0, fixo: 0, rec: 0 },
  );

  const SUBS: { id: typeof sub; label: string }[] = [
    { id: 'fechamento', label: 'Fechamento do mês' },
    { id: 'historico', label: 'Histórico mês a mês' },
    { id: 'custos', label: 'Assinaturas e custos' },
  ];

  if (!cotBuscada || isLoading) return <div className="py-20 text-center text-slate-400">Carregando relatórios…</div>;
  if (error) return <div className="py-20 text-center text-rose-600">Não foi possível carregar os relatórios.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist">
        {SUBS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={sub === s.id}
            onClick={() => setSub(s.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold border transition-colors',
              sub === s.id
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-zinc-900 dark:border-white'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="text-xs text-slate-500">
        {cot ? (
          <>Dólar hoje: <b>{brl(cot.rate)}</b>{cot.at ? ` (cotação de ${cot.at.slice(8, 10)}/${cot.at.slice(5, 7)} às ${cot.at.slice(11, 16)})` : ''}. Itens em dólar usam essa cotação toda vez que a aba abre.</>
        ) : (
          <span className="text-amber-700">Não foi possível buscar a cotação do dia; usando {brl(DOLAR_RESERVA)} por dólar.</span>
        )}
      </div>

      <div className="text-xs text-slate-500" aria-live="polite">
        {sync.isFetching
          ? 'Atualizando as receitas do Asaas…'
          : sync.isError
            ? <span className="text-amber-700">Não foi possível atualizar o Asaas agora; mostrando o que já estava salvo. App Store e Google Play entram sozinhos a cada compra.</span>
            : sync.data
              ? `Receitas atualizadas às ${sync.data.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (Asaas puxado agora; App Store e Google Play entram sozinhos a cada compra).`
              : null}
      </div>

      {pendentes.length > 0 && (
        <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <b>{pendentes.length} item(ns) sem valor:</b> {pendentes.map((p) => p.name).join('; ')}. Preencha na aba "Assinaturas e custos" para entrarem nos totais.
        </div>
      )}

      {sub === 'fechamento' && atual && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-slate-600 dark:text-zinc-300" htmlFor="mes-rel">Mês</label>
            <select
              id="mes-rel"
              value={mes ?? ''}
              onChange={(e) => setMesSel(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
            >
              {[...meses].reverse().map((l) => (
                <option key={l.month} value={l.month}>{mesLabel(l.month)}</option>
              ))}
            </select>
          </div>

          {(() => {
            const mesKey = (mes ?? '').slice(0, 7);
            const doMesPag = (pagamentos ?? []).filter((x) => x.paid_at.slice(0, 7) === mesKey);
            const canais = (['asaas', 'apple', 'google'] as const).map((canal) => {
              const lista = doMesPag.filter((x) => x.provider === canal);
              const g = lista.reduce((t, x) => t + x.gross_brl, 0);
              const f = lista.reduce((t, x) => t + x.fee_brl, 0);
              return { canal, n: lista.length, g, f, liq: g - f };
            });
            const bruta = canais.reduce((t, c) => t + c.g, 0);
            const taxas = canais.reduce((t, c) => t + c.f, 0);
            const entrada = bruta - taxas;
            const itens = (custos ?? [])
              .map((c) => ({ c, v: custoNoMes(c, mes ?? '', dolar) }))
              .filter((x) => x.v > 0.004)
              .sort((a, b) => b.v - a.v);
            const fixos = itens.reduce((t, x) => t + x.v, 0);
            const saida = atual.ads_meta + atual.ads_google + fixos;
            const resultado = entrada - saida;
            const Linha2 = ({ nome, valor, sub, forte }: { nome: string; valor: string; sub?: string; forte?: boolean }) => (
              <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 dark:border-zinc-800 last:border-0">
                <div className="min-w-0">
                  <p className={cn('text-sm', forte ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-zinc-300')}>{nome}</p>
                  {sub && <p className="text-xs text-slate-500">{sub}</p>}
                </div>
                <p className={cn('text-sm whitespace-nowrap', forte ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-zinc-300')}>{valor}</p>
              </div>
            );
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={cn(card, 'p-5 border-t-4 border-t-emerald-500')}>
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Entrada · o que entrou</p>
                    <p className="text-3xl font-black text-emerald-600 mt-1">{brl(entrada)}</p>
                    <p className="text-xs text-slate-500 mb-3">Receita das assinaturas já sem as taxas do Asaas e as comissões da Apple e do Google</p>
                    {canais.map((c) => (
                      <Linha2
                        key={c.canal}
                        nome={CANAL[c.canal]}
                        valor={brl(c.liq)}
                        sub={c.n > 0 ? `${c.n} pagamento(s): ${brl(c.g)} − ${brl(c.f)} de ${c.canal === 'asaas' ? 'taxa' : 'comissão'} (${c.g > 0 ? ((c.f / c.g) * 100).toFixed(0) : 0}%)` : 'Nenhum pagamento no mês'}
                      />
                    ))}
                    <Linha2 nome="Total pago pelos clientes (bruto)" valor={brl(bruta)} />
                    <Linha2 nome="(−) Taxas e comissões" valor={brl(taxas)} />
                    <Linha2 nome="Total de entrada" valor={brl(entrada)} forte />
                    {doMesPag.length > 0 && (
                      <div className="mt-3 text-xs text-slate-500 space-y-1">
                        {doMesPag.map((x) => (
                          <p key={x.id}>{dia(x.paid_at)} · {x.customer_name ?? 'Sem nome'} · plano {x.plan_id ?? '?'} · {brl(x.gross_brl)}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={cn(card, 'p-5 border-t-4 border-t-rose-500')}>
                    <p className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">Saída · o que gastamos</p>
                    <p className="text-3xl font-black text-rose-600 mt-1">{brl(saida)}</p>
                    <p className="text-xs text-slate-500 mb-3">Anúncios mais assinaturas e custos fixos do mês</p>
                    <Linha2 nome="Anúncios e impulsionamento" valor={brl(atual.ads_meta + atual.ads_google)} sub={`Meta ${brl(atual.ads_meta)} · Google ${brl(atual.ads_google)}`} />
                    <Linha2 nome="Custos fixos" valor={brl(fixos)} sub={`${itens.length} itens (assinaturas, domínios, lojas e infraestrutura)`} />
                    <button type="button" onClick={() => setSub('custos')} className="mt-1 text-xs font-semibold text-emerald-700 underline">
                      Ver quais são os custos fixos
                    </button>
                    <Linha2 nome="Total de saída" valor={brl(saida)} forte />
                  </div>
                </div>

                <div className={cn('rounded-2xl p-5 text-center border-2', resultado < 0 ? 'border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/40' : 'border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/40')}>
                  <p className="text-sm text-slate-600 dark:text-zinc-300">
                    Entrada <b>{brl(entrada)}</b> − Saída <b>{brl(saida)}</b> =
                  </p>
                  <p className={cn('mt-1 text-4xl font-black', resultado < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                    {resultado < 0 ? 'Prejuízo de ' : 'Lucro de '}{brl(Math.abs(resultado))}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Leads convertidos (pagaram): {atual.leads_converted} de {atual.leads}
                    {atual.leads_converted > 0 ? ` · custo por lead convertido ${brl(saida / atual.leads_converted)}` : ''}
                  </p>
                </div>

                <div className={cn(card, 'p-5 border-t-4 border-t-sky-500')}>
                  <p className="text-xs font-bold uppercase tracking-wide text-sky-700 dark:text-sky-400">Investimentos · uso do lucro</p>
                  {resultado > 0 ? (
                    <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-3">
                      <label className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
                        Reinvestir quanto do lucro (%)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={pctInvest}
                          onChange={(e) => mudarPct(Number(e.target.value))}
                          className="mt-1 block w-24 rounded-lg border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                        />
                      </label>
                      <div>
                        <p className="text-xs text-slate-500">Para investir ({pctInvest}% do lucro)</p>
                        <p className="text-2xl font-black text-sky-700 dark:text-sky-400">{brl((resultado * pctInvest) / 100)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Fica no caixa</p>
                        <p className="text-2xl font-black text-slate-900 dark:text-white">{brl(resultado - (resultado * pctInvest) / 100)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
                      Sem lucro neste mês, então não há o que investir. Quando o mês fechar com lucro, aqui aparece quanto reinvestir (anúncios, ferramentas ou novas ideias) e quanto fica no caixa.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          <div className={cn(card, 'overflow-x-auto')}>
            <div className="px-4 pt-4 font-bold text-slate-900 dark:text-white">Campanhas no mês</div>
            <table className="w-full text-left text-sm mt-2">
              <thead><tr className="border-b border-slate-200 dark:border-zinc-700"><th className={th}>Campanha</th><th className={th}>Plataforma</th><th className={th}>Situação</th><th className={cn(th, 'text-right')}>Gasto no mês</th><th className={th}>Resultado</th></tr></thead>
              <tbody>
                {doMes.length === 0 && <tr><td className={td} colSpan={5}>Nenhum gasto com anúncios neste mês.</td></tr>}
                {doMes.map(({ c, gasto }) => (
                  <tr key={c.id} className="border-b border-slate-100 dark:border-zinc-800">
                    <td className={td}>{c.name}</td>
                    <td className={td}>{c.platform === 'meta' ? 'Meta' : 'Google'}</td>
                    <td className={td}>{c.status}</td>
                    <td className={cn(td, 'text-right whitespace-nowrap')}>{brl(gasto)}</td>
                    <td className={td}>{c.result_value != null ? `${c.result_value} ${c.result_label ?? ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Os leads vêm do formulário do site (tabela leads). O gasto de cada campanha é dividido igualmente pelos dias do período; campanhas
            com datas estimadas ou sem atualização recente podem estar fora do valor real. A receita vem dos pagamentos reais (Asaas, App Store e Google Play); contas de teste ficam de fora.
          </p>
        </div>
      )}

      {sub === 'historico' && (
        <div className="space-y-6">
          <div className={cn(card, 'p-4')}>
            <p className="font-bold text-slate-900 dark:text-white mb-3">Entradas, saídas e resultado por mês</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={grafico}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$ ${v}`} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Legend />
                  <Bar dataKey="Receita líquida" fill="#0ea5e9" />
                  <Bar dataKey="Meta" stackId="a" fill="#6366f1" />
                  <Bar dataKey="Google" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="Custos fixos" stackId="a" fill="#10b981" />
                  <Line type="monotone" dataKey="Resultado" stroke="#e11d48" strokeWidth={2} dot />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className={cn(card, 'overflow-x-auto')}>
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-700">
                  <th className={th}>Mês</th>
                  <th className={cn(th, 'text-right')}>Receita bruta</th><th className={cn(th, 'text-right')}>Taxas e comissões</th><th className={cn(th, 'text-right')}>Receita líquida</th>
                  <th className={cn(th, 'text-right')}>Total saída</th><th className={cn(th, 'text-right')}>Resultado (lucro/prejuízo)</th>
                  <th className={cn(th, 'text-right')}>Leads convertidos</th><th className={cn(th, 'text-right')}>Custo por lead convertido</th>
                  <th className={cn(th, 'text-right')}>Leads (entradas)</th><th className={cn(th, 'text-right')}>Contas criadas</th>
                  <th className={cn(th, 'text-right')}>Meta</th><th className={cn(th, 'text-right')}>Google</th><th className={cn(th, 'text-right')}>Custos fixos</th>
                </tr>
              </thead>
              <tbody>
                {[...meses].reverse().map((l) => {
                  const total = l.ads_meta + l.ads_google + l.fixed_costs;
                  const resultado = l.revenue - total;
                  return (
                    <tr key={l.month} className="border-b border-slate-100 dark:border-zinc-800">
                      <td className={td}>{mesLabel(l.month)}</td>
                      <td className={cn(td, 'text-right text-sky-700 dark:text-sky-400')}>{brl(l.rev_gross)}</td>
                      <td className={cn(td, 'text-right')}>{brl(l.rev_fees)}</td>
                      <td className={cn(td, 'text-right font-semibold text-sky-700 dark:text-sky-400')}>{brl(l.rev_net)}</td>
                      <td className={cn(td, 'text-right font-semibold')}>{brl(total)}</td>
                      <td className={cn(td, 'text-right font-bold', resultado < 0 ? 'text-rose-600' : 'text-emerald-600')}>{brl(resultado)}</td>
                      <td className={cn(td, 'text-right font-semibold')}>{l.leads_converted}</td>
                      <td className={cn(td, 'text-right')}>{l.leads_converted ? brl(total / l.leads_converted) : '—'}</td>
                      <td className={cn(td, 'text-right')}>{l.leads}</td>
                      <td className={cn(td, 'text-right')}>{l.accounts}</td>
                      <td className={cn(td, 'text-right')}>{brl(l.ads_meta)}</td>
                      <td className={cn(td, 'text-right')}>{brl(l.ads_google)}</td>
                      <td className={cn(td, 'text-right')}>{brl(l.fixed_costs)}</td>
                    </tr>
                  );
                })}
                {(() => {
                  const saidaTotal = tot.meta + tot.google + tot.fixo;
                  const gross = meses.reduce((t, l) => t + l.rev_gross, 0);
                  const fees = meses.reduce((t, l) => t + l.rev_fees, 0);
                  const conv = meses.reduce((t, l) => t + l.leads_converted, 0);
                  const resFinal = tot.rec - saidaTotal;
                  return (
                    <>
                      <tr className="bg-slate-50 dark:bg-zinc-800/60 font-bold">
                        <td className={td}>Total</td>
                        <td className={cn(td, 'text-right text-sky-700 dark:text-sky-400')}>{brl(gross)}</td>
                        <td className={cn(td, 'text-right')}>{brl(fees)}</td>
                        <td className={cn(td, 'text-right text-sky-700 dark:text-sky-400')}>{brl(tot.rec)}</td>
                        <td className={cn(td, 'text-right')}>{brl(saidaTotal)}</td>
                        <td className={cn(td, 'text-right', resFinal < 0 ? 'text-rose-600' : 'text-emerald-600')}>{brl(resFinal)}</td>
                        <td className={cn(td, 'text-right')}>{conv}</td>
                        <td className={cn(td, 'text-right')}>{conv ? brl(saidaTotal / conv) : '—'}</td>
                        <td className={cn(td, 'text-right')}>{tot.leads}</td>
                        <td className={cn(td, 'text-right')}>{meses.reduce((s2, l) => s2 + l.accounts, 0)}</td>
                        <td className={cn(td, 'text-right')}>{brl(tot.meta)}</td>
                        <td className={cn(td, 'text-right')}>{brl(tot.google)}</td>
                        <td className={cn(td, 'text-right')}>{brl(tot.fixo)}</td>
                      </tr>
                      <tr className={cn('font-bold', resFinal < 0 ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10')}>
                        <td className={td} colSpan={5}>Resultado final: receita líquida {brl(tot.rec)} − saída {brl(saidaTotal)}</td>
                        <td className={cn(td, 'text-right text-lg', resFinal < 0 ? 'text-rose-600' : 'text-emerald-600')} colSpan={8}>
                          {resFinal < 0 ? 'Prejuízo de ' : 'Lucro de '}{brl(Math.abs(resFinal))}
                        </td>
                      </tr>
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Resultado = receita líquida (assinaturas pagas, já sem taxas) − anúncios − custos fixos. O mês corrente ainda está em andamento.
            A receita vem sozinha do Asaas (atualiza todo dia) e das compras da App Store e do Google Play. Taxas: Asaas conforme cada cobrança,
            Apple 30% até 12/11/2026 e 15% depois (Small Business Program aprovado em 13/11/2026) e Google Play 15% em assinaturas. "Leads convertidos" são os leads que pagaram
            (o resto é lead frio). Contas de teste (a sua, da família e de revisão da Apple) são ignoradas na receita e nos leads convertidos.
          </p>
        </div>
      )}

      {sub === 'custos' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Resumo titulo="Receita líquida do mês atual" valor={brl(receitaMensalHoje)} destaque={receitaMensalHoje > 0 ? 'bom' : undefined} nota="Assinaturas pagas, sem taxas e comissões" />
            <Resumo titulo="Custo fixo por mês" valor={brl(totalMensal)} nota="Soma dos itens com valor (anuais ÷ 12, de 2 anos ÷ 24; dólar na cotação de hoje)" />
            <Resumo titulo="Falta para empatar" valor={brl(Math.max(totalMensal - receitaMensalHoje, 0))} destaque={totalMensal - receitaMensalHoje > 0 ? 'ruim' : 'bom'} nota="Custo fixo − receita líquida do mês, sem contar anúncios" />
            <Resumo titulo="Sem valor" valor={String(pendentes.length)} destaque={pendentes.length ? 'ruim' : 'bom'} nota="Entram nos totais quando preenchidos" />
          </div>
          <div className={cn(card, 'overflow-x-auto')}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-700">
                  <th className={th}>Serviço</th><th className={th}>Cobrança</th><th className={cn(th, 'text-right')}>Valor</th>
                  <th className={cn(th, 'text-right')}>Por mês</th><th className={th}>Desde</th><th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(custos ?? []).filter((c) => c.kind !== 'receita').map((c) => (
                  <React.Fragment key={c.id}>
                    <tr className="border-t border-slate-100 dark:border-zinc-800">
                      <td className={td}>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {c.kind === 'receita' && <span className="mr-2 inline-block rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/30">Receita</span>}
                          {c.name}
                        </p>
                        {c.note && <p className="text-xs text-slate-500 mt-0.5 max-w-xl">{c.note}</p>}
                      </td>
                      <td className={td}>{CICLO[c.cycle]}</td>
                      <td className={cn(td, 'text-right whitespace-nowrap')}>
                        {c.cycle === 'free' ? 'R$ 0,00' : c.amount_usd != null ? (
                          <>
                            <span>{`US$ ${c.amount_usd.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</span>
                            <span className="block text-xs text-slate-500">≈ {brl(c.amount_usd * dolar)}</span>
                          </>
                        ) : brl(c.amount_brl)}
                      </td>
                      <td className={cn(td, 'text-right whitespace-nowrap')}>{emReais(c, dolar) == null ? '—' : brl(porMes(c, dolar))}</td>
                      <td className={cn(td, 'whitespace-nowrap')}>{dia(c.started_on)}</td>
                      <td className={td}>
                        <span className={cn('inline-block rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', STATUS[c.status].cls)}>{STATUS[c.status].label}</span>
                        {c.status === 'a_confirmar' && editando !== c.id && (
                          <button
                            className="ml-2 text-xs font-semibold text-emerald-700 underline"
                            onClick={() => { setEditando(c.id); setValor(''); setData(c.started_on ?? ''); }}
                          >
                            Preencher
                          </button>
                        )}
                      </td>
                    </tr>
                    {editando === c.id && (
                      <tr className="bg-slate-50 dark:bg-zinc-800/50">
                        <td className={td} colSpan={6}>
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="text-xs font-semibold text-slate-600">
                              Valor cobrado (R$)
                              <input
                                inputMode="decimal"
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                                className="mt-1 block w-36 rounded-lg border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                placeholder="0,00"
                              />
                            </label>
                            <label className="text-xs font-semibold text-slate-600">
                              Data da cobrança
                              <input
                                type="date"
                                value={data}
                                onChange={(e) => setData(e.target.value)}
                                className="mt-1 block rounded-lg border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                              />
                            </label>
                            <button
                              disabled={salvar.isPending || !valor || !data}
                              onClick={() => salvar.mutate(c)}
                              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              Salvar
                            </button>
                            <button onClick={() => setEditando(null)} className="rounded-lg px-3 py-2 text-sm text-slate-600">Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
