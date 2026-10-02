/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do banco tratadas no servidor; entradas validadas por Zod */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

async function orgDoUsuario(db: any, userId: string): Promise<string> {
  const { data, error } = await db
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Usuário sem organização.");
  return data.organization_id as string;
}

const tipo = z.enum(["M", "S", "P"]);
const familia = z.string().regex(/^[A-Z]{2,5}$/);

/** Cadastro: o código definitivo é reservado no banco, com bloqueio e chave idempotente. */
export const cadastrarProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        chave: z.string().uuid(),
        familia,
        tipo,
        descricao: z.string().trim().min(2).max(300),
        unidade: z.string().trim().min(1).max(10),
        ncm: z.string().trim().max(20),
        modalidade: z.enum(["comprar", "fabricar", "terceirizar"]),
        custo: z.number().min(0).nullable(),
        material: z.string().trim().max(120).default(""),
        dimensoes: z.string().trim().max(120).default(""),
        acabamento: z.string().trim().max(120).default(""),
        base_custo: z.enum(["completo", "composto"]).default("completo"),
        composicao: z
          .array(z.object({ filho_id: z.string().uuid(), quantidade: z.number().positive() }))
          .max(200)
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: any = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    return ok(
      await db.rpc("cadastrar_produto_codificado", {
        _org: org,
        _familia: data.familia,
        _tipo: data.tipo,
        _chave: data.chave,
        _custo: data.custo,
        _dados: {
          descricao: data.descricao,
          unidade: data.unidade,
          ncm: data.ncm,
          modalidade: data.modalidade,
          material: data.material,
          dimensoes: data.dimensoes,
          acabamento: data.acabamento,
          base_custo: data.base_custo,
          composicao: data.composicao,
        },
      }),
    ) as { id: string; codigo: string; repetido: boolean };
  });

/** Atribui o código definitivo a um item que ainda usa código antigo (pendência decidida). */
export const recodificarProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ produto_id: z.string().uuid(), familia, tipo }).parse(d))
  .handler(async ({ data, context }) => {
    const db: any = context.supabase;
    return ok(
      await db.rpc("recodificar_produto", {
        _produto: data.produto_id,
        _familia: data.familia,
        _tipo: data.tipo,
      }),
    ) as { codigo: string; anterior: string };
  });

/** Adiciona um produto do catálogo à revisão editável, com o custo vigente congelado. */
export const adicionarComponenteRevisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ revisao_id: z.string().uuid(), produto_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: any = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    const ja = ok(
      await db
        .from("revisao_componentes")
        .select("id")
        .eq("revisao_id", data.revisao_id)
        .eq("produto_id", data.produto_id)
        .maybeSingle(),
    );
    if (ja) return { id: (ja as any).id as string, repetido: true };
    const p = ok(
      await db
        .from("produtos")
        .select(
          "id,codigo,descricao,unidade,ncm,modalidade,fornecedor_padrao_id,indivisivel,multiplo_compra,fabricantes(nome)",
        )
        .eq("id", data.produto_id)
        .eq("organization_id", org)
        .single(),
    ) as any;
    const custo = ok(
      await db
        .from("produto_custos")
        .select("id,custo")
        .eq("produto_id", p.id)
        .order("vigencia", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ) as any;
    const row = ok(
      await db
        .from("revisao_componentes")
        .insert({
          organization_id: org,
          revisao_id: data.revisao_id,
          produto_id: p.id,
          codigo: p.codigo,
          descricao: p.descricao,
          unidade: p.unidade,
          ncm: p.ncm,
          fabricante: p.fabricantes?.nome ?? null,
          modalidade: p.modalidade,
          incluido_orcamento: false,
          fornecedor_id: p.fornecedor_padrao_id,
          custo_adotado: custo?.custo ?? 0,
          custo_origem_id: custo?.id ?? null,
          indivisivel: p.indivisivel,
          multiplo_compra: p.multiplo_compra,
        })
        .select("id")
        .single(),
    ) as { id: string };
    return { id: row.id, repetido: false };
  });

const acoes = [
  "importar_catalogo",
  "editar_cadastro",
  "editar_revisao",
  "aprovar_tecnica",
  "ver_custos",
] as const;
/** Permissões efetivas do usuário (mesma função pode() usada pelo banco), para a interface avisar antes. */
export const minhasPermissoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db: any = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    const r = await Promise.all(acoes.map((a) => db.rpc("pode", { _org: org, _acao: a })));
    return Object.fromEntries(acoes.map((a, i) => [a, r[i].data === true])) as Record<
      (typeof acoes)[number],
      boolean
    >;
  });

export const editarProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        produto_id: z.string().uuid(),
        descricao: z.string().trim().min(2).max(300),
        unidade: z.string().trim().min(1).max(10),
        ncm: z.string().trim().max(20),
        modalidade: z.enum(["comprar", "fabricar", "terceirizar"]),
        material: z.string().trim().max(120),
        dimensoes: z.string().trim().max(120),
        acabamento: z.string().trim().max(120),
        base_custo: z.enum(["completo", "composto"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { produto_id, ...dados } = data;
    return ok(
      await (context.supabase as any).rpc("editar_produto", {
        _produto: produto_id,
        _dados: dados,
      }),
    ) as { id: string };
  });

export const salvarComposicao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        produto_id: z.string().uuid(),
        itens: z
          .array(z.object({ filho_id: z.string().uuid(), quantidade: z.number().positive() }))
          .max(200),
        status: z.enum(["pendente", "definida", "nao_aplicavel"]),
      })
      .parse(d),
  )
  .handler(
    async ({ data, context }) =>
      ok(
        await (context.supabase as any).rpc("salvar_composicao", {
          _produto: data.produto_id,
          _itens: data.itens,
          _status: data.status,
        }),
      ) as { id: string; componentes: number },
  );

export const reclassificarProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        produto_id: z.string().uuid(),
        familia,
        tipo,
        motivo: z.string().trim().min(5).max(500),
      })
      .parse(d),
  )
  .handler(
    async ({ data, context }) =>
      ok(
        await (context.supabase as any).rpc("reclassificar_produto", {
          _produto: data.produto_id,
          _familia: data.familia,
          _tipo: data.tipo,
          _motivo: data.motivo,
        }),
      ) as { codigo: string; anterior: string },
  );

/** Inclui produto na revisão com sua estrutura; idempotente (define a quantidade avulsa, não soma). */
export const incluirNaRevisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        revisao_id: z.string().uuid(),
        produto_id: z.string().uuid(),
        quantidade: z.number().min(0).max(1e7),
      })
      .parse(d),
  )
  .handler(
    async ({ data, context }) =>
      ok(
        await (context.supabase as any).rpc("incluir_produto_revisao", {
          _rev: data.revisao_id,
          _produto: data.produto_id,
          _quantidade: data.quantidade,
        }),
      ) as { id: string; componentes: number },
  );
