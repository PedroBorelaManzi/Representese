import { Trophy, Construction } from "lucide-react";
import { PageHeader } from "../components/ui";

export default function Ranking() {
  return (
    <div className="h-[calc(100dvh-2rem)] flex flex-col gap-6">
      <PageHeader
        icon={Trophy}
        accent="amber"
        title="Ranking"
        subtitle="Compita com outros representantes"
      />

      <div className="flex-1 flex items-center justify-center">
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 md:p-14 max-w-md mx-auto w-full text-center">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center mx-auto mb-5">
            <Construction className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">
            Página em desenvolvimento
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 leading-relaxed">
            Estamos trabalhando no Ranking. Em breve você vai poder competir com outros representantes por aqui.
          </p>
        </div>
      </div>
    </div>
  );
}
