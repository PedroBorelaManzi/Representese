import { supabase } from "./supabase";

/* ────────────────────────────────────────────────────────────────
   Roteiro de visitas.

   O representante monta o roteiro do dia (clientes a visitar) no Mapa.
   Com o app aberto, o GPS detecta quando ele chega a <100m de um cliente
   e oferece confirmar a visita. A visita confirmada atualiza
   clients.last_contact e conta para o ranking de visitas (gamificação).
   ──────────────────────────────────────────────────────────────── */

export type VisitStatus = "planned" | "visited" | "skipped";

export interface Visit {
  id: string;
  client_id: string;
  planned_date: string; // YYYY-MM-DD
  status: VisitStatus;
  visited_at: string | null;
}

/** Raio (em metros) para considerar que o representante chegou ao cliente. */
export const PROXIMITY_METERS = 100;

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Distância em metros entre dois pontos (Haversine). */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000; // raio da Terra em metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Busca as visitas de uma data (padrão: hoje). */
export async function fetchVisits(userId: string, date = todayISO()): Promise<Visit[]> {
  const { data, error } = await supabase
    .from("visits")
    .select("id, client_id, planned_date, status, visited_at")
    .eq("user_id", userId)
    .eq("planned_date", date)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as Visit[];
}

/** Adiciona um cliente ao roteiro de uma data (idempotente via unique index). */
export async function addToRoteiro(
  userId: string,
  clientId: string,
  date = todayISO()
): Promise<Visit> {
  const { data, error } = await supabase
    .from("visits")
    .upsert(
      { user_id: userId, client_id: clientId, planned_date: date, status: "planned" },
      { onConflict: "user_id,client_id,planned_date", ignoreDuplicates: false }
    )
    .select("id, client_id, planned_date, status, visited_at")
    .single();
  if (error) throw error;
  return data as Visit;
}

/** Remove um cliente do roteiro. */
export async function removeFromRoteiro(userId: string, visitId: string): Promise<void> {
  const { error } = await supabase
    .from("visits")
    .delete()
    .eq("id", visitId)
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * Confirma a visita: marca como visitada e atualiza o último contato do cliente.
 * (a visita é o que alimenta o ranking de visitas da gamificação)
 */
export async function confirmVisit(
  userId: string,
  visit: Visit,
  clientId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("visits")
    .update({ status: "visited", visited_at: now })
    .eq("id", visit.id)
    .eq("user_id", userId);
  if (error) throw error;

  // Visita conta como contato → atualiza last_contact (zera alerta de inatividade)
  await supabase
    .from("clients")
    .update({ last_contact: todayISO() })
    .eq("id", clientId)
    .eq("user_id", userId);
}
