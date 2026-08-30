import React from "react";
import { ShieldCheck, Lock, Eye, Scale, ArrowLeft, Cookie, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

export default function PrivacyPolicy() {
  usePageMeta(
    "Política de Privacidade",
    "Saiba como o Represente-Se! coleta, usa e protege os dados dos seus clientes e da sua conta.",
    "/privacy"
  );
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
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-12">Atualizada em 30 de Agosto de 2026</p>

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
                3. Conectar sua Conta Google
              </h2>
              <p>
                Se você conectar o Gmail e o Google Agenda, usamos esse acesso só para mostrar seus e-mails e sincronizar
                seus compromissos dentro do Represente-Se! — nunca para outro fim, nunca para treinar IA e nunca
                compartilhado com terceiros. Você pode desconectar quando quiser, direto nas configurações do
                Represente-Se! ou em{' '}
                <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline">
                  myaccount.google.com/permissions
                </a>.
              </p>
              <p className="text-xs text-slate-400 dark:text-zinc-500">
                O uso desses dados segue a{' '}
                <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline">
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
                <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center text-amber-600"><Cookie className="w-4 h-4" /></div>
                5. Cookies e Rastreamento
              </h2>
              <p>
                Usamos cookies e armazenamento local essenciais (login, segurança, uso offline) e, mediante o seu aceite,
                ferramentas de análise de uso (PostHog e métricas próprias) para melhorar o app. O monitoramento de erros
                (Sentry) e a medição de velocidade (Vercel) rodam sob legítimo interesse, sem perfilamento nem
                publicidade. Você escolhe no banner da primeira visita e pode mudar quando quiser em Configurações ›
                Privacidade. Detalhe de cada item em{' '}
                <Link to="/cookies" className="text-emerald-600 underline">Política de Cookies</Link>.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-rose-100 dark:bg-rose-900/30 rounded-lg flex items-center justify-center text-rose-600"><MapPin className="w-4 h-4" /></div>
                6. Localização
              </h2>
              <p>
                Com a sua permissão, coletamos a localização do seu dispositivo enquanto você usa o aplicativo. Usamos
                esse dado para duas finalidades:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>centralizar o mapa de clientes na sua posição e calcular distâncias até eles;</li>
                <li>
                  permitir que o Represente-Se acompanhe a distribuição geográfica da rede de representantes, para avaliar
                  a cobertura de mercado.
                </li>
              </ul>
              <p>
                A coleta acontece apenas com o app aberto — nunca em segundo plano — e no máximo uma vez a cada três
                horas. Você pode recusar quando o aparelho pedir a permissão, revogá-la depois nas configurações do
                sistema, ou desligar em <strong className="font-bold text-slate-700 dark:text-zinc-200">Configurações ›
                Privacidade</strong>; nesse caso o último ponto registrado é apagado. Não vendemos nem compartilhamos sua
                localização com terceiros.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center text-orange-600"><Scale className="w-4 h-4" /></div>
                7. Seus Direitos
              </h2>
              <p>
                Você tem o direito de acessar, corrigir ou excluir seus dados pessoais a qualquer momento. Para excluir
                sua conta ou seus dados, veja o passo a passo em{' '}
                <Link to="/exclusao-de-dados" className="text-emerald-600 underline">
                  Exclusão de Conta e Dados
                </Link>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
