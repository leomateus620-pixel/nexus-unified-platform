import { describe, expect, it } from "vitest";
import { nrPainelSchema } from "../src/features/nr/schemas";
const id = "10000000-0000-4000-8000-000000000001",
  client = "10000000-0000-4000-8000-000000000002",
  unit = "10000000-0000-4000-8000-000000000003";
const panel = {
  locais: 1,
  documentos: 4,
  documentos_logicos: 4,
  documentos_origem: 1,
  copias_editaveis: 3,
  copias_correspondencia_pendente: 1,
  documentos_principais: 2,
  pendencias_abertas: 1,
  levantamentos: 0,
  em_revisao: 1,
  pendencias_prioritarias: [
    {
      id,
      titulo: "Pendência do cenário",
      estado: "aberta",
      normas: ["NR33", "NR35"],
      cliente_id: client,
      unidade_id: unit,
      local_id: null,
      criticidade: "alta",
    },
  ],
  documentos_revisao: [
    {
      id,
      titulo: "Documento do cenário",
      estado: "em_revisao",
      normas: ["NR33"],
      cliente_id: client,
      unidade_id: unit,
      local_id: null,
    },
  ],
};
describe("contrato leve do Painel NR", () => {
  it("preserva normas e vínculos sem exigir snapshots ou um NrRecord completo", () => {
    const parsed = nrPainelSchema.parse(panel);
    expect(parsed.pendencias_prioritarias[0]?.normas).toEqual(["NR33", "NR35"]);
    expect(parsed.pendencias_prioritarias[0]?.cliente_id).toBe(client);
    expect(parsed.documentos_revisao[0]?.unidade_id).toBe(unit);
    expect(parsed.copias_correspondencia_pendente).toBe(1);
    expect(parsed.pendencias_prioritarias[0]).not.toHaveProperty("dados");
    expect(parsed.pendencias_prioritarias[0]).not.toHaveProperty("version");
  });
  it("não inventa escopo para projeção antiga nem aceita norma desconhecida", () => {
    const { normas: _normas, ...legacy } = panel.pendencias_prioritarias[0]!;
    expect(
      nrPainelSchema.parse({ ...panel, pendencias_prioritarias: [legacy] })
        .pendencias_prioritarias[0]?.normas,
    ).toBeUndefined();
    expect(
      nrPainelSchema.safeParse({
        ...panel,
        pendencias_prioritarias: [{ ...legacy, normas: ["NR-invalida"] }],
      }).success,
    ).toBe(false);
  });
});
