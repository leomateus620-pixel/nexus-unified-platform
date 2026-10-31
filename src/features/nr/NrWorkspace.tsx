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
import { NrLocalDetail } from "./NrLocalDetail";
import { NrSurveyReader } from "./NrSurveyEditor";
import { NrFacts, NrValue, nrLabel, nrObject } from "./technical-display";
import { NrConference } from "./NrConference";
import { NrClientsWorkspace } from "./NrClients";
import { NrFolderTree, NrFolderBreadcrumbs } from "./NrFolderTree";
import { NrApplicabilityDecisions } from "./NrApplicabilityDecisions";
import { treatmentOriginDate } from "./technical-evidence";
import { RecordList } from "./NrRecordCards";
import { NrCard } from "./NrCards";
import { NrClientSelect } from "./NrClientSelect";
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
const NrDocumentContentReader = lazy(() =>
  import("./NrDocumentContentReader").then((module) => ({
    default: module.NrDocumentContentReader,
  })),
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
  | NrRecurso
  | "visao-geral"
  | "clientes"
  | "biblioteca"
  | "historico"
  | "configuracoes"
  | "pets"
  | "conferencia";
export type NrSearch = {
  cliente: string;
  unidade: string;
  busca: string;
  estado: string;
  pagina: number;
  pasta: string;
  lixeira: boolean;
  local?: string;
  ficha?: string;
  escopo?: "" | "unidade" | "todos";
  tipo?: string;
  familia?: string;
  vinculo?: "" | "unidade";
  copias?: boolean;
  aplicabilidade?: boolean;
  grupo?: "" | "vigentes" | "emitidos" | "recebidos" | "em_revisao" | "anteriores";
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
  "visao-geral": "Painel",
  clientes: "Clientes",
  locais: "Locais",
  levantamentos: "Levantamento",
  documentos: "Documentos",
  pastas: "Pastas",
  pendencias: "Pendências",
  biblioteca: "Regras e biblioteca",
  modelos: "Regras e biblioteca",
  conferencia: "Conferência",
  historico: "Histórico",
  configuracoes: "Configurações",
  sistemas: "Avaliações e sistemas",
  pets: "PET Digital",
};
const tabs = [
  ["visao-geral", LayoutDashboard],
  ["clientes", MapPin],
  ["levantamentos", ClipboardList],
  ["locais", MapPin],
  ["documentos", FileText],
  ["pendencias", AlertCircle],
  ["biblioteca", BookOpen],
  ["conferencia", ShieldCheck],
] as const;
const hum = (value?: string | null) => (value ? nrLabel(value) : "Não informado");
const date = (value?: string | null) => {
  if (!value) return "Não informado";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(parsed);
};
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
  const navigationSearch: NrSearch = {
    ...search,
    busca: "",
    estado: "",
    pagina: 0,
    pasta: "",
    lixeira: false,
    local: "",
    tipo: "",
    familia: "",
    vinculo: "",
    grupo: "",
  };
  const [editor, setEditor] = useState<NrRecord | "novo" | null>(null),
    [notice, setNotice] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [action, setAction] = useState<string | null>(null),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [commandError, setCommandError] = useState<Error | null>(null);
  const guard = useRef(false);
  const editorReturn = useRef<HTMLElement | null>(null);
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
      search.local,
      search.tipo,
      search.familia,
      search.vinculo,
      search.copias,
      search.grupo,
      search.aplicabilidade,
    ],
    enabled:
      !!contexto &&
      !!recurso &&
      (!!id || !!search.unidade || search.escopo === "todos" || recurso === "modelos"),
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
          local_id: search.local || undefined,
          tipo: search.tipo || undefined,
          familia: search.familia || undefined,
          copias_editaveis: search.copias ?? false,
          somente_unidade: search.vinculo === "unidade",
          grupo_documental: search.grupo || undefined,
          revisao_aplicabilidade: search.aplicabilidade ?? false,
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
  const memoryKey = `nexus.nr.contexto.v1:${user}:${org}`;
  useEffect(() => {
    if (row?.cliente_id && row.unidade_id && !search.cliente && !search.unidade)
      onSearch({ cliente: row.cliente_id, unidade: row.unidade_id, escopo: "unidade" });
  }, [row?.cliente_id, row?.unidade_id, search.cliente, search.unidade, onSearch]);
  useEffect(() => {
    if (!contexto) return;
    try {
      if (
        search.unidade &&
        contexto.unidades.some((u) => u.id === search.unidade && u.cliente_id === search.cliente)
      ) {
        sessionStorage.setItem(
          memoryKey,
          JSON.stringify({ cliente: search.cliente, unidade: search.unidade }),
        );
      } else if (!search.cliente && !search.unidade && !id && search.escopo !== "todos") {
        const saved = JSON.parse(sessionStorage.getItem(memoryKey) || "null") as {
          cliente?: string;
          unidade?: string;
        } | null;
        if (
          saved &&
          contexto.unidades.some((u) => u.id === saved.unidade && u.cliente_id === saved.cliente)
        )
          onSearch({ cliente: saved.cliente!, unidade: saved.unidade!, escopo: "unidade" });
      }
    } catch {
      /* Storage may be disabled. The explicit selector remains available. */
    }
  }, [contexto, search.cliente, search.unidade, search.escopo, id, memoryKey, onSearch]);
  function path(s: NrSection, record?: NrRecord) {
    return `${base}${s === "visao-geral" ? "" : `/${s === "modelos" ? "biblioteca" : s}`}${record ? `/${record.id}` : ""}`;
  }
  function changeContext(patch: Partial<NrSearch>) {
    const next: Partial<NrSearch> = {
      ...patch,
      local: "",
      ficha: "identificacao",
      busca: "",
      estado: "",
      pagina: 0,
      pasta: "",
    };
    if (id) void navigate({ to: path(section), search: { ...search, ...next } });
    else onSearch(next);
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
    <div className={`nx-nr-workspace${id && recurso === "locais" ? " nr-local-workspace" : ""}`}>
      <header className={`nr-heading${id && recurso === "locais" ? " nr-heading-compact" : ""}`}>
        <div>
          <p className="nr-eyebrow">{norma === "NR33" ? "NR-33" : "NR-35"}</p>
          <h1 className={id && recurso === "locais" ? "sr-only" : undefined}>{title}</h1>
        </div>
        <Link
          className="nr-norma-switch"
          to={String(
            `${norma === "NR33" ? "/nr-35" : "/nr-33"}${section === "visao-geral" || section === "pets" ? "" : `/${section}`}`,
          )}
          search={navigationSearch}
        >
          Alternar para {norma === "NR33" ? "NR-35" : "NR-33"}
          <ArrowRight size={15} aria-hidden />
        </Link>
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
              <div className="nr-context-client">
                <label htmlFor="nr-context-client">Cliente</label>
                <NrClientSelect
                  id="nr-context-client"
                  clientes={contexto.clientes}
                  value={search.cliente}
                  onValueChange={(cliente) =>
                    changeContext({ cliente, unidade: "", escopo: "unidade" })
                  }
                />
              </div>
              <label className="nr-context-unit">
                Unidade
                <span className="nr-context-unit-control">
                  <MapPin size={18} aria-hidden />
                  <select
                    aria-label="Unidade"
                    value={search.unidade}
                    onChange={(e) => {
                      const unit = contexto.unidades.find((u) => u.id === e.target.value);
                      changeContext({
                        unidade: e.target.value,
                        cliente: unit?.cliente_id ?? search.cliente,
                        pagina: 0,
                        pasta: "",
                        escopo: "unidade",
                      });
                    }}
                  >
                    <option value="">Selecione uma unidade</option>
                    {contexto.unidades
                      .filter((u) => !search.cliente || u.cliente_id === search.cliente)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                  </select>
                </span>
              </label>
              <button
                className="nr-aggregate"
                type="button"
                aria-pressed={search.escopo === "todos"}
                onClick={() => changeContext({ cliente: "", unidade: "", escopo: "todos" })}
              >
                Visão agregada
              </button>
              <details className="nr-secondary-nav">
                <summary>Mais opções</summary>
                <nav aria-label="Áreas relacionadas e administração">
                  {(
                    [
                      ["pastas", Folder],
                      ["sistemas", Wrench],
                      ["historico", History],
                      ["configuracoes", Settings],
                      ...(norma === "NR33" ? [["pets", ShieldCheck]] : []),
                    ] as [NrSection, typeof Folder][]
                  ).map(([area, Icon]) => (
                    <Link key={area} to={path(area)} search={navigationSearch}>
                      <Icon size={15} aria-hidden />
                      {labels[area]}
                    </Link>
                  ))}
                </nav>
              </details>
            </div>
            <p className="nr-scope-label" role="status">
              {id && recurso === "locais" ? (
                `Recorte ${norma === "NR33" ? "NR-33" : "NR-35"}. Outros conteúdos do local permanecem no mesmo acervo.`
              ) : (
                <>
                  {contextLabel ||
                    (search.escopo === "todos"
                      ? "Visão agregada dos contextos associados ao módulo"
                      : "Selecione cliente e unidade para iniciar")}
                  {search.unidade
                    ? ` · Recorte ${norma === "NR33" ? "NR-33" : "NR-35"}. Conteúdos de outras normas permanecem no mesmo acervo.`
                    : ""}
                </>
              )}
            </p>
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
                {["pastas", "sistemas", "historico", "configuracoes"].map((area) => (
                  <option key={area} value={area}>
                    {labels[area as NrSection]}
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
            </nav>
            {!search.unidade &&
            search.escopo !== "todos" &&
            !id &&
            !["clientes", "biblioteca", "modelos", "configuracoes"].includes(section) ? (
              <section className="nr-panel nr-context-start">
                <MapPin size={24} aria-hidden />
                <h2>Escolha a unidade de trabalho</h2>
                <p>
                  Use o seletor acima ou abra uma unidade na área Clientes. A visão agregada está
                  disponível como opção.
                </p>
                <Link to={path("clientes")} search={navigationSearch} className="nr-inline-action">
                  Abrir clientes e unidades <ArrowRight size={16} />
                </Link>
              </section>
            ) : !contextValid ? (
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
                  <NrOverview
                    org={org}
                    norma={norma}
                    search={search}
                    base={base}
                    contexto={contexto}
                  />
                )}
                {section === "clientes" && (
                  <NrClientsWorkspace
                    org={org}
                    norma={norma}
                    contexto={contexto}
                    search={search}
                    onSearch={onSearch}
                  />
                )}
                {section === "conferencia" && (
                  <NrConference org={org} norma={norma} search={search} />
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
                  <section
                    className={`nr-panel${id && recurso === "locais" ? " nr-local-record" : ""}`}
                  >
                    <div
                      className={`nr-panel-header${id && recurso === "locais" ? " nr-local-record-heading" : ""}`}
                    >
                      {id && recurso === "locais" && (
                        <Link to={path(section)} search={search} className="nr-local-back">
                          <ArrowLeft size={16} />
                          Voltar à lista
                        </Link>
                      )}
                      <div>
                        <h2>
                          {id && row
                            ? `${recurso === "locais" && row.tag ? `${row.tag} · ` : ""}${row.titulo}`
                            : labels[section]}
                        </h2>
                      </div>
                      {!id &&
                        !search.lixeira &&
                        (recurso === "modelos"
                          ? contexto.permissoes.configurar
                          : contexto.permissoes.cadastrar) && (
                          <ActionButton
                            onClick={(event) => {
                              editorReturn.current = event.currentTarget;
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
                        {recurso !== "locais" && (
                          <Link
                            to={path(section)}
                            search={search}
                            className="inline-flex gap-2 items-center min-h-11 text-sm mb-3"
                          >
                            <ArrowLeft size={16} />
                            Voltar à lista
                          </Link>
                        )}
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
                              {recurso === "locais" ? (
                                <NrLocalDetail
                                  row={row}
                                  norma={norma}
                                  contexto={contexto}
                                  search={search}
                                  onSearch={onSearch}
                                  onSaved={() => {
                                    void qc.invalidateQueries({ queryKey: ["nr", org] });
                                  }}
                                />
                              ) : (
                                <NrDetail
                                  row={row}
                                  recurso={recurso}
                                  contexto={contexto}
                                  path={path}
                                  search={search}
                                />
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
                              {recurso !== "locais" && (
                                <Suspense fallback={<LoadingState label="Carregando histórico…" />}>
                                  <NrRecordHistory
                                    key={`${org}-${norma}-${row.id}`}
                                    org={org}
                                    norma={norma}
                                    recurso={recurso}
                                    registroId={row.id}
                                  />
                                </Suspense>
                              )}
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
                              {["documentos", "pastas"].includes(recurso) &&
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
                                      revisaoId={
                                        recurso === "documentos"
                                          ? (row.revisao_atual_id ?? undefined)
                                          : undefined
                                      }
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
                                      onClick={(event) => {
                                        editorReturn.current = event.currentTarget;
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
                                      onClick={(event) => {
                                        editorReturn.current = event.currentTarget;
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
                                  !["substituicao_declarada", "superada"].includes(
                                    row.resumo_documental?.vigencia_apresentacao ?? "",
                                  ) &&
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
                        {recurso === "documentos" && (
                          <div className="nr-document-navigation">
                            <Link
                              to={path("pastas")}
                              search={navigationSearch}
                              className="nr-inline-action"
                            >
                              <Folder size={16} /> Pastas do acervo
                            </Link>
                            <label className="nr-checkbox-inline">
                              <input
                                type="checkbox"
                                checked={search.copias ?? false}
                                onChange={(e) => onSearch({ copias: e.target.checked, pagina: 0 })}
                              />{" "}
                              Incluir cópias editáveis na lista
                            </label>
                          </div>
                        )}
                        {search.local && (
                          <p className="nr-linked-filter">
                            Exibindo vínculos do local selecionado.{" "}
                            <Link
                              to={path("locais") + `/${search.local}`}
                              search={{
                                ...search,
                                ficha: search.ficha || "identificacao",
                              }}
                            >
                              Voltar à ficha
                            </Link>{" "}
                            <button
                              type="button"
                              onClick={() => onSearch({ local: "", pagina: 0 })}
                            >
                              Mostrar toda a unidade
                            </button>
                          </p>
                        )}
                        <div className="nr-filters">
                          {recurso === "pendencias" && norma === "NR35" && (
                            <label className="nr-checkbox-inline">
                              <input
                                type="checkbox"
                                checked={search.aplicabilidade ?? false}
                                onChange={(e) =>
                                  onSearch({ aplicabilidade: e.target.checked, pagina: 0 })
                                }
                              />{" "}
                              Incluir assuntos com aplicabilidade a revisar
                            </label>
                          )}
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
                          {recurso === "modelos" && (
                            <label>
                              Categoria
                              <select
                                value={search.tipo || ""}
                                onChange={(e) => onSearch({ tipo: e.target.value, pagina: 0 })}
                              >
                                <option value="">Todas as categorias</option>
                                <option value="levantamento">Roteiros de levantamento</option>
                                <option value="regra">Regras</option>
                                <option value="criterio">Critérios</option>
                                <option value="familia">Famílias de soluções</option>
                                <option value="documento">Modelos documentais</option>
                              </select>
                            </label>
                          )}
                          {recurso === "locais" && (
                            <>
                              <label>
                                Família
                                <input
                                  value={search.familia || ""}
                                  maxLength={120}
                                  placeholder="Filtrar família"
                                  onChange={(e) => onSearch({ familia: e.target.value, pagina: 0 })}
                                />
                              </label>
                              <label>
                                Classificação principal
                                <select
                                  value={search.tipo || ""}
                                  onChange={(e) => onSearch({ tipo: e.target.value, pagina: 0 })}
                                >
                                  <option value="">Todos os tipos</option>
                                  <option value="EC">Espaço confinado</option>
                                  <option value="ALTURA">Trabalho em altura</option>
                                </select>
                              </label>
                            </>
                          )}
                          {recurso === "documentos" && (
                            <label>
                              Finalidade e situação
                              <select
                                value={search.grupo || ""}
                                onChange={(e) =>
                                  onSearch({
                                    grupo: e.target.value as NonNullable<NrSearch["grupo"]>,
                                    estado: "",
                                    pagina: 0,
                                  })
                                }
                              >
                                <option value="">Todos os documentos</option>
                                <option value="vigentes">Documentação vigente</option>
                                <option value="emitidos">Emitidos na origem</option>
                                <option value="recebidos">Recebidos</option>
                                <option value="em_revisao">Rascunhos e em revisão</option>
                                <option value="anteriores">Anteriores ou substituídos</option>
                              </select>
                            </label>
                          )}
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
                          {(search.busca ||
                            search.estado ||
                            search.pasta ||
                            search.tipo ||
                            search.familia ||
                            search.grupo) && (
                            <ActionButton
                              variant="ghost"
                              onClick={() =>
                                onSearch({
                                  busca: "",
                                  estado: "",
                                  pasta: "",
                                  tipo: "",
                                  familia: "",
                                  grupo: "",
                                  pagina: 0,
                                })
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
                returnFocus={editorReturn.current}
                contexto={contexto}
                clienteId={search.cliente}
                unidadeId={search.unidade}
                onClose={() => setEditor(null)}
                onSaved={(saved) => {
                  qc.setQueriesData<{ registro: NrRecord }>(
                    { queryKey: ["nr", org, user, norma, recurso, saved.id] },
                    (current) =>
                      current?.registro
                        ? { ...current, registro: { ...current.registro, ...saved } }
                        : current,
                  );
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
function NrOverview({
  org,
  norma,
  search,
  base,
  contexto,
}: {
  org: string;
  norma: Norma;
  search: NrSearch;
  base: string;
  contexto: NrContexto;
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
    documentos_origem?: number;
    documentos_logicos?: number;
    documentos_principais?: number;
    copias_editaveis?: number;
    copias_correspondencia_pendente?: number;
    arquivos_fisicos?: number;
    historico_tecnico?: Record<string, NrJson>[];
    eventos_globais?: Record<string, NrJson>[];
  };
  const unit = contexto.unidades.find((u) => u.id === search.unidade);
  return (
    <>
      {unit && (
        <section className="nr-unit-intro">
          <h2>{unit.nome}</h2>
          <p className="nr-muted">
            {[unit.cnpj ? `CNPJ ${unit.cnpj}` : null, unit.endereco, unit.escopo]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
      )}
      <div className="nr-metrics">
        {[
          ["Locais no inventário", panel.locais, "locais"],
          ["Documentos no acervo", panel.documentos_logicos ?? panel.documentos, "documentos"],
          ["Pendências abertas", panel.pendencias_abertas, "pendencias"],
        ].map(([label, total, area]) => (
          <Link
            to={String(`${base}/${area}`)}
            search={{
              ...search,
              estado: area === "pendencias" ? "aberta" : "",
              local: "",
              pagina: 0,
            }}
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
      <p className="nr-count-breakdown">
        {panel.documentos_origem ?? panel.documentos} documentos da origem ·{" "}
        {panel.copias_editaveis ?? "—"} cópias editáveis · {panel.arquivos_fisicos ?? "—"} arquivos
        físicos vinculados ·{" "}
        <Link to={String(`${base}/levantamentos`)} search={search}>
          {panel.levantamentos} levantamentos
        </Link>
      </p>
      {!!panel.copias_correspondencia_pendente && (
        <p className="nr-muted">
          {panel.copias_correspondencia_pendente} cópias editáveis aguardam correspondência
          documental comprovada e continuam acessíveis na lista.
        </p>
      )}
      {unit?.documentacao && (
        <section className="nr-panel">
          <h2 className="font-semibold">Documentação registrada da unidade</h2>
          <NrFacts value={unit.documentacao} />
          <Link
            to={String(`${base}/documentos`)}
            search={{ ...search, estado: "emitido_origem", pagina: 0 }}
            className="nr-inline-action"
          >
            Abrir documentos emitidos <ArrowRight size={16} />
          </Link>
        </section>
      )}
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
      <section className="nr-panel">
        <div className="nr-panel-header">
          <h2>Alterações técnicas recentes</h2>
          <Link
            to={String(`${base}/historico`)}
            search={{ ...search, estado: "tecnico", pagina: 0 }}
          >
            Ver histórico técnico
          </Link>
        </div>
        <ul className="nr-event-cards">
          {panel.historico_tecnico?.map((event, index) => (
            <li key={String(event["id"] ?? index)}>
              <NrCard kind="evento" className="nr-event-card">
                <Link
                  to={String(`${base}/locais/${String(event["local_id"])}`)}
                  search={{ ...search, ficha: "historico" }}
                >
                  <strong>
                    {String(event["local_tag"] ?? "Local")} · {String(event["local_titulo"] ?? "")}
                  </strong>
                </Link>
                <p className="nr-prewrap">{String(event["acao"] ?? "")}</p>
                <small>
                  {String(event["data"] ?? "Data não informada")} ·{" "}
                  {String(event["autor_historico"] ?? "Autor não informado")}
                </small>
              </NrCard>
            </li>
          ))}
        </ul>
        {!panel.historico_tecnico?.length && (
          <p className="nr-muted">Nenhuma alteração técnica registrada neste recorte.</p>
        )}
      </section>
      {!!panel.eventos_globais?.length && (
        <details className="nr-panel">
          <summary>Eventos globais da origem · sem associação comprovada a esta unidade</summary>
          <ul className="nr-event-cards">
            {panel.eventos_globais.map((event, i) => (
              <li key={i}>
                <NrCard kind="evento" className="nr-event-card">
                  <NrFacts value={event} omit={["id", "escopo"]} />
                </NrCard>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="nr-source">
        Dados e arquivos importados conservam sua origem e o estado da validação. Um registro de
        levantamento ou cálculo não constitui liberação operacional.
      </p>
    </>
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
    queryKey: [
      "nr",
      org,
      norma,
      "historico",
      search.cliente,
      search.unidade,
      search.pagina,
      search.estado,
    ],
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso: search.estado === "auditoria" ? "historico" : "historico_tecnico",
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
      <div className="nr-panel-header">
        <h2>
          {search.estado === "auditoria"
            ? "Auditoria de operações da Nexus"
            : "Alterações técnicas dos locais"}
        </h2>
        <div className="nr-actions">
          <ActionButton
            variant="ghost"
            aria-pressed={search.estado !== "auditoria"}
            onClick={() => onSearch({ estado: "tecnico", pagina: 0 })}
          >
            Histórico técnico
          </ActionButton>
          <ActionButton
            variant="ghost"
            aria-pressed={search.estado === "auditoria"}
            onClick={() => onSearch({ estado: "auditoria", pagina: 0 })}
          >
            Auditoria da Nexus
          </ActionButton>
        </div>
      </div>
      <ul className="nr-event-cards">
        {history.rows.map((r, i) => (
          <li key={String(r["id"] ?? i)}>
            <NrCard kind="evento" className="nr-event-card">
              <strong>
                {hum(String(r["acao"] ?? r["comando"] ?? r["evento"] ?? "Registro de alteração"))}
              </strong>
              <p className="nr-muted">
                {date(String(r["data"] ?? r["created_at"] ?? r["ocorrido_em"] ?? ""))} ·{" "}
                {String(r["autor_historico"] ?? r["recurso"] ?? r["entidade"] ?? "")}
              </p>
              {!!r["local_id"] && (
                <Link
                  to={String(
                    `${norma === "NR33" ? "/nr-33" : "/nr-35"}/locais/${String(r["local_id"])}`,
                  )}
                  search={{ ...search, ficha: "historico" }}
                  className="nr-inline-action"
                >
                  {String(r["local_tag"] ?? "Local")} · {String(r["local_titulo"] ?? "")}
                </Link>
              )}
              {typeof r["texto"] === "string" && <p className="nr-prewrap">{r["texto"]}</p>}
              {r["escopo"] === "nao_classificado" && (
                <p className="nr-badge">Origem · escopo não classificado</p>
              )}
              {!!r["motivo"] && <p className="nr-prewrap mt-2">{String(r["motivo"])}</p>}
              {r["motivo_resumido"] === true && (
                <p className="nr-muted">
                  Motivo resumido. Abra o evento para consultar o texto integral.
                </p>
              )}
              {search.estado === "auditoria" && (
                <ActionButton
                  variant="ghost"
                  onClick={(event) => {
                    event.currentTarget.focus({ preventScroll: true });
                    setEventId(String(r["id"]));
                  }}
                >
                  Abrir evento completo
                </ActionButton>
              )}
            </NrCard>
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
        {row.criticidade && (
          <div>
            <dt>Criticidade</dt>
            <dd>{nrLabel(row.criticidade)}</dd>
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
          <Link
            to={String(
              `${Array.isArray(nrObject(row.local_contexto)["normas"]) && !(nrObject(row.local_contexto)["normas"] as unknown[]).includes(path("locais").startsWith("/nr-33") ? "NR33" : "NR35") ? ((nrObject(row.local_contexto)["normas"] as unknown[]).includes("NR33") ? "/nr-33/locais" : "/nr-35/locais") : path("locais")}/${row.local_id}`,
            )}
            search={{ ...search, local: "", ficha: "identificacao" }}
          >
            Abrir local vinculado <ArrowRight size={15} className="inline" />
          </Link>
        </p>
      )}
      {recurso === "pendencias" && row.revisao_aplicabilidade && (
        <section className="nr-source">
          <h3 className="font-semibold">Aplicabilidade normativa para conferência</h3>
          <NrFacts value={row.revisao_aplicabilidade} />
        </section>
      )}
      {recurso === "pendencias" && <NrApplicabilityDecisions value={row.decisoes_aplicabilidade} />}
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
            search={{
              ...search,
              cliente: row.cliente_id ?? "",
              unidade: row.unidade_id ?? "",
              local: row.id,
              busca: "",
              pagina: 0,
            }}
          >
            Consultar levantamentos <ArrowRight size={14} className="inline" />
          </Link>
          <Link
            to={path("documentos")}
            search={{
              ...search,
              cliente: row.cliente_id ?? "",
              unidade: row.unidade_id ?? "",
              local: row.id,
              busca: "",
              pagina: 0,
            }}
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
          <NrConversionNotice
            row={row}
            norma={path("documentos").startsWith("/nr-33") ? "NR33" : "NR35"}
          />
        </Suspense>
      )}
      {(recurso === "documentos" || recurso === "modelos") &&
        (content ? (
          <div className="my-5">
            <h3 className="font-semibold mb-3">Conteúdo da revisão</h3>
            {recurso === "documentos" ? (
              <Suspense fallback={<LoadingState label="Consultando conteúdo documental…" />}>
                <NrDocumentContentReader
                  row={row}
                  norma={path("documentos").startsWith("/nr-33") ? "NR33" : "NR35"}
                  value={content}
                />
              </Suspense>
            ) : (
              <NrContentEditor org={row.organization_id} value={content} readOnly />
            )}
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
      {recurso === "levantamentos" && <NrSurveyReader row={row} />}
      {recurso !== "levantamentos" &&
        Object.keys(row.dados).filter((k) => k !== "blocos").length > 0 && (
          <details className="nr-panel">
            <summary className="cursor-pointer font-semibold">Informações complementares</summary>
            <NrFacts value={row.dados} omit={["blocos"]} />
          </details>
        )}
      {!!raw.tratativas?.length && (
        <details className="nr-panel" open={recurso === "pendencias" && row.estado === "encerrada"}>
          <summary className="cursor-pointer font-semibold">
            Tratativas e reaberturas · {raw.tratativas.length}
          </summary>
          {raw.tratativas.map((entry, index) => {
            const item = dictionary(entry);
            return (
              <div className="nr-source" key={String(item["id"] ?? index)}>
                <p>
                  {item["tipo"] === "historico_importado"
                    ? "Tratativa histórica da origem"
                    : nrLabel(String(item["tipo"] ?? "Tratativa"))}{" "}
                  · {date(treatmentOriginDate(item, row.dados))}
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
