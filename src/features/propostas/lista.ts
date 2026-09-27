import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export function usePropostas(orgId: string) {
  return useQuery({
    queryKey: ["propostas", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("propostas")
        .select("id,numero,titulo,created_at,projeto_id,clientes(razao_social),unidades(nome),revisao:proposta_revisoes!propostas_rev_fk(id,numero,status,totais,desatualizada)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((p) => {
        const rev = p.revisao as unknown as { id: string; numero: number; status: string; totais: { totais?: { final?: number } } | null; desatualizada: boolean } | null;
        return {
          id: p.id,
          numero: p.numero,
          titulo: p.titulo,
          projeto_id: p.projeto_id,
          created_at: p.created_at,
          cliente: (p.clientes as unknown as { razao_social: string } | null)?.razao_social ?? "—",
          unidade: (p.unidades as unknown as { nome: string } | null)?.nome ?? null,
          revisao: rev,
          final: rev && !rev.desatualizada ? (rev.totais?.totais?.final ?? null) : null,
        };
      });
    },
  });
}
