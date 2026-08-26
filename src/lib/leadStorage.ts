// src/lib/leadStorage.ts
//
// Guarda localmente o que a pessoa já preencheu no formulário de /register
// (nome/e-mail/telefone/empresa), pra o Checkout reaproveitar em vez de
// pedir tudo de novo do zero — antes as duas telas não se falavam, cada
// uma com seu próprio formulário em branco, mesmo sendo a mesma pessoa há
// poucos minutos de diferença.
const KEY = "rm_lead_data";

export interface StoredLead {
  name: string;
  email: string;
  phone: string;
  company?: string;
}

export function saveLeadData(lead: StoredLead): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lead));
  } catch {
    // localStorage indisponível (modo privado, storage cheio) — não é
    // crítico, o Checkout só perde o preenchimento automático.
  }
}

export function loadLeadData(): StoredLead | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Chamado assim que a conta de verdade é criada no Checkout — a partir
 *  daí quem manda é o metadata da própria conta, não mais este rascunho. */
export function clearLeadData(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Sem problema — na pior hipótese um preenchimento automático sobra
    // pra uma próxima visita, nada sensível ou destrutivo.
  }
}
