/* Primitivos de animação/apresentação compartilhados pelas seções da landing. */
import React, { useState, useRef, useEffect } from "react";
import { motion, useInView, useMotionValue, animate } from "framer-motion";
import { cn } from "../../lib/utils";

export function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* eyebrow/kicker padronizado — dá identidade de "capítulo" a cada seção */
export function Kicker({
  num,
  label,
  dark = false,
  center = false,
  tone = "emerald",
}: {
  num?: string;
  label: string;
  dark?: boolean;
  center?: boolean;
  tone?: "emerald" | "rose";
}) {
  const text = dark
    ? "text-emerald-400"
    : tone === "rose"
      ? "text-rose-500"
      : "text-emerald-600";
  const line = dark ? "bg-emerald-400/30" : tone === "rose" ? "bg-rose-400/40" : "bg-emerald-500/30";
  const numC = dark ? "text-emerald-400/60" : tone === "rose" ? "text-rose-400/70" : "text-emerald-500/60";
  return (
    <div className={cn("inline-flex items-center gap-2.5 mb-4", center && "justify-center")}>
      {num && <span className={cn("text-[12px] font-black tabular-nums", numC)}>{num}</span>}
      {num && <span className={cn("h-px w-7", line)} />}
      <span className={cn("text-[11px] font-black uppercase tracking-widest", text)}>{label}</span>
    </div>
  );
}

/* destaca o item de menu da seção que o usuário está vendo.
   abordagem por posição de scroll = determinística (sem flicker em saltos) */
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string>("");
  useEffect(() => {
    const onScroll = () => {
      const line = window.innerHeight * 0.35;
      let current = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids]);
  return active;
}

/* contador animado que dispara ao entrar na viewport */
export function Counter({
  to,
  prefix = "",
  suffix = "",
  sep = false,
  duration = 2,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  sep?: boolean;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(`${prefix}0${suffix}`);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        const n = Math.round(v);
        const num = sep ? n.toLocaleString("pt-BR") : String(n);
        setDisplay(`${prefix}${num}${suffix}`);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, to]);

  return <span ref={ref}>{display}</span>;
}

/* card com brilho que segue o cursor */
export function SpotlightCard({
  children,
  className = "",
  glow = "rgba(16,185,129,0.12)",
}: {
  children: React.ReactNode;
  className?: string;
  glow?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={cn("relative overflow-hidden", className)}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(450px circle at ${pos.x}px ${pos.y}px, ${glow}, transparent 45%)`,
        }}
      />
      {children}
    </div>
  );
}
