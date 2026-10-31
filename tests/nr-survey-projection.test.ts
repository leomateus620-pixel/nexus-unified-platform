import { describe, expect, it } from "vitest";
import {
  NR_SURVEY_PROJECTION_VERSION,
  normalizeSurveyBlocks,
  projectSurvey,
  surveyApplicability,
  surveyBlockProgress,
  surveyHasValue,
} from "../src/features/nr/survey-projection";

const historic = {
  numero: 1,
  dados: { blocos: [{ id: "B07", titulo: "Matriz histórica", campos: [] }] },
};
const source = {
  id: "00000000-0000-4000-8000-000000000002",
  numero: 2,
  projecao_versao: NR_SURVEY_PROJECTION_VERSION,
  origem: "Fonte importada comprovada por chave externa e hash",
  dados: {
    blocos: [
      {
        id: "B07",
        codigo: "B07",
        titulo: "Geometria",
        campos: [
          {
            id: "B07.forma",
            nome: "Forma",
            tipo: "selecao",
            opcoes: ["cilindrica", "informada"],
            obrigatorio: true,
          },
          {
            id: "B07.diametro",
            nome: "Diâmetro (m)",
            tipo: "numero",
            destino: "geometria.diametro",
            obrigatorio: true,
            mostrar_se: { campo: "B07.forma", valor: ["cilindrica"] },
          },
          {
            id: "B07.volume",
            nome: "Volume preservado",
            tipo: "lista",
            tipo_origem: "calculado",
            destino: "geometria.volume",
          },
        ],
      },
      {
        id: "B09",
        codigo: "B09",
        titulo: "Aeração fixa",
        aplica_se: { familias: ["Silos"] },
        campos: [{ id: "B09.sistema", tipo: "selecao", nome: "Sistema", obrigatorio: true }],
      },
      {
        id: "B16",
        codigo: "B16",
        titulo: "Sistemas e laudos",
        campos: [
          {
            id: "B16.sistemas",
            tipo: "lista",
            nome: "Sistemas",
            destino: "ancoragens.sistemas",
            subcampos: [
              {
                id: "formato",
                rotulo: "Formato",
                tipo: "selecao",
                opcoes: ["Circular", "Retangular"],
              },
              {
                id: "diametro",
                rotulo: "Diâmetro (m)",
                tipo: "numero",
                mostrar_se: { campo: "formato", valor: ["Circular"] },
              },
            ],
          },
          {
            id: "B16.documentos",
            tipo: "lista",
            tipo_origem: "multipla",
            nome: "Documentos apresentados",
            opcoes: ["Projeto", "ART"],
          },
        ],
      },
    ],
  },
};
const imported = { modelo_legado: true, respostas_extraidas_por_caminho: true };

