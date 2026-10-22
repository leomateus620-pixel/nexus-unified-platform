import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ESTUDO_ACESSO_INDISPONIVEL } from "./domain";
import {
  buscarOpcoesEstudoSchema,
  comandoEstudoSchema,
  detalheEstudoSchema,
  estudoDetalheSchema,
  estudoListaRow,
  listarEstudosSchema,
  listarMetodosEstudoSchema,
  metodoEstudoRow,
  metodoEstudoVersaoRow,
  opcaoEstudoRow,
  publicarMetodoEstudoSchema,
  vincularAcaoEstudoSchema,
} from "./schemas";

// Contrato aditivo validado nesta fronteira; tipos de integração continuam gerados pelo projeto.
const client = (value: unknown) => value as SupabaseClient;
function result(response: {
  data: unknown;
  error: { code?: string; message: string } | null;
}): unknown {
  if (response.error) {
    const { code } = response.error;
    if (code === "40001")
      throw new Error(
        "O estudo ou uma de suas fontes mudou. Seu preenchimento foi preservado; recarregue e compare antes de salvar.",
      );
    if (code === "23505")
      throw new Error(
        "Origem já vinculada ou chave repetida com conteúdo diferente. Confira o registro existente antes de repetir.",
      );
    if (["42501", "23503"].includes(code ?? "")) throw new Error(ESTUDO_ACESSO_INDISPONIVEL);
    if (["PGRST202", "42P01", "42883"].includes(code ?? ""))
      throw new Error(
        "O banco ainda não recebeu o fluxo de estudos técnicos (migração 0022). Seu preenchimento permanece disponível.",
      );
    throw new Error(response.error.message);
  }
  return response.data;
}
const pageMetadata = {
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.number().int().positive(),
};
const permissoesCatalogo = z.object({ criar: z.boolean(), publicar_metodo: z.boolean() });
const rawList = z.object({
  registros: estudoListaRow.array(),
  permissoes: permissoesCatalogo,
  ...pageMetadata,
});
const rawMethods = z.object({
  registros: metodoEstudoVersaoRow.array(),
  permissoes: z.object({ publicar_metodo: z.boolean() }),
  ...pageMetadata,
});
const rawOptions = z.object({ registros: opcaoEstudoRow.array(), ...pageMetadata });

export const listarEstudos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listarEstudosSchema)
  .handler(async ({ context, data }) => {
    const rows = rawList.parse(
      result(
        await client(context.supabase).rpc("est_listar", {
          _org: data.organization_id,
          _busca: data.busca,
          _estado: data.estado,
          _responsavel: data.responsavel_id,
          _pagina: data.pagina,
          _limite: data.limite,
          _cliente: data.cliente_id,
        }),
      ),
    );
    return {
      rows: rows.registros,
      total: rows.total,
      page: rows.pagina,
      pageSize: rows.limite,
      permissoes: rows.permissoes,
    };
  });
export const obterEstudo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(detalheEstudoSchema)
  .handler(async ({ context, data }) =>
    estudoDetalheSchema.parse(
      result(
        await client(context.supabase).rpc("est_obter", {
          _org: data.organization_id,
          _id: data.estudo_id,
          _revisao: data.revisao_id,
        }),
      ),
    ),
  );
export const executarEstudo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(comandoEstudoSchema)
  .handler(async ({ context, data }) => {
    const { organization_id, chave, comando, tipo_fonte, ...dados } = data;
    const payload = comando === "vincular_fonte" ? { ...dados, tipo: tipo_fonte } : dados;
    return estudoDetalheSchema.parse(
      result(
        await client(context.supabase).rpc("est_executar", {
          _org: organization_id,
          _chave: chave,
          _comando: comando,
          _dados: payload,
        }),
      ),
    );
  });
export const publicarMetodoEstudo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(publicarMetodoEstudoSchema)
  .handler(async ({ context, data }) => {
    const { organization_id, chave, metodo_id, ...dados } = data;
    return z.object({ metodo: metodoEstudoRow, versao: metodoEstudoVersaoRow }).parse(
      result(
        await client(context.supabase).rpc("est_publicar_metodo", {
          _org: organization_id,
          _chave: chave,
          _metodo: metodo_id,
          _dados: dados,
        }),
      ),
    );
  });
export const listarMetodosEstudo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listarMetodosEstudoSchema)
  .handler(async ({ context, data }) => {
    const rows = rawMethods.parse(
      result(
        await client(context.supabase).rpc("est_metodos", {
          _org: data.organization_id,
          _busca: data.busca,
          _pagina: data.pagina,
          _limite: data.limite,
        }),
      ),
    );
    return {
      rows: rows.registros,
      total: rows.total,
      page: rows.pagina,
      pageSize: rows.limite,
      permissoes: rows.permissoes,
    };
  });
export const buscarOpcoesEstudo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(buscarOpcoesEstudoSchema)
  .handler(async ({ context, data }) => {
    // O RPC filtra estado e acesso por cada pai; não consultar cadastros/snapshots amplos no browser.
    const rows = rawOptions.parse(
      result(
        await client(context.supabase).rpc("est_opcoes", {
          _org: data.organization_id,
          _tipo: data.tipo,
          _busca: data.busca,
          _cliente: data.cliente_id,
          _unidade: data.unidade_id,
          _pagina: data.pagina,
        }),
      ),
    );
    return { rows: rows.registros, total: rows.total, page: rows.pagina, pageSize: rows.limite };
  });
export const vincularAcaoEstudo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(vincularAcaoEstudoSchema)
  .handler(async ({ context, data }) => {
    const { organization_id, chave, medida_id, ...dados } = data;
    return z
      .object({
        acao_id: z.string().uuid(),
        linhagem_id: z.string().uuid(),
        estudo_id: z.string().uuid(),
        revisao_id: z.string().uuid(),
      })
      .parse(
        result(
          await client(context.supabase).rpc("est_vincular_acao", {
            _org: organization_id,
            _chave: chave,
            _medida: medida_id,
            _dados: dados,
          }),
        ),
      );
  });
