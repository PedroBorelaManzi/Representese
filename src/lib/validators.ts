/* Validadores e máscaras de documentos brasileiros.
   Extraídos do Checkout para serem reutilizáveis e testáveis (Vitest). */

export function isValidCPF(value: string): boolean {
  if (!value) return false;
  const clean = value.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10))) return false;

  return true;
}

export function isValidCNPJ(value: string): boolean {
  if (!value) return false;
  const clean = value.replace(/\D/g, '');
  if (clean.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(clean)) return false;

  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const digits = clean.substring(size);
  let sum = 0, pos = size - 7;
  for (let i = size; i >= 1; i--) { sum += parseInt(numbers.charAt(size - i)) * pos--; if (pos < 2) pos = 9; }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0; pos = size - 7;
  for (let i = size; i >= 1; i--) { sum += parseInt(numbers.charAt(size - i)) * pos--; if (pos < 2) pos = 9; }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
}

export function isValidPhone(value: string): boolean {
  if (!value) return false;
  const clean = value.replace(/\D/g, '');
  if (clean.length !== 10 && clean.length !== 11) return false;
  const ddd = parseInt(clean.substring(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (clean.length === 11 && clean.charAt(2) !== '9') return false;
  return true;
}

export const formatCpfCnpj = (value: string) => {
  const clean = value.replace(/\D/g, '').slice(0, 14);
  if (clean.length <= 11) return clean.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return clean.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

export const formatPhone = (value: string) => {
  const clean = value.replace(/\D/g, '').slice(0, 11);
  if (clean.length <= 10) return clean.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return clean.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
};

export const formatCardNumber = (value: string) => value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');

export const formatExpiry = (value: string) => {
  const clean = value.replace(/\D/g, '').slice(0, 4);
  return clean.length <= 2 ? clean : `${clean.slice(0, 2)}/${clean.slice(2)}`;
};

export const formatCcv = (value: string) => value.replace(/\D/g, '').slice(0, 4);

export const formatCep = (value: string) => {
  const clean = value.replace(/\D/g, '').slice(0, 8);
  return clean.length <= 5 ? clean : `${clean.slice(0, 5)}-${clean.slice(5)}`;
};

/* Força de senha: 0–4 pontos (comprimento, maiúscula+minúscula, número, símbolo).
   Usado pela barra visual no Checkout/Register. */
export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Muito fraca' | 'Fraca' | 'Média' | 'Forte' | 'Excelente';
};

export function passwordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const labels: PasswordStrength['label'][] = ['Muito fraca', 'Fraca', 'Média', 'Forte', 'Excelente'];
  return { score: score as PasswordStrength['score'], label: labels[score] };
}
