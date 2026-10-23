import { z } from "zod";

const uuid = z.string().uuid("Selecione um registro válido.");
const org = z.object({ organization_id: uuid });
const page = z.number().int().min(0).max(100_000).default(0);
const version = z.number().int().positive("A versão aberta é obrigatória.");
const date = z.string().date("Informe uma data válida.");

export const equipeRow = z.object({
  id: uuid,
  organization_id: uuid,
  nome: z.string(),
  lider_id: uuid.nullable(),
  ativa: z.boolean(),
  version,
  created_by: uuid,
  created_at: z.string(),
  updated_at: z.string(),
});
export const membroEquipeRow = z.object({
  id: uuid,
  organization_id: uuid,
  equipe_id: uuid,
  pessoa_id: uuid,
  inicio: date,
  fim: date.nullable(),
  created_by: uuid,
  created_at: z.string(),
});
export const pessoaEquipeRow = z.object({
  id: uuid,
  nome: z.string(),
  funcao: z.string().nullable(),
  ativa: z.boolean(),
});
export const equipeDados = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe ao menos dois caracteres.")
    .max(120, "Máximo de 120 caracteres."),
  lider_id: uuid.nullable().default(null),
  ativa: z.boolean().default(true),
});
export const listarEquipesInput = org.extend({
  busca: z.string().trim().max(120, "Máximo de 120 caracteres.").default(""),
  pagina: page,
  arquivadas: z.boolean().default(false),
});
export const obterEquipeInput = org.extend({ id: uuid, paginaMembros: page });
export const salvarEquipeInput = org
  .extend({
    chave: uuid,
    id: uuid.nullable().default(null),
    expected_version: version.nullable().default(null),
    dados: equipeDados,
  })
  .superRefine((data, ctx) => {
    if (data.id && !data.expected_version)
      ctx.addIssue({
        code: "custom",
        path: ["expected_version"],
        message: "Reabra a equipe antes de editar.",
      });
    if (!data.id && !data.dados.ativa)
      ctx.addIssue({
        code: "custom",
        path: ["dados", "ativa"],
        message: "Uma nova equipe inicia ativa.",
      });
  });
export const vincularMembroInput = org
  .extend({
    chave: uuid,
    equipe_id: uuid,
    pessoa_id: uuid,
    inicio: date,
    fim: date.nullable().default(null),
  })
  .superRefine((data, ctx) => {
    if (data.fim && data.fim < data.inicio)
      ctx.addIssue({
        code: "custom",
        path: ["fim"],
        message: "O fim não pode ser anterior ao início.",
      });
  });
export const encerrarMembroInput = org.extend({
  chave: uuid,
  id: uuid,
  fim: date,
  motivo: z
    .string()
    .trim()
    .min(5, "Explique o motivo com ao menos cinco caracteres.")
    .max(2000, "Máximo de 2000 caracteres."),
});
export const buscarPessoasEquipeInput = org.extend({
  busca: z.string().trim().max(120).default(""),
  pagina: page,
});

const permissoes = z.object({ gerir: z.boolean() });
export const equipeListagemSchema = z.object({
  rows: equipeRow.array(),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.literal(25),
  permissoes,
});
export const equipeMembroDetalheRow = membroEquipeRow.extend({
  pessoa_nome: z.string().nullable(),
  pessoa_funcao: z.string().nullable(),
  pessoa_ativa: z.boolean().nullable(),
  pode_encerrar: z.boolean(),
});
export const equipeDetalheSchema = z.object({
  equipe: equipeRow,
  lider: pessoaEquipeRow.nullable(),
  membros: z.object({
    rows: equipeMembroDetalheRow.array(),
    total: z.number().int().nonnegative(),
    pagina: z.number().int().nonnegative(),
    limite: z.literal(25),
  }),
  permissoes: permissoes.extend({ editar: z.boolean(), incluir: z.boolean() }),
});
export const pessoasEquipeOpcoesSchema = z.object({
  rows: z.object({ id: uuid, nome: z.string(), contexto: z.string() }).array(),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.literal(25),
});
