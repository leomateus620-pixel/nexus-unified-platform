import { describe, expect, it } from "vitest";
import { nrFileContextSummaries } from "../src/features/nr/file-context";
describe("metadados de arquivo no vínculo selecionado", () => {
  const shared = {
    documento_id: "original",
    revisao_id: "revision-one",
    revisao_numero: 1,
    local_id: "first-place",
    origem_metadata: {
      legenda: "Legenda do primeiro contexto",
      autor: "Autor do primeiro contexto",
    },
    contextos: [
      {
        documento_id: "height",
        documento_titulo: "Procedimento de altura",
        revisao_id: "revision-two",
        revisao_numero: 2,
        local_id: "second-place",
        evidencia: {
          legenda: "Legenda de altura",
          autor_historico: "Autor de altura",
          data: "2026-10-11",
        },
      },
      {
        documento_id: "height",
        revisao_id: "old-revision",
        revisao_numero: 1,
        local_id: "second-place",
        evidencia: { legenda: "Legenda anterior" },
      },
    ],
  };
  it("não mostra a legenda primária de outro local/documento", () => {
    expect(
      nrFileContextSummaries(shared, {
        documentoId: "height",
        revisaoId: "revision-two",
        localId: "second-place",
      }),
    ).toEqual([
      {
        documentTitle: "Procedimento de altura",
        revisionId: "revision-two",
        revisionNumber: 2,
        caption: "Legenda de altura",
        date: "2026-10-11",
        author: "Autor de altura",
        category: "",
        primary: false,
      },
    ]);
  });
  it("todas as revisões conserva cada legenda e sua revisão, sem fundir as relações", () => {
    const result = nrFileContextSummaries(shared, { documentoId: "height" });
    expect(result.map((entry) => [entry.revisionNumber, entry.caption])).toEqual([
      [2, "Legenda de altura"],
      [1, "Legenda anterior"],
    ]);
  });
  it("metadados primários são exibidos somente no vínculo primário correspondente", () => {
    expect(
      nrFileContextSummaries(shared, { documentoId: "original", revisaoId: "revision-one" })[0]
        ?.caption,
    ).toBe("Legenda do primeiro contexto");
    expect(nrFileContextSummaries(shared, { documentoId: "unrelated" })).toEqual([]);
  });
});
