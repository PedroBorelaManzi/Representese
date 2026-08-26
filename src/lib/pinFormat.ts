// Faixa de tamanho aceita pro PIN do link de "enviar pedido" (dono define em
// Configurações > Equipe, colaborador digita em /enviar/:token). Fica num só
// lugar porque antes cada ponta (dono, colaborador, servidor) tinha sua
// própria cópia da regra — foi assim que o limite ficou descompassado entre
// as telas.
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}
