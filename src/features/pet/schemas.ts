import { z } from "zod";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export const jsonValue: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(jsonValue),
  ]),
);

export const orgInput = z.object({ organization_id: z.string().uuid() });
export const obterInput = orgInput.extend({ id: z.string().uuid() });
export const listarInput = orgInput.extend({
  filtros: z
    .object({
      unidade_id: z.string().uuid().optional(),
      os_id: z.string().uuid().optional(),
      busca: z.string().trim().max(120).optional(),
      pagina: z.number().int().min(0).optional(),
      limite: z.number().int().min(1).max(100).optional(),
    })
    .strict()
    .optional(),
});
const commands = [
  "criar_os",
  "iniciar_os",
  "concluir_os",
  "salvar_espaco",
  "salvar_modelo",
  "aprovar_modelo",
  "criar_pet",
  "salvar_rascunho",
  "conferir",
  "preparar_assinatura",
  "emitir",
  "registrar_entrada",
  "registrar_saida",
  "registrar_avaliacao",
  "interromper",
  "avaliar_prorrogacao",
  "trocar_vigia",
  "encerrar",
  "cancelar",
  "retificar",
  "solicitar_documento",
] as const;
export const executarInput = orgInput.extend({
  comando: z
    .object({ chave: z.string().uuid(), comando: z.enum(commands), dados: z.record(jsonValue) })
    .strict(),
});
// SQL validates each command transactionally. No client-supplied actor, signature
// validation result or computed duration is accepted as an authoritative fact.
export const objectResult = z.record(jsonValue);
export const listaResult = z
  .object({ registros: z.array(objectResult), ordens: z.array(objectResult), total: z.number() })
  .catchall(jsonValue);
export const detalheResult = z
  .object({
    pet: objectResult,
    participantes: z.array(objectResult),
    presencas: z.array(objectResult),
    intervalos: z.array(objectResult),
    assinaturas: z.array(objectResult),
    documentos: z.array(objectResult),
    pendencias: z.array(jsonValue),
    metricas: objectResult,
    permissoes: objectResult,
  })
  .catchall(jsonValue);
export const opcoesResult = z
  .object({
    clientes: z.array(objectResult),
    unidades: z.array(objectResult),
    pessoas: z.array(objectResult),
    espacos: z.array(objectResult),
    modelos: z.array(objectResult),
    ordens: z.array(objectResult),
    integracao_assinatura: objectResult,
  })
  .catchall(jsonValue);
