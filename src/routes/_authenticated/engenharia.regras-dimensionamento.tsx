import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { mesclarRegras, type Regras } from "@/features/calculo/domain";
import { useOrg } from "@/features/org/session";
import { dataBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/engenharia/regras-dimensionamento")({
  head: () => ({
    meta: [
      { title: "Regras de dimensionamento — Sistema Nexus" },
      { name: "description", content: "Versões das regras técnicas de TELHADO e OVERHEAD." },
      { property: "og:title", content: "Regras de dimensionamento — Sistema Nexus" },
      { property: "og:description", content: "Regras técnicas versionadas." },
    ],
  }),
  component: RegrasPage,
});

function RegrasPage() {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Regras | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["regras", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regras_versionadas")
        .select("*")
        .eq("organization_id", orgId)
        .order("versao", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const ativa = q.data.find((r) => r.ativa) ?? null;
  const podeEditar = org.data?.roles.some((r) => r === "admin" || r === "engenharia") ?? false;

  const publicar = async () => {
    if (!edit) return;
    const desc = window.prompt("Descrição/motivo da nova versão:");
    if (!desc || desc.trim().length < 3) return setErro("Descrição obrigatória");
    setErro(null);
    const versao = (q.data[0]?.versao ?? 0) + 1;
    const { error } = await supabase.from("regras_versionadas").insert({
      organization_id: orgId,
      versao,
      descricao: desc.trim(),
      regras: edit,
      ativa: false,
      origem: "edição Engenharia",
    });
    if (error) return setErro(error.message);
    if (ativa)
      await supabase.from("regras_versionadas").update({ ativa: false }).eq("id", ativa.id);
    const { error: e2 } = await supabase
      .from("regras_versionadas")
      .update({ ativa: true })
      .eq("organization_id", orgId)
      .eq("versao", versao);
    if (e2) return setErro(e2.message);
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["regras", orgId] });
  };

  const campos = (grupo: "telhado" | "overhead" | "consumiveis_por_m_cabo") => {
    const base = (edit ?? mesclarRegras(ativa?.regras))[grupo] as Record<string, number>;
    return (
      <div className="grid gap-2 md:grid-cols-2">
        {Object.entries(base).map(([k, v]) => (
          <label
            key={k}
            className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
          >
            {k.replace(/_/g, " ")}
            <input
              type="number"
              step="any"
              min={0}
              disabled={!edit}
              value={v}
              onChange={(e) =>
                edit &&
                setEdit({ ...edit, [grupo]: { ...edit[grupo], [k]: Number(e.target.value) } })
              }
              className="h-8 w-24 rounded border border-input bg-background px-2 text-right tabular-nums text-foreground disabled:opacity-60"
            />
          </label>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Engenharia"
        title="Regras de dimensionamento"
        description="Novas propostas usam a versão ativa. Revisões existentes mantêm a versão com que foram criadas; para aplicar novas regras, crie nova revisão."
        actions={
          podeEditar && !edit ? (
            <ActionButton onClick={() => setEdit(mesclarRegras(ativa?.regras))}>
              Criar nova versão
            </ActionButton>
          ) : null
        }
      />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {!ativa && !edit ? (
        <EmptyState
          title="Nenhuma regra cadastrada"
          hint="Importe a biblioteca da planilha modelo em Produtos e Soluções (inclui as 20 regras) ou crie a primeira versão."
        />
      ) : (
        <>
          <Section
            title="TELHADO"
            description="Metragem total do sistema; trechos não multiplicam."
          >
            {campos("telhado")}
          </Section>
          <Section title="OVERHEAD" description="Metragem de cada trecho × número de trechos.">
            {campos("overhead")}
          </Section>
          <Section
            title="Consumíveis por metro de cabo"
            description="Quantidade técnica fracionada; a compra arredonda para cima conforme peça indivisível e múltiplo (F05)."
          >
            {campos("consumiveis_por_m_cabo")}
          </Section>
          {edit && (
            <div className="flex gap-2">
              <ActionButton onClick={publicar}>Publicar e ativar versão</ActionButton>
              <ActionButton variant="ghost" onClick={() => setEdit(null)}>
                Cancelar
              </ActionButton>
            </div>
          )}
          <p className="text-xs text-warning">
            As fórmulas de pilares e intermediárias (⌈m ÷ espaçamento⌉ ± 1) foram reconstruídas e
            aguardam validação do responsável técnico.
          </p>
        </>
      )}
      <Section title="Versões">
        <ul className="text-xs">
          {q.data.map((r) => (
            <li key={r.id} className="flex gap-2 py-1">
              v{r.versao} · {dataBR(r.created_at)} · {r.descricao ?? "—"}{" "}
              {r.ativa && <StatusBadge value="Ativa" />}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
