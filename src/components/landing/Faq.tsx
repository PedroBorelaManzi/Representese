/* Capítulo 05 · Dúvidas (accordion). */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { FadeUp, Kicker } from "./primitives";
import { faqs } from "./data";

export function FaqSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <section id="duvidas" className="py-24 px-6 bg-slate-50 border-y border-slate-100 scroll-mt-28">
      <div className="max-w-3xl mx-auto">
        <FadeUp className="text-center mb-12">
          <Kicker num="05" label="Perguntas frequentes" center />
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
            Ainda em dúvida?
          </h2>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">
            Respostas rápidas para o que mais perguntam antes de assinar.
          </p>
        </FadeUp>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <FadeUp key={idx} delay={idx * 0.04}>
              <div
                className={cn(
                  "rounded-2xl border transition-all duration-200 overflow-hidden",
                  openFaq === idx ? "border-emerald-200 bg-white shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-7 py-5 flex items-center justify-between text-left"
                >
                  <span className={cn("text-[14px] font-bold transition-colors", openFaq === idx ? "text-emerald-700" : "text-slate-900")}>
                    {faq.question}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 flex-shrink-0 ml-4 transition-transform text-slate-400", openFaq === idx && "rotate-180 text-emerald-600")} />
                </button>
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <p className="px-7 pb-6 text-[13px] text-slate-600 font-medium leading-relaxed border-t border-emerald-100 pt-4">
                        {faq.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
