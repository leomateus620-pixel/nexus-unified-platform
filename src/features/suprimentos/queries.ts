import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export function useOrdensCompra(orgId: string) {
  return useQuery({
    queryKey: ["ordens", "oc", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_compra")
        .select(
          "id,numero,status,frete,entrega_prevista,created_at,revisao_id,projeto_id,fornecedores(nome),ordem_compra_itens(quantidade,preco_unitario,quantidade_recebida,quantidade_cancelada),proposta_revisoes(numero,proposta_id,propostas!proposta_revisoes_proposta_id_fkey(numero))",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((o) => {
        const r = o.proposta_revisoes as unknown as {
          numero: number;
          proposta_id: string;
          propostas: { numero: string };
        } | null;
        const total =
          o.ordem_compra_itens.reduce(
            (s, i) =>
              s +
              (Number(i.quantidade) - Number(i.quantidade_cancelada)) * Number(i.preco_unitario),
            0,
          ) + Number(o.frete);
        const pend = o.ordem_compra_itens.reduce(
          (s, i) =>
            s +
            Math.max(
              0,
              Number(i.quantidade) - Number(i.quantidade_recebida) - Number(i.quantidade_cancelada),
            ),
          0,
        );
        return {
          ...o,
          fornecedor: (o.fornecedores as { nome: string } | null)?.nome ?? "—",
          origem: r ? `${r.propostas.numero} · Rev. ${String(r.numero).padStart(2, "0")}` : "—",
          proposta_id: r?.proposta_id ?? null,
          total,
          pendente: pend,
        };
      });
    },
  });
}

export function useOrdensProducao(orgId: string) {
  return useQuery({
    queryKey: ["ordens", "op", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_producao")
        .select(
          "id,numero,status,responsavel,prazo,created_at,revisao_id,projeto_id,ordem_producao_itens(quantidade,quantidade_produzida),proposta_revisoes(numero,proposta_id,propostas!proposta_revisoes_proposta_id_fkey(numero))",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((o) => {
        const r = o.proposta_revisoes as unknown as {
          numero: number;
          proposta_id: string;
          propostas: { numero: string };
        } | null;
        return {
          ...o,
          origem: r ? `${r.propostas.numero} · Rev. ${String(r.numero).padStart(2, "0")}` : "—",
          proposta_id: r?.proposta_id ?? null,
          itens: o.ordem_producao_itens.length,
        };
      });
    },
  });
}

export function useDemandasOrg(orgId: string) {
  return useQuery({
    queryKey: ["ordens", "demandas", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demandas")
        .select(
          "id,modalidade,quantidade_necessaria,quantidade_planejada,status,revisao_id,revisao_componentes(codigo,descricao,unidade,fornecedores(nome)),proposta_revisoes(numero,proposta_id,propostas!proposta_revisoes_proposta_id_fkey(numero)),ordem_compra_itens(quantidade,quantidade_recebida,quantidade_cancelada),ordem_producao_itens(quantidade,quantidade_produzida)",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((d) => {
        const r = d.proposta_revisoes as unknown as {
          numero: number;
          proposta_id: string;
          propostas: { numero: string };
        } | null;
        const c = d.revisao_componentes as unknown as {
          codigo: string;
          descricao: string;
          unidade: string;
          fornecedores: { nome: string } | null;
        } | null;
        const alocada =
          d.ordem_compra_itens.reduce(
            (s, i) => s + Number(i.quantidade) - Number(i.quantidade_cancelada),
            0,
          ) + d.ordem_producao_itens.reduce((s, i) => s + Number(i.quantidade), 0);
        const realizada =
          d.ordem_compra_itens.reduce((s, i) => s + Number(i.quantidade_recebida), 0) +
          d.ordem_producao_itens.reduce((s, i) => s + Number(i.quantidade_produzida), 0);
        return {
          ...d,
          comp: c,
          origem: r ? `${r.propostas.numero} · Rev. ${String(r.numero).padStart(2, "0")}` : "—",
          proposta_id: r?.proposta_id ?? null,
          alocada,
          realizada,
        };
      });
    },
  });
}
