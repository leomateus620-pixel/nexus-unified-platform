import { describe, expect, it } from "vitest";
import {
  hasLegacySnapshotSignature,
  legacySnapshotFieldLabel,
  proveLegacySnapshotContent,
} from "../src/features/nr/legacy-snapshot";
import { nrLabel } from "../src/features/nr/technical-display";
const snapshot = {
  cadastro: {
    responsavel_documentacao: "Responsável histórico sintético",
    energias: ["Elétrica"],
    campo_futuro: { origem: 0 },
  },
  fotos: [
    {
      arquivo: "fotos/unidade/a.jpg",
      miniatura: "fotos/unidade/thumb/a.jpg",
      legenda: "Acesso de teste",
      data: "2026-10-11",
      autor: "Autor histórico sintético",
    },
  ],
  epis: ["Capacete"],
};
// Fixed specimen of the importer's stored output, not a call to the projection under test.
const content = {
  schema_version: 1,
  blocos: [
    { tipo: "titulo", nivel: 2, texto: "Snapshot documental da origem" },
    { tipo: "titulo", nivel: 3, texto: "cadastro" },
    { tipo: "paragrafo", texto: "responsavel_documentacao: Responsável histórico sintético" },
    { tipo: "titulo", nivel: 4, texto: "energias" },
    { tipo: "paragrafo", texto: "Elétrica" },
    { tipo: "titulo", nivel: 4, texto: "campo_futuro" },
    { tipo: "paragrafo", texto: "origem: 0" },
    { tipo: "titulo", nivel: 3, texto: "fotos" },
    { tipo: "paragrafo", texto: "arquivo: fotos/unidade/a.jpg" },
    { tipo: "paragrafo", texto: "miniatura: fotos/unidade/thumb/a.jpg" },
    { tipo: "paragrafo", texto: "legenda: Acesso de teste" },
    { tipo: "paragrafo", texto: "data: 2026-10-11" },
    { tipo: "paragrafo", texto: "autor: Autor histórico sintético" },
    { tipo: "titulo", nivel: 3, texto: "epis" },
    { tipo: "paragrafo", texto: "Capacete" },
  ].map((block, index) => ({ id: `source-${index + 1}`, ...block })),
};
const input = {
  content,
  revisionContent: content,
  snapshot,
  expectedRevisionId: "revision-one",
  actualRevisionId: "revision-one",
};
describe("leitura tipada somente do snapshot legado comprovado", () => {
  it("rótulos técnicos usam termos explícitos sem reescrever chaves desconhecidas", () => {
    expect(nrLabel("condicao_espaco")).toBe("Condição do espaço");
    expect(nrLabel("responsavel_declarado")).toBe("Responsável declarado");
    expect(nrLabel("inspecao_em")).toBe("Data da inspeção");
    expect(nrLabel("campo_futuro_de_origem")).toBe("campo_futuro_de_origem");
  });
  it("apresenta a cota de 6 m como Altura (m), sem mudar o rótulo da classificação altura", () => {
    expect(legacySnapshotFieldLabel("geometria", "altura")).toBe("Altura (m)");
    expect(legacySnapshotFieldLabel("geometria", "diametro")).toBe("Diâmetro (m)");
    expect(legacySnapshotFieldLabel("identificacao", "altura")).toBeNull();
    expect(nrLabel("altura")).toBe("Trabalho em altura");
    const geometry = { geometria: { altura: 6 }, identificacao: { tipo: "altura" } };
    const specimen = {
      schema_version: 1,
      blocos: [
        { id: "source-1", tipo: "titulo", nivel: 2, texto: "Snapshot documental da origem" },
        { id: "source-2", tipo: "titulo", nivel: 3, texto: "geometria" },
        { id: "source-3", tipo: "paragrafo", texto: "altura: 6" },
        { id: "source-4", tipo: "titulo", nivel: 3, texto: "identificacao" },
        { id: "source-5", tipo: "paragrafo", texto: "tipo: altura" },
      ],
    };
    expect(
      proveLegacySnapshotContent({
        ...input,
        content: specimen,
        revisionContent: specimen,
        snapshot: geometry,
      })?.snapshot,
    ).toEqual(geometry);
  });
  it("prova o conteúdo inteiro e conserva fotos, desconhecidos e valores sem mutação", () => {
    const before = structuredClone(input);
    const projection = proveLegacySnapshotContent(input);
    expect(projection?.snapshot).toEqual(snapshot);
    expect(projection?.version).toBe("nr-legacy-snapshot-reader-1");
    expect(input).toEqual(before);
  });
  it("aceita a ordem de propriedades JSONB sem confundir a ordem dos registros em array", () => {
    const reordered = {
      epis: snapshot.epis,
      fotos: [
        {
          autor: snapshot.fotos[0]!.autor,
          data: snapshot.fotos[0]!.data,
          legenda: snapshot.fotos[0]!.legenda,
          miniatura: snapshot.fotos[0]!.miniatura,
          arquivo: snapshot.fotos[0]!.arquivo,
        },
      ],
      cadastro: {
        campo_futuro: snapshot.cadastro.campo_futuro,
        energias: snapshot.cadastro.energias,
        responsavel_documentacao: snapshot.cadastro.responsavel_documentacao,
      },
    };
    expect(proveLegacySnapshotContent({ ...input, snapshot: reordered })?.snapshot).toEqual(
      reordered,
    );
    expect(
      proveLegacySnapshotContent({ ...input, snapshot: { ...snapshot, epis: ["Outro EPI"] } }),
    ).toBeNull();
  });
  it("não reinterpreta DOCX ou conteúdo manual com título parecido", () => {
    expect(proveLegacySnapshotContent({ ...input, converted: true })).toBeNull();
    const manual = {
      ...content,
      blocos: content.blocos.map((block) => ({ ...block, id: `docx-${block.id}` })),
    };
    expect(hasLegacySnapshotSignature(manual)).toBe(false);
    expect(
      proveLegacySnapshotContent({ ...input, content: manual, revisionContent: manual }),
    ).toBeNull();
  });
  it("nega parágrafo manual divergente mesmo mantendo ids e assinatura de importação", () => {
    const edited = structuredClone(content);
    edited.blocos[2]!.texto = "responsavel_documentacao: Edição posterior";
    expect(hasLegacySnapshotSignature(edited)).toBe(true);
    expect(
      proveLegacySnapshotContent({ ...input, content: edited, revisionContent: edited }),
    ).toBeNull();
  });
  it("nega revisão diferente, snapshot ausente e conteúdo diferente do detalhe autorizado", () => {
    expect(proveLegacySnapshotContent({ ...input, actualRevisionId: "other-revision" })).toBeNull();
    expect(proveLegacySnapshotContent({ ...input, snapshot: null })).toBeNull();
    expect(
      proveLegacySnapshotContent({ ...input, revisionContent: { schema_version: 1, blocos: [] } }),
    ).toBeNull();
  });
  it("nega campo omitido, nível de título alterado e registro de foto reordenado sem correspondência", () => {
    expect(
      proveLegacySnapshotContent({
        ...input,
        snapshot: {
          ...snapshot,
          cadastro: { ...snapshot.cadastro, novo_campo: "não consta do conteúdo" },
        },
      }),
    ).toBeNull();
    const edited = structuredClone(content);
    edited.blocos[1]!.nivel = 6;
    expect(
      proveLegacySnapshotContent({ ...input, content: edited, revisionContent: edited }),
    ).toBeNull();
    expect(
      proveLegacySnapshotContent({
        ...input,
        snapshot: { ...snapshot, fotos: [...snapshot.fotos, { arquivo: "fotos/outro.jpg" }] },
      }),
    ).toBeNull();
  });
});
