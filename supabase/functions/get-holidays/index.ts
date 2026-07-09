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

    let municipalHolidays = (cachedDB || []).map(h => ({
      id: `municipal-${h.date}-${h.name}-${h.ibge_code}`,
      name: h.name,
      date: h.date,
      type: h.type,
      city: h.city_name,
      state: h.state_code,
      description: h.description
    }));

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
            
            let finalName = h.nome || h.name || "Feriado";
            const normName = finalName.toLowerCase();
            if ((normName.includes("aniversário") || normName.includes("cidade")) && cityName) {
              finalName = `Aniversário de ${cityName}`;
            } else if (normName === "feriado municipal" && cityName) {
              finalName = `Feriado - ${cityName}`;
            }

            newHolidaysToInsert.push({
              ibge_code: ibge,
              city_name: cityName,
              state_code: stateCode,
              date: isoDate,
              name: finalName,
              type: "municipal",
              description: h.descricao || finalName
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

    const combined = [...nationalHolidays, ...stateHolidays, ...municipalHolidays];
    
    // Sort
    combined.sort((a, b) => a.date.localeCompare(b.date));

    // Deduplicate dates for same municipality
    const seen = new Set();
    const deduplicated = combined.filter(h => {
        const key = `${h.date}-${h.name.substring(0, 5)}`;
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
