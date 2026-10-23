import { useEffect, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { useOperationalAccess, type OperationalAccess } from "@/features/operacao/access";
import { Pagination, useCommandKey } from "@/features/operacao/components";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { executarLevantamento, obterLevantamento } from "./levantamentos.functions";
import { useLevantamentoDetail, useLevantamentosList } from "./queries";
import { LevantamentoEditor, type LevCommand, type LevEditor } from "./LevantamentoForms";
import { LevantamentoFiles } from "./LevantamentoFiles";
import { AdocaoLevantamento } from "./AdocaoLevantamento";
import { ModelosLevantamento } from "./ModelosLevantamento";
import type { EstadoLevantamento, LevantamentoDetalhe, LevantamentoModelo } from "./types";
import { pendenciasColeta } from "./domain";
import "./levantamentos.css";

export type LevantamentosSearch = {
  levantamento: string;
  revisao: string;
  ponto: string;
  busca: string;
  estado: EstadoLevantamento | "";
  pagina: number;
};
const states: Record<EstadoLevantamento, string> = {
  rascunho: "Rascunho",
  programado: "Programado",
  em_coleta: "Em coleta",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
};
const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "Não informado";
const decimal = (value: string | null) =>
  value === null
    ? "Pendente"
    : (value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value).replace(".", ",");
const quantidade = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;
function State({ value }: { value: EstadoLevantamento }) {
  return (
    <span className="nx-lev-status" data-status={value}>
      {states[value]}
    </span>
  );
}

export function LevantamentosWorkspace({
  search,
  onSearch,
}: {
  search: LevantamentosSearch;
  onSearch: (patch: Partial<LevantamentosSearch>) => void;
}) {
  const org = useOrg();
  const access = useOperationalAccess(org.data?.orgId ?? "", org.data?.userId ?? "");
  if (access.isPending) return <LoadingState label="Conferindo acesso ao levantamento…" />;
  if (access.isError || !org.data)
    return (
      <ErrorState
        error={access.error || new Error("Sessão indisponível.")}
        onRetry={() => access.refetch()}
      />
    );
  return (
    <LevantamentosContent
      key={`${org.data.userId}:${org.data.orgId}:${org.data.roles.join(",")}:${JSON.stringify(access.data)}`}
      org={org.data.orgId}
      access={access.data}
      search={search}
      onSearch={onSearch}
    />
  );
}
function LevantamentosContent({
  org,
  access,
  search,
  onSearch,
}: {
  org: string;
  access: OperationalAccess;
  search: LevantamentosSearch;
  onSearch: (patch: Partial<LevantamentosSearch>) => void;
}) {
  const client = useQueryClient();
  const executeServer = useServerFn(executarLevantamento);
  const getDetail = useServerFn(obterLevantamento);
  const list = useLevantamentosList(org, {
    busca: useDebouncedValue(search.busca),
    estado: search.estado || null,
    pagina: search.pagina,
    limite: 25,
  });
  const detail = useLevantamentoDetail(org, search.levantamento || null, search.revisao || null);
  const [editor, setEditor] = useState<LevEditor | null>(null);
  const [modelEditor, setModelEditor] = useState<LevantamentoModelo | "novo" | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const guard = useRef(false);
  const keyFor = useCommandKey();
  const openEditor = (value: LevEditor) => {
    setError(null);
    setEditor(value);
  };
  async function execute(command: LevCommand) {
    if (guard.current) return false;
    guard.current = true;
    setBusy(true);
    setError(null);
    try {
      const payload = { ...command, organization_id: org };
      const saved = await executeServer({ data: { ...payload, chave: keyFor(payload) } });
      await client.invalidateQueries({ queryKey: ["levantamentos", org] });
      const addedPoint =
        command.comando === "salvar_ponto" && !command.ponto_id
          ? saved.pontos.find((p) => p.codigo === command.codigo)?.id
          : undefined;
      onSearch({
        levantamento: saved.levantamento.id,
        revisao: saved.revisao.id,
        ...(addedPoint
          ? { ponto: addedPoint }
          : command.comando === "nova_revisao"
            ? { ponto: "" }
            : {}),
      });
      setNotice("Alteração confirmada no servidor.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Não foi possível salvar. Tente novamente."));
      return false;
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="nx-lev-workspace space-y-5">
      <PageHeader
        eyebrow="Engenharia · coleta técnica"
        title={
          search.levantamento
            ? detail.data?.levantamento.codigo || "Ficha do levantamento"
            : "Levantamentos técnicos"
        }
        description={
          search.levantamento
            ? "Coleta por ponto, evidências e revisão rastreável."
            : "Planeje a visita, registre o local e encaminhe medidas para revisão."
        }
        actions={
          !search.levantamento && access.gerirOperacao ? (
            <>
              {access.revisarOperacao && (
                <ActionButton variant="ghost" onClick={() => setModelEditor("novo")}>
                  Modelos de coleta
                </ActionButton>
              )}
              <ActionButton onClick={() => openEditor({ tipo: "criar" })}>
                <Plus size={16} aria-hidden /> Novo levantamento
              </ActionButton>
            </>
          ) : undefined
        }
      />
      {notice && (
        <p role="status" className="rounded border border-border bg-card p-3 text-sm">
          {notice}
        </p>
      )}
      {!search.levantamento ? (
        <Section
          title="Levantamentos"
          description="Consulta apenas os registros autorizados ao seu perfil."
        >
          <div className="nx-lev-filters mb-4">
            <label className="nx-lev-label">
              Buscar levantamento
              <input
                className="nx-lev-input"
                type="search"
                value={search.busca}
                maxLength={120}
                placeholder="Código, finalidade ou unidade"
                onChange={(e) => onSearch({ busca: e.target.value, pagina: 0 })}
              />
            </label>
            <label className="nx-lev-label">
              Estado
              <select
                className="nx-lev-input"
                value={search.estado}
                onChange={(e) =>
                  onSearch({ estado: e.target.value as LevantamentosSearch["estado"], pagina: 0 })
                }
              >
                <option value="">Todos</option>
                {Object.entries(states).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {(search.busca || search.estado) && (
              <ActionButton
                variant="ghost"
                onClick={() => onSearch({ busca: "", estado: "", pagina: 0 })}
              >
                Limpar filtros
              </ActionButton>
            )}
          </div>
          {list.isPending ? (
            <LoadingState label="Consultando levantamentos…" />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : (
            <>
              {!list.data.rows.length ? (
                <EmptyState
                  title={
                    search.busca || search.estado
                      ? "Nenhum levantamento neste recorte"
                      : "Nenhum levantamento cadastrado"
                  }
                  hint={
                    search.busca || search.estado
                      ? "Ajuste os filtros para localizar outros registros."
                      : access.gerirOperacao
                        ? "Crie o levantamento com cliente, unidade e responsável."
                        : "Os levantamentos atribuídos a você aparecerão aqui."
                  }
                  action={
                    access.gerirOperacao && !search.busca && !search.estado ? (
                      <ActionButton onClick={() => openEditor({ tipo: "criar" })}>
                        Criar levantamento
                      </ActionButton>
                    ) : undefined
                  }
                />
              ) : (
                <ul className="nx-lev-list" aria-label="Levantamentos encontrados">
                  {list.data.rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setNotice("");
                          onSearch({ levantamento: row.id, revisao: "", ponto: "" });
                        }}
                      >
                        <span>
                          <strong className="text-sm">
                            {row.codigo} · {row.finalidade}
                          </strong>
                          <small>
                            {row.cliente_nome || "Cliente não informado"} ·{" "}
                            {row.unidade_nome || "Unidade não informada"}
                          </small>
                        </span>
                        <span>
                          <span className="text-sm">
                            {row.responsavel_nome || "Responsável não informado"}
                          </span>
                          <small>
                            {row.inicio_previsto
                              ? `Visita: ${date(row.inicio_previsto)}`
                              : "Visita ainda não programada"}
                          </small>
                        </span>
                        <span className="grid gap-1">
                          <State value={row.estado} />
                          <small>Revisão V{row.numero_revisao}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Pagination
                page={search.pagina}
                total={list.data.total}
                onChange={(pagina) => onSearch({ pagina })}
              />
            </>
          )}
        </Section>
      ) : (
        <>
          <ActionButton
            variant="ghost"
            onClick={() => {
              setNotice("");
              onSearch({ levantamento: "", revisao: "", ponto: "" });
            }}
          >
            <ArrowLeft size={16} aria-hidden /> Voltar aos levantamentos
          </ActionButton>
          {detail.isPending ? (
            <LoadingState />
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : (
            <LevantamentoFicha
              org={org}
              detail={detail.data}
              pointId={search.ponto}
              onPoint={(ponto) => onSearch({ ponto })}
              onRevision={(revisao) => onSearch({ revisao, ponto: "" })}
              onEdit={openEditor}
              onModel={() => setModelEditor(detail.data.modelo || "novo")}
            />
          )}
        </>
      )}
      {editor && (
        <LevantamentoEditor
          key={`${editor.tipo}:${editor.comando || ""}:${editor.ponto?.id || ""}:${editor.medicao?.id || ""}`}
          org={org}
          editor={editor}
          detail={detail.data}
          busy={busy}
          error={error}
          execute={execute}
          onClose={() => setEditor(null)}
          onCompare={async () =>
            search.levantamento
              ? getDetail({
                  data: {
                    organization_id: org,
                    levantamento_id: search.levantamento,
                    revisao_id: search.revisao || null,
                  },
                })
              : undefined
          }
        />
      )}
      {modelEditor && (
        <ModelosLevantamento
          org={org}
          modelo={modelEditor === "novo" ? undefined : modelEditor}
          onClose={() => setModelEditor(null)}
          onSaved={() => {
            setModelEditor(null);
            setNotice(
              "Modelo publicado no servidor. As revisões já iniciadas mantêm sua versão de origem.",
            );
          }}
        />
      )}
    </div>
  );
}

function LevantamentoFicha({
  org,
  detail,
  pointId,
  onPoint,
  onRevision,
  onEdit,
  onModel,
}: {
  org: string;
  detail: LevantamentoDetalhe;
  pointId: string;
  onPoint: (id: string) => void;
  onRevision: (id: string) => void;
  onEdit: (editor: LevEditor) => void;
  onModel: () => void;
}) {
  const { levantamento: l, revisao: r, permissoes: p } = detail;
  const pointPanel = useRef<HTMLDivElement>(null);
  const pointList = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pointId && window.matchMedia("(max-width:767px)").matches) {
      pointPanel.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
      pointPanel.current?.focus({ preventScroll: true });
    }
  }, [pointId]);

  const [contextOpen, setContextOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width:768px)").matches,
  );
  const point = detail.pontos.find((item) => item.id === pointId) ?? detail.pontos[0];
  const measurements = detail.medicoes.filter((item) => item.ponto_id === point?.id);
  const open = (comando: LevCommand["comando"]) => onEdit({ tipo: "transicao", comando });
  const editable = p.coletar && ["rascunho", "programado", "em_coleta"].includes(r.estado);
  const pendencias = pendenciasColeta(detail);
  const pending = new Set(pendencias.flatMap((item) => (item.medicao_id ? [item.medicao_id] : [])))
    .size;
  return (
    <>
      <Section
        title="Visita e revisão"
        description={`Revisão V${r.numero} · versão de concorrência ${r.version}`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <State value={r.estado} />
          <div className="flex flex-wrap gap-2">
            {p.gerir && p.editar && (
              <ActionButton variant="ghost" onClick={() => onEdit({ tipo: "contexto" })}>
                <Pencil size={15} aria-hidden /> Editar contexto
              </ActionButton>
            )}
            {p.gerir && ["rascunho", "programado"].includes(r.estado) && (
              <ActionButton onClick={() => open("programar")}>
                {r.estado === "programado" ? "Reprogramar visita" : "Programar visita"}
              </ActionButton>
            )}
            {p.coletar && r.estado === "programado" && (
              <ActionButton onClick={() => open("iniciar_coleta")}>Iniciar coleta</ActionButton>
            )}
            {p.coletar && r.estado === "em_coleta" && (
              <ActionButton onClick={() => open("submeter")}>Enviar para revisão</ActionButton>
            )}
            {p.revisar && r.estado === "em_revisao" && (
              <>
                <ActionButton variant="ghost" onClick={() => open("devolver")}>
                  Devolver para coleta
                </ActionButton>
                <ActionButton onClick={() => open("aprovar")}>Aprovar revisão</ActionButton>
              </>
            )}
            {p.gerir &&
              r.id === l.revisao_atual_id &&
              ["aprovado", "cancelado"].includes(r.estado) && (
                <ActionButton onClick={() => open("nova_revisao")}>Adicionar revisão</ActionButton>
              )}
          </div>
        </div>
        <button
          type="button"
          className="mb-2 min-h-11 text-left text-sm text-primary underline underline-offset-4"
          aria-expanded={contextOpen}
          onClick={() => setContextOpen((open) => !open)}
        >
          {contextOpen ? "Recolher contexto da visita" : "Mostrar contexto da visita"}
        </button>
        <div hidden={!contextOpen}>
          <p className="mb-4 whitespace-pre-wrap text-sm">{l.finalidade}</p>
          <dl className="nx-lev-context">
            <div>
              <dt>Cliente e unidade</dt>
              <dd>
                <Link
                  to="/clientes"
                  search={{ cliente: l.cliente_id }}
                  className="text-primary underline underline-offset-4"
                >
                  {l.cliente_nome || "Abrir cliente"}
                </Link>
                <br />
                {l.unidade_nome || "Unidade vinculada"}
              </dd>
            </div>
            <div>
              <dt>Responsável pela coleta</dt>
              <dd>{l.responsavel_nome || "Pessoa vinculada"}</dd>
            </div>
            <div>
              <dt>Visita prevista</dt>
              <dd>
                {r.inicio_previsto
                  ? `${date(r.inicio_previsto)} — ${date(r.fim_previsto)}`
                  : "Ainda não programada"}
              </dd>
            </div>
            <div>
              <dt>Pontos e medidas</dt>
              <dd>
                {detail.pontos.length} pontos · {detail.medicoes.length} medidas
              </dd>
            </div>
            <div>
              <dt>Pendências básicas das medidas</dt>
              <dd>
                {pending
                  ? `${pending} com informações incompletas`
                  : detail.medicoes.length
                    ? "Campos básicos preenchidos; revisão necessária"
                    : "Nenhuma medida registrada"}
              </dd>
            </div>
            <div>
              <dt>Revisão aberta</dt>
              <dd>
                <select
                  className="nx-lev-input"
                  aria-label="Selecionar revisão do levantamento"
                  value={r.id}
                  onChange={(e) => onRevision(e.target.value)}
                >
                  {(detail.revisoes ?? [r]).map((rev) => (
                    <option key={rev.id} value={rev.id}>
                      V{rev.numero} · {states[rev.estado]}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
          </dl>
        </div>
      </Section>
      <Tabs.Root defaultValue="coleta" className="space-y-4">
        <Tabs.List className="nx-lev-tabs" aria-label="Áreas do levantamento">
          <Tabs.Trigger value="coleta">Pontos e coleta</Tabs.Trigger>
          <Tabs.Trigger value="revisao">Revisão técnica</Tabs.Trigger>
          <Tabs.Trigger value="historico">Histórico e adoções</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="coleta" className="space-y-4">
          {pendencias.length > 0 && (
            <details className="rounded border border-warning p-3 text-sm">
              <summary className="min-h-11 cursor-pointer">
                {pendencias.length} verificações pendentes de coleta
              </summary>
              <ul className="mt-2 space-y-2">
                {pendencias.map((item, i) => (
                  <li key={i}>
                    {item.ponto_id ? (
                      <button
                        className="min-h-11 text-left text-warning underline underline-offset-4"
                        type="button"
                        onClick={() => onPoint(item.ponto_id!)}
                      >
                        {item.descricao}
                      </button>
                    ) : (
                      item.descricao
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Resumo para orientar a coleta. A submissão revalida todos os requisitos no banco.
              </p>
            </details>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Pontos e áreas</h2>
            {editable && (
              <ActionButton onClick={() => onEdit({ tipo: "ponto" })}>
                <Plus size={16} aria-hidden /> Adicionar ponto
              </ActionButton>
            )}
          </div>
          {!detail.pontos.length ? (
            <Section title="Coleta por ponto">
              <EmptyState
                title="Nenhum ponto registrado"
                hint={
                  editable
                    ? "Identifique uma área para registrar medidas e evidências no mesmo contexto."
                    : "A coleta ainda não possui pontos nesta revisão."
                }
                action={
                  editable ? (
                    <ActionButton onClick={() => onEdit({ tipo: "ponto" })}>
                      Adicionar primeiro ponto
                    </ActionButton>
                  ) : undefined
                }
              />
            </Section>
          ) : (
            <div className="nx-lev-collection">
              <nav
                ref={pointList}
                tabIndex={-1}
                aria-label="Pontos do levantamento"
                className="nx-lev-points scroll-mt-20"
              >
                {detail.pontos.map((item) => (
                  <button
                    type="button"
                    className="nx-lev-point"
                    key={item.id}
                    aria-pressed={point?.id === item.id}
                    onClick={() => onPoint(item.id)}
                  >
                    <strong className="text-sm">
                      {item.codigo} · {item.nome}
                    </strong>
                    <small>
                      {quantidade(
                        detail.medicoes.filter((m) => m.ponto_id === item.id).length,
                        "medida",
                        "medidas",
                      )}{" "}
                      ·{" "}
                      {quantidade(
                        detail.arquivos.filter(
                          (a) => a.ponto_id === item.id && a.estado === "vinculado",
                        ).length,
                        "arquivo confirmado",
                        "arquivos confirmados",
                      )}
                    </small>
                  </button>
                ))}
              </nav>
              {point && (
                <div
                  ref={pointPanel}
                  tabIndex={-1}
                  role="region"
                  aria-label="Ponto selecionado"
                  className="min-w-0 scroll-mt-20 outline-none"
                >
                  <ActionButton
                    className="mb-3 md:hidden"
                    variant="ghost"
                    onClick={() => {
                      pointList.current?.scrollIntoView({ block: "start" });
                      pointList.current?.focus({ preventScroll: true });
                    }}
                  >
                    Voltar aos pontos
                  </ActionButton>
                  <Section
                    title={`${point.codigo} · ${point.nome}`}
                    description={
                      [point.area, point.localizacao, point.tipo_sistema]
                        .filter(Boolean)
                        .join(" · ") || "Localização complementar ainda não informada"
                    }
                  >
                    <div className="space-y-4">
                      {point.observacoes && (
                        <p className="whitespace-pre-wrap text-sm">{point.observacoes}</p>
                      )}
                      {editable && (
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            variant="ghost"
                            onClick={() => onEdit({ tipo: "ponto", ponto: point })}
                          >
                            Editar ponto
                          </ActionButton>
                          <ActionButton onClick={() => onEdit({ tipo: "medicao", ponto: point })}>
                            Adicionar medida
                          </ActionButton>
                        </div>
                      )}
                      {!measurements.length ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma medida neste ponto. Rascunho preservado; a submissão exige dados
                          suficientes.
                        </p>
                      ) : (
                        <ul className="nx-lev-measures" aria-label={`Medidas de ${point.nome}`}>
                          {measurements.map((m) => (
                            <li key={m.id} className="nx-lev-measure">
                              <div className="min-w-0 space-y-1">
                                <p className="text-sm font-medium">{m.chave}</p>
                                <p>
                                  <strong>
                                    {decimal(m.valor)}{" "}
                                    {m.valor !== null && (m.unidade || "— unidade pendente")}
                                  </strong>{" "}
                                  <span className="text-xs text-muted-foreground">
                                    ·{" "}
                                    {m.natureza === "estimativa" ? "Estimativa" : "Medida coletada"}
                                  </span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Origem:{" "}
                                  {
                                    {
                                      campo: "campo",
                                      documento: "documento",
                                      modelo_3d: "modelo 3D estimado",
                                    }[m.origem]
                                  }{" "}
                                  · Precisão:{" "}
                                  {m.precisao ? `${decimal(m.precisao)} ${m.unidade}` : "pendente"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {m.metodo || "Método ainda não registrado"} ·{" "}
                                  {date(m.coletado_em)}
                                </p>
                                {m.observacoes && (
                                  <p className="whitespace-pre-wrap text-sm">{m.observacoes}</p>
                                )}
                              </div>
                              {editable && (
                                <ActionButton
                                  variant="ghost"
                                  onClick={() =>
                                    onEdit({ tipo: "medicao", ponto: point, medicao: m })
                                  }
                                >
                                  Editar medida
                                </ActionButton>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="border-t border-border pt-4">
                        <p className="mb-3 text-xs text-muted-foreground">
                          {point.exige_foto
                            ? "Foto obrigatória para enviar à revisão."
                            : "Arquivos privados vinculados a este ponto e revisão."}
                        </p>
                        <LevantamentoFiles
                          key={`${r.id}:${point.id}`}
                          org={org}
                          levantamentoId={l.id}
                          revisaoId={r.id}
                          pontoId={point.id}
                          readOnly={!editable}
                        />
                      </div>
                      {editable && !measurements.length && (
                        <ActionButton
                          variant="danger"
                          onClick={() =>
                            onEdit({ tipo: "transicao", comando: "excluir_ponto", ponto: point })
                          }
                        >
                          Excluir ponto do rascunho
                        </ActionButton>
                      )}
                    </div>
                  </Section>
                </div>
              )}
            </div>
          )}
        </Tabs.Content>
        <Tabs.Content value="revisao" className="space-y-4">
          <Section
            title="Critérios da coleta"
            description="Parâmetros declarados e versionados; não são validação normativa automática."
          >
            {p.gerir && p.revisar && (
              <div className="mb-4">
                <ActionButton variant="ghost" onClick={onModel}>
                  {detail.modelo ? "Publicar nova versão do modelo" : "Criar modelo de coleta"}
                </ActionButton>
              </div>
            )}
            {detail.modelo ? (
              <div className="space-y-3 text-sm">
                <p>
                  {detail.modelo.nome || "Modelo de coleta"} · versão {detail.modelo.numero}
                </p>
                <p className="whitespace-pre-wrap">Fonte: {detail.modelo.fonte}</p>
                <ul className="list-inside list-disc">
                  {detail.modelo.requisitos.map((item) => (
                    <li key={item.chave}>
                      {item.chave} · {item.grandeza} · {item.unidade}
                      {item.obrigatoria ? " · obrigatória" : ""}
                      {item.exige_foto ? " · foto exigida" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Coleta livre, sem modelo específico selecionado. O servidor exige identificação,
                medidas, unidades, método, data e rastreabilidade antes da revisão; nenhum limite
                normativo será inferido.
              </p>
            )}
          </Section>
          <Section title="Avaliações e pendências">
            <Avaliacoes detail={detail} />
          </Section>
          {r.estado === "aprovado" && (
            <Section title="Revisão preservada">
              <div className="space-y-2 text-sm">
                <p>
                  Aprovada em {date(r.aprovado_em)}. Alterações posteriores exigem nova revisão.
                </p>
                <p className="break-all font-mono text-xs">
                  SHA-256: {r.snapshot_sha256 || "Não disponível"}
                </p>
                <p className="text-xs text-muted-foreground">
                  O hash identifica o snapshot; não substitui assinatura digital certificada, laudo
                  ou responsabilidade técnica.
                </p>
              </div>
            </Section>
          )}
          <Section title="Arquivos gerais da revisão">
            <LevantamentoFiles
              key={`${r.id}:geral`}
              org={org}
              levantamentoId={l.id}
              revisaoId={r.id}
              pontoId={null}
              readOnly={!editable}
            />
          </Section>
          {p.gerir && !["aprovado", "cancelado"].includes(r.estado) && (
            <ActionButton variant="danger" onClick={() => open("cancelar")}>
              Cancelar revisão
            </ActionButton>
          )}
        </Tabs.Content>
        <Tabs.Content value="historico" className="space-y-4">
          {p.adotar && r.estado === "aprovado" && (
            <AdocaoLevantamento key={r.id} org={org} detail={detail} />
          )}
          <Section title="Adoções no dimensionamento">
            {detail.adocoes.length ? (
              <ul className="nx-lev-timeline">
                {detail.adocoes.map((a) => (
                  <li key={a.id}>
                    <p>
                      {a.campo}: {decimal(a.valor_anterior)} → {decimal(a.valor_adotado)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {date(a.created_at)} · revisão fonte V{r.numero}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma adoção registrada nesta revisão. Aprovar não altera proposta
                automaticamente.
              </p>
            )}
          </Section>
          <Section title="Histórico da revisão">
            <Avaliacoes detail={detail} />
          </Section>
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
function Avaliacoes({ detail }: { detail: LevantamentoDetalhe }) {
  return detail.avaliacoes.length ? (
    <ol className="nx-lev-timeline">
      {detail.avaliacoes.map((a) => (
        <li key={a.id}>
          <p className="font-medium">
            {a.decisao.replaceAll("_", " ")} · {date(a.created_at)}
          </p>
          {a.comentario && <p className="whitespace-pre-wrap">{a.comentario}</p>}
          {a.pendencias.length > 0 && (
            <ul className="mt-2 list-inside list-disc">
              {a.pendencias.map((item, i) => (
                <li key={i}>{item.descricao}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-sm text-muted-foreground">Ainda não há avaliação técnica nesta revisão.</p>
  );
}
