import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { ErrorState, LoadingState, PageHeader, Section } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { mesclarParametros, type Parametros } from "@/features/calculo/domain";
import { ParametrosForm } from "@/features/propostas/Etapas";
import { useOrg } from "@/features/org/session";

export const Route = createFileRoute("/_authenticated/configuracoes/orcamentos")({
  head: () => ({
    meta: [
      { title: "Padrões de orçamento — Sistema Nexus" },
      { name: "description", content: "Parâmetros comerciais, operacionais e tributários padrão das novas propostas." },
      { property: "og:title", content: "Padrões de orçamento — Sistema Nexus" },
      { property: "og:description", content: "Parâmetros padrão das propostas." },
    ],
  }),
  component: Page,
});

function Page() {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("");
  const q = useQuery({
    queryKey: ["config-orc", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("config_orcamento").select("*").eq("organization_id", orgId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const onSave = useCallback(
    async (p: Parametros) => {
      setStatus("Salvando…");
      const { error } = await supabase.from("config_orcamento").upsert({ organization_id: orgId, parametros: p, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
      if (error) return setStatus(`Erro: ${error.message}`);
      setStatus("Salvo");
      qc.invalidateQueries({ queryKey: ["config-orc", orgId] });
    },
    [orgId, qc],
  );
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Configurações"
        title="Padrões de orçamento"
        description={`Copiados para cada nova proposta. Alterar aqui não reescreve propostas existentes. Próximo número: ${String(q.data?.proximo_numero ?? 1).padStart(3, "0")}/${String(new Date().getFullYear()).slice(2)}.`}
      />
      {!q.data && <p className="text-xs text-warning">Nenhum padrão salvo: os campos mostram os valores da planilha modelo (rev. 05) até você salvar.</p>}
      <Section title="Parâmetros padrão" description={status || "Salva automaticamente."}>
        <ParametrosForm valores={mesclarParametros(q.data?.parametros)} editavel={org.data?.isAdmin ?? false} onSave={onSave} />
      </Section>
      <p className="text-xs text-muted-foreground">Alíquotas são informadas pela empresa; o sistema não valida legislação tributária.</p>
    </div>
  );
}
