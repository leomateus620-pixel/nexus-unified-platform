import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  adocaoPreviewRow,
  adotarMedidaSchema,
  buscarOpcoesLevantamentoSchema,
  buscarSistemasAdocaoSchema,
  comandoLevantamentoSchema,
  detalheLevantamentoSchema,
  levantamentoAdocaoRow,
  levantamentoDetalheSchema,
  levantamentoListaRow,
  levantamentoModeloRow,
  listarLevantamentosSchema,
  previaAdocaoSchema,
  publicarModeloLevantamentoSchema,
} from "./schemas";

// Tipos gerados são mantidos pelo gerador; esta fronteira valida o schema aditivo.
const client = (db: unknown) => db as SupabaseClient;
function result(response: {
  data: unknown;
  error: { code?: string; message: string } | null;
}): unknown {
  if (response.error) {
    const { code } = response.error;
    if (code === "40001")
      throw new Error(
        "Outra pessoa alterou este registro ou a comparação ficou desatualizada. Seu preenchimento foi preservado; recarregue e compare antes de salvar.",
      );
    if (code === "23505")
      throw new Error(
        "Código/chave já utilizado ou operação repetida com conteúdo diferente. Confira o registro existente antes de repetir.",
      );
    if (["42501", "23503"].includes(code ?? ""))
      throw new Error("Registro indisponível para seu acesso atual.");
    if (["PGRST202", "42P01", "42883"].includes(code ?? ""))
      throw new Error(
        "O banco ainda não recebeu o fluxo de Levantamentos Técnicos (migração 0021). Seu preenchimento permanece disponível.",
      );
    throw new Error(response.error.message);
  }
  return response.data;
}
async function exigirGestao(db: SupabaseClient, org: string) {
  if (result(await db.rpc("operacao_pode", { _org: org, _acao: "gerir_operacao" })) !== true)
    throw new Error("Seu acesso atual não permite consultar opções de cadastro de levantamentos.");
}
const rawList = z.object({
  registros: levantamentoListaRow.array(),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.number().int().positive(),
});

