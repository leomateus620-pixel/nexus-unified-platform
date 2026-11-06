import { z } from "zod";
import { jsonValue } from "../schemas";
import { unitScopeSchema } from "@/features/nr/mapa/schemas";

export const demoParticipant = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(2).max(160),
  funcao: z.enum(["supervisor", "vigia", "trabalhador", "resgate", "substituto_vigia"]),
  /** Optional canonical person reference; older drafts carry only the name. */
  pessoa_id: z.string().uuid().optional(),
});
export const demoReading = z.object({
  id: z.string().uuid(),
  agente: z.string().trim().min(1).max(80),
  valor: z
    .string()
    .min(1)
    .refine((s) => Number.isFinite(Number(s)), "Informe um número válido."),
  unidade: z.string().trim().min(1).max(30),
});
export const demoDraftSchema = z
  .object({
    atividade: z
      .string()
      .trim()
      .min(3, "Descreva a atividade com ao menos três caracteres.")
      .max(4000),
    inicio_previsto: z.string().min(1, "Informe o início."),
    termino_previsto: z.string().min(1, "Informe o término."),
    equipe: z.array(demoParticipant).max(100),
    perigos: z.string().max(10000),
    medidas: z.string().max(10000),
    leituras: z.array(demoReading).max(100),
    procedimentos: z.string().max(10000),
  })
  .refine(
    (d) =>
      Number.isFinite(Date.parse(d.inicio_previsto)) &&
      Date.parse(d.termino_previsto) > Date.parse(d.inicio_previsto),
    {
      path: ["termino_previsto"],
      message: "O término deve ser posterior ao início.",
    },
  );
export type DemoDraft = z.infer<typeof demoDraftSchema>;
export const emptyDemoDraft = (): DemoDraft => ({
  atividade: "",
  inicio_previsto: "",
  termino_previsto: "",
  equipe: [],
  perigos: "",
  medidas: "",
  leituras: [],
  procedimentos: "",
});
export const DEMO_STEPS = [
  "Contexto",
  "Equipe",
  "Segurança",
  "Atmosfera e procedimentos",
  "Conferência",
  "Acompanhamento",
  "Encerramento",
  "Consulta final",
] as const;
export const demoStateLabel = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
};
export const demoScope = unitScopeSchema.extend({ local_id: z.string().uuid().optional() });
export const demoSession = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  cliente_id: z.string().uuid(),
  unidade_id: z.string().uuid(),
  local_id: z.string().uuid(),
  numero: z.string(),
  norma_origem: z.enum(["NR33", "NR35"]),
  estado: z.enum(["rascunho", "em_andamento", "encerrada", "cancelada"]),
  etapa: z.number(),
  version: z.number(),
  conteudo: demoDraftSchema,
  identificacao: z.object({
    tag: z.string(),
    titulo: z.string(),
    unidade: z.string(),
    aliases: z.array(z.string()).optional(),
  }),
  created_at: z.string(),
  updated_at: z.string(),
  encerrada_em: z.string().nullable(),
});
export const demoContext = z.object({ habilitado: z.boolean(), pode_editar: z.boolean() });
export const demoList = z.object({ total: z.number(), registros: z.array(demoSession) });
export const demoFile = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  mime: z.string(),
  tamanho: z.number(),
  estado: z.enum(["pendente", "disponivel"]),
  created_at: z.string(),
});
export const demoDetail = z.object({
  sessao: demoSession,
  pode_editar: z.boolean(),
  eventos: z.array(
    z.object({
      id: z.string(),
      tipo: z.string(),
      dados: z.record(jsonValue),
      created_at: z.string(),
    }),
  ),
  presencas: z.array(
    z.object({
      id: z.string(),
      participante_id: z.string(),
      nome: z.string(),
      entrada_em: z.string(),
      saida_em: z.string().nullable(),
    }),
  ),
  anexos: z.array(demoFile),
});
export const demoRecords = z.object({ total: z.number(), registros: z.array(jsonValue) });
export type DemoSession = z.infer<typeof demoSession>;
export type DemoDetail = z.infer<typeof demoDetail>;
export const demoCommand = z.object({
  chave: z.string().uuid(),
  id: z.string().uuid().optional(),
  expected_version: z.number().int().positive().optional(),
  norma: z.enum(["NR33", "NR35"]),
  comando: z.enum([
    "criar",
    "salvar",
    "iniciar",
    "entrada",
    "saida",
    "medicao",
    "ocorrencia",
    "prorrogar",
    "encerrar",
    "cancelar",
  ]),
  dados: z.record(jsonValue),
});
export type DemoCommand = z.infer<typeof demoCommand>;
export function demoContextErrors(d: DemoDraft): Record<string, string> {
  const parsed = demoDraftSchema.safeParse(d);
  return parsed.success
    ? {}
    : Object.fromEntries(parsed.error.issues.map((e) => [e.path.join("."), e.message]));
}
export function demoCanEnterStep(s: DemoSession | undefined, step: number) {
  if (step < 0 || step > 7) return false;
  if (!s || s.estado === "rascunho") return step <= 4;
  if (s.estado === "em_andamento") return step <= 6;
  return true;
}
