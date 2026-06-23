import { supabase } from "./supabase";

type CacheEntry = {
  coords: { lat: number; lng: number } | null;
  expiry: number;
};

const memoryCache = new Map<string, { lat: number; lng: number } | null>();

/** Rejeita coords fora do território brasileiro. */
function isWithinBrazil(lat: number, lng: number): boolean {
  return lat >= -34 && lat <= 6 && lng >= -74 && lng <= -28;
}

function getCachedCoords(key: string): { lat: number; lng: number } | null | undefined {
  const normalized = key.trim().toLowerCase();
  if (memoryCache.has(normalized)) return memoryCache.get(normalized);
  try {
    const raw = localStorage.getItem(`geo_cache_${normalized}`);
    if (raw) {
      const entry: CacheEntry = JSON.parse(raw);
      if (Date.now() < entry.expiry) {
        memoryCache.set(normalized, entry.coords);
        return entry.coords;
      }
      localStorage.removeItem(`geo_cache_${normalized}`);
    }
  } catch {}
  return undefined;
}

function setCachedCoords(key: string, coords: { lat: number; lng: number } | null) {
  const normalized = key.trim().toLowerCase();
  memoryCache.set(normalized, coords);
  try {
    const entry: CacheEntry = { coords, expiry: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    localStorage.setItem(`geo_cache_${normalized}`, JSON.stringify(entry));
  } catch {}
}

/** Faz uma query no Nominatim e valida que o resultado está no Brasil. */
async function nominatimSearch(querystring: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&${querystring}`,
      { headers: { "User-Agent": "RepresenteSeGeocoding/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!isWithinBrazil(lat, lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export interface GeocodingExtra {
  /** Razão social da empresa (vinda da Receita Federal via BrasilAPI). */
  razaoSocial?: string;
  /** Nome fantasia (vindo da BrasilAPI). */
  nomeFantasia?: string;
  /** Logradouro sem número (ex: "Rua das Flores"). */
  street?: string;
  /** Número do endereço. */
  number?: string;
  /** Bairro. */
  neighborhood?: string;
  /** Município. */
  city?: string;
  /** UF (sigla). */
  state?: string;
  /** CEP (só dígitos, 8 caracteres). */
  cep?: string;
}

/**
 * Geocodifica um endereço de empresa com cascata de 6 tiers:
 *
 * 0. Cache (memória + localStorage 7 dias)
 * 1. Nominatim por CEP — identifica a rua exata, máxima precisão
 * 2. Nominatim estruturado — logradouro + número + cidade + estado
 * 3. Gemini com contexto rico — usa conhecimento de treinamento sobre a empresa
 * 4. OpenCage — geocodificador profissional, free até 2.500 req/dia
 * 5. Nominatim por nome da empresa + cidade
 * 6. Nominatim só pela cidade — mínimo aceitável
 */
export async function getHighPrecisionCoordinates(
  address: string,
  clientName?: string,
  cnpj?: string,
  extra?: GeocodingExtra
): Promise<{ lat: number; lng: number } | null> {
  const hasAddress = Boolean(address?.trim());
  const hasCity = Boolean(extra?.city?.trim());
  if (!hasAddress && !hasCity) return null;

  const cacheKey = address?.trim() || `${extra?.city},${extra?.state}`;

  // ── Tier 0: Cache ───────────────────────────────────────────────
  const cached = getCachedCoords(cacheKey);
  if (cached !== undefined) return cached;

  // ── Tier 1: Nominatim por CEP ────────────────────────────────────
  // CEP identifica o trecho de rua exato no Brasil — mais preciso que texto livre
  if (extra?.cep && extra.cep.length === 8) {
    const qs = new URLSearchParams({
      postalcode: extra.cep,
      country: "Brazil",
    }).toString();
    const coords = await nominatimSearch(qs);
    if (coords) {
      setCachedCoords(cacheKey, coords);
      return coords;
    }
  }

  // ── Tier 2: Nominatim estruturado ────────────────────────────────
  // Campos separados da BrasilAPI: logradouro + número + cidade + estado
  if (extra?.street && extra?.city) {
    const streetWithNum = [extra.street, extra.number].filter(Boolean).join(" ");
    const qs = new URLSearchParams({
      street: streetWithNum,
      city: extra.city,
      state: extra.state || "",
      country: "Brazil",
    }).toString();
    const coords = await nominatimSearch(qs);
    if (coords) {
      setCachedCoords(cacheKey, coords);
      return coords;
    }
  }

  // helper: pega token de auth uma única vez para os tiers de backend
  async function getAuthToken(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  const token = await getAuthToken();

  // ── Tier 3: Gemini com contexto rico ─────────────────────────────
  // Usa o conhecimento de treinamento do Gemini sobre a empresa pelo nome/CNPJ
  if (token) {
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "geocode",
          payload: {
            address,
            name: clientName,
            cnpj,
            razaoSocial: extra?.razaoSocial,
            nomeFantasia: extra?.nomeFantasia,
            city: extra?.city,
            state: extra?.state,
            cep: extra?.cep,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (
          data &&
          typeof data.lat === "number" &&
          typeof data.lng === "number" &&
          isWithinBrazil(data.lat, data.lng)
        ) {
          setCachedCoords(cacheKey, data);
          return data;
        }
      }
    } catch {}
  }

  // ── Tier 4: OpenCage ─────────────────────────────────────────────
  // Geocodificador profissional, free até 2.500 req/dia
  // Requer OPENCAGE_API_KEY nas variáveis de ambiente do Vercel
  if (token) {
    try {
      const query = [
        extra?.razaoSocial || clientName,
        extra?.street,
        extra?.city,
        extra?.state,
        "Brasil",
      ]
        .filter(Boolean)
        .join(", ");

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "opencage",
          payload: { query, cep: extra?.cep, city: extra?.city, state: extra?.state },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (
          data &&
          typeof data.lat === "number" &&
          typeof data.lng === "number" &&
          isWithinBrazil(data.lat, data.lng)
        ) {
          setCachedCoords(cacheKey, data);
          return data;
        }
      }
    } catch {}
  }

  // ── Tier 5: Nominatim por nome da empresa ─────────────────────────
  const searchName = extra?.razaoSocial || extra?.nomeFantasia || clientName;
  if (searchName && extra?.city) {
    const q = `${searchName} ${extra.city} ${extra.state || ""} Brasil`.trim();
    const coords = await nominatimSearch(new URLSearchParams({ q }).toString());
    if (coords) {
      setCachedCoords(cacheKey, coords);
      return coords;
    }
  }

  if (extra?.nomeFantasia && extra.nomeFantasia !== extra?.razaoSocial && extra?.city) {
    const q = `${extra.nomeFantasia} ${extra.city} ${extra.state || ""} Brasil`.trim();
    const coords = await nominatimSearch(new URLSearchParams({ q }).toString());
    if (coords) {
      setCachedCoords(cacheKey, coords);
      return coords;
    }
  }

  // ── Tier 6: Nominatim só pela cidade ─────────────────────────────
  // Mínimo aceitável: pin na cidade certa, não em outra cidade ou estado
  if (extra?.city) {
    const qs = new URLSearchParams({
      city: extra.city,
      state: extra.state || "",
      country: "Brazil",
    }).toString();
    const coords = await nominatimSearch(qs);
    if (coords) {
      setCachedCoords(cacheKey, coords);
      return coords;
    }
  }

  setCachedCoords(cacheKey, null);
  return null;
}
