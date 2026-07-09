import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSettings } from '../contexts/SettingsContext';
import { Navigate } from 'react-router-dom';
import { BarChart3, Clock, LayoutDashboard, MousePointerClick } from 'lucide-react';

export default function AdminAnalytics() {
  const { settings } = useSettings();

  // Verifica se o usuário é admin
  if (!settings.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  const { data: events, isLoading } = useQuery({
    queryKey: ['admin_analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000); // Traz as últimas 1000 entradas para agrupar localmente (ideal seria agrupar via RPC, mas serve para começar)

      if (error) throw error;
      return data || [];
    }
  });

  // Agrega dados simples localmente
  const pageViews = events?.filter(e => e.event_type === 'page_view') || [];
  
  const timeByRoute = pageViews.reduce((acc, curr) => {
    const route = curr.route || 'unknown';
    acc[route] = (acc[route] || 0) + (curr.duration_seconds || 0);
    return acc;
  }, {} as Record<string, number>);

  const sortedRoutes = Object.entries(timeByRoute)
    .sort(([, timeA], [, timeB]) => timeB - timeA)
    .slice(0, 10);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8 text-emerald-600" />
            Dashboard Analytics
          </h1>
          <p className="text-zinc-500 mt-2">Visão geral do uso da plataforma Represente-Se!</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
             <div key={i} className="h-32 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3 mb-2">
                <MousePointerClick className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-medium text-zinc-500">Total de Eventos</h3>
              </div>
              <p className="text-3xl font-bold text-zinc-900 dark:text-white">{events?.length}</p>
            </div>
            
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-medium text-zinc-500">Tempo Total Registrado</h3>
              </div>
              <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                {formatTime(pageViews.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0))}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
             <div className="flex items-center gap-3 mb-6">
                <BarChart3 className="w-6 h-6 text-zinc-900 dark:text-white" />
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Tempo Gasto por Página (Top 10)</h3>
              </div>
             
             {sortedRoutes.length === 0 ? (
               <p className="text-zinc-500 text-center py-8">Nenhum dado de navegação registrado ainda.</p>
             ) : (
               <div className="space-y-4">
                 {sortedRoutes.map(([route, seconds], index) => {
                   const maxTime = sortedRoutes[0][1];
                   const width = Math.max((seconds / maxTime) * 100, 2);
                   
                   return (
                     <div key={route} className="relative pt-1">
                       <div className="flex items-center justify-between mb-1">
                         <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                           {index + 1}. {route === '/' ? 'Home/Landing' : route}
                         </span>
                         <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                           {formatTime(seconds)}
                         </span>
                       </div>
                       <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2">
                         <div
                           className="bg-emerald-500 h-2 rounded-full transition-all duration-1000"
                           style={{ width: `${width}%` }}
                         ></div>
                       </div>
                     </div>
                   );
                 })}
               </div>
             )}
          </div>
        </>
      )}
    </div>
  );
}
