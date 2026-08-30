/* Tudo da landing ABAIXO do hero — carregado com React.lazy pelo LandingPitch.
 *
 * O framer-motion (~40 KB gzip / ~124 KB parse) vive todo aqui: as seções usam
 * animação de entrada por scroll (FadeUp, Counter, marquee). Separando num
 * chunk lazy, o hero (que é o LCP) pinta sem esperar o framer baixar/parsear —
 * e no mobile, com CPU 4x mais lenta, isso é meio segundo do caminho crítico. */

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
