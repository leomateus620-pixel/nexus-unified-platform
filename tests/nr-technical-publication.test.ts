import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  nrOfficialSourcePages,
  nrOfficialSourceUrl,
  nrTechnicalPublicationInput,
  nrTechnicalContextInput,
  nrTechnicalContextOutput,
} from "../src/features/nr/technical-publication.schemas";

const org = "00000000-0000-4000-8000-000000000001",
  model = "00000000-0000-4000-8000-000000000002",
  key = "00000000-0000-4000-8000-000000000003",
  file = "00000000-0000-4000-8000-000000000004";
const source = () => ({
  natureza: "oficial" as const,
  normas: ["NR33" as const],
  titulo: "Fonte sintética para teste de contrato",
  versao: "Versão consultada de teste",
  data_fonte: "2026-10-11",
  consultado_em: "2026-10-28",
  confronto: "Confronto sintético que identifica o texto, o escopo e as limitações da referência.",
  url: nrOfficialSourcePages.NR33,
});
const command = () => ({
  organization_id: org,
  norma: "NR33" as const,
  modelo_id: model,
  expected_version: 3,
  chave: key,
  evidencia: {
    motivo: "Revisão sintética de contrato",
    escopo: "Escopo sintético com restrições explícitas",
    excecoes: "Exceções descritas para o teste",
    confrontado_em: "2026-10-30",
    declaracao_revisao: true as const,
    fontes: [source()],
  },
});

