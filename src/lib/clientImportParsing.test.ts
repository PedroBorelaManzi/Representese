import { describe, it, expect } from "vitest";
import { headerMatchesField, cellText, findCsvValue } from "./clientImportParsing";

describe("headerMatchesField", () => {
  it("reconhece 'CLIENTE' como coluna de nome — era o caso real que travava a importação", () => {
    expect(headerMatchesField("cliente", "name")).toBe(true);
  });

  it("reconhece variações comuns em português", () => {
    expect(headerMatchesField("nome", "name")).toBe(true);
    expect(headerMatchesField("razão social", "name")).toBe(true);
    expect(headerMatchesField("razao social", "name")).toBe(true);
    expect(headerMatchesField("empresa", "name")).toBe(true);
  });

  it("continua reconhecendo os nomes originais em inglês", () => {
    expect(headerMatchesField("name", "name")).toBe(true);
    expect(headerMatchesField("company name", "name")).toBe(true);
  });

  it("não confunde 'cnpj' com coluna de nome", () => {
    expect(headerMatchesField("cnpj", "name")).toBe(false);
  });

  it("reconhece variações de endereço, cidade, estado, telefone e email", () => {
    expect(headerMatchesField("endereço", "address")).toBe(true);
    expect(headerMatchesField("cidade", "city")).toBe(true);
    expect(headerMatchesField("uf", "state")).toBe(true);
    expect(headerMatchesField("fone", "phone")).toBe(true);
    expect(headerMatchesField("e-mail", "email")).toBe(true);
  });

  it("reconhece coluna de nome fantasia", () => {
    expect(headerMatchesField("fantasia", "fantasia")).toBe(true);
    expect(headerMatchesField("nome fantasia", "fantasia")).toBe(true);
  });
});

describe("cellText — mutação do bug original", () => {
  /** Fake mínimo de uma Row do ExcelJS: só o que cellText usa. */
  function fakeRow(cells: Record<number, unknown>) {
    return {
      getCell(col: number) {
        if (!(col in cells)) throw new Error("A Cell needs a Row"); // comportamento real do ExcelJS pra índice ausente
        return { value: cells[col] };
      },
    } as any;
  }

  it("devolve string vazia (sem lançar) quando a coluna não foi encontrada — reproduz o bug original", () => {
    const row = fakeRow({ 1: "00.063.960/0043-50" });
    // headers.name ficaria undefined numa planilha sem coluna reconhecida como nome;
    // o bug original chamava row.getCell(undefined) e o ExcelJS lançava "A Cell needs a Row".
    expect(() => cellText(row, undefined)).not.toThrow();
    expect(cellText(row, undefined)).toBe("");
  });

  it("lê texto simples normalmente", () => {
    const row = fakeRow({ 2: "ATACADÃO SP - 2 VG" });
    expect(cellText(row, 2)).toBe("ATACADÃO SP - 2 VG");
  });

  it("lê texto rico (rich text) como string simples", () => {
    const row = fakeRow({ 2: { richText: [{ text: "Cliente " }, { text: "Exemplo" }], text: "Cliente Exemplo" } });
    expect(cellText(row, 2)).toBe("Cliente Exemplo");
  });

  it("lê resultado de fórmula em vez do objeto de fórmula", () => {
    const row = fakeRow({ 2: { formula: "=A1", result: "Cliente Calculado" } });
    expect(cellText(row, 2)).toBe("Cliente Calculado");
  });

  it("célula vazia (null/undefined) vira string vazia, não erro", () => {
    const row = fakeRow({ 2: null });
    expect(cellText(row, 2)).toBe("");
  });
});

describe("findCsvValue", () => {
  it("acha a coluna 'CLIENTE' (maiúscula) como nome", () => {
    const row = { CNPJ: "12.345.678/0001-90", CLIENTE: "Cliente Exemplo Ltda" };
    expect(findCsvValue(row, "name")).toBe("Cliente Exemplo Ltda");
    expect(findCsvValue(row, "cnpj")).toBe("12.345.678/0001-90");
  });

  it("devolve string vazia quando a coluna não existe, sem lançar", () => {
    const row = { CNPJ: "12.345.678/0001-90", CLIENTE: "Cliente Exemplo Ltda" };
    expect(findCsvValue(row, "address")).toBe("");
  });

  it("não deixa 'Nome Fantasia' virar o nome principal quando não há outra coluna de nome", () => {
    const row = { CNPJ: "12.345.678/0001-90", "Nome Fantasia": "Loja Exemplo" };
    expect(findCsvValue(row, "fantasia")).toBe("Loja Exemplo");
    expect(findCsvValue(row, "name")).toBe("");
  });
});
