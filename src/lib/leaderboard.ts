import { supabase } from "./supabase";

/* ────────────────────────────────────────────────────────────────
   Ranking anônimo (gamificação).

   Privacidade em primeiro lugar: o app calcula LOCALMENTE os dois
   percentuais do usuário e publica na tabela `leaderboard` apenas
   o apelido + os números. Nenhum dado bruto (clientes, faturamento,
   nomes) é exposto. Os concorrentes nunca veem a carteira um do outro.

   Dois rankings, ambos em % (justos entre carteiras grandes e pequenas):
   - Menos clientes inativos (menor % vence)
   - Mais clientes visitados no mês (maior % vence)
   ──────────────────────────────────────────────────────────────── */

export interface LeaderboardRow {
  user_id: string;
  apelido: string;
  total_clients: number;
  pct_inativos: number;
  pct_visitados: number;
  updated_at: string;
}

export interface MyStats {
  totalClients: number;
  pctInativos: number;
  pctVisitados: number;
}

/** Calcula os agregados do usuário a partir da carteira e das visitas do mês. */
export async function computeMyStats(userId: string, inativoDays: number): Promise<MyStats> {
  // Carteira: último contato de cada cliente
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, last_contact")
    .eq("user_id", userId);
  if (error) throw error;

  const total = clients?.length || 0;
  if (total === 0) return { totalClients: 0, pctInativos: 0, pctVisitados: 0 };

  const now = Date.now();
  let inativos = 0;
  for (const c of clients!) {
    const t = c.last_contact ? new Date(c.last_contact).getTime() : NaN;
    const dias = Number.isNaN(t) ? Infinity : Math.floor((now - t) / 86_400_000);
    if (dias >= inativoDays) inativos++;
  }

  // Visitas confirmadas no mês corrente (clientes distintos)
  const start = new Date();
  start.setDate(1);
  const startISO = start.toISOString().slice(0, 10);
  const { data: visits } = await supabase
    .from("visits")
    .select("client_id")
    .eq("user_id", userId)
    .eq("status", "visited")
    .gte("planned_date", startISO);

  const visitedClients = new Set((visits || []).map((v) => v.client_id));

  return {
    totalClients: total,
    pctInativos: Math.round((inativos / total) * 1000) / 10,
    pctVisitados: Math.round((visitedClients.size / total) * 1000) / 10,
  };
}

/** Entra/atualiza o ranking publicando apelido + percentuais. */
export async function joinOrRefresh(
  userId: string,
  apelido: string,
  stats: MyStats
): Promise<void> {
  const { error } = await supabase.from("leaderboard").upsert({
    user_id: userId,
    apelido: apelido.trim().slice(0, 24),
    total_clients: stats.totalClients,
    pct_inativos: stats.pctInativos,
    pct_visitados: stats.pctVisitados,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Sai do ranking (remove a própria linha). */
export async function leaveRanking(userId: string): Promise<void> {
  const { error } = await supabase.from("leaderboard").delete().eq("user_id", userId);
  if (error) throw error;
}

/** Busca a linha do próprio usuário (null = não participa). */
export async function fetchMyRow(userId: string): Promise<LeaderboardRow | null> {
  const { data } = await supabase
    .from("leaderboard")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as LeaderboardRow) || null;
}

/** Busca todas as linhas do ranking (agregado anônimo). */
export async function fetchRanking(): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []) as LeaderboardRow[];
}
