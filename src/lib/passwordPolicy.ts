// src/lib/passwordPolicy.ts
//
// Regras de senha do app. DEVEM espelhar exatamente o que está configurado no
// painel do Supabase em:
//   Authentication → Sign In / Providers → Email → Password Requirements
//
// Config atual no Supabase: "Lower, upper, digits and symbols" + comprimento
// mínimo. Se você mudar lá, mude AQUI também — senão o formulário aceita uma
// senha que o servidor (signUp / updateUser) vai recusar com
// "Password does not meet requirements", ou o contrário.

/** Mensagem pra quando o Supabase recusa a senha por constar em vazamentos (HaveIBeenPwned). */
export const MSG_SENHA_VAZADA = 'Essa senha é muito comum ou já apareceu em vazamentos de dados. Escolha outra, mais difícil de adivinhar.';

/** O Supabase recusa senhas vazadas ("Prevent use of leaked passwords") com code=weak_password. */
export function isWeakPasswordError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  const code = String(e?.code ?? '').toLowerCase();
  const msg = String(e?.message ?? '').toLowerCase();
  return code === 'weak_password' || msg.includes('known to be weak') || msg.includes('easy to guess') || msg.includes('pwned');
}

/** Igual ao "Minimum password length" do Supabase. Suba os dois juntos. */
export const PASSWORD_MIN_LENGTH = 8;

// O Supabase trata como "symbol" qualquer caractere que não seja letra nem
// dígito (o conjunto documentado é !@#$%^&*()_+-=[]{};'\:"|<>?,./`~, mas na
// prática a checagem é "não alfanumérico").
const SYMBOL_RE = /[^a-zA-Z0-9]/;

export interface PasswordChecks {
  length: boolean;
  lower: boolean;
  upper: boolean;
  number: boolean;
  symbol: boolean;
}

export function checkPassword(pw: string): PasswordChecks {
  return {
    length: pw.length >= PASSWORD_MIN_LENGTH,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    symbol: SYMBOL_RE.test(pw),
  };
}

export function isPasswordValid(pw: string): boolean {
  return Object.values(checkPassword(pw)).every(Boolean);
}

/** Checklist pronto pra renderizar (label + se já foi atendido). */
export function passwordRequirementList(pw: string): { label: string; met: boolean }[] {
  const c = checkPassword(pw);
  return [
    { label: `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres`, met: c.length },
    { label: 'Uma letra minúscula', met: c.lower },
    { label: 'Uma letra maiúscula', met: c.upper },
    { label: 'Um número', met: c.number },
    { label: 'Um símbolo (ex: ! @ # $ %)', met: c.symbol },
  ];
}
