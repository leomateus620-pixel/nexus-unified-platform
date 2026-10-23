import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import {
  ActionButton,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
  StatCard,
} from "@/components/nexus/Page";
import { EntityPicker } from "@/components/nexus/EntityPicker";
import { useOrg } from "@/features/org/session";
import { useOperationalAccess } from "@/features/operacao/access";
import { Pagination, fieldClass } from "@/features/operacao/components";
import { RecordFiles } from "@/features/operacao/RecordFiles";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { podeVerRota } from "@/lib/nexus-nav";
import {
  buscarOpcoesAlmoxarifado,
  executarAlmoxarifado,
  obterAlmoxarifado,
} from "./almoxarifado.functions";
import {
  almoxarifadoKeys,
  invalidarAlmoxarifado,
  useAlmoxarifadoDetail,
  useAlmoxarifadoList,
} from "./queries";
import {
  acessoAlmoxarifadoNegado,
  ALMOXARIFADO_ACESSO_INDISPONIVEL,
  condicoesFerramenta,
  estadosReservaEstoque,
  tiposConsultaEstoque,
} from "./domain";
import { StockCommandForm, stockCommandTitles, type StockEditor } from "./AlmoxarifadoForms";
import type {
  AlmoxarifadoDetalhe,
  AlmoxarifadoLista,
  ComandoAlmoxarifado,
  TipoConsultaEstoque,
  TipoDetalheEstoque,
} from "./types";
import "./almoxarifado.css";
import { captureStockContinuation } from "./continuation";

export type StockSearch = {
  aba: TipoConsultaEstoque;
  detalhe: TipoDetalheEstoque;
  registro: string;
  busca: string;
  estado: string;
  local: string;
  pagina: number;
};
const qty = (v: string) =>
  v
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "")
    .replace(".", ",");
