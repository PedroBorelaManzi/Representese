import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** CTA de primeiro uso, ex.: "Cadastre seu primeiro cliente →" */
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-3xl bg-brand-500/10 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-brand-500" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-black text-zinc-900 dark:text-white">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-brand-500/20"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
