import { useState } from "react";
import { Plus, Trash2, Sun, Moon, Check, X, ChevronRight, ChevronLeft, Wallet, Percent } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettings } from "../contexts/SettingsContext";
import { toast } from "sonner";

const TOTAL_STEPS = 4;

export default function OnboardingModal() {
  const [editingDaysField, setEditingDaysField] = useState<'alerta' | 'critico' | 'inativo' | null>(null);
  const [editingDaysValue, setEditingDaysValue] = useState('');
  const renderOnboardingDaysConfig = (field: 'alerta' | 'critico' | 'inativo', label: string, currentVal: number, colorClass: string) => {
    const isEditing = editingDaysField === field;

    const handleSave = () => {
      const val = parseInt(editingDaysValue, 10);
      if (isNaN(val) || val <= 0) {
        toast.error("Insira um número de dias válido.");
        return;
      }

      if (field === 'alerta') {
        setAlerta(val);
        if (critico <= val) setCritico(val + 5);
        if (inativo <= (critico <= val ? val + 5 : critico)) setInativo((critico <= val ? val + 5 : critico) + 5);
      } else if (field === 'critico') {
        if (val <= alerta) {
          toast.error("Crítico deve ser maior que Alerta.");
          return;
        }
        setCritico(val);
        if (inativo <= val) setInativo(val + 5);
      } else if (field === 'inativo') {
        if (val <= critico) {
          toast.error("Inativo deve ser maior que Crítico.");
          return;
        }
        setInativo(val);
      }
      setEditingDaysField(null);
    };

    if (isEditing) {
      return (
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-950 border border-slate-150 dark:border-zinc-850 rounded-2xl p-3 justify-between w-full">
          <span className={`text-xs font-bold uppercase ${colorClass}`}>{label}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={editingDaysValue}
              onChange={(e) => setEditingDaysValue(e.target.value)}
              className="w-16 px-2 py-1 text-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setEditingDaysField(null);
              }}
            />
            <button type="button" onClick={handleSave} className="p-1.5 bg-emerald-600 text-white rounded-lg">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setEditingDaysField(null)} className="p-1.5 bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-405 rounded-lg">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => {
          setEditingDaysField(field);
          setEditingDaysValue(currentVal.toString());
        }}
        className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 hover:border-emerald-500/30 transition-all text-left"
      >
        <span className={`text-xs font-bold uppercase ${colorClass}`}>{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700 dark:text-zinc-350">{currentVal} dias</span>
          <span className="text-[10px] font-black uppercase tracking-wider bg-white dark:bg-zinc-900 text-slate-400 dark:text-zinc-500 px-2 py-1 rounded-xl border border-slate-150 dark:border-zinc-800">Ajustar</span>
        </div>
      </button>
    );
  };

  const { settings, loading, updateSettings } = useSettings();
  const [step, setStep] = useState(1);

  // Step 1: Categories (empresas representadas)
  const [categories, setCategories] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");

  const addCategory = () => {
    if (newCat.trim() && !categories.includes(newCat.trim())) {
      setCategories([...categories, newCat.trim()]);
      setNewCat("");
    }
  };

  // Step 2: Comissões por empresa (%)
  const [commissions, setCommissions] = useState<Record<string, number>>({});
  const setCommission = (cat: string, value: string) => {
    const num = value === "" ? 0 : Math.max(0, Math.min(100, Number(value)));
    setCommissions((prev) => ({ ...prev, [cat]: isNaN(num) ? 0 : num }));
  };

  // Step 3: Alertas de inatividade
  const [alerta, setAlerta] = useState(15);
  const [critico, setCritico] = useState(30);
  const [inativo, setInativo] = useState(90);

  // Step 4: Tema
  const [theme, setTheme] = useState<'light' | 'dark'>(settings.theme || 'light');

  const handleFinish = async () => {
    await updateSettings({
      categories,
      commissions,
      alerta_days: alerta,
      critico_days: critico,
      inativo_days: inativo,
      theme,
      has_completed_onboarding: true,
    });
    toast.success("Tudo configurado! Bem-vindo ao Represente-Se.");
  };

  // Só aparece no primeiro login: usuário sem onboarding concluído e sem empresas cadastradas ainda.
  if (loading || settings.has_completed_onboarding || (settings.categories && settings.categories.length > 0)) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-8 w-full max-w-lg space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        {/* Progress Bar */}
        <div>
          <div className="flex gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${step >= i + 1 ? "bg-emerald-600" : "bg-slate-100 dark:bg-zinc-800"}`} />
            ))}
          </div>
          <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mt-2">
            Passo {step} de {TOTAL_STEPS} · Vamos configurar sua conta
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-zinc-50 uppercase tracking-tight">Configure suas empresas</h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Adicione as empresas que você representa hoje.</p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  placeholder="Ex: Nestlé, Coca-Cola..."
                  className="flex-1 px-4 py-3 border border-slate-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm bg-white dark:bg-zinc-950 dark:text-zinc-100"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                  autoFocus
                />
                <button
                  onClick={addCategory}
                  disabled={!newCat.trim()}
                  className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {categories.map((cat, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-between items-center p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl"
                  >
                    <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">{cat}</span>
                    <button onClick={() => setCategories(categories.filter((_, i) => i !== index))} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </motion.div>
                ))}
                {categories.length === 0 && (
                  <p className="text-center text-xs text-slate-400 dark:text-zinc-500 py-4">Me dê o nome de todas as empresas que você representa hoje.</p>
                )}
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={categories.length === 0}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm tracking-wide disabled:opacity-50 flex items-center justify-center gap-1 mt-4"
              >
                Próximo Passo <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-zinc-50 uppercase tracking-tight flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-600" /> Suas comissões
                </h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                  Qual o percentual de comissão em cada empresa? Deixe 0% se preferir configurar depois.
                </p>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {categories.map((cat) => (
                  <div key={cat} className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl">
                    <span className="text-sm font-bold text-slate-800 dark:text-zinc-200 truncate">{cat}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={commissions[cat] ?? ""}
                        onChange={(e) => setCommission(cat, e.target.value)}
                        placeholder="0"
                        className="w-16 px-2 py-1.5 text-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <Percent className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-4">
                <button onClick={() => setStep(1)} className="flex-1 py-3 bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><ChevronLeft className="w-4 h-4" /> Voltar</button>
                <button onClick={() => setStep(3)} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1">Próximo <ChevronRight className="w-4 h-4" /></button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-zinc-50 uppercase tracking-tight">Alertas de Inatividade</h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Como você deseja acompanhar os alertas de clientes sem compra?</p>
              </div>

              <div className="space-y-3">
                {renderOnboardingDaysConfig('alerta', 'Dias para Alerta (Frio)', alerta, 'text-amber-600')}
                {renderOnboardingDaysConfig('critico', 'Dias para Crítico (Quente)', critico, 'text-orange-655')}
                {renderOnboardingDaysConfig('inativo', 'Dias para Inativo', inativo, 'text-red-500')}
              </div>

              <div className="flex gap-3 mt-4">
                <button onClick={() => setStep(2)} className="flex-1 py-3 bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><ChevronLeft className="w-4 h-4" /> Voltar</button>
                <button onClick={() => setStep(4)} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1">Próximo <ChevronRight className="w-4 h-4" /></button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-zinc-50 uppercase tracking-tight">Estilo Visual</h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Escolha o tema que prefere usar no dia a dia.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setTheme('light')}
                  className={`p-5 rounded-2xl border flex flex-col items-center gap-3 transition-all ${theme === 'light' ? "border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"}`}
                >
                  <Sun className={`w-8 h-8 ${theme === 'light' ? "text-emerald-600" : "text-slate-400"}`} />
                  <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">Tema Claro</span>
                </button>

                <button
                  onClick={() => setTheme('dark')}
                  className={`p-5 rounded-2xl border flex flex-col items-center gap-3 transition-all ${theme === 'dark' ? "border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"}`}
                >
                  <Moon className={`w-8 h-8 ${theme === 'dark' ? "text-emerald-600" : "text-slate-400"}`} />
                  <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">Tema Escuro</span>
                </button>
              </div>

              <div className="flex gap-3 mt-4">
                <button onClick={() => setStep(3)} className="flex-1 py-3 bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><ChevronLeft className="w-4 h-4" /> Voltar</button>
                <button onClick={handleFinish} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1"><Check className="w-4 h-4" /> Finalizar</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
