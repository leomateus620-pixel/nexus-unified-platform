import type { Json } from "./schemas";
import {
  petDateInput,
  petInstant,
  type PetDetalhe,
  type PetOption,
  type PetPendencia,
  type PetResposta,
} from "./ui-types";

export const PET_CONTROLES: { grupo: string; itens: [string, string][] }[] = [
  {
    grupo: "EPC · proteção coletiva",
    itens: [
      ["isolamento", "Isolamento com barreira física / guarda-corpo"],
      ["sinalizacao", "Sinalização de segurança: placas, fitas e cones"],
      ["lanterna", "Lanterna intrinsecamente segura"],
      ["incendio", "Proteção contra incêndio e extintores"],
      ["resgate", "Sistema de resgate e corda de segurança"],
      ["iluminacao", "Iluminação geral e escada móvel"],
      ["comunicacao", "Comunicação adequada ao ambiente / área classificada"],
      ["movimentacao_vertical", "Movimentação vertical e suportes externos"],
    ],
  },
  {
    grupo: "EPI · proteção individual",
    itens: [
      ["epi_basico", "Capacete, calçado, luvas e óculos de proteção"],
      ["quedas", "Cinturão, talabarte e trava-quedas"],
      ["respirador", "Máscara e respirador selecionados para o risco"],
      ["auditiva", "Proteção auditiva e creme de proteção"],
      ["roupa", "Roupa de proteção aplicável"],
      ["ar_trabalho", "Proteção respiratória / ar mandado para a equipe de trabalho"],
      ["ar_resgate", "Proteção respiratória / ar mandado para o resgate"],
      ["eletronicos", "Equipamentos elétricos e eletrônicos adequados à classificação do local"],
    ],
  },
];

export type PetDanger = { grupo: string; perigo: string; medida: string; evidencia: string };
export type PetTeamMember = {
  pessoa_id: string;
  funcao: string;
  classificacao: string;
  empresa: string;
};
export type PetDraft = {
  atividade: string;
  termino_previsto: string;
  participantes: PetTeamMember[];
  respostas: PetResposta[];
  perigos: PetDanger[];
  procedimentos: Record<string, string>;
  monitoramento_continuo: { confirmado: boolean; equipamento: string; registro: string };
  contatos_emergencia: string;
  outras_informacoes: string;
  modelo_id: string;
};

