import React from "react";
import { ShieldCheck, Lock, Eye, Scale, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" /> Voltar para o Início
        </Link>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[40px] p-12 sm:p-20 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-12 opacity-5">
            <ShieldCheck className="w-40 h-40" />
          </div>

          <h1 className="text-4xl font-black text-slate-900 dark:text-zinc-100 mb-8 uppercase tracking-tighter">Política de Privacidade</h1>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-12">Atualizada em 14 de Julho de 2026</p>

          <div className="space-y-10 text-slate-600 dark:text-zinc-400 leading-relaxed font-medium">
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center text-emerald-600"><Lock className="w-4 h-4" /></div>
                1. Coleta de Dados
              </h2>
              <p>Coletamos informações necessárias para a prestação de nossos serviços de CRM, incluindo nome, e-mail, telefone e dados de integração com serviços de e-mail. Estes dados são utilizados exclusivamente para o funcionamento da plataforma.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-600"><Eye className="w-4 h-4" /></div>
                2. Uso das Informações
              </h2>
              <p>Suas informações são utilizadas para personalizar sua experiência, processar transações e fornecer suporte técnico. Não vendemos ou compartilhamos seus dados pessoais com terceiros para fins de marketing.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center text-emerald-600"><Lock className="w-4 h-4" /></div>
                3. Integração com sua Conta Google (Gmail e Agenda)
              </h2>
              <p>
                Se você optar por conectar sua conta Google, o Represente-Se! solicita acesso às seguintes permissões,
                usadas exclusivamente para as funcionalidades abaixo — nunca para qualquer outro fim:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Ler e-mails (gmail.readonly):</strong> exibir suas mensagens e anexos dentro do cliente de e-mail integrado à plataforma.</li>
                <li><strong>Enviar e-mails (gmail.send):</strong> enviar mensagens em seu nome quando você mesmo clica em "Enviar" no cliente de e-mail.</li>
                <li><strong>Agenda (calendar.events):</strong> criar, editar e sincronizar seus compromissos entre o Represente-Se! e o Google Agenda.</li>
                <li><strong>Contatos (contacts.readonly):</strong> sugerir contatos já existentes no seu Google ao cadastrar clientes.</li>
              </ul>
              <p>
                Não lemos, modificamos nem excluímos e-mails sem uma ação explícita sua. Os dados obtidos via APIs do Google
                nunca são usados para treinar modelos de inteligência artificial, nem compartilhados com terceiros, nem
                usados para publicidade. Você pode revogar esse acesso a qualquer momento em{' '}
                <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline">
                  myaccount.google.com/permissions
                </a>{' '}
                ou diretamente nas configurações do Represente-Se!. O uso desses dados segue também a{' '}
                <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline">
                  Política de Dados do Usuário dos Serviços de API do Google
                </a>, incluindo os requisitos de Uso Limitado.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center text-purple-600"><ShieldCheck className="w-4 h-4" /></div>
                4. Segurança dos Dados
              </h2>
              <p>Implementamos uma variedade de medidas de segurança para manter a segurança de suas informações pessoais. Utilizamos criptografia de ponta e servidores seguros para proteger seus dados contra acesso não autorizado.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center text-orange-600"><Scale className="w-4 h-4" /></div>
                5. Seus Direitos
              </h2>
              <p>Você tem o direito de acessar, corrigir ou excluir seus dados pessoais a qualquer momento. Para exercer esses direitos, entre em contato com nosso suporte através dos canais oficiais disponíveis na plataforma.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
