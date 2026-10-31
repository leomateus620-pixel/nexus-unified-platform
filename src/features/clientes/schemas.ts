import { z } from "zod";

export const clienteMarcaSchema = z.object({
  caminho: z.string().min(1).max(500),
  origem: z.string().max(1000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.enum(["image/png", "image/jpeg", "image/svg+xml"]),
  largura: z.number().int().positive().max(8192),
  altura: z.number().int().positive().max(8192),
  tamanho: z.number().int().positive().max(1048576),
  url: z.string().optional(),
  superficie: z.enum(["clara", "escura"]).optional(),
});
export type ClienteMarca = z.infer<typeof clienteMarcaSchema>;
export const clienteMarcaUploadSchema = z.object({
  nome: z.string().min(1).max(200),
  mime: z.enum(["image/png", "image/jpeg"]),
  base64: z.string().min(1).max(1398104),
  superficie: z.enum(["clara", "escura"]).optional(),
});

export const clienteDados = z.object({
  razao_social: z
    .string()
    .trim()
    .min(2, "Informe ao menos dois caracteres.")
    .max(200, "Máximo de 200 caracteres."),
  nome_exibicao: z.string().trim().max(200, "Máximo de 200 caracteres."),
  cnpj: z
    .string()
    .trim()
    .max(32, "Máximo de 32 caracteres.")
    .regex(/^[A-Za-z0-9 ./-]*$/, "Use letras, números e pontuação de formato."),
  cidade: z.string().trim().max(100, "Máximo de 100 caracteres."),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{2})?$/, "Informe duas letras ou deixe em branco."),
  observacoes: z.string().trim().max(4000, "Máximo de 4000 caracteres."),
});
export const unidadeDados = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe ao menos dois caracteres.")
    .max(200, "Máximo de 200 caracteres."),
  endereco: z.string().trim().max(500, "Máximo de 500 caracteres."),
  distancia_ida_volta_km: z
    .number()
    .finite("Informe uma distância válida.")
    .min(0, "A distância não pode ser negativa.")
    .max(99999999, "Confira a distância informada.")
    .nullable(),
  observacoes: z.string().trim().max(4000, "Máximo de 4000 caracteres."),
});
export const contatoDados = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe ao menos dois caracteres.")
    .max(200, "Máximo de 200 caracteres."),
  cargo: z.string().trim().max(150, "Máximo de 150 caracteres."),
  email: z
    .string()
    .trim()
    .max(254, "Máximo de 254 caracteres.")
    .email("Informe um e-mail válido.")
    .or(z.literal("")),
  telefone: z.string().trim().max(40, "Máximo de 40 caracteres."),
  unidade_id: z.string().uuid("Selecione uma unidade válida.").nullable(),
  observacoes: z.string().trim().max(4000, "Máximo de 4000 caracteres."),
});
const baseRow = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
  arquivado_em: z.string().nullable(),
  motivo_arquivo: z.string().nullable(),
  observacoes: z.string().nullable(),
});
export const clienteRow = baseRow.extend({
  razao_social: z.string(),
  nome_exibicao: z.string().nullable(),
  cnpj: z.string().nullable(),
  identificador_normalizado: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  situacao: z.string(),
  marca: clienteMarcaSchema.nullable().optional(),
});
export const unidadeRow = baseRow.extend({
  cliente_id: z.string().uuid(),
  nome: z.string(),
  endereco: z.string().nullable(),
  distancia_ida_volta_km: z.number().nullable(),
});
export const contatoRow = baseRow.extend({
  cliente_id: z.string().uuid(),
  nome: z.string(),
  cargo: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  unidade_id: z.string().uuid().nullable(),
  unidade_nome: z.string().nullable().optional(),
});
export const historicoRow = z.object({
  id: z.number().int(),
  cliente_id: z.string().uuid(),
  unidade_id: z.string().uuid().nullable(),
  contato_id: z.string().uuid().nullable(),
  operacao: z.enum(["criado", "alterado", "arquivado", "reativado"]),
  versao: z.number().int(),
  motivo: z.string().nullable(),
  created_at: z.string(),
});
export type Cliente = z.infer<typeof clienteRow>;
export type Unidade = z.infer<typeof unidadeRow>;
export type Contato = z.infer<typeof contatoRow>;
export type HistoricoCliente = z.infer<typeof historicoRow>;
export type Cadastro = Cliente | Unidade | Contato;
export type CadastroGrupo = "clientes" | "unidades" | "contatos";
export type ListGrupo = CadastroGrupo | "historico";
export type SituacaoFiltro = "ativos" | "arquivados" | "todos";
export type Lista<T> = { rows: T[]; total: number; page: number; pageSize: number };

export const orgInput = z.object({ organization_id: z.string().uuid() });
export const listInput = orgInput
  .extend({
    grupo: z.enum(["clientes", "unidades", "contatos", "historico"]),
    cliente_id: z.string().uuid().nullable().default(null),
    busca: z.string().trim().max(120).default(""),
    situacao: z.enum(["ativos", "arquivados", "todos"]).default("ativos"),
    pagina: z.number().int().min(0).max(100000).default(0),
    limite: z.number().int().min(1).max(50).default(25),
  })
  .refine((v) => v.grupo === "clientes" || v.cliente_id, {
    message: "Selecione um cliente.",
    path: ["cliente_id"],
  });
const saveBase = orgInput.extend({
  chave: z.string().uuid(),
  id: z.string().uuid().nullable().default(null),
  expected_version: z.number().int().positive().nullable().default(null),
});
export const salvarClienteInput = saveBase.extend({
  dados: clienteDados,
  marca_upload: clienteMarcaUploadSchema.optional(),
  remover_marca: z.boolean().optional(),
});
export const salvarUnidadeInput = saveBase.extend({
  cliente_id: z.string().uuid(),
  dados: unidadeDados,
});
export const salvarContatoInput = saveBase.extend({
  cliente_id: z.string().uuid(),
  dados: contatoDados,
});
export const arquivarInput = saveBase.extend({
  id: z.string().uuid(),
  expected_version: z.number().int().positive(),
  entidade: z.enum(["clientes", "unidades", "contatos"]),
  arquivar: z.boolean(),
  motivo: z
    .string()
    .trim()
    .min(3, "Explique o motivo com ao menos três caracteres.")
    .max(1000, "Máximo de 1000 caracteres."),
});
export const detailInput = orgInput.extend({ id: z.string().uuid() });

export function identificadorNormalizado(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
export function cadastroArquivado(grupo: CadastroGrupo, row: Cadastro) {
  return grupo === "clientes" && "situacao" in row
    ? row.situacao !== "Ativo"
    : row.arquivado_em !== null;
}
