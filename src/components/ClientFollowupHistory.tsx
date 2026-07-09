import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getFollowupLogs, getMethodLabel, getOutcomeLabel } from '../lib/followupService';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface FollowupLog {
  id: string;
  clientId: string;
  userId: string;
  contactDate: string;
  method: 'call' | 'email' | 'whatsapp' | 'visit' | 'other';
  notes: string;
  outcome: 'positive' | 'pending' | 'negative' | 'no_response';
  nextFollowup: string | null;
  createdAt: string;
}

interface ClientFollowupHistoryProps {
  clientId: string;
  userId: string;
}

const outcomeColors = {
  positive: 'emerald',
  pending: 'amber',
  negative: 'red',
  no_response: 'slate'
};

export default function ClientFollowupHistory({ clientId, userId }: ClientFollowupHistoryProps) {
  const [logs, setLogs] = useState<FollowupLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFollowupHistory();
  }, [clientId, userId]);

  const loadFollowupHistory = async () => {
    setIsLoading(true);
    try {
      const data = await getFollowupLogs(userId, clientId, 20);
      setLogs(data as any);
    } catch (error) {
      console.error('Error loading followup history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600 opacity-50" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          Nenhum follow-up registrado ainda. Clique em "Registrar Follow-up" para começar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {logs.map((log, index) => {
        const outcomeColor = outcomeColors[log.outcome as keyof typeof outcomeColors] || 'slate';
        const bgColorClass = `bg-${outcomeColor}-50 dark:bg-${outcomeColor}-950/20`;
        const borderColorClass = `border-${outcomeColor}-200 dark:border-${outcomeColor}-900`;
        const textColorClass = `text-${outcomeColor}-800 dark:text-${outcomeColor}-200`;

        return (
          <div
            key={log.id}
            className={cn(
              'p-4 rounded-2xl border',
              bgColorClass,
              borderColorClass
            )}
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('text-xs font-black uppercase tracking-widest', textColorClass)}>
                    {getMethodLabel(log.method)}
                  </span>
                  <span className={cn('text-xs font-black uppercase tracking-widest', textColorClass)}>
                    •
                  </span>
                  <span className={cn('text-xs font-black uppercase tracking-widest', textColorClass)}>
                    {getOutcomeLabel(log.outcome)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {format(new Date(log.contactDate), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mb-2">
              {log.notes}
            </p>

            {log.nextFollowup && (
              <div className="mt-2 p-2 bg-white/50 dark:bg-black/20 rounded-lg border border-white/50 dark:border-black/20">
                <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-widest">
                  📅 Próximo: {format(new Date(log.nextFollowup), "d 'de' MMMM", { locale: ptBR })}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
