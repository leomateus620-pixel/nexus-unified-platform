import { describe, expect, it } from "vitest";
import {
  conteudoNrSchema,
  nrConsultaSchema,
  nrExecutarSchema,
  nrJsonSchema,
} from "../src/features/nr/schemas";
const org = "10000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000002";
const cmd = {
  organization_id: org,
  norma: "NR33",
  recurso: "locais",
  comando: "salvar",
  chave: "idempotencia-isolada",
  dados: { titulo: "Local do cenário", tag: "13A 61 EFGHIJ" },
};
describe("NR: fronteira validada de comandos", () => {
  it("preserva TAG com zeros/espaços e bloqueia transição de estado no salvar", () => {
    expect(nrExecutarSchema.parse(cmd).dados["tag"]).toBe("13A 61 EFGHIJ");
    expect(
      nrExecutarSchema.safeParse({ ...cmd, dados: { ...cmd.dados, estado: "emitido" } }).success,
    ).toBe(false);
    expect(
      nrExecutarSchema.safeParse({ ...cmd, dados: { ...cmd.dados, organization_id: org } }).success,
    ).toBe(false);
  });
  it("exige versão esperada em registro existente e limita paginação/contexto", () => {
    expect(nrExecutarSchema.safeParse({ ...cmd, id }).success).toBe(false);
    expect(nrExecutarSchema.safeParse({ ...cmd, id, expected_version: 2 }).success).toBe(true);
    expect(
      nrConsultaSchema.safeParse({
        organization_id: org,
        norma: "NR33",
        recurso: "locais",
        pagina: -1,
      }).success,
    ).toBe(false);
    expect(
      nrConsultaSchema.safeParse({
        organization_id: org,
        norma: "NR35",
        recurso: "locais",
        limite: 101,
      }).success,
    ).toBe(false);
    expect(
      nrConsultaSchema.safeParse({
        organization_id: org,
        norma: "NR35",
        recurso: "locais",
        operacao: "detalhe",
      }).success,
    ).toBe(false);
  });
  it("não aceita campos de outro recurso nem data inexistente", () => {
    expect(
      nrExecutarSchema.safeParse({ ...cmd, dados: { titulo: "Local", prazo: "2026-10-30" } })
        .success,
    ).toBe(false);
    expect(
      nrExecutarSchema.safeParse({
        ...cmd,
        recurso: "pendencias",
        dados: { titulo: "Pendência", prazo: "2026-02-31" },
      }).success,
    ).toBe(false);
    expect(
      nrExecutarSchema.safeParse({
        ...cmd,
        recurso: "pendencias",
        dados: { titulo: "Pendência", prazo: "2028-02-29" },
      }).success,
    ).toBe(true);
  });
  it("conteúdo é estruturado, com tabelas/imagens por vínculo e sem HTML ativo", () => {
    expect(
      conteudoNrSchema.safeParse({
        schema_version: 1,
        blocos: [
          {
            id: "b1",
            tipo: "tabela",
            linhas: [
              ["Nome", "Valor"],
              ["A", "1"],
            ],
          },
          { id: "b2", tipo: "imagem", arquivo_id: id, legenda: "Evidência" },
        ],
      }).success,
    ).toBe(true);
    expect(
      conteudoNrSchema.safeParse({
        schema_version: 1,
        blocos: [{ id: "b1", tipo: "imagem", src: "https://externo.invalid/executar.html" }],
      }).success,
    ).toBe(false);
    expect(
      conteudoNrSchema.safeParse({
        schema_version: 1,
        blocos: [
          { id: "campo", tipo: "campo", chave: "local.volume", modo: "livre", valor_snapshot: 123 },
        ],
      }).success,
    ).toBe(false);
    expect(
      conteudoNrSchema.safeParse({
        schema_version: 1,
        blocos: [
          {
            id: "campo",
            tipo: "campo",
            chave: "local.volume",
            modo: "livre",
            valor_snapshot: 123,
            motivo_substituicao: "Correção documentada",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      conteudoNrSchema.safeParse({
        schema_version: 1,
        blocos: [{ id: "b1", tipo: "html", texto: "<script>" }],
      }).success,
    ).toBe(false);
    expect(
      conteudoNrSchema.safeParse({
        schema_version: 1,
        blocos: [
          { id: "b1", tipo: "paragrafo" },
          { id: "b1", tipo: "titulo" },
        ],
      }).success,
    ).toBe(false);
  });
  it("limita conteúdo antes da validação recursiva", () => {
    let deep: unknown = null;
    for (let i = 0; i < 200; i++) deep = { filho: deep };
    expect(nrJsonSchema.safeParse(deep).success).toBe(false);
    expect(nrJsonSchema.safeParse({ texto: "x".repeat(2_000_001) }).success).toBe(false);
  });
});
