import { useState, useEffect } from 'react';

/* Destaca o item de menu da seção que o usuário está vendo.
 * Abordagem por posição de scroll = determinística (sem flicker em saltos).
 *
 * Fora de src/components/landing/primitives.tsx de propósito: aquele arquivo
 * importa framer-motion (FadeUp/Counter), e o LandingPitch (parte eager da
 * landing) só precisa deste hook — mantê-lo separado impede o framer de
 * vazar pro chunk de entrada da landing. */
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string>('');
  useEffect(() => {
    const onScroll = () => {
      const line = window.innerHeight * 0.35;
      let current = '';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);
  return active;
}
