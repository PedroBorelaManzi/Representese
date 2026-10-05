import React, { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { cn } from '../lib/utils';
import { DDD_LIST, DDD_UF, formatPhone, splitPhone } from '../lib/validators';

interface Props {
  id?: string;
  /** Valor no formato "(11) 98765-4321" (ou vazio) — o mesmo que o resto do app já usa. */
  value: string;
  onChange: (formatted: string) => void;
  hasError?: boolean;
  /** Classes do campo do número (cada tela tem o seu visual de input). */
  inputClassName: string;
  /** Tamanho do ícone/padding da esquerda do número. */
  iconClassName?: string;
}

/** "(11) 98765-4321" ← 98765 4321 com máscara de 9 dígitos: 00000-0000. */
const maskNumber = (n: string) => (n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n);

/** WhatsApp com DDD escolhido numa lista (no celular vira aquela "roleta" nativa) e o número
 *  digitado à parte. Evita DDD digitado errado e trava números que não são de celular:
 *  só aceita dígitos, tem que começar com 9 e no máximo 9 dígitos. */
export function PhoneField({ id, value, onChange, hasError, inputClassName, iconClassName }: Props) {
  const inicial = splitPhone(value);
  const [ddd, setDdd] = useState(inicial.ddd);
  const [num, setNum] = useState(inicial.number);

  // Valor trocado de fora (ex.: Checkout preenchendo com o lead salvo).
  useEffect(() => {
    const atual = (ddd + num).replace(/\D/g, '');
    if (value.replace(/\D/g, '') !== atual) {
      const s = splitPhone(value);
      setDdd(s.ddd);
      setNum(s.number);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emitir = (d: string, n: string) => onChange(d && n ? formatPhone(d + n) : n);

  const aoDigitar = (raw: string) => {
    let digits = raw.replace(/\D/g, '');
    // Colou o número inteiro (com DDD / +55): separa sozinho.
    if (digits.length > 9) {
      const s = splitPhone(raw);
      if (s.ddd) {
        setDdd(s.ddd);
        digits = s.number;
        setNum(digits);
        emitir(s.ddd, digits);
        return;
      }
      digits = digits.slice(-9);
    }
    // Celular sempre começa com 9: qualquer outro primeiro dígito é descartado.
    if (digits.length > 0 && digits[0] !== '9') digits = '';
    setNum(digits);
    emitir(ddd, digits);
  };

  return (
    <div className="flex gap-2">
      <select
        aria-label="DDD"
        value={ddd}
        onChange={(e) => { setDdd(e.target.value); emitir(e.target.value, num); }}
        className={cn(
          'shrink-0 w-[96px] px-3 py-3.5 bg-slate-50 dark:bg-zinc-950/50 border rounded-2xl text-sm font-bold outline-none transition-all dark:text-white focus:ring-2',
          hasError
            ? 'border-red-400 focus:ring-red-500/20 focus:border-red-500'
            : 'border-slate-200 dark:border-zinc-800 focus:ring-emerald-500/20 focus:border-emerald-500',
          !ddd && 'text-slate-400',
        )}
      >
        <option value="" disabled>DDD</option>
        {DDD_LIST.map((d) => (
          <option key={d} value={d}>{d} · {DDD_UF[d]}</option>
        ))}
      </select>
      <div className="relative group flex-1">
        <div className={cn('absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors', iconClassName)}>
          <Phone className="w-5 h-5" />
        </div>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={maskNumber(num)}
          onChange={(e) => aoDigitar(e.target.value)}
          placeholder="90000-0000"
          maxLength={20}
          required
          className={inputClassName}
        />
      </div>
    </div>
  );
}
