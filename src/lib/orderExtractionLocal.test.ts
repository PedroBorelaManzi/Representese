import { describe, it, expect } from "vitest";
import {
  extractCNPJLocally,
  extractValueLocally,
  extractCategoryLocallyDetailed,
  parseMoedaBR,
  reconcileExtractionResult,
  buildOrderExtractionPrompt,
} from "./orderExtractionCore";

/* Cobre a leitura LOCAL do pedido (regex/heurística, sem IA). Ela é a rede de
   segurança quando o Gemini falha ou demora, e também alimenta as "dicas"
   mandadas no prompt — então um erro aqui não fica só no fallback: puxa a
   resposta da IA junto pro erro.

   Os documentos abaixo imitam layouts reais de nota fiscal e pedido
   brasileiros, que é onde os defeitos apareciam. */

// Nota fiscal típica: EMITENTE no topo, DESTINATÁRIO logo abaixo, e a base de
// cálculo do ICMS-ST MAIOR que o total a pagar.
const NOTA_FISCAL = `
TINTAS AURORA INDUSTRIA E COMERCIO LTDA
CNPJ: 11.111.111/0001-11   INSCRICAO ESTADUAL: 123.456.789
DANFE - DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA

DESTINATARIO / REMETENTE
Nome/Razao Social: SUPERMERCADO N. S. DE LOURDES LTDA
CNPJ: 22.222.222/0001-22
Endereco: Rua das Flores, 100 - Cerquilho/SP

DADOS DOS PRODUTOS
001 TINTA ACRILICA 18L   18   700,00   12.600,00
002 ESMALTE 3,6L          6   466,75    2.800,50

CALCULO DO IMPOSTO
Base de Calculo do ICMS: 15.400,50    Valor do ICMS: 2.772,09
Base de Calculo ICMS ST: 19.250,60    Valor do ICMS ST: 1.155,04
Valor do Frete: 0,00    Valor do Desconto: 0,00
Valor Total dos Produtos: 15.400,50
VALOR TOTAL DA NOTA: 15.400,50
`;

describe("extractValueLocally", () => {
  it("na nota fiscal, pega o total da nota e NÃO a base de cálculo ST (que é maior)", () => {
    // O bug antigo: sem rótulo confiável, a função devolvia o maior número da
    // folha — 19.250,60, a base de ST — em vez dos 15.400,50 do total.
    expect(extractValueLocally(NOTA_FISCAL)).toBeCloseTo(15400.5);
  });

  it("ignora ICMS, frete e desconto mesmo quando aparecem depois do total", () => {
    const texto = "Total da nota: 1.500,00 Valor do ICMS: 270,00 Valor do frete: 90,00";
    expect(extractValueLocally(texto)).toBeCloseTo(1500);
  });

  it("não confunde Subtotal com Total", () => {
    const texto = "Subtotal: 9.999,00 Total geral: 1.200,00";
    expect(extractValueLocally(texto)).toBeCloseTo(1200);
  });

  it("não confunde 'Total de itens' (contagem) com dinheiro", () => {
    const texto = "Total de itens: 24 Total do pedido: 3.480,00";
    expect(extractValueLocally(texto)).toBeCloseTo(3480);
  });

  it("lê valor sem centavos escrito com separador de milhar", () => {
    // Pedido escrito à mão costuma ter "R$ 15.400" sem os centavos; a regex
    // antiga exigia centavos e não achava nada.
    expect(extractValueLocally("Total do pedido R$ 15.400")).toBeCloseTo(15400);
  });

  it("rótulo mais confiável ganha do menos confiável, mesmo vindo antes", () => {
    const texto = "Total da nota: 1.000,00 ... Valor total dos produtos: 1.200,00";
    expect(extractValueLocally(texto)).toBeCloseTo(1000);
  });

  it("empate de rótulo: vale o último (o total final fica no fim do documento)", () => {
    const texto = "Total geral: 500,00 (parcial) ... Total geral: 800,00";
    expect(extractValueLocally(texto)).toBeCloseTo(800);
  });
});

describe("parseMoedaBR", () => {
  it("trata ponto como separador de milhar quando o grupo tem 3 dígitos", () => {
    // "15.400" é quinze mil e quatrocentos, não 15,4 — era assim que a versão
    // antiga lia, transformando um pedido de R$ 15 mil em R$ 15.
    expect(parseMoedaBR("15.400")).toBe(15400);
    expect(parseMoedaBR("1.234.567")).toBe(1234567);
  });

  it("trata ponto como decimal quando não são 3 dígitos", () => {
    expect(parseMoedaBR("199.90")).toBeCloseTo(199.9);
  });

  it("formato brasileiro completo", () => {
    expect(parseMoedaBR("12.345,67")).toBeCloseTo(12345.67);
  });

  it("formato americano completo", () => {
    expect(parseMoedaBR("12,345.67")).toBeCloseTo(12345.67);
  });
});

describe("extractCNPJLocally", () => {
  it("na nota fiscal, devolve o CNPJ do DESTINATÁRIO, não o do emitente", () => {
    // O emitente vem primeiro no documento; a versão antiga caía no
    // `matches[0]` e devolvia o CNPJ do fornecedor como se fosse do cliente.
    expect(extractCNPJLocally(NOTA_FISCAL)).toBe("22222222000122");
  });

  it("prefere o rótulo mais próximo do número quando os dois aparecem na janela", () => {
    const texto = "EMITENTE Fulano Ltda ... DESTINATARIO: Beltrano CNPJ 33.333.333/0001-33";
    expect(extractCNPJLocally(texto)).toBe("33333333000133");
  });

  it("documento com um CNPJ só e sem rótulo: assume que é o do cliente", () => {
    expect(extractCNPJLocally("Pedido para Mercearia X CNPJ 44.444.444/0001-44")).toBe("44444444000144");
  });

  it("quando todos os CNPJs são claramente do emitente, prefere não chutar", () => {
    const texto = "EMITENTE: Industria Cozimax CNPJ 55.555.555/0001-55 - Fornecedor CNPJ 66.666.666/0001-66";
    expect(extractCNPJLocally(texto)).toBe("");
  });

  it("sem CNPJ nenhum, devolve vazio", () => {
    expect(extractCNPJLocally("nada aqui")).toBe("");
  });
});

