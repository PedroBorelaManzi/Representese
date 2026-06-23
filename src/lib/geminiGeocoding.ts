import { supabase } from "./supabase";

type CacheEntry = {
  coords: { lat: number; lng: number } | null;
  expiry: number;
};

const memoryCache = new Map<string, { lat: number; lng: number } | null>();

/** Centros aproximados das capitais de cada estado brasileiro. */
const STATE_CENTERS: Record<string, { lat: number; lng: number }> = {
  AC: { lat: -9.97, lng: -67.81 },
  AL: { lat: -9.67, lng: -35.74 },
  AM: { lat: -3.10, lng: -60.03 },
  AP: { lat: 0.03, lng: -51.07 },
  BA: { lat: -12.97, lng: -38.50 },
  CE: { lat: -3.72, lng: -38.54 },
  DF: { lat: -15.78, lng: -47.93 },
  ES: { lat: -20.32, lng: -40.34 },
  GO: { lat: -16.69, lng: -49.25 },
  MA: { lat: -2.53, lng: -44.30 },
  MG: { lat: -19.92, lng: -43.94 },
  MS: { lat: -20.46, lng: -54.62 },
  MT: { lat: -15.60, lng: -56.10 },
  PA: { lat: -1.46, lng: -48.50 },
  PB: { lat: -7.12, lng: -34.86 },
  PE: { lat: -8.06, lng: -34.87 },
  PI: { lat: -5.09, lng: -42.80 },
  PR: { lat: -25.42, lng: -49.27 },
  RJ: { lat: -22.91, lng: -43.17 },
  RN: { lat: -5.79, lng: -35.21 },
  RO: { lat: -8.76, lng: -63.90 },
  RR: { lat: 2.82, lng: -60.67 },
  RS: { lat: -30.03, lng: -51.23 },
  SC: { lat: -27.60, lng: -48.55 },
  SE: { lat: -10.91, lng: -37.07 },
  SP: { lat: -23.55, lng: -46.63 },
  TO: { lat: -10.18, lng: -48.33 },
};

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
}

/**
 * Geocodifica um endereço de empresa com cascata de 5 tiers:
 *
 * 0. Cache (memória + localStorage 7 dias)
 * 1. Nominatim estruturado — logradouro + número + cidade + estado
 * 2. Gemini com contexto rico — razão social, fantasia, CNPJ, cidade (conhecimento de treinamento)
 * 3. Nominatim por nome da empresa — razão social / fantasia + cidade
 * 4. Nominatim só pela cidade — garante pin na cidade certa
 * 5. Centro do estado (fallback geográfico seguro)
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

  // ── Tier 1: Nominatim estruturado ────────────────────────────────
  // Campos separados da BrasilAPI: mais preciso que texto livre
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

  // ── Tier 2: Gemini com contexto rico ─────────────────────────────
  // Usa o conhecimento de treinamento sobre a empresa (razão social, fantasia, CNPJ)
  // antes de tentativas textuais menos confiáveis no Nominatim
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (token) {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
          },
        }),
      });
      if (response.ok) {
        const data = await response.json();
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
    }
  } catch {}

  // ── Tier 3: Nominatim por nome da empresa ─────────────────────────
  // Imita busca manual no mapa: "Razão Social Cidade Estado Brasil"
  const searchName = extra?.razaoSocial || extra?.nomeFantasia || clientName;
  if (searchName && extra?.city) {
    const q = `${searchName} ${extra.city} ${extra.state || ""} Brasil`.trim();
    const coords = await nominatimSearch(new URLSearchParams({ q }).toString());
    if (coords) {
      setCachedCoords(cacheKey, coords);
      return coords;
    }
  }

  // Tenta também com nome fantasia se diferente da razão social
  if (extra?.nomeFantasia && extra.nomeFantasia !== extra?.razaoSocial && extra?.city) {
    const q = `${extra.nomeFantasia} ${extra.city} ${extra.state || ""} Brasil`.trim();
    const coords = await nominatimSearch(new URLSearchParams({ q }).toString());
    if (coords) {
      setCachedCoords(cacheKey, coords);
      return coords;
    }
  }

  // ── Tier 4: Nominatim só pela cidade ─────────────────────────────
  // Garante que, no mínimo, o pin fique na cidade correta
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

  // ── Tier 5: Centro do estado (fallback geográfico) ────────────────
  const stateKey = (extra?.state || "").toUpperCase().trim();
  if (stateKey && STATE_CENTERS[stateKey]) {
    // Não cacheia: fallback geográfico — tenta novamente na próxima vez
    return STATE_CENTERS[stateKey];
  }

  setCachedCoords(cacheKey, null);
  return null;
}
