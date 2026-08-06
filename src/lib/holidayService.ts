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
const STATE_HOLIDAYS: Record<string, { month: number; day: number; name: string; description: string }[]> = {
  AC: [
    { month: 1, day: 23, name: "Dia do Evangélico", description: "Homenageia a comunidade evangélica do Acre e a chegada do protestantismo ao estado." },
    { month: 6, day: 15, name: "Aniversário do Acre", description: "Celebra a data de criação do Estado do Acre." },
    { month: 9, day: 5, name: "Dia da Amazônia", description: "Data de conscientização sobre a preservação da Floresta Amazônica, feriado oficial no Acre." },
    { month: 11, day: 17, name: "Assinatura do Tratado de Petrópolis", description: "Relembra o tratado de 1903 que anexou o território do Acre ao Brasil." },
  ],
  AL: [
    { month: 6, day: 24, name: "São João", description: "Festa junina em homenagem a São João Batista, tradicional em Alagoas." },
    { month: 6, day: 29, name: "São Pedro", description: "Festa junina em homenagem a São Pedro." },
    { month: 9, day: 16, name: "Emancipação Política de Alagoas", description: "Comemora a emancipação política de Alagoas, que deixou de ser comarca de Pernambuco em 1817." },
  ],
  AP: [
    { month: 3, day: 19, name: "São José", description: "Dia de São José, padroeiro do Amapá." },
    { month: 9, day: 13, name: "Criação do Território do Amapá", description: "Comemora a criação do antigo Território Federal do Amapá, em 1943." },
  ],
  AM: [
    { month: 9, day: 5, name: "Elevação do Amazonas a Província", description: "Comemora a elevação do Amazonas à condição de província, separando-se do Grão-Pará em 1850." },
    { month: 12, day: 8, name: "Nossa Senhora da Conceição", description: "Dia da padroeira do Amazonas, Nossa Senhora da Conceição." },
  ],
  BA: [{ month: 7, day: 2, name: "Independência da Bahia", description: "Comemora a expulsão das tropas portuguesas da Bahia em 1823, um dos últimos capítulos da independência do Brasil." }],
  CE: [
    { month: 3, day: 19, name: "São José", description: "Dia de São José, padroeiro do Ceará." },
    { month: 3, day: 25, name: "Data Magna do Ceará", description: "Relembra a abolição da escravatura no Ceará, ocorrida em 1884, quatro anos antes da abolição nacional." },
  ],
  DF: [{ month: 11, day: 30, name: "Dia do Evangélico", description: "Homenageia a comunidade evangélica do Distrito Federal." }],
  MA: [{ month: 7, day: 28, name: "Adesão do Maranhão à Independência", description: "Comemora a adesão do Maranhão à independência do Brasil, em 1823." }],
  MS: [{ month: 10, day: 11, name: "Criação do Estado de Mato Grosso do Sul", description: "Comemora o desmembramento de Mato Grosso do Sul do antigo Mato Grosso, em 1977." }],
  PA: [{ month: 8, day: 15, name: "Adesão do Pará à Independência", description: "Comemora a adesão do Pará à independência do Brasil, em 1823." }],
  PB: [{ month: 8, day: 5, name: "Fundação do Estado da Paraíba", description: "Comemora a fundação da capitania/estado da Paraíba." }],
  PR: [{ month: 12, day: 19, name: "Emancipação Política do Paraná", description: "Comemora a emancipação política do Paraná, separado de São Paulo em 1853." }],
  PE: [{ month: 3, day: 6, name: "Revolução Pernambucana", description: "Relembra a Revolução Pernambucana de 1817, movimento separatista contra o domínio português." }],
  PI: [{ month: 10, day: 19, name: "Dia do Piauí", description: "Celebra a criação da capitania do Piauí." }],
  RJ: [{ month: 4, day: 23, name: "São Jorge", description: "Dia de São Jorge, santo muito celebrado no Rio de Janeiro." }],
  RN: [
    { month: 8, day: 7, name: "Dia do Rio Grande do Norte", description: "Celebra a data magna do Rio Grande do Norte." },
    { month: 10, day: 3, name: "Mártires de Cunhaú e Uruaçu", description: "Relembra o massacre de colonos ocorrido em 1645, durante a ocupação holandesa no estado." },
  ],
  RS: [{ month: 9, day: 20, name: "Revolução Farroupilha", description: "Relembra o início da Revolução Farroupilha, em 1835, movimento separatista do Rio Grande do Sul." }],
  RO: [
    { month: 1, day: 4, name: "Criação do Estado de Rondônia", description: "Comemora a criação do Estado de Rondônia, em 1982." },
    { month: 6, day: 18, name: "Dia do Evangélico", description: "Homenageia a comunidade evangélica de Rondônia." },
  ],
  RR: [{ month: 10, day: 5, name: "Criação do Estado de Roraima", description: "Comemora a criação do Estado de Roraima, em 1988." }],
  SP: [{ month: 7, day: 9, name: "Revolução Constitucionalista de 1932", description: "Relembra o movimento armado de São Paulo contra o governo de Getúlio Vargas, em 1932, exigindo uma nova Constituição para o país." }],
  SE: [{ month: 7, day: 8, name: "Emancipação Política de Sergipe", description: "Comemora a emancipação política de Sergipe em relação à Bahia, em 1820." }],
  TO: [
    { month: 3, day: 18, name: "Autonomia do Estado do Tocantins", description: "Comemora a promulgação da lei que criou o Estado do Tocantins, em 1989." },
    { month: 10, day: 5, name: "Criação do Estado do Tocantins", description: "Data de instalação oficial do Estado do Tocantins, desmembrado de Goiás pela Constituição de 1988." },
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
        description: h.description,
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
      { date: `${year}-01-01`, name: "Confraternização Universal", description: "Celebra a chegada do novo ano civil." },
      { date: `${year}-04-21`, name: "Tiradentes", description: "Homenageia Joaquim José da Silva Xavier, o Tiradentes, líder da Inconfidência Mineira, executado em 1792 por lutar pela independência do Brasil." },
      { date: `${year}-05-01`, name: "Dia do Trabalho", description: "Celebra as conquistas dos trabalhadores e o Dia Internacional do Trabalho." },
      { date: `${year}-09-07`, name: "Independência do Brasil", description: "Comemora a proclamação da independência do Brasil em relação a Portugal, em 7 de setembro de 1822." },
      { date: `${year}-10-12`, name: "Nossa Senhora Aparecida", description: "Dia da padroeira do Brasil, Nossa Senhora Aparecida." },
      { date: `${year}-11-02`, name: "Finados", description: "Dia de homenagear e visitar os túmulos de parentes e entes queridos falecidos." },
      { date: `${year}-11-15`, name: "Proclamação da República", description: "Comemora a proclamação da República no Brasil, em 15 de novembro de 1889, que encerrou o período monárquico." },
      { date: `${year}-11-20`, name: "Dia da Consciência Negra", description: "Homenageia a luta do povo negro no Brasil e relembra a morte de Zumbi dos Palmares, símbolo da resistência à escravidão." },
      { date: `${year}-12-25`, name: "Natal", description: "Celebração cristã do nascimento de Jesus Cristo." }
    ];

    const nationalFallback: Holiday[] = BACKUP_NATIONAL_HOLIDAYS.map(h => ({
      id: `backup-${year}-${h.name}`,
      name: h.name,
      date: h.date,
      type: "national" as const,
      description: h.description
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
