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

/** DDDs que existem no Brasil, com o estado — usado no seletor de DDD e na validação. */
export const DDD_UF: Record<string, string> = {
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ', '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC', '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF', '62': 'GO', '64': 'GO', '63': 'TO', '65': 'MT', '66': 'MT', '67': 'MS', '68': 'AC', '69': 'RO',
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA', '79': 'SE',
  '81': 'PE', '87': 'PE', '82': 'AL', '83': 'PB', '84': 'RN', '85': 'CE', '88': 'CE', '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA', '92': 'AM', '97': 'AM', '95': 'RR', '96': 'AP', '98': 'MA', '99': 'MA',
};
export const DDD_LIST = Object.keys(DDD_UF).sort();

/** Número sem DDD "de teste": todos os dígitos iguais (ex.: 99999-9999 depois do 9 inicial). */
const numeroRepetido = (subscriber: string) => /^(\d)\1+$/.test(subscriber);

export function isValidPhone(value: string): boolean {
  if (!value) return false;
  const clean = value.replace(/\D/g, '');
  if (clean.length !== 10 && clean.length !== 11) return false;
  if (!DDD_UF[clean.substring(0, 2)]) return false;
  if (clean.length === 11 && clean.charAt(2) !== '9') return false;
  if (numeroRepetido(clean.slice(-8))) return false; // 8 últimos iguais = número inventado
  return true;
}

/** WhatsApp: celular com DDD real, 9 na frente e sem dígitos repetidos. */
export function isValidWhatsApp(value: string): boolean {
  const clean = (value || '').replace(/\D/g, '');
  return clean.length === 11 && isValidPhone(clean);
}

/** Separa "(11) 98765-4321" (ou "+55 11 98765-4321") em DDD + número. */
export function splitPhone(value: string): { ddd: string; number: string } {
  let d = (value || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length >= 10 && DDD_UF[d.slice(0, 2)]) return { ddd: d.slice(0, 2), number: d.slice(2, 11) };
  return { ddd: '', number: d.slice(0, 9) };
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
