import { describe, it, expect } from "vitest";
import {
  parseReportLines,
  parseMoney,
  pickValue,
  matchClient,
  normalizeName,
  orderDateToTimestamp,
} from "./reportImporter";

/**
 * Linhas reais do relatório da COZIMAX, já tokenizadas como o pdfjs entrega.
 * Inclui de propósito o cabeçalho, a linha de agrupamento por vendedor e a
 * linha de totais — nenhuma delas pode virar pedido.
 */
const linhasDoRelatorio: string[][] = [
  ["1", "COZIMAX", "MOVEIS", "MIRASSOL", "LTDA", "Pagina......:", "1"],
  ["Relação", "de", "Pedidos", "de", "Vendas", "por", "Vendedor", "No", "Periodo", "de", "01/07/2026", "a", "31/07/2026"],
  ["Pedido", "Data", "Cliente", "Peça", "Vol.", "Vol.", "m3", "Frete", "Pedido", "s/", "IPI", "Pedido", "Cidade", "UF"],
  ["1256", "FARROMAN", "REPRESENTACOES", "LTDA"],
  ["1177699", "01/07/2026", "24128", "WOGEL - LAR & CONSTRUCAO", "1", "1", "0.595", "23.2", "0.00", "726.21", "749.81", "ITUPEVA", "SP"],
  ["1179281", "02/07/2026", "61822", "GRANTEL COMERCIO DE MATER", "10", "10", "1.085", "111.6", "0.00", "3,771.95", "3,899.70", "CESARIO LANGE", "SP"],
  ["1179658", "04/07/2026", "45649", "ALMEIDA GALVAO MATERIAIS", "5", "5", "1.387", "109.6", "0.00", "2,538.39", "2,620.88", "RIBEIRAO GRANDESP"],
  ["Quantidade", "de", "Pedidos:", "139", "Sub-Total:", "1,889", "1,965", "532.533", "41,987.8", "0.00", "1,799,258.00", "930,969.68"],
];

describe("parseReportLines", () => {
  const res = parseReportLines(linhasDoRelatorio);

  it("reconhece só as linhas de pedido, ignorando cabeçalho, vendedor e totais", () => {
    expect(res.rows).toHaveLength(3);
    expect(res.rows.map(r => r.orderNumber)).toEqual(["1177699", "1179281", "1179658"]);
  });

  it("não confunde a linha de período (que tem duas datas) com um pedido", () => {
    expect(res.rows.some(r => r.clientName.includes("Periodo"))).toBe(false);
  });

  it("liga corretamente pedido, data, cliente e valor na mesma linha", () => {
    const r = res.rows[1];
    expect(r.orderNumber).toBe("1179281");
    expect(r.date).toBe("2026-07-02");
    expect(r.rawDate).toBe("02/07/2026");
    expect(r.clientCode).toBe("61822");
    expect(r.clientName).toBe("GRANTEL COMERCIO DE MATER");
    expect(pickValue(r, 0)).toBe(3899.7); // valor do pedido (última coluna)
    expect(pickValue(r, 1)).toBe(3771.95); // valor sem IPI (penúltima)
  });

  it("separa cidade e UF mesmo quando vêm coladas no PDF", () => {
    const r = res.rows[2];
    expect(r.city).toBe("RIBEIRAO GRANDE");
    expect(r.state).toBe("SP");
  });

  it("detecta quantas colunas de valor o relatório tem", () => {
    expect(res.valueColumnCount).toBe(3); // frete + sem IPI + total
  });

  it("não deixa a linha de totais entrar como pedido", () => {
    expect(res.rows.some(r => r.values.includes(930969.68))).toBe(false);
  });
});

describe("parseMoney", () => {
  it("entende o padrão americano usado no relatório", () => {
    expect(parseMoney("3,899.70")).toBe(3899.7);
    expect(parseMoney("1,799,258.00")).toBe(1799258);
    expect(parseMoney("749.81")).toBe(749.81);
  });

  it("entende também o padrão brasileiro", () => {
    expect(parseMoney("3.899,70")).toBe(3899.7);
    expect(parseMoney("1.799.258,00")).toBe(1799258);
  });
});

describe("matchClient", () => {
  const carteira = [
    { id: "a", name: "Grantel Comercio de Materiais para Construção Ltda" },
    { id: "b", name: "Wogel - Lar & Construcao" },
    { id: "c", name: "Casa Nova Materiais" },
    { id: "d", name: "Casa Nova Materiais Filial" },
  ];

  it("casa nome truncado do relatório com o cadastro completo", () => {
    const m = matchClient("GRANTEL COMERCIO DE MATER", carteira);
    expect(m.status).toBe("matched");
    expect(m.clientId).toBe("a");
  });

  it("ignora acento e pontuação na comparação", () => {
    expect(normalizeName("Construção")).toBe("CONSTRUCAO");
    expect(matchClient("WOGEL - LAR & CONSTRUCAO", carteira).clientId).toBe("b");
  });

  it("prefere o nome idêntico quando existe, mesmo havendo outro parecido", () => {
    const m = matchClient("CASA NOVA MATERIAIS", carteira);
    expect(m.status).toBe("matched");
    expect(m.clientId).toBe("c");
  });

  it("marca como ambíguo em vez de chutar quando o nome truncado serve a dois clientes", () => {
    const m = matchClient("DEPOSITO CENTRAL CASA", [
      { id: "x", name: "Deposito Central Casa & Construcao Ltda" },
      { id: "y", name: "Deposito Central Casa Forte ME" },
    ]);
    expect(m.status).toBe("ambiguous");
    expect(m.candidates).toHaveLength(2);
  });

  it("marca como não encontrado quem não está na carteira", () => {
    expect(matchClient("EMPRESA INEXISTENTE SA", carteira).status).toBe("unmatched");
  });
});

describe("orderDateToTimestamp", () => {
  it("grava ao meio-dia para o fuso do Brasil não jogar o pedido para o dia anterior", () => {
    const iso = orderDateToTimestamp("2026-07-01");
    const d = new Date(iso);
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(6); // julho
    expect(d.getHours()).toBe(12);
  });
});
