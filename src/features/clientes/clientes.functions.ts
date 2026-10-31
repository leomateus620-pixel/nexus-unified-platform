import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { assinarMarcas } from "./marca.server";
import { CLIENTE_MARCA_BUCKET, CLIENTE_MARCA_MAX_BYTES, dimensoesMarca } from "./marca";
import { sha256Nr, validarBinarioNr } from "@/features/nr/files";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  arquivarInput,
  clienteRow,
  contatoRow,
  detailInput,
  historicoRow,
  listInput,
  salvarClienteInput,
  salvarContatoInput,
  salvarUnidadeInput,
  unidadeRow,
} from "./schemas";

// Fronteira temporária do schema aditivo; arquivos gerados continuam pertencendo ao gerador.
const dbClient = (db: unknown) => db as SupabaseClient;
function result(r: { data: unknown; error: { code?: string; message: string } | null }) {
  if (r.error) {
    if (r.error.code === "40001")
      throw new Error(
        "Outra pessoa alterou este registro. Seu preenchimento foi preservado. Recarregue e compare antes de tentar salvar novamente.",
      );
    if (r.error.code === "23505")
      throw new Error(
        "Identificador fiscal já cadastrado ou chave reutilizada com conteúdo diferente. Localize o cadastro existente e confira a operação.",
      );
    if (["42501", "23503"].includes(r.error.code ?? ""))
      throw new Error("Registro indisponível ou sem permissão para esta ação.");
    if (["PGRST202", "42883"].includes(r.error.code ?? ""))
      throw new Error(
        "O cadastro operacional ainda não está disponível nesta versão do banco. Seu preenchimento foi preservado; solicite a aplicação da migração 0013.",
      );
    throw new Error(r.error.message);
  }
  return r.data;
}
const listResult = <T extends z.ZodTypeAny>(row: T) =>
  z.object({
    rows: row.array(),
    total: z.number().int().nonnegative(),
    page: z.number().int(),
    pageSize: z.number().int().positive(),
  });
export const listarCadastrosCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listInput)
  .handler(async ({ context, data }) => {
    const r = result(
      await dbClient(context.supabase).rpc("listar_cadastros_cliente", {
        _org: data.organization_id,
        _grupo: data.grupo,
        _cliente: data.cliente_id,
        _busca: data.busca,
        _situacao: data.situacao,
        _pagina: data.pagina,
        _limite: data.limite,
      }),
    );
    if (data.grupo === "clientes") {
      const parsed = listResult(clienteRow).parse(r);
      return { ...parsed, rows: await assinarMarcas(dbClient(context.supabase), parsed.rows) };
    }
    if (data.grupo === "unidades") return listResult(unidadeRow).parse(r);
    if (data.grupo === "contatos") return listResult(contatoRow).parse(r);
    return listResult(historicoRow).parse(r);
  });
export const obterCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(detailInput)
  .handler(async ({ context, data }) =>
    clienteRow.parse(
      result(
        await dbClient(context.supabase).rpc("obter_cliente_operacional", {
          _org: data.organization_id,
          _id: data.id,
        }),
      ),
    ),
  );
export const obterCadastro = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(detailInput.extend({ entidade: z.enum(["clientes", "unidades", "contatos"]) }))
  .handler(async ({ context, data }) => {
    const r = result(
      await dbClient(context.supabase).rpc("obter_cadastro_cliente", {
        _org: data.organization_id,
        _entidade: data.entidade,
        _id: data.id,
      }),
    );
    if (data.entidade === "clientes")
      return (await assinarMarcas(dbClient(context.supabase), [clienteRow.parse(r)]))[0]!;
    return data.entidade === "unidades" ? unidadeRow.parse(r) : contatoRow.parse(r);
  });
