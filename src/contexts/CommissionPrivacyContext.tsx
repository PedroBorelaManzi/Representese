import React, { createContext, useContext, useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "./SettingsContext";
import { useAuth } from "./AuthContext";
import { verifyCommissionPassword } from "../lib/commissionPrivacy";

interface CommissionPrivacyContextType {
  /** true quando comissão deve aparecer borrada (config ligada e ainda não revelada nesta sessão). */
  isHidden: boolean;
  /** Abre o prompt de senha pra revelar — chamado ao clicar num valor borrado. */
  requestReveal: () => void;
}

const CommissionPrivacyContext = createContext<CommissionPrivacyContextType | undefined>(undefined);

export const useCommissionPrivacy = () => {
  const ctx = useContext(CommissionPrivacyContext);
  if (!ctx) throw new Error("useCommissionPrivacy must be used within a CommissionPrivacyProvider");
  return ctx;
};

/** Uma senha certa revela a comissão pro resto desta sessão do app (até
 *  fechar/recarregar) — pedir senha de novo a cada valor seria fricção
 *  demais pra uma proteção que é só visual, não autenticação de sistema. */
export function CommissionPrivacyProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const [revealed, setRevealed] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);

  const isHidden = !!settings.hide_commissions && !revealed;

  const requestReveal = () => {
    if (!isHidden) return;
    setPassword("");
    setPromptOpen(true);
  };

  const handleConfirm = async () => {
    if (!user || !settings.commission_password_hash) return;
    setChecking(true);
    try {
      const ok = await verifyCommissionPassword(password, user.id, settings.commission_password_hash);
      if (!ok) {
        toast.error("Senha incorreta.");
        return;
      }
      setRevealed(true);
      setPromptOpen(false);
    } finally {
      setChecking(false);
    }
  };

  return (
    <CommissionPrivacyContext.Provider value={{ isHidden, requestReveal }}>
      {children}

      <AnimatePresence>
        {promptOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPromptOpen(false)} className="absolute inset-0 bg-slate-900/70 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative z-10 w-full max-w-xs bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl border border-slate-200 dark:border-zinc-800 p-6 text-center">
              <button onClick={() => setPromptOpen(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-400">
                <X className="w-4 h-4" />
              </button>
              <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight mb-1">Ver comissão</h3>
              <p className="text-[10px] font-bold text-slate-400 mb-4">Digite a senha pra revelar os valores</p>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
                placeholder="Senha"
                className="w-full text-center bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
              />
              <button
                onClick={handleConfirm}
                disabled={checking || !password}
                className="w-full py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                {checking ? "Verificando..." : "Revelar"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </CommissionPrivacyContext.Provider>
  );
}
