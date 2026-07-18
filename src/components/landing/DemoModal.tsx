import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  ArrowRight,
  ArrowUpRight,
  ScanLine,
  CheckCircle2,
  FileText,
  Sparkles,
  Brain,
  MapPin,
  Building2,
  CalendarClock,
  PhoneCall,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

/* ────────────────────────────────────────────────────────────────
   Demonstração animada de ~30s (estilo "stories"), aberta pelo botão
   "Ver demonstração" do hero. Cada cena mostra, de forma concreta,
   uma maneira do app ajudar o representante. Tudo codado (vetorial),
   com a identidade do Represente-se — nítido em qualquer tela, leve
   e fácil de atualizar.
   ──────────────────────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1] as const;

interface Scene {
  id: string;
  duration: number; // ms
  eyebrow: string;
  title: string;
  subtitle: string;
  Visual: React.ComponentType;
}

/* ── Cena 1 · Painel unificado ─────────────────────────────────── */
const kpis = [
  { label: "Faturamento", value: "R$ 143.600", trend: "+18%" },
  { label: "Pedidos", value: "91", trend: "+12%" },
  { label: "Clientes ativos", value: "248", trend: "+6%" },
];
const reps = [
  { name: "Tintas Aurora", value: "R$ 48.200", pct: 80, color: "#10b981" },
  { name: "AgroMax Insumos", value: "R$ 71.500", pct: 95, color: "#0ea5e9" },
  { name: "Farma Distribuidora", value: "R$ 23.900", pct: 60, color: "#8b5cf6" },
];

