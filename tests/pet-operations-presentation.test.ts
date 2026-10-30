import { describe, expect, it } from "vitest";
import {
  petAssessmentAgents,
  petCurrentApprovedModel,
  petExitSignaturePending,
  petFinalSnapshot,
  petHistoricalName,
  petStructuredReadings,
} from "../src/features/pet/operation-presentation";
import type { PetDetalhe, PetOpcoes } from "../src/features/pet/ui-types";

function detail(overrides: Partial<PetDetalhe> = {}): PetDetalhe {
  return {
    pet: {
      id: "pet",
      numero: "PET-1",
      os_id: "os",
      unidade_id: "unit",
      espaco_id: "space",
      atividade: "Inspeção",
      estado_documental: "encerramento_pendente",
      condicao_operacional: "terminada",
      termino_previsto: "2026-10-30T20:00:00Z",
      emitida_em: "2026-10-30T10:00:00Z",
      encerrada_em: null,
      version: 5,
      timezone: "America/Sao_Paulo",
      modelo_versao_id: "model",
    },
    os: {
      id: "os",
      numero: "OS-1",
      titulo: "Inspeção",
      escopo: "Inspeção",
      cliente_id: "client",
      unidade_id: "unit",
      estado: "aberta",
      version: 1,
    },
    espaco: { id: "space", nome: "Espaço" },
    revisoes: [],
    participantes: [],
    respostas: [],
    avaliacoes: [],
    leituras: [],
    presencas: [],
    intervalos: [],
    eventos: [],
    assinaturas: [],
    documentos: [],
    pendencias: [],
    metricas: {},
    permissoes: {},
    ...overrides,
  };
}
const options: PetOpcoes = {
  clientes: [],
  unidades: [],
  pessoas: [{ id: "worker", nome: "Nome atual do cadastro" }],
  espacos: [],
  modelos: [],
  ordens: [],
  integracao_assinatura: { configurada: false },
};

describe("PET: leituras do procedimento aprovado", () => {
  it("usa os agentes e unidades do modelo sem acrescentar uma lista universal", () => {
    expect(
      petAssessmentAgents({
        id: "model",
        procedimento: {
          agentes: [
            { agente: "CO2", unidade: "%vol" },
            { agente: "Benzeno", unidade: "ppm" },
          ],
        },
      }),
    ).toEqual([
      { agente: "CO2", unidade: "%vol" },
      { agente: "Benzeno", unidade: "ppm" },
    ]);
    expect(petAssessmentAgents(null)).toEqual([]);
    expect(
      petAssessmentAgents({ id: "model", procedimento: { agentes: [{ agente: "O2" }] } }),
    ).toEqual([]);
  });
  it("não apresenta um modelo em rascunho como aprovado", () => {
    const draft = {
      id: "model",
      estado: "rascunho",
      procedimento: { agentes: [{ agente: "CO2", unidade: "%vol" }] },
    };
    expect(petCurrentApprovedModel(detail(), { ...options, modelos: [draft] })).toBeNull();
    expect(
      petCurrentApprovedModel(detail(), { ...options, modelos: [{ ...draft, estado: "aprovado" }] })
        ?.id,
    ).toBe("model");
  });
  it("preserva zero, vírgula, origem e unidades sem aceitar leituras incompletas", () => {
    expect(
      petStructuredReadings(
        [
          { agente: "CO2", unidade: "%vol", valor: "0" },
          { agente: "Benzeno", unidade: "ppm", valor: "0,25" },
        ],
        "registro_instrumento",
      ),
    ).toEqual([
      { agente: "CO2", unidade: "%vol", valor: 0, origem: "registro_instrumento" },
      { agente: "Benzeno", unidade: "ppm", valor: 0.25, origem: "registro_instrumento" },
    ]);
    expect(() =>
      petStructuredReadings([{ agente: "CO2", unidade: "%vol", valor: "" }], "leitura_direta"),
    ).toThrow();
    expect(() =>
      petStructuredReadings([{ agente: "CO2", unidade: "%vol", valor: "1," }], "leitura_direta"),
    ).toThrow();
    expect(() =>
      petStructuredReadings(
        [
          { agente: "CO2", unidade: "%vol", valor: "0" },
          { agente: "CO2", unidade: "ppm", valor: "2" },
        ],
        "leitura_direta",
      ),
    ).toThrow("repetido");
  });
});

describe("PET: consulta do encerramento persistido", () => {
  it("hidrata a revisão final atual sem alterar condição ou motivo", () => {
    const original = detail({
      pet: { ...detail().pet, revisao_atual_id: "final" },
      revisoes: [
        {
          id: "conference",
          finalidade: "conferencia",
          versao: 1,
          conteudo: { atividade: "Inspeção" },
        },
        {
          id: "final",
          finalidade: "encerramento",
          versao: 3,
          sha256: "hash-final",
          conteudo: {
            condicao_final: "Espaço deixado isolado.\nAcesso sinalizado.",
            motivo: "Inspeção concluída.",
            termino_operacional_em: "2026-10-30T15:00:00Z",
          },
        },
      ],
    });
    const before = JSON.stringify(original);
    expect(petFinalSnapshot(original)).toEqual({
      id: "final",
      versao: 3,
      sha256: "hash-final",
      condicaoFinal: "Espaço deixado isolado.\nAcesso sinalizado.",
      motivo: "Inspeção concluída.",
      terminoOperacional: "2026-10-30T15:00:00Z",
    });
    expect(JSON.stringify(original)).toBe(before);
    expect(petFinalSnapshot(original)).toEqual(petFinalSnapshot(original));
  });
  it("não inventa condição final nem trata uma conferência como encerramento", () => {
    expect(
      petFinalSnapshot(
        detail({
          revisoes: [
            { id: "conference", finalidade: "conferencia", conteudo: { atividade: "Inspeção" } },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      petFinalSnapshot(
        detail({
          revisoes: [{ id: "final", finalidade: "encerramento", conteudo: { motivo: "Término" } }],
        }),
      ),
    ).toBeNull();
  });
  it("mantém o nome histórico e a pendência individual de assinatura após a saída", () => {
    const record = detail({
      participantes: [
        {
          id: "participant",
          pessoa_id: "worker",
          nome_snapshot: "Nome na PET emitida",
          funcao: "trabalhador",
          classificacao: "interno",
        },
      ],
      presencas: [
        {
          id: "exit",
          pessoa_id: "worker",
          tipo: "saida",
          momento: "2026-10-30T15:00:00Z",
          assinatura_pendente: true,
        },
        {
          id: "entry",
          pessoa_id: "worker",
          tipo: "entrada",
          momento: "2026-10-30T13:00:00Z",
          assinatura_pendente: false,
        },
      ],
    });
    expect(petHistoricalName(record, options, "worker")).toBe("Nome na PET emitida");
    expect(petExitSignaturePending(record).map((event) => event.id)).toEqual(["exit"]);
  });
});
