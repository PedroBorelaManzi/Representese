import React from "react";
import { Trash2, Mail, Clock, Database, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const CONTATO = "contato@representese.com";

export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" /> Voltar para o Início
        </Link>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[40px] p-12 sm:p-20 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-12 opacity-5">
            <Trash2 className="w-40 h-40" />
          </div>

          <h1 className="text-4xl font-black text-slate-900 dark:text-zinc-100 mb-4 uppercase tracking-tighter">Exclusão de Conta e Dados</h1>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-12">Represente-Se! — Atualizado em 13 de Agosto de 2026</p>

          <div className="space-y-10 text-slate-600 dark:text-zinc-400 leading-relaxed font-medium">
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center text-emerald-600"><Mail className="w-4 h-4" /></div>
                Como solicitar
              </h2>
              <p>
                Para excluir sua conta ou seus dados do Represente-Se!, envie um e-mail para{" "}
                <a href={`mailto:${CONTATO}`} className="text-emerald-600 underline">{CONTATO}</a>{" "}
                a partir do mesmo endereço cadastrado na sua conta, com o assunto <strong>"Solicitação de exclusão"</strong>, informando se você quer:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Excluir a conta inteira</strong> — login, assinatura e todos os dados associados deixam de existir.</li>
                <li><strong>Excluir só os dados</strong>, mantendo a conta ativa para uso futuro.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-600"><Database className="w-4 h-4" /></div>
                O que é excluído
              </h2>
              <p>A solicitação remove permanentemente:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Dados de login (e-mail, senha) e da assinatura;</li>
                <li>Clientes cadastrados (nome, CNPJ, endereço, telefone, e-mail, localização no mapa);</li>
                <li>Pedidos, comissões e histórico de faturamento;</li>
                <li>Compromissos da agenda e conexões com Google Agenda/Gmail, se conectadas;</li>
                <li>Arquivos enviados (catálogos, planilhas, comprovantes) e histórico de conversas com a IA.</li>
              </ul>
              <p>Alguns registros financeiros podem ser mantidos por período adicional quando a lei exigir (ex.: obrigações fiscais), sempre informado na resposta ao pedido.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center text-orange-600"><Clock className="w-4 h-4" /></div>
                Prazo
              </h2>
              <p>Confirmamos o recebimento do pedido em até 5 dias úteis e concluímos a exclusão em até 30 dias, com aviso por e-mail assim que finalizada.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