export function petDraft(detail: PetDetalhe): PetDraft {
  const c = detail.pet.conteudo || {};
  return {
    atividade: detail.pet.atividade,
    termino_previsto: petDateInput(detail.pet.termino_previsto, detail.pet.timezone),
    participantes: detail.participantes
      .filter((p) => !p.fim_vigencia && !p.fim)
      .map((p) => ({
        pessoa_id: p.pessoa_id,
        funcao: p.funcao,
        classificacao: p.classificacao,
        empresa: p.empresa || "",
      })),
    respostas: detail.respostas.map((r) => ({ ...r })),
    perigos: (c["perigos"] as PetDanger[]) || [],
    procedimentos: (c["procedimentos"] as Record<string, string>) || {},
    monitoramento_continuo: (c["monitoramento_continuo"] as PetDraft["monitoramento_continuo"]) || {
      confirmado: false,
      equipamento: "",
      registro: "",
    },
    contatos_emergencia: String(c["contatos_emergencia"] || ""),
    outras_informacoes: String(c["outras_informacoes"] || ""),
    modelo_id: String(detail.pet.modelo_versao_id || c["modelo_id"] || ""),
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Saving a visible preparation step must retain content owned by other PET flows. */
export function draftPayload(
  draft: PetDraft,
  timezone = "America/Sao_Paulo",
  baseContent: Record<string, unknown> = {},
  originalTermino?: string,
) {
  const unchangedDeadline =
    !!originalTermino &&
    !!draft.termino_previsto &&
    petDateInput(originalTermino, timezone) === draft.termino_previsto;
  return {
    atividade: draft.atividade,
    termino_previsto: unchangedDeadline
      ? originalTermino
      : petInstant(draft.termino_previsto, timezone),
    participantes: draft.participantes,
    respostas: draft.respostas.map((r) => ({
      item: r.item,
      resposta: r.resposta,
      justificativa: r.justificativa || "",
    })),
    conteudo: {
      ...baseContent,
      perigos: draft.perigos,
      procedimentos: { ...object(baseContent["procedimentos"]), ...draft.procedimentos },
      monitoramento_continuo: {
        ...object(baseContent["monitoramento_continuo"]),
        ...draft.monitoramento_continuo,
      },
      contatos_emergencia: draft.contatos_emergencia,
      outras_informacoes: draft.outras_informacoes,
      modelo_id: draft.modelo_id,
    },
  } as Record<string, Json>;
}

export type PetRequirement = {
  id: string;
  rotulo?: string;
  obrigatorio?: boolean;
  permite_na?: boolean;
  justificativa_na?: boolean;
  evidencia_obrigatoria?: boolean;
};

/** Requirements retain the explicit versioned IDs; labels never become identifiers. */
export function petModelRequirements(model?: PetOption): PetRequirement[] {
  const procedure = object(model?.["procedimento"]);
  const seen = new Set<string>();
  return (Array.isArray(procedure["itens"]) ? procedure["itens"] : []).flatMap((value) => {
    const item = object(value);
    if (typeof item["id"] !== "string" || !item["id"].trim() || seen.has(item["id"])) return [];
    seen.add(item["id"]);
    return [item as PetRequirement];
  });
}

export function updatePetAnswer(
  answers: PetResposta[],
  item: string,
  patch: Partial<Pick<PetResposta, "resposta" | "justificativa">>,
): PetResposta[] {
  const previous = answers.find((answer) => answer.item === item);
  const next = { item, resposta: "nao_verificado", ...previous, ...patch };
  return previous
    ? answers.map((answer) => (answer.item === item ? next : answer))
    : [...answers, next];
}

export function petAnswerError(answer?: PetResposta, rule?: PetRequirement): string | undefined {
  if (answer?.resposta !== "nao_aplicavel" || !rule) return undefined;
  if (rule.permite_na !== true) return "Este procedimento não permite “Não se aplica” neste item.";
  if (rule.justificativa_na !== false && (answer.justificativa || "").trim().length < 5)
    return "Justifique a não aplicabilidade com pelo menos 5 caracteres.";
  return undefined;
}

/** Availability only; the canonical command validates the current SQL state again. */
export function petConferenceActions(
  state: string,
  permissions: Record<string, boolean>,
  signatureConfigured: boolean,
) {
  const conference = ["rascunho", "em_conferencia"].includes(state);
  const issuance = state === "aguardando_assinaturas";
  return {
    conferir: { visible: conference, enabled: conference && permissions["conferir"] === true },
    emitir: {
      visible: issuance,
      enabled: issuance && permissions["emitir"] === true && signatureConfigured,
    },
  };
}

export type PetPickerOption = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
};
function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
export function filterPetPickerOptions(options: PetPickerOption[], search: string) {
  const words = normalized(search).split(/\s+/).filter(Boolean);
  return options.filter((option) => {
    const text = normalized(option.label + " " + (option.description || ""));
    return words.every((word) => text.includes(word));
  });
}

const fields: Record<string, { stage: number; item: string }> = {
  atividade: { stage: 0, item: "atividade" },
  termino_previsto: { stage: 0, item: "termino_previsto" },
  modelo_id: { stage: 0, item: "modelo_versao_id" },
  modelo_versao_id: { stage: 0, item: "modelo_versao_id" },
  participantes: { stage: 1, item: "participantes" },
  contatos_emergencia: { stage: 1, item: "contatos_emergencia" },
  perigos: { stage: 2, item: "perigos" },
  respostas: { stage: 2, item: "respostas" },
  procedimentos: { stage: 3, item: "procedimentos" },
  monitoramento_continuo: { stage: 3, item: "monitoramento_continuo" },
  avaliacoes: { stage: 3, item: "avaliacoes" },
  assinaturas: { stage: 4, item: "assinaturas" },
};
const codes: Record<string, number> = {
  modelo: 0,
  validade: 0,
  limite: 0,
  equipe: 1,
  pessoa_inativa: 1,
  qualificacao: 1,
  emergencia: 1,
  perigos: 2,
  resposta: 2,
  na_invalido: 2,
  evidencia: 2,
  procedimentos: 3,
  monitoramento: 3,
  dispositivo: 3,
  avaliacao: 3,
  leitura: 3,
  integracao: 4,
};
export const PET_PROCEDURE_FIELDS = [
  "bloqueio",
  "purga",
  "ventilacao_tipo",
  "ventilacao_equipamento",
  "comunicacao",
  "resgate",
  "treinamentos",
  "dispositivo_verificacao",
  "dispositivo_adequado",
  "ventilacao_minutos",
];

/** Routes the server's structured coordinates, never its translated message. */
export function pendingTarget(
  pending: PetPendencia,
  model?: PetOption,
): { stage: number; item?: string } {
  if (typeof pending === "string") return { stage: 4 };
  const field = pending.item || pending.campo || "";
  if (Number.isInteger(pending.etapa) && pending.etapa! >= 0 && pending.etapa! <= 4)
    return { stage: pending.etapa!, ...(field ? { item: field } : {}) };
  const exact = fields[field];
  if (exact) return exact;
  if (
    PET_CONTROLES.some((group) => group.itens.some(([id]) => id === field)) ||
    petModelRequirements(model).some((rule) => rule.id === field)
  )
    return { stage: 2, item: field };
  if (PET_PROCEDURE_FIELDS.some((key) => field === "procedimentos." + key))
    return { stage: 3, item: field };
  if (
    ["confirmado", "equipamento", "registro"].some(
      (key) => field === "monitoramento_continuo." + key,
    )
  )
    return { stage: 3, item: field };
  if (field.startsWith("avaliacoes.") && field.length > "avaliacoes.".length)
    return { stage: 3, item: field };
  const stage = pending.codigo ? codes[pending.codigo] : undefined;
  return stage === undefined ? { stage: 4 } : { stage, ...(field ? { item: field } : {}) };
}
