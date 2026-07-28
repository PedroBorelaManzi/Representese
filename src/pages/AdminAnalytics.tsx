import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSettings } from '../contexts/SettingsContext';
import { Navigate } from 'react-router-dom';
import { BarChart3, Clock, LayoutDashboard, MousePointerClick, Search, ChevronDown, ChevronUp, User, Users, LineChart, Download, Building2, Phone } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { cn } from '../lib/utils';

const COLORS = [
  '#10b981', '#6366f1', '#f59e0b', '#ef4444', 
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#0ea5e9'
];

// Helper para formatar o nome da rota e deixar mais bonito
const formatRouteName = (route: string) => {
  if (route === '/' || route === '') return 'Home/Landing';
  if (route.startsWith('/dashboard/')) {
    const section = route.replace('/dashboard/', '');
    return section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Dashboard';
  }
  return route;
};

export default function AdminAnalytics() {
  const { settings } = useSettings();
  
  if (!settings.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <AdminAnalyticsContent settings={settings} />;
}

function AdminAnalyticsContent({ settings }: { settings: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sistema' | 'landing' | 'leads'>('sistema');

  // --- QUERY 1: Sistema (Usuários Logados) ---
  const { data, isLoading } = useQuery({
    queryKey: ['admin_analytics_v2'],
    queryFn: async () => {
      // 1. Busca os últimos 5000 eventos (limite razoável para client-side aggregation)
      const { data: eventsData, error: eventsError } = await supabase
        .from('user_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (eventsError) throw eventsError;
      
      const events = eventsData || [];
      const pageViews = events.filter(e => e.event_type === 'page_view' && e.duration_seconds > 0);

      // 2. Extrai IDs únicos de usuários
      const userIds = Array.from(new Set(pageViews.map(e => e.user_id)));

      // 3. Busca e-mails e status de admin na tabela user_settings
      let emailMap = new Map<string, string>();
      let adminIds = new Set<string>();
      if (userIds.length > 0) {
        const { data: settingsData } = await supabase
          .from('user_settings')
          .select('user_id, email, is_admin')
          .in('user_id', userIds);
          
        if (settingsData) {
          settingsData.forEach(s => {
            if (s.is_admin) {
              adminIds.add(s.user_id);
            } else {
              emailMap.set(s.user_id, s.email || 'Usuário Sem Email');
            }
          });
        }
      }

      // 4. Remove todos os pageViews que pertencem a administradores
      const filteredPageViews = pageViews.filter(e => !adminIds.has(e.user_id));

      // === Processamento Global ===
      const timeByRouteGlobal = filteredPageViews.reduce((acc, curr) => {
        const route = formatRouteName(curr.route || 'unknown');
        acc[route] = (acc[route] || 0) + (curr.duration_seconds || 0);
        return acc;
      }, {} as Record<string, number>);

      // Converte para array formato do recharts
      const globalChartData = Object.entries(timeByRouteGlobal)
        .map(([name, tempoSegundos]: [string, number]) => ({
          name,
          tempoSegundos,
          tempoMinutos: Number((tempoSegundos / 60).toFixed(2))
        }))
        .sort((a, b) => b.tempoSegundos - a.tempoSegundos)
        .slice(0, 10); // Top 10 rotas

      // === Processamento Por Usuário ===
      const userStatsMap = new Map<string, { totalTime: number, routes: Record<string, number> }>();
      
      filteredPageViews.forEach(curr => {
        const route = formatRouteName(curr.route || 'unknown');
        const uid = curr.user_id;
        
        if (!userStatsMap.has(uid)) {
          userStatsMap.set(uid, { totalTime: 0, routes: {} });
        }
        
        const uStat = userStatsMap.get(uid)!;
        uStat.totalTime += (curr.duration_seconds || 0);
        uStat.routes[route] = (uStat.routes[route] || 0) + (curr.duration_seconds || 0);
      });

      const usersList = Array.from(userStatsMap.entries()).map(([userId, stats]) => {
        // Converte as rotas em porcentagem pro PieChart
        const routesData = Object.entries(stats.routes)
          .map(([name, value]) => ({
            name,
            value,
            percentage: Number(((value / stats.totalTime) * 100).toFixed(1))
          }))
          .sort((a, b) => b.value - a.value);

        return {
          userId,
          email: emailMap.get(userId) || `ID: ${userId.substring(0, 8)}...`,
          totalTime: stats.totalTime,
          routesData
        };
      });

      usersList.sort((a, b) => b.totalTime - a.totalTime); // Mais ativos primeiro

      return {
        totalEvents: events.length,
        totalTimeGlobal: filteredPageViews.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0),
        globalChartData,
        usersList
      };
    },
    enabled: activeTab === 'sistema' && !!settings?.is_admin,
    // O QueryClient global usa staleTime: Infinity + cache persistido em IndexedDB
    // (offline-first pros representantes em campo) — sem isso, o admin veria
    // dados congelados no primeiro carregamento pra sempre, mesmo com F5.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // --- QUERY 2: Landing Page (Leads Anônimos) ---
  const { data: landingData, isLoading: isLoadingLanding } = useQuery({
    queryKey: ['admin_analytics_landing'],
    queryFn: async () => {
      const { data: eventsData, error } = await supabase
        .from('landing_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10000);

      if (error) throw error;
      const events = eventsData || [];
      
      const timeBySection = events.reduce((acc, curr) => {
        const section = curr.section_id || 'unknown';
        acc[section] = (acc[section] || 0) + (curr.duration_seconds || 0);
        return acc;
      }, {} as Record<string, number>);

      const totalTime = events.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0);
      const uniqueSessions = new Set(events.map(e => e.session_id)).size;

      const chartData = Object.entries(timeBySection)
        .map(([name, tempoSegundos]: [string, number]) => ({
          name: name === 'hero' ? 'Início (Hero)' : name.charAt(0).toUpperCase() + name.slice(1),
          tempoSegundos,
          tempoMinutos: Number((tempoSegundos / 60).toFixed(2)),
          percentage: totalTime > 0 ? Number(((tempoSegundos / totalTime) * 100).toFixed(1)) : 0
        }))
        .sort((a, b) => b.tempoSegundos - a.tempoSegundos);

      return {
        totalEvents: events.length,
        totalTime,
        uniqueSessions,
        chartData
      };
    },
    enabled: activeTab === 'landing' && !!settings?.is_admin,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // --- QUERY 3: Leads & Assinantes (CRM) ---
  const { data: leadsData, isLoading: isLoadingLeads } = useQuery({
    queryKey: ['admin_leads_crm'],
    queryFn: async () => {
      // user_settings.subscription_status é coluna legada (default 'active' desde
      // a criação da linha, nunca atualizada pelo webhook de pagamento) — não
      // reflete se o usuário realmente pagou. A fonte de verdade da assinatura é
      // user_entitlements, atualizada pelo webhook do Asaas em cada pagamento.
      const [{ data: leads, error: leadsError }, { data: entitlements, error: entError }] = await Promise.all([
        supabase.from('user_settings').select('user_id, email, phone, created_at, is_admin').order('created_at', { ascending: false }),
        supabase.from('user_entitlements').select('user_id, subscription_status, plan_id'),
      ]);
      if (leadsError) throw leadsError;
      if (entError) throw entError;

      const statusByUser = new Map((entitlements || []).map(e => [e.user_id, e.subscription_status]));
      return (leads || [])
        .filter(d => !d.is_admin)
        .map(d => ({ ...d, subscription_status: statusByUser.get(d.user_id) ?? 'inactive' }));
    },
    enabled: activeTab === 'leads' && !!settings?.is_admin,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const exportToCSV = () => {
    if (!leadsData) return;
    const headers = ['Data de Cadastro', 'Email', 'Telefone', 'Status'];
    const csvContent = leadsData.map(lead => {
      const date = new Date(lead.created_at).toLocaleDateString('pt-BR');
      return `${date},${lead.email},${lead.phone || ''},${lead.subscription_status}`;
    });
    
    const blob = new Blob([headers.join(',') + '\\n' + csvContent.join('\\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `leads_representese_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  };

  const filteredUsers = data?.usersList.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Check removido daqui pois o wrapper principal já o faz

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8 text-emerald-600" />
            Analytics Global
          </h1>
          <p className="text-zinc-500 mt-2">Métricas de comportamento de usuários e visitantes da página de vendas.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-px mb-6">
        <button
          onClick={() => setActiveTab('sistema')}
          className={cn(
            "px-6 py-3 font-semibold text-sm transition-all relative",
            activeTab === 'sistema' ? "text-emerald-600" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Sistema (Logados)
          </div>
          {activeTab === 'sistema' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />}
        </button>
        <button
          onClick={() => setActiveTab('landing')}
          className={cn(
            "px-6 py-3 font-semibold text-sm transition-all relative",
            activeTab === 'landing' ? "text-indigo-600" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4" />
            Landing Page (Leads)
          </div>
          {activeTab === 'landing' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
        </button>
        <button
          onClick={() => setActiveTab('leads')}
          className={cn(
            "px-6 py-3 font-semibold text-sm transition-all relative",
            activeTab === 'leads' ? "text-amber-600" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            CRM & Leads
          </div>
          {activeTab === 'leads' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600" />}
        </button>
      </div>

      {activeTab === 'sistema' && (
        isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
             <div key={i} className="h-32 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      ) : (
        <>
          {/* Top Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-2">
                <MousePointerClick className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-medium text-zinc-500">Total de Eventos Capturados</h3>
              </div>
              <p className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
                {data?.totalEvents.toLocaleString()}
              </p>
            </div>
            
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-medium text-zinc-500">Tempo de Tela Acumulado (Todos)</h3>
              </div>
              <p className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
                {formatTime(data?.totalTimeGlobal || 0)}
              </p>
            </div>
          </div>

          {/* Gráfico Geral de Rotas */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
             <div className="flex items-center gap-3 mb-6">
                <BarChart3 className="w-6 h-6 text-zinc-900 dark:text-white" />
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Tempo Geral por Seção (Top 10)</h3>
              </div>
              
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.globalChartData} margin={{ top: 20, right: 30, left: 20, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: '#888888', fontSize: 12 }} 
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      tick={{ fill: '#888888', fontSize: 12 }} 
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value}m`}
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`${value} minutos`, 'Tempo Gasto']}
                    />
                    <Bar dataKey="tempoMinutos" fill="#10b981" radius={[6, 6, 0, 0]}>
                      {data?.globalChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
          </div>

          {/* Análise por Usuário */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden flex flex-col min-h-[500px]">
            <div className="p-6 border-b border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-white flex items-center gap-3">
                <User className="w-5 h-5 text-indigo-500" />
                Tempo de Tela por Usuário
              </h3>
              
              <div className="relative max-w-sm w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar usuário por email..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm outline-none focus:border-emerald-500 transition-colors dark:text-white"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {filteredUsers.length === 0 ? (
                <div className="p-10 text-center text-slate-400">Nenhum usuário encontrado.</div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((userStats) => {
                    const isExpanded = expandedUser === userStats.userId;
                    
                    return (
                      <div key={userStats.userId} className="border border-slate-100 dark:border-zinc-800/50 rounded-xl overflow-hidden transition-all duration-300">
                        <button 
                          onClick={() => setExpandedUser(isExpanded ? null : userStats.userId)}
                          className={cn(
                            "w-full flex items-center justify-between p-4 transition-colors",
                            isExpanded ? "bg-slate-50 dark:bg-zinc-800/40" : "hover:bg-slate-50 dark:hover:bg-zinc-800/20 bg-white dark:bg-zinc-900"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                              {userStats.email.charAt(0)}
                            </div>
                            <div className="text-left">
                              <p className="font-semibold text-slate-800 dark:text-zinc-100 text-sm">{userStats.email}</p>
                              <p className="text-xs text-slate-500 font-medium">{formatTime(userStats.totalTime)} de uso ativo</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-slate-400">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </button>
                        
                        {/* Corpo Expandido (Gráfico de Pizza % + Detalhes) */}
                        {isExpanded && (
                          <div className="p-6 bg-slate-50/50 dark:bg-zinc-900/50 border-t border-slate-100 dark:border-zinc-800/50 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex flex-col lg:flex-row items-center gap-8">
                              {/* Pie Chart */}
                              <div className="w-full lg:w-1/2 h-[300px]">
                                <h4 className="text-sm font-bold text-slate-700 dark:text-zinc-300 mb-4 text-center">Distribuição de Tempo (%)</h4>
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={userStats.routesData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={60}
                                      outerRadius={100}
                                      paddingAngle={2}
                                      dataKey="percentage"
                                      nameKey="name"
                                      label={({ name, percentage }) => `${name} (${percentage}%)`}
                                      labelLine={false}
                                    >
                                      {userStats.routesData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                      ))}
                                    </Pie>
                                    <Tooltip 
                                      formatter={(value: number, name: string) => [`${value}% do tempo`, name]}
                                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                              
                              {/* Lista de Rotas */}
                              <div className="w-full lg:w-1/2">
                                <h4 className="text-sm font-bold text-slate-700 dark:text-zinc-300 mb-4">Detalhamento por Seção</h4>
                                <div className="space-y-3">
                                  {userStats.routesData.map((route, i) => (
                                    <div key={route.name} className="flex items-center justify-between text-sm">
                                      <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                        <span className="font-medium text-slate-600 dark:text-zinc-400">{route.name}</span>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <span className="text-slate-500 text-xs w-16 text-right">{formatTime(route.value)}</span>
                                        <span className="font-bold text-slate-800 dark:text-zinc-200 w-12 text-right">{route.percentage}%</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
        )
      )}

      {activeTab === 'landing' && (
        isLoadingLanding ? (
           <div className="h-32 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse"></div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Top Cards Landing */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-medium text-zinc-500">Visitantes Únicos (Sessões)</h3>
                </div>
                <p className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
                  {landingData?.uniqueSessions.toLocaleString()}
                </p>
              </div>
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-2">
                  <MousePointerClick className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-sm font-medium text-zinc-500">Total de Interações</h3>
                </div>
                <p className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
                  {landingData?.totalEvents.toLocaleString()}
                </p>
              </div>
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <h3 className="text-sm font-medium text-zinc-500">Tempo de Leitura Global</h3>
                </div>
                <p className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
                  {formatTime(landingData?.totalTime || 0)}
                </p>
              </div>
            </div>

            {/* Gráfico Geral de Funil da Landing Page */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 flex flex-col lg:flex-row items-center gap-8">
              <div className="w-full lg:w-1/2 h-[400px]">
                 <div className="flex items-center gap-3 mb-6">
                  <LineChart className="w-6 h-6 text-zinc-900 dark:text-white" />
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Atenção por Seção (Minutos)</h3>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={landingData?.chartData} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#888888', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{ fill: '#888888', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`${value} minutos`, 'Tempo Gasto']}
                    />
                    <Bar dataKey="tempoMinutos" fill="#6366f1" radius={[0, 6, 6, 0]}>
                      {landingData?.chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Lista Detalhada em Pizza */}
              <div className="w-full lg:w-1/2">
                <h4 className="text-sm font-bold text-slate-700 dark:text-zinc-300 mb-6">Onde eles mais leem? (% do Tempo)</h4>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-48 h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={landingData?.chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="percentage"
                          nameKey="name"
                          labelLine={false}
                        >
                          {landingData?.chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => [`${value}% do tempo`, 'Visibilidade']}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div className="flex-1 space-y-3 w-full">
                    {landingData?.chartData.map((route, i) => (
                      <div key={route.name} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                          <span className="font-medium text-slate-600 dark:text-zinc-400">{route.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-slate-500 text-xs text-right hidden sm:block">{formatTime(route.tempoSegundos)}</span>
                          <span className="font-bold text-slate-800 dark:text-zinc-200 w-10 text-right">{route.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {activeTab === 'leads' && (
        isLoadingLeads ? (
          <div className="h-64 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse"></div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Base de Leads e Clientes</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400">Gerencie todos os cadastros feitos pelo sistema.</p>
              </div>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
              >
                <Download className="w-4 h-4" />
                Exportar CSV
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-zinc-800/50 text-slate-500 dark:text-zinc-400 font-medium">
                  <tr>
                    <th className="px-6 py-4">Data</th>
                    <th className="px-6 py-4">E-mail</th>
                    <th className="px-6 py-4">WhatsApp</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {leadsData?.map(lead => (
                    <tr key={lead.user_id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4 text-slate-600 dark:text-zinc-300">
                        {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">
                        {lead.email}
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-zinc-300">
                        {lead.phone || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider",
                          lead.subscription_status === 'active' 
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                            : lead.subscription_status === 'inactive'
                            ? "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                            : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                        )}>
                          {lead.subscription_status === 'active' ? 'Assinante' : lead.subscription_status === 'inactive' ? 'Lead' : 'Inativo/Canc'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {leadsData?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500 dark:text-zinc-400">
                        Nenhum lead encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

    </div>
  );
}
