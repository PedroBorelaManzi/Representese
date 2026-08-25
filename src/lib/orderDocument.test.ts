import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/* PDF de exemplo com a mesma estrutura do documento real que travou a tela
 * de "Enviar Pedido" no celular do dono (erro do Safari: "undefined is not
 * a function (near '...n of e...')") — layout de DANFE com EMITENTE,
 * DESTINATARIO/REMETENTE, itens e SubTotal/Total. Dados fabricados de
 * propósito: o repositório é público, e o documento real trazia nome,
 * endereço, telefone e CNPJ de um cliente de verdade. */
const PDF_EXEMPLO = readFileSync(join(HERE, "__fixtures__/pedido-exemplo.pdf"));

function arquivoDe(bytes: Uint8Array | Buffer, nome: string, tipo: string): File {
  return new File([bytes as any], nome, { type: tipo });
}

describe("detectDocumentKind", () => {
  it("PDF pelos bytes mágicos, mesmo sem extensão/mime declarados", async () => {
    const { detectDocumentKind } = await import("./orderDocument");
    expect(detectDocumentKind(new Uint8Array(PDF_EXEMPLO.subarray(0, 16)), "arquivo_sem_nome", "").kind).toBe("pdf");
  });

  it("JPEG pelos bytes mágicos (FFD8FF)", async () => {
    const { detectDocumentKind } = await import("./orderDocument");
    const r = detectDocumentKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "foto", "");
    expect(r.kind).toBe("image");
    expect(r.mimeType).toBe("image/jpeg");
  });

  it("HEIC de iPhone (ftyp + heic) é reconhecido como imagem", async () => {
    // Antes esse formato caía em "unknown" e a tela travava sem explicar —
    // é o formato padrão de foto do iPhone, então é comum, não exceção.
    const { detectDocumentKind } = await import("./orderDocument");
    const bytes = new Uint8Array(12);
    bytes.set([0, 0, 0, 0x18], 0); // tamanho da box, irrelevante aqui
    bytes.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
    bytes.set([0x68, 0x65, 0x69, 0x63], 8); // "heic"
    const r = detectDocumentKind(bytes, "IMG_1234.HEIC", "");
    expect(r.kind).toBe("image");
    expect(r.mimeType).toBe("image/heic");
  });

  it(".xls antigo (OLE2) é reconhecido, mas marcado como sem suporte", async () => {
    // Antes viraval "unknown" silencioso, indistinguível de um arquivo
    // qualquer — agora dá pra mandar mensagem específica pro usuário.
    const { detectDocumentKind } = await import("./orderDocument");
    const r = detectDocumentKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), "pedido.xls", "");
    expect(r.kind).toBe("unknown");
    expect(r.semSuporte).toBeTruthy();
  });

  it(".xlsx (ZIP com nome certo) vira excel, não unknown", async () => {
    const { detectDocumentKind } = await import("./orderDocument");
    const r = detectDocumentKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "pedido.xlsx", "");
    expect(r.kind).toBe("excel");
  });

  it("sem bytes reconhecíveis, cai pro MIME declarado", async () => {
    const { detectDocumentKind } = await import("./orderDocument");
    const r = detectDocumentKind(new Uint8Array(0), "arquivo", "application/pdf");
    expect(r.kind).toBe("pdf");
  });
});

