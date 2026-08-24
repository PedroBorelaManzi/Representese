import React from "react";
import { FileText, ShieldCheck, Scale, AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

export default function TermsOfService() {
  usePageMeta(
    "Termos de Serviço",
    "Leia os termos de uso do Represente-Se!, o CRM para representantes comerciais.",
    "/terms"
  );
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" /> Voltar para o Início
        </Link>
        
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[40px] p-12 sm:p-20 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-12 opacity-5">
            <Scale className="w-40 h-40" />
          </div>

          <h1 className="text-4xl font-black text-slate-900 dark:text-zinc-100 mb-8 uppercase tracking-tighter">Termos de Serviço</h1>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-12">Atualizado em 21 de Abril de 2026</p>

          <div className="space-y-10 text-slate-600 dark:text-zinc-400 leading-relaxed font-medium">
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center text-emerald-600"><FileText className="w-4 h-4" /></div>
                1. Aceitação dos Termos
              </h2>
              <p>Ao acessar e usar o Representese, você concorda em cumprir e estar vinculado a estes Termos de Serviço. Se você não concordar com qualquer parte destes termos, não deve utilizar o serviço.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-600"><ShieldCheck className="w-4 h-4" /></div>
                2. Uso da Conta e Responsabilidades
              </h2>
              <p>Você é responsável por manter a confidencialidade de sua conta e senha, bem como por todas as atividades que ocorrem em sua conta. O Representese fornece ferramentas de CRM e integração de e-mail para uso profissional.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center text-purple-600"><AlertCircle className="w-4 h-4" /></div>
                3. Integrações de Terceiros
              </h2>
              <p>O Representese integra-se com serviços de terceiros, como o Google Gmail. O uso dessas integrações está sujeito aos termos e políticas desses provedores. Você reconhece que o Representese não controla esses serviços externos.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center text-orange-600"><Scale className="w-4 h-4" /></div>
                4. Limitação de Responsabilidade
              </h2>
              <p>O Representese é fornecido "como está". Não garantimos que o serviço será ininterrupto ou livre de erros. Em nenhum caso seremos responsáveis por danos decorrentes do uso ou da incapacidade de usar o serviço.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
