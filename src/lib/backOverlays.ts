import { useEffect, useRef } from "react";

/**
 * Pilha de sobreposições abertas (visualizadores, modais em tela cheia).
 *
 * O botão "Voltar" do Android é global: sem saber que existe algo aberto por
 * cima da página, ele navegava no histórico e tirava o usuário da tela —
 * abrir um arquivo em Clientes e apertar voltar fechava o visualizador *e* a
 * própria página junto. Quem está aberto se registra aqui, e o
 * BackButtonHandler fecha o topo da pilha antes de cogitar navegar.
 */
const pilha: Array<() => void> = [];

/** Exportada só para os testes — na aplicação, use `useFecharComBotaoVoltar`. */
export function __registrarSobreposicao(fechar: () => void): () => void {
  pilha.push(fechar);
  return () => {
    const i = pilha.lastIndexOf(fechar);
    if (i >= 0) pilha.splice(i, 1);
  };
}

/** Fecha a sobreposição mais recente. Devolve false se não havia nenhuma. */
export function fecharSobreposicaoDoTopo(): boolean {
  const fechar = pilha.pop();
  if (!fechar) return false;
  fechar();
  return true;
}

/**
 * Faz o botão "Voltar" fechar esta sobreposição em vez de navegar.
 * Chamar em todo modal que ocupa a tela inteira.
 */
export function useFecharComBotaoVoltar(aberto: boolean, aoFechar: () => void) {
  // Guarda o callback numa ref para não registrar/desregistrar a cada render
  // só porque a função foi recriada — o que deixaria a pilha fora de ordem.
  const ref = useRef(aoFechar);
  ref.current = aoFechar;

  useEffect(() => {
    if (!aberto) return;
    return __registrarSobreposicao(() => ref.current());
  }, [aberto]);
}