export const listarLevantamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listarLevantamentosSchema)
  .handler(async ({ context, data }) => {
    const rows = rawList.parse(
      result(
        await client(context.supabase).rpc("lev_listar", {
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
    return { rows: rows.registros, total: rows.total, page: rows.pagina, pageSize: rows.limite };
  });
export const obterLevantamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(detalheLevantamentoSchema)
  .handler(async ({ context, data }) =>
    levantamentoDetalheSchema.parse(
      result(
        await client(context.supabase).rpc("lev_obter", {
          _org: data.organization_id,
          _id: data.levantamento_id,
          _revisao: data.revisao_id,
        }),
      ),
    ),
  );
export const executarLevantamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(comandoLevantamentoSchema)
  .handler(async ({ context, data }) => {
    const { organization_id, chave, comando, chave_medicao, ...dados } = data;
    const payload = comando === "salvar_medicao" ? { ...dados, chave: chave_medicao } : dados;
    return levantamentoDetalheSchema.parse(
      result(
        await client(context.supabase).rpc("lev_executar", {
          _org: organization_id,
          _chave: chave,
          _comando: comando,
          _dados: payload,
        }),
      ),
    );
  });
export const previaAdocaoLevantamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(previaAdocaoSchema)
  .handler(async ({ context, data }) =>
    adocaoPreviewRow.parse(
      result(
        await client(context.supabase).rpc("lev_prever_adocao", {
          _org: data.organization_id,
          _revisao: data.revisao_id,
          _medicao: data.medicao_id,
          _sistema: data.sistema_id,
          _campo: data.campo,
        }),
      ),
    ),
  );
export const adotarMedidasLevantamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(adotarMedidaSchema)
  .handler(async ({ context, data }) =>
    z
      .object({
        adocao: levantamentoAdocaoRow,
        revisao_destino_id: z.string().uuid(),
        proposta_destino_id: z.string().uuid(),
        sistema_id: z.string().uuid(),
        recalculo_necessario: z.literal(true),
      })
      .parse(
        result(
          await client(context.supabase).rpc("lev_adotar_medicao", {
            _org: data.organization_id,
            _chave: data.chave,
            _revisao: data.revisao_id,
            _medicao: data.medicao_id,
            _sistema: data.sistema_id,
            _campo: data.campo,
            _preview_hash: data.preview_hash,
          }),
        ),
      ),
  );

const optionRows = z.array(z.object({ id: z.string().uuid(), nome: z.string() }));
const escaped = (value: string) => value.replace(/[%_\\]/g, (char) => `\\${char}`);
export const buscarOpcoesLevantamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(buscarOpcoesLevantamentoSchema)
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    // Não confiar na RLS legada de clientes para ampliar o escopo de um coletor.
    await exigirGestao(db, data.organization_id);
    const start = data.pagina * 25;
    if (data.tipo === "modelos") {
      let query = db
        .from("levantamento_modelo_versoes")
        .select("id,numero,levantamento_modelos!inner(nome)")
        .eq("organization_id", data.organization_id)
        .order("created_at", { ascending: false })
        .order("id");
      if (data.busca) query = query.ilike("levantamento_modelos.nome", `%${escaped(data.busca)}%`);
      const rows = z
        .array(
          z.object({
            id: z.string().uuid(),
            numero: z.number(),
            levantamento_modelos: z.object({ nome: z.string() }),
          }),
        )
        .parse(result(await query.range(start, start + 24)));
      return rows.map((r) => ({ id: r.id, nome: `${r.levantamento_modelos.nome} · V${r.numero}` }));
    }
    if (["unidades", "propostas", "projetos"].includes(data.tipo) && !data.cliente_id) return [];
    const label =
      data.tipo === "clientes"
        ? "razao_social"
        : data.tipo === "propostas"
          ? "numero"
          : data.tipo === "projetos"
            ? "codigo"
            : "nome";
    let query = db
      .from(data.tipo)
      .select(`id,${label}`)
      .eq("organization_id", data.organization_id)
      .order(label)
      .order("id");
    if (["unidades", "propostas", "projetos"].includes(data.tipo))
      query = query.eq("cliente_id", data.cliente_id);
    if (data.tipo === "clientes") query = query.eq("situacao", "Ativo").is("arquivado_em", null);
    if (data.tipo === "unidades") query = query.is("arquivado_em", null);
    if (data.tipo === "pessoas") query = query.eq("ativa", true);
    if (data.busca) query = query.ilike(label, `%${escaped(data.busca)}%`);
    const rows = z.array(z.record(z.string())).parse(result(await query.range(start, start + 24)));
    return optionRows.parse(rows.map((r) => ({ id: r["id"], nome: r[label] })));
  });

export const buscarSistemasAdocaoLevantamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(buscarSistemasAdocaoSchema)
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    const detail = levantamentoDetalheSchema.parse(
      result(
        await db.rpc("lev_obter", {
          _org: data.organization_id,
          _id: data.levantamento_id,
          _revisao: data.revisao_id,
        }),
      ),
    );
    if (!detail.permissoes.adotar)
      throw new Error("Seu acesso atual não permite adotar medidas desta revisão.");
    let query = db
      .from("sistemas_dimensionados")
      .select(
        "id,identificacao,revisao_id,proposta_revisoes!inner(numero,status,propostas!inner(numero,titulo,cliente_id,unidade_id))",
      )
      .eq("organization_id", data.organization_id)
      .eq("proposta_revisoes.status", "rascunho")
      .eq("proposta_revisoes.propostas.cliente_id", detail.levantamento.cliente_id)
      .eq("proposta_revisoes.propostas.unidade_id", detail.levantamento.unidade_id)
      .order("identificacao")
      .order("id");
    if (data.busca) query = query.ilike("identificacao", `%${escaped(data.busca)}%`);
    const rows = z
      .array(
        z.object({
          id: z.string().uuid(),
          identificacao: z.string(),
          revisao_id: z.string().uuid(),
          proposta_revisoes: z.object({
            numero: z.number(),
            status: z.literal("rascunho"),
            propostas: z.object({
              numero: z.string(),
              titulo: z.string().nullable(),
              cliente_id: z.string().uuid(),
              unidade_id: z.string().uuid(),
            }),
          }),
        }),
      )
      .parse(result(await query.range(data.pagina * 25, data.pagina * 25 + 24)));
    return rows.map((r) => ({
      id: r.id,
      revisao_id: r.revisao_id,
      nome: `${r.proposta_revisoes.propostas.numero} · R${r.proposta_revisoes.numero} · ${r.identificacao}`,
    }));
  });

export const publicarModeloLevantamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(publicarModeloLevantamentoSchema)
  .handler(async ({ context, data }) => {
    const { organization_id, chave, modelo_id, ...dados } = data;
    return z
      .object({
        modelo: z.object({ id: z.string().uuid(), nome: z.string(), descricao: z.string() }),
        versao: levantamentoModeloRow,
      })
      .parse(
        result(
          await client(context.supabase).rpc("lev_publicar_modelo", {
            _org: organization_id,
            _chave: chave,
            _modelo: modelo_id,
            _dados: dados,
          }),
        ),
      );
  });
