import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { InspecoesEvento } from "./ui-contract";

const id = z.string().uuid();
const org = z.object({ organizationId: id });
const motivo = z.string().trim().min(5).max(2000);
const versao = z.number().int().nonnegative();
const page = z.number().int().min(0).max(10000).default(0);
const limit = 20;

function result<T>(r: { data: T; error: { code?: string; message: string } | null }) {
  if (!r.error) return r.data;
  if (r.error.code === "40001")
    throw new Error(
      "Outra pessoa alterou este registro. Seu preenchimento foi preservado; confira a revisão mais recente.",
    );
  if (["23514", "22023", "23505"].includes(r.error.code ?? "")) throw new Error(r.error.message);
  if (["42501", "23503", "PGRST116"].includes(r.error.code ?? ""))
    throw new Error("Ação indisponível neste contexto de Inspeções.");
  throw new Error("Não foi possível consultar ou salvar a alteração de Inspeções.");
}

function db(value: unknown) {
  return value as SupabaseClient;
}

export const inspecoesAtivarUnidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    org.extend({
      clienteId: id,
      unidadeId: id,
      chave: id,
      motivo,
      segmento: z.enum(["CC", "AG-A", "AG-B", "IN"]),
    }),
  )
  .handler(async ({ context, data }) => {
    result(
      await db(context.supabase).rpc("inspecoes_ativar_unidade", {
        p_org: data.organizationId,
        p_cliente: data.clienteId,
        p_unidade: data.unidadeId,
        p_segmento: data.segmento,
        p_motivo: data.motivo,
        p_chave: data.chave,
      }),
    );
    return true;
  });

export const inspecoesAcervoSalvar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    org.extend({
      clienteId: id.nullable(),
      unidadeId: id.nullable(),
      id: id.nullable(),
      versao,
      chave: id,
      dados: z
        .object({
          titulo: z.string().trim().min(2).max(1000),
          nota: z.string().trim().max(8000),
          motivo,
          codigo: z.string().trim().max(100).optional(),
          relacionado_id: id.optional(),
        })
        .strict(),
    }),
  )
  .handler(async ({ context, data }) => {
    const value = result(
      await db(context.supabase).rpc("inspecoes_acervo_salvar", {
        p_org: data.organizationId,
        p_cliente: data.clienteId,
        p_unidade: data.unidadeId,
        p_id: data.id,
        p_versao: data.versao,
        p_chave: data.chave,
        p_dados: data.dados,
      }),
    );
    return z.object({ id, versao }).parse(value);
  });

export const inspecoesApresentacaoSalvar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    org.extend({
      id,
      versao,
      chave: id,
      motivo,
      legenda: z.string().trim().max(2000),
      ordem: z.number().int().min(0).max(100000).nullable(),
    }),
  )
  .handler(async ({ context, data }) => {
    const value = result(
      await db(context.supabase).rpc("inspecoes_apresentacao_salvar", {
        p_org: data.organizationId,
        p_id: data.id,
        p_versao: data.versao,
        p_chave: data.chave,
        p_legenda: data.legenda,
        p_ordem: data.ordem,
        p_motivo: data.motivo,
      }),
    );
    return z.object({ id, versao }).parse(value);
  });

type EventoBruto = Omit<InspecoesEvento, "autor"> & { autorId: string | null };
type Raw = Partial<
  Record<
    | "colecao"
    | "dados"
    | "versao"
    | "id"
    | "arquivo_id"
    | "ensaio_id"
    | "evento"
    | "operacao"
    | "emitido_em"
    | "segmento"
    | "antes"
    | "autor_id"
    | "autor"
    | "emitido_por"
    | "ocorrido_em"
    | "registrado_em"
    | "created_at"
    | "motivo"
    | "depois"
    | "legenda"
    | "ordem",
    unknown
  >
>;

function str(value: unknown) {
  return typeof value === "string" ? value : null;
}

function obj(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as InspecoesEvento["antes"])
    : null;
}

