/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do banco tratadas dinamicamente no servidor; entradas validadas por Zod */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calcularRevisao,
  mesclarParametros,
  mesclarRegras,
  MOTOR_VERSAO,
  REGRAS_MODELO,
  PARAMETROS_MODELO,
} from "@/features/calculo/domain";
import { exigirAcao } from "@/features/auth/autorizacao";
import { CODIGO_NXS } from "@/features/catalogo/codigos";
import { CATALOGO_MODELO, ORIGEM_PLANILHA } from "@/features/calculo/catalogo-modelo";

import type { ProposalSaveEvent } from "./save-types";

type Db = any;

async function orgDoUsuario(db: Db, userId: string): Promise<string> {
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
/**
 * Autoriza o USUÁRIO AUTENTICADO na organização para a ação. Papéis de outros
 * membros nunca contam; erro de consulta = acesso negado.
 */
export function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) {
    if (
      /Could not find the function public:(capturar_revisao|concluir_revisao)|schema cache/i.test(
        r.error.message,
      )
    )
      throw new Error(
        "O salvamento não está disponível nesta versão do banco. O rascunho foi preservado; atualize a página e tente novamente.",
      );
    throw new Error(r.error.message);
  }
  return r.data;
}
async function auditar(
  db: Db,
  org: string,
  entidade: string,
  id: string | null,
  acao: string,
  dados?: unknown,
  motivo?: string,
) {
  await db.from("auditoria").insert({
    organization_id: org,
    entidade,
    entidade_id: id,
    acao,
    dados: dados ?? null,
    motivo: motivo ?? null,
  });
}
async function revisaoDaOrg(db: Db, org: string, revisaoId: string) {
  const rev = ok(
    await db
      .from("proposta_revisoes")
      .select("*")
      .eq("id", revisaoId)
      .eq("organization_id", org)
      .maybeSingle(),
  );
  if (!rev) throw new Error("Revisão não encontrada.");
  return rev as any;
}

const idRev = z.object({ revisao_id: z.string().uuid() });

