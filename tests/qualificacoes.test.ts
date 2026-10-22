import { describe, expect, it } from "vitest";
import {
  acessoQualificacaoNegado,
  proximasDecisoes,
  QUALIFICACAO_ACESSO_INDISPONIVEL,
  situacaoNaData,
} from "../src/features/pessoas-competencias/qualificacoes/domain";
import {
  salvarCompetenciaInput,
  salvarQualificacaoInput,
  transicionarQualificacaoInput,
} from "../src/features/pessoas-competencias/qualificacoes/schemas";
import { qualificacoesKeys } from "../src/features/pessoas-competencias/qualificacoes/queries";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dados = {
  pessoa_id: id(1),
  competencia_id: id(2),
  emissor: "Instituição",
  conclusao: "2024-02-29",
  validade: "2026-10-22",
};
describe("Competências e qualificações: contratos sem critério normativo embutido", () => {
  it("exige escolhas explícitas de requisitos", () => {
    expect(
      salvarCompetenciaInput.safeParse({
        organization_id: id(1),
        chave: id(3),
        dados: { nome: "Técnica" },
      }).success,
    ).toBe(false);
    expect(
      salvarCompetenciaInput.parse({
        organization_id: id(1),
        chave: id(3),
        dados: { nome: "Técnica", exige_evidencia: false, exige_validade: false },
      }).dados.exige_validade,
    ).toBe(false);
  });
  it("preserva data civil bissexta e rejeita data inexistente", () => {
    const input = { organization_id: id(1), chave: id(3), dados };
    expect(salvarQualificacaoInput.parse(input).dados.conclusao).toBe("2024-02-29");
    expect(
      salvarQualificacaoInput.safeParse({ ...input, dados: { ...dados, conclusao: "2025-02-29" } })
        .success,
    ).toBe(false);
  });
  it("rejeita criação arquivada sem impedir arquivamento de registro versionado", () => {
    const input = {
      organization_id: id(1),
      chave: id(3),
      dados: { nome: "Técnica", exige_evidencia: false, exige_validade: false, ativa: false },
    };
    const created = salvarCompetenciaInput.safeParse(input);
    expect(created.success).toBe(false);
    if (!created.success)
      expect(created.error.issues).toContainEqual(
        expect.objectContaining({ path: ["dados", "ativa"] }),
      );
    expect(
      salvarCompetenciaInput.parse({ ...input, id: id(4), expected_version: 2 }).dados.ativa,
    ).toBe(false);
  });
  it("não aceita validade anterior nem edit sem versão", () => {
    expect(
      salvarQualificacaoInput.safeParse({
        organization_id: id(1),
        chave: id(3),
        dados: { ...dados, validade: "2023-01-01" },
      }).success,
    ).toBe(false);
    expect(
      salvarQualificacaoInput.safeParse({ organization_id: id(1), chave: id(3), id: id(4), dados })
        .success,
    ).toBe(false);
  });
  it("devolução e revogação exigem motivo", () => {
    for (const estado of ["enviada", "revogada"])
      expect(
        transicionarQualificacaoInput.safeParse({
          organization_id: id(1),
          chave: id(3),
          id: id(4),
          expected_version: 2,
          estado,
          motivo: "",
        }).success,
      ).toBe(false);
  });
  it("não oferece atalhos nem autovalidação na conferência", () => {
    expect(proximasDecisoes("enviada", true)).toEqual({ em_conferencia: "Iniciar conferência" });
    expect(proximasDecisoes("em_conferencia", false)).toEqual({
      enviada: "Devolver para correção",
    });
    expect(proximasDecisoes("revogada", true)).toEqual({});
  });
  it("validade inclui o dia civil e NULL é neutro", () => {
    expect(situacaoNaData("validada", "2024-02-29", "2026-10-22", "2026-10-22")).toContain(
      "Dentro da validade",
    );
    expect(situacaoNaData("validada", "2024-02-29", "2026-10-22", "2026-10-23")).toContain(
      "encerrada",
    );
    expect(situacaoNaData("validada", "2024-02-29", null, "2026-10-22")).toBe(
      "Sem data de validade cadastrada",
    );
  });
  it("negação usa contrato serializável exato, não uma falha de rede", () => {
    expect(acessoQualificacaoNegado({ message: QUALIFICACAO_ACESSO_INDISPONIVEL })).toBe(true);
    expect(acessoQualificacaoNegado(new Error("Rede indisponível"))).toBe(false);
  });
  it("keys de ficha recebem invalidação canônica de anexos", () => {
    expect(qualificacoesKeys.qualificacao(id(1), id(2)).slice(0, 3)).toEqual([
      "pessoas",
      id(1),
      "qualificacoes",
    ]);
    expect(qualificacoesKeys.competencia(id(1), id(2)).slice(0, 3)).toEqual([
      "pessoas",
      id(1),
      "competencias",
    ]);
  });
});
