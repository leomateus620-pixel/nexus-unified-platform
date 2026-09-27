import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  ActionButton,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  QueryView,
  Section,
  StatusBadge,
} from "@/components/nexus/Page";
import { PromptAction, ValuesBand } from "@/components/nexus/OperationalDetails";
import { SaveFeedback } from "@/components/nexus/Workspace";
import { supabase } from "@/integrations/supabase/client";
import { mesclarParametros, type Parametros } from "@/features/calculo/domain";
import { useOrg } from "@/features/org/session";
import { brl, dataBR, pct, qtd } from "@/lib/format";
import { gerarDemanda, gerarOrdens, novaRevisao, transicionarRevisao } from "./propostas.functions";
import { revKeys, useComponentes, useRecalcular, useRevisao, useSave, useSistemas } from "./hooks";

function erroMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// ---------------- Orçamento ----------------
export function Orcamento({ revisaoId }: { revisaoId: string }) {
  const rev = useRevisao(revisaoId);
  const comps = useComponentes(revisaoId);
  const sis = useSistemas(revisaoId);
  const org = useOrg();
  const recalc = useRecalcular(revisaoId);
  const [visao, setVisao] = useState<"sistema" | "componente">("sistema");
  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  const r = rev.data;
  const verCusto = org.data?.canSeeCosts ?? false;
  if (!r.resumo)
    return (
      <EmptyState
        title="Revisão ainda não calculada"
        hint="Dimensione ao menos um sistema. O cálculo é feito no servidor e registrado com a versão do motor."
        action={
          r.editavel ? (
            <ActionButton loading={recalc.isPending} onClick={() => recalc.mutate()}>
              Calcular
            </ActionButton>
          ) : null
        }
      />
    );
  const t = r.resumo.totais;
  const nomeSis = new Map((sis.data ?? []).map((s) => [s.id, s]));
  const nomeComp = new Map((comps.data ?? []).map((c) => [c.id, c]));
  return (
    <div className="space-y-4">
      {r.desatualizada && (
        <p className="nx-inline-notice" role="status">
          Há alterações não refletidas nos valores abaixo.{" "}
          {r.editavel && (
            <button className="underline" onClick={() => recalc.mutate()}>
              Recalcular
            </button>
          )}
        </p>
      )}
      {r.resumo.pendencias.length > 0 && (
        <Section title="Pendências">
          <ul className="list-disc space-y-1 pl-5 text-sm text-warning">
            {r.resumo.pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Section>
      )}
      <ValuesBand
        items={[
          { label: "Materiais", value: brl(t.materiais) },
          {
            label: "Montagem",
            value: brl(t.montagem),
            hint: pct(mesclarParametros(r.parametros).montagem_percentual) + " dos materiais",
          },
          { label: "Item técnico", value: brl(t.item_tecnico) },
          { label: "Desconto", value: brl(t.desconto) },
        ]}
        total={brl(t.final)}
        pending={r.desatualizada}
      >
        {verCusto && (
          <>
            <span>Análise interna</span>
            <span>
              Margem estimada <strong>{pct(t.margem)}</strong>
            </span>
            <span>
              Resultado <strong>{brl(t.resultado)}</strong>
            </span>
          </>
        )}
      </ValuesBand>
      <div className="nx-segmented" role="group" aria-label="Agrupar orçamento">
        <ActionButton
          variant={visao === "sistema" ? "primary" : "ghost"}
          aria-pressed={visao === "sistema"}
          onClick={() => setVisao("sistema")}
        >
          Por sistema
        </ActionButton>
        <ActionButton
          variant={visao === "componente" ? "primary" : "ghost"}
          aria-pressed={visao === "componente"}
          onClick={() => setVisao("componente")}
        >
          Por componente
        </ActionButton>
      </div>
      {visao === "sistema" ? (
        <Section title="Materiais por sistema">
          <DataTable
            getRowId={(x) => x.sistema_id}
            rows={r.resumo.por_sistema}
            columns={[
              {
                key: "id",
                label: "Sistema",
                render: (x) => nomeSis.get(x.sistema_id)?.identificacao || "—",
              },
              { key: "tipo", label: "Tipo", render: (x) => nomeSis.get(x.sistema_id)?.tipo ?? "—" },
              {
                key: "ext",
                label: "Extensão",
                align: "right",
                render: (x) => qtd(x.extensao_m, "m"),
              },
              { key: "cabo", label: "Cabo", align: "right", render: (x) => qtd(x.cabo_m, "m") },
              {
                key: "venda",
                label: "Venda materiais",
                align: "right",
                render: (x) => brl(x.venda_materiais),
              },
              ...(verCusto
                ? [
                    {
                      key: "custo",
                      label: "Custo materiais",
                      align: "right" as const,
                      render: (x: { custo_materiais: number }) => brl(x.custo_materiais),
                    },
                  ]
                : []),
            ]}
          />
        </Section>
      ) : (
        <Section title="Composição consolidada por componente">
          <DataTable
            getRowId={(x) => x.componente_id}
            rows={r.resumo.por_componente}
            columns={[
              { key: "codigo", label: "Código" },
              {
                key: "desc",
                label: "Descrição",
                render: (x) => nomeComp.get(x.componente_id)?.descricao ?? "—",
              },
              {
                key: "q",
                label: "Quantidade",
                align: "right",
                render: (x) => qtd(x.quantidade, nomeComp.get(x.componente_id)?.unidade),
              },
              {
                key: "pu",
                label: "Preço unit.",
                align: "right",
                render: (x) => brl(x.preco_unit, 4),
              },
              {
                key: "tv",
                label: "Total venda",
                align: "right",
                render: (x) => brl(x.total_venda),
              },
              ...(verCusto
                ? [
                    {
                      key: "tc",
                      label: "Total custo",
                      align: "right" as const,
                      render: (x: { total_custo: number }) => brl(x.total_custo),
                    },
                  ]
                : []),
            ]}
          />
        </Section>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Operação prevista (recursos)">
          <dl className="nx-number-list">
            {(
              [
                ["Metragem telhado", qtd(t.metragem_telhado, "m")],
                ["Metragem overhead (equivalente)", qtd(t.metragem_overhead, "m")],
                ["Cabo total", qtd(t.cabo_total, "m")],
                ["Dias-equipe", qtd(t.dias_equipe, "dias")],
                ["Viagens", qtd(t.viagens)],
                ...(verCusto
                  ? ([
                      ["Mão de obra", brl(t.mao_de_obra)],
                      ["Alimentação", brl(t.alimentacao)],
                      ["Hospedagem", brl(t.hospedagem)],
                      ["Combustível", brl(t.combustivel)],
                      ["Engenharia (custo)", brl(t.engenharia)],
                      ["Total operação", brl(t.operacao)],
                    ] as [string, string][])
                  : []),
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right tabular-nums text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
        {verCusto && (
          <Section
            title="Resultado calculado pelo modelo"
            description="Não é demonstração contábil. Tributos são provisões parametrizadas, sem validação fiscal."
          >
            <dl className="nx-number-list">
              {(
                [
                  ["Preço-base", brl(t.base)],
                  ["(−) Desconto", brl(t.desconto)],
                  ["Preço final", brl(t.final)],
                  ["(−) Custo de materiais + frete", brl(t.custo_materiais)],
                  ["(−) Provisão tributos materiais", brl(t.impostos_materiais)],
                  ["(−) Provisão tributos serviços", brl(t.impostos_servicos)],
                  ["(−) Operação", brl(t.operacao)],
                  ["Resultado", brl(t.resultado)],
                  ["Margem", pct(t.margem)],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right tabular-nums text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}
      </div>
    </div>
  );
}

// ---------------- Planejamento de compras / produção ----------------
function useDemandas(revisaoId: string) {
  return useQuery({
    queryKey: revKeys.demandas(revisaoId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demandas")
        .select(
          "*, revisao_componentes(codigo,descricao,unidade,fornecedor_id,fornecedores(nome)), ordem_compra_itens(quantidade,quantidade_recebida,quantidade_cancelada,ordens_compra(id,numero,status)), ordem_producao_itens(quantidade,quantidade_produzida,ordens_producao(id,numero,status))",
        )
        .eq("revisao_id", revisaoId);
      if (error) throw error;
      return data;
    },
  });
}

export function Planejamento({
  revisaoId,
  modo,
}: {
  revisaoId: string;
  modo: "compras" | "producao";
}) {
  const rev = useRevisao(revisaoId);
  const dem = useDemandas(revisaoId);
  const qc = useQueryClient();
  const gerarD = useServerFn(gerarDemanda);
  const gerarO = useServerFn(gerarOrdens);
  const planejar = useMutation({
    mutationFn: () => gerarD({ data: { revisao_id: revisaoId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: revKeys.demandas(revisaoId) }),
  });
  const ordens = useMutation({
    mutationFn: () => gerarO({ data: { revisao_id: revisaoId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: revKeys.demandas(revisaoId) });
      qc.invalidateQueries({ queryKey: ["ordens"] });
    },
  });
  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  const aceita = rev.data.status === "aceita";
  const filtro = (d: { modalidade: string }) =>
    modo === "producao" ? d.modalidade === "fabricar" : d.modalidade !== "fabricar";
  type D = NonNullable<typeof dem.data>[number];
  const alocado = (d: D) =>
    modo === "compras"
      ? d.ordem_compra_itens.reduce(
          (s, i) => s + Number(i.quantidade) - Number(i.quantidade_cancelada),
          0,
        )
      : d.ordem_producao_itens.reduce((s, i) => s + Number(i.quantidade), 0);
  const realizado = (d: D) =>
    modo === "compras"
      ? d.ordem_compra_itens.reduce((s, i) => s + Number(i.quantidade_recebida), 0)
      : d.ordem_producao_itens.reduce((s, i) => s + Number(i.quantidade_produzida), 0);
  return (
    <div className="space-y-4">
      <Section
        title={modo === "compras" ? "Planejamento de compras" : "Planejamento de produção"}
        description="Planejar a demanda não exige comprar ou fabricar para emitir a proposta. Ordens só são geradas após a aceitação (liberação operacional)."
      >
        <div className="nx-planning-actions">
          <ActionButton loading={planejar.isPending} onClick={() => planejar.mutate()}>
            Atualizar demanda a partir da composição
          </ActionButton>
          <ActionButton
            variant="ghost"
            disabled={!aceita}
            loading={ordens.isPending}
            onClick={() => ordens.mutate()}
            title={aceita ? "" : "Disponível após a aceitação da revisão"}
          >
            Gerar ordens (OC por fornecedor / OP)
          </ActionButton>
          <Link
            to={modo === "compras" ? "/compras/ordens-compra" : "/compras/ordens-producao"}
            className="self-center text-sm text-primary hover:underline"
          >
            Abrir ordens em Compras e Produção →
          </Link>
        </div>
        {!aceita && (
          <p className="nx-inline-notice mb-4">
            Geração de OC/OP disponível após a aceitação da revisão. A demanda pode ser planejada
            antes.
          </p>
        )}
        {planejar.isError && (
          <p className="mb-2 text-sm text-destructive">{erroMsg(planejar.error)}</p>
        )}
        {ordens.isError && <p className="mb-2 text-sm text-destructive">{erroMsg(ordens.error)}</p>}
        {ordens.isSuccess && (
          <p className="mb-2 text-sm text-primary">
            Ordens verificadas: {ordens.data.ocs} OC nova(s), {ordens.data.ops} OP nova(s). Itens
            existentes não foram duplicados.
          </p>
        )}
        <QueryView
          query={{ ...dem, data: dem.data?.filter(filtro) }}
          empty={
            <EmptyState
              title="Sem demanda planejada"
              hint="Atualize a demanda após calcular a revisão."
            />
          }
        >
          {(rows) => (
            <DataTable
              getRowId={(d) => d.id}
              rows={rows}
              columns={[
                {
                  key: "cod",
                  label: "Código",
                  render: (d) => d.revisao_componentes?.codigo ?? "—",
                },
                {
                  key: "desc",
                  label: "Descrição",
                  render: (d) => d.revisao_componentes?.descricao ?? "—",
                },
                { key: "mod", label: "Modalidade", render: (d) => d.modalidade },
                ...(modo === "compras"
                  ? [
                      {
                        key: "f",
                        label: "Fornecedor",
                        render: (d: D) =>
                          (d.revisao_componentes?.fornecedores as { nome: string } | null)
                            ?.nome ?? <span className="text-warning">Selecionar</span>,
                      },
                    ]
                  : []),
                {
                  key: "nec",
                  label: "Necessidade",
                  align: "right",
                  render: (d) =>
                    qtd(Number(d.quantidade_necessaria), d.revisao_componentes?.unidade),
                },
                {
                  key: "aloc",
                  label: "Comprometida",
                  align: "right",
                  render: (d) => qtd(alocado(d), d.revisao_componentes?.unidade),
                },
                {
                  key: "real",
                  label: modo === "compras" ? "Recebida" : "Produzida",
                  align: "right",
                  render: (d) => qtd(realizado(d), d.revisao_componentes?.unidade),
                },
                {
                  key: "pend",
                  label: "Saldo a realizar",
                  align: "right",
                  render: (d) =>
                    qtd(
                      Math.max(0, Number(d.quantidade_planejada) - realizado(d)),
                      d.revisao_componentes?.unidade,
                    ),
                },
                { key: "st", label: "Status", render: (d) => <StatusBadge value={d.status} /> },
              ]}
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}

// ---------------- Resumo executivo ----------------
const textosSchema = z.object({
  objeto: z.string().max(2000),
  validade: z.string().max(200),
  garantia: z.string().max(200),
  condicoes: z.string().max(4000),
  responsavel_tecnico: z.string().max(200),
});
const TEXTOS_PADRAO = {
  objeto: "",
  validade: "30 dias",
  garantia: "5 anos",
  condicoes: "Frete incluso.",
  responsavel_tecnico: "",
};

export function Resumo({ revisaoId }: { revisaoId: string }) {
  const rev = useRevisao(revisaoId);
  const sis = useSistemas(revisaoId);
  const org = useOrg();
  const qc = useQueryClient();
  const save = useSave();
  const trans = useServerFn(transicionarRevisao);
  const [interno, setInterno] = useState(false);
  const acao = useMutation({
    mutationFn: (a: "enviar" | "aceitar" | "recusar") =>
      trans({ data: { revisao_id: revisaoId, acao: a } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: revKeys.all(revisaoId) });
      qc.invalidateQueries({ queryKey: ["propostas"] });
      qc.invalidateQueries({ queryKey: ["projetos"] });
    },
  });
  const docs = useQuery({
    queryKey: ["docs", revisaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos")
        .select("id,tipo,versao,interno,emitido_em")
        .eq("revisao_id", revisaoId)
        .order("emitido_em");
      if (error) throw error;
      return data;
    },
  });
  const form = useForm<z.infer<typeof textosSchema>>({
    resolver: zodResolver(textosSchema),
    values: { ...TEXTOS_PADRAO, ...(rev.data?.textos ?? {}) },
  });

  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  const r = rev.data;
  const t = r.resumo?.totais;
  const p = r.proposta;
  const verCusto = org.data?.canSeeCosts ?? false;
  const ext = new Map((r.resumo?.por_sistema ?? []).map((s) => [s.sistema_id, s.extensao_m]));

  const salvarTextos = form.handleSubmit(async (v) => {
    save.set("salvando");
    const { data, error } = await supabase
      .from("proposta_revisoes")
      .update({ textos: v })
      .eq("id", revisaoId)
      .eq("version", r.version)
      .select("id");
    if (error) return save.set("erro", error.message);
    if (!data?.length) return save.set("conflito");
    save.set("salvo");
    qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) });
  });

  return (
    <div className="nx-document-workspace">
      <article
        className="nx-document-paper"
        aria-label={interno ? "Resumo executivo interno" : "Resumo executivo comercial"}
      >
        <div className="nx-document-masthead">
          <div>
            <p className="nx-document-brand">NEXUS</p>
            <p className="text-xs text-muted-foreground">
              {interno ? "Visão interna (contém custos)" : "Documento comercial"} ·{" "}
              {r.status === "rascunho" ? "RASCUNHO" : r.status.toUpperCase()}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>
              Proposta {p.numero} · Rev. {String(r.numero).padStart(2, "0")}
            </p>
            <p>{r.enviada_em ? `Emitida em ${dataBR(r.enviada_em)}` : "Não emitida"}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-1 text-xs">
          <p>
            <span className="text-muted-foreground">Cliente:</span>{" "}
            {p.clientes?.razao_social ?? "—"} {p.clientes?.cnpj ? `· CNPJ ${p.clientes.cnpj}` : ""}
          </p>
          <p>
            <span className="text-muted-foreground">Obra:</span> {p.unidades?.nome ?? "—"}{" "}
            {p.unidades?.endereco ? `· ${p.unidades.endereco}` : ""}
          </p>
          <p>
            <span className="text-muted-foreground">Contato:</span> {p.contatos?.nome ?? "—"}{" "}
            {p.contatos?.email ?? ""}
          </p>
        </div>
        {r.textos["objeto"] && <p className="mt-4 whitespace-pre-wrap">{r.textos["objeto"]}</p>}
        <h3 className="mt-6 font-semibold text-foreground">Sistemas</h3>
        {(sis.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum sistema dimensionado.</p>
        ) : (
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr>
                <th scope="col">Nº</th>
                <th scope="col">Identificação / local</th>
                <th scope="col">Tipo</th>
                <th scope="col">Extensão</th>
              </tr>
            </thead>
            <tbody>
              {(sis.data ?? []).map((s) => (
                <tr key={s.id} className="border-b border-border/60">
                  <td className="py-1">{s.ordem}</td>
                  <td>{s.identificacao || "—"}</td>
                  <td>{s.tipo}</td>
                  <td className="text-right tabular-nums">{qtd(ext.get(s.id) ?? null, "m")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="mt-6 font-semibold text-foreground">Investimento</h3>
        {!t || r.desatualizada ? (
          <p className="text-xs text-warning">Valores indisponíveis: recalcule a revisão.</p>
        ) : (
          <dl className="nx-number-list nx-document-values mt-2">
            {(
              [
                ["Item técnico", brl(t.item_tecnico)],
                ["Materiais", brl(t.materiais)],
                ["Montagem", brl(t.montagem)],
                ["Desconto", brl(t.desconto)],
                ["Total", brl(t.final)],
                ...(interno && verCusto
                  ? ([
                      ["Resultado (interno)", brl(t.resultado)],
                      ["Margem (interno)", pct(t.margem)],
                    ] as [string, string][])
                  : []),
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} data-total={k === "Total"}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium tabular-nums text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {t && !r.desatualizada && t.final > 0 && (
          <>
            <h3 className="mt-6 font-semibold text-foreground">Formas de pagamento</h3>
            <p className="text-xs">
              Opção 1: 12 parcelas sem juros —{" "}
              {t.parcelas_12x.length
                ? `${brl(t.parcelas_12x[0])} a ${brl(t.parcelas_12x[11])}`
                : "—"}
              .
            </p>
            <p className="text-xs">
              Opção 2: item técnico + materiais em 50% / 30% / 20% (
              {t.parcelas_50_30_20.map((x) => brl(x)).join(" / ")}); montagem por medições
              quinzenais.
            </p>
          </>
        )}
        <h3 className="mt-6 font-semibold text-foreground">Condições</h3>
        <p className="text-xs">
          Validade: {r.textos["validade"] ?? TEXTOS_PADRAO.validade} · Garantia:{" "}
          {r.textos["garantia"] ?? TEXTOS_PADRAO.garantia}
        </p>
        {r.textos["condicoes"] && (
          <p className="mt-1 whitespace-pre-wrap text-xs">{r.textos["condicoes"]}</p>
        )}
        {r.textos["responsavel_tecnico"] && (
          <p className="mt-6 text-xs">Responsável técnico: {r.textos["responsavel_tecnico"]}</p>
        )}
      </article>
      <aside className="nx-document-tools print:hidden">
        <Section title="Documento e emissão">
          <div className="flex flex-col gap-2">
            {verCusto && (
              <ActionButton variant="ghost" onClick={() => setInterno(!interno)}>
                {interno ? "Ver documento do cliente" : "Ver visão interna"}
              </ActionButton>
            )}
            <ActionButton variant="ghost" onClick={() => window.print()}>
              Imprimir
            </ActionButton>
            {r.status !== "rascunho" && (
              <p className="text-sm text-muted-foreground">
                A impressão usa a visão atual. Os documentos emitidos listados abaixo são registros
                imutáveis; esta tela não abre seu snapshot histórico.
              </p>
            )}
            {r.editavel && (
              <ActionButton loading={acao.isPending} onClick={() => acao.mutate("enviar")}>
                Emitir e enviar ao cliente
              </ActionButton>
            )}
            {r.status === "enviada" && (
              <>
                <ActionButton loading={acao.isPending} onClick={() => acao.mutate("aceitar")}>
                  Registrar aceite do cliente
                </ActionButton>
                <ActionButton variant="danger" onClick={() => acao.mutate("recusar")}>
                  Registrar recusa
                </ActionButton>
              </>
            )}
            {acao.isError && <p className="text-xs text-destructive">{erroMsg(acao.error)}</p>}
            {r.status === "aceita" && p.projeto_id && (
              <Link
                to="/projetos/$projetoId"
                params={{ projetoId: p.projeto_id }}
                className="text-xs text-primary hover:underline"
              >
                Abrir projeto →
              </Link>
            )}
          </div>
        </Section>
        {r.editavel && (
          <Section
            title="Textos do documento"
            description="Somente textos e condições previstos no modelo."
          >
            <form onSubmit={salvarTextos} className="space-y-4 text-sm">
              <SaveFeedback status={save.status} msg={save.msg} />
              {(
                ["objeto", "validade", "garantia", "condicoes", "responsavel_tecnico"] as const
              ).map((k) => (
                <label key={k} className="block text-muted-foreground">
                  {k === "responsavel_tecnico"
                    ? "Responsável técnico"
                    : k === "condicoes"
                      ? "Condições"
                      : k[0]!.toUpperCase() + k.slice(1)}
                  {k === "objeto" || k === "condicoes" ? (
                    <textarea
                      rows={3}
                      {...form.register(k)}
                      aria-invalid={!!form.formState.errors[k]}
                      aria-describedby={form.formState.errors[k] ? `texto-erro-${k}` : undefined}
                      className="mt-1 w-full rounded border border-input bg-background p-2 text-foreground"
                    />
                  ) : (
                    <input
                      {...form.register(k)}
                      aria-invalid={!!form.formState.errors[k]}
                      aria-describedby={form.formState.errors[k] ? `texto-erro-${k}` : undefined}
                      className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-foreground"
                    />
                  )}
                  {form.formState.errors[k] && (
                    <span id={`texto-erro-${k}`} className="block text-destructive">
                      {form.formState.errors[k]?.message}
                    </span>
                  )}
                </label>
              ))}
              <ActionButton type="submit" variant="ghost">
                Salvar textos
              </ActionButton>
            </form>
          </Section>
        )}
        <Section title="Documentos emitidos">
          <QueryView
            query={docs}
            empty={<p className="text-xs text-muted-foreground">Nenhum documento emitido.</p>}
          >
            {(rows) => (
              <ul className="nx-timeline">
                {rows.map((d) => (
                  <li key={d.id}>
                    <time dateTime={d.emitido_em}>{dataBR(d.emitido_em)}</time>
                    <p>
                      {d.tipo} v{d.versao} · {d.interno ? "interno" : "cliente"} · imutável
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </Section>
      </aside>
    </div>
  );
}

// ---------------- Parâmetros ----------------
const numero = z.coerce.number().finite().min(0);
const paramSchema = z.object({
  aliquota_precificacao: numero.max(1),
  aliquota_interestadual: numero.max(1),
  aliquota_interna_destino: numero.max(1),
  difal_ativo: z.boolean(),
  markup: numero.max(10),
  frete_materiais: numero.max(1),
  desconto: numero.max(1),
  montagem_percentual: numero.max(5),
  preco_item_tecnico: numero,
  custo_hora_tecnico: numero,
  custo_hora_engenheiro: numero,
  alimentacao_dia: numero,
  hospedagem_dia: numero,
  preco_combustivel: numero,
  km_por_litro: numero,
  tecnicos_por_equipe: numero,
  produtividade_telhado_m_dia: numero.positive(),
  produtividade_overhead_m_dia: numero.positive(),
  horas_por_dia: numero,
  horas_engenharia: numero,
  distancia_ida_volta_km: numero,
  dias_por_viagem: numero.positive(),
});

export const ROTULOS_PARAMETROS: Record<keyof Parametros, string> = {
  aliquota_precificacao: "Provisão de imposto na precificação (fração)",
  aliquota_interestadual: "Alíquota interestadual informada",
  aliquota_interna_destino: "Alíquota interna de destino informada",
  difal_ativo: "Aplicar DIFAL simplificado",
  markup: "Markup sobre custo composto",
  frete_materiais: "Frete sobre custo dos materiais",
  desconto: "Desconto ao cliente",
  montagem_percentual: "Montagem (% dos materiais)",
  preco_item_tecnico: "Preço do item técnico (R$)",
  custo_hora_tecnico: "Custo hora técnico (R$)",
  custo_hora_engenheiro: "Custo hora engenheiro (R$)",
  alimentacao_dia: "Alimentação por técnico/dia (R$)",
  hospedagem_dia: "Hospedagem por técnico/dia (R$)",
  preco_combustivel: "Combustível (R$/L)",
  km_por_litro: "Consumo do veículo (km/L)",
  tecnicos_por_equipe: "Técnicos por equipe",
  produtividade_telhado_m_dia: "Produtividade telhado (m/equipe-dia)",
  produtividade_overhead_m_dia: "Produtividade overhead (m/equipe-dia)",
  horas_por_dia: "Jornada (h/dia)",
  horas_engenharia: "Horas de engenharia",
  distancia_ida_volta_km: "Distância ida e volta (km)",
  dias_por_viagem: "Dias de campo por viagem",
};

export function ParametrosForm({
  valores,
  editavel,
  onSave,
}: {
  valores: Parametros;
  editavel: boolean;
  onSave: (p: Parametros) => Promise<void>;
}) {
  const form = useForm<Parametros>({
    resolver: zodResolver(paramSchema) as never,
    values: valores,
    mode: "onChange",
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const sub = form.watch(() => {
      if (!editavel) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => form.handleSubmit((v) => onSave(v))(), 800);
    });
    return () => {
      sub.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [form, editavel, onSave]);
  return (
    <form onSubmit={form.handleSubmit((v) => onSave(v))} className="nx-parameters">
      {(
        [
          {
            titulo: "Condições comerciais",
            campos: [
              "markup",
              "desconto",
              "frete_materiais",
              "montagem_percentual",
              "preco_item_tecnico",
            ],
          },
          {
            titulo: "Provisões e alíquotas",
            campos: [
              "aliquota_precificacao",
              "aliquota_interestadual",
              "aliquota_interna_destino",
              "difal_ativo",
            ],
          },
          {
            titulo: "Equipe e produtividade",
            campos: [
              "tecnicos_por_equipe",
              "produtividade_telhado_m_dia",
              "produtividade_overhead_m_dia",
              "horas_por_dia",
              "horas_engenharia",
              "custo_hora_tecnico",
              "custo_hora_engenheiro",
            ],
          },
          {
            titulo: "Deslocamento e permanência",
            campos: [
              "alimentacao_dia",
              "hospedagem_dia",
              "preco_combustivel",
              "km_por_litro",
              "distancia_ida_volta_km",
              "dias_por_viagem",
            ],
          },
        ] satisfies { titulo: string; campos: (keyof Parametros)[] }[]
      ).map((grupo) => (
        <fieldset key={grupo.titulo} className="nx-parameter-group">
          <legend>{grupo.titulo}</legend>
          <div className="nx-parameter-fields">
            {grupo.campos.map((k) => {
              const err = form.formState.errors[k];
              return (
                <label key={k} className="nx-parameter-field">
                  {ROTULOS_PARAMETROS[k]}
                  {k === "difal_ativo" ? (
                    <input
                      type="checkbox"
                      disabled={!editavel}
                      {...form.register(k)}
                      className="ml-2"
                    />
                  ) : (
                    <input
                      type="number"
                      step="any"
                      disabled={!editavel}
                      aria-invalid={!!err}
                      aria-describedby={err ? `param-erro-${k}` : undefined}
                      {...form.register(k)}
                      className="w-full rounded border border-input bg-background px-3 text-right tabular-nums text-foreground"
                    />
                  )}
                  {err && (
                    <span id={`param-erro-${k}`} className="block text-destructive">
                      {err.message}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </form>
  );
}

export function ParametrosRevisao({ revisaoId }: { revisaoId: string }) {
  const rev = useRevisao(revisaoId);
  const save = useSave();
  const qc = useQueryClient();
  const recalc = useRecalcular(revisaoId);
  const versao = useRef<number | null>(null);
  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  if (versao.current == null) versao.current = rev.data.version;
  const onSave = async (p: Parametros) => {
    save.set("salvando");
    const { data, error } = await supabase
      .from("proposta_revisoes")
      .update({ parametros: p })
      .eq("id", revisaoId)
      .eq("version", versao.current!)
      .select("version");
    if (error) return save.set("erro", error.message);
    if (!data?.length) return save.set("conflito");
    versao.current = data[0]!.version;
    await qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) });
    recalc.mutate();
  };
  return (
    <Section
      title="Parâmetros desta revisão"
      description="Cópia versionada dos padrões de Configurações › Orçamentos. Alterar aqui não afeta outras propostas. Salva automaticamente."
    >
      <div className="mb-4">
        <SaveFeedback status={save.status} msg={save.msg} />
      </div>
      <ParametrosForm
        valores={mesclarParametros(rev.data.parametros)}
        editavel={rev.data.editavel}
        onSave={onSave}
      />
    </Section>
  );
}

// ---------------- Histórico ----------------
export function Historico({ propostaId, revisaoId }: { propostaId: string; revisaoId: string }) {
  const navigate = useNavigate();
  const nova = useServerFn(novaRevisao);
  const qc = useQueryClient();
  const revs = useQuery({
    queryKey: ["revisoes", propostaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta_revisoes")
        .select("id,numero,status,created_at,enviada_em,aceita_em,totais")
        .eq("proposta_id", propostaId)
        .order("numero");
      if (error) throw error;
      return data;
    },
  });
  const aud = useQuery({
    queryKey: ["auditoria", revisaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auditoria")
        .select("id,entidade,acao,motivo,created_at")
        .in("entidade_id", [revisaoId, propostaId])
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const calc = useQuery({
    queryKey: ["calculos", revisaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calculo_execucoes")
        .select("id,motor_versao,created_at")
        .eq("revisao_id", revisaoId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
  const criar = useMutation({
    mutationFn: (motivo: string) => nova({ data: { proposta_id: propostaId, motivo } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["revisoes", propostaId] });
      navigate({
        to: "/comercial/propostas/$propostaId/revisoes/$revisaoId/itens-comerciais",
        params: { propostaId, revisaoId: r.revisao_id },
      });
    },
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Revisões">
        <PromptAction
          loading={criar.isPending}
          title="Criar nova revisão"
          description="A revisão será criada a partir da corrente. Informe um motivo com pelo menos 3 caracteres."
          label="Motivo da nova revisão"
          onAnswer={(m) => {
            if (m && m.trim().length >= 3) criar.mutate(m.trim());
          }}
        >
          Criar nova revisão a partir da corrente
        </PromptAction>
        {criar.isError && <p className="mt-2 text-xs text-destructive">{erroMsg(criar.error)}</p>}
        <div className="mt-3">
          <QueryView query={revs} empty={<EmptyState title="Sem revisões" />}>
            {(rows) => (
              <DataTable
                getRowId={(r) => r.id}
                selectedId={revisaoId}
                rows={rows}
                onRowClick={(r) =>
                  navigate({
                    to: "/comercial/propostas/$propostaId/revisoes/$revisaoId/itens-comerciais",
                    params: { propostaId, revisaoId: r.id },
                  })
                }
                columns={[
                  {
                    key: "numero",
                    label: "Rev.",
                    render: (r) => String(r.numero).padStart(2, "0"),
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (r) => <StatusBadge value={r.status} />,
                  },
                  {
                    key: "total",
                    label: "Total",
                    align: "right",
                    render: (r) =>
                      brl(
                        (r.totais as { totais?: { final?: number } } | null)?.totais?.final ?? null,
                      ),
                  },
                  { key: "created_at", label: "Criada", render: (r) => dataBR(r.created_at) },
                ]}
              />
            )}
          </QueryView>
        </div>
      </Section>
      <div className="space-y-4">
        <Section title="Alterações registradas">
          <QueryView
            query={aud}
            empty={<p className="text-xs text-muted-foreground">Nenhum registro.</p>}
          >
            {(rows) => (
              <ul className="nx-timeline">
                {rows.map((a) => (
                  <li key={a.id}>
                    <time dateTime={a.created_at}>{dataBR(a.created_at)}</time>
                    <p className="font-medium">
                      {a.acao}{" "}
                      <span className="font-normal text-muted-foreground">· {a.entidade}</span>
                    </p>
                    {a.motivo && <p className="text-muted-foreground">{a.motivo}</p>}
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </Section>
        <Section title="Execuções de cálculo">
          <QueryView
            query={calc}
            empty={<p className="text-xs text-muted-foreground">Nenhum cálculo.</p>}
          >
            {(rows) => (
              <ul className="nx-timeline">
                {rows.map((c) => (
                  <li key={c.id}>
                    <time dateTime={c.created_at}>
                      {new Date(c.created_at).toLocaleString("pt-BR")}
                    </time>
                    <p>
                      Motor <span className="font-mono">{c.motor_versao}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </Section>
      </div>
    </div>
  );
}
