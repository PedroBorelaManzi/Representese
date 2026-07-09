export interface Holiday {
  id?: string;
  name: string;
  date: string;
  type: string;
  description?: string;
  city?: string;
  state?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const pad2 = (n: number) => String(n).padStart(2, "0");

// Feriados estaduais (data fixa, definidos por lei estadual). Usado apenas no
// fallback offline; a fonte primária é a Edge Function get-holidays, que mantém
// a mesma tabela. Datas que sempre coincidem com feriado nacional são omitidas.
const STATE_HOLIDAYS: Record<string, { month: number; day: number; name: string }[]> = {
  AC: [
    { month: 1, day: 23, name: "Dia do Evangélico" },
    { month: 6, day: 15, name: "Aniversário do Acre" },
    { month: 9, day: 5, name: "Dia da Amazônia" },
    { month: 11, day: 17, name: "Assinatura do Tratado de Petrópolis" },
  ],
  AL: [
    { month: 6, day: 24, name: "São João" },
    { month: 6, day: 29, name: "São Pedro" },
    { month: 9, day: 16, name: "Emancipação Política de Alagoas" },
  ],
  AP: [
    { month: 3, day: 19, name: "São José" },
    { month: 9, day: 13, name: "Criação do Território do Amapá" },
  ],
  AM: [
    { month: 9, day: 5, name: "Elevação do Amazonas a Província" },
    { month: 12, day: 8, name: "Nossa Senhora da Conceição" },
  ],
  BA: [{ month: 7, day: 2, name: "Independência da Bahia" }],
  CE: [
    { month: 3, day: 19, name: "São José" },
    { month: 3, day: 25, name: "Data Magna do Ceará" },
  ],
  DF: [{ month: 11, day: 30, name: "Dia do Evangélico" }],
  MA: [{ month: 7, day: 28, name: "Adesão do Maranhão à Independência" }],
  MS: [{ month: 10, day: 11, name: "Criação do Estado de Mato Grosso do Sul" }],
  PA: [{ month: 8, day: 15, name: "Adesão do Pará à Independência" }],
  PB: [{ month: 8, day: 5, name: "Fundação do Estado da Paraíba" }],
  PR: [{ month: 12, day: 19, name: "Emancipação Política do Paraná" }],
  PE: [{ month: 3, day: 6, name: "Revolução Pernambucana" }],
  PI: [{ month: 10, day: 19, name: "Dia do Piauí" }],
  RJ: [{ month: 4, day: 23, name: "São Jorge" }],
  RN: [
    { month: 8, day: 7, name: "Dia do Rio Grande do Norte" },
    { month: 10, day: 3, name: "Mártires de Cunhaú e Uruaçu" },
  ],
  RS: [{ month: 9, day: 20, name: "Revolução Farroupilha" }],
  RO: [
    { month: 1, day: 4, name: "Criação do Estado de Rondônia" },
    { month: 6, day: 18, name: "Dia do Evangélico" },
  ],
  RR: [{ month: 10, day: 5, name: "Criação do Estado de Roraima" }],
  SP: [{ month: 7, day: 9, name: "Revolução Constitucionalista de 1932" }],
  SE: [{ month: 7, day: 8, name: "Emancipação Política de Sergipe" }],
  TO: [
    { month: 3, day: 18, name: "Autonomia do Estado do Tocantins" },
    { month: 10, day: 5, name: "Criação do Estado do Tocantins" },
  ],
};

function buildStateHolidays(
  year: number,
  locations: { city: string; state?: string }[]
): Holiday[] {
  const distinctStates = new Set(
    locations
      .map((l) => (l.state || "").trim().toUpperCase())
      .filter((s) => s.length > 0)
  );

  const result: Holiday[] = [];
  distinctStates.forEach((uf) => {
    (STATE_HOLIDAYS[uf] || []).forEach((h) => {
      const isoDate = `${year}-${pad2(h.month)}-${pad2(h.day)}`;
      result.push({
        id: `estadual-${uf}-${isoDate}-${h.name}`,
        name: h.name,
        date: isoDate,
        type: "estadual",
        state: uf,
        description: h.name,
      });
    });
  });
  return result;
}

export async function fetchHolidays(year: number, locations: { city: string; state?: string }[]): Promise<Holiday[]> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-holidays`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ year, locations })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch holidays from edge function: ${response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching holidays from edge function:', error);
    
    // Extreme fallback if Edge Function fails entirely (e.g. offline)
    const BACKUP_NATIONAL_HOLIDAYS = [
      { date: `${year}-01-01`, name: "Confraternização Universal" },
      { date: `${year}-04-21`, name: "Tiradentes" },
      { date: `${year}-05-01`, name: "Dia do Trabalho" },
      { date: `${year}-09-07`, name: "Independência do Brasil" },
      { date: `${year}-10-12`, name: "Nossa Senhora Aparecida" },
      { date: `${year}-11-02`, name: "Finados" },
      { date: `${year}-11-15`, name: "Proclamação da República" },
      { date: `${year}-11-20`, name: "Dia da Consciência Negra" },
      { date: `${year}-12-25`, name: "Natal" }
    ];

    const nationalFallback: Holiday[] = BACKUP_NATIONAL_HOLIDAYS.map(h => ({
      id: `backup-${year}-${h.name}`,
      name: h.name,
      date: h.date,
      type: "national" as const,
      description: h.name
    }));

    return [...nationalFallback, ...buildStateHolidays(year, locations)];
  }
}

// Keep this helper for Dashboard compatibility
export async function getClientLocations(userId: string): Promise<{ city: string; state?: string }[]> {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .from('clients')
    .select('city, state')
    .eq('user_id', userId)
    .not('city', 'is', null);

  if (error || !data) return [];
  
  const seen = new Set();
  return data
    .map(c => ({
      city: c.city!.trim(),
      state: c.state ? c.state.trim().toUpperCase() : undefined
    }))
    .filter(c => {
      const key = `${c.city.toLowerCase().trim()}|${c.state || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
