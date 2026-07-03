import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useState, useEffect } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Capitaliza a primeira letra de cada palavra respeitando acentos.
 * (`\b\w` do regex ASCII quebrava em "Agropecuária" → "AgropecuáRia".)
 */
export function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(^|[\s([/-])\S/g, (c) => c.toUpperCase());
}

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
