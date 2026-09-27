import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import {
  ActionButton,
  DataTable,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import {
  aprovarTecnica,
  liberarOrdemProducao,
  registrarMovimento,
} from "@/features/propostas/propostas.functions";
import { qtd } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/compras/ordens-producao/$ordemId")({
  head: () => ({
    meta: [
      { title: "Ordem de produção — Sistema Nexus" },
      { name: "description", content: "Detalhe da ordem de produção." },
    ],
  }),
  component: Page,
});

function Page() {
  const { ordemId } = Route.useParams();
  const qc = useQueryClient();
  const liberar = useServerFn(liberarOrdemProducao);
  const mov = useServerFn(registrarMovimento);
  const aprovar = useServerFn(aprovarTecnica);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["ordens", "op-det", ordemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_producao")
        .select(
          "*, proposta_revisoes(id,numero,proposta_id,propostas!proposta_revisoes_proposta_id_fkey(numero)), projetos(id,codigo), ordem_producao_itens(*, demandas(revisao_componentes(codigo,descricao,unidade)))",
        )
        .eq("id", ordemId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const inval = () => qc.invalidateQueries({ queryKey: ["ordens"] });
  const onErr = (e: unknown) => setErro(e instanceof Error ? e.message : String(e));
  const lib = useMutation({
    mutationFn: () => liberar({ data: { ordem_id: ordemId } }),
    onSuccess: inval,
    onError: onErr,
  });
  const apontar = useMutation({
    mutationFn: (v: { item_id: string; quantidade: number; chave?: string }) => {
      // chave fixada no objeto: retries reenviam a mesma chave (idempotência)
      v.chave ??= crypto.randomUUID();
      return mov({
        data: { tipo: "apontamento", item_id: v.item_id, quantidade: v.quantidade, chave: v.chave },
      });
    },
    onSuccess: inval,
    onError: onErr,
  });
  const apr = useMutation({
    mutationFn: (revisao_id: string) => aprovar({ data: { revisao_id } }),
    onError: onErr,
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;
  const rev = o.proposta_revisoes as unknown as {
    id: string;
    numero: number;
    proposta_id: string;
    propostas: { numero: string };
  };
  const proj = o.projetos as { id: string; codigo: string } | null;
  const rascunho = o.status === "rascunho";
  const upd = async (
    tabela: "ordens_producao" | "ordem_producao_itens",
    id: string,
    patch: Record<string, unknown>,
  ) => {
    setErro(null);
    const { error } = await supabase
      .from(tabela)
      .update(patch as never)
      .eq("id", id);
    if (error) return setErro(error.message);
    inval();
  };
  const input =
    "h-8 rounded border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60";
  return (
    <div className="space-y-4">
      <nav className="text-xs text-muted-foreground">
        <Link to="/compras/ordens-producao" className="hover:text-foreground">
          Ordens de produção
        </Link>{" "}
        / {o.numero} · Origem{" "}
        <Link
          to="/comercial/propostas/$propostaId/revisoes/$revisaoId/producao"
          params={{ propostaId: rev.proposta_id, revisaoId: rev.id }}
          className="text-primary"
        >
          {rev.propostas.numero} Rev. {String(rev.numero).padStart(2, "0")}
        </Link>
        {proj && (
          <>
            {" "}
            · Projeto{" "}
            <Link
              to="/projetos/$projetoId"
              params={{ projetoId: proj.id }}
              className="text-primary"
            >
              {proj.codigo}
            </Link>
          </>
        )}
      </nav>
      <PageHeader
        eyebrow="Ordem de produção"
        title={o.numero}
        description="Matéria-prima e roteiro não são inferidos do nome do componente (F15)."
        actions={<StatusBadge value={o.status} />}
      />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Section title="Planejamento">
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <label>
            Responsável{" "}
            <input
              disabled={!rascunho}
              defaultValue={o.responsavel ?? ""}
              onBlur={(e) => upd("ordens_producao", o.id, { responsavel: e.target.value || null })}
              className={input}
            />
          </label>
          <label>
            Prazo{" "}
            <input
              type="date"
              disabled={!rascunho}
              defaultValue={o.prazo ?? ""}
              onBlur={(e) => upd("ordens_producao", o.id, { prazo: e.target.value || null })}
              className={input}
            />
          </label>
        </div>
        {rascunho && (
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
              variant="secondary"
              loading={apr.isPending}
              onClick={() => apr.mutate(rev.id)}
            >
              Registrar aprovação técnica
            </ActionButton>
            <ActionButton loading={lib.isPending} onClick={() => lib.mutate()}>
              Liberar para fabricação
            </ActionButton>
          </div>
        )}
        {apr.isSuccess && (
          <p className="mt-2 text-xs text-muted-foreground">
            Aprovação técnica registrada para a composição atual.
          </p>
        )}
      </Section>
      <Section title="Itens">
        <DataTable
          getRowId={(i) => i.id}
          rows={o.ordem_producao_itens}
          columns={[
            {
              key: "cod",
              label: "Código",
              render: (i) => i.demandas?.revisao_componentes?.codigo ?? "—",
            },
            {
              key: "desc",
              label: "Descrição",
              render: (i) => i.demandas?.revisao_componentes?.descricao ?? "—",
            },
            {
              key: "q",
              label: "Quantidade",
              align: "right",
              render: (i) => qtd(Number(i.quantidade), i.demandas?.revisao_componentes?.unidade),
            },
            {
              key: "ficha",
              label: "Ficha técnica / matéria-prima",
              render: (i) =>
                rascunho ? (
                  <input
                    defaultValue={i.ficha_tecnica ?? ""}
                    onBlur={(e) =>
                      upd("ordem_producao_itens", i.id, { ficha_tecnica: e.target.value || null })
                    }
                    className={`${input} w-64 ${!i.ficha_tecnica ? "border-warning" : ""}`}
                  />
                ) : (
                  (i.ficha_tecnica ?? "—")
                ),
            },
            {
              key: "prod",
              label: "Produzida",
              align: "right",
              render: (i) => qtd(Number(i.quantidade_produzida)),
            },
            {
              key: "a",
              label: "",
              render: (i) =>
                o.status === "liberada" && Number(i.quantidade) > Number(i.quantidade_produzida) ? (
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      const v = window.prompt("Quantidade produzida:");
                      const n = Number((v ?? "").replace(",", "."));
                      if (n > 0) apontar.mutate({ item_id: i.id, quantidade: n });
                    }}
                  >
                    Apontar
                  </button>
                ) : null,
            },
          ]}
        />
      </Section>
    </div>
  );
}
