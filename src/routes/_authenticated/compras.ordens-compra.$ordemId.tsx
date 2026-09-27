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
import { useOrg } from "@/features/org/session";
import { emitirOrdemCompra, registrarMovimento } from "@/features/propostas/propostas.functions";
import { brl, brlUnit, qtd } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/compras/ordens-compra/$ordemId")({
  head: () => ({
    meta: [
      { title: "Ordem de compra — Sistema Nexus" },
      { name: "description", content: "Detalhe da ordem de compra." },
    ],
  }),
  component: Page,
});

function Page() {
  const { ordemId } = Route.useParams();
  const org = useOrg();
  const qc = useQueryClient();
  const emitir = useServerFn(emitirOrdemCompra);
  const mov = useServerFn(registrarMovimento);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["ordens", "oc-det", ordemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_compra")
        .select(
          "*, fornecedores(nome,cnpj), proposta_revisoes(id,numero,proposta_id,propostas!proposta_revisoes_proposta_id_fkey(numero)), projetos(id,codigo), ordem_compra_itens(*, demandas(revisao_componentes(codigo,descricao,unidade,ncm,fabricante)))",
        )
        .eq("id", ordemId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const inval = () => qc.invalidateQueries({ queryKey: ["ordens"] });
  const emitirM = useMutation({
    mutationFn: () => emitir({ data: { ordem_id: ordemId } }),
    onSuccess: inval,
    onError: (e) => setErro(e instanceof Error ? e.message : String(e)),
  });
  const receber = useMutation({
    mutationFn: (v: { item_id: string; quantidade: number; chave?: string }) => {
      // chave fixada no objeto: retries reenviam a mesma chave (idempotência)
      v.chave ??= crypto.randomUUID();
      return mov({ data: { tipo: "recebimento", item_id: v.item_id, quantidade: v.quantidade, chave: v.chave } });
      },
    onSuccess: inval,
    onError: (e) => setErro(e instanceof Error ? e.message : String(e)),
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
  const verCusto = org.data?.canSeeCosts ?? false;
  const total =
    o.ordem_compra_itens.reduce(
      (s, i) =>
        s + (Number(i.quantidade) - Number(i.quantidade_cancelada)) * Number(i.preco_unitario),
      0,
    ) + Number(o.frete);
  const upd = async (patch: Record<string, unknown>) => {
    setErro(null);
    const { error } = await supabase
      .from("ordens_compra")
      .update(patch as never)
      .eq("id", o.id);
    if (error) return setErro(error.message);
    inval();
  };
  const input =
    "h-8 rounded border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60";
  return (
    <div className="space-y-4">
      <nav className="text-xs text-muted-foreground">
        <Link to="/compras/ordens-compra" className="hover:text-foreground">
          Ordens de compra
        </Link>{" "}
        / {o.numero} · Origem{" "}
        <Link
          to="/comercial/propostas/$propostaId/revisoes/$revisaoId/compras"
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
        eyebrow="Ordem de compra"
        title={`${o.numero} · ${(o.fornecedores as { nome: string } | null)?.nome ?? "—"}`}
        description="Custo de aquisição, não preço de venda. Após emitida, a OC não é alterada."
        actions={<StatusBadge value={o.status} />}
      />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Section title="Condições">
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <label>
            Entrega prevista{" "}
            <input
              type="date"
              disabled={!rascunho}
              defaultValue={o.entrega_prevista ?? ""}
              onBlur={(e) => upd({ entrega_prevista: e.target.value || null })}
              className={input}
            />
          </label>
          {verCusto && (
            <label>
              Frete (R$){" "}
              <input
                type="number"
                step="0.01"
                min={0}
                disabled={!rascunho}
                defaultValue={Number(o.frete)}
                onBlur={(e) => upd({ frete: Number(e.target.value) })}
                className={`${input} w-28`}
              />
            </label>
          )}
          <label className="flex-1">
            Condições{" "}
            <input
              disabled={!rascunho}
              defaultValue={o.condicoes ?? ""}
              onBlur={(e) => upd({ condicoes: e.target.value || null })}
              className={`${input} w-full`}
            />
          </label>
        </div>
        {verCusto && (
          <p className="mt-2 text-sm">
            Total: <span className="font-semibold tabular-nums">{brl(total)}</span>
          </p>
        )}
        {rascunho && (
          <ActionButton
            className="mt-3"
            loading={emitirM.isPending}
            onClick={() => emitirM.mutate()}
          >
            Emitir OC
          </ActionButton>
        )}
      </Section>
      <Section title="Itens">
        <DataTable
          getRowId={(i) => i.id}
          rows={o.ordem_compra_itens}
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
            ...(verCusto
              ? [
                  {
                    key: "pu",
                    label: "Preço unit.",
                    align: "right" as const,
                    render: (i: { id: string; preco_unitario: number }) =>
                      rascunho ? (
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          defaultValue={Number(i.preco_unitario)}
                          onBlur={async (e) => {
                            const { error } = await supabase
                              .from("ordem_compra_itens")
                              .update({ preco_unitario: Number(e.target.value) })
                              .eq("id", i.id);
                            if (error) setErro(error.message);
                            else inval();
                          }}
                          className={`${input} w-28 text-right`}
                        />
                      ) : (
                        brlUnit(Number(i.preco_unitario))
                      ),
                  },
                ]
              : []),
            {
              key: "rec",
              label: "Recebida",
              align: "right",
              render: (i) => qtd(Number(i.quantidade_recebida)),
            },
            {
              key: "pend",
              label: "Pendente",
              align: "right",
              render: (i) =>
                qtd(
                  Number(i.quantidade) -
                    Number(i.quantidade_recebida) -
                    Number(i.quantidade_cancelada),
                ),
            },
            {
              key: "a",
              label: "",
              render: (i) =>
                o.status === "emitida" &&
                Number(i.quantidade) -
                  Number(i.quantidade_recebida) -
                  Number(i.quantidade_cancelada) >
                  0 ? (
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      const v = window.prompt("Quantidade recebida:");
                      const n = Number((v ?? "").replace(",", "."));
                      if (n > 0) receber.mutate({ item_id: i.id, quantidade: n });
                    }}
                  >
                    Registrar recebimento
                  </button>
                ) : null,
            },
          ]}
        />
      </Section>
    </div>
  );
}
