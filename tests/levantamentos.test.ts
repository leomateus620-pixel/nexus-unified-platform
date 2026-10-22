import { describe, expect, it } from "vitest";
import {
  adotarMedidaSchema,
  comandoLevantamentoSchema,
  decimalTextoSchema,
  levantamentoDetalheSchema,
  listarLevantamentosSchema,
  medicaoDadosSchema,
  publicarModeloLevantamentoSchema,
} from "../src/features/levantamentos/schemas";
import {
  compararDecimais,
  medicaoAdotavel,
  pendenciasColeta,
  prepararDuplicacaoPonto,
} from "../src/features/levantamentos/domain";
import type { LevantamentoDetalhe } from "../src/features/levantamentos/types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { organization_id: id(1), chave: id(2), levantamento_id: id(3), revisao_id: id(4) };
function detail(): LevantamentoDetalhe {
  return levantamentoDetalheSchema.parse({
    levantamento: {
      id: id(3),
      organization_id: id(1),
      codigo: "LEV-TEST",
      cliente_id: id(5),
      unidade_id: id(6),
      finalidade: "Coleta em teste isolado",
      responsavel_id: id(7),
      revisao_atual_id: id(4),
      aprovada_id: null,
      version: 1,
    },
    revisao: {
      id: id(4),
      organization_id: id(1),
      levantamento_id: id(3),
      numero: 1,
      estado: "em_coleta",
      inicio_previsto: null,
      fim_previsto: null,
      version: 1,
    },
    revisoes: [
      { id: id(4), numero: 1, estado: "em_coleta", version: 1, created_at: "2026-10-22T12:00:00Z" },
    ],
    pontos: [
      {
        id: id(8),
        organization_id: id(1),
        levantamento_id: id(3),
        revisao_id: id(4),
        codigo: "P01",
        nome: "Ponto teste",
        area: "Área",
        localizacao: "Local",
        tipo_sistema: "",
        observacoes: "",
        exige_foto: false,
        version: 1,
      },
    ],
    medicoes: [
      {
        id: id(9),
        organization_id: id(1),
        levantamento_id: id(3),
        revisao_id: id(4),
        ponto_id: id(8),
        chave: "comprimento",
        grandeza: "comprimento",
        valor: "12.123456",
        unidade: "m",
        precisao: "0.000001",
        metodo: "Instrumento identificado",
        origem: "campo",
        natureza: "medida",
        coletado_em: "2026-10-22T12:00:00Z",
        observacoes: "",
        version: 1,
      },
    ],
    avaliacoes: [],
    arquivos: [],
    adocoes: [],
    modelo: null,
    permissoes: { editar: true, coletar: true, revisar: false, adotar: false, gerir: true },
  });
}
describe("Levantamentos: contratos de coleta e adoção", () => {
  it("preserva decimal textual sem arredondar e rejeita perda de precisão/NaN/float de entrada", () => {
    expect(decimalTextoSchema.parse("999999999999,123456")).toBe("999999999999.123456");
    for (const value of ["NaN", "1e3", "1.234,56", "1.1234567", "1000000000000", -1, 1.2])
      expect(decimalTextoSchema.safeParse(value).success).toBe(false);
    expect(compararDecimais("999999999999.123456", "999999999999.123455")).toBe(1);
    expect(compararDecimais("1,200000", "01.2")).toBe(0);
  });
  it("permite medida incompleta no rascunho e marca pendências apenas para submissão", () => {
    const measure = medicaoDadosSchema.parse({ chave: "comprimento", grandeza: "comprimento" });
    expect(measure.valor).toBeNull();
    expect(measure.precisao).toBeNull();
    expect(measure.unidade).toBe("");
    const d = detail();
    Object.assign(d.medicoes[0]!, measure);
    expect(
      pendenciasColeta(d)
        .map((p) => p.descricao)
        .join(" "),
    ).toMatch(/valor decimal/);
    expect(pendenciasColeta(detail())).toEqual([]);
  });
  it("valida unidade, contagem inteira e origem 3D identificada como estimativa", () => {
    expect(
      medicaoDadosSchema.safeParse({ chave: "m", grandeza: "comprimento", unidade: "kN" }).success,
    ).toBe(false);
    expect(
      medicaoDadosSchema.safeParse({
        chave: "m",
        grandeza: "contagem",
        valor: "1.2",
        unidade: "un",
      }).success,
    ).toBe(false);
    expect(
      medicaoDadosSchema.safeParse({
        chave: "m",
        grandeza: "contagem",
        valor: "2.000000",
        unidade: "un",
      }).success,
    ).toBe(true);
    expect(
      medicaoDadosSchema.safeParse({
        chave: "m",
        grandeza: "comprimento",
        origem: "modelo_3d",
        natureza: "medida",
      }).success,
    ).toBe(false);
    expect(
      medicaoDadosSchema.safeParse({ chave: "m", grandeza: "comprimento", precisao: "0" }).success,
    ).toBe(false);
  });
  it("edição bulk requer versão própria e recusa edição/exclusão repetida da mesma medida", () => {
    const command = {
      ...base,
      comando: "salvar_ponto",
      ponto_id: id(8),
      expected_version: 1,
      codigo: "P01",
      nome: "Ponto",
      medicoes: [{ medicao_id: id(9), chave: "m", grandeza: "comprimento" }],
    };
    expect(comandoLevantamentoSchema.safeParse(command).success).toBe(false);
    const withVersion = { ...command, medicoes: [{ ...command.medicoes[0], expected_version: 1 }] };
    expect(comandoLevantamentoSchema.safeParse(withVersion).success).toBe(true);
    expect(
      comandoLevantamentoSchema.safeParse({
        ...withVersion,
        excluir_medicoes: [{ medicao_id: id(9), expected_version: 1 }],
      }).success,
    ).toBe(false);
  });
  it("não aceita autoria forjada e exige motivo/versão nas transições", () => {
    expect(
      comandoLevantamentoSchema.safeParse({
        ...base,
        comando: "aprovar",
        expected_version: 1,
        autor: id(7),
      }).success,
    ).toBe(false);
    expect(
      comandoLevantamentoSchema.safeParse({
        ...base,
        comando: "cancelar",
        expected_version: 1,
        motivo: "x",
      }).success,
    ).toBe(false);
    expect(comandoLevantamentoSchema.safeParse({ ...base, comando: "aprovar" }).success).toBe(
      false,
    );
  });
  it("exclusão do ponto exige a versão da revisão que contém suas medidas", () => {
    const command = {
      ...base,
      comando: "excluir_ponto",
      ponto_id: id(8),
      expected_version: 1,
    };
    expect(comandoLevantamentoSchema.safeParse(command).success).toBe(false);
    expect(
      comandoLevantamentoSchema.safeParse({ ...command, expected_revision_version: 3 }).success,
    ).toBe(true);
  });
  it("valida janela com fuso explícito e aceita passagem da meia-noite", () => {
    const schedule = {
      ...base,
      comando: "programar",
      expected_version: 1,
      inicio_previsto: "2026-10-22T23:00:00-03:00",
      fim_previsto: "2026-10-23T01:00:00-03:00",
    };
    expect(comandoLevantamentoSchema.safeParse(schedule).success).toBe(true);
    expect(
      comandoLevantamentoSchema.safeParse({ ...schedule, fim_previsto: schedule.inicio_previsto })
        .success,
    ).toBe(false);
    expect(
      comandoLevantamentoSchema.safeParse({ ...schedule, inicio_previsto: "2026-10-22T23:00:00" })
        .success,
    ).toBe(false);
  });
  it("aplica somente a política do modelo fixado e exige fotos confirmadas", () => {
    const d = detail();
    d.modelo = {
      id: id(10),
      modelo_id: id(11),
      numero: 1,
      fonte: "Política técnica aprovada no teste",
      requisitos: [
        {
          chave: "comprimento",
          grandeza: "comprimento",
          unidade: "m",
          minimo: "12.123457",
          exige_foto: true,
        },
      ],
    };
    const pending = pendenciasColeta(d)
      .map((p) => p.descricao)
      .join(" ");
    expect(pending).toMatch(/mínimo configurado/);
    expect(pending).toMatch(/foto/);
    expect(
      publicarModeloLevantamentoSchema.safeParse({
        organization_id: id(1),
        chave: id(2),
        nome: "Modelo",
        fonte: "Fonte",
        requisitos: [{ chave: "m", grandeza: "comprimento", unidade: "kN" }],
      }).success,
    ).toBe(false);
    const model = {
      organization_id: id(1),
      chave: id(2),
      nome: "Modelo",
      fonte: "Fonte",
      requisitos: [
        { chave: "m", grandeza: "comprimento", unidade: "m", minimo: "10", maximo: "1" },
      ],
    };
    expect(publicarModeloLevantamentoSchema.safeParse(model).success).toBe(false);
    expect(
      publicarModeloLevantamentoSchema.safeParse({
        ...model,
        requisitos: [{ ...model.requisitos[0], minimo: "0", maximo: "1000000000000" }],
      }).success,
    ).toBe(false);
    expect(
      publicarModeloLevantamentoSchema.safeParse({
        ...model,
        requisitos: [{ ...model.requisitos[0], chave: "m".repeat(81), minimo: "0", maximo: "1" }],
      }).success,
    ).toBe(false);
  });
  it("duplicação copia apenas perguntas e contexto, sem resultado, autoria ou evidência", () => {
    const d = detail();
    const duplicate = prepararDuplicacaoPonto(d, id(8));
    expect(duplicate.codigo).toBe("");
    expect(duplicate.medicoes[0]?.valor).toBeNull();
    expect(duplicate.medicoes[0]?.coletado_em).toBeNull();
    expect(duplicate).not.toHaveProperty("arquivos");
    expect(duplicate.medicoes[0]).not.toHaveProperty("medicao_id");
    expect(d.medicoes[0]?.valor).toBe("12.123456");
  });
  it("adoção exige fonte medida/aprovada e comparação explícita; estimativa nunca vira medida", () => {
    const m = detail().medicoes[0]!;
    expect(medicaoAdotavel(m, "aprovado", "metragem")).toBe(true);
    expect(medicaoAdotavel(m, "em_revisao", "metragem")).toBe(false);
    expect(
      medicaoAdotavel(
        { ...m, origem: "modelo_3d", natureza: "estimativa" },
        "aprovado",
        "metragem",
      ),
    ).toBe(false);
    expect(
      adotarMedidaSchema.safeParse({
        organization_id: id(1),
        chave: id(2),
        revisao_id: id(4),
        medicao_id: id(9),
        sistema_id: id(12),
        campo: "metragem",
      }).success,
    ).toBe(false);
  });
  it("lista exige filtros finitos e não interpreta curingas como contrato de consulta", () => {
    expect(listarLevantamentosSchema.parse({ organization_id: id(1), busca: "%_" }).busca).toBe(
      "%_",
    );
    expect(
      listarLevantamentosSchema.safeParse({ organization_id: id(1), limite: 500 }).success,
    ).toBe(false);
    expect(
      listarLevantamentosSchema.safeParse({ organization_id: id(1), estado: "emitido" }).success,
    ).toBe(false);
  });
});
