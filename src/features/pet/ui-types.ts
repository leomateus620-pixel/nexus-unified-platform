import type { z } from "zod";
import type { Json, executarInput } from "./schemas";
export type PetOption = {
  id: string;
  nome?: string;
  nome_exibicao?: string | null;
  razao_social?: string;
  titulo?: string;
  numero?: string;
  identificacao?: string;
  unidade_id?: string;
  cliente_id?: string;
  localizacao?: string;
  estado?: string;
  aprovado_em?: string | null;
  [key: string]: unknown;
};
export type PetOrdem = {
  id: string;
  numero: string;
  titulo: string;
  escopo: string;
  cliente_id: string;
  unidade_id: string;
  responsavel_id?: string | null;
  estado: string;
  version: number;
  cliente_nome?: string;
  unidade_nome?: string;
  responsavel_nome?: string;
};
export type PetResumo = {
  id: string;
  numero: string;
  os_id: string;
  unidade_id: string;
  espaco_id: string;
  atividade: string;
  estado_documental: string;
  condicao_operacional: string;
  termino_previsto: string;
  emitida_em: string | null;
  encerrada_em: string | null;
  version: number;
  timezone: string;
  presentes?: number;
  espaco_nome?: string;
  responsavel_nome?: string;
  assinaturas_pendentes?: number;
  conteudo?: Record<string, unknown>;
  modelo_versao_id?: string | null;
  snapshot_identificacao?: Record<string, unknown>;
};
export type PetParticipante = {
  id: string;
  pessoa_id: string;
  nome?: string;
  pessoa_nome?: string;
  nome_snapshot?: string;
  funcao: string;
  classificacao: string;
  empresa?: string | null;
  inicio_vigencia?: string;
  inicio?: string;
  fim?: string | null;
  fim_vigencia?: string | null;
};
export type PetResposta = { item: string; resposta: string; justificativa?: string | null };
export type PetPresenca = {
  id: string;
  pessoa_id: string;
  tipo: string;
  momento: string;
  momento_declarado?: string;
  assinatura_pendente?: boolean;
  recebido_em?: string;
  origem?: string;
  assinatura_id?: string | null;
  nome?: string;
};
export type PetIntervalo = {
  pessoa_id: string;
  nome?: string;
  pessoa_nome?: string;
  entrada_em: string;
  saida_em?: string | null;
  segundos?: number;
};
export type PetAssinatura = {
  id: string;
  pessoa_id: string;
  nome?: string;
  finalidade: string;
  metodo: string;
  estado: string;
  criada_em?: string;
  assinada_em?: string;
  conteudo_hash?: string;
  conteudo_sha256?: string;
  created_at?: string;
  provedor?: string;
};
export type PetAvaliacao = {
  id: string;
  etapa: string;
  momento: string;
  instrumento: string;
  numero_serie: string;
  responsavel_id: string;
  calibracao: string;
  leituras?: PetLeitura[];
};
export type PetLeitura = {
  avaliacao_id?: string;
  agente: string;
  valor: number;
  unidade: string;
  origem: string;
};
export type PetPendencia =
  | string
  | {
      codigo?: string;
      campo?: string;
      item?: string;
      mensagem?: string;
      descricao?: string;
      etapa?: number;
    };
