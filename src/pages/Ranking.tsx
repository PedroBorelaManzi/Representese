import React, { useState, useEffect, useMemo } from "react";
import {
  Trophy,
  Loader2,
  ShieldCheck,
  UserCheck,
  Footprints,
  Crown,
  Medal,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  type LeaderboardRow,
  computeMyStats,
  joinOrRefresh,
  leaveRanking,
  fetchMyRow,
  fetchRanking,
} from "../lib/leaderboard";

type Board = "inativos" | "visitados";

export default function Ranking() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const inativoDays = settings?.inativo_days ?? 90;

  const [loading, setLoading] = useState(true);
  const [myRow, setMyRow] = useState<LeaderboardRow | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [apelido, setApelido] = useState("");
  const [joining, setJoining] = useState(false);
  const [board, setBoard] = useState<Board>("inativos");

  const refreshAll = async (showStats = true) => {
    if (!user) return;
    try {
      const mine = await fetchMyRow(user.id);
      // Se participo, recalcula meus números e publica antes de buscar o ranking
      if (mine && showStats) {
        const stats = await computeMyStats(user.id, inativoDays);
        await joinOrRefresh(user.id, mine.apelido, stats);
      }
      const [updatedMine, all] = await Promise.all([fetchMyRow(user.id), fetchRanking()]);
      setMyRow(updatedMine);
      setRows(all);
    } catch {
      toast.error("Não consegui carregar o ranking.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleJoin = async () => {
    if (!user) return;
    const nick = apelido.trim();
    if (nick.length < 2) {
      toast.error("Escolha um apelido (mín. 2 letras).");
      return;
    }
    setJoining(true);
    try {
      const stats = await computeMyStats(user.id, inativoDays);
      await joinOrRefresh(user.id, nick, stats);
      toast.success("Você entrou no ranking! 🏆");
      await refreshAll(false);
    } catch {
      toast.error("Erro ao entrar no ranking.");
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!user) return;
    if (!window.confirm("Sair do ranking? Seus números deixam de aparecer para os outros.")) return;
    try {
      await leaveRanking(user.id);
      setMyRow(null);
      toast("Você saiu do ranking.");
      await refreshAll(false);
    } catch {
      toast.error("Erro ao sair do ranking.");
    }
  };

  // Ordena conforme o board ativo (inativos: menor vence; visitados: maior vence)
  const ranked = useMemo(() => {
    const valid = rows.filter((r) => r.total_clients > 0);
    const sorted = [...valid].sort((a, b) =>
      board === "inativos"
        ? a.pct_inativos - b.pct_inativos
        : b.pct_visitados - a.pct_visitados
    );
    return sorted;
  }, [rows, board]);

  const myPosition = useMemo(
    () => (myRow ? ranked.findIndex((r) => r.user_id === myRow.user_id) + 1 : 0),
    [ranked, myRow]
  );

  if (loading) {
    return (
      <div className="h-[calc(100dvh-2rem)] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-2rem)] flex flex-col gap-6 overflow-y-auto custom-scrollbar">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 pt-6 pb-5 border-b border-slate-200/70 dark:border-zinc-800/70 bg-gradient-to-r from-white to-slate-50/50 dark:from-zinc-900 dark:to-zinc-950/50 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-zinc-100">Ranking</h1>
            <p className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              Compita com outros representantes
            </p>
          </div>
        </div>
        {myRow && (
          <button
            onClick={() => refreshAll(true)}
            className="px-4 py-2.5 bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar meus números
          </button>
        )}
      </div>

      <div className="px-6 pb-6 flex flex-col gap-6">
        {/* Não participa → opt-in */}
        {!myRow ? (
          <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 md:p-8 max-w-lg mx-auto w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-7 h-7 text-amber-500" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-zinc-100">Entre no ranking</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">
              Compita de forma <strong>anônima</strong>: os outros só veem seu apelido e dois percentuais.
              Sua carteira, clientes e faturamento <strong>nunca</strong> são compartilhados.
            </p>
            <div className="flex items-center gap-2 justify-center mt-4 mb-5 text-[11px] font-bold text-emerald-600">
              <ShieldCheck className="w-4 h-4" /> 100% anônimo · só números, nunca dados
            </div>
            <input
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              maxLength={24}
              placeholder="Seu apelido no ranking"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-sm font-bold text-center outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full mt-3 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
              Participar
            </button>
          </div>
        ) : (
          <>
            {/* Minha posição */}
            <div className="rounded-3xl bg-gradient-to-br from-amber-500 to-amber-600 p-6 shadow-xl shadow-amber-500/20 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
              <div className="relative flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-widest text-amber-100">
                    Sua posição · {board === "inativos" ? "menos inativos" : "mais visitados"}
                  </div>
                  <div className="text-4xl font-black text-white mt-1">
                    {myPosition > 0 ? `${myPosition}º` : "—"}
                    <span className="text-lg font-bold text-amber-100"> de {ranked.length}</span>
                  </div>
                  <div className="text-xs font-bold text-amber-50/90 mt-1">
                    {board === "inativos"
                      ? `${myRow.pct_inativos}% da carteira inativa`
                      : `${myRow.pct_visitados}% da carteira visitada no mês`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-amber-100">Apelido</div>
                  <div className="text-lg font-black text-white">{myRow.apelido}</div>
                </div>
              </div>
            </div>

            {/* Seletor de ranking */}
            <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-1.5">
              <button
                onClick={() => setBoard("inativos")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  board === "inativos" ? "bg-emerald-600 text-white" : "text-slate-500 dark:text-zinc-400"
                )}
              >
                <UserCheck className="w-4 h-4" /> Menos inativos
              </button>
              <button
                onClick={() => setBoard("visitados")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  board === "visitados" ? "bg-emerald-600 text-white" : "text-slate-500 dark:text-zinc-400"
                )}
              >
                <Footprints className="w-4 h-4" /> Mais visitados
              </button>
            </div>

            {/* Lista */}
            <div className="grid gap-2.5">
              {ranked.map((r, i) => {
                const isMe = r.user_id === myRow.user_id;
                const value = board === "inativos" ? r.pct_inativos : r.pct_visitados;
                const medal =
                  i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "";
                return (
                  <motion.div
                    key={r.user_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.4) }}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-4 py-3",
                      isMe
                        ? "border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200"
                        : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                    )}
                  >
                    <div className="w-8 text-center shrink-0">
                      {i < 3 ? (
                        i === 0 ? (
                          <Crown className={cn("w-5 h-5 mx-auto", medal)} />
                        ) : (
                          <Medal className={cn("w-5 h-5 mx-auto", medal)} />
                        )
                      ) : (
                        <span className="text-sm font-black text-slate-400 dark:text-zinc-500">{i + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-slate-900 dark:text-zinc-100 truncate">
                        {r.apelido} {isMe && <span className="text-[10px] text-amber-600">(você)</span>}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                        {r.total_clients} clientes
                      </div>
                    </div>
                    <div
                      className={cn(
                        "text-lg font-black shrink-0",
                        board === "inativos" ? "text-emerald-600" : "text-emerald-600"
                      )}
                    >
                      {value}%
                    </div>
                  </motion.div>
                );
              })}

              {ranked.length === 0 && (
                <div className="rounded-3xl border border-dashed border-slate-200 dark:border-zinc-800 p-10 text-center text-sm font-bold text-slate-400">
                  Ninguém com clientes no ranking ainda. Seja o primeiro!
                </div>
              )}
            </div>

            <button
              onClick={handleLeave}
              className="self-center flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors mt-2"
            >
              <LogOut className="w-3.5 h-3.5" /> Sair do ranking
            </button>
          </>
        )}
      </div>
    </div>
  );
}
