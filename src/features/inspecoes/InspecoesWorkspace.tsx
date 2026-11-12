import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownRight,
  ArrowRight,
  BellRing,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardCheck,
  FileText,
  Layers3,
  LayoutDashboard,
  MapPin,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  NotConfigured,
} from "@/components/nexus/Page";
import { NexusLogo } from "@/components/nexus/NexusLogo";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrg, type OrgContext } from "@/features/org/session";
import { NrCard } from "@/features/nr/NrCards";
import { NrClientBrand, type NrClientIdentity } from "@/features/nr/NrClientBrand";
import { NrClientSelect } from "@/features/nr/NrClientSelect";
import { inspecoesContexto, inspecoesListar, inspecoesPainel } from "./inspecoes.functions";
import {
  destinoRecurso,
  inspecoesMenus,
  limparConsulta,
  type InspecoesFicha,
  type InspecoesMenu,
  type InspecoesSearch,
} from "./route-state";
import type {
  InspecoesAtribuicao,
  InspecoesContexto,
  InspecoesEscopo,
  InspecoesFiltro,
  InspecoesLista,
  InspecoesPainel,
  InspecoesRegistro,
  InspecoesRecurso,
  InspecoesUnidade,
} from "./ui-contract";
import { Fatos, RegistroCard, ValorEstruturado, legenda } from "./apresentacao";
import { InspecoesCadastroAtivo } from "./InspecoesCampo";
import { InspecoesContinuidade } from "./InspecoesContinuidade";
import { InspecoesDetalheDialog } from "./InspecoesDetalhe";
import "@/features/nr/nr.css";
import "./inspecoes.css";

const icons: Record<InspecoesMenu, LucideIcon> = {
  painel: LayoutDashboard,
  clientes: Building2,
  catalogo: Layers3,
  laudos: FileText,
  avisos: BellRing,
  biblioteca: BookOpen,
  fases: ClipboardCheck,
};

const headings: Record<InspecoesMenu, string> = {
  painel: "Acompanhe os prazos de reinspeção e os registros do seu escopo.",
  clientes: "Consulte unidades, contatos e contratos por cliente.",
  catalogo: "Ofertas por segmento e referências para inspeção de cada família.",
  laudos: "Consulte documentos, ativos, plantas e evidências por unidade.",
  avisos: "Prazos de reinspeção, destinatários autorizados e histórico de comunicações.",
  biblioteca: "Regras, parâmetros e textos com versão e estado de validação.",
  fases: "Acompanhe a cobertura do módulo e acesse os fluxos disponíveis.",
};

type Atualizar = (update: (prev: InspecoesSearch) => InspecoesSearch, replace?: boolean) => void;
type Abrir = (item: InspecoesRegistro, trigger: HTMLElement) => void;
type Preferencia = Pick<InspecoesSearch, "cliente" | "unidade" | "escopo" | "atribuicao">;
type ViewProps = { search: InspecoesSearch; atualizar: Atualizar };

function preferenciaLer(key: string): Preferencia {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "{}") as Preferencia;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function preferenciaSalvar(key: string, value: Preferencia) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // O URL continua sendo a fonte do contexto quando o armazenamento está indisponível.
  }
}

export function InspecoesWorkspace(props: ViewProps) {
  const org = useOrg().data;
  if (!org) return <LoadingState label="Verificando organização…" />;
  return <WorkspaceSession key={org.userId + org.orgId} org={org} {...props} />;
}

