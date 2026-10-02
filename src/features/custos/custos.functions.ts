/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do banco tratadas no servidor; entradas validadas por Zod */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcularAquisicao, CUSTO_VERSAO, POLITICA_PLANILHA, resumoCustos } from "./domain";

const valor = z.number().min(0).nullable();

/** Registra uma compra: o servidor calcula pelo motor de custos e recalcula a média ponderada sugerida. */
export const registrarCompra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        chave: z.string().uuid(),
        produto_id: z.string().uuid(),
        fornecedor_id: z.string().uuid().nullable(),
        nf_numero: z.string().trim().max(20),
        nf_serie: z.string().trim().max(5),
        nf_chave: z.string().regex(/^\d{44}$/).or(z.literal("")),
        emitido_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        quantidade: z.number().min(0),
        unidade: z.string().trim().min(1).max(10),
        parcelas: z.object({
          produtos: valor,
          desconto: valor,
          frete: valor,
          ipi: valor,
          difal: valor,
          outras: valor,
        }),
        lote: z.string().trim().max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: any = context.supabase;
    const p = await db.from("produtos").select("id,unidade").eq("id", data.produto_id).single();
    if (p.error) throw new Error(p.error.message);
    const conv = await db
      .from("produto_conversoes")
      .select("fator")
      .eq("produto_id", data.produto_id)
      .eq("unidade_compra", data.unidade)
      .maybeSingle();
    const calc = calcularAquisicao(
      data.quantidade,
      data.unidade,
      p.data.unidade,
      data.parcelas,
      conv.data ? Number(conv.data.fator) : null,
    );
    const hist = await db
      .from("aquisicoes")
      .select("custo_total,valores_calculados,created_at,situacao,documentos_fiscais(emitido_em)")
      .eq("produto_id", data.produto_id);
    if (hist.error) throw new Error(hist.error.message);
    const lista = [
      ...(hist.data as any[]).map(linhaResumo),
      {
        custo_total: calc.custo_total,
        quantidade_uso: calc.quantidade_uso,
        data: data.emitido_em,
        situacao: calc.pendencia ? ("pendente" as const) : ("valida" as const),
      },
    ];
    const media = calc.pendencia ? null : resumoCustos(lista).media_ponderada;
    const r = await db.rpc("registrar_aquisicao", {
      _produto: data.produto_id,
      _chave: data.chave,
      _custo_sugerido: media,
      _dados: {
        fornecedor_id: data.fornecedor_id,
        nf_numero: data.nf_numero,
        nf_serie: data.nf_serie,
        nf_chave: data.nf_chave,
        emitido_em: data.emitido_em,
        quantidade: data.quantidade,
        unidade: data.unidade,
        parcelas: data.parcelas,
        lote: data.lote,
        politica: POLITICA_PLANILHA.versao,
        calculado: { ...calc, motor: CUSTO_VERSAO },
      },
    });
    if (r.error) throw new Error(r.error.message);
    return { ...(r.data as { id: string; repetido: boolean }), pendencia: calc.pendencia, media };
  });

/** Fator de conversão confirmado (ex.: 1 CT = 100 UN). Sem ele, a compra fica pendente. */
export const definirConversao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        produto_id: z.string().uuid(),
        unidade_compra: z.string().trim().min(1).max(10),
        fator: z.number().positive(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: any = context.supabase;
    const p = await db.from("produtos").select("organization_id").eq("id", data.produto_id).single();
    if (p.error) throw new Error(p.error.message);
    const r = await db
      .from("produto_conversoes")
      .upsert(
        { organization_id: p.data.organization_id, ...data },
        { onConflict: "produto_id,unidade_compra" },
      );
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });

export function linhaResumo(a: any) {
  return {
    custo_total: a.custo_total == null ? null : Number(a.custo_total),
    quantidade_uso:
      a.valores_calculados?.quantidade_uso == null ? null : Number(a.valores_calculados.quantidade_uso),
    data: a.documentos_fiscais?.emitido_em ?? String(a.created_at).slice(0, 10),
    situacao: a.situacao as "valida" | "pendente",
  };
}
