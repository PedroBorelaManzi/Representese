/* Capítulo 03 · Setores atendidos (hover troca o fundo pela foto do setor). */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";
import { FadeUp, Kicker } from "./primitives";
import { industries } from "./data";

export function SetoresSection() {
  const [hoveredIndustry, setHoveredIndustry] = useState<number | null>(null);

  return (
    <section id="industrias" className="min-h-[80vh] py-20 bg-white border-b border-slate-100 relative overflow-hidden flex items-center transition-all duration-700 scroll-mt-28">
      <AnimatePresence>
        {hoveredIndustry !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 z-0"
          >
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] z-10" />
            <motion.img
              key={industries[hoveredIndustry].image}
              initial={{ scale: 1.08 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              src={industries[hoveredIndustry].image}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: (industries[hoveredIndustry] as { objectPosition?: string }).objectPosition ?? "center" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-6 relative z-20 w-full">
        <div className="text-center mb-14">
          <FadeUp>
            <div className="flex justify-center">
              <Kicker num="03" label="Setores atendidos" dark={hoveredIndustry !== null} />
            </div>
            <h2 className={cn("text-3xl sm:text-5xl md:text-7xl font-black tracking-tight mb-3 transition-colors duration-500", hoveredIndustry !== null ? "text-white" : "text-slate-900")}>
              Feito para o seu mercado.
            </h2>
            <p className={cn("font-medium transition-colors duration-500", hoveredIndustry !== null ? "text-white/60" : "text-slate-500")}>
              Interface customizada por setor de atuação
            </p>
          </FadeUp>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {industries.map((item, idx) => (
            <motion.button
              key={idx}
              onMouseEnter={() => setHoveredIndustry(idx)}
              onMouseLeave={() => setHoveredIndustry(null)}
              whileHover={{ y: -10, scale: 1.12 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "p-5 md:p-8 rounded-[28px] border-2 flex flex-col items-center gap-3 transition-all duration-400 shadow-md",
                hoveredIndustry === null
                  ? "bg-white border-slate-100 hover:shadow-xl hover:border-emerald-200"
                  : hoveredIndustry === idx
                    ? "bg-white border-white scale-110 z-30 shadow-2xl"
                    : "bg-white/5 border-white/10 opacity-25 blur-[1px] scale-95 grayscale"
              )}
            >
              <div className={cn(
                "p-4 rounded-2xl transition-all",
                hoveredIndustry === idx ? "bg-emerald-100" : "bg-emerald-50"
              )}>
                <item.icon className={cn("w-6 h-6", hoveredIndustry === idx ? "text-emerald-700" : "text-emerald-600")} />
              </div>
              <span className={cn(
                "text-[10px] font-black uppercase tracking-tight text-center leading-tight transition-colors duration-400",
                hoveredIndustry !== null && hoveredIndustry !== idx ? "text-transparent" : "text-slate-900"
              )}>
                {item.name}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
