import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  Folder,
  History,
  LayoutDashboard,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { useCommandKey } from "@/features/operacao/components";
import { nrConsultar, nrExecutar } from "./nr.functions";
import type { Norma, NrContexto, NrJson, NrRecord, NrRecurso } from "./domain";
import { NrEditor } from "./NrEditor";
import { resourceLabels } from "./ui-labels";
import { NrContentEditor } from "./NrContentEditor";
import { parseNative } from "./native-content";
import { NrFolderTree, NrFolderBreadcrumbs } from "./NrFolderTree";
import "./nr.css";
const NrFilesPanel = lazy(() =>
  import("./NrFilesPanel").then((module) => ({ default: module.NrFilesPanel })),
);
const NrStorageUsage = lazy(() =>
  import("./NrStorageUsage").then((module) => ({ default: module.NrStorageUsage })),
);
const NrImportInspection = lazy(() =>
  import("./NrImportInspection").then((module) => ({ default: module.NrImportInspection })),
);
const NrCalculations = lazy(() =>
  import("./NrCalculations").then((module) => ({ default: module.NrCalculations })),
);
const NrImportQueue = lazy(() =>
  import("./NrImportQueue").then((module) => ({ default: module.NrImportQueue })),
);
const NrFolderOrder = lazy(() =>
  import("./NrFolderOrder").then((module) => ({ default: module.NrFolderOrder })),
);
const NrDocumentImpacts = lazy(() =>
  import("./NrDocumentImpacts").then((module) => ({ default: module.NrDocumentImpacts })),
);
const NrDocumentActions = lazy(() =>
  import("./NrDocumentActions").then((module) => ({ default: module.NrDocumentActions })),
);
const NrConversionNotice = lazy(() =>
  import("./NrConversionNotice").then((module) => ({ default: module.NrConversionNotice })),
);
const NrTechnicalPublication = lazy(() =>
  import("./NrTechnicalPublication").then((module) => ({ default: module.NrTechnicalPublication })),
);
const NrRecordHistory = lazy(() =>
  import("./NrRecordHistory").then((module) => ({ default: module.NrRecordHistory })),
);
const NrAuditEventDialog = lazy(() =>
  import("./NrRecordHistory").then((module) => ({ default: module.NrAuditEventDialog })),
);
const PetHistorico = lazy(() =>
  import("@/features/pet/ExecucaoWorkspace").then((module) => ({
    default: module.PetHistoricoUnidade,
  })),
);
export type NrSection =
  NrRecurso | "visao-geral" | "clientes" | "biblioteca" | "historico" | "configuracoes" | "pets";
export type NrSearch = {
  cliente: string;
  unidade: string;
  busca: string;
  estado: string;
  pagina: number;
  pasta: string;
  lixeira: boolean;
  importLote: string;
  importItem: string;
  importResultado:
    | ""
    | "identificado"
    | "extraido"
    | "importado"
    | "ja_existente"
    | "duplicado_legitimo"
    | "conflito"
    | "indisponivel"
    | "erro"
    | "sem_correspondencia";
  importBusca: string;
  importPagina: number;
};
const labels: Record<NrSection, string> = {
  "visao-geral": "Visão geral",
  clientes: "Clientes e unidades",
  locais: "Locais / inventário",
  levantamentos: "Levantamentos",
  documentos: "Documentos",
  pastas: "Pastas",
  pendencias: "Pendências",
  biblioteca: "Biblioteca e modelos",
  modelos: "Biblioteca e modelos",
  historico: "Histórico",
  configuracoes: "Configurações",
  sistemas: "Avaliações e sistemas",
  pets: "PET Digital",
};
const tabs = [
  ["visao-geral", LayoutDashboard],
  ["locais", MapPin],
  ["levantamentos", ClipboardList],
  ["documentos", FileText],
  ["pastas", Folder],
  ["pendencias", AlertCircle],
  ["biblioteca", BookOpen],
  ["sistemas", Wrench],
  ["clientes", MapPin],
  ["historico", History],
  ["configuracoes", Settings],
] as const;
const hum = (value?: string | null) => (value ? value.replaceAll("_", " ") : "Não informado");
const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value))
    : "Não informado";
const dictionary = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function useTerm(value: string) {
  const [term, setTerm] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setTerm(value), 250);
    return () => clearTimeout(id);
  }, [value]);
  return term;
}
function Badge({ value }: { value: string }) {
  return (
    <span className="nr-badge">
      {["encerrada", "validado", "aprovado"].includes(value) ? (
        <CheckCircle2 size={13} aria-hidden />
      ) : (
        <Clock3 size={13} aria-hidden />
      )}
      {hum(value)}
    </span>
  );
}
const sectionResource = (section: NrSection): NrRecurso | null =>
  section === "biblioteca" || section === "configuracoes"
    ? "modelos"
    : [
          "locais",
          "pastas",
          "documentos",
          "pendencias",
          "modelos",
          "levantamentos",
          "sistemas",
        ].includes(section)
      ? (section as NrRecurso)
      : null;