export const inspecoesHistorico = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    org.extend({
      tipo: z.enum(["registro", "emissao", "contrato", "unidade"]),
      id,
      clienteId: id.optional(),
      pagina: page,
    }),
  )
  .handler(async ({ context, data }): Promise<{ eventos: InspecoesEvento[]; mais: boolean }> => {
    const client = db(context.supabase);
    const base = (name: string, columns: string) =>
      client.from(name).select(columns).eq("organization_id", data.organizationId);
    const queries: PromiseLike<{
      data: unknown;
      error: { code?: string; message: string } | null;
    }>[] = [];
    const take = Math.min(500, (data.pagina + 1) * limit + 1);
    if (data.tipo === "registro") {
      queries.push(
        base("inspecoes_acervo_revisoes", "versao,autor_id,ocorrido_em,motivo,antes,depois")
          .eq("registro_id", data.id)
          .order("versao", { ascending: false })
          .limit(take),
      );
      const row = result(
        await base("inspecoes_registros", "colecao").eq("id", data.id).maybeSingle(),
      ) as Raw | null;
      if (row?.colecao === "ativos") {
        const rows = result(
          await base("inspecoes_levantamentos", "id")
            .eq("ativo_id", data.id)
            .order("updated_at", { ascending: false })
            .limit(100),
        ) as unknown as { id: string }[] | null;
        const ids = rows?.map((entry) => entry.id) ?? [];
        if (ids.length) {
          queries.push(
            base("inspecoes_levantamento_eventos", "id,versao,evento,autor_id,ocorrido_em,dados")
              .in("levantamento_id", ids)
              .order("ocorrido_em", { ascending: false })
              .limit(take),
          );
          const ensaios = result(
            await base("inspecoes_ensaios", "id")
              .in("levantamento_id", ids)
              .order("updated_at", { ascending: false })
              .limit(100),
          ) as unknown as { id: string }[] | null;
          if (ensaios?.length)
            queries.push(
              base("inspecoes_ensaio_versoes", "ensaio_id,versao,autor_id,registrado_em")
                .in(
                  "ensaio_id",
                  ensaios.map((entry) => entry.id),
                )
                .order("registrado_em", { ascending: false })
                .limit(take),
            );
        }
      }
    }
    if (data.tipo === "emissao")
      queries.push(
        base("inspecoes_emissoes", "id,revisao,emitido_em,emitido_por")
          .eq("documento_id", data.id)
          .order("emitido_em", { ascending: false })
          .limit(take),
      );
    if (data.tipo === "contrato")
      queries.push(
        base("inspecoes_continuidade_eventos", "id,evento,autor_id,ocorrido_em,dados")
          .eq("contrato_id", data.id)
          .order("id", { ascending: false })
          .limit(take),
      );
    if (data.tipo === "unidade" && data.clienteId) {
      const ok = result(
        await client.rpc("inspecoes_pode", {
          p_org: data.organizationId,
          p_cliente: data.clienteId,
          p_unidade: data.id,
          p_capacidade: "consultar",
        }),
      );
      if (ok !== true) throw new Error("Histórico indisponível nesta unidade.");
      queries.push(
        base("inspecoes_contexto_eventos", "id,autor_id,ocorrido_em,motivo,segmento")
          .eq("cliente_id", data.clienteId)
          .eq("unidade_id", data.id)
          .order("id", { ascending: false })
          .limit(take),
      );
      queries.push(
        base(
          "cliente_historico",
          "id,operacao,versao,autor,created_at,motivo,unidade_id,contato_id",
        )
          .eq("cliente_id", data.clienteId)
          .or(
            `unidade_id.eq.${data.id},and(unidade_id.is.null,contato_id.is.null),and(contato_id.not.is.null,depois->>unidade_id.eq.${data.id})`,
          )
          .order("id", { ascending: false })
          .limit(take),
      );
    }
    const fileTarget = {
      registro: "registro_id",
      emissao: undefined,
      contrato: "contrato_id",
      unidade: "unidade_id",
    }[data.tipo];
    if (fileTarget) {
      let fileEvents = base(
        "inspecoes_arquivo_eventos",
        "id,arquivo_id,autor_id,evento,ocorrido_em",
      ).eq(fileTarget, data.id);
      if (data.tipo === "unidade") fileEvents = fileEvents.eq("anexo_unidade", true);
      queries.push(fileEvents.order("ocorrido_em", { ascending: false }).limit(take));
      let files = base("inspecoes_arquivos", "id").eq(fileTarget, data.id);
      if (data.tipo === "unidade") files = files.eq("anexo_unidade", true);
      const ids =
        (result(await files.order("id").limit(200)) as unknown as { id: string }[] | null)?.map(
          (x) => x.id,
        ) ?? [];
      if (ids.length) {
        queries.push(
          base(
            "inspecoes_arquivo_apresentacoes",
            "arquivo_id,versao,autor_id,ocorrido_em,motivo,antes,legenda,ordem",
          )
            .in("arquivo_id", ids)
            .order("ocorrido_em", { ascending: false })
            .limit(take),
        );
      }
    }
    const all = (await Promise.all(queries)).flatMap((response, source) =>
      ((result(response) ?? []) as Raw[]).map((r, i): EventoBruto => {
        const payload = obj(r.dados);
        const versao = typeof r.versao === "number" ? r.versao : null;
        return {
          id: `${source}:${String(r.id ?? r.arquivo_id ?? r.ensaio_id ?? i)}:${versao ?? i}`,
          evento:
            str(r.evento) ??
            str(r.operacao) ??
            (r.emitido_em
              ? "emissao"
              : r.ensaio_id
                ? "versao_ensaio"
                : r.segmento
                  ? "unidade_incluida"
                  : r.arquivo_id
                    ? "apresentacao_foto"
                    : r.antes
                      ? "correcao_acervo"
                      : "cadastro_acervo"),
          autorId: str(r.autor_id ?? r.autor ?? r.emitido_por),
          ocorridoEm: String(
            r.ocorrido_em ?? r.registrado_em ?? r.created_at ?? r.emitido_em ?? "",
          ),
          versao,
          motivo: str(r.motivo ?? payload?.["motivo"]),
          antes: obj(r.antes ?? payload?.["antes"]),
          depois:
            obj(r.depois ?? payload?.["depois"]) ??
            (r.legenda !== undefined
              ? { legenda: str(r.legenda), ordem: typeof r.ordem === "number" ? r.ordem : null }
              : null),
        };
      }),
    );
    all.sort(
      (a, b) =>
        b.ocorridoEm.localeCompare(a.ocorridoEm) ||
        b.id.localeCompare(a.id, "pt-BR", { numeric: true }),
    );
    const selected = all.slice(data.pagina * limit, (data.pagina + 1) * limit);
    const authorIds = Array.from(
      new Set(selected.flatMap((entry) => (entry.autorId ? [entry.autorId] : []))),
    );
    const members = authorIds.length
      ? await base("memberships", "user_id,nome").in("user_id", authorIds)
      : null;
    const names = new Map(
      ((members?.data ?? []) as unknown as { user_id: string; nome: string | null }[]).map(
        (row) => [row.user_id, row.nome],
      ),
    );
    return {
      eventos: selected.map(({ autorId, ...entry }) => ({
        ...entry,
        autor: autorId ? names.get(autorId) || "Usuário Nexus" : null,
      })),
      mais: all.length > (data.pagina + 1) * limit,
    };
  });
