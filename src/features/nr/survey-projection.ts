/**
 * Presentation adapter, not a new engineering/model revision.
 * prepare-import.mjs extracted each answer with the exact Bxx.field ID and
 * `destino` of the captured global model. Historical block IDs are not an
 * equivalence: the 11-block model uses B07 for another subject.
 */
export const NR_SURVEY_PROJECTION_VERSION = "nr-levantamento-apresentacao-1";

export type SurveyCondition = {
  campo?: string;
  valor?: unknown[];
  familias?: string[];
  tipos_local?: string[];
};
export type SurveyFieldDefinition = {
  id: string;
  nome: string;
  tipo:
    | "texto"
    | "texto_longo"
    | "numero"
    | "data"
    | "selecao"
    | "foto"
    | "lista"
    | "multipla"
    | "checklist"
    | "calculado"
    | "nao_suportado";
  mostrar_se?: SurveyCondition;
  destino?: string;
  tipo_origem?: string;
  obrigatorio: boolean;
  opcoes?: string[];
  rotulos_opcoes?: Record<string, string>;
  subcampos?: SurveyFieldDefinition[];
  ajuda?: string;
  placeholder?: string;
  unidade?: string;
  legenda?: string;
  rotulo_adicionar?: string;
  vazio?: string;
};
export type SurveyBlockDefinition = {
  id: string;
  codigo: string;
  titulo: string;
  instrucao?: string;
  aplicabilidade?: string | string[];
  aplica_se?: SurveyCondition;
  campos: SurveyFieldDefinition[];
};

export const surveyObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown) => (typeof value === "string" ? value : "");
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
const fieldTypes = new Set<SurveyFieldDefinition["tipo"]>([
  "texto",
  "texto_longo",
  "numero",
  "data",
  "selecao",
  "foto",
  "lista",
  "multipla",
  "checklist",
  "calculado",
]);

function normalizeField(
  raw: unknown,
  blockId: string,
  nested = false,
): SurveyFieldDefinition | null {
  const field = surveyObject(raw);
  const sourceId = string(field["id"]);
  if (!sourceId) return null;
  // Nexus-created fields may use UUIDs. Never manufacture another identity.
  const id = sourceId;
  const originalType = string(field["tipo_origem"]) || string(field["tipo"]);
  const type = fieldTypes.has(originalType as SurveyFieldDefinition["tipo"])
    ? originalType
    : "nao_suportado";
  const sourceCondition = surveyObject(field["mostrar_se"]);
  const conditionField = string(sourceCondition["campo"]);
  const condition = conditionField
    ? {
        ...sourceCondition,
        campo:
          !nested && sourceId.startsWith(`${blockId}.`) && !conditionField.includes(".")
            ? `${blockId}.${conditionField}`
            : conditionField,
      }
    : undefined;
  return {
    ...field,
    id,
    nome: string(field["nome"]) || string(field["rotulo"]) || sourceId,
    tipo: type as SurveyFieldDefinition["tipo"],
    obrigatorio: field["obrigatorio"] === true,
    ...(field["mostrar_se"] !== undefined ? { mostrar_se: condition ?? field["mostrar_se"] } : {}),
    ...(Array.isArray(field["opcoes"]) ? { opcoes: strings(field["opcoes"]) } : {}),
    ...(Array.isArray(field["subcampos"])
      ? {
          subcampos: field["subcampos"]
            .map((child) => normalizeField(child, blockId, true))
            .filter((child): child is SurveyFieldDefinition => child !== null),
        }
      : {}),
  } as SurveyFieldDefinition;
}