const instant = (v: string | null, timezone?: string) => {
  if (!v) return "Não informado";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(v));
  } catch {
    return `${new Date(v).toISOString()} (UTC)`;
  }
};
const date = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${v}T12:00:00`))
    : "Sem validade exigida";
const hints: Record<TipoConsultaEstoque, string> = {
  materiais: "Disponível, reservado e físico por produto do catálogo.",
  ferramentas: "Patrimônio individual, condição e custódia.",
  movimentos: "Eventos físicos preservados, com origem e responsável.",
  conferencias: "Classifique a entrada real antes de disponibilizar material.",
  reservas: "Acompanhe reserva, retirada, consumo e devolução de sobras.",
  inventarios: "Contagem física e ajuste aprovado, com saldo-base rastreável.",
  locais: "Locais de guarda compartilhados por materiais e ferramentas.",
};
type Row = {
  id: string;
  title: string;
  context: string;
  state: string;
  amount: string;
  period: string;
};
function listRows(list: AlmoxarifadoLista): Row[] {
  switch (list.tipo) {
    case "materiais":
      return list.rows.map((v) => ({
        id: v.id,
        title: `${v.produto.codigo} · ${v.produto.descricao}`,
        context: `Unidade: ${v.produto.unidade}`,
        state: `${qty(v.saldo.reservado)} reservados`,
        amount: `${qty(v.saldo.disponivel)} ${v.produto.unidade}`,
        period: `Aceitos: ${qty(v.saldo.aceito)}`,
      }));
    case "ferramentas":
      return list.rows.map((v) => ({
        id: v.id,
        title: `${v.patrimonio} · ${v.descricao}`,
        context: v.local_nome,
        state: `${condicoesFerramenta[v.condicao]} · ${v.disponibilidade.replaceAll("_", " ")}`,
        amount: v.proprietario === "nexus" ? "Nexus" : v.proprietario_nome || "Terceiro",
        period: v.exige_calibracao ? "Calibração exigida" : "Sem exigência cadastrada",
      }));
    case "reservas":
      return list.rows.map((v) => ({
        id: v.id,
        title: `${v.produto.codigo} · ${v.produto.descricao}`,
        context: `${v.pessoa_nome} · ${v.projeto_nome || v.op_numero || v.local_nome}`,
        state: estadosReservaEstoque[v.estado],
        amount: `${qty(v.quantidades.pendente_retirada)} ${v.produto.unidade} a retirar`,
        period: instant(v.validade),
      }));
    case "conferencias":
      return list.rows.map((v) => ({
        id: v.id,
        title: `${v.produto.codigo} · ${v.produto.descricao}`,
        context: v.local_nome,
        state: v.recebimento_id
          ? "Recebimento de OC"
          : v.apontamento_id
            ? "Produção em OP"
            : "Ajuste de inventário",
        amount: `${qty(v.quantidade)} ${v.unidade_origem}`,
        period: instant(v.created_at),
      }));
    case "movimentos":
      return list.rows.map((v) => ({
        id: v.id,
        title: `${v.produto.codigo} · ${v.produto.descricao}`,
        context: v.local_nome || "Em poder / consumo",
        state: `${v.operacao} · ${v.posicao.replaceAll("_", " ")}`,
        amount: `${qty(v.quantidade)} ${v.produto.unidade}`,
        period: instant(v.created_at),
      }));
    case "inventarios":
      return list.rows.map((v) => ({
        id: v.id,
        title: `${v.produto.codigo} · ${v.produto.descricao}`,
        context: `${v.local_nome} · ${v.lote ? `Lote ${v.lote}` : "Todos os lotes do recorte"}`,
        state: v.estado,
        amount: `Contada: ${qty(v.contada)} ${v.produto.unidade} · diferença: ${qty(v.diferenca)}`,
        period: instant(v.created_at),
      }));
    case "locais":
      return list.rows.map((v) => ({
        id: v.id,
        title: v.nome,
        context: v.descricao || "Local de guarda",
        state: v.ativo ? "Ativo" : "Arquivado",
        amount: `Versão ${v.version}`,
        period: instant(v.updated_at),
      }));
  }
}
export function AlmoxarifadoWorkspace({
  search,
  onSearch,
}: {
  search: StockSearch;
  onSearch: (patch: Partial<StockSearch>) => void;
}) {
  const org = useOrg();
  const access = useOperationalAccess(org.data?.orgId || "", org.data?.userId || "");
  if (access.isPending) return <LoadingState label="Conferindo acesso ao almoxarifado…" />;
  if (org.isError || access.isError || !org.data)
    return (
      <ErrorState
        error={org.error || access.error || new Error("Sessão indisponível.")}
        onRetry={async () => {
          const current = await org.refetch();
          if (!current.isError) await access.refetch();
        }}
      />
    );
  return (
    <StockContent
      key={`${org.data.orgId}:${org.data.userId}:${JSON.stringify(access.data)}`}
      org={org.data.orgId}
      user={org.data.userId}
      search={search}
      onSearch={onSearch}
    />
  );
}
function StockContent({
  org,
  user,
  search,
  onSearch,
}: {
  org: string;
  user: string;
  search: StockSearch;
  onSearch: (patch: Partial<StockSearch>) => void;
}) {
  const qc = useQueryClient(),
    run = useServerFn(executarAlmoxarifado),
    load = useServerFn(obterAlmoxarifado),
    options = useServerFn(buscarOpcoesAlmoxarifado);
  const debounced = useDebouncedValue(search.busca);
  const [editor, setEditor] = useState<StockEditor | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [saved, setSaved] = useState("");
  const pending = useRef(false),
    focus = useRef<HTMLDivElement>(null);
  const currentEditor = useRef(editor);
  currentEditor.current = editor;
  const lifecycle = useRef({ active: false, generation: 0 });
  useEffect(() => {
    const scope = lifecycle.current;
    scope.active = true;
    scope.generation += 1;
    return () => {
      scope.active = false;
      scope.generation += 1;
    };
  }, []);
  const continuation = () => {
    const generation = lifecycle.current.generation;
    return captureStockContinuation(
      qc,
      ["operacao-acesso", org, user],
      () => lifecycle.current.active && lifecycle.current.generation === generation,
    );
  };
  const list = useAlmoxarifadoList(org, search.aba, {
    busca: debounced,
    estado: search.estado || null,
    local_id: search.local || null,
    pagina: search.pagina,
  });
  const detail = useAlmoxarifadoDetail(org, search.detalhe, search.registro || null);
  const denied =
    acessoAlmoxarifadoNegado(detail.error) ||
    acessoAlmoxarifadoNegado(error) ||
    (!search.registro && acessoAlmoxarifadoNegado(list.error));
  useEffect(() => {
    if (denied) {
      setEditor(null);
      requestAnimationFrame(() => {
        const alert = focus.current?.querySelector<HTMLElement>('[role="alert"]');
        if (alert) alert.tabIndex = -1;
        (alert ?? focus.current)?.focus();
      });
    }
  }, [denied]);
  const select = (id: string, tipo: TipoDetalheEstoque = search.aba) => {
    setSaved("");
    setError(null);
    onSearch({ registro: id, detalhe: tipo });
  };
  const open = (
    comando: StockEditor["comando"],
    base?: AlmoxarifadoDetalhe,
    target?: StockEditor["target"],
  ) => {
    setError(null);
    setSaved("");
    setEditor({ comando, ...(base ? { base } : {}), ...(target ? { target } : {}) });
  };
  const execute = async (command: ComandoAlmoxarifado) => {
    if (pending.current) return false;
    const mayContinue = continuation();
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await run({ data: command });
      if (!mayContinue()) return false;
      qc.setQueryData(almoxarifadoKeys.detail(org, result.tipo, result.id), result.detalhe);
      setEditor(null);
      onSearch({ registro: result.id, detalhe: result.tipo });
      setSaved("Operação confirmada no servidor.");
      await invalidarAlmoxarifado(qc, org);
      return true;
    } catch (e) {
      if (!mayContinue()) return false;
      const failure =
        e instanceof Error
          ? e
          : new Error(
              acessoAlmoxarifadoNegado(e)
                ? ALMOXARIFADO_ACESSO_INDISPONIVEL
                : "Não foi possível confirmar a operação. Seu preenchimento foi mantido.",
            );
      setError(failure);
      if (acessoAlmoxarifadoNegado(failure)) await invalidarAlmoxarifado(qc, org);
      return false;
    } finally {
      pending.current = false;
      if (mayContinue()) setBusy(false);
    }
  };
  const perms = list.isError || denied ? undefined : list.data?.permissoes,
    active = !!search.registro;
  const primary: Partial<Record<TipoConsultaEstoque, StockEditor["comando"]>> = {
    materiais: perms?.conferir ? "conferir_evento" : "configurar_produto",
    ferramentas: "salvar_ferramenta",
    conferencias: "conferir_evento",
    reservas: "reservar",
    inventarios: "criar_inventario",
    locais: "salvar_local",
  };
  const primaryCmd = primary[search.aba];
  const mayCreate =
    primaryCmd &&
    (primaryCmd === "conferir_evento"
      ? perms?.conferir
      : primaryCmd === "reservar"
        ? perms?.reservar
        : perms?.gerir);
  return (
    <div className="nx-stock-workspace min-w-0">
      <PageHeader
        eyebrow="Recursos · controle físico"
        title="Almoxarifado e Ferramentas"
        description={
          active
            ? "Origem, saldo e responsabilidade no mesmo histórico."
            : "Materiais disponíveis e ferramentas sob custódia."
        }
        actions={
          !active &&
          mayCreate && (
            <ActionButton onClick={() => open(primaryCmd!)}>
              <Plus size={16} aria-hidden="true" />
              {stockCommandTitles[primaryCmd!]}
            </ActionButton>
          )
        }
      />
      {saved && (
        <p role="status" className="mb-4 rounded border border-primary/40 p-3 text-sm">
          {saved}
        </p>
      )}
      {active ? (
        <>
          <ActionButton
            variant="ghost"
            className="mb-4"
            onClick={() => {
              onSearch({ registro: "" });
              setError(null);
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Voltar à lista
          </ActionButton>
          <div ref={focus} tabIndex={-1}>
            {denied ? (
              <ErrorState
                error={error || detail.error || new Error("Acesso indisponível.")}
                onRetry={async () => {
                  const result = await detail.refetch();
                  if (!result.isError) setError(null);
                }}
              />
            ) : detail.isPending ? (
              <LoadingState label="Consultando registro e permissões…" />
            ) : detail.isError ? (
              <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
            ) : (
              detail.data && (
                <StockDetail org={org} detail={detail.data} open={open} select={select} />
              )
            )}
          </div>
        </>
      ) : (
        <>
          <label className="mb-4 grid gap-1 text-sm sm:hidden">
            Área do almoxarifado
            <select
              className={fieldClass}
              value={search.aba}
              onChange={(event) =>
                onSearch({
                  aba: event.target.value as TipoConsultaEstoque,
                  registro: "",
                  busca: "",
                  estado: "",
                  pagina: 0,
                })
              }
            >
              {Object.entries(tiposConsultaEstoque).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <nav
            aria-label="Áreas do almoxarifado"
            className="nx-stock-tabs mb-4 hidden flex-wrap gap-1 sm:flex"
          >
            {Object.entries(tiposConsultaEstoque).map(([key, label]) => (
              <ActionButton
                key={key}
                variant="ghost"
                aria-current={search.aba === key ? "page" : undefined}
                onClick={() =>
                  onSearch({
                    aba: key as TipoConsultaEstoque,
                    registro: "",
                    busca: "",
                    estado: "",
                    pagina: 0,
                  })
                }
              >
                {label}
              </ActionButton>
            ))}
          </nav>
          <Section title={tiposConsultaEstoque[search.aba]} description={hints[search.aba]}>
            {search.aba === "materiais" && perms?.gerir && (
              <details className="mb-3 text-sm">
                <summary>Rastreabilidade do catálogo</summary>
                <div className="mt-3">
                  <ActionButton variant="ghost" onClick={() => open("configurar_produto")}>
                    Configurar material existente
                  </ActionButton>
                </div>
              </details>
            )}
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="grid min-w-0 flex-1 basis-52 gap-1 text-sm">
                Buscar registro
                <input
                  type="search"
                  value={search.busca}
                  maxLength={120}
                  onChange={(e) => onSearch({ busca: e.target.value, pagina: 0 })}
                  className={fieldClass}
                  placeholder="Código, nome ou descrição"
                />
              </label>
              {["reservas", "ferramentas", "inventarios", "locais"].includes(search.aba) && (
                <label className="grid gap-1 text-sm">
                  Situação
                  <select
                    className={fieldClass}
                    value={search.estado}
                    onChange={(e) => onSearch({ estado: e.target.value, pagina: 0 })}
                  >
                    <option value="">Todas</option>
                    {Object.entries(
                      search.aba === "reservas"
                        ? estadosReservaEstoque
                        : search.aba === "ferramentas"
                          ? condicoesFerramenta
                          : search.aba === "locais"
                            ? { ativo: "Ativos", arquivado: "Arquivados" }
                            : { aberto: "Aberto", aprovado: "Aprovado", cancelado: "Cancelado" },
                    ).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <details className="basis-full rounded border border-border p-3 text-sm">
                <summary>Filtro por local{search.local ? " · ativo" : ""}</summary>
                <div className="mt-3 max-w-lg">
                  <EntityPicker
                    label="Local de estoque"
                    value={search.local}
                    queryKey={["almoxarifado-opcoes", org, "locais"]}
                    load={async (busca, signal) =>
                      (
                        await options({
                          data: { organization_id: org, tipo: "locais", busca },
                          signal,
                        })
                      ).rows
                    }
                    onChange={(o) => onSearch({ local: o?.id || "", pagina: 0 })}
                  />
                </div>
              </details>
              {(search.busca || search.estado || search.local) && (
                <ActionButton
                  variant="ghost"
                  onClick={() => {
                    onSearch({ busca: "", estado: "", local: "", pagina: 0 });
                  }}
                >
                  Limpar filtros
                </ActionButton>
              )}
            </div>
            {debounced !== search.busca && (
              <p role="status" className="mb-3 text-xs text-muted-foreground">
                Atualizando busca…
              </p>
            )}
            {denied ? (
              <div ref={focus} tabIndex={-1}>
                <ErrorState
                  error={error || list.error || new Error(ALMOXARIFADO_ACESSO_INDISPONIVEL)}
                  onRetry={async () => {
                    const result = await list.refetch();
                    if (!result.isError) setError(null);
                  }}
                />
              </div>
            ) : list.isPending ? (
              <LoadingState label="Consultando estoque autorizado…" />
            ) : list.isError ? (
              <div ref={focus} tabIndex={-1}>
                <ErrorState error={list.error} onRetry={() => list.refetch()} />
              </div>
            ) : (
              list.data && (
                <>
                  {list.data.rows.length ? (
                    <>
                      <ul
                        className="space-y-3 sm:hidden"
                        aria-label={tiposConsultaEstoque[search.aba]}
                      >
                        {listRows(list.data).map((row) => (
                          <li key={row.id} className="space-y-2 rounded border border-border p-3">
                            <button
                              className="min-h-11 text-left text-sm font-semibold leading-relaxed"
                              onClick={() => select(row.id)}
                            >
                              {row.title}
                            </button>
                            <p className="break-words text-xs text-muted-foreground">
                              {row.context}
                            </p>
                            <dl className="grid gap-2 text-sm">
                              <div>
                                <dt className="text-xs text-muted-foreground">
                                  {search.aba === "materiais"
                                    ? "Disponível"
                                    : "Quantidade / referência"}
                                </dt>
                                <dd className="tabular-nums font-medium">{row.amount}</dd>
                              </div>
                              <div>
                                <dt className="sr-only">Situação</dt>
                                <dd>{row.state}</dd>
                              </div>
                              <div>
                                <dt className="sr-only">Referência</dt>
                                <dd className="text-xs text-muted-foreground">{row.period}</dd>
                              </div>
                            </dl>
                          </li>
                        ))}
                      </ul>
                      <div className="hidden sm:block">
                        <DataTable
                          label={tiposConsultaEstoque[search.aba]}
                          rows={listRows(list.data)}
                          getRowId={(r) => r.id}
                          columns={[
                            {
                              key: "title",
                              label: "Identificação",
                              render: (r) => (
                                <button
                                  className="text-left font-medium underline-offset-4 hover:underline"
                                  onClick={() => select(r.id)}
                                >
                                  {r.title}
                                </button>
                              ),
                            },
                            { key: "context", label: "Contexto" },
                            { key: "state", label: "Situação" },
                            {
                              key: "amount",
                              label:
                                search.aba === "materiais"
                                  ? "Disponível"
                                  : "Quantidade / referência",
                              align: "right",
                            },
                            {
                              key: "period",
                              label:
                                search.aba === "reservas" ? "Validade da reserva" : "Referência",
                            },
                          ]}
                        />
                      </div>
                    </>
                  ) : (
                    <EmptyState
                      title={
                        search.busca || search.estado || search.local
                          ? "Nenhum resultado neste recorte"
                          : "Nenhum registro cadastrado"
                      }
                      hint={
                        search.busca || search.estado || search.local
                          ? "Ajuste a busca ou limpe os filtros."
                          : "Use a ação de cadastro permitida para iniciar o controle físico. Aquisições não geram saldo presumido."
                      }
                    />
                  )}
                  <Pagination
                    page={list.data.page}
                    total={list.data.total}
                    onChange={(pagina) => onSearch({ pagina })}
                  />
                </>
              )
            )}
          </Section>
        </>
      )}
      {editor && !denied && (
        <StockCommandForm
          key={`${editor.comando}:${editor.base?.id || "novo"}:${editor.target?.id || ""}`}
          org={org}
          editor={editor}
          busy={busy}
          error={error}
          execute={execute}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
          onCompare={async (material) => {
            const target = editor.base ?? material;
            if (!target) return undefined;
            const mayContinue = continuation();
            try {
              const current = await load({
                data: { organization_id: org, tipo: target.tipo, id: target.id },
              });
              return mayContinue() && currentEditor.current === editor ? current : undefined;
            } catch (failure) {
              if (
                mayContinue() &&
                currentEditor.current === editor &&
                acessoAlmoxarifadoNegado(failure)
              )
                setError(
                  failure instanceof Error ? failure : new Error(ALMOXARIFADO_ACESSO_INDISPONIVEL),
                );
              throw failure;
            }
          }}
        />
      )}
    </div>
  );
}

function StockDetail({
  org,
  detail,
  open,
  select,
}: {
  org: string;
  detail: AlmoxarifadoDetalhe;
  open: (
    comando: StockEditor["comando"],
    base?: AlmoxarifadoDetalhe,
    target?: StockEditor["target"],
  ) => void;
  select: (id: string, tipo: TipoDetalheEstoque) => void;
}) {
  const session = useOrg();
  const mayOpen = (path: string) =>
    podeVerRota(session.data?.roles || [], path, session.data?.capabilities || []);
  const p = detail.permissoes,
    action = (cmd: StockEditor["comando"], target?: StockEditor["target"]) => (
      <ActionButton
        key={cmd}
        variant={["reservar", "reservar_ferramenta"].includes(cmd) ? "primary" : "ghost"}
        onClick={() => open(cmd, detail, target)}
      >
        {stockCommandTitles[cmd]}
      </ActionButton>
    );
  let content;
  switch (detail.tipo) {
    case "materiais": {
      const r = detail.registro;
      content = (
        <>
          <Section
            title={`${r.produto.codigo} · ${r.produto.descricao}`}
            description={`Unidade canônica: ${r.produto.unidade}`}
            actions={p.gerir && action("configurar_produto")}
          >
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                ["Disponível", r.saldo.disponivel],
                ["Reservado", r.saldo.reservado],
                ["Físico aceito", r.saldo.aceito],
                ["Quarentena", r.saldo.quarentena],
              ].map(([label, value]) => (
                <StatCard
                  key={label}
                  label={label!}
                  value={`${qty(value!)} ${r.produto.unidade}`}
                />
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Outras posições em {r.produto.unidade}: em poder {qty(r.saldo.em_poder)} · consumido{" "}
              {qty(r.saldo.consumido)} · rejeitado {qty(r.saldo.rejeitado)}. O recorte da ficha
              inclui os locais autorizados.
            </p>
            <p className="mt-2 text-sm">
              Lote: {r.politica?.exige_lote ? "exigido" : "opcional"} · Série:{" "}
              {r.politica?.exige_serie ? "exigida" : "opcional"} · Mínimo configurado:{" "}
              {r.politica
                ? `${qty(r.politica.estoque_minimo)} ${r.produto.unidade}`
                : "Não cadastrado"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {p.reservar && action("reservar")}
              {p.gerir && (
                <>
                  {action("transferir")}
                  {action("criar_inventario")}
                </>
              )}
            </div>
          </Section>
          <Section
            title="Lotes e locais"
            description="Saldos derivados dos movimentos confirmados."
          >
            {detail.lotes.length ? (
              <DataTable
                rows={detail.lotes}
                getRowId={(v) => `${v.conferencia_id}:${v.local_id}`}
                columns={[
                  { key: "local_nome", label: "Local" },
                  { key: "lote", label: "Lote", render: (v) => v.lote || "Sem lote" },
                  { key: "serie", label: "Série", render: (v) => v.serie || "Sem série" },
                  {
                    key: "saldo",
                    label: "Disponível",
                    align: "right",
                    render: (v) => `${qty(v.saldo.disponivel)} ${r.produto.unidade}`,
                  },
                  {
                    key: "conferencia",
                    label: "Origem",
                    render: (v) =>
                      p.gerir ? (
                        <button
                          className="underline"
                          onClick={() => select(v.conferencia_id, "conferencias")}
                        >
                          Abrir conferência
                        </button>
                      ) : (
                        "Entrada conferida"
                      ),
                  },
                ]}
              />
            ) : (
              <EmptyState
                title="Sem entrada física confirmada"
                hint="Conferir um recebimento ou uma produção real gera a primeira posição de estoque."
              />
            )}
          </Section>
        </>
      );
      break;
    }
    case "reservas": {
      const r = detail.registro;
      content = (
        <Section
          title={`${r.produto.codigo} · ${r.produto.descricao}`}
          description={`${estadosReservaEstoque[r.estado]} · ${r.pessoa_nome} · ${r.local_nome}`}
        >
          <dl className="nx-stock-facts">
            {Object.entries({
              "Reservado inicialmente": r.quantidades.quantidade,
              "A retirar": r.quantidades.pendente_retirada,
              Retirado: r.quantidades.retirada,
              Consumido: r.quantidades.consumida,
              Devolvido: r.quantidades.devolvida,
              "Em poder": r.quantidades.em_poder,
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {qty(value)} {r.produto.unidade}
                </dd>
              </div>
            ))}
            <div>
              <dt>Validade da reserva</dt>
              <dd>{instant(r.validade)}</dd>
            </div>
            <div>
              <dt>Destino</dt>
              <dd>
                {r.projeto_id && mayOpen("/projetos") ? (
                  <Link to="/projetos/$projetoId" params={{ projetoId: r.projeto_id }}>
                    {r.projeto_nome || "Abrir projeto"}
                  </Link>
                ) : r.op_id && mayOpen("/compras/ordens-producao") ? (
                  <Link to="/compras/ordens-producao/$ordemId" params={{ ordemId: r.op_id }}>
                    {r.op_numero || "Abrir OP"}
                  </Link>
                ) : (
                  r.projeto_nome || r.op_numero || "Não informado"
                )}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {p.executar && r.estado !== "cancelada" && r.estado !== "concluida" && (
              <>
                {/[1-9]/.test(r.quantidades.pendente_retirada) &&
                  Date.parse(r.validade) > Date.now() &&
                  action("retirar")}
                {/[1-9]/.test(r.quantidades.em_poder) && (
                  <>
                    {action("consumir")}
                    {action("devolver")}
                  </>
                )}
              </>
            )}
            {p.gerir && ["ativa", "retirada"].includes(r.estado) && action("cancelar_reserva")}
          </div>
        </Section>
      );
      break;
    }
    case "ferramentas": {
      const r = detail.registro;
      content = (
        <>
          <Section
            title={`${r.patrimonio} · ${r.descricao}`}
            description={`${condicoesFerramenta[r.condicao]} · ${r.local_nome}`}
            actions={p.editar && action("salvar_ferramenta")}
          >
            <dl className="nx-stock-facts">
              <div>
                <dt>Disponibilidade atual</dt>
                <dd>{r.disponibilidade.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt>Propriedade</dt>
                <dd>{r.proprietario === "nexus" ? "Nexus" : r.proprietario_nome}</dd>
              </div>
              <div>
                <dt>Calibração</dt>
                <dd>
                  {r.exige_calibracao
                    ? "Exigida conforme política cadastrada"
                    : "Sem exigência cadastrada"}
                </dd>
              </div>
              <div>
                <dt>Produto de origem</dt>
                <dd>
                  {r.produto
                    ? `${r.produto.codigo} · ${r.produto.descricao}`
                    : "Patrimônio preexistente sem produto vinculado"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {p.reservar && action("reservar_ferramenta")}
              {p.gerir && (
                <>
                  {action("alterar_condicao")}
                  {action("registrar_calibracao")}
                </>
              )}
              {p.publicar_politica_calibracao && action("publicar_politica_calibracao")}
            </div>
          </Section>
          <Section title="Custódia e reservas">
            <ul className="space-y-3">
              {detail.custodias.map((v) => (
                <li key={v.id} className="rounded border border-border p-3">
                  <p className="font-medium">
                    {v.pessoa_nome} · {v.estado}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {instant(v.inicio, v.timezone)} → {instant(v.fim, v.timezone)} · {v.timezone}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.executar && v.estado === "reservada" && action("retirar_ferramenta", v)}
                    {p.executar && v.estado === "retirada" && action("devolver_ferramenta", v)}
                    {p.gerir && v.estado === "reservada" && action("cancelar_custodia", v)}
                  </div>
                </li>
              ))}
            </ul>
            {!detail.custodias.length && (
              <p className="text-sm text-muted-foreground">
                Nenhuma reserva ou retirada registrada.
              </p>
            )}
          </Section>
          <Section title="Calibrações e certificados">
            <ul className="space-y-4">
              {detail.calibracoes.map((v) => (
                <li key={v.id} className="space-y-3 rounded border border-border p-3">
                  <p className="font-medium">
                    {v.emissor} · {v.estado.replaceAll("_", " ")}
                  </p>
                  <p className="text-sm">
                    Execução: {date(v.execucao)} · Validade: {date(v.validade)}
                  </p>
                  {v.referencia && <p className="break-words text-sm">{v.referencia}</p>}
                  {p.publicar_politica_calibracao &&
                    v.estado !== "revogada" &&
                    action("conferir_calibracao", v)}
                  <RecordFiles
                    pai={{
                      organization_id: org,
                      pessoa_id: null,
                      acao_id: null,
                      qualificacao_id: null,
                      calibracao_id: v.id,
                    }}
                    readOnly={["validada", "revogada"].includes(v.estado)}
                  />
                </li>
              ))}
            </ul>
            {!detail.calibracoes.length && (
              <p className="text-sm text-muted-foreground">
                Nenhuma calibração registrada. Validade e método dependem da política aprovada.
              </p>
            )}
          </Section>
          <Section title="Arquivos da ferramenta">
            <RecordFiles
              pai={{
                organization_id: org,
                pessoa_id: null,
                acao_id: null,
                qualificacao_id: null,
                ferramenta_id: r.id,
              }}
            />
          </Section>
        </>
      );
      break;
    }
    case "conferencias": {
      const r = detail.registro;
      content = (
        <Section
          title={`${r.produto.codigo} · Entrada física`}
          description={`${r.local_nome} · ${instant(r.created_at)}`}
        >
          <dl className="nx-stock-facts">
            <div>
              <dt>Quantidade na origem</dt>
              <dd>
                {qty(r.quantidade)} {r.unidade_origem}
              </dd>
            </div>
            <div>
              <dt>Aceita</dt>
              <dd>
                {qty(r.aceita)} {r.produto.unidade}
              </dd>
            </div>
            <div>
              <dt>Quarentena</dt>
              <dd>
                {qty(r.quarentena)} {r.produto.unidade}
              </dd>
            </div>
            <div>
              <dt>Rejeitada</dt>
              <dd>
                {qty(r.rejeitada)} {r.produto.unidade}
              </dd>
            </div>
            <div>
              <dt>Conversão confirmada</dt>
              <dd>
                {r.fator} · {r.unidade_origem} → {r.produto.unidade}
              </dd>
            </div>
            <div>
              <dt>Lote / série</dt>
              <dd>
                {r.lote || "Sem lote"} / {r.serie || "Sem série"}
              </dd>
            </div>
          </dl>
          {r.motivo && <p className="mt-3 whitespace-pre-wrap text-sm">{r.motivo}</p>}
          {r.reconciliacao && (
            <p className="mt-3 whitespace-pre-wrap text-sm">
              Conferência histórica: {r.reconciliacao}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {p.conferir && action("reclassificar_quarentena")}
            {p.gerir && (r.recebimento_id || r.apontamento_id) && action("estornar_evento")}
          </div>
        </Section>
      );
      break;
    }
    case "movimentos": {
      const r = detail.registro;
      content = (
        <Section title={`${r.produto.codigo} · ${r.operacao}`} description={instant(r.created_at)}>
          <dl className="nx-stock-facts">
            <div>
              <dt>Movimento físico</dt>
              <dd>
                {qty(r.quantidade)} {r.produto.unidade}
              </dd>
            </div>
            <div>
              <dt>Posição</dt>
              <dd>{r.posicao.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Local</dt>
              <dd>{r.local_nome || "Em poder / consumo"}</dd>
            </div>
          </dl>
          {r.motivo && <p className="mt-3 whitespace-pre-wrap text-sm">{r.motivo}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {p.gerir && (
              <ActionButton
                variant="ghost"
                onClick={() => select(r.conferencia_id, "conferencias")}
              >
                Abrir conferência de origem
              </ActionButton>
            )}
            {r.reserva_id && (
              <ActionButton variant="ghost" onClick={() => select(r.reserva_id!, "reservas")}>
                Abrir reserva
              </ActionButton>
            )}
          </div>
        </Section>
      );
      break;
    }
    case "inventarios": {
      const r = detail.registro;
      content = (
        <Section
          title={`${r.produto.codigo} · Contagem de inventário`}
          description={`${r.estado} · ${r.local_nome} · ${instant(r.created_at)}`}
        >
          <dl className="nx-stock-facts">
            <div>
              <dt>Saldo-base no registro</dt>
              <dd>
                {qty(r.baseline)} {r.produto.unidade}
              </dd>
            </div>
            <div>
              <dt>Quantidade contada</dt>
              <dd>
                {qty(r.contada)} {r.produto.unidade}
              </dd>
            </div>
            <div>
              <dt>Diferença apurada</dt>
              <dd>
                {qty(r.diferenca)} {r.produto.unidade}
              </dd>
            </div>
            <div>
              <dt>Lote</dt>
              <dd>{r.lote || "Todos os lotes do recorte"}</dd>
            </div>
          </dl>
          <p className="mt-3 whitespace-pre-wrap text-sm">{r.motivo}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {r.estado === "aberto" && p.aprovar_ajuste && action("aprovar_inventario")}
            {r.estado === "aberto" && p.gerir && action("cancelar_inventario")}
            <ActionButton variant="ghost" onClick={() => select(r.produto_id, "materiais")}>
              Abrir material
            </ActionButton>
          </div>
        </Section>
      );
      break;
    }
    case "locais": {
      const r = detail.registro;
      content = (
        <Section
          title={r.nome}
          description={r.ativo ? "Local ativo" : "Local arquivado"}
          actions={p.editar && action("salvar_local")}
        >
          <p className="whitespace-pre-wrap text-sm">
            {r.descricao || "Descrição não cadastrada."}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Atualizado em {instant(r.updated_at)} · versão {r.version}
          </p>
        </Section>
      );
      break;
    }
    case "politicas_calibracao": {
      const r = detail.registro;
      content = (
        <Section
          title={`${r.nome} · V${r.numero}`}
          description="Política publicada; versões anteriores permanecem preservadas."
        >
          <h3 className="font-medium">Método</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm">{r.metodo}</p>
          <h3 className="mt-4 font-medium">Fonte e versão</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm">{r.fonte}</p>
          <p className="mt-3 text-sm">
            Validade {r.exige_validade ? "exigida" : "não exigida"} pela política cadastrada.
          </p>
        </Section>
      );
      break;
    }
  }
  return (
    <div className="space-y-4">
      {content}
      <Section title="Histórico da operação">
        {detail.historico.length ? (
          <ol className="space-y-3">
            {detail.historico.map((v) => (
              <li key={v.id} className="border-l-2 border-border pl-3">
                <p className="text-sm font-medium">{v.operacao.replaceAll("_", " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {instant(v.created_at)} · Autor: <code className="break-all">{v.autor}</code>
                </p>
                {v.motivo && <p className="mt-1 whitespace-pre-wrap text-sm">{v.motivo}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum evento adicional neste registro.</p>
        )}
      </Section>
    </div>
  );
}
