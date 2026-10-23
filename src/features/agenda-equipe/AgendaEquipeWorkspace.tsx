import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CalendarDays, ChevronLeft, ChevronRight, ListFilter, Plus } from "lucide-react";
import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/nexus/Page";
import { fieldClass, useCommandKey } from "@/features/operacao/components";
import type { OperationalAccess } from "@/features/operacao/access";
import { captureOperationalContinuation } from "@/features/operacao/continuation";
import { AgendaCalendar } from "./AgendaCalendar";
import { AgendaDetail } from "./AgendaDetail";
import { AgendaActionPanel } from "./AgendaActionPanel";
import { AgendaForm, type AgendaEditor } from "./AgendaForms";
import { AgendaPicker } from "./AgendaPicker";
import { AgendaPreferences } from "./AgendaPreferences";
import { AgendaJobs } from "./AgendaJobs";
import { TimezoneFilter } from "./TimezoneFilter";
import { executarAgenda, obterEventoAgenda } from "./agenda.functions";
import {
  agendaKeys,
  invalidateAgenda,
  useAgendaAction,
  useAgendaConfiguration,
  useAgendaDetail,
  useAgendaList,
  useAgendaNotifications,
  useAgendaPending,
} from "./queries";
import {
  AGENDA_ACESSO_NEGADO,
  acessoAgendaNegado,
  estadoLabels,
  periodoEvento,
  periodoCurto,
  tipoLabels,
} from "./domain";
import {
  addCivilDays,
  calendarWindow,
  civilDate,
  civilInZone,
  daysInWindow,
  formatCivil,
  formatInstant,
  supportsTimezone,
} from "./calendar-domain";
import type {
  AgendaSearch,
  ComandoAgenda,
  ComandoBody,
  DetalheAgenda,
  PendenteAgenda,
} from "./types";
export type AgendaEquipeWorkspaceProps = {
  orgId: string;
  userId: string;
  access: OperationalAccess;
  search: AgendaSearch;
  onSearch: (patch: Partial<AgendaSearch>) => void;
  onOpenLevantamento?: (id: string) => void;
};
export function AgendaEquipeWorkspace(props: AgendaEquipeWorkspaceProps) {
  return (
    <AgendaContent
      key={props.orgId + ":" + props.userId + ":" + JSON.stringify(props.access)}
      {...props}
    />
  );
}
function AgendaContent({
  orgId,
  userId,
  access,
  search,
  onSearch,
  onOpenLevantamento,
}: AgendaEquipeWorkspaceProps) {
  const qc = useQueryClient(),
    run = useServerFn(executarAgenda),
    read = useServerFn(obterEventoAgenda),
    commandKey = useCommandKey();
  const [editor, setEditor] = useState<AgendaEditor | null>(null),
    [busy, setBusy] = useState(false),
    [commandError, setCommandError] = useState<unknown>(null),
    [boundary, setBoundary] = useState<unknown>(null),
    [saved, setSaved] = useState(""),
    [preferences, setPreferences] = useState(false),
    [term, setTerm] = useState(search.busca);
  const life = useRef({ active: false, generation: 0 }),
    busyLock = useRef(false),
    editorRef = useRef(editor),
    cleanup = useRef(Promise.resolve()),
    feedback = useRef<HTMLDivElement>(null),
    region = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null),
    opener = useRef<HTMLElement | null>(null);
  editorRef.current = editor;
  useEffect(() => {
    const l = life.current;
    l.active = true;
    l.generation++;
    return () => {
      l.active = false;
      l.generation++;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.busca), 300);
    return () => clearTimeout(timer);
  }, [search.busca]);
  const configuration = useAgendaConfiguration(orgId, userId, !boundary);
  const zone = search.fuso || configuration.data?.timezone || "America/Sao_Paulo";
  let today = "",
    date = "",
    windowRange: { start: string; endExclusive: string; month: number } | null = null;
  try {
    today = configuration.data ? civilInZone(configuration.data.server_now, zone) : "";
    date = search.data ? (civilDate(search.data), search.data) : today;
    if (date) windowRange = calendarWindow(date, search.vista);
  } catch {
    /* Invalid filter is rendered as a recoverable form error below. */
  }
  const start = search.dia || windowRange?.start || "2000-01-01",
    end = search.dia ? addCivilDays(search.dia, 1) : windowRange?.endExclusive || "2000-01-02";
  const rows = useAgendaList(
    {
      organization_id: orgId,
      inicio: start,
      fim: end,
      timezone: zone,
      minha: search.foco === "minha",
      busca: term,
      estado: search.estado || null,
      tipo: search.tipo || null,
      equipe_id: search.equipe || null,
      pagina: search.pagina,
    },
    !!configuration.data &&
      !configuration.isError &&
      !boundary &&
      !!windowRange &&
      (search.foco === "minha" || search.foco === "equipe"),
  );
  const detail = useAgendaDetail(orgId, search.evento || null, !boundary),
    action = useAgendaAction(orgId, search.acao || null, !boundary);
  const pending = useAgendaPending(
    {
      organization_id: orgId,
      minhas: !search.pendentesEquipe,
      busca: term,
      pagina: search.pagina,
    },
    search.foco === "pendentes" && !boundary,
  );
  const notifications = useAgendaNotifications(
    orgId,
    search.pagina,
    search.foco === "notificacoes" && !boundary,
  );
  const noAccess =
    !!boundary ||
    acessoAgendaNegado(configuration.error) ||
    acessoAgendaNegado(detail.error) ||
    acessoAgendaNegado(action.error) ||
    (!search.evento &&
      !search.acao &&
      [rows.error, pending.error, notifications.error].some(acessoAgendaNegado));
  const current = !noAccess && !detail.isError ? detail.data : undefined,
    actionCurrent = !noAccess && !action.isError ? action.data : undefined;
  const canCreate =
      !noAccess && !configuration.isError && configuration.data?.permissoes.criar === true,
    canCreateAction =
      !noAccess && !configuration.isError && configuration.data?.permissoes.criar_acao === true;
  const deniedRef = useRef(noAccess);
  deniedRef.current = noAccess;
  const deny = useCallback((error: unknown) => {
    if (acessoAgendaNegado(error)) {
      life.current.generation++;
      deniedRef.current = true;
      setBoundary(error);
    }
  }, []);
  useEffect(() => {
    if (!noAccess) return;
    life.current.generation++;
    busyLock.current = false;
    setBusy(false);
    setBoundary(new Error(AGENDA_ACESSO_NEGADO));
    setEditor(null);
    setPreferences(false);
    setSaved("");
    cleanup.current = qc.cancelQueries({ queryKey: agendaKeys.all(orgId) }).then(() => {
      qc.removeQueries({ queryKey: agendaKeys.all(orgId) });
      qc.removeQueries({ queryKey: ["acoes-operacionais", orgId, "agenda"] });
    });
    requestAnimationFrame(() => feedback.current?.focus());
  }, [noAccess, orgId, qc]);
  useEffect(() => {
    if ((current?.evento.id || actionCurrent?.acao.id) && window.innerWidth < 1280)
      requestAnimationFrame(() => {
        region.current?.scrollIntoView({ block: "start", behavior: "auto" });
        region.current?.focus({ preventScroll: true });
      });
  }, [current?.evento.id, actionCurrent?.acao.id]);
  const continuation = () => {
    const generation = life.current.generation;
    return captureOperationalContinuation(
      qc,
      ["operacao-acesso", orgId, userId],
      () => life.current.active && life.current.generation === generation && !deniedRef.current,
    );
  };
  const focusFeedback = () => requestAnimationFrame(() => feedback.current?.focus());
  function open(id: string) {
    if (document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    setSaved("");
    setCommandError(null);
    onSearch({ evento: id, acao: "" });
  }
  function back() {
    onSearch({ evento: "", acao: "" });
    requestAnimationFrame(() =>
      (opener.current?.isConnected ? opener.current : list.current)?.focus(),
    );
  }
  function edit(next: AgendaEditor) {
    setCommandError(null);
    setSaved("");
    setEditor(next);
  }
  const schedule = (source?: PendenteAgenda, day = date || today) => {
    if (!canCreate) return;
    edit({ tipo: "evento", base: null, day, ...(source ? { source } : {}) });
  };
  async function execute(command: ComandoAgenda) {
    if (busyLock.current || noAccess) return false;
    busyLock.current = true;
    setBusy(true);
    setCommandError(null);
    setSaved("");
    const valid = continuation(),
      capturedEditor = editorRef.current;
    try {
      const receipt = await run({ data: command });
      if (!valid()) return false;
      if (capturedEditor && editorRef.current === capturedEditor) setEditor(null);
      setSaved(
        command.comando === "criar_acao" && !receipt.evento_id
          ? "Ação confirmada no servidor, sem horário reservado."
          : "Alteração confirmada no servidor.",
      );
      if (receipt.evento_id) onSearch({ evento: receipt.evento_id, acao: "" });
      else if (receipt.acao_id) onSearch({ acao: receipt.acao_id, evento: "" });
      await invalidateAgenda(qc, orgId);
      if (!valid()) return true;
      focusFeedback();
      return true;
    } catch (error) {
      if (!valid()) return false;
      deny(error);
      setCommandError(error);
      focusFeedback();
      return false;
    } finally {
      if (valid()) {
        busyLock.current = false;
        setBusy(false);
      }
    }
  }
  const personalCommand = (body: ComandoBody) =>
    execute({ organization_id: orgId, chave: commandKey(body), ...body });
  async function compare(): Promise<DetalheAgenda | undefined> {
    const candidate = editorRef.current;
    if (!candidate || candidate.tipo === "acao" || !candidate.base) return undefined;
    const valid = continuation();
    try {
      const result = await read({
        data: { organization_id: orgId, id: candidate.base.evento.id },
      });
      if (!valid() || editorRef.current !== candidate) return undefined;
      qc.setQueryData(agendaKeys.detail(orgId, result.evento.id), result);
      return result;
    } catch (error) {
      if (!valid() || editorRef.current !== candidate) return undefined;
      deny(error);
      throw error;
    }
  }
  async function recover() {
    await cleanup.current;
    if (!life.current.active) return;
    setBoundary(null);
    setCommandError(null);
    await qc.invalidateQueries({ queryKey: agendaKeys.all(orgId) });
  }
  const calendarItems = useMemo(
    () =>
      rows.isError
        ? []
        : (rows.data?.registros ?? []).map((e) => ({
            id: e.id,
            titulo: e.titulo,
            periodo: periodoEvento(e, zone),
            periodoCurto: periodoCurto(e, zone),
            estado: estadoLabels[e.estado],
            tipo: tipoLabels[e.tipo],
            responsavel: e.responsavel_nome,
            origem:
              e.origem.tipo === "independente"
                ? "Evento independente"
                : e.origem.tipo === "acao"
                  ? "Ação operacional: " + e.origem.titulo
                  : "Levantamento: " + e.origem.titulo,
            origemCurta:
              e.origem.tipo === "acao"
                ? "Ação vinculada"
                : e.origem.tipo === "levantamento"
                  ? "Levantamento vinculado"
                  : "Evento independente",
            diasVisiveis: e.dias_visiveis,
            diaInteiro: e.dia_inteiro,
          })),
    [rows.data, rows.isError, zone],
  );
  const countMap = Object.fromEntries((rows.data?.dias ?? []).map((d) => [d.data, d.total]));
  const visibleDays = windowRange ? daysInWindow(start, end) : [];
  const selected = !!search.evento || !!search.acao;
  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow="Visão geral"
        title="Agenda Equipe"
        description="Pessoas, compromissos e ações conectados ao trabalho."
        actions={
          <>
            {canCreateAction && (
              <ActionButton
                variant="ghost"
                disabled={busy}
                onClick={() => edit({ tipo: "acao", day: date || today })}
              >
                Nova ação
              </ActionButton>
            )}
            {canCreate && (
              <ActionButton disabled={busy} onClick={() => schedule()}>
                <Plus size={16} aria-hidden="true" className="mr-1 inline" />
                Novo evento
              </ActionButton>
            )}
          </>
        }
      />
      <div ref={feedback} tabIndex={-1} className="mb-3 space-y-3 outline-none">
        {noAccess ? (
          <ErrorState error={boundary ?? new Error(AGENDA_ACESSO_NEGADO)} onRetry={recover} />
        ) : null}
        {!noAccess && Boolean(commandError) && <ErrorState error={commandError} />}{" "}
        {!noAccess && saved && (
          <p role="status" className="rounded border border-primary/40 bg-primary/5 p-3 text-sm">
            {saved}
          </p>
        )}
      </div>
      {!noAccess &&
        (configuration.isError ? (
          <ErrorState error={configuration.error} onRetry={() => configuration.refetch()} />
        ) : configuration.isPending ? (
          <LoadingState label="Consultando a agenda autorizada…" />
        ) : !windowRange ? (
          <>
            <Section title="Período da agenda">
              <p role="alert" className="text-sm text-destructive">
                {supportsTimezone(zone)
                  ? "Confira a data usada para consultar a agenda."
                  : `O fuso ${zone} não é suportado neste navegador. Escolha um fuso de exibição compatível; os instantes originais não foram alterados.`}
              </p>
              <TimezoneFilter value={zone} onApply={(fuso) => onSearch({ fuso, pagina: 0 })} />
              <ActionButton
                variant="ghost"
                onClick={() => {
                  onSearch({ fuso: "", data: "", dia: "", pagina: 0 });
                }}
              >
                Restaurar período atual
              </ActionButton>
            </Section>
            {current && (
              <Section title={current.evento.titulo} description="Instantes originais preservados">
                <p className="whitespace-pre-wrap break-words text-sm">
                  {periodoEvento(current.evento)}
                </p>
                <p className="mt-2 text-sm">
                  Escolha um fuso de exibição compatível para consultar o calendário. O fuso
                  original do compromisso permanece {current.evento.timezone}.
                </p>
              </Section>
            )}
          </>
        ) : (
          <>
            {search.foco === "notificacoes" && configuration.data?.jobs && (
              <AgendaJobs jobs={configuration.data.jobs} timezone={zone} />
            )}
            <div
              ref={list}
              tabIndex={-1}
              className={
                (selected ? "hidden xl:block " : "") + "mb-4 min-w-0 space-y-3 outline-none"
              }
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <nav
                  aria-label="Recorte da agenda"
                  className="hidden min-w-0 flex-wrap gap-1 md:flex"
                >
                  {(
                    [
                      ["minha", "Minha agenda"],
                      ["equipe", "Equipe"],
                      ["pendentes", "Pendentes"],
                      ["notificacoes", "Notificações"],
                    ] as const
                  ).map(([f, label]) => (
                    <ActionButton
                      key={f}
                      variant="ghost"
                      aria-pressed={search.foco === f}
                      onClick={() =>
                        onSearch({
                          foco: f,
                          pagina: 0,
                          dia: "",
                          evento: "",
                          acao: "",
                        })
                      }
                    >
                      {f === "notificacoes" && (
                        <Bell size={15} aria-hidden="true" className="mr-1 inline" />
                      )}
                      {label}
                    </ActionButton>
                  ))}
                </nav>
                <label className="min-w-0 flex-1 md:hidden">
                  <span className="sr-only">Recorte da agenda</span>
                  <select
                    className={fieldClass}
                    aria-label="Recorte da agenda"
                    value={search.foco}
                    onChange={(e) =>
                      onSearch({
                        foco: e.target.value as AgendaSearch["foco"],
                        pagina: 0,
                        dia: "",
                        evento: "",
                        acao: "",
                      })
                    }
                  >
                    <option value="minha">Minha agenda</option>
                    <option value="equipe">Equipe</option>
                    <option value="pendentes">Pendentes</option>
                    <option value="notificacoes">Notificações</option>
                  </select>
                </label>
                <ActionButton variant="ghost" onClick={() => setPreferences(true)}>
                  Preferências
                </ActionButton>
              </div>
              <div className="flex min-w-0 flex-wrap items-end gap-2">
                <label
                  className={
                    (search.foco === "minha" || search.foco === "equipe"
                      ? "hidden sm:grid "
                      : "grid ") + "min-w-0 flex-1 basis-48 gap-1 text-xs text-muted-foreground"
                  }
                >
                  Buscar na agenda
                  <input
                    type="search"
                    className={fieldClass}
                    value={search.busca}
                    maxLength={120}
                    onChange={(e) => onSearch({ busca: e.target.value, pagina: 0 })}
                  />
                </label>
                {(search.foco === "minha" || search.foco === "equipe") && (
                  <>
                    <div className="flex shrink-0 items-center gap-1">
                      <ActionButton
                        variant="ghost"
                        aria-label="Período anterior"
                        onClick={() =>
                          onSearch({
                            data:
                              search.vista === "mes"
                                ? addCivilDays(windowRange!.start, -1)
                                : addCivilDays(date, -7),
                            dia: "",
                            pagina: 0,
                          })
                        }
                      >
                        <ChevronLeft size={18} />
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        onClick={() => onSearch({ data: today, dia: "", pagina: 0 })}
                      >
                        Hoje
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        aria-label="Próximo período"
                        onClick={() =>
                          onSearch({
                            data:
                              search.vista === "mes"
                                ? addCivilDays(windowRange!.endExclusive, -1)
                                : addCivilDays(date, 7),
                            dia: "",
                            pagina: 0,
                          })
                        }
                      >
                        <ChevronRight size={18} />
                      </ActionButton>
                    </div>
                    <label className="grid min-w-0 flex-1 basis-32 gap-1 text-xs text-muted-foreground">
                      Data
                      <input
                        className={fieldClass}
                        type="date"
                        value={date}
                        onChange={(e) => onSearch({ data: e.target.value, dia: "", pagina: 0 })}
                      />
                    </label>
                    <label className="grid min-w-0 flex-1 basis-28 gap-1 text-xs text-muted-foreground">
                      Visualização
                      <select
                        className={fieldClass}
                        value={search.vista}
                        onChange={(e) =>
                          onSearch({
                            vista: e.target.value as AgendaSearch["vista"],
                            dia: "",
                            pagina: 0,
                          })
                        }
                      >
                        <option value="semana">Semana</option>
                        <option value="mes">Mês</option>
                        <option value="lista">Lista</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
              {(search.foco === "minha" || search.foco === "equipe") && (
                <details className="rounded border border-border bg-card p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    <ListFilter size={15} aria-hidden="true" className="mr-1 inline" />
                    <span className="sm:hidden">Buscar e filtrar</span>
                    <span className="hidden sm:inline">Filtros</span>
                    {search.estado || search.tipo || search.equipe || search.busca ? " ativos" : ""}
                  </summary>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <label className="grid gap-1 text-sm sm:hidden">
                      Buscar na agenda
                      <input
                        type="search"
                        className={fieldClass}
                        value={search.busca}
                        maxLength={120}
                        onChange={(e) => onSearch({ busca: e.target.value, pagina: 0 })}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Situação
                      <select
                        className={fieldClass}
                        value={search.estado}
                        onChange={(e) =>
                          onSearch({
                            estado: e.target.value as AgendaSearch["estado"],
                            pagina: 0,
                          })
                        }
                      >
                        <option value="">Todas autorizadas</option>
                        {Object.entries(estadoLabels).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Tipo
                      <select
                        className={fieldClass}
                        value={search.tipo}
                        onChange={(e) =>
                          onSearch({
                            tipo: e.target.value as AgendaSearch["tipo"],
                            pagina: 0,
                          })
                        }
                      >
                        <option value="">Todos os tipos</option>
                        {Object.entries(tipoLabels).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <TimezoneFilter
                      value={zone}
                      onApply={(fuso) => onSearch({ fuso, pagina: 0 })}
                    />
                    {access.gerirOperacao && (
                      <AgendaPicker
                        org={orgId}
                        tipo="equipes"
                        label="Equipe"
                        value={search.equipe}
                        onDenied={deny}
                        onChange={(r) => onSearch({ equipe: r?.id ?? "", pagina: 0 })}
                      />
                    )}
                    <div className="self-end">
                      <ActionButton
                        variant="ghost"
                        onClick={() => {
                          onSearch({
                            fuso: "",
                            busca: "",
                            estado: "",
                            tipo: "",
                            equipe: "",
                            pagina: 0,
                            dia: "",
                          });
                        }}
                      >
                        Limpar filtros
                      </ActionButton>
                    </div>
                  </div>
                </details>
              )}
              {search.dia && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3 text-sm">
                  <span>Dia {formatCivil(search.dia)}</span>
                  <ActionButton variant="ghost" onClick={() => onSearch({ dia: "", pagina: 0 })}>
                    Voltar ao período
                  </ActionButton>
                </div>
              )}
            </div>
            <div
              className={
                selected
                  ? "grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]"
                  : "min-w-0"
              }
            >
              <div className={(selected ? "hidden xl:block " : "") + "min-w-0"}>
                {search.foco === "pendentes" ? (
                  <Section
                    title="Atividades sem agendamento"
                    description="Ações sem horário e levantamentos abertos; somente fontes autorizadas sem visita futura confirmada."
                  >
                    {access.gerirOperacao && (
                      <label className="mb-4 flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={search.pendentesEquipe}
                          onChange={(e) =>
                            onSearch({
                              pendentesEquipe: e.target.checked,
                              pagina: 0,
                            })
                          }
                        />
                        Incluir pendências da equipe autorizada
                      </label>
                    )}
                    {pending.isError ? (
                      <ErrorState error={pending.error} onRetry={() => pending.refetch()} />
                    ) : pending.isPending ? (
                      <LoadingState label="Consultando pendências…" />
                    ) : (
                      pending.data && (
                        <>
                          {!pending.data.registros.length ? (
                            <EmptyState
                              title="Nenhuma pendência neste recorte"
                              hint="Uma ação pode ter prazo e responsável sem ocupar o calendário."
                            />
                          ) : (
                            <ul className="space-y-3">
                              {pending.data.registros.map((p) => (
                                <li
                                  key={p.tipo + p.id}
                                  className="rounded border border-border p-3"
                                >
                                  <p className="break-words text-sm font-medium">{p.titulo}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {p.tipo === "acao" ? "Ação" : "Levantamento"} ·{" "}
                                    {p.responsavel_nome} ·{" "}
                                    {p.prazo
                                      ? "Prazo: " + formatCivil(p.prazo)
                                      : "Sem prazo definido"}
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {canCreate && (
                                      <ActionButton variant="ghost" onClick={() => schedule(p)}>
                                        Agendar registro existente
                                      </ActionButton>
                                    )}
                                    <ActionButton
                                      variant="ghost"
                                      onClick={() => {
                                        if (p.tipo === "acao") onSearch({ acao: p.id, evento: "" });
                                        else onOpenLevantamento?.(p.id);
                                      }}
                                    >
                                      Abrir origem
                                    </ActionButton>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                          <AgendaPagination
                            page={search.pagina}
                            total={pending.data.total}
                            size={pending.data.limite}
                            onPage={(pagina) => onSearch({ pagina })}
                          />
                        </>
                      )
                    )}
                  </Section>
                ) : search.foco === "notificacoes" ? (
                  <Section
                    title="Notificações internas"
                    description="Atribuições, alterações e lembretes com acesso atual à origem."
                  >
                    {notifications.isError ? (
                      <ErrorState
                        error={notifications.error}
                        onRetry={() => notifications.refetch()}
                      />
                    ) : notifications.isPending ? (
                      <LoadingState label="Consultando notificações…" />
                    ) : (
                      notifications.data && (
                        <>
                          <p className="mb-3 text-sm">{notifications.data.nao_lidas} não lidas</p>
                          <ul className="space-y-3">
                            {notifications.data.registros.map((n) => (
                              <li key={n.id} className="rounded border border-border p-3">
                                <p className="break-words text-sm font-medium">{n.evento.titulo}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {n.tipo} · {formatInstant(n.created_at, zone)}
                                </p>
                                <p className="mt-1 text-xs">{periodoEvento(n.evento, zone)}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <ActionButton variant="ghost" onClick={() => open(n.evento.id)}>
                                    Abrir compromisso
                                  </ActionButton>
                                  {!n.lida_em && (
                                    <ActionButton
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() =>
                                        personalCommand({
                                          comando: "marcar_lida",
                                          dados: { notificacao_id: n.id },
                                        })
                                      }
                                    >
                                      Marcar como lida
                                    </ActionButton>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                          {!notifications.data.registros.length && (
                            <p className="text-sm text-muted-foreground">
                              Nenhuma notificação neste recorte.
                            </p>
                          )}
                          <AgendaPagination
                            page={search.pagina}
                            total={notifications.data.total}
                            size={notifications.data.limite}
                            onPage={(pagina) => onSearch({ pagina })}
                          />
                        </>
                      )
                    )}
                  </Section>
                ) : rows.isError ? (
                  <ErrorState error={rows.error} onRetry={() => rows.refetch()} />
                ) : rows.isPending ? (
                  <LoadingState label="Consultando compromissos…" />
                ) : (
                  rows.data && (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <p>
                          {formatCivil(start)} a {formatCivil(addCivilDays(end, -1))} ·{" "}
                          {rows.data.total} compromissos
                        </p>
                        {!configuration.data?.minha_pessoa_id && search.foco === "minha" && (
                          <p className="text-xs text-muted-foreground">
                            Seu usuário ainda não possui vínculo com uma pessoa operacional.
                          </p>
                        )}
                      </div>
                      <AgendaCalendar
                        view={selected ? "lista" : search.vista}
                        days={visibleDays}
                        items={calendarItems}
                        dayCounts={countMap}
                        selectedDay={search.dia || date}
                        today={today}
                        timezone={zone}
                        onOpen={open}
                        onDay={(day) => onSearch({ dia: day, data: day, pagina: 0 })}
                        {...(canCreate
                          ? {
                              onCreate: (day: string) => schedule(undefined, day),
                            }
                          : {})}
                      />
                      <AgendaPagination
                        page={search.pagina}
                        total={rows.data.total}
                        size={rows.data.limite}
                        onPage={(pagina) => onSearch({ pagina })}
                      />
                    </>
                  )
                )}
              </div>
              {selected && (
                <div
                  ref={region}
                  tabIndex={-1}
                  role="region"
                  aria-label="Detalhes da atividade"
                  className="min-w-0 outline-none"
                >
                  {search.evento ? (
                    detail.isError ? (
                      <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
                    ) : detail.isPending ? (
                      <LoadingState label="Consultando compromisso…" />
                    ) : (
                      current && (
                        <AgendaDetail
                          key={current.evento.id}
                          org={orgId}
                          detail={current}
                          busy={busy}
                          onEdit={edit}
                          onCommand={personalCommand}
                          onDenied={deny}
                          canRetryNotifications={
                            !configuration.isError && !!configuration.data?.jobs
                          }
                          onBack={back}
                          onOpenSource={() => {
                            const source = current.evento.origem;
                            if (source.id && source.tipo === "acao")
                              onSearch({ acao: source.id, evento: "" });
                            else if (source.id && source.tipo === "levantamento")
                              onOpenLevantamento?.(source.id);
                          }}
                        />
                      )
                    )
                  ) : action.isError ? (
                    <ErrorState error={action.error} onRetry={() => action.refetch()} />
                  ) : action.isPending ? (
                    <LoadingState label="Consultando ação…" />
                  ) : (
                    actionCurrent && (
                      <AgendaActionPanel
                        key={actionCurrent.acao.id}
                        org={orgId}
                        data={actionCurrent}
                        busy={busy}
                        onBack={back}
                        onSchedule={schedule}
                        onCommand={personalCommand}
                      />
                    )
                  )}
                  <div className="mt-3 xl:hidden">
                    <ActionButton variant="ghost" onClick={back}>
                      Voltar à agenda
                    </ActionButton>
                  </div>
                </div>
              )}
            </div>
          </>
        ))}
      {!noAccess && editor && (
        <AgendaForm
          org={orgId}
          timezone={zone}
          editor={editor}
          busy={busy}
          error={commandError}
          execute={execute}
          onClose={() => setEditor(null)}
          onDenied={deny}
          onCompare={compare}
        />
      )}
      {!noAccess && preferences && configuration.data && (
        <AgendaPreferences
          initial={configuration.data.preferencias}
          busy={busy}
          onClose={() => setPreferences(false)}
          onCommand={personalCommand}
        />
      )}
    </div>
  );
}
function AgendaPagination({
  page,
  total,
  size,
  onPage,
}: {
  page: number;
  total: number;
  size: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
      <span>
        {total} registros · Página {page + 1}
      </span>
      <div className="flex gap-2">
        <ActionButton variant="ghost" disabled={!page} onClick={() => onPage(page - 1)}>
          Anterior
        </ActionButton>
        <ActionButton
          variant="ghost"
          disabled={(page + 1) * size >= total}
          onClick={() => onPage(page + 1)}
        >
          Próxima
        </ActionButton>
      </div>
    </div>
  );
}