export function normalizeSurveyBlocks(data: unknown): SurveyBlockDefinition[] {
  const blocks = surveyObject(data)["blocos"];
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((raw) => {
    const block = surveyObject(raw);
    const code = string(block["codigo"]) || string(block["id"]);
    if (!code) return [];
    return [
      {
        ...block,
        id: string(block["id"]) || code,
        codigo: code,
        titulo: string(block["titulo"]) || code,
        campos: (Array.isArray(block["campos"]) ? block["campos"] : [])
          .map((field) => normalizeField(field, code))
          .filter((field): field is SurveyFieldDefinition => field !== null),
      } as SurveyBlockDefinition,
    ];
  });
}

export function surveyHasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true; // zero and false are explicit answers.
}

/** null = applicability requires a decision; never silently hide an unknown. */
export function surveyApplicability(
  condition: SurveyCondition | undefined,
  answers: Record<string, unknown>,
  local: Record<string, unknown> = {},
): boolean | null {
  if (!condition) return true;
  if (typeof condition !== "object" || Array.isArray(condition)) return null;
  const supported = new Set(["campo", "valor", "familias", "tipos_local"]);
  if (Object.keys(condition).some((key) => !supported.has(key))) return null;
  for (const [key, source] of [
    ["familias", "familia"],
    ["tipos_local", "tipo"],
  ] as const) {
    const choices = condition[key];
    if (choices !== undefined) {
      if (
        !Array.isArray(choices) ||
        !choices.length ||
        choices.some((choice) => typeof choice !== "string") ||
        !surveyHasValue(local[source])
      )
        return null;
      if (!choices.includes(String(local[source]))) return false;
    }
  }
  if (condition.campo !== undefined || condition.valor !== undefined) {
    if (!condition.campo || !Array.isArray(condition.valor) || !condition.valor.length) return null;
    const answer = answers[condition.campo];
    if (!surveyHasValue(answer)) return null;
    return condition.valor.some((value) => value === answer);
  }
  return true;
}

export function projectSurvey(input: {
  snapshot?: unknown;
  presentation?: unknown;
  historicalData?: unknown;
  answers?: unknown;
}) {
  const snapshot = surveyObject(input.snapshot);
  const fixed = normalizeSurveyBlocks(snapshot["dados"]);
  const presentation = surveyObject(input.presentation);
  const historical = surveyObject(input.historicalData);
  const answers = surveyObject(input.answers);
  const usesAdapter =
    !fixed.some((block) => block.campos.length > 0) &&
    historical["modelo_legado"] === true &&
    historical["respostas_extraidas_por_caminho"] === true &&
    presentation["projecao_versao"] === NR_SURVEY_PROJECTION_VERSION;
  const blocks = usesAdapter ? normalizeSurveyBlocks(presentation["dados"]) : fixed;
  const fields = blocks.flatMap((block) => block.campos);
  const known = new Set(fields.map((field) => field.id));
  return {
    blocks,
    usesAdapter,
    version: NR_SURVEY_PROJECTION_VERSION,
    source: usesAdapter ? string(presentation["origem"]) : "Versão fixada no levantamento",
    modelNumber: usesAdapter ? presentation["numero"] : snapshot["numero"],
    mappings: fields.map((field) => ({
      fieldId: field.id,
      sourcePath: field.destino ?? null,
      answerPresent: Object.hasOwn(answers, field.id),
    })),
    unmapped: Object.keys(answers).filter((key) => !known.has(key)),
  };
}

export function surveyBlockProgress(
  block: SurveyBlockDefinition,
  answers: Record<string, unknown>,
  local: Record<string, unknown> = {},
) {
  const applicability = surveyApplicability(block.aplica_se, answers, local);
  const fields = block.campos.filter(
    (field) => surveyApplicability(field.mostrar_se, answers, local) === true,
  );
  return {
    applicability,
    total: applicability === false ? 0 : fields.length,
    answered:
      applicability === false
        ? 0
        : fields.filter((field) => surveyHasValue(answers[field.id])).length,
    requiredMissing:
      applicability !== true
        ? []
        : fields.filter((field) => field.obrigatorio && !surveyHasValue(answers[field.id])),
  };
}