describe("adaptador versionado de apresentação do levantamento", () => {
  it("usa o de-para exato de campos e não funde B07 histórico com B07 de apresentação", () => {
    const answers = {
      "B07.forma": "cilindrica",
      "B07.diametro": 0,
      "campo-preservado": { texto: "Outra revisão" },
    };
    const before = structuredClone({ historic, source, imported, answers });
    const projection = projectSurvey({
      snapshot: historic,
      presentation: source,
      historicalData: imported,
      answers,
    });
    expect(projection.usesAdapter).toBe(true);
    expect(projection.blocks[0]?.titulo).toBe("Geometria");
    expect(projection.mappings.find((mapping) => mapping.fieldId === "B07.diametro")).toEqual({
      fieldId: "B07.diametro",
      sourcePath: "geometria.diametro",
      answerPresent: true,
    });
    expect(projection.unmapped).toEqual(["campo-preservado"]);
    expect({ historic, source, imported, answers }).toEqual(before);
  });
  it("recusa projetar um modelo encontrado apenas por nome ou sem versão suportada", () => {
    for (const presentation of [
      { ...source, projecao_versao: "outro-adaptador" },
      { ...source, projecao_versao: undefined },
    ]) {
      const projection = projectSurvey({
        snapshot: historic,
        presentation,
        historicalData: imported,
      });
      expect(projection.usesAdapter).toBe(false);
      expect(projection.blocks[0]?.titulo).toBe("Matriz histórica");
    }
    for (const historicalData of [
      {},
      { modelo_legado: true },
      { respostas_extraidas_por_caminho: true },
    ])
      expect(
        projectSurvey({ snapshot: historic, presentation: source, historicalData }).usesAdapter,
      ).toBe(false);
  });
  it("respeita modelos Nexus e snapshots com campos mesmo quando existe apresentação mais nova", () => {
    const fieldId = "00000000-0000-4000-8000-000000000003";
    const snapshot = {
      dados: {
        blocos: [
          {
            id: "bloco-nativo",
            codigo: "B01",
            titulo: "Versão escolhida",
            campos: [{ id: fieldId, nome: "Medição", tipo: "numero" }],
          },
        ],
      },
    };
    const projection = projectSurvey({
      snapshot,
      presentation: source,
      historicalData: imported,
      answers: { [fieldId]: 2.5 },
    });
    expect(projection.usesAdapter).toBe(false);
    expect(projection.blocks[0]?.titulo).toBe("Versão escolhida");
    expect(projection.blocks[0]?.campos[0]?.id).toBe(fieldId);
    expect(projection.unmapped).toEqual([]);
  });
  it("recupera múltipla escolha, calculados e subcampos sem alterar as identidades das respostas", () => {
    const blocks = normalizeSurveyBlocks(source.dados);
    expect(blocks[0]?.campos[2]?.tipo).toBe("calculado");
    expect(blocks[2]?.campos[1]?.tipo).toBe("multipla");
    expect(blocks[2]?.campos[0]?.subcampos?.[1]).toMatchObject({
      id: "diametro",
      nome: "Diâmetro (m)",
      mostrar_se: { campo: "formato", valor: ["Circular"] },
    });
    expect(
      surveyApplicability(blocks[2]?.campos[0]?.subcampos?.[1]?.mostrar_se, {
        formato: "Circular",
      }),
    ).toBe(true);
    expect(
      surveyApplicability(blocks[2]?.campos[0]?.subcampos?.[1]?.mostrar_se, {
        formato: "Retangular",
      }),
    ).toBe(false);
  });
  it("B07 mostra dimensões condicionais e mantém salvamento parcial sem inventar completude", () => {
    const block = normalizeSurveyBlocks(source.dados)[0]!;
    expect(surveyBlockProgress(block, { "B07.forma": "informada" })).toMatchObject({
      total: 2,
      answered: 1,
      requiredMissing: [],
    });
    expect(
      surveyBlockProgress(block, { "B07.forma": "cilindrica", "B07.diametro": 0 }),
    ).toMatchObject({ total: 3, answered: 2, requiredMissing: [] });
    expect(
      surveyBlockProgress(block, { "B07.forma": "cilindrica" }).requiredMissing.map(
        (field) => field.id,
      ),
    ).toEqual(["B07.diametro"]);
    expect(surveyApplicability(block.campos[1]?.mostrar_se, {})).toBeNull();
  });
  it("não impõe aeração fixa a toda família e mantém desconhecido como decisão pendente", () => {
    const block = normalizeSurveyBlocks(source.dados)[1]!;
    expect(surveyBlockProgress(block, {}, { familia: "Tanques" })).toMatchObject({
      applicability: false,
      total: 0,
      answered: 0,
    });
    expect(surveyBlockProgress(block, {}, { familia: "Silos" })).toMatchObject({
      applicability: true,
      total: 1,
      answered: 0,
    });
    expect(surveyBlockProgress(block, {}, {}).applicability).toBeNull();
    expect(surveyApplicability({ familias: [] }, {}, { familia: "Silos" })).toBeNull();
    expect(surveyApplicability({ campo: "B01.tipo", valor: [] }, {})).toBeNull();
    expect(
      surveyApplicability({ familias: "Silos" } as never, {}, { familia: "Silos" }),
    ).toBeNull();
  });
  it("zero e falso são respostas, não ausência; não infere obrigatoriedade de valor vazio", () => {
    for (const value of [0, false, "0", [0], { valor: null }])
      expect(surveyHasValue(value)).toBe(true);
    for (const value of [null, undefined, "", " ", [], {}])
      expect(surveyHasValue(value)).toBe(false);
  });
  it("tipos de uma versão futura permanecem legíveis e não viram campos de texto editáveis", () => {
    const blocks = normalizeSurveyBlocks({
      blocos: [
        {
          id: "B01",
          campos: [
            {
              id: "assinatura-futura",
              nome: "Declaração",
              tipo: "assinatura_futura",
              campo_futuro: { fonte: "preservada" },
            },
          ],
        },
      ],
    });
    expect(blocks[0]?.campos[0]).toMatchObject({
      id: "assinatura-futura",
      tipo: "nao_suportado",
      campo_futuro: { fonte: "preservada" },
    });
  });
});
