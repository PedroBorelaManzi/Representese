import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE_URL_GITHUB = 'https://cdn.jsdelivr.net/gh/joaopbini/feriados-brasil@master/dados';

const normalize = (str: string) =>
  (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatBr = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

// Palavras-chave (j\u00e1 sem acento) que indicam que o feriado \u00e9 o anivers\u00e1rio
// de funda\u00e7\u00e3o/emancipa\u00e7\u00e3o do munic\u00edpio \u2014 cobre varia\u00e7\u00f5es comuns nas bases
// de feriados municipais al\u00e9m do simples "anivers\u00e1rio". Inclui "cidade" como
// pega-tudo, mas s\u00f3 \u00e9 checada DEPOIS de descartar "padroeiro/a" (ver abaixo),
// porque descri\u00e7\u00f5es de padroeiro tamb\u00e9m costumam citar "da Cidade"
// (ex.: "Dia do Padroeiro da Cidade") e n\u00e3o podem cair aqui por engano.
const ANIVERSARIO_KEYWORDS = [
  "aniversario", "fundacao", "emancipacao", "elevacao a categoria",
  "elevacao de categoria", "elevacao do municipio", "criacao do municipio",
  "dia do municipio", "dia da cidade", "instalacao do municipio",
  "instalacao da comarca", "cidade",
];

const PADROEIRO_KEYWORDS = ["padroeiro", "padroeira"];

/**
 * Traduz o nome/descri\u00e7\u00e3o bruto de um feriado municipal (vindo da fonte de
 * dados ou j\u00e1 salvo em cache) em algo que explique o que \u00e9 o feriado:
 * "Anivers\u00e1rio de X", ou "Padroeiro: Nome do Santo" (extra\u00eddo do pr\u00f3prio
 * nome ou da descri\u00e7\u00e3o) em vez de s\u00f3 "Padroeiro" sem dizer qual. Roda tanto
 * em cima de dados novos (rec\u00e9m-buscados) quanto de linhas j\u00e1 cacheadas \u2014
 * por isso nunca assume que o `rawName` j\u00e1 est\u00e1 "limpo".
 */
function classifyMunicipalHoliday(rawName: string, rawDescription: string, cityName: string) {
  const name = (rawName || "Feriado").trim();
  const description = (rawDescription || "").trim();
  const normName = normalize(name);
  const normDesc = normalize(description);

  const mentionsPadroeiro = PADROEIRO_KEYWORDS.some((k) => normName.includes(k) || normDesc.includes(k));

  // "Padroeiro" tem prioridade: a palavra "cidade" tamb\u00e9m aparece descrevendo
  // feriados de padroeiro (ex.: "Dia do Padroeiro da Cidade"), ent\u00e3o s\u00f3 cai
  // em Anivers\u00e1rio se n\u00e3o houver men\u00e7\u00e3o a padroeiro/padroeira.
  if (!mentionsPadroeiro && ANIVERSARIO_KEYWORDS.some((k) => normName.includes(k) || normDesc.includes(k))) {
    return {
      name: `Anivers\u00e1rio de ${cityName}`,
      description: description || `Anivers\u00e1rio de funda\u00e7\u00e3o/emancipa\u00e7\u00e3o de ${cityName}.`,
    };
  }

  if (mentionsPadroeiro) {
    // Tenta extrair o nome do santo/santa a partir do pr\u00f3prio nome bruto,
    // removendo termos gen\u00e9ricos tipo "Padroeiro do Munic\u00edpio".
    let saint = name
      .replace(/,?\s*padroeir[ao]\s*(d[oa]\s*(munic[\u00edi]pio|cidade))?/gi, "")
      .replace(/^dia\s+de\s+/i, "")
      .replace(/,\s*$/, "")
      .trim();

    // Nome bruto n\u00e3o trouxe o santo (ex.: era s\u00f3 "Padroeiro") \u2014 tenta achar
    // na descri\u00e7\u00e3o, formato comum: "Dia de X, padroeiro(a) do Munic\u00edpio".
    if (!saint || saint.length < 3) {
      const match =
        description.match(/dia\s+de\s+([^,]+),?\s*padroeir/i) ||
        description.match(/^([^,]+),?\s*padroeir/i);
      saint = match ? match[1].trim() : "";
    }

    const finalName = saint ? `Padroeiro: ${saint}` : `Padroeiro de ${cityName}`;
    return {
      name: finalName,
      description: description || `Feriado em homenagem ao(\u00e0) padroeiro(a) de ${cityName}.`,
    };
  }

  if (normName === "feriado municipal") {
    return {
      name: `Feriado - ${cityName}`,
      description: description || `Feriado municipal de ${cityName}.`,
    };
  }

  return { name, description: description || name };
}

/** Quando o mesmo feriado (mesmo nome j\u00e1 classificado) cai na mesma data em
 *  mais de uma cidade do usu\u00e1rio, junta num \u00fanico item listando as cidades \u2014
 *  em vez de mostrar s\u00f3 uma delas ou duplicar cards id\u00eanticos. S\u00f3 agrupa
 *  quando o santo foi identificado ("Padroeiro: Nome"), pra n\u00e3o misturar
 *  anivers\u00e1rios de cidades diferentes que caem por coincid\u00eancia na mesma
 *  data. */
function groupSharedPadroeiroAcrossCities<T extends { date: string; name: string; city?: string }>(list: T[]): T[] {
  const groups = new Map<string, T[]>();
  const passthrough: T[] = [];

  list.forEach((h) => {
    if (/^Padroeiro: /.test(h.name)) {
      const key = `${h.date}|${normalize(h.name)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(h);
    } else {
      passthrough.push(h);
    }
  });

  const merged: T[] = [];
  groups.forEach((items) => {
    if (items.length === 1) {
      merged.push(items[0]);
      return;
    }
    const cities = Array.from(new Set(items.map((i) => i.city).filter(Boolean) as string[]));
    merged.push({
      ...items[0],
      city: cities.join(", "),
      description: `${(items[0] as any).description} Feriado do padroeiro celebrado em: ${cities.join(", ")}.`,
    } as T);
  });

  return [...passthrough, ...merged];
}

/** Quando a mesma cidade celebra o mesmo feriado (mesmo nome j\u00e1 classificado)
 *  em dias seguidos \u2014 festa do padroeiro que dura v\u00e1rios dias, por exemplo \u2014
 *  anota o per\u00edodo completo na descri\u00e7\u00e3o de cada dia, em vez de deixar cada
 *  card parecer um feriado avulso de um dia s\u00f3. */
function annotateMultiDaySpans<T extends { date: string; name: string; city?: string; description?: string }>(list: T[]): void {
  const byKey = new Map<string, T[]>();
  list.forEach((h) => {
    const key = `${normalize(h.name)}|${h.city || ""}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(h);
  });

  byKey.forEach((items) => {
    if (items.length < 2) return;
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    let consecutive = true;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(`${sorted[i - 1].date}T00:00:00`);
      const curr = new Date(`${sorted[i].date}T00:00:00`);
      const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
      if (diffDays !== 1) {
        consecutive = false;
        break;
      }
    }
    if (!consecutive) return;

    const rangeLabel = `Comemorado de ${formatBr(sorted[0].date)} a ${formatBr(sorted[sorted.length - 1].date)}.`;
    sorted.forEach((h) => {
      if (!h.description?.includes("Comemorado de")) {
        h.description = `${h.description || ""} ${rangeLabel}`.trim();
      }
    });
  });
}

// Feriados estaduais brasileiros (data fixa, definidos por lei estadual).
// N\u00e3o inclu\u00edmos datas que sempre coincidem com um feriado nacional
// (ex.: DF/MG em 21/04 = Tiradentes) para evitar duplicidade na agenda.
const STATE_HOLIDAYS: Record<string, { month: number; day: number; name: string }[]> = {
  AC: [
    { month: 1, day: 23, name: "Dia do Evang\u00e9lico" },
    { month: 6, day: 15, name: "Anivers\u00e1rio do Acre" },
    { month: 9, day: 5, name: "Dia da Amaz\u00f4nia" },
    { month: 11, day: 17, name: "Assinatura do Tratado de Petr\u00f3polis" },
  ],
  AL: [
    { month: 6, day: 24, name: "S\u00e3o Jo\u00e3o" },
    { month: 6, day: 29, name: "S\u00e3o Pedro" },
    { month: 9, day: 16, name: "Emancipa\u00e7\u00e3o Pol\u00edtica de Alagoas" },
  ],
  AP: [
    { month: 3, day: 19, name: "S\u00e3o Jos\u00e9" },
    { month: 9, day: 13, name: "Cria\u00e7\u00e3o do Territ\u00f3rio do Amap\u00e1" },
  ],
  AM: [
    { month: 9, day: 5, name: "Eleva\u00e7\u00e3o do Amazonas a Prov\u00edncia" },
    { month: 12, day: 8, name: "Nossa Senhora da Concei\u00e7\u00e3o" },
  ],
  BA: [{ month: 7, day: 2, name: "Independ\u00eancia da Bahia" }],
  CE: [
    { month: 3, day: 19, name: "S\u00e3o Jos\u00e9" },
    { month: 3, day: 25, name: "Data Magna do Cear\u00e1" },
  ],
  DF: [{ month: 11, day: 30, name: "Dia do Evang\u00e9lico" }],
  MA: [{ month: 7, day: 28, name: "Ades\u00e3o do Maranh\u00e3o \u00e0 Independ\u00eancia" }],
  MS: [{ month: 10, day: 11, name: "Cria\u00e7\u00e3o do Estado de Mato Grosso do Sul" }],
  PA: [{ month: 8, day: 15, name: "Ades\u00e3o do Par\u00e1 \u00e0 Independ\u00eancia" }],
  PB: [{ month: 8, day: 5, name: "Funda\u00e7\u00e3o do Estado da Para\u00edba" }],
  PR: [{ month: 12, day: 19, name: "Emancipa\u00e7\u00e3o Pol\u00edtica do Paran\u00e1" }],
  PE: [{ month: 3, day: 6, name: "Revolu\u00e7\u00e3o Pernambucana" }],
  PI: [{ month: 10, day: 19, name: "Dia do Piau\u00ed" }],
  RJ: [{ month: 4, day: 23, name: "S\u00e3o Jorge" }],
  RN: [
    { month: 8, day: 7, name: "Dia do Rio Grande do Norte" },
    { month: 10, day: 3, name: "M\u00e1rtires de Cunha\u00fa e Urua\u00e7u" },
  ],
  RS: [{ month: 9, day: 20, name: "Revolu\u00e7\u00e3o Farroupilha" }],
  RO: [
    { month: 1, day: 4, name: "Cria\u00e7\u00e3o do Estado de Rond\u00f4nia" },
    { month: 6, day: 18, name: "Dia do Evang\u00e9lico" },
  ],
  RR: [{ month: 10, day: 5, name: "Cria\u00e7\u00e3o do Estado de Roraima" }],
  SP: [{ month: 7, day: 9, name: "Revolu\u00e7\u00e3o Constitucionalista de 1932" }],
  SE: [{ month: 7, day: 8, name: "Emancipa\u00e7\u00e3o Pol\u00edtica de Sergipe" }],
  TO: [
    { month: 3, day: 18, name: "Autonomia do Estado do Tocantins" },
    { month: 10, day: 5, name: "Cria\u00e7\u00e3o do Estado do Tocantins" },
  ],
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { year, locations } = await req.json();

    if (!year || !Array.isArray(locations)) {
      return new Response(JSON.stringify({ error: 'Missing year or locations array' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch National Holidays
    let nationalData: any[] = [];
    try {
      const natRes = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      if (natRes.ok) {
        const data = await natRes.json();
        nationalData = Array.isArray(data) ? data : [];
      }
    } catch (e) {
      console.warn("Failed to fetch national holidays:", e);
    }
    
    // Add default if needed
    if (nationalData.length === 0) {
      nationalData = [
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
    }

    const nationalHolidays = nationalData.map((h: any) => ({
      id: `national-${h.date}-${h.name}`,
      name: h.name,
      date: h.date,
      type: "national",
      description: h.name
    }));

    // 1b. State holidays: derived from the distinct UFs among the user's clients.
    const distinctStates = new Set<string>(
      locations
        .map((l: any) => (l.state || "").trim().toUpperCase())
        .filter((s: string) => s.length > 0)
    );

    const stateHolidays: any[] = [];
    distinctStates.forEach((uf) => {
      (STATE_HOLIDAYS[uf] || []).forEach((h) => {
        const isoDate = `${year}-${pad2(h.month)}-${pad2(h.day)}`;
        stateHolidays.push({
          id: `estadual-${uf}-${isoDate}-${h.name}`,
          name: h.name,
          date: isoDate,
          type: "estadual",
          state: uf,
          description: h.name,
        });
      });
    });

    if (locations.length === 0) {
      return new Response(JSON.stringify(nationalHolidays), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. Determine which cities we already have cached in the DB for this year
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;

    const cityNames = locations.map(l => l.city.trim());
    const { data: cachedDB, error: dbError } = await supabaseClient
      .from('city_holidays')
      .select('*')
      .in('city_name', cityNames)
      .gte('date', startOfYear)
      .lte('date', endOfYear);

    // Reclassifica também linhas já cacheadas (não persiste — só na resposta):
    // registros salvos antes dessa lógica existir podem ter nome genérico tipo
    // "Padroeiro" sem dizer qual santo/cidade; refazer a extração aqui atualiza
    // a exibição sem precisar esperar um novo fetch da fonte externa.
    let municipalHolidays = (cachedDB || []).map(h => {
      const classified = classifyMunicipalHoliday(h.name, h.description || '', h.city_name);
      return {
        id: `municipal-${h.date}-${h.name}-${h.ibge_code}`,
        name: classified.name,
        date: h.date,
        type: h.type,
        city: h.city_name,
        state: h.state_code,
        description: classified.description
      };
    });

    const citiesWithRecords = new Set((cachedDB || []).map(h => normalize(h.city_name)));
    const missingCities = locations.filter(l => !citiesWithRecords.has(normalize(l.city)));

    if (missingCities.length > 0) {
      console.log(`Missing cache for ${missingCities.length} cities. Fetching from remote...`);
      
      const [munRes, estRes, masterRes] = await Promise.all([
        fetch(`${BASE_URL_GITHUB}/localizacao/municipios/municipios.json`),
        fetch(`${BASE_URL_GITHUB}/localizacao/estados/estados.json`),
        fetch(`${BASE_URL_GITHUB}/feriados/municipal/json/${year}.json`)
      ]);

      if (munRes.ok && estRes.ok && masterRes.ok) {
        const municipios = await munRes.json();
        const estados = await estRes.json();
        const masterHolidays = await masterRes.json();

        const stateToCode = new Map<string, number>();
        estados.forEach((e: any) => {
          const key = (e.uf || e.sigla || '').toUpperCase();
          if (key) stateToCode.set(key, e.codigo_uf);
        });

        const targetIbgeCodes = new Set<number>();
        const cityMap = new Map<number, string>(); 
        const cityStateMap = new Map<number, string>();

        missingCities.forEach(loc => {
          const stateKey = (loc.state || "").trim().toUpperCase();
          const stateCode = stateToCode.get(stateKey);
          const normCity = normalize(loc.city);
          
          const match = municipios.find((m: any) => {
            const cityMatch = normalize(m.nome) === normCity;
            if (stateCode) return m.codigo_uf === stateCode && cityMatch;
            return cityMatch;
          });

          if (match) {
            const ibge = Number(match.codigo_ibge);
            targetIbgeCodes.add(ibge);
            cityMap.set(ibge, loc.city.trim()); // Store original case
            const st = estados.find((e: any) => e.codigo_uf === match.codigo_uf);
            if (st) cityStateMap.set(ibge, st.sigla);
          }
        });

        const newHolidaysToInsert: any[] = [];

        masterHolidays.forEach((h: any) => {
          const ibge = Number(h.codigo_ibge);
          if (targetIbgeCodes.has(ibge)) {
            const cityName = cityMap.get(ibge) || h.municipio || "";
            const stateCode = cityStateMap.get(ibge) || h.uf || "";
            
            const dateParts = h.data.split("/");
            let isoDate = h.data;
            if (dateParts.length === 3) {
              const [day, month, yearPart] = dateParts;
              isoDate = `${yearPart}-${month}-${day}`;
            }
            
            const rawName = h.nome || h.name || "Feriado";
            const classified = classifyMunicipalHoliday(rawName, h.descricao || '', cityName || 'Sua cidade');

            newHolidaysToInsert.push({
              ibge_code: ibge,
              city_name: cityName,
              state_code: stateCode,
              date: isoDate,
              name: classified.name,
              type: "municipal",
              description: classified.description
            });
          }
        });

        if (newHolidaysToInsert.length > 0) {
          const { error: insertError } = await supabaseClient
            .from('city_holidays')
            .upsert(newHolidaysToInsert, { onConflict: 'ibge_code, date, name' });
            
          if (insertError) console.error("Error caching new holidays:", insertError);
          
          newHolidaysToInsert.forEach(h => {
            municipalHolidays.push({
              id: `municipal-${h.date}-${h.name}-${h.ibge_code}`,
              name: h.name,
              date: h.date,
              type: h.type,
              city: h.city_name,
              state: h.state_code,
              description: h.description
            });
          });
        }
      }
    }

    // Antes de juntar com nacional/estadual: anota festas de vários dias
    // seguidos (mesma cidade, mesmo nome de feriado em datas consecutivas) e
    // junta o mesmo padroeiro quando cai na mesma data em mais de uma cidade
    // do usuário — assim o card já explica "comemorado de X a Y" e "também
    // celebrado em: cidade A, cidade B" em vez de mostrar só um nome solto.
    annotateMultiDaySpans(municipalHolidays);
    municipalHolidays = groupSharedPadroeiroAcrossCities(municipalHolidays);

    const combined = [...nationalHolidays, ...stateHolidays, ...municipalHolidays];

    // Sort
    combined.sort((a, b) => a.date.localeCompare(b.date));

    // Deduplicate: antes usava só os 5 primeiros caracteres do nome, o que
    // colapsava feriados de cidades DIFERENTES que caíssem na mesma data com
    // nomes parecidos (ex.: duas cidades com "Feriado Municipal" no mesmo
    // dia viravam um só, perdendo a segunda). A chave agora inclui tipo e
    // cidade/estado, então só remove duplicata de verdade (mesmo feriado,
    // mesmo lugar).
    const seen = new Set();
    const deduplicated = combined.filter(h => {
        const key = `${h.date}-${h.type}-${normalize(h.name)}-${(h as any).city || (h as any).state || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return new Response(JSON.stringify(deduplicated), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
