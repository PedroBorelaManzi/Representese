import React from 'react';

type BadgeVariant = 'brand' | 'neutral' | 'danger' | 'warning';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
  neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  danger: 'bg-danger-500/10 text-danger-600 dark:text-danger-500',
  warning: 'bg-warning-500/10 text-warning-600 dark:text-warning-500',
};

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
