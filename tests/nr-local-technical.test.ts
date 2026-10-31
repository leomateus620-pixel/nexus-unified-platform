import { describe, expect, it } from "vitest";
import {
  nrLocalProposalAffects,
  nrLocalProposalChanges,
  patchNrLocalTechnical,
} from "../src/features/nr/local-technical";
describe("edição técnica contextual sem reescrever metadados históricos", () => {
  it("altera somente o campo conhecido, mantém histórico/cálculo/autoria e exige revisão independente", () => {
    const source = {
      geometria: {
        diametro: 2,
        volume: 12.5,
        autor: "Autor histórico de teste",
        data: "2026-10-10",
        validacao: "validada",
        metadado_futuro: { a: 1 },
      },
      historico: [{ texto: "Narrativa preservada" }],
      calculo: { resultado: 12.5 },
      itens: { A: { validacao: "validada" } },
    };
    const before = structuredClone(source);
    const updated = patchNrLocalTechnical(source, ["geometria", "diametro"], 2.8);
    expect(updated["geometria"]).toEqual({ ...source.geometria, diametro: 2.8 });
    expect(updated["historico"]).toEqual(source.historico);
    expect(updated["calculo"]).toEqual(source.calculo);
    expect(updated["revisao_tecnica_nexus"]).toEqual({
      estado: "proposta",
      campos_propostos: ["geometria.diametro"],
      valores_origem: { "geometria.diametro": { presente: true, valor: 2 } },
    });
    expect(source).toEqual(before);
  });
  it("mantém os vínculos de listas e registra os campos propostos sem duplicar o marcador", () => {
    let source: Record<string, unknown> = {
      aberturas: [{ id: "origem-1", modelo: "Tampa", propriedade_futura: true }],
      revisao_tecnica_nexus: { campo_futuro: "preservado" },
    };
    source = patchNrLocalTechnical(source, ["setor"], "Área revisada");
    source = patchNrLocalTechnical(source, ["setor"], "Outra área revisada");
    expect(source["aberturas"]).toEqual([
      { id: "origem-1", modelo: "Tampa", propriedade_futura: true },
    ]);
    expect(source["revisao_tecnica_nexus"]).toEqual({
      campo_futuro: "preservado",
      estado: "proposta",
      campos_propostos: ["setor"],
      valores_origem: { setor: { presente: false } },
    });
  });
  it("não converte estruturas históricas desconhecidas nem fornece edição de narrativas e cálculos", () => {
    expect(() =>
      patchNrLocalTechnical({ geometria: "texto histórico" }, ["geometria", "diametro"], 2),
    ).toThrow("conciliada");
    for (const key of ["historico", "calculo", "calculo_fixo", "levantamento"])
      expect(() => patchNrLocalTechnical({}, [key], "substituir")).toThrow("histórico");
    expect(() => patchNrLocalTechnical({}, ["__proto__", "injected"], true)).toThrow(
      "não suportado",
    );
  });
  it("captura o valor anterior uma vez e não o muda em edições seguintes ou ao modificar um objeto de entrada", () => {
    const original = {
      itens: {
        A: { existencia: "ausente", validacao: "validada" },
        B: { existencia: "presente", validacao: "validada" },
      },
    };
    const originalCopy = structuredClone(original);
    let proposed = patchNrLocalTechnical(original, ["itens"], {
      ...original.itens,
      A: { ...original.itens.A, existencia: "presente" },
    });
    proposed = patchNrLocalTechnical(proposed, ["itens"], {
      ...original.itens,
      A: { ...original.itens.A, existencia: "nao_verificada" },
    });
    expect(nrLocalProposalChanges(proposed)).toMatchObject([
      { path: "itens", before: { presente: true, valor: originalCopy.itens } },
    ]);
    expect(nrLocalProposalAffects(proposed, ["itens", "A"])).toBe(true);
    expect(nrLocalProposalAffects(proposed, ["itens", "B"])).toBe(false);
    original.itens.A.existencia = "valor externo alterado";
    expect(nrLocalProposalChanges(proposed)[0]?.before?.valor).toEqual(originalCopy.itens);
    expect(original.itens.A.validacao).toBe("validada");
  });
  it("preserva marcador e baseline existentes; um marcador antigo sem baseline não fabrica o antes a partir da proposta", () => {
    const original = {
      geometria: {
        diametro: 3,
        autor: "Autor histórico",
        data: "2026-10-10",
        validacao: "validada",
      },
      revisao_tecnica_nexus: {
        estado: "proposta",
        campos_propostos: ["geometria.diametro", "setor"],
        valores_origem: {
          setor: { presente: true, valor: "Setor anterior" },
          propriedade_futura: { valor: "Preservado" },
        },
        evidencia_futura: { fonte: "Mantida" },
      },
    };
    const proposed = patchNrLocalTechnical(original, ["geometria", "diametro"], 4);
    expect(
      nrLocalProposalChanges(proposed).find((change) => change.path === "geometria.diametro")
        ?.before,
    ).toBeNull();
    expect(
      nrLocalProposalChanges(proposed).find((change) => change.path === "setor")?.before,
    ).toEqual({ presente: true, valor: "Setor anterior" });
    expect(proposed["revisao_tecnica_nexus"]).toMatchObject({
      evidencia_futura: { fonte: "Mantida" },
      valores_origem: original.revisao_tecnica_nexus.valores_origem,
    });
    expect(proposed["geometria"]).toEqual({ ...original.geometria, diametro: 4 });
    expect(original.geometria.diametro).toBe(3);
  });
});