describe("prepareOrderDocument — PDF", () => {
  it("nunca lança com um PDF de verdade (layout de DANFE): sempre sai inlineData", async () => {
    // pdfjs-dist, quando importado puro em Node (como o Vitest roda), usa o
    // build "moderno" — o mesmo do navegador — e a própria biblioteca avisa
    // que faltam APIs de DOM aqui ("Please use the legacy build in Node.js
    // environments"); por isso não dá pra checar o CONTEÚDO do texto extraído
    // neste teste (é checado à parte, com o texto real mockado, no teste
    // abaixo). O que importa aqui — e é a causa raiz do bug original — é que
    // rodar a extração com a biblioteca de verdade, no ambiente que for,
    // nunca impede o documento de virar anexo pra IA.
    const { prepareOrderDocument } = await import("./orderDocument");
    const resultado = await prepareOrderDocument(arquivoDe(PDF_EXEMPLO, "pedido.pdf", "application/pdf"));

    expect(resultado.fatalMessage).toBeUndefined();
    expect(resultado.kind).toBe("pdf");
    expect(resultado.inlineData?.mimeType).toBe("application/pdf");
    expect(resultado.inlineData?.data.length).toBeGreaterThan(0);
    expect(typeof resultado.extractedText).toBe("string");
  });

  it("com a extração de texto funcionando, o conteúdo real do pedido sai certo", async () => {
    // Simula o pdf.js funcionando (como funciona no navegador) devolvendo o
    // texto de verdade deste mesmo pedido — capturado uma vez com o build
    // "legacy" do pdf.js em Node, que lê o arquivo perfeitamente.
    const linha =
      "EMPRESA FICTICIA MOVEIS LTDA ... CLIENTE TESTE MATERIAIS PARA CONSTRUCAO LTDA ... " +
      "SubTotal IPI Total (+) R$ 9.139,97 R$ 286,60 R$ 9.426,57 ST (+) R$ 0,00";
    vi.doMock("./pdfjsLoader", () => ({
      loadPdfjs: vi.fn().mockResolvedValue({
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
              getTextContent: async () => ({ items: [{ str: linha }] }),
            }),
          }),
        }),
      }),
    }));
    vi.resetModules();
    const { prepareOrderDocument } = await import("./orderDocument");

    const resultado = await prepareOrderDocument(arquivoDe(PDF_EXEMPLO, "pedido.pdf", "application/pdf"));

    expect(resultado.extractedText).toContain("EMPRESA FICTICIA");
    expect(resultado.extractedText).toContain("9.426,57");
    // O anexo continua indo junto — texto extraído é bônus, não substituto.
    expect(resultado.inlineData?.data.length).toBeGreaterThan(0);

    vi.doUnmock("./pdfjsLoader");
    vi.resetModules();
  });

  it("MUTAÇÃO: se o parser de texto (pdf.js) quebrar, o anexo ainda vai pra IA", async () => {
    // Isso é o bug real que derrubou a tela: antes, PDF só existia pro app
    // como texto extraído — se a extração falhasse, sobrava nada. Mocka
    // loadPdfjs pra simular exatamente essa falha e confirma que o anexo
    // (montado ANTES da extração) sobrevive.
    vi.doMock("./pdfjsLoader", () => ({
      loadPdfjs: vi.fn().mockRejectedValue(new TypeError("undefined is not a function (near '...n of e...')")),
    }));
    vi.resetModules();
    const { prepareOrderDocument } = await import("./orderDocument");

    const resultado = await prepareOrderDocument(arquivoDe(PDF_EXEMPLO, "pedido.pdf", "application/pdf"));

    expect(resultado.fatalMessage).toBeUndefined();
    expect(resultado.inlineData?.data.length).toBeGreaterThan(0);
    expect(resultado.extractedText).toBe("");
    expect(resultado.localError).toContain("pdf.js falhou");

    vi.doUnmock("./pdfjsLoader");
    vi.resetModules();
  });

  it("PDF grande demais pro anexo (>3MB) ainda tenta o texto, sem lançar", async () => {
    const { prepareOrderDocument, LIMITE_ANEXO_BYTES } = await import("./orderDocument");
    const grande = Buffer.concat([PDF_EXEMPLO, Buffer.alloc(LIMITE_ANEXO_BYTES)]);
    const resultado = await prepareOrderDocument(arquivoDe(grande, "pedido_grande.pdf", "application/pdf"));
    expect(resultado.inlineData).toBeUndefined();
    expect(resultado.localError).toContain("grande demais");
  });
});

describe("prepareOrderDocument — planilha", () => {
  it("MUTAÇÃO: ExcelJS quebrando vira localError + fatalMessage, não exceção", async () => {
    vi.doMock("exceljs", () => ({
      default: {
        Workbook: vi.fn().mockImplementation(() => ({
          xlsx: { load: vi.fn().mockRejectedValue(new Error("arquivo corrompido")) },
        })),
      },
    }));
    vi.resetModules();
    const { prepareOrderDocument } = await import("./orderDocument");

    const zipVazio = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const resultado = await prepareOrderDocument(arquivoDe(zipVazio, "pedido.xlsx", "application/vnd.openxmlformats"));

    expect(resultado.localError).toContain("exceljs falhou");
    expect(resultado.fatalMessage).toBeTruthy();

    vi.doUnmock("exceljs");
    vi.resetModules();
  });
});

describe("prepareOrderDocument — tipos sem suporte", () => {
  it(".xls antigo devolve mensagem específica em vez de 'arquivo vazio'", async () => {
    const { prepareOrderDocument } = await import("./orderDocument");
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    const resultado = await prepareOrderDocument(arquivoDe(ole2, "pedido.xls", "application/vnd.ms-excel"));
    expect(resultado.fatalMessage).toContain(".xls");
  });

  it("formato totalmente desconhecido não lança, devolve fatalMessage", async () => {
    const { prepareOrderDocument } = await import("./orderDocument");
    const lixo = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const resultado = await prepareOrderDocument(arquivoDe(lixo, "arquivo.bin", ""));
    expect(resultado.fatalMessage).toBeTruthy();
  });
});

describe("bytesParaBase64", () => {
  it("arquivo grande (maior que um pedaço de 32k) não estoura a pilha", async () => {
    const { bytesParaBase64 } = await import("./orderDocument");
    const grande = new Uint8Array(200_000).fill(65); // 200k 'A's
    expect(() => bytesParaBase64(grande)).not.toThrow();
    expect(bytesParaBase64(grande).length).toBeGreaterThan(0);
  });
});