// ---------- Importação do modelo (dados EXISTENTES da planilha) ----------
export const importarModeloPlanilha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "importar_catalogo");
    const fabs = [...new Set(CATALOGO_MODELO.map((c) => c.fabricante))];
    ok(
      await db.from("fabricantes").upsert(
        fabs.map((nome) => ({ organization_id: org, nome })),
        { onConflict: "organization_id,nome", ignoreDuplicates: true },
      ),
    );
    const fabRows = ok(
      await db.from("fabricantes").select("id,nome").eq("organization_id", org),
    ) as { id: string; nome: string }[];
    const fabId = new Map(fabRows.map((f) => [f.nome, f.id]));
    const atuais = ok(
      await db.from("produtos").select("codigo,codigo_legado").eq("organization_id", org),
    ) as { codigo: string; codigo_legado: string | null }[];
    const mapa = new Map<string, string>();
    for (const p of atuais) {
      mapa.set(p.codigo, p.codigo);
      if (p.codigo_legado) mapa.set(p.codigo_legado, p.codigo);
    }
    let inseridos = 0;
    const pendentes: string[] = [];
    for (const c of CATALOGO_MODELO) {
      if (mapa.has(c.codigo_legado)) continue;
      const serie = CODIGO_NXS[c.codigo_legado];
      if (!serie) {
        pendentes.push(c.codigo_legado);
        continue;
      }
      // Chave determinística: repetir a importação não duplica produtos.
      const h = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${org}:${c.codigo_legado}`),
      );
      const x = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const chave = `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-8${x.slice(17, 20)}-${x.slice(20, 32)}`;
      const r = ok(
        await db.rpc("cadastrar_produto_codificado", {
          _org: org,
          _familia: serie.familia,
          _tipo: serie.tipo,
          _chave: chave,
          _custo: c.custo,
          _dados: {
            descricao: c.descricao,
            unidade: c.unidade,
            ncm: c.ncm,
            modalidade: c.modalidade,
            indivisivel: c.indivisivel,
            fabricante_id: fabId.get(c.fabricante) ?? "",
            origem: ORIGEM_PLANILHA,
            codigo_legado: c.codigo_legado,
          },
        }),
      ) as { codigo: string; repetido: boolean };
      mapa.set(c.codigo_legado, r.codigo);
      if (!r.repetido) inseridos++;
    }
    const regras = ok(
      await db.from("regras_versionadas").select("id").eq("organization_id", org).limit(1),
    ) as unknown[];
    if (!regras.length) {
      const componentes = Object.fromEntries(
        Object.entries(REGRAS_MODELO.componentes).map(([k, v]) => {
          const legado = Object.keys(CODIGO_NXS).find((l) => CODIGO_NXS[l]!.codigo === v) ?? v;
          return [k, mapa.get(legado) ?? v];
        }),
      );
      ok(
        await db.from("regras_versionadas").insert({
          organization_id: org,
          versao: 1,
          descricao: "Regras do modelo (EXISTENTE) com correções F04/F05",
          regras: { ...REGRAS_MODELO, componentes },
          ativa: true,
          origem: ORIGEM_PLANILHA,
        }),
      );
    }
    ok(
      await db
        .from("config_orcamento")
        .upsert(
          { organization_id: org, parametros: PARAMETROS_MODELO },
          { onConflict: "organization_id", ignoreDuplicates: true },
        ),
    );
    await auditar(db, org, "catalogo", null, "importar_modelo", { inseridos, pendentes });
    return { inseridos, pendentes };
  });

// ---------- Propostas ----------
export const criarProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        unidade_id: z.string().uuid().nullable(),
        contato_id: z.string().uuid().nullable(),
        titulo: z.string().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "criar_proposta");
    const numero = ok(await db.rpc("proximo_numero_proposta", { _org: org })) as string;
    const cfg = ok(
      await db
        .from("config_orcamento")
        .select("parametros")
        .eq("organization_id", org)
        .maybeSingle(),
    ) as { parametros: unknown } | null;
    const regra = ok(
      await db
        .from("regras_versionadas")
        .select("id,regras")
        .eq("organization_id", org)
        .eq("ativa", true)
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ) as { id: string; regras: unknown } | null;
    const unidade = data.unidade_id
      ? (ok(
          await db
            .from("unidades")
            .select("distancia_ida_volta_km")
            .eq("id", data.unidade_id)
            .maybeSingle(),
        ) as { distancia_ida_volta_km: number | null } | null)
      : null;
    const params = mesclarParametros(
      cfg?.parametros,
      unidade?.distancia_ida_volta_km != null
        ? { distancia_ida_volta_km: Number(unidade.distancia_ida_volta_km) }
        : {},
    );

    const prop = ok(
      await db
        .from("propostas")
        .insert({
          organization_id: org,
          numero,
          cliente_id: data.cliente_id,
          unidade_id: data.unidade_id,
          contato_id: data.contato_id,
          titulo: data.titulo || null,
        })
        .select("id")
        .single(),
    ) as { id: string };
    const rev = ok(
      await db
        .from("proposta_revisoes")
        .insert({
          organization_id: org,
          proposta_id: prop.id,
          numero: 1,
          parametros: params,
          regras_id: regra?.id ?? null,
          regras_snapshot: regra ? mesclarRegras(regra.regras) : null,
        })
        .select("id")
        .single(),
    ) as { id: string };
    await copiarCatalogoParaRevisao(db, org, rev.id);
    ok(await db.from("propostas").update({ revisao_corrente_id: rev.id }).eq("id", prop.id));
    await auditar(db, org, "proposta", prop.id, "criar", { numero });
    return { proposta_id: prop.id, revisao_id: rev.id };
  });

async function copiarCatalogoParaRevisao(db: Db, org: string, revisaoId: string) {
  const prods = ok(
    await db
      .from("produtos")
      .select(
        "id,codigo,descricao,unidade,ncm,modalidade,fornecedor_padrao_id,indivisivel,multiplo_compra,fabricantes(nome)",
      )
      .eq("organization_id", org)
      .eq("ativo", true),
  ) as any[];
  if (!prods.length) return;
  const custos = ok(
    await db
      .from("produto_custos")
      .select("id,produto_id,custo,vigencia,created_at")
      .eq("organization_id", org)
      .order("vigencia", { ascending: false })
      .order("created_at", { ascending: false }),
  ) as any[];
  const ultimo = new Map<string, any>();
  for (const c of custos) if (!ultimo.has(c.produto_id)) ultimo.set(c.produto_id, c);
  ok(
    await db.from("revisao_componentes").insert(
      prods.map((p) => ({
        organization_id: org,
        revisao_id: revisaoId,
        produto_id: p.id,
        codigo: p.codigo,
        descricao: p.descricao,
        unidade: p.unidade,
        ncm: p.ncm,
        fabricante: p.fabricantes?.nome ?? null,
        modalidade: p.modalidade,
        fornecedor_id: p.fornecedor_padrao_id,
        custo_adotado: ultimo.get(p.id)?.custo ?? 0,
        custo_origem_id: ultimo.get(p.id)?.id ?? null,
        indivisivel: p.indivisivel,
        multiplo_compra: p.multiplo_compra,
      })),
    ),
  );
}

export const novaRevisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ proposta_id: z.string().uuid(), motivo: z.string().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "editar_revisao");
    const prop = ok(
      await db
        .from("propostas")
        .select("id,revisao_corrente_id")
        .eq("id", data.proposta_id)
        .eq("organization_id", org)
        .single(),
    ) as any;
    const atual = await revisaoDaOrg(db, org, prop.revisao_corrente_id);
    const max = ok(
      await db
        .from("proposta_revisoes")
        .select("numero")
        .eq("proposta_id", prop.id)
        .order("numero", { ascending: false })
        .limit(1)
        .single(),
    ) as any;
    const nova = ok(
      await db
        .from("proposta_revisoes")
        .insert({
          organization_id: org,
          proposta_id: prop.id,
          numero: max.numero + 1,
          parametros: atual.parametros,
          regras_id: atual.regras_id,
          regras_snapshot: atual.regras_snapshot,
          textos: atual.textos,
        })
        .select("id")
        .single(),
    ) as { id: string };
    const comps = ok(
      await db.from("revisao_componentes").select("*").eq("revisao_id", atual.id),
    ) as any[];
    const mapa = new Map<string, string>();
    if (comps.length) {
      const ins = ok(
        await db
          .from("revisao_componentes")
          .insert(comps.map(({ id: _i, revisao_id: _r, ...c }) => ({ ...c, revisao_id: nova.id })))
          .select("id,produto_id"),
      ) as any[];
      for (const c of comps) mapa.set(c.id, ins.find((n) => n.produto_id === c.produto_id).id);
    }
    const sis = ok(
      await db.from("sistemas_dimensionados").select("*").eq("revisao_id", atual.id).order("ordem"),
    ) as any[];
    if (sis.length)
      ok(
        await db.from("sistemas_dimensionados").insert(
          sis.map(({ id: _i, created_at: _c, revisao_id: _r, ...s }) => ({
            ...s,
            revisao_id: nova.id,
          })),
        ),
      );
    if (atual.status === "rascunho" || atual.status === "em_revisao")
      ok(await db.from("proposta_revisoes").update({ status: "substituida" }).eq("id", atual.id));
    ok(await db.from("propostas").update({ revisao_corrente_id: nova.id }).eq("id", prop.id));
    await auditar(db, org, "revisao", nova.id, "nova_revisao", { origem: atual.id }, data.motivo);
    return { revisao_id: nova.id };
  });

// ---------- Cálculo canônico ----------
/** Shared engine, captured inputs and atomic persistence for both recalculation and consolidation. */
async function calcularCheckpoint(db: Db, revisaoId: string, operacao?: string, refreshed = false) {
  const captura = ok(
    await db.rpc("capturar_revisao", { _rev: revisaoId, _operacao: operacao ?? null }),
  ) as any;
  if (captura.confirmacao) return captura.confirmacao;
  const rev = captura.revisao;
  // An unchanged snapshot may still have a stale/absent calculation (legacy draft).
  // Refresh it through the same engine, then confirm the no-op without creating an audit event.
  if (operacao && !captura.alterado && (rev.desatualizada || !rev.totais)) {
    if (refreshed)
      throw new Error(
        "Conflito: o cálculo mudou durante a confirmação. Confira a revisão e tente novamente.",
      );
    await calcularCheckpoint(db, revisaoId);
    return calcularCheckpoint(db, revisaoId, operacao, true);
  }
  const sistemas = captura.sistemas.map((s: any) => ({
    id: s.id,
    identificacao: s.identificacao,
    tipo: s.tipo,
    metragem: Number(s.metragem),
    trechos: s.trechos,
  }));
  const incluidos = captura.componentes.filter((c: any) => c.incluido_orcamento !== false);
  const componentes = incluidos.map((c: any) => ({
    id: c.id,
    codigo: c.codigo,
    custo: Number(c.custo_adotado),
    indivisivel: c.indivisivel,
    multiplo: Number(c.multiplo_compra),
    produto_id: c.produto_id,
    inclui: c.custo_inclui ?? [],
  }));
  const avulsos = incluidos
    .filter((c: any) => Number(c.quantidade_avulsa ?? 0) > 0)
    .map((c: any) => ({
      componente_id: c.id,
      produto_id: c.produto_id,
      quantidade: Number(c.quantidade_avulsa),
      estrutura: c.estrutura ?? null,
    }));
  const overrides = captura.overrides.map((o: any) => ({
    sistema_id: o.sistema_id,
    componente_id: o.revisao_componente_id,
    quantidade: Number(o.override_quantidade),
  }));
  const parametros = mesclarParametros(rev.parametros);
  const regras = mesclarRegras(rev.regras_snapshot);
  let calculo = null;
  if (!operacao || captura.alterado) {
    const r = calcularRevisao(sistemas, componentes, regras, parametros, overrides, avulsos);
    // Domain pendências remain explicit. Invalid manual numeric inputs cannot be consolidated.
    const problemas = sistemas.flatMap((s: any, i: number) => {
      const nome = `Sistema ${i + 1}${s.identificacao?.trim() ? ` (${s.identificacao.trim()})` : ""}`;
      const campos: string[] = [];
      if (!s.identificacao?.trim()) campos.push("identificação");
      if (!Number.isFinite(s.metragem) || s.metragem <= 0) campos.push("metragem positiva");
      if (!Number.isInteger(s.trechos) || s.trechos < 1) campos.push("trechos inteiros (≥ 1)");
      return campos.length ? [`${nome}: informe ${campos.join(", ")}`] : [];
    });
    if (operacao && problemas.length)
      throw new Error(
        `Dimensionamento incompleto — ${problemas.join("; ")}. Corrija na etapa Dimensionamento. Rascunho e itens comerciais preservados.`,
      );
    calculo = {
      motor_versao: MOTOR_VERSAO,
      entradas: { sistemas, componentes, parametros, overrides, avulsos },
      itens: r.itens,
      resumo: {
        totais: r.totais,
        pendencias: r.pendencias,
        por_sistema: r.por_sistema,
        por_componente: r.por_componente,
        avulsos: r.avulsos ?? [],
      },
    };
  }
  return ok(
    await db.rpc("concluir_revisao", {
      _rev: revisaoId,
      _versao: captura.versao,
      _versao_salva: captura.versao_salva,
      _snapshot: captura.snapshot,
      _calculo: calculo,
      _operacao: operacao ?? null,
    }),
  );
}

export const recalcularRevisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idRev.parse(d))
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "editar_revisao");
    return calcularCheckpoint(db, data.revisao_id);
  });

export const consolidarProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ revisao_id: z.string().uuid(), operacao_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "editar_revisao");
    return calcularCheckpoint(db, data.revisao_id, data.operacao_id);
  });

// ---------- Transições ----------
export const transicionarRevisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        revisao_id: z.string().uuid(),
        acao: z.enum(["enviar", "aceitar", "recusar"]),
        motivo: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(
      db,
      context.userId,
      org,
      data.acao === "enviar" ? "editar_revisao" : "aceitar_comercial",
    );
    const rev = await revisaoDaOrg(db, org, data.revisao_id);
    if (data.acao === "enviar") {
      if (rev.status === "enviada") return { status: rev.status };
      if (!["rascunho", "em_revisao"].includes(rev.status))
        throw new Error("Somente rascunhos podem ser enviados.");
      if (rev.desatualizada || !rev.totais) throw new Error("Recalcule a revisão antes de enviar.");
      if ((rev.totais.pendencias ?? []).length)
        throw new Error("Resolva as pendências antes de enviar.");
      if (!(rev.totais.totais?.final > 0)) throw new Error("A revisão não tem valor final.");
      const doc = await montarDocumentoCliente(db, rev);
      ok(
        await db.from("documentos").upsert(
          {
            organization_id: org,
            tipo: "resumo_executivo",
            revisao_id: rev.id,
            versao: 1,
            interno: false,
            snapshot: doc,
          },
          { onConflict: "revisao_id,tipo,versao", ignoreDuplicates: true },
        ),
      );
      ok(
        await db
          .from("proposta_revisoes")
          .update({ status: "enviada", enviada_em: new Date().toISOString() })
          .eq("id", rev.id),
      );
    } else if (data.acao === "aceitar") {
      if (rev.status !== "enviada" && rev.status !== "aceita")
        throw new Error("A revisão precisa estar enviada para ser aceita.");
      if (rev.status === "enviada")
        ok(
          await db
            .from("proposta_revisoes")
            .update({ status: "aceita", aceita_em: new Date().toISOString() })
            .eq("id", rev.id),
        );
      const prop = ok(
        await db
          .from("propostas")
          .select("id,numero,cliente_id")
          .eq("id", rev.proposta_id)
          .single(),
      ) as any;
      const codigo = `PRJ-${String(prop.numero).replace("/", "-")}`;
      ok(
        await db.from("projetos").upsert(
          {
            organization_id: org,
            codigo,
            proposta_id: prop.id,
            revisao_id: rev.id,
            cliente_id: prop.cliente_id,
          },
          { onConflict: "revisao_id", ignoreDuplicates: true },
        ),
      );
      const proj = ok(
        await db.from("projetos").select("id").eq("revisao_id", rev.id).single(),
      ) as any;
      ok(await db.from("propostas").update({ projeto_id: proj.id }).eq("id", prop.id));
      ok(await db.from("ordens_compra").update({ projeto_id: proj.id }).eq("revisao_id", rev.id));
      ok(await db.from("ordens_producao").update({ projeto_id: proj.id }).eq("revisao_id", rev.id));
    } else {
      if (rev.status !== "enviada")
        throw new Error("Somente revisões enviadas podem ser recusadas.");
      ok(await db.from("proposta_revisoes").update({ status: "recusada" }).eq("id", rev.id));
    }
    await auditar(db, org, "revisao", rev.id, data.acao, null, data.motivo);
    return { status: data.acao };
  });

async function montarDocumentoCliente(db: Db, rev: any) {
  const prop = ok(
    await db
      .from("propostas")
      .select(
        "numero,titulo,clientes(razao_social,cnpj,cidade,uf),unidades(nome,endereco),contatos(nome,email)",
      )
      .eq("id", rev.proposta_id)
      .single(),
  );
  const sis = ok(
    await db
      .from("sistemas_dimensionados")
      .select("id,ordem,identificacao,tipo,metragem,trechos")
      .eq("revisao_id", rev.id)
      .order("ordem"),
  ) as any[];
  const t = rev.totais.totais;
  const porSis = new Map((rev.totais.por_sistema as any[]).map((s) => [s.sistema_id, s]));
  return {
    proposta: prop,
    revisao: rev.numero,
    emitido_em: new Date().toISOString(),
    sistemas: sis.map((s) => ({ ...s, extensao_m: porSis.get(s.id)?.extensao_m ?? 0 })),
    investimento: {
      item_tecnico: t.item_tecnico,
      materiais: t.materiais,
      montagem: t.montagem,
      base: t.base,
      desconto: t.desconto,
      final: t.final,
    },
    parcelas_12x: t.parcelas_12x,
    parcelas_50_30_20: t.parcelas_50_30_20,
    textos: rev.textos,
  };
}

// ---------- Suprimentos ----------
export const gerarDemanda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idRev.parse(d))
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "planejar_suprimentos");
    const rev = await revisaoDaOrg(db, org, data.revisao_id);
    if (rev.desatualizada) throw new Error("Recalcule a revisão antes de planejar a demanda.");
    const itens = ok(
      await db
        .from("sistema_componentes")
        .select("revisao_componente_id,quantidade,quantidade_tecnica,revisao_componentes!inner(modalidade)")
        .eq("revisao_id", rev.id)
        .eq("revisao_componentes.incluido_orcamento", true),
    ) as any[];
    const agg = new Map<string, { q: number; mod: string }>();
    const tecSis = new Map<string, number>();
    for (const i of itens) {
      tecSis.set(
        i.revisao_componente_id,
        (tecSis.get(i.revisao_componente_id) ?? 0) + Number(i.quantidade_tecnica ?? 0),
      );
      const a = agg.get(i.revisao_componente_id) ?? { q: 0, mod: i.revisao_componentes.modalidade };
      a.q += Number(i.quantidade);
      agg.set(i.revisao_componente_id, a);
    }
    // Itens avulsos/estruturas: quantidade de aquisição consolidada pelo cálculo canônico.
    const resumo = (rev.totais ?? {}) as any;
    const mods = new Map(
      (
        ok(
          await db
            .from("revisao_componentes")
            .select("id,modalidade")
            .eq("revisao_id", rev.id)
            .eq("incluido_orcamento", true),
        ) as any[]
      ).map((c) => [c.id, c.modalidade]),
    );
    for (const pc of resumo.por_componente ?? []) {
      const q = Number(pc.quantidade_avulsa ?? 0);
      if (!(q > 0) || !mods.has(pc.componente_id)) continue;
      const a = agg.get(pc.componente_id) ?? { q: 0, mod: mods.get(pc.componente_id) };
      a.q += q;
      agg.set(pc.componente_id, a);
    }
    const hash = ok(await db.rpc("hash_tecnico", { _rev: rev.id })) as string;
    const existentes = ok(
      await db
        .from("demandas")
        .select(
          "id,revisao_componente_id,status,modalidade,quantidade_planejada,revisao_componentes(codigo,fornecedor_id),ordem_compra_itens(id),ordem_producao_itens(id)",
        )
        .eq("revisao_id", rev.id),
    ) as any[];
    const fornAtual = new Map(
      (
        ok(
          await db.from("revisao_componentes").select("id,codigo,fornecedor_id").eq("revisao_id", rev.id),
        ) as any[]
      ).map((c) => [c.id, c]),
    );
    const porComp = new Map(existentes.map((e) => [e.revisao_componente_id, e]));
    const comOrdem = (e: any) => (e.ordem_compra_itens?.length ?? 0) + (e.ordem_producao_itens?.length ?? 0) > 0;
    const diferencas: {
      componente_id: string;
      codigo: string;
      tipo: "novo" | "aumento" | "reducao" | "removido" | "modalidade" | "fornecedor";
      antes: number;
      depois: number;
    }[] = [];
    const linhas = [...agg.entries()].map(([id, a]) => {
      const pc = (resumo.por_componente ?? []).find((x: any) => x.componente_id === id);
      const ocorr = (resumo.avulsos ?? []).filter((o: any) => o.componente_id === id);
      const e = porComp.get(id);
      const comp = fornAtual.get(id);
      const antes = Number(e?.quantidade_planejada ?? 0);
      // Modalidade de demanda já comprometida não muda silenciosamente: a mudança fica sinalizada.
      const modalidade = e && comOrdem(e) ? e.modalidade : a.mod;
      if (!e) diferencas.push({ componente_id: id, codigo: comp?.codigo ?? "", tipo: "novo", antes: 0, depois: a.q });
      else {
        if (a.q > antes) diferencas.push({ componente_id: id, codigo: comp?.codigo ?? "", tipo: "aumento", antes, depois: a.q });
        if (a.q < antes) diferencas.push({ componente_id: id, codigo: comp?.codigo ?? "", tipo: "reducao", antes, depois: a.q });
        if (e.modalidade !== a.mod) diferencas.push({ componente_id: id, codigo: comp?.codigo ?? "", tipo: "modalidade", antes, depois: a.q });
        if ((e.revisao_componentes?.fornecedor_id ?? null) !== (comp?.fornecedor_id ?? null))
          diferencas.push({ componente_id: id, codigo: comp?.codigo ?? "", tipo: "fornecedor", antes, depois: a.q });
      }
      return {
        organization_id: org,
        revisao_id: rev.id,
        revisao_componente_id: id,
        modalidade,
        quantidade_necessaria: a.q,
        quantidade_planejada: a.q,
        hash_tecnico: hash,
        anterior: e
          ? { quantidade: antes, modalidade: e.modalidade, fornecedor_id: e.revisao_componentes?.fornecedor_id ?? null, modalidade_nova: a.mod }
          : null,
        quantidade_tecnica: Number(pc?.quantidade_avulsa_tecnica ?? 0) + (tecSis.get(id) ?? 0),
        origem: {
          proposta_revisao: rev.id,
          sistemas: Number(pc?.quantidade_sistemas ?? 0),
          avulsos: ocorr.map((o: any) => ({
            item_origem: o.origem_id,
            caminho: o.caminho,
            quantidade_tecnica: o.quantidade_tecnica,
          })),
        },
      };
    });
    // Componentes que saíram: sem ordem → removidos; com ordem → necessidade zero (pendência, sem cancelar).
    for (const e of existentes) {
      if (agg.has(e.revisao_componente_id)) continue;
      const codigo = e.revisao_componentes?.codigo ?? "";
      diferencas.push({ componente_id: e.revisao_componente_id, codigo, tipo: "removido", antes: Number(e.quantidade_planejada), depois: 0 });
      if (comOrdem(e))
        linhas.push({
          organization_id: org,
          revisao_id: rev.id,
          revisao_componente_id: e.revisao_componente_id,
          modalidade: e.modalidade,
          quantidade_necessaria: 0,
          quantidade_planejada: 0,
          hash_tecnico: hash,
          anterior: { quantidade: Number(e.quantidade_planejada), modalidade: e.modalidade, fornecedor_id: e.revisao_componentes?.fornecedor_id ?? null, modalidade_nova: e.modalidade },
          quantidade_tecnica: 0,
          origem: { proposta_revisao: rev.id, sistemas: 0, avulsos: [] },
        });
    }
    if (linhas.length)
      ok(await db.from("demandas").upsert(linhas as never, { onConflict: "revisao_id,revisao_componente_id" }));
    const remover = existentes
      .filter((e) => !agg.has(e.revisao_componente_id) && !comOrdem(e))
      .map((e) => e.id);
    if (remover.length) ok(await db.from("demandas").delete().in("id", remover));
    await auditar(db, org, "revisao", rev.id, "atualizar_demanda", { hash, diferencas });
    return { demandas: agg.size, diferencas };
  });

/** Numeração atômica no banco (substitui count + 1). */
async function prefixoNumero(db: Db, org: string, _tabela: string, prefixo: "OC" | "OP") {
  return ok(await db.rpc("proximo_numero", { _org: org, _prefixo: prefixo })) as string;
}

/** Geração transacional e idempotente (RPC gerar_ordens): só o saldo descoberto, só rascunhos compatíveis. */
export const gerarOrdens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ revisao_id: z.string().uuid(), chave: z.string().min(8).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "emitir_ordem");
    await revisaoDaOrg(db, org, data.revisao_id);
    return ok(
      await db.rpc("gerar_ordens", { _rev: data.revisao_id, _chave: data.chave }),
    ) as unknown as {
      ordens: { id: string; tipo: "OC" | "OP"; numero: string; acao: "criada" | "reutilizada" | "complementada" }[];
      itens: number;
      repetido?: boolean;
    };
  });

export const emitirOrdemCompra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ordem_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "emitir_ordem");
    const oc = ok(
      await db
        .from("ordens_compra")
        .select("*,ordem_compra_itens(preco_unitario)")
        .eq("id", data.ordem_id)
        .eq("organization_id", org)
        .single(),
    ) as any;
    if (oc.status === "emitida") return { status: "emitida" };
    const faltas: string[] = [];
    if (!oc.entrega_prevista) faltas.push("data de entrega");
    if (!oc.condicoes) faltas.push("condições");
    if (oc.ordem_compra_itens.some((i: any) => !(Number(i.preco_unitario) > 0)))
      faltas.push("preço de todos os itens");
    if (faltas.length) throw new Error(`Informe ${faltas.join(", ")} antes de emitir.`);
    ok(
      await db
        .from("ordens_compra")
        .update({ status: "emitida", emitida_em: new Date().toISOString() })
        .eq("id", oc.id),
    );
    await auditar(db, org, "ordem_compra", oc.id, "emitir");
    return { status: "emitida" };
  });

export const liberarOrdemProducao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ordem_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "planejar_suprimentos");
    const op = ok(
      await db
        .from("ordens_producao")
        .select("*,ordem_producao_itens(ficha_tecnica)")
        .eq("id", data.ordem_id)
        .eq("organization_id", org)
        .single(),
    ) as any;
    if (op.status === "liberada") return { status: "liberada" };
    const faltas: string[] = [];
    if (!op.responsavel) faltas.push("responsável");
    if (!op.prazo) faltas.push("prazo");
    if (op.ordem_producao_itens.some((i: any) => !i.ficha_tecnica))
      faltas.push("ficha técnica/matéria-prima de todos os itens (F15)");
    if (faltas.length) throw new Error(`Informe ${faltas.join(", ")} antes de liberar.`);
    ok(
      await db
        .from("ordens_producao")
        .update({ status: "liberada", liberada_em: new Date().toISOString() })
        .eq("id", op.id),
    );
    await auditar(db, org, "ordem_producao", op.id, "liberar");
    return { status: "liberada" };
  });

/** Movimento atômico no banco (trava de saldo, idempotência por chave, estorno como evento). */
export const registrarMovimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tipo: z.enum(["recebimento", "apontamento"]),
        item_id: z.string().uuid(),
        quantidade: z.number().positive().finite(),
        chave: z.string().min(8).max(120),
        estorno_de: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const r = ok(
      await db.rpc("registrar_movimento", {
        _tipo: data.tipo,
        _item: data.item_id,
        _quantidade: data.quantidade,
        _chave: data.chave,
        _estorno_de: data.estorno_de ?? null,
      }),
    ) as { id: string; repetido: boolean };
    return { ok: true, ...r };
  });

/** Aprovação técnica vinculada ao hash da composição atual. */
export const aprovarTecnica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ revisao_id: z.string().uuid(), observacao: z.string().max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "aprovar_tecnica");
    const rev = await revisaoDaOrg(db, org, data.revisao_id);
    if (rev.desatualizada) throw new Error("Recalcule a revisão antes da aprovação técnica.");
    const hash = ok(await db.rpc("hash_tecnico", { _rev: rev.id })) as string;
    ok(
      await db.from("aprovacoes").insert({
        organization_id: org,
        revisao_id: rev.id,
        tipo: "tecnica",
        hash_conteudo: hash,
        autor: context.userId,
        observacao: data.observacao ?? null,
      }),
    );
    await auditar(db, org, "revisao", rev.id, "aprovar_tecnica", { hash });
    return { hash };
  });

/** Cost protected including counts and before/after; no generic audit insert is exposed. */
export const listarSalvamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        revisao_id: z.string().uuid(),
        limite: z.number().int().min(1).max(2000).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const org = await orgDoUsuario(db, context.userId);
    await exigirAcao(db, context.userId, org, "ver_custos");
    return ok(
      await db
        .from("proposta_salvamentos")
        .select("*")
        .eq("organization_id", org)
        .eq("revisao_id", data.revisao_id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(data.offset, data.offset + data.limite - 1),
    ) as ProposalSaveEvent[];
  });