const SceneDashboard = React.memo(function SceneDashboard() {
  return (
    <div className="w-full max-w-xl mx-auto space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.1 + i * 0.12, ease: EASE }}
            className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3.5"
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-none mb-2 truncate">
              {k.label}
            </p>
            <p className="text-[18px] sm:text-[20px] font-black text-slate-900 leading-none">{k.value}</p>
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-emerald-600">
              <ArrowUpRight className="w-3.5 h-3.5" /> {k.trend}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5, ease: EASE }}
        className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4"
      >
        <div className="flex items-center justify-between mb-3.5">
          <p className="text-[13px] font-black text-slate-900">Faturamento por representada</p>
          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">junho</span>
        </div>
        <div className="space-y-3">
          {reps.map((r, i) => (
            <div key={r.name}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                  <span className="text-[12px] font-bold text-slate-700">{r.name}</span>
                </div>
                <span className="text-[12px] font-black text-slate-900">{r.value}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: r.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${r.pct}%` }}
                  transition={{ duration: 0.9, delay: 0.7 + i * 0.15, ease: EASE }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
});

/* ── Cena 2 · Pedido lançado pela IA (foto/PDF → campos) ───────── */
const extracted = [
  { label: "Cliente", value: "Comercial Vale Verde" },
  { label: "Empresa", value: "Tintas Aurora" },
  { label: "Valor do pedido", value: "R$ 12.400,00" },
];

const SceneOrderAI = React.memo(function SceneOrderAI() {
  return (
    <div className="w-full max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-3">
      {/* documento com scanner */}
      <motion.div
        initial={{ opacity: 0, x: -18, rotate: -3 }}
        animate={{ opacity: 1, x: 0, rotate: -2 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative mx-auto w-[150px] rounded-xl bg-white border border-slate-200 shadow-lg overflow-hidden"
      >
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100">
          <FileText className="w-3.5 h-3.5 text-rose-500" />
          <span className="text-[9px] font-black text-slate-500 truncate">pedido-aurora.pdf</span>
        </div>
        <div className="p-3 space-y-1.5">
          {[90, 70, 80, 55, 75, 40].map((w, i) => (
            <div key={i} className="h-1.5 rounded-full bg-slate-200" style={{ width: `${w}%` }} />
          ))}
          <div className="h-6" />
          <div className="h-1.5 rounded-full bg-emerald-200 w-[60%]" />
        </div>
        {/* linha de scanner */}
        <motion.div
          initial={{ top: "0%" }}
          animate={{ top: ["0%", "100%", "0%"] }}
          transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }}
          className="absolute left-0 right-0 h-8 bg-gradient-to-b from-emerald-400/0 via-emerald-400/30 to-emerald-400/0"
        >
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
        </motion.div>
      </motion.div>

      {/* seta / IA */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.5, ease: EASE }}
        className="flex flex-col items-center justify-center gap-1.5 text-emerald-600"
      >
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-[10px] font-black uppercase tracking-wide">
          <ScanLine className="w-3.5 h-3.5" /> IA lê
        </span>
        <ArrowRight className="w-5 h-5 rotate-90 sm:rotate-0" />
      </motion.div>

      {/* campos extraídos */}
      <motion.div
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
        className="rounded-2xl bg-white border border-slate-100 shadow-lg p-4 space-y-2.5"
      >
        {extracted.map((f, i) => (
          <motion.div
            key={f.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.9 + i * 0.35, ease: EASE }}
          >
            <p className="text-[9px] font-black uppercase tracking-wide text-slate-400 leading-none mb-1">{f.label}</p>
            <p className="text-[13px] font-black text-slate-900 leading-tight">{f.value}</p>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 2.1, ease: EASE }}
          className="flex items-center gap-1.5 pt-1 text-emerald-600"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-[11px] font-black">Pedido lançado — sem digitar nada</span>
        </motion.div>
      </motion.div>
    </div>
  );
});

/* ── Cena 3 · CRM com resumo da IA ─────────────────────────────── */
const crmRows = [
  { initials: "CV", name: "Comercial Vale Verde", city: "São Paulo · SP", value: "R$ 12.4k", highlight: true },
  { initials: "DH", name: "Distribuidora Horizonte", city: "Curitiba · PR", value: "R$ 9.1k" },
  { initials: "AP", name: "Atacado Primavera", city: "Campinas · SP", value: "R$ 5.8k" },
];

const SceneCRM = React.memo(function SceneCRM() {
  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-50">
          {["Todos", "Ativos", "Por empresa"].map((f, i) => (
            <span
              key={f}
              className={cn(
                "px-3 py-1 rounded-full text-[11px] font-bold",
                i === 0 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
              )}
            >
              {f}
            </span>
          ))}
        </div>
        <div className="divide-y divide-slate-50">
          {crmRows.map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.14, ease: EASE }}
              className={cn("flex items-center gap-3 px-4 py-3", c.highlight && "bg-emerald-50/40")}
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[12px] font-black shrink-0">
                {c.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black text-slate-900 truncate leading-tight">{c.name}</p>
                <p className="text-[11px] font-medium text-slate-400 truncate">{c.city}</p>
              </div>
              {c.highlight && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black shrink-0">
                  <Sparkles className="w-3 h-3" /> Resumo IA
                </span>
              )}
              <span className="text-[12px] font-black text-slate-700 shrink-0">{c.value}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* popover do resumo da IA */}
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.9, ease: EASE }}
        className="mt-3 rounded-2xl bg-slate-900 text-white p-4 shadow-xl"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Brain className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] font-black uppercase tracking-wide text-emerald-400">Resumo inteligente</span>
        </div>
        <p className="text-[12px] font-semibold text-slate-200 leading-relaxed">
          Compra a cada ~30 dias. Última há 34 dias — hora de reativar. Ticket médio subindo 12%.
        </p>
      </motion.div>
    </div>
  );
});

/* ── Cena 4 · Agenda + follow-up ───────────────────────────────── */
const agenda = [
  { t: "09:00", l: "Reunião · Tintas Aurora", c: "bg-emerald-500" },
  { t: "11:30", l: "Visita · Comercial Vale Verde", c: "bg-sky-400" },
  { t: "14:00", l: "Demonstração · AgroMax", c: "bg-violet-400" },
];

const SceneAgenda = React.memo(function SceneAgenda() {
  return (
    <div className="w-full max-w-xl mx-auto space-y-3">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-4 h-4 text-emerald-600" />
          <p className="text-[13px] font-black text-slate-900">Agenda de hoje</p>
        </div>
        <div className="space-y-3">
          {agenda.map((e, i) => (
            <motion.div
              key={e.t}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.15, ease: EASE }}
              className="flex items-center gap-3"
            >
              <span className="text-[11px] font-black text-slate-400 w-10 shrink-0">{e.t}</span>
              <span className={cn("w-2 h-2 rounded-full shrink-0", e.c)} />
              <span className="text-[12px] font-semibold text-slate-700 truncate">{e.l}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.8, ease: EASE }}
        className="rounded-2xl bg-white border border-emerald-100 shadow-sm p-4"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <PhoneCall className="w-4 h-4 text-emerald-600" />
          <span className="text-[10px] font-black uppercase tracking-wide text-emerald-600">Lembrete de follow-up</span>
        </div>
        <p className="text-[12px] font-semibold text-slate-600 leading-relaxed">
          3 clientes da <span className="font-black text-slate-800">AgroMax</span> estão há 30+ dias sem contato.
          Que tal ligar hoje?
        </p>
      </motion.div>
    </div>
  );
});

/* ── Cena 5 · Mapa + rota ──────────────────────────────────────── */
const pins = [
  { x: 60, y: 70 },
  { x: 150, y: 120 },
  { x: 250, y: 80 },
  { x: 320, y: 150 },
];

const SceneMap = React.memo(function SceneMap() {
  return (
    <div className="w-full max-w-xl mx-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative rounded-2xl bg-slate-50 border border-slate-100 shadow-sm overflow-hidden"
        style={{ aspectRatio: "16 / 9" }}
      >
        <svg viewBox="0 0 400 225" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
          {/* malha de ruas */}
          {[40, 90, 140, 190].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="400" y2={y} stroke="#e2e8f0" strokeWidth="2" />
          ))}
          {[70, 150, 230, 310].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="225" stroke="#e2e8f0" strokeWidth="2" />
          ))}
          {/* rota que se desenha */}
          <motion.path
            d="M60 70 L150 120 L250 80 L320 150"
            fill="none"
            stroke="#10b981"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="8 6"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2, delay: 0.6, ease: EASE }}
          />
          {pins.map((p, i) => (
            <motion.g
              key={i}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.25, ease: EASE }}
            >
              <circle cx={p.x} cy={p.y} r="9" fill="#10b981" />
              <circle cx={p.x} cy={p.y} r="3.5" fill="#fff" />
            </motion.g>
          ))}
        </svg>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.4, ease: EASE }}
          className="absolute left-3 bottom-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 backdrop-blur border border-slate-100 shadow-lg"
        >
          <MapPin className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black text-slate-800">4 visitas · rota otimizada</span>
        </motion.div>
      </motion.div>
    </div>
  );
});

/* ── Cena 6 · Fecho + CTA ──────────────────────────────────────── */
const SceneClosing = React.memo(function SceneClosing() {
  return (
    <div className="w-full max-w-lg mx-auto text-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="inline-flex items-center gap-2 mb-5"
      >
        <Building2 className="w-7 h-7 text-emerald-600" />
        <span className="text-[26px] font-black tracking-tighter text-slate-900 uppercase leading-none">
          Represente<span className="text-emerald-600">-se</span>
        </span>
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
        className="text-[17px] sm:text-[19px] font-black text-slate-800 leading-snug mb-6"
      >
        Comande todas as suas representadas em um só lugar.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45, ease: EASE }}
      >
        <Link
          to="/register"
          className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition-all shadow-xl shadow-emerald-600/25"
        >
          Criar minha conta grátis
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-4">
          7 dias de garantia · Sem fidelidade
        </p>
      </motion.div>
    </div>
  );
});

const SCENES: Scene[] = [
  {
    id: "painel",
    duration: 5200,
    eyebrow: "Painel unificado",
    title: "Todas as suas representadas num só painel",
    subtitle: "Faturamento, pedidos e metas separados por empresa — sem planilha.",
    Visual: SceneDashboard,
  },
  {
    id: "pedido-ia",
    duration: 5600,
    eyebrow: "Pedidos com IA",
    title: "Fotografou o pedido? A IA preenche pra você",
    subtitle: "Tire uma foto ou anexe o PDF — cliente, empresa e valor entram sozinhos.",
    Visual: SceneOrderAI,
  },
  {
    id: "crm",
    duration: 5000,
    eyebrow: "CRM inteligente",
    title: "Clientes organizados, com resumo da IA",
    subtitle: "Saiba quem reativar e o momento certo de cada contato.",
    Visual: SceneCRM,
  },
  {
    id: "agenda",
    duration: 4800,
    eyebrow: "Agenda & follow-up",
    title: "Nunca mais perca um follow-up",
    subtitle: "Sua agenda do dia e lembretes automáticos de quem cobrar.",
    Visual: SceneAgenda,
  },
  {
    id: "mapa",
    duration: 4800,
    eyebrow: "Mapa de clientes",
    title: "Planeje a rota e visite mais clientes",
    subtitle: "Veja seus clientes no mapa e monte o roteiro do dia.",
    Visual: SceneMap,
  },
  {
    id: "fecho",
    duration: 5000,
    eyebrow: "",
    title: "",
    subtitle: "",
    Visual: SceneClosing,
  },
];

const TOTAL_MS = SCENES.reduce((a, s) => a + s.duration, 0);

export function DemoModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const rafRef = useRef<number | undefined>(undefined);
  const lastTsRef = useRef<number | undefined>(undefined);

  // reinicia sempre que abre
  useEffect(() => {
    if (isOpen) {
      setElapsed(0);
      setPlaying(true);
    }
  }, [isOpen]);

  // relógio mestre (rAF) — só corre enquanto tocando
  useEffect(() => {
    if (!isOpen || !playing) return;
    lastTsRef.current = undefined;
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setElapsed((e) => Math.min(TOTAL_MS, e + dt));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isOpen, playing]);

  // pausa ao chegar no fim
  useEffect(() => {
    if (elapsed >= TOTAL_MS) setPlaying(false);
  }, [elapsed]);

  // Esc fecha
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose]);

  const finished = elapsed >= TOTAL_MS;

  const togglePlay = useCallback(() => {
    if (finished) {
      setElapsed(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [finished]);

  const goToScene = useCallback((index: number) => {
    let acc = 0;
    for (let i = 0; i < index; i++) acc += SCENES[i].duration;
    setElapsed(acc);
    setPlaying(true);
  }, []);

  // cena atual + progresso interno
  let acc = 0;
  let sceneIndex = 0;
  for (let i = 0; i < SCENES.length; i++) {
    if (elapsed < acc + SCENES[i].duration || i === SCENES.length - 1) {
      sceneIndex = i;
      break;
    }
    acc += SCENES[i].duration;
  }
  const scene = SCENES[sceneIndex];
  const sceneStart = acc;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="relative z-10 w-full max-w-3xl bg-gradient-to-b from-white to-slate-50 rounded-3xl border border-white/20 shadow-2xl overflow-hidden flex flex-col"
        >
          {/* barra de progresso segmentada (estilo stories) */}
          <div className="flex items-center gap-1.5 px-4 sm:px-5 pt-4">
            {SCENES.map((s, i) => {
              const fill =
                i < sceneIndex ? 1 : i > sceneIndex ? 0 : Math.min(1, (elapsed - sceneStart) / s.duration);
              return (
                <button
                  key={s.id}
                  onClick={() => goToScene(i)}
                  className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden cursor-pointer"
                  aria-label={`Ir para a cena ${i + 1}`}
                >
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${fill * 100}%` }} />
                </button>
              );
            })}
          </div>

          {/* topo: rótulo + fechar */}
          <div className="flex items-center justify-between px-4 sm:px-5 pt-3 pb-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Demonstração
            </span>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Fechar demonstração"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* palco */}
          <div className="relative px-4 sm:px-8 min-h-[300px] sm:min-h-[340px] flex items-center justify-center py-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={scene.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="w-full"
              >
                <scene.Visual />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* legenda + controles */}
          <div className="px-4 sm:px-8 pb-5 pt-2 border-t border-slate-100 bg-white/60">
            <div className="flex items-end justify-between gap-4">
              <div className="min-h-[56px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={scene.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE }}
                  >
                    {scene.eyebrow && (
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">
                        {scene.eyebrow}
                      </p>
                    )}
                    {scene.title && (
                      <p className="text-[15px] sm:text-[17px] font-black text-slate-900 leading-tight">
                        {scene.title}
                      </p>
                    )}
                    {scene.subtitle && (
                      <p className="text-[12px] sm:text-[13px] font-medium text-slate-500 leading-snug mt-0.5">
                        {scene.subtitle}
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <button
                onClick={togglePlay}
                className="shrink-0 w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/25 transition-colors"
                aria-label={finished ? "Repetir" : playing ? "Pausar" : "Reproduzir"}
              >
                {finished ? (
                  <RotateCcw className="w-5 h-5" />
                ) : playing ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 fill-current translate-x-0.5" />
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
