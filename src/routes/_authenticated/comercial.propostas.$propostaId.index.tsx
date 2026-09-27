import { createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/comercial/propostas/$propostaId/")({
  beforeLoad: async ({ params }) => {
    const { data } = await supabase.from("propostas").select("revisao_corrente_id").eq("id", params.propostaId).maybeSingle();
    if (!data?.revisao_corrente_id) throw redirect({ to: "/comercial/propostas", replace: true });
    throw redirect({
      to: "/comercial/propostas/$propostaId/revisoes/$revisaoId/itens-comerciais",
      params: { propostaId: params.propostaId, revisaoId: data.revisao_corrente_id },
      replace: true,
    });
  },
});
