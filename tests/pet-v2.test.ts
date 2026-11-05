import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { csvCell, petCsv } from "../src/features/pet/csv";
import { localQrUrl, nrQrPlates } from "../src/features/nr/qr-plates";
import { petBlankPdf } from "../src/features/pet/print";
describe("Operational exports", () => {
  it("blank form keeps three pages per copy and rejects unapproved layout schema", async () => {
    const model = {
      nome: "FIXTURE",
      versao: 1,
      procedimento: {
        impressao: { layout: "nexus-v2-3p", trabalhadores: 5, vigias: 2 },
        itens: [{ id: "a", rotulo: "Critério fixture" }],
        agentes: [{ agente: "Teste", unidade: "ppm", maximo: 1 }],
      },
    };
    expect((await PDFDocument.load(await petBlankPdf(model, 2))).getPageCount()).toBe(6);
    await expect(petBlankPdf({ ...model, procedimento: {} }, 1)).rejects.toThrow();
  });
  it("escapes formulas, separators, quotes and newlines", () => {
    expect(csvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"');
    expect(csvCell('texto;\n"linha"')).toBe('"texto;\n""linha"""');
    expect(petCsv([{ numero: 1, atividade: "+cmd" }], "data")).toContain('"\'+cmd"');
  });
  it("QR never includes session data or arbitrary paths", () => {
    expect(localQrUrl("https://nexusgestao.app/else?token=secret", "client", "unit", "local")).toBe(
      "https://nexusgestao.app/nr-33/locais/local?cliente=client&unidade=unit",
    );
    expect(() => localQrUrl("javascript:alert(1)", "c", "u", "l")).toThrow();
  });
  it("prints four labels per A4 without truncating remaining places", async () => {
    const bytes = await nrQrPlates(
      "http://127.0.0.1:4196",
      "c",
      "u",
      Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        tag: `EC ${i}`,
        titulo: "Local de teste",
      })),
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize().width).toBeCloseTo(595.28);
  });
});