describe("publicação técnica interna NR", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  it("aceita declaração completa com versão esperada e chave idempotente", () => {
    const parsed = nrTechnicalPublicationInput.parse(command());
    expect(parsed.expected_version).toBe(3);
    expect(parsed.chave).toBe(key);
    expect(parsed.evidencia.fontes).toHaveLength(1);
  });
  it("reconhece somente páginas/PDF oficiais da norma correspondente", () => {
    const base =
      "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/";
    expect(nrOfficialSourceUrl(nrOfficialSourcePages.NR33, "NR33")).toBe(true);
    expect(nrOfficialSourceUrl(nrOfficialSourcePages.NR35, "NR35")).toBe(true);
    expect(
      nrOfficialSourceUrl(`${base}arquivos/normas-regulamentadoras/nr-33-atualizada.pdf`, "NR33"),
    ).toBe(true);
    expect(
      nrOfficialSourceUrl(
        `${base}normas-regulamentadora/normas-regulamentadoras-vigentes/nr35-atualizada.pdf`,
        "NR35",
      ),
    ).toBe(true);
    for (const url of [
      nrOfficialSourcePages.NR35,
      nrOfficialSourcePages.NR33.replace("https:", "http:"),
      nrOfficialSourcePages.NR33.replace("www.gov.br", "www.gov.br.example.invalid"),
      nrOfficialSourcePages.NR33.replace("www.gov.br", "user:password@www.gov.br"),
      `${nrOfficialSourcePages.NR33}?token=temporary`,
      `${nrOfficialSourcePages.NR33}#fragment`,
      `${base}arquivos/normas-regulamentadoras/other-document.pdf`,
      `${base}arquivos/normas-regulamentadoras/nr-33.pdf/extra`,
      "not a URL",
    ])
      expect(nrOfficialSourceUrl(url, "NR33")).toBe(false);
  });
  it("não atribui fonte NR33 à NR35 ou às duas normas por declaração", () => {
    const input = command();
    expect(nrTechnicalPublicationInput.safeParse({ ...input, norma: "NR35" }).success).toBe(false);
    for (const normas of [
      ["NR33", "NR35"],
      ["NR33", "NR33"],
    ])
      expect(
        nrTechnicalPublicationInput.safeParse({
          ...input,
          evidencia: { ...input.evidencia, fontes: [{ ...source(), normas }] },
        }).success,
      ).toBe(false);
  });
  it("exige cronologia real e rejeita datas impossíveis ou futuras", () => {
    const input = command();
    for (const patch of [
      { data_fonte: "2026-02-30" },
      { data_fonte: "2026-10-29" },
      { consultado_em: "2026-10-31" },
      { data_fonte: "not a date" },
    ])
      expect(
        nrTechnicalPublicationInput.safeParse({
          ...input,
          evidencia: { ...input.evidencia, fontes: [{ ...source(), ...patch }] },
        }).success,
      ).toBe(false);
    expect(
      nrTechnicalPublicationInput.safeParse({
        ...input,
        evidencia: { ...input.evidencia, confrontado_em: "2026-10-31" },
      }).success,
    ).toBe(false);
  });
  it("licenciada exige arquivo e direito de uso, mantendo a fonte oficial obrigatória", () => {
    const input = command(),
      licensed = {
        ...source(),
        natureza: "licenciada",
        arquivo_id: file,
        licenca_referencia: "Licença sintética identificada exclusivamente para teste de validação",
        licenca_confirmada: true,
      };
    expect(
      nrTechnicalPublicationInput.safeParse({
        ...input,
        evidencia: { ...input.evidencia, fontes: [source(), licensed] },
      }).success,
    ).toBe(true);
    expect(
      nrTechnicalPublicationInput.safeParse({
        ...input,
        evidencia: { ...input.evidencia, fontes: [licensed] },
      }).success,
    ).toBe(false);
    for (const patch of [
      { arquivo_id: undefined },
      { arquivo_id: "fake-file" },
      { licenca_referencia: undefined },
      { licenca_confirmada: false },
      { licenca_referencia: "curta" },
    ])
      expect(
        nrTechnicalPublicationInput.safeParse({
          ...input,
          evidencia: { ...input.evidencia, fontes: [source(), { ...licensed, ...patch }] },
        }).success,
      ).toBe(false);
  });
  it("URL inválida ou temporária produz erro de validação sem exceção inesperada", () => {
    const input = command();
    for (const url of [
      "invalid",
      "https://example.invalid/nr33",
      `${nrOfficialSourcePages.NR33}?access_token=temporary`,
    ])
      expect(
        nrTechnicalPublicationInput.safeParse({
          ...input,
          evidencia: { ...input.evidencia, fontes: [{ ...source(), url }] },
        }).success,
      ).toBe(false);
  });
  it("não concede poderes profissionais, emissão ou publicação incompleta", () => {
    const input = command();
    for (const patch of [{ profissional_id: file }, { comando: "emitir" }, { expected_version: 0 }])
      expect(nrTechnicalPublicationInput.safeParse({ ...input, ...patch }).success).toBe(false);
    for (const patch of [
      { motivo: " " },
      { escopo: "curto" },
      { excecoes: "NA" },
      { declaracao_revisao: false },
      { fontes: [] },
      { fontes: Array.from({ length: 21 }, source) },
    ])
      expect(
        nrTechnicalPublicationInput.safeParse({
          ...input,
          evidencia: { ...input.evidencia, ...patch },
        }).success,
      ).toBe(false);
  });
  it("consulta usa vínculo profissional do servidor e não um papel enviado pelo cliente", () => {
    const input = { organization_id: org, norma: "NR33", modelo_id: model };
    expect(nrTechnicalContextInput.safeParse(input).success).toBe(true);
    expect(nrTechnicalContextInput.safeParse({ ...input, role: "admin" }).success).toBe(false);
    expect(
      nrTechnicalContextOutput.parse({
        profissional: null,
        pode_publicar: false,
        bloqueio: "Vínculo profissional obrigatório.",
        versoes: [],
        fontes: [],
      }).pode_publicar,
    ).toBe(false);
  });
  it("limita a declaração em bytes UTF-8, inclusive quando os campos cabem em caracteres", () => {
    const input = command();
    const result = nrTechnicalPublicationInput.safeParse({
      ...input,
      evidencia: {
        ...input.evidencia,
        fontes: Array.from({ length: 11 }, () => ({ ...source(), confronto: "é".repeat(10000) })),
      },
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.some((issue) => issue.message.includes("200.000 bytes"))).toBe(
        true,
      );
  });
});
