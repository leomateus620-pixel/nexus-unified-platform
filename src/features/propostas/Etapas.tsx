import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  QueryView,
  Section,
  StatusBadge,
} from "@/components/nexus/Page";
import { SaveEventCard } from "./ui/SaveEventCard";
import { listarSalvamentos } from "./propostas.functions";
import { PromptAction } from "@/components/nexus/OperationalDetails";
import {
  ArrowLeft,
  BadgePercent,
  Calculator,
  Car,
  ChevronDown,
  FileText,
  Maximize2,
  Minimize2,
  Users,
} from "lucide-react";
import {
  ObjectCollection,
  Facts,
  ProcurementCard,
  ProductionCard,
  RevisionCard,
  CollectionPage,
} from "./ui/ObjectCards";
import { supabase } from "@/integrations/supabase/client";
import { mesclarParametros, type Parametros } from "@/features/calculo/domain";
import { useOrg } from "@/features/org/session";
import { brl, dataBR, pct, qtd } from "@/lib/format";
import { previaGeracao, reconciliar } from "@/features/suprimentos/saldo";
import { gerarDemanda, gerarOrdens, novaRevisao, transicionarRevisao } from "./propostas.functions";
import {
  revKeys,
  useComponentes,
  usePatchRevisao,
  useRevisao,
  useSave,
  useSistemas,
} from "./hooks";
import "./ui/stages.css";

function erroMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// ---------------- Orçamento ----------------
export function Orcamento({ revisaoId }: { revisaoId: string }) {
  const rev = useRevisao(revisaoId);
  const comps = useComponentes(revisaoId);
  const sis = useSistemas(revisaoId);
  const org = useOrg();
  const save = useSave();
  const [visao, setVisao] = useState<"sistema" | "componente">("sistema");
  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  const r = rev.data;
  const verCusto = org.data?.canSeeCosts ?? false;
  if (!r.resumo)
    return (
      <EmptyState
        title="Revisão ainda não calculada"
        hint="Dimensione um sistema para iniciar. Alterações válidas são salvas e calculadas automaticamente com o motor da revisão."
        action={
          <Link
            className="nx-editor-link"
            to="/comercial/propostas/$propostaId/revisoes/$revisaoId/dimensionamento"
            params={{ propostaId: r.proposta.id, revisaoId }}
          >
            Abrir dimensionamento →
          </Link>
        }
      />
    );
  const t = r.resumo.totais;
  const calculationPending = r.desatualizada || save.calculation !== "current";
  const nomeSis = new Map((sis.data ?? []).map((s) => [s.id, s]));
  const nomeComp = new Map((comps.data ?? []).map((c) => [c.id, c]));
  return (
    <div
      className="nx-budget space-y-4"
      data-attention={calculationPending || r.resumo.pendencias.length > 0}
    >
      {calculationPending && (
        <p className="nx-inline-notice" role="status">
          Há alterações não refletidas nos valores abaixo. A atualização aguarda a confirmação das
          entradas.{" "}
          {r.editavel && save.calculation === "error" && (
            <button className="underline" onClick={() => void save.retry()}>
              Tentar atualizar novamente
            </button>
          )}
        </p>
      )}
      {r.resumo.pendencias.length > 0 && (
        <Section title="Pendências" className="nx-budget-pending">
          <ul className="list-disc space-y-1 pl-5 text-sm text-warning">
            {r.resumo.pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Link
            className="nx-editor-link"
            to="/comercial/propostas/$propostaId/revisoes/$revisaoId/dimensionamento"
            params={{ propostaId: r.proposta.id, revisaoId }}
          >
            Localizar sistemas no dimensionamento →
          </Link>
        </Section>
      )}
      <div className="nx-budget-composition" aria-label="Composição do total da proposta">
        <dl className="nx-budget-equation">
          {[
            { label: "Materiais", value: t.materiais, sign: null },
            {
              label: "Montagem · venda",
              value: t.montagem,
              sign: "+",
              hint: `${pct(mesclarParametros(r.parametros).montagem_percentual)} dos materiais`,
            },
            { label: "Item técnico", value: t.item_tecnico, sign: "+" },
            { label: "Desconto", value: t.desconto, sign: "−" },
            {
              label: "Total final",
              value: t.final,
              sign: "=",
              total: true,
              hint: calculationPending
                ? save.calculation === "calculating"
                  ? "Recalculando"
                  : "Atualização pendente"
                : r.resumo.pendencias.length
                  ? "Calculado com pendências"
                  : "Resultado confirmado",
            },
          ].map((part) => (
            <div
              key={part.label}
              className="nx-budget-value"
              data-total={part.total}
              data-pending={calculationPending}
            >
              {part.sign && (
                <span
                  className="nx-budget-sign"
                  aria-label={part.sign === "−" ? "menos" : part.sign === "=" ? "igual a" : "mais"}
                >
                  {part.sign}
                </span>
              )}
              <dt>{part.label}</dt>
              <dd>{brl(part.value)}</dd>
              {part.hint && <p>{part.hint}</p>}
            </div>
          ))}
        </dl>
        {verCusto && (
          <div className="nx-budget-internal">
            <span>Análise interna</span>
            <span>
              Margem estimada <strong>{pct(t.margem)}</strong>
            </span>
            <span>
              Resultado <strong>{brl(t.resultado)}</strong>
            </span>
          </div>
        )}
      </div>
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
          <CollectionPage items={r.resumo.por_sistema}>
            {(visible) => (
              <ObjectCollection label="Orçamento por sistema">
                {visible.map((x) => (
                  <li key={x.sistema_id} className="nx-budget-group nx-budget-system">
                    <details>
                      <summary>
                        <span className="nx-budget-group-identity">
                          <span>
                            Sistema nº {nomeSis.get(x.sistema_id)?.ordem ?? "—"} ·{" "}
                            {nomeSis.get(x.sistema_id)?.tipo === "OVERHEAD"
                              ? "Suspenso (OVERHEAD)"
                              : nomeSis.get(x.sistema_id)?.tipo === "TELHADO"
                                ? "Telhado"
                                : "Tipo não informado"}
                          </span>
                          <strong>
                            {nomeSis.get(x.sistema_id)?.identificacao ||
                              "Sistema sem identificação"}
                          </strong>
                        </span>
                        <span className="nx-budget-group-subtotal">
                          <strong>{brl(x.venda_materiais)}</strong>
                          <span>Venda de materiais</span>
                        </span>
                        <ChevronDown size={18} aria-hidden="true" />
                      </summary>
                      <div className="nx-budget-group-detail">
                        <Facts
                          items={[
                            ["Extensão", qtd(x.extensao_m, "m")],
                            ["Cabo", qtd(x.cabo_m, "m")],
                            ...(verCusto
                              ? [["Custo materiais", brl(x.custo_materiais)] as [string, string]]
                              : []),
                          ]}
                        />
                        <Link
                          className="nx-card-primary"
                          to="/comercial/propostas/$propostaId/revisoes/$revisaoId/dimensionamento"
                          params={{ propostaId: r.proposta.id, revisaoId }}
                        >
                          Abrir dimensionamento →
                        </Link>
                      </div>
                    </details>
                  </li>
                ))}
              </ObjectCollection>
            )}
          </CollectionPage>
        </Section>
      ) : (
        <Section title="Composição consolidada por componente">
          <CollectionPage items={r.resumo.por_componente}>
            {(visible) => (
              <ObjectCollection label="Orçamento por componente">
                {visible.map((x) => (
                  <li key={x.componente_id} className="nx-budget-group">
                    <details>
                      <summary>
                        <span className="nx-budget-group-identity">
                          <span>{x.codigo}</span>
                          <strong>
                            {nomeComp.get(x.componente_id)?.descricao ?? "Componente"}
                          </strong>
                        </span>
                        <span className="nx-budget-group-subtotal">
                          <strong>{brl(x.total_venda)}</strong>
                          <span>Venda de materiais</span>
                        </span>
                        <ChevronDown size={18} aria-hidden="true" />
                      </summary>
                      <div className="nx-budget-group-detail">
                        <Facts
                          items={[
                            [
                              "Quantidade",
                              qtd(x.quantidade, nomeComp.get(x.componente_id)?.unidade),
                            ],
                            ["Preço unitário", brl(x.preco_unit, 4)],
                            ...(verCusto
                              ? [["Total custo", brl(x.total_custo)] as [string, string]]
                              : []),
                          ]}
                        />
                        <Link
                          className="nx-card-primary"
                          to="/comercial/propostas/$propostaId/revisoes/$revisaoId/itens-comerciais"
                          params={{ propostaId: r.proposta.id, revisaoId }}
                        >
                          Abrir itens comerciais →
                        </Link>
                      </div>
                    </details>
                  </li>
                ))}
              </ObjectCollection>
            )}
          </CollectionPage>
        </Section>
      )}
      <div className="nx-budget-analysis">
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
                      ["Total operação · custo", brl(t.operacao)],
                    ] as [string, string][])
                  : []),
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} data-emphasis={k === "Total operação · custo"}>
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
                <div key={k} data-emphasis={["Preço final", "Resultado", "Margem"].includes(k)}>
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
const ROTULO_DIF = {
  novo: "novo item",
  aumento: "aumentou (complemento possível)",
  reducao: "reduziu",
  removido: "saiu da composição (ordens preservadas)",
  modalidade: "modalidade mudou",
  fornecedor: "fornecedor mudou",
} as const;
function useDemandas(revisaoId: string) {
  return useQuery({
    queryKey: revKeys.demandas(revisaoId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demandas")
        .select(
          "*, revisao_componentes(id,codigo,descricao,unidade,fornecedor_id,multiplo_compra,indivisivel,fornecedores(id,nome)), ordem_compra_itens(quantidade,quantidade_recebida,quantidade_cancelada,ordens_compra(id,numero,status)), ordem_producao_itens(quantidade,quantidade_produzida,ordens_producao(id,numero,status))",
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
  const save = useSave();
  const gerarD = useServerFn(gerarDemanda);
  const gerarO = useServerFn(gerarOrdens);
  const planejar = useMutation({
    mutationFn: async () => {
      if (!(await save.ensureConsistent()))
        throw new Error(
          "Há entradas pendentes. Confirme o salvamento e o cálculo antes de atualizar a demanda.",
        );
      return gerarD({ data: { revisao_id: revisaoId } });
    },
    onSuccess: () => {
      chaveOrdens.current = null;
      ordens.reset();
      qc.invalidateQueries({ queryKey: revKeys.demandas(revisaoId) });
    },
  });
  // Chave fixa por tentativa: retry/duplo clique reenviam a mesma chave (idempotência no banco).
  const chaveOrdens = useRef<string | null>(null);
  const ordens = useMutation({
    mutationFn: async () => {
      if (!(await save.ensureConsistent()))
        throw new Error(
          "Há entradas pendentes. Confirme o salvamento e o cálculo antes de gerar ordens.",
        );
      chaveOrdens.current ??= crypto.randomUUID();
      return gerarO({ data: { revisao_id: revisaoId, chave: chaveOrdens.current } });
    },
    onSuccess: () => {
      chaveOrdens.current = null;
      qc.invalidateQueries({ queryKey: revKeys.demandas(revisaoId) });
      qc.invalidateQueries({ queryKey: ["ordens"] });
    },
  });
  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  const encerrada = rev.data.status === "recusada" || rev.data.status === "substituida";
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
  const doModo = (dem.data ?? []).filter(filtro);
  const previa = previaGeracao(
    doModo.map((d) => ({
      modalidade: d.modalidade,
      planejada: Number(d.quantidade_planejada),
      comprometida: alocado(d),
      fornecedor:
        (d.revisao_componentes?.fornecedores as { id: string; nome: string } | null) ?? null,
    })),
  );
  const textoGerar =
    modo === "compras"
      ? previa.fornecedores.length
        ? `Gerar ${previa.fornecedores.length} OC (${previa.fornecedores.join(", ")})`
        : null
      : previa.op
        ? "Gerar OP para o saldo de fabricação"
        : null;
  return (
    <div className="nx-planning space-y-4">
      <Section
        title={modo === "compras" ? "Demandas de compra" : "Demandas de produção"}
        description="Ordens permanecem explícitas. Emissão e liberação exigem dados completos e aprovação técnica."
      >
        <div className="nx-planning-actions">
          <ActionButton loading={planejar.isPending} onClick={() => planejar.mutate()}>
            Atualizar demanda
          </ActionButton>
          <ActionButton
            variant="ghost"
            disabled={encerrada || !textoGerar}
            loading={ordens.isPending}
            onClick={() => ordens.mutate()}
            title={
              encerrada ? "Revisão recusada ou substituída" : (textoGerar ?? "Sem saldo descoberto")
            }
          >
            {textoGerar ?? "Sem saldo para novas ordens"}
          </ActionButton>
          <Link
            to={modo === "compras" ? "/compras/ordens-compra" : "/compras/ordens-producao"}
            className="self-center text-sm text-primary hover:underline"
          >
            {modo === "compras" ? "Abrir ordens de compra →" : "Abrir ordens de produção →"}
          </Link>
        </div>
        {previa.semFornecedor > 0 && (
          <p className="nx-planning-warning mb-2">
            {previa.semFornecedor} item(ns) de compra sem fornecedor: escolha o fornecedor em Itens
            antes de gerar.
          </p>
        )}
        {planejar.isError && (
          <p className="mb-2 text-sm text-destructive" role="alert">
            {erroMsg(planejar.error)}
          </p>
        )}
        {planejar.isSuccess && (
          <div className="mb-2 rounded border border-border bg-muted/30 p-3 text-sm" role="status">
            <p className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Demanda atualizada · {planejar.data.diferencas.length} diferença(s)
            </p>
            {planejar.data.diferencas.length === 0 ? (
              <p className="mt-1">Sem mudanças em relação ao planejamento anterior.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {planejar.data.diferencas.map((x, k) => (
                  <li key={k}>
                    <span className="font-mono text-primary">{x.codigo}</span> ·{" "}
                    {ROTULO_DIF[x.tipo]}
                    {(x.tipo === "aumento" || x.tipo === "reducao" || x.tipo === "removido") &&
                      ` (${x.antes} → ${x.depois})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {ordens.isError && (
          <p className="mb-2 text-sm text-destructive" role="alert">
            {erroMsg(ordens.error)} Tentar de novo é seguro: a mesma operação não duplica ordens.
          </p>
        )}
        {ordens.isSuccess && (
          <div
            className="mb-2 rounded border border-primary/30 bg-primary/5 p-3 text-sm"
            role="status"
          >
            <p className="font-display text-xs font-bold uppercase tracking-wider text-primary">
              {ordens.data.ordens.length ? "Ordens em rascunho" : "Nenhuma ordem necessária"}
              {ordens.data.repetido ? " · operação já registrada" : ""}
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {ordens.data.ordens.map((o) => (
                <li key={o.id}>
                  <Link
                    className="nx-card-primary"
                    to={
                      o.tipo === "OC"
                        ? "/compras/ordens-compra/$ordemId"
                        : "/compras/ordens-producao/$ordemId"
                    }
                    params={{ ordemId: o.id }}
                  >
                    {o.numero} · {o.acao} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <QueryView
          query={{ ...dem, data: dem.data?.filter(filtro) }}
          empty={
            <EmptyState
              title={
                modo === "compras"
                  ? "Nenhuma demanda de compra planejada"
                  : "Nenhuma demanda de produção planejada"
              }
              hint={
                modo === "compras"
                  ? "Após conferir a composição calculada, use Atualizar demanda. Itens de compra e terceirização aparecerão com fornecedor, quantidade e OC."
                  : "Após conferir a composição calculada, use Atualizar demanda. Itens com modalidade Fabricar aparecerão com quantidade, andamento e OP."
              }
            />
          }
        >
          {(rows) => (
            <CollectionPage items={rows}>
              {(visible) => (
                <ObjectCollection
                  className="nx-planning-list"
                  label={modo === "compras" ? "Demandas de compra" : "Demandas de produção"}
                >
                  {visible.map((d) => {
                    const un = d.revisao_componentes?.unidade;
                    const rc = reconciliar(
                      Number(d.quantidade_planejada),
                      alocado(d),
                      realizado(d),
                    );
                    const ant = d.anterior as {
                      quantidade: number;
                      modalidade: string;
                      modalidade_nova: string;
                      fornecedor_id: string | null;
                    } | null;
                    const facts: [string, string][] = [
                      ["Necessidade atual", qtd(rc.necessidade, un)],
                      ["Comprometida", qtd(rc.comprometida, un)],
                      [modo === "compras" ? "Recebida" : "Produzida", qtd(rc.realizada, un)],
                      ["Saldo sem ordem", qtd(rc.semOrdem, un)],
                    ];
                    const selos = [
                      ant &&
                        Number(ant.quantidade) < rc.necessidade &&
                        `Aumentou (era ${qtd(Number(ant.quantidade), un)})`,
                      ant &&
                        Number(ant.quantidade) > rc.necessidade &&
                        `Reduziu (era ${qtd(Number(ant.quantidade), un)})`,
                      ant &&
                        ant.modalidade_nova !== ant.modalidade &&
                        `Modalidade mudou para ${ant.modalidade_nova}: ajuste manual`,
                      ant &&
                        (ant.fornecedor_id ?? null) !==
                          (d.revisao_componentes?.fornecedor_id ?? null) &&
                        "Fornecedor mudou",
                    ].filter(Boolean) as string[];
                    const origem = d.origem as {
                      sistemas?: number;
                      avulsos?: { caminho?: string[] }[];
                    } | null;
                    const avisos = (
                      <>
                        {selos.map((t) => (
                          <p key={t} className="nx-object-meta">
                            {t}
                          </p>
                        ))}
                        {rc.excedente > 0 && (
                          <p className="nx-planning-warning" role="note">
                            Comprometido {qtd(rc.excedente, un)} acima da necessidade: revise a
                            ordem manualmente (nada foi cancelado).
                          </p>
                        )}
                        {origem && (
                          <p className="nx-object-meta">
                            Origem:{" "}
                            {Number(origem.sistemas ?? 0) > 0
                              ? `sistemas (${origem.sistemas})`
                              : ""}
                            {origem.avulsos?.length
                              ? `${Number(origem.sistemas ?? 0) > 0 ? " · " : ""}${origem.avulsos.map((a) => (a.caminho ?? []).join(" › ") || "item avulso").join("; ")}`
                              : ""}
                          </p>
                        )}
                      </>
                    );
                    return modo === "compras" ? (
                      <ProcurementCard
                        key={d.id}
                        title={d.revisao_componentes?.descricao ?? "Componente"}
                        code={d.revisao_componentes?.codigo ?? "—"}
                        supplier={
                          (d.revisao_componentes?.fornecedores as { nome: string } | null)?.nome ??
                          null
                        }
                        status={d.status}
                        facts={facts}
                      >
                        <p className="nx-object-meta">Modalidade: {d.modalidade}</p>
                        {avisos}
                        {d.ordem_compra_itens.length ? (
                          d.ordem_compra_itens.map(
                            (i) =>
                              i.ordens_compra && (
                                <Link
                                  key={i.ordens_compra.id}
                                  className="nx-card-primary"
                                  to="/compras/ordens-compra/$ordemId"
                                  params={{ ordemId: i.ordens_compra.id }}
                                >
                                  {i.ordens_compra.numero} · {i.ordens_compra.status} →
                                </Link>
                              ),
                          )
                        ) : (
                          <p className="nx-planning-warning">Planejamento sem ordem vinculada</p>
                        )}
                      </ProcurementCard>
                    ) : (
                      <ProductionCard
                        key={d.id}
                        title={d.revisao_componentes?.descricao ?? "Componente"}
                        code={d.revisao_componentes?.codigo ?? "—"}
                        status={d.status}
                        facts={facts}
                      >
                        {avisos}
                        {d.ordem_producao_itens.length ? (
                          d.ordem_producao_itens.map(
                            (i) =>
                              i.ordens_producao && (
                                <Link
                                  key={i.ordens_producao.id}
                                  className="nx-card-primary"
                                  to="/compras/ordens-producao/$ordemId"
                                  params={{ ordemId: i.ordens_producao.id }}
                                >
                                  {i.ordens_producao.numero} · {i.ordens_producao.status} →
                                </Link>
                              ),
                          )
                        ) : (
                          <p className="nx-planning-warning">
                            Planejamento: produção ainda não liberada
                          </p>
                        )}
                      </ProductionCard>
                    );
                  })}
                </ObjectCollection>
              )}
            </CollectionPage>
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
  const { register, settle, local, remember, draft, ensureConsistent } = save;
  const patchRevision = usePatchRevisao(revisaoId);
  const trans = useServerFn(transicionarRevisao);
  const [interno, setInterno] = useState(false);
  const [documentFocus, setDocumentFocus] = useState(false);
  const [editingTexts, setEditingTexts] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const acao = useMutation({
    mutationFn: (a: "enviar" | "aceitar" | "recusar") =>
      trans({ data: { revisao_id: revisaoId, acao: a } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: revKeys.all(revisaoId) });
      qc.invalidateQueries({ queryKey: ["propostas"] });
      qc.invalidateQueries({ queryKey: ["projetos"] });
      qc.invalidateQueries({ queryKey: ["docs", revisaoId] });
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
    values: draft<z.infer<typeof textosSchema>>("textos") ?? {
      ...TEXTOS_PADRAO,
      ...(rev.data?.textos ?? {}),
    },
    resetOptions: { keepDirtyValues: true },
  });

  const textQueued = useRef("");
  const flushTexts = useCallback(() => {
    if (!rev.data?.editavel || (!form.formState.isDirty && !draft("textos"))) return;
    const result = textosSchema.safeParse(form.getValues());
    if (!result.success) {
      void form.trigger();
      throw new Error("Textos inválidos: revise os campos indicados.");
    }
    const fingerprint = JSON.stringify(result.data);
    if (textQueued.current === fingerprint) return;
    textQueued.current = fingerprint;
    settle("textos");
    void patchRevision("textos", result.data).then((ok) => {
      if (!ok) textQueued.current = "";
      else if (JSON.stringify(form.getValues()) === fingerprint) form.reset(result.data);
    });
  }, [form, rev.data, patchRevision, settle, draft]);
  const flushTextsRef = useRef(flushTexts);
  flushTextsRef.current = flushTexts;
  useEffect(() => register("textos", () => flushTextsRef.current()), [register]);
  useEffect(() => {
    const subscription = form.watch((_values, { type }) => {
      if (type !== "change" || !rev.data?.editavel) return;
      remember("textos", form.getValues());
      local("textos");
    });
    return () => subscription.unsubscribe();
  }, [form, rev.data?.editavel, remember, local]);
  useEffect(() => {
    if (!documentFocus) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDocumentFocus(false);
        document
          .querySelector<HTMLButtonElement>(".nx-document-toolbar button")
          ?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [documentFocus]);
  useEffect(() => {
    if (!editingTexts) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>(".nx-document-texts textarea")?.focus(),
    );
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingTexts(false);
        document
          .querySelector<HTMLButtonElement>(".nx-document-edit-trigger")
          ?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", escape);
    };
  }, [editingTexts]);

  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  const r = rev.data;
  const t = r.resumo?.totais;
  const calculationPending = r.desatualizada || save.calculation !== "current";
  const p = r.proposta;
  const verCusto = org.data?.canSeeCosts ?? false;
  const ext = new Map((r.resumo?.por_sistema ?? []).map((s) => [s.sistema_id, s.extensao_m]));
  const documentAction = async (action: "print" | "emit") => {
    setDocumentBusy(true);
    setDocumentError(null);
    try {
      if (r.editavel && !(await ensureConsistent())) {
        setDocumentError(
          "Há alterações pendentes ou inválidas. Confira o estado de salvamento antes de continuar.",
        );
        return;
      }
      if (action === "emit") acao.mutate("enviar");
      else {
        // Wait for the confirmed query data to reach the actual document before printing.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        window.print();
      }
    } finally {
      setDocumentBusy(false);
    }
  };

  return (
    <div
      className="nx-document-workspace"
      data-focused={documentFocus}
      data-editor-focused={editingTexts}
    >
      <div className="nx-document-toolbar print:hidden">
        <span>
          <FileText size={18} aria-hidden="true" /> Prévia {interno ? "interna" : "comercial"}
        </span>
        <ActionButton
          variant="ghost"
          aria-pressed={documentFocus}
          onClick={() => {
            setEditingTexts(false);
            setDocumentFocus(!documentFocus);
          }}
        >
          {documentFocus ? (
            <Minimize2 size={16} aria-hidden="true" />
          ) : (
            <Maximize2 size={16} aria-hidden="true" />
          )}
          {documentFocus ? "Voltar ao workspace" : "Focar documento"}
        </ActionButton>
        {r.editavel && (
          <ActionButton
            variant="ghost"
            className="nx-document-edit-trigger"
            aria-pressed={editingTexts}
            onClick={() => {
              setDocumentFocus(false);
              setEditingTexts(!editingTexts);
            }}
          >
            <FileText size={16} aria-hidden="true" />
            {editingTexts ? "Voltar à prévia" : "Editar textos"}
          </ActionButton>
        )}
      </div>
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
          <div className="nx-document-reference text-right text-xs text-muted-foreground">
            <p className="nx-document-number">
              Proposta {p.numero} · Rev. {String(r.numero).padStart(2, "0")}
            </p>
            <p>{r.enviada_em ? `Emitida em ${dataBR(r.enviada_em)}` : "Não emitida"}</p>
          </div>
        </div>
        {(calculationPending || (r.resumo?.pendencias.length ?? 0) > 0) && (
          <p className="nx-document-attention">
            {calculationPending
              ? "Cálculo desatualizado ou aguardando confirmação."
              : "Há pendências nesta revisão."}{" "}
            {r.resumo?.pendencias.length
              ? `${r.resumo.pendencias.length} pendência(s) para conferência no Orçamento.`
              : ""}
          </p>
        )}
        <div className="nx-document-client mt-4 grid gap-1 text-xs">
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
                  <td>{s.identificacao.trim() ? s.identificacao : "Sem identificação"}</td>
                  <td>
                    {s.tipo === "OVERHEAD"
                      ? "Suspenso (OVERHEAD)"
                      : s.tipo === "TELHADO"
                        ? "Telhado"
                        : s.tipo}
                  </td>
                  <td className="text-right tabular-nums">
                    {ext.has(s.id) ? qtd(ext.get(s.id)!, "m") : "Extensão não calculada"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="mt-6 font-semibold text-foreground">Investimento</h3>
        {!t || calculationPending ? (
          <p className="text-xs text-warning">
            Valores aguardando a confirmação das entradas e do cálculo.
          </p>
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
        {t && !calculationPending && t.final > 0 && (
          <>
            <h3 className="mt-6 font-semibold text-foreground">Formas de pagamento</h3>
            <div className="nx-document-payments">
              <p>
                <strong>Opção 1 · 12 parcelas sem juros</strong>{" "}
                {t.parcelas_12x.length
                  ? `${brl(t.parcelas_12x[0])} a ${brl(t.parcelas_12x[11])}`
                  : "—"}
                .
              </p>
              <p>
                <strong>Opção 2 · 50% / 30% / 20%</strong> Item técnico + materiais (
                {t.parcelas_50_30_20.map((x) => brl(x)).join(" / ")}); montagem por medições
                quinzenais.
              </p>
            </div>
          </>
        )}
        <h3 className="mt-6 font-semibold text-foreground">Condições</h3>
        <dl className="nx-document-conditions">
          <div>
            <dt>Validade</dt>
            <dd>{r.textos["validade"] ?? TEXTOS_PADRAO.validade}</dd>
          </div>
          <div>
            <dt>Garantia</dt>
            <dd>{r.textos["garantia"] ?? TEXTOS_PADRAO.garantia}</dd>
          </div>
        </dl>
        {r.textos["condicoes"] && (
          <p className="mt-1 whitespace-pre-wrap text-xs">{r.textos["condicoes"]}</p>
        )}
        {r.textos["responsavel_tecnico"] && (
          <p className="mt-6 text-xs">Responsável técnico: {r.textos["responsavel_tecnico"]}</p>
        )}
      </article>
      <aside className="nx-document-tools print:hidden">
        <Section title="Documento e emissão">
          <div className="nx-document-status">
            <StatusBadge value={r.status} />
            <p>
              {r.enviada_em ? `Emitida em ${dataBR(r.enviada_em)}` : "Não emitida"} ·{" "}
              {interno ? "Visão interna" : "Visão comercial"}
            </p>
            {(!r.resumo || calculationPending || r.resumo.pendencias.length > 0) && (
              <p className="nx-planning-warning">
                {!r.resumo
                  ? "Revisão ainda não calculada."
                  : calculationPending
                    ? "Cálculo desatualizado. Confira o Orçamento antes da emissão."
                    : `${r.resumo.pendencias.length} pendência(s). Confira o Orçamento antes da emissão.`}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {verCusto && (
              <ActionButton variant="ghost" onClick={() => setInterno(!interno)}>
                {interno ? "Ver documento do cliente" : "Ver visão interna"}
              </ActionButton>
            )}
            <ActionButton
              variant="ghost"
              loading={documentBusy}
              onClick={() => void documentAction("print")}
            >
              Imprimir
            </ActionButton>
            {r.status !== "rascunho" && (
              <p className="text-sm text-muted-foreground">
                A impressão usa a visão atual. Os documentos emitidos listados abaixo são registros
                imutáveis; esta tela não abre seu snapshot histórico.
              </p>
            )}
            {r.editavel && (
              <ActionButton
                loading={acao.isPending || documentBusy}
                onClick={() => void documentAction("emit")}
              >
                Emitir proposta
              </ActionButton>
            )}
            {r.editavel && (
              <p className="nx-field-help">
                Registra o documento e o status comercial. O envio por e-mail não está integrado.
              </p>
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
            {documentError && (
              <p className="text-sm text-destructive" role="alert">
                {documentError}
              </p>
            )}
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
            className="nx-document-texts"
            description="Textos desta revisão. As alterações válidas são salvas automaticamente."
          >
            <form onSubmit={form.handleSubmit(() => flushTexts())} className="space-y-4 text-sm">
              {(
                ["objeto", "validade", "garantia", "condicoes", "responsavel_tecnico"] as const
              ).map((k) => (
                <label key={k} className="block text-muted-foreground">
                  <span>
                    {k === "responsavel_tecnico"
                      ? "Responsável técnico"
                      : k === "condicoes"
                        ? "Condições"
                        : k[0]!.toUpperCase() + k.slice(1)}
                  </span>
                  {k === "objeto" && (
                    <span id="nx-document-object-help" className="nx-field-help">
                      Descrição do escopo da proposta, exibida antes dos sistemas.
                    </span>
                  )}
                  {k === "objeto" || k === "condicoes" ? (
                    <textarea
                      rows={3}
                      {...form.register(k)}
                      aria-invalid={!!form.formState.errors[k]}
                      aria-label={k === "objeto" ? "Objeto" : "Condições"}
                      aria-describedby={
                        form.formState.errors[k]
                          ? `texto-erro-${k}`
                          : k === "objeto"
                            ? "nx-document-object-help"
                            : undefined
                      }
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
              <p className="nx-field-help">
                A prévia exibe os textos confirmados. Salvamento e emissão são ações distintas.
              </p>
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

// Display-only descriptions. Inputs, validation and payloads retain their numeric contract.
const FRACOES_PARAMETROS = new Set<keyof Parametros>([
  "markup",
  "desconto",
  "frete_materiais",
  "montagem_percentual",
  "aliquota_precificacao",
  "aliquota_interestadual",
  "aliquota_interna_destino",
]);
const MOEDAS_PARAMETROS = new Set<keyof Parametros>([
  "preco_item_tecnico",
  "custo_hora_tecnico",
  "custo_hora_engenheiro",
  "alimentacao_dia",
  "hospedagem_dia",
  "preco_combustivel",
]);
function parametroLeitura(k: keyof Parametros, value: unknown) {
  if (typeof value === "boolean") return value ? "Ativo" : "Inativo";
  if (value === "" || value == null || !Number.isFinite(Number(value))) return "Não informado";
  if (FRACOES_PARAMETROS.has(k))
    return `${(Number(value) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 8 })}%`;
  if (MOEDAS_PARAMETROS.has(k))
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(Number(value));
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 8 });
}
function parametroAjuda(k: keyof Parametros, value: unknown) {
  if (FRACOES_PARAMETROS.has(k)) return `Fração equivalente a ${parametroLeitura(k, value)}.`;
  if (MOEDAS_PARAMETROS.has(k))
    return `Leitura: ${parametroLeitura(k, value)}${k === "preco_combustivel" ? " por litro" : k.startsWith("custo_hora") ? " por hora" : k.endsWith("_dia") ? " por técnico/dia" : ""}.`;
  const unidades: Partial<Record<keyof Parametros, string>> = {
    tecnicos_por_equipe: "Quantidade de técnicos em cada equipe.",
    produtividade_telhado_m_dia: "Metros de telhado executados por equipe a cada dia.",
    produtividade_overhead_m_dia: "Metros de sistema suspenso por equipe a cada dia.",
    horas_por_dia: "Horas de trabalho por dia.",
    horas_engenharia: "Horas previstas para engenharia.",
    km_por_litro: "Quilômetros percorridos por litro de combustível.",
    distancia_ida_volta_km: "Distância total da viagem, incluindo retorno, em km.",
    dias_por_viagem: "Dias de trabalho em campo por deslocamento.",
  };
  return unidades[k];
}

const PARAMETER_GROUPS = [
  {
    titulo: "Condições comerciais",
    icon: Calculator,
    descricao: "Preço, composição de venda e desconto.",
    campos: ["markup", "desconto", "frete_materiais", "montagem_percentual", "preco_item_tecnico"],
  },
  {
    titulo: "Provisões e alíquotas",
    icon: BadgePercent,
    descricao: "Provisões de precificação e DIFAL.",
    campos: [
      "aliquota_precificacao",
      "aliquota_interestadual",
      "aliquota_interna_destino",
      "difal_ativo",
    ],
  },
  {
    titulo: "Equipe e produtividade",
    icon: Users,
    descricao: "Equipe, execução e horas de engenharia.",
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
    icon: Car,
    descricao: "Viagens, combustível e permanência em campo.",
    campos: [
      "alimentacao_dia",
      "hospedagem_dia",
      "preco_combustivel",
      "km_por_litro",
      "distancia_ida_volta_km",
      "dias_por_viagem",
    ],
  },
] satisfies {
  titulo: string;
  icon: typeof Calculator;
  descricao: string;
  campos: (keyof Parametros)[];
}[];

export function ParametrosForm({
  valores,
  editavel,
  onSave,
  revisionPresentation = false,
}: {
  valores: Parametros;
  editavel: boolean;
  onSave: (p: Parametros, fields?: (keyof Parametros)[]) => Promise<boolean | void>;
  revisionPresentation?: boolean;
}) {
  const { register, local, set, settle, remember, draft } = useSave();
  const form = useForm<Parametros>({
    resolver: zodResolver(paramSchema) as never,
    values: draft<Parametros>("parametros") ?? valores,
    resetOptions: { keepDirtyValues: true },
    mode: "onChange",
  });
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const categoryTrigger = useRef<string | null>(null);
  const formElement = useRef<HTMLFormElement | null>(null);
  const categoryScroll = useRef(0);
  const handler = useRef(onSave);
  handler.current = onSave;
  const lastQueued = useRef(JSON.stringify(valores));
  // Keep the actual edit boundary through invalid drafts, route changes and a
  // newer edit that restores a value while its previous write is still pending.
  const editedFields = useRef(new Set(draft<(keyof Parametros)[]>("parametros-fields") ?? []));
  // Global budget defaults reuse this form outside the proposal coordinator.
  // Their existing pause stays local to that page; revisions use only the provider.
  const defaultsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (defaultsTimer.current) clearTimeout(defaultsTimer.current);
    defaultsTimer.current = null;
    if (!editavel) return;
    const result = paramSchema.safeParse(form.getValues());
    if (!result.success) {
      void form.trigger();
      throw new Error("Parâmetros inválidos: revise os campos indicados.");
    }
    const fingerprint = JSON.stringify(result.data);
    if (lastQueued.current === fingerprint) {
      if (draft("parametros")) settle("parametros");
      return;
    }
    lastQueued.current = fingerprint;
    settle("parametros");
    void handler.current(result.data, [...editedFields.current]).then((ok) => {
      if (ok === false) lastQueued.current = "";
      else if (JSON.stringify(form.getValues()) === fingerprint) form.reset(result.data);
    });
  }, [form, editavel, settle, draft]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => register("parametros", () => flushRef.current()), [register]);
  useEffect(() => {
    const sub = form.watch((_values, { type, name }) => {
      if (!editavel || type !== "change") return;
      if (name) editedFields.current.add(name as keyof Parametros);
      remember("parametros-fields", [...editedFields.current]);
      remember("parametros", form.getValues());
      local("parametros");
      if (!revisionPresentation) {
        if (defaultsTimer.current) clearTimeout(defaultsTimer.current);
        defaultsTimer.current = setTimeout(() => {
          try {
            flushRef.current();
          } catch (cause) {
            set("erro", erroMsg(cause));
          }
        }, 800);
      }
    });
    return () => {
      sub.unsubscribe();
      if (defaultsTimer.current) clearTimeout(defaultsTimer.current);
    };
  }, [form, editavel, local, remember, revisionPresentation, set]);
  const closeCategory = useCallback(() => {
    try {
      flush();
    } catch (error) {
      set("erro", erroMsg(error));
    }
    setActiveGroup(null);
    requestAnimationFrame(() => {
      window.scrollTo({ top: categoryScroll.current });
      formElement.current
        ?.querySelector<HTMLButtonElement>(`[data-parameter-group="${categoryTrigger.current}"]`)
        ?.focus({ preventScroll: true });
    });
  }, [flush, set]);
  useEffect(() => {
    if (!activeGroup) return;
    if (!editavel)
      formElement.current
        ?.querySelector<HTMLButtonElement>(".nx-parameter-focus header button")
        ?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCategory();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [activeGroup, closeCategory, editavel]);
  const values = form.watch();
  return (
    <form ref={formElement} onSubmit={form.handleSubmit(() => flush())} className="nx-parameters">
      {!activeGroup && (
        <div className="nx-parameter-categories">
          {PARAMETER_GROUPS.map((grupo) => {
            const Icon = grupo.icon;
            return (
              <button
                key={grupo.titulo}
                type="button"
                className="nx-parameter-category"
                data-parameter-group={grupo.titulo}
                onClick={() => {
                  categoryTrigger.current = grupo.titulo;
                  categoryScroll.current = window.scrollY;
                  setActiveGroup(grupo.titulo);
                }}
              >
                <Icon size={25} strokeWidth={1.6} aria-hidden="true" />
                <strong>{grupo.titulo}</strong>
                <span>{grupo.descricao}</span>
                <dl>
                  {grupo.campos.slice(0, 2).map((key) => (
                    <div key={key}>
                      <dt>{ROTULOS_PARAMETROS[key]}</dt>
                      <dd>{parametroLeitura(key, values[key])}</dd>
                    </div>
                  ))}
                </dl>
                {grupo.campos.some((key) => !!form.formState.errors[key]) && (
                  <span className="nx-object-problems">Revise os campos indicados</span>
                )}
                <span className="nx-parameter-category-action">
                  {editavel ? "Editar parâmetros" : "Consultar parâmetros"} →
                </span>
              </button>
            );
          })}
        </div>
      )}
      {PARAMETER_GROUPS.filter((grupo) => grupo.titulo === activeGroup).map((grupo) => (
        <section key={grupo.titulo} className="nx-parameter-focus" aria-label={grupo.titulo}>
          <header>
            <div>
              <h3>{grupo.titulo}</h3>
              <p>{grupo.descricao}</p>
            </div>
            <ActionButton variant="ghost" onClick={closeCategory}>
              <ArrowLeft size={16} aria-hidden="true" /> Voltar às categorias
            </ActionButton>
          </header>
          {!editavel && <p className="nx-editor-note">Esta revisão está protegida para edição.</p>}
          <div className="nx-parameter-fields">
            {grupo.campos.map((k, index) => {
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
                      autoFocus={index === 0 && editavel}
                      step="any"
                      disabled={!editavel}
                      aria-invalid={!!err}
                      aria-label={ROTULOS_PARAMETROS[k]}
                      aria-describedby={
                        err
                          ? `param-erro-${k}`
                          : revisionPresentation
                            ? `param-ajuda-${k}`
                            : undefined
                      }
                      {...form.register(k, { valueAsNumber: true })}
                      className="w-full rounded border border-input bg-background px-3 text-right tabular-nums text-foreground"
                    />
                  )}
                  {revisionPresentation && k !== "difal_ativo" && (
                    <span id={`param-ajuda-${k}`} className="nx-field-help">
                      {parametroAjuda(k, form.watch(k))}
                    </span>
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
        </section>
      ))}
    </form>
  );
}

export function ParametrosRevisao({ revisaoId }: { revisaoId: string }) {
  const rev = useRevisao(revisaoId);
  const patchRevision = usePatchRevisao(revisaoId);
  if (rev.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  // Display defaults are compared canonically inside the FIFO, while untouched
  // raw fields remain sparse and concurrent values remain owned by their editor.
  const onSave = (p: Parametros, fields?: (keyof Parametros)[]) =>
    patchRevision("parametros", p as unknown as Record<string, unknown>, { fields: fields ?? [] });

  return (
    <Section
      title="Parâmetros desta revisão"
      description="Parâmetros da revisão atual. Alterações válidas são salvas e recalculadas automaticamente; os padrões globais permanecem separados."
    >
      <ParametrosForm
        valores={mesclarParametros(rev.data.parametros)}
        editavel={rev.data.editavel}
        onSave={onSave}
        revisionPresentation
      />
    </Section>
  );
}

// ---------------- Histórico ----------------
export function Historico({ propostaId, revisaoId }: { propostaId: string; revisaoId: string }) {
  const navigate = useNavigate();
  const nova = useServerFn(novaRevisao);
  const org = useOrg();
  const listSaves = useServerFn(listarSalvamentos);
  const saves = useInfiniteQuery({
    queryKey: ["salvamentos", revisaoId],
    enabled: !!org.data?.canSeeCosts,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listSaves({ data: { revisao_id: revisaoId, limite: 50, offset: pageParam } }),
    getNextPageParam: (lastPage, pages) => (lastPage.length === 50 ? pages.length * 50 : undefined),
    select: (data) => data.pages.flat(),
  });
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
    enabled: org.data?.roles.includes("admin") ?? false,
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
    enabled: !!org.data?.canSeeCosts,
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
    <div className="nx-history">
      {org.data?.canSeeCosts && (
        <Section
          title="Salvamentos confirmados"
          className="nx-history-saves"
          description="Alterações confirmadas são consolidadas automaticamente após uma pausa na edição. Cada registro preserva campos, autoria e referência do cálculo; execuções de cálculo têm sua própria trilha."
        >
          <QueryView
            query={saves}
            empty={
              <EmptyState
                title="Nenhum salvamento consolidado"
                hint="A proposta pode ter entradas persistidas sem um checkpoint comercial. Novas alterações confirmadas serão consolidadas automaticamente. Registros anteriores à ativação não são reconstruídos."
              />
            }
          >
            {(rows) => (
              <>
                <ObjectCollection label="Salvamentos confirmados">
                  {rows.map((event) => (
                    <SaveEventCard key={event.id} event={event} />
                  ))}
                </ObjectCollection>
                {saves.hasNextPage && (
                  <ActionButton
                    variant="ghost"
                    loading={saves.isFetchingNextPage}
                    onClick={() => saves.fetchNextPage()}
                  >
                    Carregar salvamentos anteriores
                  </ActionButton>
                )}
              </>
            )}
          </QueryView>
        </Section>
      )}
      <Section
        title="Revisões"
        className="nx-history-revisions"
        description="Versões formais da proposta. Criar uma revisão é uma ação distinta de salvar o rascunho atual."
      >
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
              <ObjectCollection label="Revisões formais">
                {rows.map((r) => (
                  <RevisionCard
                    key={r.id}
                    title={`Revisão ${String(r.numero).padStart(2, "0")}`}
                    current={r.id === revisaoId}
                    status={r.status}
                    date={dataBR(r.created_at)}
                    total={brl(
                      (r.totais as { totais?: { final?: number } } | null)?.totais?.final ?? null,
                    )}
                  >
                    {r.enviada_em && (
                      <p className="nx-object-meta">
                        Emissão / registro de envio:{" "}
                        <time dateTime={r.enviada_em}>
                          {new Date(r.enviada_em).toLocaleString("pt-BR")}
                        </time>
                      </p>
                    )}
                    {r.aceita_em && (
                      <p className="nx-object-meta">
                        Aceite:{" "}
                        <time dateTime={r.aceita_em}>
                          {new Date(r.aceita_em).toLocaleString("pt-BR")}
                        </time>
                      </p>
                    )}
                    <Link
                      className="nx-card-primary"
                      to="/comercial/propostas/$propostaId/revisoes/$revisaoId/itens-comerciais"
                      params={{ propostaId, revisaoId: r.id }}
                    >
                      Abrir revisão →
                    </Link>
                  </RevisionCard>
                ))}
              </ObjectCollection>
            )}
          </QueryView>
        </div>
      </Section>
      <div className="nx-history-records space-y-4">
        {org.data?.roles.includes("admin") && (
          <Section title="Registros legados">
            <p className="nx-editor-note">
              Estes logs não registram diferenças completas nem comprovam um salvamento consolidado.
              Autoria não registrada não é inferida.
            </p>
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
        )}
        {org.data?.canSeeCosts && (
          <details className="nx-technical-log">
            <summary>Execuções de cálculo · detalhe técnico</summary>
            <Section title="Cálculos (não contam como edições)">
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
          </details>
        )}
      </div>
    </div>
  );
}