function WorkspaceSession({ search, atualizar, org }: ViewProps & { org: OrgContext }) {
  const contexto = useServerFn(inspecoesContexto);
  const query = useQuery<InspecoesContexto>({
    queryKey: ["inspecoes", org.orgId, org.userId, "contexto"],
    queryFn: ({ signal }) => contexto({ data: { organizationId: org.orgId }, signal }),
    refetchInterval: 20_000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  return (
    <div className="nx-nr-workspace insp-workspace">
      {query.isPending ? (
        <LoadingState label="Verificando atribuições de Inspeções…" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data.atribuicoes.length ? (
        <div className="insp-no-access">
          <NexusLogo className="insp-wordmark" />
          <h1>Inspeções SPIQ &amp; SPCQ</h1>
          <EmptyState
            title="Sem atribuição de Inspeções"
            hint="Solicite uma atribuição EST ou TST para o cliente e a unidade do seu trabalho."
          />
        </div>
      ) : (
        <WorkspaceAuthorized search={search} atualizar={atualizar} org={org} context={query.data} />
      )}
    </div>
  );
}

function WorkspaceAuthorized({
  search,
  atualizar,
  org,
  context,
}: ViewProps & {
  org: OrgContext;
  context: InspecoesContexto;
}) {
  const sessionKey = ["nexus-inspecoes", org.userId, org.orgId].join(":");
  const [initialPreference] = useState(() => preferenciaLer(sessionKey));
  const units = context.unidades;
  const clients = useMemo(
    () =>
      Array.from(
        new Map(
          units.map((unit): [string, NrClientIdentity] => [
            unit.cliente_id,
            { id: unit.cliente_id, nome: unit.cliente_nome, marca: unit.marca },
          ]),
        ).values(),
      ).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [units],
  );
  const usingPreference =
    !search.escopo && !search.cliente && !search.unidade && !search.trilha?.length;
  const requestedClient =
    search.cliente ?? (usingPreference ? initialPreference.cliente : undefined);
  const requestedUnit = search.unidade ?? (usingPreference ? initialPreference.unidade : undefined);
  const selectedUnit = units.find(
    (unit) =>
      unit.unidade_id === requestedUnit &&
      (!requestedClient || unit.cliente_id === requestedClient),
  );
  const clientId =
    selectedUnit?.cliente_id ?? clients.find((client) => client.id === requestedClient)?.id;
  const unitId = selectedUnit?.unidade_id;
  const unavailable =
    !usingPreference && ((!!requestedClient && !clientId) || (!!requestedUnit && !unitId));
  const assignments = context.atribuicoes.filter(
    (item) =>
      (!clientId || !item.cliente_id || item.cliente_id === clientId) &&
      (!unitId || !item.unidade_id || item.unidade_id === unitId),
  );
  const assignmentId = search.atribuicao ?? initialPreference.atribuicao;
  const active = assignments.find(({ id }) => id === assignmentId) ?? assignments[0];
  const cache = useQueryClient();
  const queryKey = useMemo(
    () => [
      "inspecoes",
      org.orgId,
      org.userId,
      "consulta",
      clientId ?? "",
      unitId ?? "",
      active?.id ?? "",
    ],
    [org.orgId, org.userId, clientId, unitId, active?.id],
  );
  const escopo: InspecoesEscopo = {
    organizationId: org.orgId,
    clienteId: clientId,
    unidadeId: unitId,
  };
  const canManage = !!unitId && active?.perfil === "EST";
  const scopeMode = unitId ? "unidade" : clientId ? "cliente" : "todos";

  useEffect(() => {
    if (!unavailable)
      preferenciaSalvar(sessionKey, {
        cliente: clientId,
        unidade: unitId,
        escopo: scopeMode,
        atribuicao: active?.id,
      });
  }, [unavailable, sessionKey, clientId, unitId, scopeMode, active?.id]);

  useEffect(() => {
    if (!unavailable && usingPreference && (clientId || unitId)) {
      atualizar(
        (prev) => ({ ...prev, cliente: clientId, unidade: unitId, escopo: scopeMode }),
        true,
      );
    }
  }, [unavailable, usingPreference, clientId, unitId, scopeMode, atualizar]);

  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey });
      cache.removeQueries({ queryKey, type: "inactive" });
    },
    [cache, queryKey],
  );

  function setContext(cliente?: string, unidade?: string) {
    atualizar((prev) => ({
      ...limparConsulta(prev),
      area: prev.area,
      cliente,
      unidade,
      escopo: unidade ? "unidade" : cliente ? "cliente" : "todos",
      atribuicao: undefined,
    }));
  }

  const opener = useRef<HTMLElement | null>(null);
  const main = useRef<HTMLHeadingElement>(null);
  const openRecord: Abrir = (item, trigger) => {
    opener.current = trigger;
    atualizar((prev) => ({ ...prev, trilha: [{ id: item.id, recurso: item.colecao }] }));
  };
  const trail = search.trilha ?? [];
  const menu = inspecoesMenus.find((item) => item.id === search.menu) ?? inspecoesMenus[0];
  const area = menu.areas.find((item) => item.id === search.area) ?? menu.areas[0];
  const selectedClient = clients.find((client) => client.id === clientId);
  const scopeLabel = selectedUnit
    ? `${selectedUnit.cliente_nome} · ${selectedUnit.unidade_nome}`
    : selectedClient
      ? `${selectedClient.nome} · Todas as unidades autorizadas`
      : "Todos os clientes autorizados";
  return (
    <>
      <header className="insp-hero">
        <div className="insp-hero-title">
          <NexusLogo className="insp-wordmark" />
          <div>
            <h1>
              Inspeções <span>SPIQ &amp; SPCQ</span>
            </h1>
          </div>
        </div>
        <div className="insp-selectors">
          <div className="insp-context-field" title={selectedClient?.nome}>
            <label htmlFor="insp-cliente">Cliente</label>
            <NrClientSelect
              id="insp-cliente"
              clientes={clients}
              value={clientId ?? ""}
              onValueChange={(id) => setContext(id || undefined)}
            />
          </div>
          <div className="insp-context-field">
            <label htmlFor="insp-unidade">Unidade</label>
            <UnitSelect
              value={unitId}
              units={units.filter((unit) => unit.cliente_id === clientId)}
              onChange={(id) => setContext(clientId, id)}
              enabled={!!clientId}
            />
          </div>
          <div className="insp-context-field insp-assignment">
            {assignments.length > 1 ? (
              <label htmlFor="insp-atribuicao">Atuação</label>
            ) : (
              <span className="insp-context-label">Atuação</span>
            )}
            {assignments.length > 1 ? (
              <select
                id="insp-atribuicao"
                value={active?.id ?? ""}
                title={active ? labelAtribuicao(active, units) : undefined}
                onChange={(e) => {
                  const atribuicao = e.target.value;
                  atualizar((prev) => ({ ...prev, atribuicao, trilha: undefined }));
                }}
              >
                {assignments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {labelAtribuicao(item, units)}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className="insp-assignment-value"
                id="insp-atribuicao"
                title={active ? labelAtribuicao(active, units) : undefined}
              >
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  {active ? labelAtribuicao(active, units) : "Sem atribuição neste contexto"}
                </span>
              </span>
            )}
          </div>
        </div>
      </header>

      <nav className="insp-nav" aria-label="Áreas de Inspeções">
        {inspecoesMenus.map((item) => {
          const Icon = icons[item.id];
          return (
            <Link
              key={item.id}
              to="/inspecoes"
              search={(prev) => ({ ...limparConsulta(prev), menu: item.id })}
              resetScroll={false}
              aria-current={menu.id === item.id ? "page" : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <section className="insp-content" aria-labelledby="insp-area-title">
        <div className="insp-section-head">
          <p className="insp-context-note">
            <MapPin aria-hidden="true" size={15} />
            {unavailable ? "Contexto indisponível" : scopeLabel}
          </p>
          <h2 id="insp-area-title" ref={main} tabIndex={-1}>
            {menu.label}
          </h2>
          <p className="nr-muted">{headings[menu.id]}</p>
        </div>
        {menu.areas.length > 0 && (
          <nav className="insp-subnav" aria-label={`Subáreas de ${menu.label}`}>
            {menu.areas.map((item) => (
              <Link
                key={item.id}
                to="/inspecoes"
                search={(prev) => ({ ...limparConsulta(prev), area: item.id })}
                resetScroll={false}
                aria-current={area?.id === item.id ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        {unavailable ? (
          <EmptyState
            title="Cliente ou unidade indisponível"
            hint="Escolha um contexto disponível para consultar o acervo."
            action={
              <ActionButton onClick={() => setContext()}>
                Ver todos os clientes autorizados
              </ActionButton>
            }
          />
        ) : menu.id === "painel" ? (
          <Painel escopo={escopo} queryKey={queryKey} unidades={units} abrir={openRecord} />
        ) : menu.id === "clientes" ? (
          <Clientes
            search={search}
            canManage={canManage}
            units={units}
            clients={clients}
            clientId={clientId}
            onSelect={setContext}
            escopo={escopo}
            queryKey={queryKey}
          />
        ) : area?.recurso ? (
          <>
            {area.recurso === "ativos" && (
              <InspecoesCadastroAtivo
                escopo={escopo}
                queryKey={queryKey}
                atribuicao={active}
                onCreated={(registro) => {
                  opener.current = main.current;
                  atualizar((prev) => ({
                    ...prev,
                    trilha: [{ id: registro.id, recurso: registro.colecao }],
                  }));
                }}
              />
            )}
            <Consulta
              key={area.recurso}
              search={search}
              atualizar={atualizar}
              escopo={escopo}
              queryKey={queryKey}
              unidades={units}
              recurso={area.recurso}
              abrir={openRecord}
              label={area.label}
            />
          </>
        ) : area?.id === "contatos" ? (
          <Contatos units={units} cliente={clientId} unidade={unitId} />
        ) : area?.id === "envio" ? (
          <Envio />
        ) : area?.id === "f4" ? (
          <InspecoesContinuidade scope={escopo} queryKey={queryKey} canManage={canManage} />
        ) : (
          <Fase area={area?.id ?? "f1"} />
        )}
      </section>

      {!unavailable && (
        <InspecoesDetalheDialog
          key={queryKey.join(":")}
          escopo={escopo}
          queryKey={queryKey}
          unidades={units}
          userId={org.userId}
          atribuicao={active}
          trail={trail}
          opener={opener}
          fallbackFocus={main}
          setTrail={(trilha) =>
            atualizar((prev) => ({ ...prev, trilha: trilha.length ? trilha : undefined }))
          }
        />
      )}
    </>
  );
}

function labelAtribuicao(item: InspecoesAtribuicao, units: InspecoesUnidade[]) {
  const context =
    units.find(({ unidade_id }) => unidade_id === item.unidade_id)?.unidade_nome ??
    units.find(({ cliente_id }) => cliente_id === item.cliente_id)?.cliente_nome;
  return [item.perfil, item.nome, context].filter(Boolean).join(" · ");
}

function UnitSelect({
  value,
  units,
  onChange,
  enabled,
}: {
  value?: string | undefined;
  units: InspecoesUnidade[];
  onChange: (id?: string) => void;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const list = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const label =
    units.find((unit) => unit.unidade_id === value)?.unidade_nome ?? "Todas as unidades";
  function select(id?: string) {
    onChange(id);
    setOpen(false);
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id="insp-unidade"
          ref={trigger}
          type="button"
          role="combobox"
          aria-label={`Unidade: ${label}`}
          title={label}
          aria-controls={list}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={!enabled}
          className="nr-client-combobox"
        >
          <span>{label}</span>
          <ChevronsUpDown size={16} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="nr-brand-options"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus({ preventScroll: true });
        }}
      >
        <Command defaultValue={value ?? "todas"}>
          <CommandInput aria-label="Buscar unidade" placeholder="Buscar unidade…" />
          <CommandList id={list}>
            <CommandEmpty>Nenhuma unidade encontrada.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="todas" keywords={["Todas as unidades"]} onSelect={() => select()}>
                Todas as unidades {!value && <Check size={16} aria-hidden="true" />}
              </CommandItem>
              {units.map((unit) => (
                <CommandItem
                  key={unit.unidade_id}
                  value={unit.unidade_id}
                  keywords={[unit.unidade_nome, unit.cidade ?? "", unit.uf ?? ""]}
                  onSelect={() => select(unit.unidade_id)}
                >
                  {unit.unidade_nome}{" "}
                  {unit.unidade_id === value && <Check size={16} aria-hidden="true" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type QueryScope = { escopo: InspecoesEscopo; queryKey: readonly string[] };
type Listing = QueryScope & { unidades: InspecoesUnidade[]; abrir: Abrir };

function Painel({ escopo, queryKey, unidades, abrir }: Listing) {
  const load = useServerFn(inspecoesPainel);
  const query = useQuery<InspecoesPainel>({
    queryKey: [...queryKey, "painel"],
    queryFn: ({ signal }) => load({ data: escopo, signal }),
    retry: false,
  });
  if (query.isPending) return <LoadingState label="Carregando indicadores…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <div className="insp-stack">
      <div className="insp-stat-grid" aria-label="Indicadores da consulta">
        {query.data.indicadores.map(({ recurso, estado, label, total }) => {
          const Icon =
            recurso === "vencimentos" || recurso === "avisos"
              ? CalendarClock
              : recurso === "documentos"
                ? FileText
                : recurso === "pendencias"
                  ? BellRing
                  : Layers3;
          return (
            <Link
              className="insp-stat"
              key={recurso + estado}
              to="/inspecoes"
              search={(prev) => ({ ...limparConsulta(prev), ...destinoRecurso(recurso), estado })}
              resetScroll={false}
            >
              <div>
                <Icon size={19} aria-hidden="true" />
                <ArrowDownRight size={17} aria-hidden="true" />
              </div>
              <strong>{new Intl.NumberFormat("pt-BR").format(total)}</strong>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
      <section className="insp-stack" aria-labelledby="insp-recentes">
        <h3 id="insp-recentes" className="insp-subheading">
          Registros recentes
        </h3>
        {query.data.recentes.length ? (
          <div className="insp-grid">
            {query.data.recentes.map((item) => (
              <RegistroCard key={item.id} item={item} unidades={unidades} abrir={abrir} />
            ))}
          </div>
        ) : (
          <EmptyState title="Nenhum registro neste contexto" />
        )}
      </section>
    </div>
  );
}

const filters: Partial<Record<InspecoesRecurso, { value: string; label: string }[]>> = {
  ativos: [
    { value: "vigentes", label: "Ativos vigentes e existentes" },
    { value: "todos", label: "Todo o histórico de ativos" },
  ],
  documentos: [
    { value: "", label: "Todos os estados" },
    { value: "emitido", label: "Emitidos" },
    { value: "recebido", label: "Recebidos" },
  ],
  vencimentos: [
    { value: "", label: "Todos os prazos" },
    { value: "em_dia", label: "Em dia" },
    { value: "em_aviso", label: "Em aviso" },
    { value: "vencido", label: "Vencidos" },
  ],
  regras: [
    { value: "", label: "Todos os estados" },
    { value: "aprovada", label: "Aprovadas" },
    { value: "proposta", label: "Propostas" },
  ],
};

function Consulta({
  escopo,
  queryKey,
  search,
  atualizar,
  unidades,
  recurso,
  abrir,
  label,
}: Listing &
  ViewProps & {
    recurso: InspecoesRecurso;
    label: string;
  }) {
  const load = useServerFn(inspecoesListar);
  const [draft, setDraft] = useState(search.busca);
  useEffect(() => setDraft(search.busca), [search.busca]);
  const filter = filters[recurso];
  const estado = search.estado || (recurso === "ativos" ? "vigentes" : "");
  const data: InspecoesFiltro = {
    ...escopo,
    recurso,
    busca: search.busca,
    estado,
    pagina: search.pagina,
    ordem: search.ordem,
  };
  const query = useQuery<InspecoesLista>({
    queryKey: [...queryKey, recurso, data.busca, data.estado, data.pagina, data.ordem],
    queryFn: ({ signal }) => load({ data, signal }),
    retry: false,
  });
  const first = search.pagina * (query.data?.pageSize ?? 1) + 1;
  const last = first + (query.data?.items.length ?? 0) - 1;
  function submit(e: FormEvent) {
    e.preventDefault();
    atualizar((prev) => ({ ...prev, busca: draft.trim(), pagina: 0 }));
  }
  return (
    <div className="insp-stack">
      <form
        className="insp-toolbar"
        onSubmit={submit}
        aria-label={`Consultar ${label.toLowerCase()}`}
      >
        <div className="insp-field insp-search">
          <label htmlFor="insp-busca">Buscar {label.toLocaleLowerCase("pt-BR")}</label>
          <div className="insp-search-control">
            <Search size={16} aria-hidden="true" />
            <input
              id="insp-busca"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Nome, código ou TAG"
              maxLength={100}
            />
          </div>
        </div>
        {filter && (
          <div className="insp-field">
            <label htmlFor="insp-estado">Situação</label>
            <select
              id="insp-estado"
              value={estado}
              onChange={(e) => {
                const next = e.target.value;
                atualizar((prev) => ({ ...prev, estado: next, pagina: 0 }));
              }}
            >
              {!filter.some((item) => item.value === estado) && (
                <option value={estado}>{legenda(estado)}</option>
              )}
              {filter.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="insp-field">
          <label htmlFor="insp-ordem">Ordenar por</label>
          <select
            id="insp-ordem"
            value={search.ordem}
            onChange={(e) => {
              const ordem = e.target.value === "nome" ? "nome" : "recente";
              atualizar((prev) => ({ ...prev, ordem, pagina: 0 }));
            }}
          >
            <option value="recente">Mais recentes</option>
            <option value="nome">Nome ou título</option>
          </select>
        </div>
        <ActionButton type="submit">Buscar</ActionButton>
        {(search.busca || search.estado) && (
          <ActionButton
            variant="ghost"
            onClick={() => {
              setDraft("");
              atualizar((prev) => ({ ...prev, busca: "", estado: "", pagina: 0 }));
            }}
          >
            Limpar filtros
          </ActionButton>
        )}
      </form>
      {query.isPending ? (
        <LoadingState label={`Carregando ${label.toLowerCase()}…`} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <p role="status" className="insp-results">
            {query.data.items.length
              ? `${first}–${last} de ${query.data.total}`
              : `${query.data.total} registros`}
          </p>
          {query.data.items.length ? (
            <div className="insp-grid">
              {query.data.items.map((item) => (
                <RegistroCard key={item.id} item={item} unidades={unidades} abrir={abrir} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nenhum registro para esta consulta"
              hint="Ajuste os filtros ou selecione outra unidade."
            />
          )}
          {(search.pagina > 0 || last < query.data.total) && (
            <nav className="insp-pagination" aria-label="Páginas da consulta">
              <ActionButton
                variant="ghost"
                disabled={search.pagina === 0}
                onClick={() =>
                  atualizar((prev) => ({ ...prev, pagina: Math.max(0, prev.pagina - 1) }))
                }
              >
                <ChevronLeft size={16} aria-hidden="true" />
                Anterior
              </ActionButton>
              <span>Página {search.pagina + 1}</span>
              <ActionButton
                variant="ghost"
                disabled={last >= query.data.total}
                onClick={() => atualizar((prev) => ({ ...prev, pagina: prev.pagina + 1 }))}
              >
                Próxima
                <ChevronRight size={16} aria-hidden="true" />
              </ActionButton>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function Clientes({
  clients,
  units,
  clientId,
  onSelect,
  search,
  canManage,
  escopo,
  queryKey,
}: QueryScope & {
  search: InspecoesSearch;
  canManage: boolean;
  clients: NrClientIdentity[];
  units: InspecoesUnidade[];
  clientId?: string | undefined;
  onSelect: (cliente?: string, unidade?: string) => void;
}) {
  const visible = clientId ? clients.filter((client) => client.id === clientId) : clients;
  return (
    <div className="insp-stack">
      {visible.length ? (
        <div className="insp-grid">
          {visible.map((client) => {
            const clientUnits = units.filter((unit) => unit.cliente_id === client.id);
            return (
              <NrCard className="insp-client-card" key={client.id}>
                <h3>
                  <NrClientBrand client={client} />
                </h3>
                <Fatos
                  items={[
                    ["Segmento", clientUnits[0]?.segmento],
                    ["Unidades autorizadas", clientUnits.length],
                  ]}
                />
                <ul>
                  {clientUnits.map((unit) => (
                    <li key={unit.unidade_id}>
                      <button
                        type="button"
                        onClick={() => onSelect(client.id, unit.unidade_id)}
                        aria-pressed={search.unidade === unit.unidade_id}
                      >
                        <MapPin size={15} aria-hidden="true" />
                        <span>{unit.unidade_nome}</span>
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                {!clientId && (
                  <ActionButton variant="ghost" onClick={() => onSelect(client.id)}>
                    Selecionar cliente
                  </ActionButton>
                )}
              </NrCard>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Nenhum cliente disponível"
          hint="Os clientes aparecem após a conciliação das unidades e atribuições."
        />
      )}
      {clientId && (
        <>
          <h3 className="insp-subheading">Contatos</h3>
          <Contatos units={units} cliente={clientId} unidade={escopo.unidadeId} />
          <h3 className="insp-subheading">Contratos</h3>
          <InspecoesContinuidade scope={escopo} queryKey={queryKey} canManage={canManage} compact />
        </>
      )}
    </div>
  );
}

function Contatos({
  units,
  cliente,
  unidade,
}: {
  units: InspecoesUnidade[];
  cliente?: string | undefined;
  unidade?: string | undefined;
}) {
  const visible = units.filter(
    (unit) =>
      (!cliente || unit.cliente_id === cliente) && (!unidade || unit.unidade_id === unidade),
  );
  const populated = visible.flatMap((unit) => {
    const source = unit.snapshot;
    const candidates = [source?.["contatos"], source?.["responsavel_cliente"]].filter((value) => {
      if (!value) return false;
      return typeof value !== "object" || Object.keys(value).length > 0;
    });
    return candidates.length ? [{ unit, candidates }] : [];
  });
  if (!populated.length) return <EmptyState title="Nenhum contato disponível neste contexto" />;
  return (
    <div className="insp-grid">
      {populated.map(({ unit, candidates }) => (
        <NrCard key={unit.unidade_id} className="insp-record">
          <h3>{unit.cliente_nome}</h3>
          <p className="insp-context-note">{unit.unidade_nome}</p>
          {candidates.map((contact, index) => (
            <ValorEstruturado key={index} value={contact} />
          ))}
        </NrCard>
      ))}
    </div>
  );
}

function Envio() {
  return (
    <div className="insp-stack">
      <NotConfigured what="O envio externo depende de canal habilitado, destinatários autorizados, consentimento aplicável e liberação do EST." />
      <Link
        className="insp-text-link"
        to="/inspecoes"
        search={(prev) => ({ ...limparConsulta(prev), menu: "avisos", area: "avisos" })}
      >
        Consultar histórico de avisos e simulações <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

const fases = {
  f1: {
    titulo: "Acervo e reinspeções",
    descricao: "Clientes, biblioteca, laudos históricos, plantas e consulta dos ciclos R64.",
    recurso: "documentos",
    acao: "Consultar documentos",
  },
  f2: {
    titulo: "Levantamento de campo",
    descricao:
      "Abra a ficha do ativo para criar, atribuir, preencher e encaminhar um levantamento para revisão.",
    recurso: "ativos",
    acao: "Localizar um ativo",
  },
  f3: {
    titulo: "Revisão técnica e emissão",
    descricao:
      "A ficha do ativo reúne o levantamento, a conferência do EST e os requisitos de emissão.",
    recurso: "ativos",
    acao: "Abrir consulta de ativos",
  },
};

function Fase({ area }: { area: string }) {
  const phase = area === "f2" || area === "f3" ? fases[area] : fases.f1;
  const recurso = phase.recurso as InspecoesRecurso;
  return (
    <NrCard className="insp-record">
      <h3>{phase.titulo}</h3>
      <p>{phase.descricao}</p>
      {recurso && (
        <Link
          className="insp-text-link"
          to="/inspecoes"
          search={(prev) => ({ ...limparConsulta(prev), ...destinoRecurso(recurso) })}
        >
          {phase.acao}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </NrCard>
  );
}
