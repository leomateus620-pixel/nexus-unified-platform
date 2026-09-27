import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export function useProjetos(orgId: string) {
  return useQuery({
    queryKey: ["projetos", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id,codigo,status,created_at,proposta_id,revisao_id,clientes(razao_social),proposta_revisoes(numero,totais,propostas!proposta_revisoes_proposta_id_fkey(numero))")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((p) => {
        const r = p.proposta_revisoes as unknown as { numero: number; totais: { totais?: { final?: number; custo_materiais?: number; operacao?: number; resultado?: number; margem?: number | null } } | null; propostas: { numero: string } } | null;
        return {
          ...p,
          cliente: (p.clientes as { razao_social: string } | null)?.razao_social ?? "—",
          origem: r ? `${r.propostas.numero} · Rev. ${String(r.numero).padStart(2, "0")}` : "—",
          totais: r?.totais?.totais ?? null,
        };
      });
    },
  });
}
