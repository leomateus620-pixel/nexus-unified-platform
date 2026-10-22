import { useEffect, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { useOperationalAccess } from "@/features/operacao/access";
import { Pagination, useCommandKey } from "@/features/operacao/components";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { executarEstudo, obterEstudo } from "./estudos.functions";
import { invalidarEstudos, useEstudosList, useEstudoDetail, useMetodosEstudo } from "./queries";
import { EstudoEditor, type StudyEditor, type StudyCommand } from "./EstudoForms";
import {
  estadosEstudo as states,
  tiposEstudo as studyTypes,
  prioridadesMedida,
  acessoEstudoNegado,
} from "./domain";
import type { EstadoEstudo, EstudoDetalhe, EstudoPerigo, EstudoMedida } from "./types";
import type { EstudoMetodo } from "./types";
import { MetodoEstudoForm } from "./MetodoEstudoForm";
import { AcaoEstudoForm } from "./AcaoEstudoForm";
import { EstudoFiles } from "./EstudoFiles";
import "./estudos.css";

export type EstudosSearch = {
  estudo: string;
  revisao: string;
  perigo: string;
  busca: string;
  estado: EstadoEstudo | "";
  pagina: number;
};
const instant = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "Não informado";
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`))
    : "Sem prazo definido";
function State({ value }: { value: EstadoEstudo }) {
  return (
    <span className="nx-est-status" data-status={value}>
      {states[value]}
    </span>
  );
}
export function EstudosWorkspace({
  search,
  onSearch,
}: {
  search: EstudosSearch;
  onSearch: (patch: Partial<EstudosSearch>) => void;
}) {
  const org = useOrg();
  const access = useOperationalAccess(org.data?.orgId || "", org.data?.userId || "");
  if (access.isPending) return <LoadingState label="Conferindo acesso à engenharia…" />;
  if (access.isError || !org.data)
    return (
      <ErrorState
        error={access.error || new Error("Sessão indisponível.")}
        onRetry={() => access.refetch()}
      />
    );
  return (
    <EstudosContent
      key={`${org.data.orgId}:${org.data.userId}:${org.data.roles.join(",")}:${JSON.stringify(access.data)}`}
      org={org.data.orgId}
      search={search}
      onSearch={onSearch}
    />
  );
}
function EstudosContent({
  org,
  search,
  onSearch,
}: {
  org: string;
  search: EstudosSearch;
  onSearch: (patch: Partial<EstudosSearch>) => void;
}) {
  const client = useQueryClient(),
    run = useServerFn(executarEstudo),
    read = useServerFn(obterEstudo);
  const list = useEstudosList(org, {
    busca: useDebouncedValue(search.busca),
    estado: search.estado || null,
    pagina: search.pagina,
    limite: 25,
  });
  const detail = useEstudoDetail(org, search.estudo || null, search.revisao || null);
  const [editor, setEditor] = useState<StudyEditor | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [notice, setNotice] = useState("");
  const [showMethods, setShowMethods] = useState(false);
  const [methodEditor, setMethodEditor] = useState<EstudoMetodo | "novo" | null>(null);
  const accessDenied = !!search.estudo && detail.isError && acessoEstudoNegado(detail.error);
  const detailError = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!accessDenied) return;
    setEditor(null);
    setMethodEditor(null);
    setNotice("");
    requestAnimationFrame(() => detailError.current?.focus());
  }, [accessDenied]);
  const guard = useRef(false),
    keyFor = useCommandKey();
  const open = (value: StudyEditor) => {
    setError(null);
    setEditor(value);
  };
  async function execute(command: StudyCommand) {
    if (guard.current) return false;
    guard.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = { ...command, organization_id: org };
      const saved = await run({ data: { ...data, chave: keyFor(data) } });
      client.setQueryData(["estudos", org, "ficha", saved.estudo.id, saved.revisao.id], saved);
      await invalidarEstudos(client, org);
      onSearch({
        estudo: saved.estudo.id,
        revisao: saved.revisao.id,
        ...(command.comando === "nova_revisao" ? { perigo: "" } : {}),
      });
      setNotice("Operação confirmada no servidor.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Não foi possível confirmar a operação."));
      return false;
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="nexus-operational nx-est-workspace space-y-5">
      <PageHeader
        eyebrow="Engenharia · Estudos técnicos"
        title={
          search.estudo
            ? (!detail.isError && detail.data?.estudo.codigo) || "Estudo técnico"
            : "Engenharia"
        }
        description={
          search.estudo
            ? "Elaboração, fontes e decisão profissional por revisão."
            : "Estudos técnicos e critérios versionados, conectados à coleta e ao acervo."
        }
        actions={
          !search.estudo && list.data?.permissoes.criar ? (
            <ActionButton onClick={() => open({ comando: "criar" })}>
              <Plus size={16} aria-hidden />
              Criar estudo técnico
            </ActionButton>
          ) : undefined
        }
      />
      {notice && (
        <p role="status" className="rounded border border-border bg-card px-4 py-3 text-sm">
          {notice}
        </p>
      )}
      {!search.estudo ? (
        <>
          <div className="flex flex-wrap items-start gap-3">
            <details className="nx-est-details">
              <summary>Dimensionamentos e regras</summary>
              <nav className="nx-est-tools mt-2" aria-label="Ferramentas de engenharia preservadas">
                <Link to="/engenharia/regras-dimensionamento">Regras de dimensionamento →</Link>
                <Link to="/engenharia/dimensionamentos">Dimensionamentos das propostas →</Link>
              </nav>
            </details>
            <ActionButton
              variant="ghost"
              onClick={() => setShowMethods((value) => !value)}
              aria-expanded={showMethods}
            >
              {showMethods ? "Recolher métodos" : "Métodos de estudo"}
            </ActionButton>
          </div>
          {showMethods && <MetodosPanel org={org} onEdit={setMethodEditor} />}
          <Section
            title="Estudos técnicos"
            description="Aprovação técnica e acervo editorial possuem decisões distintas."
          >
            <div className="nx-est-filters">
              <label className="grid gap-1 text-sm">
                Buscar estudo
                <input
                  className="nx-est-input"
                  type="search"
                  maxLength={120}
                  placeholder="Código, título ou unidade"
                  value={search.busca}
                  onChange={(e) => onSearch({ busca: e.target.value, pagina: 0 })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Situação
                <select
                  className="nx-est-input"
                  value={search.estado}
                  onChange={(e) =>
                    onSearch({ estado: e.target.value as EstudosSearch["estado"], pagina: 0 })
                  }
                >
                  <option value="">Todas</option>
                  {Object.entries(states).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
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
              <LoadingState label="Consultando estudos autorizados…" />
            ) : list.isError ? (
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            ) : (
              <>
                {!list.data.rows.length ? (
                  <EmptyState
                    title={
                      search.busca || search.estado
                        ? "Nenhum estudo neste recorte"
                        : "Nenhum estudo técnico cadastrado"
                    }
                    hint={
                      search.busca || search.estado
                        ? "Ajuste a busca e os filtros."
                        : "Crie o estudo para registrar escopo, método, evidências e responsáveis."
                    }
                    action={
                      list.data.permissoes.criar && !search.busca && !search.estado ? (
                        <ActionButton onClick={() => open({ comando: "criar" })}>
                          Criar estudo técnico
                        </ActionButton>
                      ) : undefined
                    }
                  />
                ) : (
                  <ul className="nx-est-list" aria-label="Estudos técnicos encontrados">
                    {list.data.rows.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setNotice("");
                            onSearch({ estudo: row.id, revisao: "", perigo: "" });
                          }}
                        >
                          <span>
                            <strong>
                              {row.codigo} · {row.titulo}
                            </strong>
                            <small>
                              {row.cliente_nome} · {row.unidade_nome}
                            </small>
                          </span>
                          <span>
                            {studyTypes[row.tipo]}
                            <small>{row.responsavel_nome || "Responsável não informado"}</small>
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
        </>
      ) : (
        <>
          <ActionButton
            variant="ghost"
            onClick={() => {
              setNotice("");
              onSearch({ estudo: "", revisao: "", perigo: "" });
            }}
          >
            <ArrowLeft size={16} aria-hidden />
            Voltar aos estudos
          </ActionButton>
          {detail.isPending ? (
            <LoadingState label="Abrindo revisão e fontes autorizadas…" />
          ) : detail.isError ? (
            <div ref={detailError} tabIndex={-1}>
              <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
            </div>
          ) : (
            <EstudoFicha
              detail={detail.data}
              org={org}
              perigoId={search.perigo}
              onPerigo={(perigo) => onSearch({ perigo })}
              onRevisao={(revisao) => onSearch({ revisao, perigo: "" })}
              onEdit={open}
              onMethod={setMethodEditor}
            />
          )}
        </>
      )}
      {editor && !accessDenied && (
        <EstudoEditor
          key={`${editor.comando}:${editor.perigo?.id || ""}:${editor.medida?.id || ""}:${editor.fonteId || ""}`}
          org={org}
          editor={editor}
          detail={detail.data}
          busy={busy}
          error={error}
          execute={execute}
          onClose={() => setEditor(null)}
          onCompare={async () =>
            search.estudo
              ? read({
                  data: {
                    organization_id: org,
                    estudo_id: search.estudo,
                    revisao_id: search.revisao || null,
                  },
                })
              : undefined
          }
        />
      )}
      {methodEditor && !accessDenied && (
        <MetodoEstudoForm
          org={org}
          metodo={methodEditor === "novo" ? undefined : methodEditor}
          onClose={() => setMethodEditor(null)}
          onSaved={() => {
            setMethodEditor(null);
            setNotice(
              "Método publicado no servidor. Revisões existentes preservam a versão adotada.",
            );
          }}
        />
      )}
    </div>
  );
}
function EstudoFicha({
  detail,
  org,
  perigoId,
  onPerigo,
  onRevisao,
  onEdit,
  onMethod,
}: {
  detail: EstudoDetalhe;
  org: string;
  perigoId: string;
  onPerigo: (id: string) => void;
  onRevisao: (id: string) => void;
  onEdit: (editor: StudyEditor) => void;
  onMethod: (metodo: EstudoMetodo) => void;
}) {
  const { estudo: l, revisao: r, permissoes: p } = detail;
  const selected = detail.perigos.find((item) => item.id === perigoId) || detail.perigos[0];
  const target = useRef<HTMLElement>(null);
  const [actionEditor, setActionEditor] = useState<EstudoMedida | null>(null);
  const [contextOpen, setContextOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width:768px)").matches,
  );
  useEffect(() => {
    if (perigoId && matchMedia("(max-width: 767px)").matches) {
      target.current?.scrollIntoView({ block: "start" });
      target.current?.focus({ preventScroll: true });
    }
  }, [perigoId]);
  const text = (title: string, value: string) => (
    <div className="nx-est-copy">
      <h3>{title}</h3>
      <p className="whitespace-pre-wrap">{value || "Ainda não informado nesta revisão."}</p>
    </div>
  );
  return (
    <>
      <Section
        title={l.titulo}
        description={`${l.cliente_nome || "Cliente"} · ${l.unidade_nome || "Unidade"}`}
        actions={
          p.gerir && r.estado === "elaboracao" ? (
            <ActionButton variant="ghost" onClick={() => onEdit({ comando: "contexto" })}>
              <Pencil size={16} aria-hidden />
              Editar identificação
            </ActionButton>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <State value={r.estado} />
          <span className="text-sm">
            Revisão V{r.numero} · versão de concorrência {r.version}
          </span>
          {l.visibilidade === "restrito" && <span className="text-sm">Acesso restrito</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {p.submeter && (
            <ActionButton onClick={() => onEdit({ comando: "submeter" })}>
              Enviar para revisão
            </ActionButton>
          )}
          {p.aprovar && (
            <ActionButton onClick={() => onEdit({ comando: "aprovar" })}>
              Aprovar revisão técnica
            </ActionButton>
          )}
          {p.revisar && r.estado === "em_revisao" && (
            <ActionButton variant="ghost" onClick={() => onEdit({ comando: "devolver" })}>
              Devolver para elaboração
            </ActionButton>
          )}
          {p.nova_revisao && (
            <ActionButton onClick={() => onEdit({ comando: "nova_revisao" })}>
              Adicionar revisão
            </ActionButton>
          )}
          {p.gerir && ["elaboracao", "em_revisao"].includes(r.estado) && (
            <ActionButton variant="ghost" onClick={() => onEdit({ comando: "cancelar" })}>
              Cancelar revisão
            </ActionButton>
          )}
        </div>
        <button
          type="button"
          className="mt-4 min-h-11 text-sm text-primary underline"
          aria-expanded={contextOpen}
          onClick={() => setContextOpen((value) => !value)}
        >
          {contextOpen ? "Recolher responsáveis e método" : "Mostrar responsáveis e método"}
        </button>
        {contextOpen && (
          <dl className="nx-est-context mt-2">
            <div>
              <dt>Tipo</dt>
              <dd>{studyTypes[l.tipo]}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>{l.responsavel_nome || "Não informado"}</dd>
            </div>
            <div>
              <dt>Método</dt>
              <dd>
                {detail.metodo
                  ? `${detail.metodo.nome} · V${detail.metodo.numero}`
                  : "Aguardando definição"}
              </dd>
            </div>
          </dl>
        )}
        {r.snapshot_sha256 && (
          <p className="mt-4 break-all font-mono text-xs text-muted-foreground">
            Snapshot aprovado · SHA-256 {r.snapshot_sha256}
          </p>
        )}
      </Section>
      {!!detail.bloqueios.length && (
        <Section title="Pendências desta revisão">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {detail.bloqueios.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {p.editar && (
            <ActionButton variant="ghost" onClick={() => onEdit({ comando: "salvar_revisao" })}>
              Conferir conteúdo e responsáveis
            </ActionButton>
          )}
        </Section>
      )}
      <Tabs.Root defaultValue="conteudo" className="space-y-4">
        <Tabs.List className="nx-est-tabs" aria-label="Áreas do estudo técnico">
          <Tabs.Trigger value="conteudo">Conteúdo e método</Tabs.Trigger>
          <Tabs.Trigger value="perigos">Perigos e medidas</Tabs.Trigger>
          <Tabs.Trigger value="fontes">Fontes e evidências</Tabs.Trigger>
          <Tabs.Trigger value="historico">Revisões e decisões</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="conteudo" className="space-y-4">
          <Section
            title="Conteúdo da revisão"
            actions={
              p.editar ? (
                <ActionButton onClick={() => onEdit({ comando: "salvar_revisao" })}>
                  Editar conteúdo
                </ActionButton>
              ) : undefined
            }
          >
            <div className="grid gap-5">
              {text("Escopo", r.escopo)}
              {text("Premissas e limitações", r.premissas)}
              {text("Análise técnica", r.analise)}
              {text("Conclusão profissional", r.conclusao)}
              {text("Responsabilidade técnica aplicável", r.responsabilidade_tecnica)}
              {r.art_referencia && text("Referência de ART ou registro", r.art_referencia)}
            </div>
          </Section>
          <Section
            title="Método e fontes bibliográficas"
            actions={
              p.publicar_metodo && detail.metodo ? (
                <ActionButton variant="ghost" onClick={() => onMethod(detail.metodo!)}>
                  Publicar nova versão do método
                </ActionButton>
              ) : undefined
            }
          >
            {detail.metodo ? (
              <div className="space-y-4">
                <p className="text-sm">
                  {detail.metodo.nome} · versão {detail.metodo.numero} · registro declarado:{" "}
                  {detail.metodo.registro_profissional}
                </p>
                <p className="whitespace-pre-wrap text-sm">{detail.metodo.instrucoes}</p>
                <ul className="space-y-3">
                  {detail.metodo.fontes.map((fonte, i) => (
                    <li key={i} className="text-sm">
                      <strong>{fonte.titulo}</strong>
                      <p>
                        {fonte.edicao} · {fonte.emissor}
                      </p>
                      {fonte.url && (
                        <a
                          className="break-all text-primary underline"
                          href={fonte.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Consultar referência
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyState
                title="Método ainda não definido"
                hint="A elaboração pode começar; a submissão depende de um método publicado por profissional autorizado."
              />
            )}
          </Section>
        </Tabs.Content>
        <Tabs.Content value="perigos">
          <div className="nx-est-risk-layout">
            <Section
              title="Perigos identificados"
              actions={
                p.editar ? (
                  <ActionButton onClick={() => onEdit({ comando: "salvar_perigo" })}>
                    <Plus size={16} aria-hidden />
                    Adicionar perigo
                  </ActionButton>
                ) : undefined
              }
            >
              {!detail.perigos.length ? (
                <EmptyState
                  title="Nenhum perigo registrado"
                  hint="Descreva os perigos e a avaliação quando fizerem parte do método e do escopo."
                />
              ) : (
                <nav className="grid gap-2" aria-label="Selecionar perigo">
                  {detail.perigos.map((item) => (
                    <button
                      type="button"
                      className="nx-est-risk-link"
                      aria-current={selected?.id === item.id ? "true" : undefined}
                      key={item.id}
                      onClick={() => onPerigo(item.id)}
                    >
                      <strong>{item.codigo}</strong>
                      <span>{item.descricao || "Descrição pendente"}</span>
                      {item.critico && <small>Condição crítica</small>}
                    </button>
                  ))}
                </nav>
              )}
            </Section>
            <section
              ref={target}
              tabIndex={-1}
              aria-label="Detalhes e medidas do perigo"
              className="min-w-0"
            >
              {selected ? (
                <PerigoDetail
                  item={selected}
                  medidas={detail.medidas.filter((m) => m.perigo_id === selected.id)}
                  detail={detail}
                  onEdit={onEdit}
                  onAction={setActionEditor}
                  org={org}
                  onBack={() => {
                    document
                      .querySelector<HTMLElement>('[aria-label="Selecionar perigo"]')
                      ?.scrollIntoView({ block: "start" });
                  }}
                />
              ) : (
                <Section title="Avaliação e medidas">
                  <p className="text-sm text-muted-foreground">
                    Selecione ou cadastre um perigo para registrar a avaliação e as medidas
                    propostas.
                  </p>
                </Section>
              )}
            </section>
          </div>
        </Tabs.Content>
        <Tabs.Content value="fontes" className="space-y-4">
          <Section
            title="Fontes operacionais"
            actions={
              p.editar ? (
                <ActionButton onClick={() => onEdit({ comando: "vincular_fonte" })}>
                  Vincular fonte
                </ActionButton>
              ) : undefined
            }
          >
            {!detail.fontes.length ? (
              <EmptyState
                title="Nenhuma fonte operacional vinculada"
                hint="Vincule uma revisão aprovada de levantamento, versão congelada do acervo ou documento emitido autorizado."
              />
            ) : (
              <ul className="space-y-4">
                {detail.fontes.map((fonte) => (
                  <li key={fonte.id} className="nx-est-copy">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <strong className="text-sm">{fonte.titulo}</strong>
                        <p className="text-xs text-muted-foreground">
                          {fonte.tipo} {fonte.numero ? `· V${fonte.numero}` : ""} ·{" "}
                          {fonte.ativa
                            ? "Em uso nesta revisão"
                            : "Desativada; histórico preservado"}
                        </p>
                      </div>
                      {p.editar && fonte.ativa && (
                        <ActionButton
                          variant="ghost"
                          onClick={() => onEdit({ comando: "desativar_fonte", fonteId: fonte.id })}
                        >
                          Desativar vínculo
                        </ActionButton>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{fonte.justificativa}</p>
                    {fonte.levantamento_id && fonte.levantamento_revisao_id && (
                      <Link
                        to="/levantamentos"
                        search={{
                          levantamento: fonte.levantamento_id,
                          revisao: fonte.levantamento_revisao_id,
                        }}
                        className="mt-2 inline-flex min-h-11 items-center text-sm text-primary underline"
                      >
                        Abrir levantamento de origem · V{fonte.numero}
                      </Link>
                    )}
                    {fonte.pe_projeto_id && (
                      <Link
                        to="/projetos-engenharia"
                        search={{ projeto: fonte.pe_projeto_id }}
                        className="mt-2 inline-flex min-h-11 items-center text-sm text-primary underline"
                      >
                        Abrir acervo do projeto · referência V{fonte.numero}
                      </Link>
                    )}
                    {fonte.sha256 && (
                      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                        SHA-256 {fonte.sha256}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Arquivos da revisão">
            <EstudoFiles
              key={`${r.id}:geral`}
              org={org}
              estudoId={l.id}
              revisaoId={r.id}
              perigoId={null}
              readOnly={!p.editar}
            />
          </Section>
          <Section title="Entrega documental">
            <p className="text-sm">
              {detail.entrega_documental.estado === "aguardando_emissao"
                ? "Revisão aprovada · emissão documental pendente"
                : "Revisão ainda não aprovada para entrega"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{detail.entrega_documental.motivo}</p>
          </Section>
        </Tabs.Content>
        <Tabs.Content value="historico" className="space-y-4">
          <Section title="Revisões">
            <ul className="space-y-3">
              {detail.revisoes.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"
                >
                  <div>
                    <strong className="text-sm">V{item.numero}</strong>
                    <span className="ml-3">
                      <State value={item.estado} />
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {instant(item.aprovado_em || item.created_at)}
                    </p>
                  </div>
                  <ActionButton
                    variant="ghost"
                    disabled={item.id === r.id}
                    onClick={() => onRevisao(item.id)}
                  >
                    {item.id === r.id ? "Revisão aberta" : "Abrir revisão"}
                  </ActionButton>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Submissões e decisões">
            <ol className="space-y-4">
              {detail.submissoes.map((item) => (
                <li key={item.id} className="nx-est-copy">
                  <h3>
                    Submissão {item.numero} · {instant(item.created_at)}
                  </h3>
                  <p className="break-all font-mono text-xs">SHA-256 {item.sha256}</p>
                  <details className="nx-est-details mt-3">
                    <summary>Conferir conteúdo submetido</summary>
                    <pre className="nx-est-snapshot">{JSON.stringify(item.snapshot, null, 2)}</pre>
                  </details>
                  {detail.decisoes
                    .filter((d) => d.submissao_id === item.id)
                    .map((d) => (
                      <p key={d.id} className="mt-3 whitespace-pre-wrap text-sm">
                        <strong>
                          {d.decisao === "aprovar"
                            ? "Aprovado"
                            : d.decisao === "devolver"
                              ? "Devolvido"
                              : "Cancelado"}
                        </strong>{" "}
                        · {instant(d.created_at)} · registro{" "}
                        {d.registro_profissional || "Não aplicável"}
                        <br />
                        {d.motivo}
                      </p>
                    ))}
                </li>
              ))}
            </ol>
            {!detail.submissoes.length && (
              <EmptyState
                title="Ainda não submetido"
                hint="O histórico aparecerá após o envio para revisão."
              />
            )}
          </Section>
          <Section title="Trilha de alterações">
            <ol className="space-y-2 text-sm">
              {detail.historico.map((item) => (
                <li key={item.id}>
                  {instant(item.created_at)} · {item.comando}
                  {item.motivo ? ` · ${item.motivo}` : ""}
                </li>
              ))}
            </ol>
          </Section>
        </Tabs.Content>
      </Tabs.Root>
      {actionEditor && (
        <AcaoEstudoForm
          org={org}
          medida={actionEditor}
          onClose={() => setActionEditor(null)}
          onSaved={() => setActionEditor(null)}
        />
      )}
    </>
  );
}
function MetodosPanel({
  org,
  onEdit,
}: {
  org: string;
  onEdit: (metodo: EstudoMetodo | "novo") => void;
}) {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const query = useMetodosEstudo(org, useDebouncedValue(busca), pagina);
  return (
    <Section
      title="Métodos de estudo"
      description="Critérios e fontes publicados por profissional autorizado, sem limites normativos predefinidos."
      actions={
        query.data?.permissoes.publicar_metodo ? (
          <ActionButton onClick={() => onEdit("novo")}>Publicar método de estudo</ActionButton>
        ) : undefined
      }
    >
      <label className="mb-4 grid gap-1 text-sm">
        Buscar método
        <input
          className="nx-est-input"
          type="search"
          value={busca}
          maxLength={120}
          onChange={(event) => {
            setBusca(event.target.value);
            setPagina(0);
          }}
        />
      </label>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          {!query.data.rows.length ? (
            <EmptyState
              title="Nenhum método neste recorte"
              hint="Um profissional autorizado pode publicar os critérios, suas fontes e requisitos aplicáveis."
            />
          ) : (
            <ul className="space-y-4">
              {query.data.rows.map((method) => (
                <li className="nx-est-copy" key={method.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <strong className="text-sm">
                        {method.nome} · V{method.numero}
                      </strong>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {studyTypes[method.tipo]} · registro declarado{" "}
                        {method.registro_profissional}
                      </p>
                    </div>
                    {query.data.permissoes.publicar_metodo && (
                      <ActionButton variant="ghost" onClick={() => onEdit(method)}>
                        Publicar nova versão
                      </ActionButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination page={pagina} total={query.data.total} onChange={setPagina} />
        </>
      )}
    </Section>
  );
}

function PerigoDetail({
  item,
  medidas,
  detail,
  onEdit,
  onBack,
  onAction,
  org,
}: {
  item: EstudoPerigo;
  medidas: EstudoMedida[];
  detail: EstudoDetalhe;
  onEdit: (e: StudyEditor) => void;
  onBack: () => void;
  onAction: (medida: EstudoMedida) => void;
  org: string;
}) {
  const p = detail.permissoes;
  return (
    <Section
      title={`${item.codigo} · Avaliação`}
      actions={
        p.editar ? (
          <ActionButton
            variant="ghost"
            onClick={() => onEdit({ comando: "salvar_perigo", perigo: item })}
          >
            Editar perigo
          </ActionButton>
        ) : undefined
      }
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-4 min-h-11 text-sm text-primary underline md:hidden"
      >
        Voltar à lista de perigos
      </button>
      <dl className="nx-est-assessment">
        <div>
          <dt>Descrição</dt>
          <dd>{item.descricao || "Pendente"}</dd>
        </div>
        <div>
          <dt>Local ou atividade</dt>
          <dd>{item.local || "Pendente"}</dd>
        </div>
        <div>
          <dt>Exposição</dt>
          <dd>{item.exposicao || "Pendente"}</dd>
        </div>
        <div>
          <dt>Avaliação pelo método</dt>
          <dd>{item.avaliacao || "Pendente"}</dd>
        </div>
      </dl>
      {item.critico && (
        <p className="my-3 rounded border border-destructive p-3 text-sm">
          Condição crítica identificada. As medidas e a liberação devem ser avaliadas pelo
          responsável profissional.
        </p>
      )}
      <div className="my-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Medidas propostas</h3>
        {p.editar && (
          <ActionButton onClick={() => onEdit({ comando: "salvar_medida", perigo: item })}>
            Adicionar medida
          </ActionButton>
        )}
      </div>
      {!medidas.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma medida registrada para este perigo.</p>
      ) : (
        <ul className="space-y-4">
          {medidas.map((m) => (
            <li key={m.id} className="nx-est-measure">
              <strong className="text-sm">{m.descricao || "Descrição pendente"}</strong>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {m.fundamento || "Fundamento pendente"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Prioridade {prioridadesMedida[m.prioridade]} · {date(m.prazo)}
                {m.exige_acao ? " · Ação obrigatória" : ""}
              </p>
              {m.acao_id && (
                <p className="mt-2 text-sm">
                  Ação vinculada:{" "}
                  {detail.acoes.find((a) => a.acao_id === m.acao_id)?.titulo || "Ação operacional"}
                  <Link
                    to="/seguranca"
                    search={{ acao: m.acao_id }}
                    className="ml-2 inline-flex min-h-11 items-center text-primary underline"
                  >
                    Abrir ação
                  </Link>
                </p>
              )}
              {p.editar && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton
                    variant="ghost"
                    onClick={() => onEdit({ comando: "salvar_medida", perigo: item, medida: m })}
                  >
                    Editar medida
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    onClick={() => onEdit({ comando: "excluir_medida", medida: m })}
                  >
                    Excluir do rascunho
                  </ActionButton>
                </div>
              )}
              {!m.acao_id && p.vincular_acao && (
                <div className="mt-3">
                  <ActionButton onClick={() => onAction(m)}>
                    Liberar ou vincular ação operacional
                  </ActionButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {p.editar && (
        <div className="mt-5">
          <ActionButton
            variant="ghost"
            onClick={() => onEdit({ comando: "excluir_perigo", perigo: item })}
          >
            Excluir perigo do rascunho
          </ActionButton>
        </div>
      )}
      <div className="mt-5">
        <EstudoFiles
          key={`${detail.revisao.id}:${item.id}`}
          org={org}
          estudoId={detail.estudo.id}
          revisaoId={detail.revisao.id}
          perigoId={item.id}
          readOnly={!p.editar}
        />
      </div>
    </Section>
  );
}
