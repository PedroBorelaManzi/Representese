import React from 'react';
import { cn } from '../lib/utils';
import logoUrl from '../assets/logo.webp';

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Logo: React.FC<LogoProps & { variant?: 'light' | 'dark' | 'auto' }> = ({ 
  className, 
  iconOnly = false, 
  showText = true, 
  size = 'md',
  variant = 'auto'
}) => {
  const sizeMap = {
    sm: 'h-8 w-8',
    md: 'h-11 w-11',
    lg: 'h-24 w-24',
    xl: 'h-40 w-40'
  };

  const finalIconOnly = iconOnly || !showText;

  return (
    <div className={cn("flex items-center gap-3 group shrink-0", className)}>
      <div className={cn("relative flex items-center justify-center shrink-0 rounded-lg overflow-hidden", sizeMap[size])}>
        <img 
          src={logoUrl}
          alt="Representese"
          className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110 mix-blend-multiply dark:mix-blend-normal"
        />
      </div>
      
      {!finalIconOnly && (
        <span className={cn(
          "font-black tracking-tighter flex items-center leading-none select-none uppercase whitespace-nowrap",
          size === 'lg' || size === 'xl' ? "text-xl md:text-5xl" : "text-lg md:text-2xl",
          variant === 'light' ? "text-slate-900" : (variant === 'dark' ? "text-white" : "text-slate-900 dark:text-white")
        )}>
          <span>Represente</span>
          <span className="text-emerald-600 dark:text-emerald-500 font-extrabold">-se!</span>
        </span>
      )}
    </div>
  );
};