export type PetDetalhe = {
  pet: PetResumo;
  os: PetOrdem;
  espaco: PetOption;
  revisoes: {
    id: string;
    numero?: number;
    conteudo?: Record<string, unknown>;
    modelo_versao_id?: string | null;
    snapshot_identificacao?: Record<string, unknown>;
    hash?: string;
    criada_em?: string;
  }[];
  participantes: PetParticipante[];
  respostas: PetResposta[];
  avaliacoes: PetAvaliacao[];
  leituras: PetLeitura[];
  presencas: PetPresenca[];
  intervalos: PetIntervalo[];
  eventos: {
    id: string;
    tipo: string;
    momento?: string;
    criado_em?: string;
    created_at?: string;
    motivo?: string;
    dados?: Record<string, unknown>;
  }[];
  assinaturas: PetAssinatura[];
  documentos: { id: string; tipo: string; sha256?: string; estado?: string; criado_em?: string }[];
  pendencias: PetPendencia[];
  metricas: {
    duracao_documental_segundos?: number;
    permanencia_segundos?: number;
    horas_pessoa_segundos?: number;
    [key: string]: unknown;
  };
  permissoes: Record<string, boolean>;
};
export type PetOpcoes = {
  clientes: PetOption[];
  unidades: PetOption[];
  pessoas: PetOption[];
  espacos: PetOption[];
  modelos: PetOption[];
  ordens: PetOrdem[];
  integracao_assinatura: { configurada: boolean; provedor?: string; mensagem?: string };
};
export type PetLista = { registros: PetResumo[]; ordens: PetOrdem[]; total: number };
export type PetCommandName = z.infer<typeof executarInput>["comando"]["comando"];
export type PetUICommand = { comando: PetCommandName; dados: Record<string, Json> };
export type PetExecute = (command: PetUICommand) => Promise<boolean>;
export function optionName(value?: PetOption | null): string {
  return value
    ? value.nome ||
        value.nome_exibicao ||
        value.razao_social ||
        value.identificacao ||
        value.titulo ||
        value.numero ||
        value.id
    : "Não informado";
}
export const PET_ETAPAS = [
  "Contexto",
  "Equipe",
  "Perigos e controles",
  "Atmosfera e procedimentos",
  "Conferência e assinaturas",
  "Acompanhamento",
];
export const PET_FUNCOES: Record<string, string> = {
  supervisor: "Supervisor de entrada",
  vigia: "Vigia",
  substituto_vigia: "Substituto de vigia",
  trabalhador: "Trabalhador autorizado",
  resgate: "Emergência e resgate",
};
export function petDate(value?: string | null, timezone = "America/Sao_Paulo"): string {
  if (!value) return "Não informado";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: timezone,
      }).format(d);
}
export function petDuration(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}min ${String(seconds % 60).padStart(2, "0")}s`;
}
export function petLabel(value: string) {
  const labels: Record<string, string> = {
    rascunho: "Rascunho",
    em_conferencia: "Em conferência",
    aguardando_assinaturas: "Aguardando assinaturas",
    emitida: "Emitida",
    em_atividade: "Em atividade",
    nao_liberada: "Não liberada",
    liberada: "Liberada",
    terminada: "Término operacional",
    validada: "Certificada validada",
    pendente: "Assinatura certificada pendente",
    aceite_registrado: "Aceite autenticado",
    coletada: "Assinatura coletada na tela",
    falha: "Falha de validação",
    encerramento_pendente: "Encerramento pendente",
    encerrada: "Encerrada",
    cancelada: "Cancelada",
    normal: "Normal",
    interrompida: "Interrompida",
    emergencia: "Emergência",
    expirada: "Expirada",
    planejada: "Planejada",
    concluida: "Concluída",
    aberta: "Aberta",
    ativa: "Ativa",
    em_execucao: "Em execução",
  };
  return labels[value] || value.replaceAll("_", " ");
}

/** Serializes a declared wall-clock field in the PET's explicit IANA zone. */
export function petInstant(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Informe data e horário válidos.");
  const parts = match.slice(1).map(Number);
  const target = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!, parts[3]!, parts[4]!);
  const valid = new Date(target);
  if (
    valid.getUTCFullYear() !== parts[0] ||
    valid.getUTCMonth() !== parts[1]! - 1 ||
    valid.getUTCDate() !== parts[2] ||
    parts[3]! > 23 ||
    parts[4]! > 59
  )
    throw new Error("Informe data e horário válidos.");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
    );
    const wall = Date.UTC(
      Number(p["year"]),
      Number(p["month"]) - 1,
      Number(p["day"]),
      Number(p["hour"]),
      Number(p["minute"]),
      Number(p["second"]),
    );
    instant += target - wall;
  }
  return new Date(instant).toISOString();
}
export function petDateInput(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${p["year"]}-${p["month"]}-${p["day"]}T${p["hour"]}:${p["minute"]}`;
}
export function petSnapshotOption(
  detail: PetDetalhe,
  key: "cliente" | "unidade" | "espaco",
): PetOption | null {
  const value = detail.pet.snapshot_identificacao?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as PetOption) : null;
}
