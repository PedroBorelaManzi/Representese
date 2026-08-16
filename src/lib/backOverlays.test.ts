import { describe, it, expect, beforeEach } from "vitest";
import { fecharSobreposicaoDoTopo, __registrarSobreposicao } from "./backOverlays";

/* O botão "Voltar" do Android é global. Estes testes travam o contrato de que
   ele fecha o que está por cima antes de navegar — o bug original era abrir um
   arquivo dentro de Clientes e, ao voltar, sair da página junto. */
describe("pilha de sobreposições do botão Voltar", () => {
  beforeEach(() => {
    // Zera o que tiver sobrado de um teste anterior.
    while (fecharSobreposicaoDoTopo()) {
      /* esvaziando */
    }
  });

  it("sem nada aberto, deixa o botão Voltar seguir seu curso normal", () => {
    expect(fecharSobreposicaoDoTopo()).toBe(false);
  });

  it("com uma sobreposição aberta, fecha ela e impede a navegação", () => {
    let fechou = false;
    __registrarSobreposicao(() => {
      fechou = true;
    });

    expect(fecharSobreposicaoDoTopo()).toBe(true);
    expect(fechou).toBe(true);
    // Depois de fechar, o próximo Voltar volta a navegar normalmente.
    expect(fecharSobreposicaoDoTopo()).toBe(false);
  });

  it("com várias abertas, fecha da mais recente para a mais antiga", () => {
    const ordem: string[] = [];
    __registrarSobreposicao(() => ordem.push("visualizador"));
    __registrarSobreposicao(() => ordem.push("confirmacao"));

    fecharSobreposicaoDoTopo();
    fecharSobreposicaoDoTopo();

    expect(ordem).toEqual(["confirmacao", "visualizador"]);
  });

  it("uma sobreposição fechada pela tela some da pilha", () => {
    // Fechar pelo X do modal desmonta o componente, que cancela o registro.
    // Sem isso, o próximo Voltar seria engolido por um modal que nem existe.
    const cancelar = __registrarSobreposicao(() => {
      throw new Error("não devia ser chamada");
    });
    cancelar();

    expect(fecharSobreposicaoDoTopo()).toBe(false);
  });

  it("cancelar o registro do meio não desalinha a ordem dos outros", () => {
    const ordem: string[] = [];
    __registrarSobreposicao(() => ordem.push("fundo"));
    const cancelarMeio = __registrarSobreposicao(() => ordem.push("meio"));
    __registrarSobreposicao(() => ordem.push("topo"));

    cancelarMeio();
    fecharSobreposicaoDoTopo();
    fecharSobreposicaoDoTopo();

    expect(ordem).toEqual(["topo", "fundo"]);
    expect(fecharSobreposicaoDoTopo()).toBe(false);
  });
});
