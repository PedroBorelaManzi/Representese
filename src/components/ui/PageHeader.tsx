import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Ações à direita (busca, botões). Empilham abaixo do título no mobile. */
  actions?: React.ReactNode;
  /** Acento do badge do ícone. Padrão: verde da marca. */
  accent?: 'brand' | 'amber' | 'sky' | 'violet';
  className?: string;
}

const ACCENTS: Record<NonNullable<PageHeaderProps['accent']>, string> = {
  brand: 'bg-emerald-600 shadow-emerald-600/25',
  amber: 'bg-amber-500 shadow-amber-500/25',
  sky: 'bg-sky-500 shadow-sky-500/25',
  violet: 'bg-violet-500 shadow-violet-500/25',
};

/**
 * Cabeçalho padrão de página do dashboard: badge de ícone + título +
 * subtítulo + ações. Mantém todas as telas com a mesma hierarquia visual.
 */
export function PageHeader({ icon: Icon, title, subtitle, actions, accent = 'brand', className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 mb-6 lg:mb-8', className)}>
      <div className="flex items-center gap-4 min-w-0">
        <div className={cn('w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-lg', ACCENTS[accent])}>
          <Icon className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-zinc-100 truncate">{title}</h1>
          {subtitle && (
            <p className="text-[10px] lg:text-[11px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 lg:gap-3 lg:ml-auto">{actions}</div>
      )}
    </header>
  );
}
