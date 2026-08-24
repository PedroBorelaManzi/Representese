import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Sparkles, X } from "lucide-react";

const DISMISSED_KEY = "rm_update_nudge_dismissed_version";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.representese.app";

/**
 * Aviso discreto de "nova versão disponível" — sem ele, quem desativou a
 * atualização automática da Play Store (ou está com pouco dado) podia ficar
 * preso numa versão antiga sem saber que existe uma nova. Compara o
 * versionCode do app rodando contra public/app-version.json do site, que o
 * script de release (scripts/release-android.cjs) atualiza sozinho a cada
 * build — não depende de ninguém lembrar de avisar o app na mão.
 */
export function UpdateNudge() {
  const [newVersionName, setNewVersionName] = useState<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        const runningCode = parseInt(info.build, 10);
        if (!runningCode) return;

        const res = await fetch("https://www.representese.com/app-version.json", { cache: "no-store" });
        if (!res.ok) return;
        const remote = await res.json();
        if (typeof remote.versionCode !== "number" || remote.versionCode <= runningCode) return;

        const dismissedFor = localStorage.getItem(DISMISSED_KEY);
        if (dismissedFor === String(remote.versionCode)) return;

        setNewVersionName(remote.versionName || null);
      } catch {
        // Sem verificação de versão o app segue funcionando normalmente —
        // não é crítico o suficiente pra logar erro.
      }
    })();
  }, []);

  if (!newVersionName) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, newVersionName ? String(newVersionName) : "");
    setNewVersionName(null);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[500] p-4 pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
    >
      <div className="mx-auto w-[min(420px,100%)] bg-slate-900 dark:bg-zinc-800 text-white rounded-2xl shadow-2xl px-4 py-3.5 flex items-center gap-3 pointer-events-auto">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-widest">Nova versão disponível</p>
          <p className="text-[11px] text-white/60 font-medium">Atualize para {newVersionName} na Play Store</p>
        </div>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
        >
          Atualizar
        </a>
        <button
          onClick={dismiss}
          aria-label="Dispensar aviso"
          className="shrink-0 p-1.5 text-white/40 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
