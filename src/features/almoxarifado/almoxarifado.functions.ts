import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALMOXARIFADO_ACESSO_INDISPONIVEL } from "./domain";
import {
  buscarOpcoesAlmoxarifadoSchema,
  comandoAlmoxarifadoSchema,
  detalheAlmoxarifadoSchema,
  listaAlmoxarifadoSchema,
  listarAlmoxarifadoSchema,
  obterAlmoxarifadoSchema,
  opcoesAlmoxarifadoRespostaSchema,
  paginacaoAlmoxarifadoSchema,
  permissoesAlmoxarifadoSchema,
  resultadoComandoAlmoxarifadoSchema,
} from "./schemas";

// A fronteira aditiva valida entradas e DTOs; os tipos Supabase seguem geração oficial.
const client = (value: unknown) => value as SupabaseClient;
function result(response: {
  data: unknown;
  error: { code?: string; message: string } | null;
}): unknown {
  if (response.error) {
    const { code } = response.error;
    if (["42501", "23503"].includes(code ?? "")) throw new Error(ALMOXARIFADO_ACESSO_INDISPONIVEL);
    if (code === "40001")
      throw new Error(
        "O registro ou sua disponibilidade mudou. Seu preenchimento foi preservado; recarregue e confira antes de confirmar.",
      );
    if (code === "23505")
      throw new Error(
        "Origem já registrada ou chave repetida com conteúdo diferente. Confira o histórico antes de repetir.",
      );
    if (["PGRST202", "42P01", "42883"].includes(code ?? ""))
      throw new Error(
        "O banco ainda não recebeu o fluxo de almoxarifado (migração 0023). Seu preenchimento permanece disponível.",
      );
    if (code === "23514") throw new Error(response.error.message);
    throw new Error(
      "Não foi possível confirmar a consulta ou operação. Tente novamente; o preenchimento foi preservado.",
    );
  }
  return response.data;
}

const rawList = paginacaoAlmoxarifadoSchema.extend({
  registros: z.unknown().array(),
  permissoes: permissoesAlmoxarifadoSchema,
});

export const listarAlmoxarifado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listarAlmoxarifadoSchema)
  .handler(async ({ context, data }) => {
    const response = rawList.parse(
      result(
        await client(context.supabase).rpc("alm_listar", {
          _org: data.organization_id,
          _tipo: data.tipo,
          _busca: data.busca,
          _estado: data.estado,
          _local: data.local_id,
          _pagina: data.pagina,
          _limite: data.limite,
        }),
      ),
    );
    return listaAlmoxarifadoSchema.parse({
      tipo: data.tipo,
      rows: response.registros,
      total: response.total,
      page: response.pagina,
      pageSize: response.limite,
      permissoes: response.permissoes,
    });
  });

export const obterAlmoxarifado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(obterAlmoxarifadoSchema)
  .handler(async ({ context, data }) => {
    const detail = detalheAlmoxarifadoSchema.parse(
      result(
        await client(context.supabase).rpc("alm_obter", {
          _org: data.organization_id,
          _tipo: data.tipo,
          _id: data.id,
        }),
      ),
    );
    if (detail.tipo !== data.tipo || detail.id !== data.id || detail.registro.id !== data.id)
      throw new Error(
        "A resposta não corresponde ao registro consultado. Recarregue e tente novamente.",
      );
    return detail;
  });

export const executarAlmoxarifado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(comandoAlmoxarifadoSchema)
  .handler(async ({ context, data }) => {
    const { organization_id, chave, comando, ...dados } = data;
    return resultadoComandoAlmoxarifadoSchema.parse(
      result(
        await client(context.supabase).rpc("alm_executar", {
          _org: organization_id,
          _chave: chave,
          _comando: comando,
          _dados: dados,
        }),
      ),
    );
  });

export const buscarOpcoesAlmoxarifado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(buscarOpcoesAlmoxarifadoSchema)
  .handler(async ({ context, data }) => {
    const rows = opcoesAlmoxarifadoRespostaSchema.parse(
      result(
        await client(context.supabase).rpc("alm_opcoes", {
          _org: data.organization_id,
          _tipo: data.tipo,
          _busca: data.busca,
          _local: data.local_id,
          _pagina: data.pagina,
          _limite: data.limite,
        }),
      ),
    );
    return { rows: rows.registros, total: rows.total, page: rows.pagina, pageSize: rows.limite };
  });