describe("extractCategoryLocallyDetailed", () => {
  const categorias = ["Tintas Aurora", "AgroMax", "Farma Distribuidora"];

  it("acha a representada no cabeçalho e pontua alto", () => {
    const r = extractCategoryLocallyDetailed(NOTA_FISCAL, categorias);
    expect(r.category).toBe("Tintas Aurora");
    expect(r.score).toBeGreaterThanOrEqual(100);
  });

  it("nome completo no cabeçalho vale mais que no rodapé", () => {
    const cabecalho = extractCategoryLocallyDetailed("AGROMAX INSUMOS - pedido", ["AgroMax"]);
    const rodape = extractCategoryLocallyDetailed(
      `${"x".repeat(1200)} impresso por AgroMax`, ["AgroMax"]);
    expect(cabecalho.score).toBeGreaterThan(rodape.score);
  });

  it("acerto de palavra solta pontua fraco (não é evidência de emitente)", () => {
    // "Distribuidora" sozinha não prova que a representada é a Farma.
    const r = extractCategoryLocallyDetailed("Cliente: Distribuidora Galo de Ouro", categorias);
    expect(r.score).toBeLessThan(100);
  });

  it("sem categorias cadastradas, devolve vazio", () => {
    expect(extractCategoryLocallyDetailed("qualquer texto", []).category).toBe("");
  });
});

describe("reconcileExtractionResult", () => {
  const categorias = ["Tintas Aurora", "AgroMax"];
  const respostaIa = JSON.stringify({
    client: "Supermercado N. S. de Lourdes",
    cnpj: "22222222000122",
    category: "Tintas Aurora",
    value: 15400.5,
    address: "Rua das Flores, 100",
  });

  it("usa a resposta da IA quando ela vem completa", () => {
    const r = reconcileExtractionResult(respostaIa, "", 0, "", categorias);
    expect(r.client).toBe("Supermercado N. S. de Lourdes");
    expect(r.category).toBe("Tintas Aurora");
    expect(r.value).toBeCloseTo(15400.5);
  });

  it("palpite local fraco NÃO sobrepõe a categoria da IA", () => {
    // Antes o local sempre ganhava, mesmo valendo só 15 pontos de uma palavra
    // solta — e trocava a resposta certa da IA por um chute.
    const r = reconcileExtractionResult(respostaIa, "", 0, "AgroMax", categorias, 15);
    expect(r.category).toBe("Tintas Aurora");
  });

  it("palpite local forte sobrepõe a categoria da IA", () => {
    const r = reconcileExtractionResult(respostaIa, "", 0, "AgroMax", categorias, 160);
    expect(r.category).toBe("AgroMax");
  });

  it("categoria inventada pela IA, fora da lista, é descartada", () => {
    const raw = JSON.stringify({ client: "X", cnpj: "", category: "Marca Inexistente", value: 10 });
    expect(reconcileExtractionResult(raw, "", 0, "", categorias).category).toBe("");
  });

  it("JSON inválido cai pro modo local sem travar", () => {
    const r = reconcileExtractionResult("isso não é JSON", "22222222000122", 15400.5, "", categorias);
    expect(r.method).toBe("local");
    expect(r.cnpj).toBe("22222222000122");
    expect(r.value).toBeCloseTo(15400.5);
  });

  it("no modo local, só aproveita a categoria se a evidência for forte", () => {
    const fraco = reconcileExtractionResult("nao é json", "", 0, "AgroMax", categorias, 15);
    expect(fraco.category).toBe("");
    const forte = reconcileExtractionResult("nao é json", "", 0, "AgroMax", categorias, 160);
    expect(forte.category).toBe("AgroMax");
  });

  it("valor zero ou negativo da IA cede para o valor local", () => {
    const raw = JSON.stringify({ client: "X", cnpj: "", category: "", value: 0 });
    expect(reconcileExtractionResult(raw, "", 250, "", categorias).value).toBe(250);
  });
});

describe("buildOrderExtractionPrompt", () => {
  it("inclui os clientes cadastrados, que é o que permite o match automático", () => {
    const p = buildOrderExtractionPrompt("conteudo", "", 0, ["Tintas Aurora"], [
      "Supermercado N. S. de Lourdes",
      "Mercearia Hungria",
    ]);
    expect(p).toContain("Supermercado N. S. de Lourdes");
    expect(p).toContain("Mercearia Hungria");
    expect(p).toContain("Tintas Aurora");
  });

  it("sem clientes cadastrados, diz isso em vez de deixar a seção vazia", () => {
    expect(buildOrderExtractionPrompt("c", "", 0, [], [])).toContain("nenhum cadastrado");
  });

  it("limita a lista pra não estourar o contexto em carteira grande", () => {
    const muitos = Array.from({ length: 900 }, (_, i) => `Cliente ${i}`);
    const p = buildOrderExtractionPrompt("c", "", 0, [], muitos);
    expect(p).toContain("Cliente 0");
    expect(p).not.toContain("Cliente 899");
    expect(p).toContain("outros não listados");
  });

  it("corta documento gigante pra caber no contexto", () => {
    const p = buildOrderExtractionPrompt("A".repeat(50000), "", 0, [], []);
    expect(p.length).toBeLessThan(20000);
  });
});
