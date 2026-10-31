import { describe, expect, it } from "vitest";
import { projectConvertedDocxImages } from "../src/features/nr/docx-image-projection";
import type { NrRecord } from "../src/features/nr/domain";
import type { NativeContent } from "../src/features/nr/native-content";
const originalHash = "a".repeat(64),
  imageHash = "b".repeat(64);
const row: NrRecord = {
  id: "doc-current",
  organization_id: "org",
  cliente_id: "client",
  unidade_id: "unit",
  local_id: "place",
  normas: ["NR33"],
  titulo: "Cópia sintética",
  estado: "rascunho",
  version: 3,
  created_at: "2026-10-30",
  updated_at: "2026-10-30",
  arquivado_em: null,
  descricao: "",
  revisao_atual_id: "revision-current",
  dados: { conversao: { original_arquivo_id: "original", original_sha256: originalHash } },
};
const value: NativeContent = {
  schema_version: 1,
  blocos: [
    { id: "docx-1", tipo: "tabela", linhas: [["FOTOS", ""]] },
    { id: "docx-2", tipo: "imagem", arquivo_id: "image", legenda: "word/media/image1.jpeg" },
  ],
};
const asset = {
  arquivo_id: "image",
  chave_ooxml: "word/media/image1.jpeg",
  sha256: imageHash,
  mime: "image/jpeg",
  tamanho: 123,
};
const revision = {
  id: row.revisao_atual_id,
  documento_id: row.id,
  conteudo: value,
  snapshot: {
    tipo: "derivado_docx_editavel",
    arquivo_original_id: "original",
    source_sha256: originalHash,
    contexto: { cliente_id: "client", unidade_id: "unit" },
    assets: [asset],
  },
};
const file = {
  id: "image",
  organization_id: "org",
  cliente_id: "client",
  unidade_id: "unit",
  estado: "vinculado",
  bytes_verificados: true,
  sha256: imageHash,
  mime: "image/jpeg",
  tamanho: 123,
  contextos: [
    {
      organization_id: "org",
      cliente_id: "client",
      unidade_id: "unit",
      documento_id: row.id,
      revisao_id: row.revisao_atual_id,
      local_id: row.local_id,
      evidencia: {
        arquivo_original_id: "original",
        source_sha256: originalHash,
        chave_ooxml: "word/media/image1.jpeg",
        image_sha256: imageHash,
      },
    },
  ],
};
const input = { row, value, revision, files: [file] };
describe("galeria de imagens DOCX da revisão comprovada", () => {
  it("torna o bloco já preservado acessível sem preencher uma célula por nome e sem mutar conteúdo", () => {
    const before = structuredClone(input);
    const result = projectConvertedDocxImages(input);
    expect(result.eligible).toBe(true);
    expect(result.photos).toMatchObject([
      {
        arquivo_id: "image",
        legenda: "Imagem 1 extraída do DOCX",
        arquivo: "word/media/image1.jpeg",
        categoria: "Imagem do DOCX · revisão desta cópia",
      },
    ]);
    expect(result.projectedBlockIds).toEqual(["docx-2"]);
    expect(value.blocos[0]?.linhas).toEqual([["FOTOS", ""]]);
    expect(input).toEqual(before);
  });
  it("não usa imagem de outro documento, revisão, local ou organização mesmo com nome/hash iguais", () => {
    for (const patch of [
      { documento_id: "other-document" },
      { revisao_id: "other-revision" },
      { local_id: "other-place" },
    ])
      expect(
        projectConvertedDocxImages({
          ...input,
          files: [{ ...file, contextos: [{ ...file.contextos[0], ...patch }] }],
        }).photos,
      ).toEqual([]);
    expect(
      projectConvertedDocxImages({ ...input, files: [{ ...file, organization_id: "other-org" }] })
        .photos,
    ).toEqual([]);
  });
  it("aceita o mesmo físico com primário em outra unidade somente por um secundário completo autorizado", () => {
    const shared = { ...file, cliente_id: "other-client", unidade_id: "other-unit" };
    expect(projectConvertedDocxImages({ ...input, files: [shared] }).photos).toHaveLength(1);
    expect(
      projectConvertedDocxImages({ ...input, files: [{ ...shared, contextos: [] }] }).photos,
    ).toEqual([]);
  });
  it("não combina cliente/unidade de uma relação com documento/revisão de outra", () => {
    const crossed = {
      ...file,
      cliente_id: "other-client",
      unidade_id: "other-unit",
      contextos: [
        { ...file.contextos[0], cliente_id: "other-client", unidade_id: "other-unit" },
        { ...file.contextos[0], documento_id: "other-document", revisao_id: "other-revision" },
      ],
    };
    expect(projectConvertedDocxImages({ ...input, files: [crossed] }).photos).toEqual([]);
  });
  it("exige a identidade original e extração exata; basename ou metadados de outro DOCX não bastam", () => {
    for (const patch of [
      { arquivo_original_id: "other-original" },
      { source_sha256: "c".repeat(64) },
      { chave_ooxml: "word/media/other.jpeg" },
      { image_sha256: "c".repeat(64) },
    ])
      expect(
        projectConvertedDocxImages({
          ...input,
          files: [
            {
              ...file,
              contextos: [
                { ...file.contextos[0], evidencia: { ...file.contextos[0]!.evidencia, ...patch } },
              ],
            },
          ],
        }).photos,
      ).toEqual([]);
  });
  it("exige bytes confirmados e hash/MIME/tamanho coincidentes com o manifesto da revisão", () => {
    for (const patch of [
      { bytes_verificados: false },
      { estado: "preparado" },
      { sha256: "c".repeat(64) },
      { mime: "image/png" },
      { tamanho: 124 },
    ])
      expect(
        projectConvertedDocxImages({ ...input, files: [{ ...file, ...patch }] }).photos,
      ).toEqual([]);
  });
  it("não reinterpreta snapshot de outra revisão, original ou edição diferente do conteúdo consultado", () => {
    for (const patch of [
      { id: "other-revision" },
      { documento_id: "other-document" },
      { conteudo: { schema_version: 1, blocos: [] } },
    ])
      expect(
        projectConvertedDocxImages({ ...input, revision: { ...revision, ...patch } }).eligible,
      ).toBe(false);
    expect(
      projectConvertedDocxImages({
        ...input,
        revision: {
          ...revision,
          snapshot: { ...revision.snapshot, arquivo_original_id: "other-original" },
        },
      }).eligible,
    ).toBe(false);
  });
  it("preserva cada ocorrência e legenda; não ressuscita imagens removidas numa edição Nexus", () => {
    const repeated: NativeContent = {
      ...value,
      blocos: [
        ...value.blocos,
        {
          id: "later-occurrence",
          tipo: "imagem",
          arquivo_id: "image",
          legenda: "Legenda desta ocorrência",
        },
      ],
    };
    const result = projectConvertedDocxImages({
      ...input,
      value: repeated,
      revision: { ...revision, conteudo: repeated },
    });
    expect(result.photos).toHaveLength(2);
    expect(result.photos[1]?.["legenda"]).toBe("Legenda desta ocorrência");
    const edited = { ...value, blocos: [value.blocos[0]!] };
    expect(
      projectConvertedDocxImages({
        ...input,
        value: edited,
        revision: { ...revision, conteudo: edited },
      }).photos,
    ).toEqual([]);
  });
  it("não escolhe a primeira parte OOXML quando partes diferentes compartilham o mesmo físico", () => {
    const ambiguous = {
      ...revision,
      snapshot: {
        ...revision.snapshot,
        assets: [asset, { ...asset, chave_ooxml: "word/media/image2.jpeg" }],
      },
    };
    const result = projectConvertedDocxImages({ ...input, revision: ambiguous });
    expect(result.photos).toEqual([]);
    expect(result.projectedBlockIds).toEqual([]);
    expect(result.ambiguousBlockIds).toEqual(["docx-2"]);
    // A legenda que contém um caminho não é usada como prova da parte.
    expect(value.blocos[1]?.legenda).toBe("word/media/image1.jpeg");
  });
  it("usa a chave estruturada da ocorrência somente se retida na revisão e no bloco atual", () => {
    const keyed: NativeContent = {
      ...value,
      blocos: [
        value.blocos[0]!,
        { ...value.blocos[1]!, chave: "word/media/image2.jpeg", legenda: "Legenda livre" },
      ],
    };
    const retained = {
      ...revision,
      conteudo: keyed,
      snapshot: {
        ...revision.snapshot,
        conteudo: keyed,
        assets: [asset, { ...asset, chave_ooxml: "word/media/image2.jpeg" }],
      },
    };
    const proven = {
      ...file,
      contextos: [
        {
          ...file.contextos[0],
          evidencia: { ...file.contextos[0]!.evidencia, chave_ooxml: "word/media/image2.jpeg" },
        },
      ],
    };
    expect(
      projectConvertedDocxImages({ ...input, value: keyed, revision: retained, files: [proven] })
        .photos[0]?.["arquivo"],
    ).toBe("word/media/image2.jpeg");
    const changed = {
      ...keyed,
      blocos: [keyed.blocos[0]!, { ...keyed.blocos[1]!, chave: "word/media/image1.jpeg" }],
    };
    expect(
      projectConvertedDocxImages({
        ...input,
        value: changed,
        revision: { ...retained, conteudo: changed },
        files: [proven],
      }).photos,
    ).toEqual([]);
  });
});
