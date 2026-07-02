import React from 'react';

interface SkeletonProps {
  className?: string;
}

/** Placeholder de carregamento. Dimensione via className (ex.: "h-4 w-32"). */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800 ${className}`}
    />
  );
}
