import { z } from "zod";

const id = z.string().uuid("Selecione um cadastro válido.");
const version = z.number().int().positive();
const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data civil válida.")
  .refine((value) => {
    const parsed = new Date(value + "T12:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Informe uma data civil válida.");
export const estadoQualificacao = z.enum(["enviada", "em_conferencia", "validada", "revogada"]);
export const orgInput = z.object({ organization_id: id }).strict();
export const detalheInput = orgInput.extend({ id }).strict();
const page = {
  pagina: z.number().int().min(0).max(10000).default(0),
  busca: z.string().trim().max(120).default(""),
};
export const listarCompetenciasInput = orgInput
  .extend({ ...page, arquivadas: z.boolean().default(false) })
  .strict();
export const listarQualificacoesInput = orgInput
  .extend({
    ...page,
    pessoa_id: id.nullable().default(null),
    competencia_id: id.nullable().default(null),
    estado: estadoQualificacao.nullable().default(null),
  })
  .strict();
export const opcoesInput = orgInput
  .extend({ ...page, tipo: z.enum(["pessoas", "competencias"]) })
  .strict();
export const competenciaDados = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome da competência.").max(160),
    descricao: z.string().trim().max(4000).default(""),
    exige_evidencia: z.boolean(),
    exige_validade: z.boolean(),
    ativa: z.boolean().default(true),
  })
  .strict();
const saving = {
  chave: id,
  id: id.nullable().default(null),
  expected_version: version.nullable().default(null),
};
const versionRequired = (
  value: { id: string | null; expected_version: number | null },
  context: z.RefinementCtx,
) => {
  if (value.id && value.expected_version === null)
    context.addIssue({
      code: "custom",
      path: ["expected_version"],
      message: "Reabra o registro e confira a versão antes de editar.",
    });
};
export const salvarCompetenciaInput = orgInput
  .extend({ ...saving, dados: competenciaDados })
  .strict()
  .superRefine((value, context) => {
    versionRequired(value, context);
    if (!value.id && !value.dados.ativa)
      context.addIssue({
        code: "custom",
        path: ["dados", "ativa"],
        message: "Uma nova competência inicia ativa.",
      });
  });
export const qualificacaoDados = z
  .object({
    pessoa_id: id,
    competencia_id: id,
    emissor: z.string().trim().min(2, "Informe o emissor da qualificação.").max(200),
    conclusao: civilDate,
    validade: civilDate.nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.validade && value.validade < value.conclusao)
      context.addIssue({
        code: "custom",
        path: ["validade"],
        message: "A validade não pode anteceder a conclusão.",
      });
  });
export const salvarQualificacaoInput = orgInput
  .extend({ ...saving, dados: qualificacaoDados })
  .strict()
  .superRefine(versionRequired);
export const transicionarQualificacaoInput = orgInput
  .extend({
    chave: id,
    id,
    expected_version: version,
    estado: estadoQualificacao,
    motivo: z.string().trim().max(2000).nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (["enviada", "revogada"].includes(value.estado) && (value.motivo?.length ?? 0) < 5)
      context.addIssue({
        code: "custom",
        path: ["motivo"],
        message: "Explique a devolução ou revogação com ao menos cinco caracteres.",
      });
  });
const audit = {
  id,
  organization_id: id,
  version,
  created_by: id,
  created_at: z.string(),
  updated_at: z.string(),
};
export const competenciaRow = z.object({
  ...audit,
  nome: z.string(),
  descricao: z.string().nullable(),
  exige_evidencia: z.boolean(),
  exige_validade: z.boolean(),
  ativa: z.boolean(),
});
export const pessoaResumo = z.object({
  id,
  nome: z.string(),
  user_id: id.nullable(),
  ativa: z.boolean(),
});
export const qualificacaoRow = z.object({
  ...audit,
  pessoa_id: id,
  competencia_id: id,
  emissor: z.string(),
  conclusao: civilDate,
  validade: civilDate.nullable(),
  estado: estadoQualificacao,
  conferido_por: id.nullable(),
  conferido_em: z.string().nullable(),
  motivo: z.string().nullable(),
});
export const qualificacaoListaRow = qualificacaoRow.extend({
  pessoa: pessoaResumo.nullable(),
  competencia: competenciaRow
    .pick({ id: true, nome: true, ativa: true, exige_evidencia: true, exige_validade: true })
    .nullable(),
});
export const capacidades = z.object({
  gerirEquipe: z.boolean(),
  revisarOperacao: z.boolean(),
  pessoaId: id.nullable(),
});
export const competenciaDetalhe = z.object({
  registro: competenciaRow,
  usada: z.boolean(),
  permissoes: z.object({ editar: z.boolean() }),
});
export const qualificacaoDetalhe = z.object({
  registro: qualificacaoListaRow,
  permissoes: z.object({ editar: z.boolean(), conferir: z.boolean(), validar: z.boolean() }),
});
export const opcaoRow = z.object({ id, nome: z.string(), contexto: z.string() });
