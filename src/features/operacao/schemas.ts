import { z } from "zod";

export const orgInput = z.object({ organization_id: z.string().uuid() });
export const listInput = orgInput.extend({
  busca: z.string().trim().max(120).default(""),
  pagina: z.number().int().min(0).default(0),
  arquivados: z.boolean().default(false),
});
export const pessoaDados = z.object({
  nome: z.string().trim().min(2, "Informe ao menos dois caracteres.").max(200),
  vinculo: z.enum(["colaborador", "prestador", "parceiro"]),
  funcao: z.string().trim().max(160).default(""),
  email_profissional: z.union([z.string().email("E-mail inválido."), z.literal("")]).default(""),
  telefone_profissional: z.string().trim().max(40).default(""),
  registro_profissional: z.string().trim().max(120).default(""),
  user_id: z.string().uuid().nullable().default(null),
  ativa: z.boolean().default(true),
});
export const pessoaRow = pessoaDados.extend({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  version: z.number().int(),
  funcao: z.string().nullable(),
  email_profissional: z.string().nullable(),
  telefone_profissional: z.string().nullable(),
  registro_profissional: z.string().nullable(),
});
export type Pessoa = z.infer<typeof pessoaRow>;
export const salvarPessoaInput = orgInput.extend({
  chave: z.string().uuid(),
  dados: pessoaDados,
  id: z.string().uuid().nullable().default(null),
  expected_version: z.number().int().positive().nullable().default(null),
});
export const acaoDados = z.object({
  titulo: z
    .string()
    .trim()
    .min(3, "Informe ao menos três caracteres.")
    .max(200, "Máximo de 200 caracteres."),
  descricao: z.string().trim().max(10000, "Máximo de 10000 caracteres.").default(""),
  responsavel_id: z.string().uuid("Selecione uma pessoa responsável."),
  prazo: z.string().date("Informe uma data válida.").or(z.literal("")).default(""),
  prioridade: z.enum(["baixa", "normal", "alta", "critica"]).default("normal"),
  exige_verificacao: z.boolean().default(true),
});
export const acaoRow = acaoDados.extend({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  version: z.number().int(),
  prazo: z.string().nullable(),
  estado: z.enum(["aberta", "em_execucao", "aguardando_verificacao", "concluida", "cancelada"]),
  conclusao: z.string().nullable(),
  motivo: z.string().nullable(),
});
export type AcaoOperacional = z.infer<typeof acaoRow>;
export const salvarAcaoInput = orgInput.extend({
  chave: z.string().uuid(),
  dados: acaoDados,
  id: z.string().uuid().nullable().default(null),
  expected_version: z.number().int().positive().nullable().default(null),
});
export const transicaoInput = orgInput.extend({
  chave: z.string().uuid(),
  id: z.string().uuid(),
  expected_version: z.number().int().positive(),
  estado: acaoRow.shape.estado,
  motivo: z.string().trim().max(10000).nullable().default(null),
});
export const anexoRow = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  nome: z.string(),
  mime: z.string(),
  tamanho: z.number(),
  sha256: z.string(),
  caminho: z.string(),
  estado: z.enum(["pendente", "enviado", "vinculado", "cancelado"]),
  pessoa_id: z.string().uuid().nullable(),
  acao_id: z.string().uuid().nullable(),
  qualificacao_id: z.string().uuid().nullable(),
  // Read defaults also accept an older idempotent receipt without these additive columns.
  ferramenta_id: z.string().uuid().nullable().default(null),
  calibracao_id: z.string().uuid().nullable().default(null),
  agenda_evento_id: z.string().uuid().nullable().default(null),
});
export type Anexo = z.infer<typeof anexoRow>;
export const anexoPai = orgInput
  .extend({
    pessoa_id: z.string().uuid().nullable().default(null),
    acao_id: z.string().uuid().nullable().default(null),
    qualificacao_id: z.string().uuid().nullable().default(null),
    // Do not default new input keys: changing legacy JSON changes its stored request hash.
    ferramenta_id: z.string().uuid().nullable().optional(),
    calibracao_id: z.string().uuid().nullable().optional(),
    agenda_evento_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (x) =>
      [
        x.pessoa_id,
        x.acao_id,
        x.qualificacao_id,
        x.ferramenta_id,
        x.calibracao_id,
        x.agenda_evento_id,
      ].filter(Boolean).length === 1,
    "Escolha uma origem.",
  );
export const uploadInput = z.object({
  pai: anexoPai,
  chave: z.string().uuid(),
  nome: z.string().min(1).max(240),
  mime: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
  tamanho: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const fileInput = orgInput.extend({ id: z.string().uuid() });
export const anexoListagemRow = anexoRow.extend({
  pode_retomar: z.boolean(),
  pode_cancelar: z.boolean(),
});
export const anexosListaSchema = z.object({
  registros: anexoListagemRow.array().max(50),
  permissoes: z.object({ adicionar: z.boolean() }),
});
export const cancelarAnexoInput = fileInput.extend({
  chave: z.string().uuid(),
  motivo: z.string().trim().min(5, "Explique o motivo com ao menos cinco caracteres.").max(2000),
});