export const salvarCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(salvarClienteInput)
  .handler(async ({ context, data }) => {
    const db = dbClient(context.supabase);
    let marca: unknown = data.remover_marca ? null : undefined;
    if (data.marca_upload) {
      if (
        result(await db.rpc("pode", { _org: data.organization_id, _acao: "editar_cadastro" })) !==
        true
      )
        throw new Error("Sem permissão para alterar a marca deste cliente.");
      const binary = atob(data.marca_upload.base64);
      const bytes = Uint8Array.from(binary, (letter) => letter.charCodeAt(0));
      if (!bytes.length || bytes.length > CLIENTE_MARCA_MAX_BYTES)
        throw new Error("A marca deve ter até 1 MiB.");
      const sha256 = await sha256Nr(bytes);
      await validarBinarioNr(
        bytes,
        {
          nome: data.marca_upload.nome,
          mime: data.marca_upload.mime,
          tamanho: bytes.length,
          sha256,
        },
        {
          max_bytes: CLIENTE_MARCA_MAX_BYTES,
          mime_types: ["image/png", "image/jpeg"],
          extensoes: ["png", "jpg", "jpeg"],
        },
      );
      const dimensions = dimensoesMarca(bytes, data.marca_upload.mime);
      const caminho = `${data.organization_id}/${context.userId}/${sha256}.${data.marca_upload.mime === "image/png" ? "png" : "jpg"}`;
      const transfer = await db.storage.from(CLIENTE_MARCA_BUCKET).upload(caminho, bytes, {
        contentType: data.marca_upload.mime,
        upsert: false,
        metadata: { sha256 },
      });
      // Caminho por hash: uma repetição reaproveita bytes idênticos em vez de criar outro objeto.
      if (
        transfer.error &&
        !["409", "Duplicate"].includes(String(transfer.error.statusCode)) &&
        !/already exists|duplicate/i.test(transfer.error.message)
      )
        throw new Error("Não foi possível enviar a marca. Seu preenchimento foi preservado.");
      const readback = await db.storage.from(CLIENTE_MARCA_BUCKET).download(caminho);
      if (readback.error || !readback.data)
        throw new Error(
          "Não foi possível conferir a marca armazenada. O cadastro não foi alterado; seu preenchimento foi preservado.",
        );
      await validarBinarioNr(
        new Uint8Array(await readback.data.arrayBuffer()),
        {
          nome: data.marca_upload.nome,
          mime: data.marca_upload.mime,
          tamanho: bytes.length,
          sha256,
        },
        {
          max_bytes: CLIENTE_MARCA_MAX_BYTES,
          mime_types: ["image/png", "image/jpeg"],
          extensoes: ["png", "jpg", "jpeg"],
        },
      );
      marca = {
        caminho,
        origem: "Cadastro do cliente — arquivo enviado pelo usuário",
        sha256,
        mime: data.marca_upload.mime,
        tamanho: bytes.length,
        superficie: data.marca_upload.superficie ?? "clara",
        ...dimensions,
      };
    }
    const saved = clienteRow.parse(
      result(
        await db.rpc("salvar_cliente_operacional", {
          _org: data.organization_id,
          _chave: data.chave,
          _dados: { ...data.dados, ...(marca !== undefined ? { marca } : {}) },
          _id: data.id,
          _expected_version: data.expected_version,
        }),
      ),
    );
    return (await assinarMarcas(db, [saved]))[0]!;
  });
export const salvarUnidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(salvarUnidadeInput)
  .handler(async ({ context, data }) =>
    unidadeRow.parse(
      result(
        await dbClient(context.supabase).rpc("salvar_unidade_operacional", {
          _org: data.organization_id,
          _chave: data.chave,
          _cliente: data.cliente_id,
          _dados: data.dados,
          _id: data.id,
          _expected_version: data.expected_version,
        }),
      ),
    ),
  );
export const salvarContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(salvarContatoInput)
  .handler(async ({ context, data }) =>
    contatoRow.parse(
      result(
        await dbClient(context.supabase).rpc("salvar_contato_operacional", {
          _org: data.organization_id,
          _chave: data.chave,
          _cliente: data.cliente_id,
          _dados: data.dados,
          _id: data.id,
          _expected_version: data.expected_version,
        }),
      ),
    ),
  );
export const arquivarCadastro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(arquivarInput)
  .handler(async ({ context, data }) => {
    const r = result(
      await dbClient(context.supabase).rpc("arquivar_cadastro_cliente", {
        _org: data.organization_id,
        _chave: data.chave,
        _entidade: data.entidade,
        _id: data.id,
        _expected_version: data.expected_version,
        _arquivar: data.arquivar,
        _motivo: data.motivo,
      }),
    );
    if (data.entidade === "clientes")
      return (await assinarMarcas(dbClient(context.supabase), [clienteRow.parse(r)]))[0]!;
    return data.entidade === "unidades" ? unidadeRow.parse(r) : contatoRow.parse(r);
  });
