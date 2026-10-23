import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { comandoPeSchema, detalhePeSchema, listarPeSchema } from "./schemas";
import type { PeCenario, PeDetalhe, PeProjeto, PeResultado, PeVersao } from "./types";

function resultado<T>(r: { data: unknown; error: { message: string; code?: string } | null }): T {
  if (r.error) {
    if (r.error.code === "40001")
      throw new Error(
        "Outra pessoa alterou este registro. Seu conteúdo foi mantido; recarregue a versão antes de comparar e salvar.",
      );
    if (r.error.code === "42501") throw new Error("Registro indisponível para seu acesso atual.");
    if (r.error.code === "PGRST202" || r.error.code === "42P01")
      throw new Error("O banco ainda não recebeu a migração de Projetos de Engenharia.");
    throw new Error(r.error.message);
  }
  return r.data as T;
}

async function exigirLeitura(db: SupabaseClient, org: string) {
  const permitido = resultado<boolean>(
    await db.rpc("operacao_pode", { _org: org, _acao: "ver_projetos_engenharia" }),
  );
  if (!permitido) throw new Error("Permissão insuficiente para Projetos de Engenharia.");
}

export const listarProjetosEngenharia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listarPeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await exigirLeitura(db, data.organization_id);
    const inicio = data.pagina * 25;
    let consulta = db
      .from("pe_projetos")
      .select("*,clientes(razao_social),unidades(nome),pessoas(nome)", { count: "exact" })
      .eq("organization_id", data.organization_id)
      .eq("arquivado", data.arquivados)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(inicio, inicio + 24);
    // Busca literal em título; o cliente nunca controla sintaxe OR/PostgREST.
    const busca = data.busca.replace(/[%_\\]/g, (char) => `\\${char}`);
    if (busca) consulta = consulta.ilike("titulo", `%${busca}%`);
    const resposta = await consulta;
    return { registros: resultado<PeProjeto[]>(resposta), total: resposta.count ?? 0 };
  });

export const obterProjetoEngenharia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => detalhePeSchema.parse(input))
  .handler(async ({ data, context }): Promise<PeDetalhe> => {
    const db = context.supabase as unknown as SupabaseClient;
    await exigirLeitura(db, data.organization_id);
    const projeto = resultado<PeProjeto | null>(
      await db
        .from("pe_projetos")
        .select("*,clientes(razao_social),unidades(nome),pessoas(nome)")
        .eq("organization_id", data.organization_id)
        .eq("id", data.projeto_id)
        .maybeSingle(),
    );
    if (!projeto) throw new Error("Registro indisponível para seu acesso atual.");
    const respostas = await Promise.all([
      db
        .from("pe_versoes")
        .select(
          "id,projeto_id,numero,parent_id,estado,elaborado_em,autor_declarado,revisao_declarada,resumo,snapshot_sha256,version,created_at",
        )
        .eq("organization_id", data.organization_id)
        .eq("projeto_id", projeto.id)
        .order("numero", { ascending: false })
        .limit(100),
      db
        .from("pe_cenarios")
        .select("id,base_id,titulo,promovida_id,descartado,version")
        .eq("organization_id", data.organization_id)
        .eq("projeto_id", projeto.id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("pe_eventos")
        .select("id,comando,motivo,created_at")
        .eq("organization_id", data.organization_id)
        .eq("projeto_id", projeto.id)
        .order("id", { ascending: false })
        .limit(100),
      db
        .from("pe_arquivos")
        .select("id,nome,estado,tamanho,sha256,versao_id")
        .eq("organization_id", data.organization_id)
        .eq("projeto_id", projeto.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    return {
      projeto,
      versoes: resultado<PeDetalhe["versoes"]>(respostas[0]),
      cenarios: resultado<PeDetalhe["cenarios"]>(respostas[1]),
      eventos: resultado<PeDetalhe["eventos"]>(respostas[2]),
      arquivos: resultado<PeDetalhe["arquivos"]>(respostas[3]),
    };
  });

export const obterConteudoPe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        projeto_id: z.string().uuid(),
        versao_id: z.string().uuid().optional(),
        cenario_id: z.string().uuid().optional(),
      })
      .refine((v) => !!v.versao_id !== !!v.cenario_id, "Selecione uma versão ou cenário.")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await exigirLeitura(db, data.organization_id);
    const tabela = data.cenario_id ? "pe_cenarios" : "pe_versoes";
    const registro = resultado<PeCenario | PeVersao | null>(
      await db
        .from(tabela)
        .select("*")
        .eq("organization_id", data.organization_id)
        .eq("projeto_id", data.projeto_id)
        .eq("id", data.cenario_id ?? data.versao_id)
        .maybeSingle(),
    );
    if (!registro) throw new Error("Registro indisponível para seu acesso atual.");
    const baseId = "base_id" in registro ? registro.base_id : registro.parent_id;
    const base = baseId
      ? resultado<PeVersao | null>(
          await db
            .from("pe_versoes")
            .select("*")
            .eq("organization_id", data.organization_id)
            .eq("projeto_id", data.projeto_id)
            .eq("id", baseId)
            .maybeSingle(),
        )
      : null;
    return {
      versao: "numero" in registro ? registro : null,
      cenario: "base_id" in registro ? registro : null,
      base,
    };
  });

export const executarProjetoEngenharia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => comandoPeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { organization_id, chave, comando, ...dados } = data;
    return resultado<PeResultado>(
      await db.rpc("pe_executar", {
        _org: organization_id,
        _chave: chave,
        _comando: comando,
        _dados: dados,
      }),
    );
  });

export const buscarOpcoesPe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        tipo: z.enum(["clientes", "unidades", "pessoas"]),
        busca: z.string().trim().max(100).default(""),
        cliente_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; nome: string }[]> => {
    const db = context.supabase as unknown as SupabaseClient;
    await exigirLeitura(db, data.organization_id);
    const nome = data.tipo === "clientes" ? "razao_social" : "nome";
    let consulta = db
      .from(data.tipo)
      .select(`id,${nome}`)
      .eq("organization_id", data.organization_id)
      .order(nome)
      .limit(25);
    if (data.tipo === "unidades") {
      if (!data.cliente_id) return [];
      consulta = consulta.eq("cliente_id", data.cliente_id);
    }
    if (data.tipo === "clientes" || data.tipo === "unidades")
      consulta = consulta.is("arquivado_em", null);
    if (data.tipo === "clientes") consulta = consulta.eq("situacao", "Ativo");
    if (data.tipo === "pessoas") consulta = consulta.eq("ativa", true);
    if (data.busca)
      consulta = consulta.ilike(nome, `%${data.busca.replace(/[%_\\]/g, (char) => `\\${char}`)}%`);
    const registros = resultado<Record<string, string>[]>(await consulta);
    return registros.map((row) => {
      const id = row["id"];
      const valor = row[nome];
      if (!id || !valor) throw new Error("Opção de cadastro inválida.");
      return { id, nome: valor };
    });
  });
