/* Tudo da landing ABAIXO do hero — carregado com React.lazy pelo LandingPitch.
 *
 * O framer-motion (~40 KB gzip / ~124 KB parse) vive todo aqui: as seções usam
 * animação de entrada por scroll (FadeUp, Counter, marquee). Separando num
 * chunk lazy, o hero (que é o LCP) pinta sem esperar o framer baixar/parsear —
 * e no mobile, com CPU 4x mais lenta, isso é meio segundo do caminho crítico. */

import { useEffect } from 'react';
import { SectionBridge } from './primitives';
import { IntegrationsMarquee, DiferencialSection } from './Diferencial';
import { RecursosBentoSection, GestaoInteligenteSection } from './Recursos';
import { SetoresSection } from './Setores';
import { MultiplataformaSection, ComoFuncionaSection } from './Plataforma';
import { TrustSection } from './Trust';
import { FaqSection } from './Faq';
import { CtaFinalSection, LandingFooter } from './CtaFooter';
import { DemoModal } from './DemoModal';
import { sectionBridges } from './data';

interface Props {
  demoOpen: boolean;
  onDemoClose: () => void;
}

export default function LandingBelowFold({ demoOpen, onDemoClose }: Props) {
  // As seções vivem neste chunk lazy: quando a página abre com #ancora (ex.: sitelinks
  // do Google Ads), o navegador tenta rolar antes de elas existirem e fica no topo.
  // Rola de novo assim que montam (e uma 2ª vez, após imagens/animações assentarem).
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const go = () => document.getElementById(id)?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    const t1 = window.setTimeout(go, 150);
    const t2 = window.setTimeout(go, 900);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  return (
    <>
      <IntegrationsMarquee />
      <DiferencialSection />
      <SectionBridge text={sectionBridges.paraSetores} />
      <SetoresSection />
      <SectionBridge text={sectionBridges.paraRecursos} />
      <RecursosBentoSection />
      <SectionBridge text={sectionBridges.paraTecnologia} />
      <GestaoInteligenteSection />
      <MultiplataformaSection />
      <ComoFuncionaSection />
      <TrustSection />
      <FaqSection />
      <CtaFinalSection />
      <LandingFooter />
      <DemoModal isOpen={demoOpen} onClose={onDemoClose} />
    </>
  );
}