export function NrWorkspace({
  norma,
  section,
  id,
  search,
  onSearch,
}: {
  norma: Norma;
  section: NrSection;
  id?: string | undefined;
  search: NrSearch;
  onSearch: (patch: Partial<NrSearch>) => void;
}) {
  const org = useOrg();
  if (!org.data)
    return org.isError ? (
      <ErrorState error={org.error} onRetry={() => org.refetch()} />
    ) : (
      <LoadingState />
    );
  return (
    <NrScope
      key={`${org.data.userId}:${org.data.orgId}:${norma}:${search.cliente}:${search.unidade}:${section}:${id ?? ""}`}
      org={org.data.orgId}
      user={org.data.userId}
      norma={norma}
      section={section}
      id={id}
      search={search}
      onSearch={onSearch}
    />
  );
}
function NrScope({
  org,
  user,
  norma,
  section,
  id,
  search,
  onSearch,
}: {
  org: string;
  user: string;
  norma: Norma;
  section: NrSection;
  id?: string | undefined;
  search: NrSearch;
  onSearch: (patch: Partial<NrSearch>) => void;
}) {
  const consult = useServerFn(nrConsultar),
    execute = useServerFn(nrExecutar),
    qc = useQueryClient(),
    keyFor = useCommandKey();
  const navigate = useNavigate();
  const base = norma === "NR33" ? "/nr-33" : "/nr-35";
  const title = norma === "NR33" ? "Espaços confinados" : "Trabalho em altura";
  const recurso = sectionResource(section);
  const navigationSearch = {
    ...search,
    busca: "",
    estado: "",
    pagina: 0,
    pasta: "",
    lixeira: false,
  };
  const [editor, setEditor] = useState<NrRecord | "novo" | null>(null),
    [notice, setNotice] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [action, setAction] = useState<string | null>(null),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [commandError, setCommandError] = useState<Error | null>(null);
  const guard = useRef(false);
  const context = useQuery({
    queryKey: ["nr", org, user, norma, "contexto"],
    queryFn: ({ signal }) =>
      consult({ data: { organization_id: org, norma, recurso: "contexto" }, signal }),
    retry: false,
    staleTime: 15_000,
  });
  const contexto = context.data as NrContexto | undefined;
  const term = useTerm(search.busca);
  const query = useQuery({
    queryKey: [
      "nr",
      org,
      user,
      norma,
      recurso,
      id,
      search.cliente,
      search.unidade,
      term,
      search.estado,
      search.pagina,
      search.pasta,
      search.lixeira,
    ],
    enabled: !!contexto && !!recurso,
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso: recurso!,
          operacao: id ? "detalhe" : "listar",
          id,
          cliente_id: search.cliente || undefined,
          unidade_id: search.unidade || undefined,
          busca: term,
          estado: search.estado,
          pagina: search.pagina,
          limite: 25,
          pasta_id: recurso === "pastas" ? search.pasta || null : search.pasta || undefined,
          lixeira: search.lixeira,
        },
        signal,
      }),
    retry: false,
  });
  const row =
    query.data && "registro" in query.data ? (query.data.registro as NrRecord) : undefined;
  const list =
    query.data && "rows" in query.data
      ? (query.data as { rows: NrRecord[]; total: number; pagina: number; limite: number })
      : undefined;
  useEffect(() => {
    if (list && list.total > 0 && search.pagina * list.limite >= list.total && !query.isFetching)
      onSearch({ pagina: Math.max(0, Math.ceil(list.total / list.limite) - 1) });
  }, [list, search.pagina, query.isFetching, onSearch]);
  const contextLabel = [
    contexto?.clientes.find((c) => c.id === search.cliente)?.nome,
    contexto?.unidades.find((u) => u.id === search.unidade)?.nome,
  ]
    .filter(Boolean)
    .join(" · ");
  const contextValid =
    !search.unidade ||
    contexto?.unidades.some(
      (u) => u.id === search.unidade && (!search.cliente || u.cliente_id === search.cliente),
    );
  function path(s: NrSection, record?: NrRecord) {
    return `${base}${s === "visao-geral" ? "" : `/${s === "modelos" ? "biblioteca" : s}`}${record ? `/${record.id}` : ""}`;
  }
  function changeContext(patch: Partial<NrSearch>) {
    if (id) void navigate({ to: path(section), search: { ...search, ...patch } });
    else onSearch(patch);
  }
  async function mutate(command: string) {
    if (!row || !recurso || guard.current) return;
    guard.current = true;
    setBusy(true);
    setCommandError(null);
    try {
      const payload = {
        organization_id: org,
        norma,
        recurso,
        comando: command as
          | "arquivar"
          | "restaurar"
          | "nova_revisao"
          | "submeter"
          | "reabrir"
          | "encerrar"
          | "publicar",
        id: row.id,
        expected_version: row.version,
        dados:
          recurso === "pendencias"
            ? { tratativa: reason }
            : command === "publicar"
              ? { fonte: reason }
              : { motivo: reason },
      };
      await execute({ data: { ...payload, chave: keyFor(payload) } });
      setAction(null);
      setReason("");
      setNotice("Operação confirmada e registrada no servidor.");
      await qc.invalidateQueries({ queryKey: ["nr", org] });
    } catch (error) {
      setCommandError(error instanceof Error ? error : new Error("A operação não foi concluída."));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="nx-nr-workspace">
      <header className="nr-heading">
        <div>
          <p className="nr-eyebrow">{norma === "NR33" ? "NR-33" : "NR-35"} · Base operacional</p>
          <h1>{title}</h1>
          <p className="nr-muted">
            {contextLabel || "Acervo, inventário e acompanhamento técnico da organização."}
          </p>
        </div>
        <span className="nr-badge">
          <ShieldCheck size={14} aria-hidden /> Registros com histórico
        </span>
      </header>
      {recurso === "sistemas" && (
        <p className="nr-source mb-4">
          Esta área reúne avaliações por família e sistemas cadastrados. As avaliações importadas
          conservam existência, aplicabilidade, condição, ação e validação em eixos independentes.
          Um registro ativo não comprova instalação física ou inspeção aprovada.
        </p>
      )}
      {context.isPending ? (
        <LoadingState label="Conferindo o contexto e as permissões…" />
      ) : context.isError ? (
        <ErrorState error={context.error} onRetry={() => context.refetch()} />
      ) : (
        contexto && (
          <>
            <div className="nr-context" aria-label="Contexto de cliente e unidade">
              <label>
                Cliente
                <select
                  value={search.cliente}
                  onChange={(e) =>
                    changeContext({ cliente: e.target.value, unidade: "", pagina: 0, pasta: "" })
                  }
                >
                  <option value="">Todos os clientes autorizados</option>
                  {contexto.clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Unidade
                <select
                  value={search.unidade}
                  onChange={(e) => {
                    const unit = contexto.unidades.find((u) => u.id === e.target.value);
                    changeContext({
                      unidade: e.target.value,
                      cliente: unit?.cliente_id ?? search.cliente,
                      pagina: 0,
                      pasta: "",
                    });
                  }}
                >
                  <option value="">Todas as unidades autorizadas</option>
                  {contexto.unidades
                    .filter((u) => !search.cliente || u.cliente_id === search.cliente)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label className="nr-section-select">
              Área do módulo
              <select
                value={section === "modelos" ? "biblioteca" : section}
                onChange={(event) =>
                  void navigate({
                    to: path(event.target.value as NrSection),
                    search: navigationSearch,
                  })
                }
              >
                {tabs.map(([area]) => (
                  <option key={area} value={area}>
                    {labels[area]}
                  </option>
                ))}
                {norma === "NR33" && <option value="pets">PET Digital</option>}
              </select>
            </label>
            <nav className="nr-tabs" aria-label={`Áreas ${norma === "NR33" ? "NR-33" : "NR-35"}`}>
              {tabs.map(([s, Icon]) => (
                <Link
                  key={s}
                  to={path(s)}
                  activeOptions={{ exact: s === "visao-geral" }}
                  search={navigationSearch}
                  aria-current={
                    s === section || (s === "biblioteca" && section === "modelos")
                      ? "page"
                      : undefined
                  }
                >
                  <Icon size={16} aria-hidden />
                  {labels[s]}
                </Link>
              ))}
              {norma === "NR33" && (
                <Link
                  to={path("pets")}
                  search={navigationSearch}
                  aria-current={section === "pets" ? "page" : undefined}
                >
                  <ShieldCheck size={16} aria-hidden />
                  PET Digital
                </Link>
              )}
            </nav>
            {!contextValid ? (
              <div role="alert" className="nr-feedback">
                A unidade da URL não pertence ao contexto selecionado. Selecione novamente o cliente
                e a unidade.
              </div>
            ) : (
              <>
                {notice && (
                  <p className="nr-notice" role="status">
                    <CheckCircle2 size={18} aria-hidden />
                    {notice}
                  </p>
                )}
                {section === "visao-geral" && (
                  <NrOverview org={org} norma={norma} search={search} base={base} />
                )}
                {section === "clientes" && (
                  <NrClients contexto={contexto} search={search} onSearch={onSearch} />
                )}
                {section === "historico" && (
                  <NrHistory org={org} norma={norma} search={search} onSearch={onSearch} />
                )}
                {section === "pets" &&
                  (norma === "NR33" ? (
                    <div className="nr-panel">
                      <h2 className="text-lg font-semibold mb-3">PET Digital canônica</h2>
                      <p className="nr-source">
                        Inventário, levantamento e documentos não autorizam entrada. Emissão e
                        assinatura seguem os requisitos verificados na PET.
                      </p>
                      {search.unidade ? (
                        <Suspense fallback={<LoadingState />}>
                          <PetHistorico unidadeId={search.unidade} />
                        </Suspense>
                      ) : (
                        <EmptyState
                          title="Selecione uma unidade"
                          hint="O histórico de PETs será consultado no contexto autorizado da unidade."
                        />
                      )}
                      <Link to="/execucao" className="nr-record-link">
                        Abrir ordens de serviço e PETs <ArrowRight size={17} />
                      </Link>
                    </div>
                  ) : null)}
                {section === "configuracoes" && contexto.permissoes.configurar && (
                  <Suspense fallback={<LoadingState label="Consultando consumo do acervo…" />}>
                    <NrStorageUsage org={org} contexto={contexto} />
                  </Suspense>
                )}
                {section === "configuracoes" && contexto.permissoes.configurar && (
                  <Suspense
                    fallback={<LoadingState label="Consultando processamento de importações…" />}
                  >
                    <NrImportQueue
                      key={`${org}-${norma}`}
                      org={org}
                      norma={norma}
                      onInspect={(loteId) =>
                        onSearch({ ...search, importLote: loteId, importItem: "", importPagina: 0 })
                      }
                    />
                  </Suspense>
                )}
                {section === "configuracoes" && contexto.permissoes.configurar && (
                  <Suspense fallback={<LoadingState label="Consultando lotes de importação…" />}>
                    <NrImportInspection org={org} search={search} onSearch={onSearch} />
                  </Suspense>
                )}
                {recurso && (
                  <section className="nr-panel">
                    <div className="nr-panel-header">
                      <div>
                        <h2>{id && row ? row.titulo : labels[section]}</h2>
                        <p className="nr-muted">
                          {id
                            ? "Identidade, versão e relações preservadas."
                            : section === "configuracoes"
                              ? "Gerencie modelos, blocos, campos e referências sem editar código."
                              : "Registros reais, paginados e filtrados no servidor."}
                        </p>
                      </div>
                      {!id &&
                        !search.lixeira &&
                        (recurso === "modelos"
                          ? contexto.permissoes.configurar
                          : contexto.permissoes.cadastrar) && (
                          <ActionButton
                            onClick={() => {
                              setDuplicating(false);
                              setEditor("novo");
                              setNotice("");
                            }}
                          >
                            <Plus size={16} aria-hidden />
                            {recurso === "modelos"
                              ? "Novo modelo ou item"
                              : `Criar ${resourceLabels[recurso].toLowerCase()}`}
                          </ActionButton>
                        )}
                    </div>
                    {id ? (
                      <>
                        <Link
                          to={path(section)}
                          search={{ ...search, pagina: 0 }}
                          className="inline-flex gap-2 items-center min-h-11 text-sm mb-3"
                        >
                          <ArrowLeft size={16} />
                          Voltar à lista
                        </Link>
                        {query.isPending ? (
                          <LoadingState />
                        ) : query.isError ? (
                          <ErrorState error={query.error} onRetry={() => query.refetch()} />
                        ) : (
                          row && (
                            <>
                              {recurso === "documentos" && (
                                <Suspense
                                  fallback={<LoadingState label="Carregando impactos da base…" />}
                                >
                                  <NrDocumentImpacts org={org} norma={norma} row={row} />
                                </Suspense>
                              )}
                              <NrDetail
                                row={row}
                                recurso={recurso}
                                contexto={contexto}
                                path={path}
                                search={search}
                              />
                              {recurso === "locais" && (
                                <Suspense fallback={<LoadingState label="Carregando cálculos…" />}>
                                  <NrCalculations
                                    key={`${org}-${norma}-${row.id}`}
                                    norma={norma}
                                    registro={row}
                                    canEdit={contexto.permissoes.editar}
                                    onSaved={async () => {
                                      setNotice("Cálculo salvo e confirmado no servidor.");
                                      await qc.invalidateQueries({ queryKey: ["nr", org] });
                                    }}
                                  />
                                </Suspense>
                              )}
                              {recurso === "pastas" &&
                                !row.arquivado_em &&
                                contexto.permissoes.editar &&
                                contexto.permissoes.mover && (
                                  <Suspense
                                    fallback={
                                      <LoadingState label="Carregando ordenação da pasta…" />
                                    }
                                  >
                                    <NrFolderOrder
                                      key={`${org}-${norma}-${row.id}`}
                                      org={org}
                                      norma={norma}
                                      row={row}
                                    />
                                  </Suspense>
                                )}
                              {recurso === "modelos" &&
                                ["regra", "criterio"].includes(row.tipo ?? "") && (
                                  <Suspense
                                    fallback={
                                      <LoadingState label="Carregando revisão técnica da biblioteca…" />
                                    }
                                  >
                                    <NrTechnicalPublication
                                      key={row.id}
                                      org={org}
                                      norma={norma}
                                      row={row}
                                    />
                                  </Suspense>
                                )}
                              <Suspense fallback={<LoadingState label="Carregando histórico…" />}>
                                <NrRecordHistory
                                  key={`${org}-${norma}-${row.id}`}
                                  org={org}
                                  norma={norma}
                                  recurso={recurso}
                                  registroId={row.id}
                                />
                              </Suspense>
                              {recurso === "documentos" &&
                                (parseNative(row.conteudo)?.blocos.length ?? 0) > 0 && (
                                  <Suspense
                                    fallback={
                                      <LoadingState label="Carregando exportação documental…" />
                                    }
                                  >
                                    <NrDocumentActions
                                      org={org}
                                      norma={norma}
                                      documentoId={row.id}
                                      expectedVersion={row.version}
                                    />
                                  </Suspense>
                                )}
                              {["documentos", "pastas", "locais"].includes(recurso) &&
                                row.cliente_id &&
                                row.unidade_id && (
                                  <Suspense
                                    fallback={<LoadingState label="Carregando acervo privado…" />}
                                  >
                                    <NrFilesPanel
                                      org={org}
                                      norma={norma}
                                      clienteId={row.cliente_id}
                                      unidadeId={row.unidade_id}
                                      documentoId={recurso === "documentos" ? row.id : undefined}
                                      pastaId={recurso === "pastas" ? row.id : undefined}
                                      localId={recurso === "locais" ? row.id : undefined}
                                      documentoVersion={row.version}
                                      canConvert={contexto.permissoes.editar}
                                      canEdit={contexto.permissoes.editar}
                                      canMove={contexto.permissoes.mover}
                                      canArchive={contexto.permissoes.arquivar}
                                      canRestore={contexto.permissoes.restaurar}
                                      canUpload={
                                        contexto.permissoes.anexar &&
                                        !row.arquivado_em &&
                                        !["emitido", "emitido_origem", "em_revisao"].includes(
                                          row.estado,
                                        )
                                      }
                                    />
                                  </Suspense>
                                )}
                              <div className="nr-actions">
                                {!row.arquivado_em &&
                                  ![
                                    "emitido",
                                    "superado",
                                    "emitido_origem",
                                    "publicado",
                                    "em_revisao",
                                  ].includes(row.estado) &&
                                  (recurso === "modelos"
                                    ? contexto.permissoes.configurar
                                    : contexto.permissoes.editar) && (
                                    <ActionButton
                                      onClick={() => {
                                        setDuplicating(false);
                                        setEditor(row);
                                      }}
                                    >
                                      <Pencil size={16} />
                                      {recurso === "pastas"
                                        ? "Renomear ou mover"
                                        : "Editar registro"}
                                    </ActionButton>
                                  )}
                                {!row.arquivado_em &&
                                  recurso === "modelos" &&
                                  contexto.permissoes.configurar && (
                                    <ActionButton
                                      variant="ghost"
                                      onClick={() => {
                                        setDuplicating(true);
                                        setEditor(row);
                                      }}
                                    >
                                      <Plus size={16} />
                                      Duplicar modelo
                                    </ActionButton>
                                  )}
                                {!row.arquivado_em &&
                                  ["documentos", "modelos"].includes(recurso) &&
                                  (recurso !== "modelos" || row.estado === "publicado") &&
                                  contexto.permissoes.editar && (
                                    <ActionButton
                                      variant="ghost"
                                      onClick={() => {
                                        setAction("nova_revisao");
                                        setReason("");
                                      }}
                                    >
                                      <RotateCcw size={16} />
                                      Nova revisão
                                    </ActionButton>
                                  )}
                                {!row.arquivado_em &&
                                  ["documentos", "levantamentos", "modelos"].includes(recurso) &&
                                  row.estado === "rascunho" &&
                                  contexto.permissoes.revisar && (
                                    <ActionButton
                                      variant="ghost"
                                      onClick={() => {
                                        setAction("submeter");
                                        setReason("");
                                      }}
                                    >
                                      Enviar para revisão
                                    </ActionButton>
                                  )}
                                {!row.arquivado_em &&
                                  ["documentos", "levantamentos", "modelos"].includes(recurso) &&
                                  row.estado === "em_revisao" &&
                                  contexto.permissoes.revisar && (
                                    <ActionButton
                                      variant="ghost"
                                      onClick={() => {
                                        setAction("reabrir");
                                        setReason("");
                                      }}
                                    >
                                      Devolver para edição
                                    </ActionButton>
                                  )}
                                {!row.arquivado_em &&
                                  recurso === "modelos" &&
                                  !["regra", "criterio"].includes(row.tipo ?? "") &&
                                  row.estado !== "publicado" &&
                                  contexto.permissoes.configurar && (
                                    <ActionButton
                                      variant="ghost"
                                      onClick={() => {
                                        setAction("publicar");
                                        setReason("");
                                      }}
                                    >
                                      Publicar versão do modelo
                                    </ActionButton>
                                  )}
                                {!row.arquivado_em &&
                                  recurso === "pendencias" &&
                                  contexto.permissoes.editar && (
                                    <ActionButton
                                      variant="ghost"
                                      onClick={() => {
                                        setAction(
                                          row.estado === "encerrada" ? "reabrir" : "encerrar",
                                        );
                                        setReason("");
                                      }}
                                    >
                                      {row.estado === "encerrada"
                                        ? "Reabrir pendência"
                                        : "Encerrar com tratativa"}
                                    </ActionButton>
                                  )}
                                {!row.arquivado_em && contexto.permissoes.arquivar && (
                                  <ActionButton
                                    variant="ghost"
                                    onClick={() => {
                                      setAction("arquivar");
                                      setReason("");
                                    }}
                                  >
                                    <Archive size={16} />
                                    Arquivar
                                  </ActionButton>
                                )}
                                {!!row.arquivado_em && contexto.permissoes.restaurar && (
                                  <ActionButton
                                    onClick={() => {
                                      setAction("restaurar");
                                      setReason("");
                                    }}
                                  >
                                    <RotateCcw size={16} />
                                    Restaurar
                                  </ActionButton>
                                )}
                              </div>
                              {action && (
                                <form
                                  className="nr-source"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    void mutate(action);
                                  }}
                                >
                                  <h3 className="font-semibold">
                                    {
                                      {
                                        arquivar: "Arquivar registro",
                                        restaurar: "Restaurar registro",
                                        nova_revisao: "Criar nova revisão",
                                        submeter: "Enviar para revisão",
                                        encerrar: "Encerrar pendência",
                                        reabrir: "Reabrir para edição",
                                        publicar: "Publicar versão do modelo",
                                      }[action]
                                    }
                                  </h3>
                                  <p className="nr-muted my-2">
                                    {action === "arquivar"
                                      ? "O registro irá para a lixeira. Vínculos e evidências retidos permanecem preservados; documentos emitidos não são apagados."
                                      : action === "restaurar"
                                        ? "O servidor verificará o contexto e eventuais conflitos antes de restaurar."
                                        : action === "nova_revisao"
                                          ? "A revisão anterior e sua autoria permanecem no histórico."
                                          : "A ação será validada no servidor e registrada no histórico."}
                                  </p>
                                  <label>
                                    {action === "publicar"
                                      ? "Fonte, versão e responsável pela publicação"
                                      : "Motivo, tratativa e referências"}
                                    <textarea
                                      rows={3}
                                      value={reason}
                                      required={action !== "submeter"}
                                      maxLength={4000}
                                      disabled={busy}
                                      onChange={(e) => setReason(e.target.value)}
                                    />
                                  </label>
                                  {commandError && (
                                    <p role="alert" className="nr-feedback">
                                      {commandError.message}
                                    </p>
                                  )}
                                  <div className="nr-actions mt-3">
                                    <ActionButton
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() => {
                                        setAction(null);
                                        setCommandError(null);
                                      }}
                                    >
                                      Cancelar
                                    </ActionButton>
                                    <ActionButton loading={busy} type="submit">
                                      Confirmar {action === "arquivar" ? "arquivamento" : "ação"}
                                    </ActionButton>
                                  </div>
                                </form>
                              )}
                            </>
                          )
                        )}
                      </>
                    ) : (
                      <>
                        {recurso === "pastas" && !search.lixeira && (
                          <NrFolderTree org={org} norma={norma} search={search} />
                        )}
                        <div className="nr-filters">
                          <label>
                            Buscar {labels[section].toLowerCase()}
                            <input
                              type="search"
                              value={search.busca}
                              maxLength={120}
                              placeholder="Título, TAG, descrição ou referência"
                              onChange={(e) => onSearch({ busca: e.target.value, pagina: 0 })}
                            />
                          </label>
                          <label>
                            Estado
                            <select
                              value={search.estado}
                              onChange={(e) => onSearch({ estado: e.target.value, pagina: 0 })}
                            >
                              <option value="">Todos os estados</option>
                              {(recurso === "pendencias"
                                ? ["aberta", "encerrada"]
                                : recurso === "locais" ||
                                    recurso === "sistemas" ||
                                    recurso === "pastas"
                                  ? ["ativo"]
                                  : recurso === "modelos"
                                    ? ["rascunho", "em_revisao", "publicado"]
                                    : recurso === "levantamentos"
                                      ? ["rascunho", "em_revisao"]
                                      : ["rascunho", "em_revisao", "emitido_origem"]
                              ).map((s) => (
                                <option key={s} value={s}>
                                  {hum(s)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <ActionButton
                            variant="ghost"
                            onClick={() => onSearch({ lixeira: !search.lixeira, pagina: 0 })}
                          >
                            {search.lixeira ? <RotateCcw size={16} /> : <Archive size={16} />}
                            {search.lixeira ? "Ver ativos" : "Lixeira"}
                          </ActionButton>
                          {(search.busca || search.estado || search.pasta) && (
                            <ActionButton
                              variant="ghost"
                              onClick={() =>
                                onSearch({ busca: "", estado: "", pasta: "", pagina: 0 })
                              }
                            >
                              Limpar filtros
                            </ActionButton>
                          )}
                        </div>
                        {search.lixeira && (
                          <p className="nr-source">
                            Lixeira: abra um registro para restaurar. A remoção física não é
                            executada por esta ação.
                          </p>
                        )}
                        {search.pasta && (
                          <p className="nr-source">
                            Pasta filtrada:{" "}
                            <Link to={path("pastas") + `/${search.pasta}`} search={search}>
                              Abrir pasta <ChevronRight size={14} className="inline" />
                            </Link>
                          </p>
                        )}
                        {query.isPending ? (
                          <LoadingState label="Consultando registros…" />
                        ) : query.isError ? (
                          <ErrorState error={query.error} onRetry={() => query.refetch()} />
                        ) : (
                          list && (
                            <>
                              <RecordList
                                rows={list.rows}
                                resource={recurso}
                                base={base}
                                search={search}
                                section={section}
                              />
                              {!list.rows.length && (
                                <EmptyState
                                  title={
                                    search.busca || search.estado
                                      ? "Nenhum resultado para os filtros"
                                      : search.lixeira
                                        ? "Nenhum registro arquivado"
                                        : "Nenhum registro neste contexto"
                                  }
                                  hint="Os registros importados ou cadastrados aparecerão aqui após confirmação no servidor."
                                />
                              )}
                              <Pagination
                                page={search.pagina}
                                total={list.total}
                                limit={list.limite}
                                onChange={(pagina) => onSearch({ pagina })}
                              />
                            </>
                          )
                        )}
                      </>
                    )}
                  </section>
                )}
              </>
            )}
            {editor && recurso && (
              <NrEditor
                key={`${org}:${user}:${norma}:${recurso}:${editor === "novo" ? "novo" : editor.id}`}
                org={org}
                norma={norma}
                recurso={recurso}
                row={editor === "novo" ? null : editor}
                duplicating={duplicating}
                contexto={contexto}
                clienteId={search.cliente}
                unidadeId={search.unidade}
                onClose={() => setEditor(null)}
                onSaved={() => {
                  setEditor(null);
                  setNotice("Registro salvo e confirmado no servidor.");
                  void qc.invalidateQueries({ queryKey: ["nr", org] });
                }}
              />
            )}
          </>
        )
      )}
    </div>
  );
}
function Pagination({
  page,
  total,
  limit,
  onChange,
}: {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="nr-pagination" aria-label="Paginação">
      <p role="status">
        {total} registros · página {page + 1} de {Math.max(1, Math.ceil(total / limit))}
      </p>
      <div className="nr-actions">
        <ActionButton variant="ghost" disabled={page <= 0} onClick={() => onChange(page - 1)}>
          Anterior
        </ActionButton>
        <ActionButton
          variant="ghost"
          disabled={(page + 1) * limit >= total}
          onClick={() => onChange(page + 1)}
        >
          Próxima
        </ActionButton>
      </div>
    </nav>
  );
}
function RecordList({
  rows,
  resource,
  base,
  search,
  section,
}: {
  rows: NrRecord[];
  resource: NrRecurso;
  base: string;
  search: NrSearch;
  section?: NrSection;
}) {
  return (
    <ul className="nr-record-list">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            className="nr-record-link"
            to={String(
              `${base}/${section === "configuracoes" ? "biblioteca" : resource === "modelos" ? "biblioteca" : resource}/${row.id}`,
            )}
            search={search}
          >
            <span>
              <strong>
                {row.tag ? `${row.tag} · ` : ""}
                {row.titulo}
              </strong>
              <small>
                {[
                  row.tipo,
                  row.revisao_numero ? `Revisão ${row.revisao_numero}` : null,
                  row.criticidade ? `Criticidade ${hum(row.criticidade)}` : null,
                  row.prazo ? `Prazo ${date(row.prazo)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || `Atualizado em ${date(row.updated_at)}`}
              </small>
            </span>
            {row.revisao_necessaria && (
              <span className="nr-badge">
                <AlertCircle size={13} aria-hidden />
                Revisão necessária
              </span>
            )}
            <Badge value={row.arquivado_em ? "arquivado" : row.estado} />
            <ChevronRight size={16} aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
function NrOverview({
  org,
  norma,
  search,
  base,
}: {
  org: string;
  norma: Norma;
  search: NrSearch;
  base: string;
}) {
  const consult = useServerFn(nrConsultar);
  const query = useQuery({
    queryKey: ["nr", org, norma, "painel", search.cliente, search.unidade],
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso: "painel",
          cliente_id: search.cliente || undefined,
          unidade_id: search.unidade || undefined,
        },
        signal,
      }),
    retry: false,
  });
  if (query.isPending) return <LoadingState label="Consultando os indicadores do contexto…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const panel = query.data as {
    locais: number;
    documentos: number;
    pendencias_abertas: number;
    levantamentos: number;
    em_revisao: number;
    documentos_revisao_necessaria?: number;
    pendencias_prioritarias: NrRecord[];
    documentos_revisao: NrRecord[];
  };
  return (
    <>
      <div className="nr-metrics">
        {[
          ["Locais no inventário", panel.locais, "locais"],
          ["Documentos", panel.documentos, "documentos"],
          ["Pendências abertas", panel.pendencias_abertas, "pendencias"],
        ].map(([label, total, area]) => (
          <Link
            to={String(`${base}/${area}`)}
            search={{ ...search, estado: "", pagina: 0 }}
            key={label}
            className="nr-metric"
          >
            <span>{label}</span>
            <strong>{total}</strong>
            <span className="nr-muted">
              Consultar registros <ArrowRight size={14} className="inline" />
            </span>
          </Link>
        ))}
      </div>
      {typeof panel.documentos_revisao_necessaria === "number" &&
        panel.documentos_revisao_necessaria > 0 && (
          <div className="nr-notice">
            <AlertCircle size={19} aria-hidden />
            <div>
              <p>
                {panel.documentos_revisao_necessaria} documentos precisam de conferência após
                alterações na base vinculada.
              </p>
              <Link
                to={String(`${base}/documentos`)}
                search={{ ...search, estado: "", pagina: 0 }}
                className="underline min-h-11 inline-flex items-center"
              >
                Abrir documentos e impactos
              </Link>
            </div>
          </div>
        )}
      <div className="nr-two-columns">
        <section className="nr-panel">
          <div className="nr-panel-header">
            <h2>Pendências prioritárias</h2>
            <Link to={String(`${base}/pendencias`)} search={search}>
              Ver todas
            </Link>
          </div>
          <RecordList
            rows={panel.pendencias_prioritarias}
            resource="pendencias"
            base={base}
            search={search}
          />
          {!panel.pendencias_prioritarias.length && (
            <EmptyState
              title="Nenhuma pendência aberta no contexto"
              hint="As pendências cadastradas e importadas serão priorizadas pelo prazo e criticidade."
            />
          )}
        </section>
        <section className="nr-panel">
          <div className="nr-panel-header">
            <h2>Documentos em revisão</h2>
            <span className="nr-badge">{panel.em_revisao} registros</span>
          </div>
          <RecordList
            rows={panel.documentos_revisao}
            resource="documentos"
            base={base}
            search={search}
          />
          {!panel.documentos_revisao.length && (
            <EmptyState
              title="Nenhum documento em revisão"
              hint="O envio para revisão é registrado pelo servidor."
            />
          )}
        </section>
      </div>
      <p className="nr-source">
        Dados e arquivos importados conservam sua origem e o estado da validação. Um registro de
        levantamento ou cálculo não constitui liberação operacional.
      </p>
    </>
  );
}
function NrClients({
  contexto,
  search,
  onSearch,
}: {
  contexto: NrContexto;
  search: NrSearch;
  onSearch: (patch: Partial<NrSearch>) => void;
}) {
  return (
    <section className="nr-panel">
      <div className="nr-panel-header">
        <h2>Clientes e unidades canônicos</h2>
        <Link
          to="/clientes"
          search={{ cliente: search.cliente, busca: "", situacao: "ativos", pagina: 0 }}
          className="nr-badge"
        >
          Abrir cadastro de clientes <ArrowRight size={14} />
        </Link>
      </div>
      {contexto.clientes
        .filter((c) => !search.cliente || search.cliente === c.id)
        .map((c) => (
          <div className="nr-panel" key={c.id}>
            <h3 className="font-semibold">{c.nome}</h3>
            <div className="nr-folder-tree">
              {contexto.unidades
                .filter((u) => u.cliente_id === c.id)
                .map((u) => (
                  <button
                    type="button"
                    className="nr-badge min-h-11"
                    key={u.id}
                    onClick={() => onSearch({ cliente: c.id, unidade: u.id, pagina: 0 })}
                  >
                    <MapPin size={15} />
                    {u.nome}
                    {u.id === search.unidade ? " · selecionada" : ""}
                  </button>
                ))}
            </div>
            {!contexto.unidades.some((u) => u.cliente_id === c.id) && (
              <p className="nr-muted">Nenhuma unidade cadastrada.</p>
            )}
          </div>
        ))}
      {!contexto.clientes.length && (
        <EmptyState
          title="Nenhum cliente disponível"
          hint="Os clientes são compartilhados com o cadastro operacional do Nexus."
        />
      )}
    </section>
  );
}
function NrHistory({
  org,
  norma,
  search,
  onSearch,
}: {
  org: string;
  norma: Norma;
  search: NrSearch;
  onSearch: (patch: Partial<NrSearch>) => void;
}) {
  const consult = useServerFn(nrConsultar);
  const [eventId, setEventId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["nr", org, norma, "historico", search.cliente, search.unidade, search.pagina],
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso: "historico",
          cliente_id: search.cliente || undefined,
          unidade_id: search.unidade || undefined,
          pagina: search.pagina,
          limite: 25,
        },
        signal,
      }),
    retry: false,
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const history = query.data as { rows: Record<string, NrJson>[]; total: number; limite: number };
  return (
    <section className="nr-panel">
      <h2 className="font-semibold mb-4">Histórico de operações</h2>
      <ul className="nr-record-list">
        {history.rows.map((r, i) => (
          <li className="py-4" key={String(r["id"] ?? i)}>
            <strong>
              {hum(String(r["acao"] ?? r["comando"] ?? r["evento"] ?? "Registro de alteração"))}
            </strong>
            <p className="nr-muted">
              {date(String(r["created_at"] ?? r["ocorrido_em"] ?? ""))} ·{" "}
              {String(r["recurso"] ?? r["entidade"] ?? "")}
            </p>
            {r["escopo"] === "nao_classificado" && (
              <p className="nr-badge">Origem · escopo não classificado</p>
            )}
            {!!r["motivo"] && <p className="nr-prewrap mt-2">{String(r["motivo"])}</p>}
            {r["motivo_resumido"] === true && (
              <p className="nr-muted">
                Motivo resumido. Abra o evento para consultar o texto integral.
              </p>
            )}
            <ActionButton variant="ghost" onClick={() => setEventId(String(r["id"]))}>
              Abrir evento completo
            </ActionButton>
          </li>
        ))}
      </ul>
      {!history.rows.length && (
        <EmptyState
          title="Nenhum evento neste contexto"
          hint="Criações, alterações e transições ficam registradas com o usuário que executou a operação."
        />
      )}
      <Pagination
        page={search.pagina}
        total={history.total}
        limit={history.limite}
        onChange={(pagina) => onSearch({ pagina })}
      />
      <Suspense fallback={<LoadingState label="Carregando leitor de eventos…" />}>
        <NrAuditEventDialog
          org={org}
          norma={norma}
          eventId={eventId}
          onClose={() => setEventId(null)}
        />
      </Suspense>
    </section>
  );
}
function NrDetail({
  row,
  recurso,
  contexto,
  path,
  search,
}: {
  row: NrRecord;
  recurso: NrRecurso;
  contexto: NrContexto;
  path: (section: NrSection, row?: NrRecord) => string;
  search: NrSearch;
}) {
  const content = parseNative(row.conteudo);
  const raw = row as NrRecord & {
    revisoes?: unknown[];
    historico?: unknown[];
    tratativas?: unknown[];
  };
  return (
    <>
      <div className="nr-actions">
        <Badge value={row.arquivado_em ? "arquivado" : row.estado} />
        {row.normas.map((n) => (
          <span className="nr-badge" key={n}>
            {n === "NR33" ? "NR-33" : "NR-35"}
          </span>
        ))}
        {row.revisao_numero && <span className="nr-badge">Revisão {row.revisao_numero}</span>}
      </div>
      <dl className="nr-facts">
        <div>
          <dt>Cliente</dt>
          <dd>
            {contexto.clientes.find((c) => c.id === row.cliente_id)?.nome ??
              "Biblioteca da organização"}
          </dd>
        </div>
        <div>
          <dt>Unidade</dt>
          <dd>
            {contexto.unidades.find((u) => u.id === row.unidade_id)?.nome ?? "Sem unidade definida"}
          </dd>
        </div>
        <div>
          <dt>Versão / atualização</dt>
          <dd>
            {row.version} · {date(row.updated_at)}
          </dd>
        </div>
        {row.tag && (
          <div>
            <dt>TAG</dt>
            <dd>{row.tag}</dd>
          </div>
        )}
        {row.tipo && (
          <div>
            <dt>Tipo</dt>
            <dd>{hum(row.tipo)}</dd>
          </div>
        )}
        {row.prazo && (
          <div>
            <dt>Prazo</dt>
            <dd>{date(row.prazo)}</dd>
          </div>
        )}
        {row.familia && (
          <div>
            <dt>Família</dt>
            <dd>{row.familia}</dd>
          </div>
        )}
      </dl>
      {row.descricao && <p className="nr-prewrap my-4">{row.descricao}</p>}
      {recurso === "sistemas" && typeof row.dados["familia_biblioteca"] === "string" && (
        <section className="nr-source my-4" aria-label="Avaliação por família importada">
          <h3 className="font-semibold">
            Avaliação por família: {row.dados["familia_biblioteca"]}
          </h3>
          <p className="mt-2">
            Este registro preserva uma avaliação do levantamento de origem. A presença do registro e
            sua situação ativa não confirmam equipamento instalado. A validação histórica permanece
            separada da revisão no Nexus.
          </p>
          <dl className="nr-facts mt-3">
            {(
              [
                ["existencia", "Existência"],
                ["aplicabilidade", "Aplicabilidade"],
                ["condicao", "Condição"],
                ["acao", "Ação"],
                ["validacao", "Validação na origem"],
                ["validacao_nexus", "Revisão no Nexus"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{hum(typeof row.dados[key] === "string" ? row.dados[key] : null)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {row.aliases?.length ? (
        <p className="nr-source">Aliases preservados: {row.aliases.join(" · ")}</p>
      ) : null}
      {recurso === "pastas" && (
        <NrFolderBreadcrumbs
          org={row.organization_id}
          norma={
            row.normas.includes("NR33") && path("pastas").startsWith("/nr-33") ? "NR33" : "NR35"
          }
          row={row}
          search={search}
        />
      )}
      {recurso === "pastas" && (
        <div className="nr-folder-tree">
          <Link to={path("pastas")} search={{ ...search, pasta: row.parent_id ?? "", pagina: 0 }}>
            <Folder size={16} />
            {row.parent_id ? "Pasta superior" : "Raiz do acervo"}
          </Link>
          <Link to={path("pastas")} search={{ ...search, pasta: row.id, pagina: 0 }}>
            <Folder size={16} />
            Subpastas
          </Link>
          <Link to={path("documentos")} search={{ ...search, pasta: row.id, pagina: 0 }}>
            <FileText size={16} />
            Documentos desta pasta
          </Link>
        </div>
      )}
      {row.local_id && (
        <p className="nr-source">
          <Link to={path("locais") + `/${row.local_id}`} search={search}>
            Abrir local vinculado <ArrowRight size={15} className="inline" />
          </Link>
        </p>
      )}
      {row.pet_espaco_id && (
        <p className="nr-source">
          Vínculo confirmado com o cadastro operacional PET. A emissão permanece no fluxo canônico
          da OS.
        </p>
      )}
      {recurso === "locais" && (
        <div className="nr-actions mb-4">
          <Link
            to={path("levantamentos")}
            search={{ ...search, busca: row.tag ?? row.titulo, pagina: 0 }}
          >
            Consultar levantamentos <ArrowRight size={14} className="inline" />
          </Link>
          <Link
            to={path("documentos")}
            search={{ ...search, busca: row.tag ?? row.titulo, pagina: 0 }}
          >
            Consultar documentos <ArrowRight size={14} className="inline" />
          </Link>
        </div>
      )}
      {recurso === "documentos" && (
        <div className="nr-source">
          <p>
            Origem: {row.estado_origem || "Não informada"} · Recebimento cadastrado:{" "}
            {hum(row.recebimento)}
          </p>
          <p>
            Um estado emitido na origem preserva o histórico; não cria aprovação ou assinatura
            Nexus.
          </p>
          <p className="mt-2">
            A confirmação dos arquivos é exibida no acervo abaixo; este campo mantém a classificação
            documental.
          </p>
          {row.origem_url && /^https?:\/\//.test(row.origem_url) && (
            <a
              href={row.origem_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Consultar referência externa
            </a>
          )}
        </div>
      )}
      {recurso === "documentos" && (
        <Suspense fallback={<LoadingState label="Consultando a origem da conversão…" />}>
          <NrConversionNotice row={row} />
        </Suspense>
      )}
      {(recurso === "documentos" || recurso === "modelos") &&
        (content ? (
          <div className="my-5">
            <h3 className="font-semibold mb-3">Conteúdo da revisão</h3>
            <NrContentEditor org={row.organization_id} value={content} readOnly />
          </div>
        ) : (
          <p className="nr-source">
            Sem conteúdo nativo editável nesta revisão. Referências externas e originais possuem
            estados próprios de obtenção.
          </p>
        ))}
      {recurso === "modelos" && Array.isArray(row.dados["blocos"]) && (
        <div className="nr-block-library my-4">
          {row.dados["blocos"].map((b, i) => {
            const block = dictionary(b);
            return (
              <details key={String(block["id"] ?? i)}>
                <summary>
                  {String(block["codigo"] ?? "")} — {String(block["titulo"] ?? "Bloco")}
                </summary>
                <p className="nr-muted">{String(block["aplicabilidade"] ?? "")}</p>
                <ul>
                  {(Array.isArray(block["campos"]) ? block["campos"] : []).map((f, fi) => {
                    const field = dictionary(f);
                    return (
                      <li key={String(field["id"] ?? fi)} className="py-2">
                        {String(field["nome"] ?? "Campo")} · {String(field["tipo"] ?? "texto")}
                        {field["obrigatorio"] ? " · obrigatório na revisão" : ""}
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      )}
      {recurso === "pendencias" && row.tratativa && (
        <div className="nr-source">
          <h3 className="font-semibold">Tratativa registrada</h3>
          <p className="nr-prewrap mt-2">{row.tratativa}</p>
        </div>
      )}
      {Object.keys(row.dados).filter((k) => k !== "blocos").length > 0 && (
        <details className="nr-panel">
          <summary className="cursor-pointer font-semibold">
            Informações técnicas e metadados
          </summary>
          <dl className="nr-facts">
            {Object.entries(row.dados)
              .filter(([k]) => k !== "blocos")
              .map(([k, v]) => (
                <div key={k}>
                  <dt>
                    {k === "originais_verificados"
                      ? "Originais verificados no snapshot inicial"
                      : hum(k)}
                  </dt>
                  <dd className="nr-prewrap">
                    {typeof v === "object"
                      ? JSON.stringify(v, null, 2)
                      : String(v ?? "Não informado")}
                  </dd>
                </div>
              ))}
          </dl>
        </details>
      )}
      {recurso === "levantamentos" && row.respostas && (
        <details className="nr-panel">
          <summary className="cursor-pointer font-semibold">Respostas preservadas</summary>
          <dl className="nr-facts">
            {Object.entries(dictionary(row.respostas)).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{typeof v === "object" ? JSON.stringify(v) : String(v ?? "Não informado")}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {!!raw.tratativas?.length && (
        <details className="nr-panel">
          <summary className="cursor-pointer font-semibold">
            Tratativas e reaberturas · {raw.tratativas.length}
          </summary>
          {raw.tratativas.map((entry, index) => {
            const item = dictionary(entry);
            return (
              <div className="nr-source" key={String(item["id"] ?? index)}>
                <p>
                  {hum(String(item["tipo"] ?? "Tratativa"))} ·{" "}
                  {date(String(item["data_origem"] ?? item["created_at"] ?? ""))}
                </p>
                <p className="nr-prewrap">
                  {String(item["texto"] ?? item["tratativa"] ?? "Texto não informado")}
                </p>
                {typeof item["autor_historico"] === "string" && (
                  <p className="nr-muted">Autoria histórica: {item["autor_historico"]}</p>
                )}
              </div>
            );
          })}
        </details>
      )}
    </>
  );
}
