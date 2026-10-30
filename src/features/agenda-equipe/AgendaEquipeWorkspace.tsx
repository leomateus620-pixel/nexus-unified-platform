import * as Dialog from "@radix-ui/react-dialog";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Section,
} from "@/components/nexus/Page";
import { useCommandKey } from "@/features/operacao/components";
import type { OperationalAccess } from "@/features/operacao/access";
import { captureOperationalContinuation } from "@/features/operacao/continuation";
import { AgendaCalendar } from "./AgendaCalendar";
import { AgendaDetail } from "./AgendaDetail";
import { AgendaActionPanel } from "./AgendaActionPanel";
import { AgendaForm, type AgendaEditor } from "./AgendaForms";
import { AgendaPendingCard } from "./AgendaPendingCard";
import { AgendaAppearanceProvider, useAgendaAppearance } from "./AgendaAppearance";
import { AgendaToolbar } from "./AgendaToolbar";
import "./agenda-workspace.css";
const AgendaDashboard = lazy(() => import("./AgendaDashboard"));
import { AgendaJobs } from "./AgendaJobs";

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
    <AgendaAppearanceProvider
      key={props.orgId + ":" + props.userId}
      storageKey={"nexus.agenda.appearance." + props.orgId + ":" + props.userId}
    >
      <AgendaContent
        key={props.orgId + ":" + props.userId + ":" + JSON.stringify(props.access)}
        {...props}
      />
    </AgendaAppearanceProvider>
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
  const { theme } = useAgendaAppearance();
  const qc = useQueryClient(),
    run = useServerFn(executarAgenda),
    read = useServerFn(obterEventoAgenda),
    commandKey = useCommandKey();
  const [editor, setEditor] = useState<AgendaEditor | null>(null),
    [busy, setBusy] = useState(false),
    [commandError, setCommandError] = useState<unknown>(null),
    [boundary, setBoundary] = useState<unknown>(null),
    [saved, setSaved] = useState(""),
    [dashboardReturn, setDashboardReturn] = useState<AgendaSearch | null>(null);
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
  const configuration = useAgendaConfiguration(orgId, userId, !boundary);
  const zone = "America/Sao_Paulo";
  const dashboard = search.painel === "dashboard";
  const teamScope =
    search.foco === "equipe" ||
    (search.foco !== "minha" && search.pendentesEquipe) ||
    (!configuration.data?.minha_pessoa_id && access.gerirOperacao);
  const listScroll = useRef(0),
    agendaReturn = useRef<AgendaSearch | null>(null);
  const toolbarSearch = (patch: Partial<AgendaSearch>) => {
    if (patch.painel === "dashboard") {
      agendaReturn.current = search;
      onSearch({
        ...patch,
        foco: teamScope ? "equipe" : "minha",
        data: today,
        inicio: "",
        fim: "",
        dia: "",
      });
    } else if (patch.painel === "agenda" && agendaReturn.current) onSearch(agendaReturn.current);
    else onSearch(patch);
  };
  let today = "",
    date = "",
    windowRange: { start: string; endExclusive: string; month: number } | null = null;
  try {
    today = configuration.data ? civilInZone(configuration.data.server_now, zone) : "";
    date = search.data ? (civilDate(search.data), search.data) : today;
    if (date) {
      if (dashboard) {
        const first = date.slice(0, 8) + "01",
          next = civilDate(first);
        next.setUTCMonth(next.getUTCMonth() + 1);
        windowRange = {
          start: first,
          endExclusive: next.toISOString().slice(0, 10),
          month: next.getUTCMonth(),
        };
      } else windowRange = calendarWindow(date, search.vista);
      if (search.inicio && search.fim)
        windowRange = { ...windowRange, start: search.inicio, endExclusive: search.fim };
      daysInWindow(windowRange.start, windowRange.endExclusive);
    }
  } catch {
    windowRange = null;
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
      minha: !teamScope,
      busca: search.busca,
      pessoa_id: search.pessoa || null,
      cliente_id: search.cliente || null,
      projeto_id: search.projeto || null,
      natureza: search.natureza || null,
      hora: search.hora >= 0 ? search.hora : null,
      demanda: search.demanda,
      estado: search.estado || null,
      tipo: search.tipo || null,
      equipe_id: search.equipe || null,
      pagina: search.pagina,
    },
    !!configuration.data &&
      !configuration.isError &&
      !boundary &&
      !!windowRange &&
      !dashboard &&
      (search.foco === "minha" || search.foco === "equipe"),
  );
  const detail = useAgendaDetail(orgId, search.evento || null, !boundary),
    action = useAgendaAction(orgId, search.acao || null, !boundary);
  const pending = useAgendaPending(
    {
      organization_id: orgId,
      minhas: !search.pendentesEquipe && !teamScope,
      busca: search.busca,
      pessoa_id: search.pessoa || null,
      cliente_id: search.cliente || null,
      projeto_id: search.projeto || null,
      natureza: search.natureza || null,
      tipo: search.tipo || null,
      estado: search.estado || null,
      equipe_id: search.equipe || null,
      hora: search.hora >= 0 ? search.hora : null,
      demanda: search.demanda,
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
    setSaved("");
    cleanup.current = qc.cancelQueries({ queryKey: agendaKeys.all(orgId) }).then(() => {
      qc.removeQueries({ queryKey: agendaKeys.all(orgId) });
      qc.removeQueries({ queryKey: ["acoes-operacionais", orgId, "agenda"] });
    });
    requestAnimationFrame(() => feedback.current?.focus());
  }, [noAccess, orgId, qc]);
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
    listScroll.current = window.scrollY;
    setSaved("");
    setCommandError(null);
    onSearch({ evento: id, acao: "" });
  }
  function back() {
    onSearch({ evento: "", acao: "" });
    requestAnimationFrame(() => {
      (opener.current?.isConnected ? opener.current : list.current)?.focus({ preventScroll: true });
      window.scrollTo({ top: listScroll.current });
    });
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
            estado:
              e.estado === "rascunho" || e.estado === "publicado"
                ? "Pendente"
                : estadoLabels[e.estado],
            estadoCanonico: e.estado,
            tipo: tipoLabels[e.tipo],
            responsavel: e.responsavel_nome,
            origem:
              e.origem.tipo === "acao"
                ? "Ação vinculada"
                : e.origem.tipo === "levantamento"
                  ? "Levantamento vinculado"
                  : "Evento",
            origemCurta: e.origem.tipo === "acao" ? "Ação" : "Evento",
            diasVisiveis: e.dias_visiveis,
            diaInteiro: e.dia_inteiro,
            inicio: e.inicio,
            fim: e.fim,
            dataInicio: e.data_inicio,
            dataFim: e.data_fim,
            descricao: e.descricao,
            local: e.local,
            cliente: e.cliente_nome,
            projeto: e.projeto_nome ?? null,
            pessoas: e.pessoas,
          })),
    [rows.data, rows.isError, zone],
  );
  const countMap = Object.fromEntries((rows.data?.dias ?? []).map((d) => [d.data, d.total]));
  const visibleDays = windowRange ? daysInWindow(start, end) : [];
  const selected = !!search.evento || !!search.acao;
  return (
    <div className="agenda-workspace agenda-page min-w-0" data-theme={theme}>
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
          <ErrorState
            error={new Error("Confira as datas do período da agenda.")}
            onRetry={() => onSearch({ data: "", inicio: "", fim: "", dia: "", pagina: 0 })}
          />
        ) : (
          <>
            {search.foco === "notificacoes" && configuration.data?.jobs && (
              <AgendaJobs jobs={configuration.data.jobs} timezone={zone} />
            )}
            <div ref={list} tabIndex={-1} className="min-w-0 outline-none">
              <AgendaToolbar
                org={orgId}
                search={
                  teamScope && search.foco === "minha" ? { ...search, foco: "equipe" } : search
                }
                date={date}
                today={today}
                start={start}
                end={end}
                busy={busy}
                canCreate={canCreate || canCreateAction}
                canTeam={access.gerirOperacao}
                onDenied={deny}
                onSearch={toolbarSearch}
                onCreate={() =>
                  canCreate ? schedule() : edit({ tipo: "acao", day: date || today })
                }
              />
              {!configuration.data?.minha_pessoa_id && (
                <p className="agenda-context-note">
                  {access.gerirOperacao
                    ? "Exibindo a equipe. Vincule seu usuário a uma pessoa em Equipe para usar Minha agenda."
                    : "Vincule seu usuário a uma pessoa em Equipe para consultar sua agenda."}
                </p>
              )}
              {dashboardReturn && !dashboard && (
                <ActionButton
                  variant="ghost"
                  className="mb-4"
                  onClick={() => {
                    onSearch(dashboardReturn);
                    setDashboardReturn(null);
                  }}
                >
                  Voltar à Dashboard
                </ActionButton>
              )}
              {search.dia && !dashboard && (
                <div className="agenda-drilldown">
                  <span>{formatCivil(search.dia, { day: "numeric", month: "long" })}</span>
                  <button type="button" onClick={() => onSearch({ dia: "", pagina: 0 })}>
                    Voltar ao período
                  </button>
                </div>
              )}
            </div>
            {dashboard && !selected ? (
              <Suspense fallback={<LoadingState label="Carregando Dashboard…" />}>
                <AgendaDashboard
                  input={{
                    organization_id: orgId,
                    inicio: windowRange.start,
                    fim: windowRange.endExclusive,
                    minha: !teamScope,
                    busca: search.busca,
                    estado: search.estado || null,
                    tipo: search.tipo || null,
                    equipe_id: search.equipe || null,
                    pessoa_id: search.pessoa || null,
                    cliente_id: search.cliente || null,
                    projeto_id: search.projeto || null,
                    natureza: search.natureza || null,
                    hora: search.hora >= 0 ? search.hora : null,
                  }}
                  onDenied={deny}
                  onDrilldown={(patch) => {
                    setDashboardReturn(search);
                    onSearch({
                      painel: "agenda",
                      foco: teamScope ? "equipe" : "minha",
                      vista: "lista",
                      inicio: windowRange.start,
                      fim: windowRange.endExclusive,
                      demanda: true,
                      pagina: 0,
                      ...patch,
                    });
                  }}
                />
              </Suspense>
            ) : (
              <div className="min-w-0">
                <div className="min-w-0">
                  {search.foco === "pendentes" ? (
                    <Section
                      title="Atividades sem agendamento"
                      description="Ações operacionais ainda sem horário reservado."
                    >
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
                                  <li key={p.tipo + p.id}>
                                    <AgendaPendingCard
                                      item={p}
                                      onOpen={() =>
                                        p.tipo === "acao"
                                          ? onSearch({ acao: p.id, evento: "" })
                                          : onOpenLevantamento?.(p.id)
                                      }
                                      onSchedule={canCreate ? () => schedule(p) : undefined}
                                    />
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
                                  <p className="break-words text-sm font-medium">
                                    {n.evento.titulo}
                                  </p>
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
                        <p className="agenda-results-count">
                          {rows.data.total} {rows.data.total === 1 ? "compromisso" : "compromissos"}
                        </p>
                        <AgendaCalendar
                          view={search.vista}
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
                  <Dialog.Root
                    open
                    onOpenChange={(open) => {
                      if (!open && !editor) back();
                    }}
                  >
                    <Dialog.Portal>
                      <Dialog.Overlay className="agenda-dialog-overlay agenda-detail-overlay" />
                      <Dialog.Content
                        ref={region}
                        tabIndex={-1}
                        className="agenda-workspace agenda-detail-dialog"
                        data-theme={theme}
                        aria-describedby={undefined}
                        onOpenAutoFocus={(event) => {
                          event.preventDefault();
                          region.current?.focus({ preventScroll: true });
                        }}
                        onCloseAutoFocus={(event) => {
                          event.preventDefault();
                          (opener.current?.isConnected ? opener.current : list.current)?.focus({
                            preventScroll: true,
                          });
                        }}
                      >
                        <Dialog.Title className="sr-only">Detalhes da atividade</Dialog.Title>
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
                        <div className="mt-3">
                          <ActionButton variant="ghost" onClick={back}>
                            Voltar à agenda
                          </ActionButton>
                        </div>
                      </Dialog.Content>
                    </Dialog.Portal>
                  </Dialog.Root>
                )}
              </div>
            )}
          </>
        ))}
      {!noAccess && editor && (
        <AgendaForm
          org={orgId}
          timezone={zone}
          currentPerson={
            configuration.data?.minha_pessoa_id
              ? {
                  id: configuration.data.minha_pessoa_id,
                  nome: configuration.data.minha_pessoa_nome || "Você",
                }
              : undefined
          }
          canCreateEvent={canCreate}
          canCreateAction={canCreateAction}
          editor={editor}
          busy={busy}
          error={commandError}
          execute={execute}
          onClose={() => setEditor(null)}
          onDenied={deny}
          onCompare={compare}
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
  if (total <= size) return null;
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
