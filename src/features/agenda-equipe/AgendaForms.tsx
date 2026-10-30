import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ActionButton, ErrorState } from "@/components/nexus/Page";
import { fieldClass, OperationalDialog, useCommandKey } from "@/features/operacao/components";
import { AgendaEventFields, type AgendaLabels } from "./AgendaEventFields";
import { useAgendaAppearance } from "./AgendaAppearance";
import { RecurrenceFields } from "./RecurrenceFields";
import { agendaErrorMap, comandoInput } from "./schemas";
import { eventForSave, inputFromDetail, periodoEvento } from "./domain";
import { addCivilDays, civilDate, civilInZone } from "./calendar-domain";
import type {
  ComandoAgenda,
  ComandoBody,
  DetalheAgenda,
  EventoInput,
  PendenteAgenda,
  RegraSerie,
} from "./types";
export type AgendaEditor =
  | {
      tipo: "evento";
      base: DetalheAgenda | null;
      day: string;
      source?: PendenteAgenda | undefined;
    }
  | { tipo: "acao"; day: string }
  | {
      tipo: "comando";
      comando:
        | "publicar"
        | "iniciar"
        | "concluir"
        | "cancelar"
        | "criar_serie"
        | "editar_serie"
        | "cancelar_serie";
      base: DetalheAgenda;
    };
export type AgendaFormProps = {
  org: string;
  timezone: string;
  editor: AgendaEditor;
  busy: boolean;
  error: unknown;
  execute: (command: ComandoAgenda) => Promise<boolean>;
  onClose: () => void;
  onDenied: (error: unknown) => void;
  onCompare: () => Promise<DetalheAgenda | undefined>;
  currentPerson?: { id: string; nome: string } | undefined;
  canCreateEvent?: boolean;
  canCreateAction?: boolean;
};
const defaultRule: RegraSerie = {
  frequencia: "semanal",
  intervalo: 1,
  dias_semana: [1],
  dia_mes: 1,
  termina_em: null,
  quantidade: 10,
  politica_mes: "pular",
  hora_ambigua: "posterior",
  hora_inexistente: "pular",
};
function blankEvent(
  day: string,
  source?: PendenteAgenda,
  person?: { id: string; nome: string },
): EventoInput {
  return {
    titulo: source?.titulo ?? "",
    descricao: "",
    tipo: source?.tipo === "levantamento" ? "levantamento" : "sem_categoria",
    timezone: "America/Sao_Paulo",
    dia_inteiro: false,
    inicio_local: day ? day + "T08:00" : "",
    fim_local: day ? day + "T09:00" : "",
    local: source?.local ?? "",
    responsavel_id: source?.responsavel_id ?? person?.id ?? "",
    acao_id: source?.tipo === "acao" ? source.id : null,
    levantamento_id: source?.tipo === "levantamento" ? source.id : null,
    bloqueia_recursos: true,
    participantes: source
      ? [
          { pessoa_id: source.responsavel_id, funcao: "responsavel" },
          ...(source.pessoas ?? [])
            .filter((p) => p.pessoa_id !== source.responsavel_id)
            .map((p) => ({ pessoa_id: p.pessoa_id, funcao: "participante" as const })),
        ]
      : person
        ? [{ pessoa_id: person.id, funcao: "responsavel" }]
        : [],
    competencias: [],
    equipes: [],
    ferramentas: [],
    cliente_id: source?.cliente_id ?? null,
    unidade_id: source?.unidade_id ?? null,
    projeto_id: source?.projeto_id ?? null,
    visibilidade: "participantes",
  };
}
function labelsFromDetail(detail: DetalheAgenda | null): AgendaLabels {
  if (!detail) return {};
  const e = detail.evento;
  return Object.fromEntries([
    [e.responsavel_id, e.responsavel_nome],
    ...(e.cliente_id ? [[e.cliente_id, e.cliente_nome ?? "Cliente vinculado"]] : []),
    ...(e.unidade_id ? [[e.unidade_id, e.unidade_nome ?? "Unidade vinculada"]] : []),
    ...(e.projeto_id ? [[e.projeto_id, e.projeto_nome ?? "Projeto vinculado"]] : []),
    ...detail.participantes.map((p) => [p.pessoa_id, p.pessoa_nome]),
    ...detail.competencias.map((c) => [c.competencia_id, c.nome]),
    ...detail.ferramentas.map((t) => [t.ferramenta_id, t.patrimonio + " · " + t.descricao]),
  ]);
}
export function AgendaForm(props: AgendaFormProps) {
  return (
    <AgendaFormContent
      key={
        props.editor.tipo === "comando"
          ? props.editor.comando + props.editor.base.evento.id
          : props.editor.tipo +
            (props.editor.tipo === "evento" ? (props.editor.base?.evento.id ?? "novo") : "nova")
      }
      {...props}
    />
  );
}
function AgendaFormContent({
  org,
  timezone: _timezone,
  editor,
  busy,
  error,
  execute,
  onClose,
  onDenied,
  onCompare,
  currentPerson,
  canCreateEvent = true,
  canCreateAction = true,
}: AgendaFormProps) {
  const { theme } = useAgendaAppearance();
  const [base, setBase] = useState(editor.tipo === "acao" ? null : editor.base),
    [value, setValue] = useState<EventoInput>(() =>
      editor.tipo !== "acao" && editor.base
        ? inputFromDetail(editor.base)
        : blankEvent(
            editor.tipo === "comando" ? "" : editor.day,
            editor.tipo === "evento" ? editor.source : undefined,
            currentPerson,
          ),
    );
  const [labels, setLabels] = useState<AgendaLabels>(() => ({
    ...(currentPerson ? { [currentPerson.id]: currentPerson.nome || "Você" } : {}),
    ...labelsFromDetail(editor.tipo === "acao" ? null : editor.base),
    ...(editor.tipo === "evento" && editor.source
      ? {
          [editor.source.responsavel_id]: editor.source.responsavel_nome,
          [editor.source.id]: editor.source.titulo,
          ...(editor.source.cliente_id && editor.source.cliente_nome
            ? { [editor.source.cliente_id]: editor.source.cliente_nome }
            : {}),
          ...(editor.source.projeto_id && editor.source.projeto_nome
            ? { [editor.source.projeto_id]: editor.source.projeto_nome }
            : {}),
          ...Object.fromEntries((editor.source.pessoas ?? []).map((p) => [p.pessoa_id, p.nome])),
        }
      : {}),
  }));
  const [mode, setMode] = useState<"evento" | "acao">(() =>
    editor.tipo === "acao" || value.acao_id ? "acao" : "evento",
  );
  const [action, setAction] = useState({
    prazo: null as string | null,
    prioridade: "normal" as "baixa" | "normal" | "alta" | "critica",
    exige_verificacao: true,
  });
  const [schedule, setSchedule] = useState(false),
    [rule, setRule] = useState(() =>
      editor.tipo === "comando" && editor.base.serie
        ? editor.base.serie.regra
        : (() => {
            const day = base
              ? (base.evento.data_inicio ?? civilInZone(base.evento.inicio, base.evento.timezone))
              : editor.tipo === "comando"
                ? ""
                : editor.day;
            try {
              const parsed = civilDate(day);
              return {
                ...defaultRule,
                dias_semana: [parsed.getUTCDay() || 7],
                dia_mes: parsed.getUTCDate(),
              };
            } catch {
              return defaultRule;
            }
          })(),
    ),
    [scope, setScope] = useState<"esta_e_futuras" | "todas_futuras">("esta_e_futuras"),
    [motivo, setMotivo] = useState(""),
    [issues, setIssues] = useState<Record<string, string>>({}),
    [localError, setLocalError] = useState(""),
    [comparison, setComparison] = useState<DetalheAgenda | null>(null),
    [comparing, setComparing] = useState(false),
    [comparisonError, setComparisonError] = useState<unknown>(null),
    [epoch, setEpoch] = useState(0);
  const form = useRef<HTMLFormElement>(null),
    summary = useRef<HTMLDivElement>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const uid = useId(),
    key = useCommandKey();
  const initial = useRef(JSON.stringify({ value, action, schedule, rule, scope, motivo }));
  const dirty =
    JSON.stringify({ value, action, schedule, rule, scope, motivo }) !== initial.current;
  const command = editor.tipo === "comando" ? editor.comando : null;
  const titles = {
    publicar: "Publicar compromisso",
    iniciar: "Iniciar atividade",
    concluir: "Concluir evento",
    cancelar: "Cancelar compromisso",
    criar_serie: "Repetir compromisso",
    editar_serie: "Alterar compromissos futuros",
    cancelar_serie: "Cancelar compromissos futuros",
  };
  const title = command
    ? titles[command]
    : base
      ? "Editar compromisso"
      : mode === "acao"
        ? "Nova ação"
        : "Novo evento";
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setLocalError("");
    setIssues({});
    let body: ComandoBody;
    if (!base && !command && mode === "acao" && !(editor.tipo === "evento" && editor.source))
      body = {
        comando: "criar_acao",
        dados: {
          acao: {
            ...action,
            titulo: value.titulo,
            descricao: value.descricao,
            responsavel_id: value.responsavel_id,
            participantes: value.participantes,
            cliente_id: value.cliente_id,
            projeto_id: value.projeto_id,
            unidade_id: value.unidade_id,
            local: value.local,
          },
          ...(schedule ? { evento: value } : {}),
        },
      };
    else if (command && base) {
      const e = base.evento;
      if (command === "criar_serie")
        body = {
          comando: command,
          dados: { evento_id: e.id, expected_version: e.version, regra: rule },
        };
      else if (command === "editar_serie" && base.serie)
        body = {
          comando: command,
          dados: {
            serie_id: base.serie.id,
            expected_version: base.serie.version,
            escopo: scope,
            evento_id: e.id,
            evento: eventForSave(value, base),
            regra: rule,
            motivo,
          },
        };
      else if (command === "cancelar_serie" && base.serie)
        body = {
          comando: command,
          dados: {
            serie_id: base.serie.id,
            expected_version: base.serie.version,
            escopo: scope,
            evento_id: e.id,
            motivo,
          },
        };
      else if (command === "cancelar")
        body = {
          comando: command,
          dados: { evento_id: e.id, expected_version: e.version, motivo },
        };
      else if (command === "publicar" || command === "iniciar" || command === "concluir")
        body = {
          comando: command,
          dados: { evento_id: e.id, expected_version: e.version },
        };
      else {
        setLocalError("A série atual não foi confirmada. Reabra a ficha antes de continuar.");
        return;
      }
    } else
      body = {
        comando: base ? "salvar_evento" : "agendar",
        dados: {
          ...(base
            ? {
                evento_id: base.evento.id,
                expected_version: base.evento.version,
              }
            : {}),
          evento: eventForSave(value, base),
        },
      };
    const data = { organization_id: org, chave: key(body), ...body },
      p = comandoInput.safeParse(data, { errorMap: agendaErrorMap });
    if (!p.success) {
      const map: Record<string, string> = {};
      for (const issue of p.error.issues) {
        const field = String(issue.path.at(-1) ?? "formulario");
        map[field] ??= issue.message;
      }
      setIssues(map);
      setLocalError("Revise os campos indicados. Nenhuma alteração foi enviada.");
      requestAnimationFrame(() => {
        summary.current?.focus();
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    const ok = await execute(p.data);
    if (!ok && mounted.current) {
      setLocalError(
        "O servidor não confirmou a alteração. Seu preenchimento foi preservado; confira o erro e tente novamente.",
      );
      requestAnimationFrame(() => summary.current?.focus());
    }
  }
  async function compare() {
    setComparing(true);
    setComparisonError(null);
    try {
      const next = await onCompare();
      if (next) setComparison(next);
    } catch (e) {
      setComparisonError(e);
    } finally {
      setComparing(false);
    }
  }
  const showEvent = !command || command === "editar_serie";
  const isNew = !base && !command && !(editor.tipo === "evento" && editor.source);
  const showRule = command === "criar_serie" || command === "editar_serie";
  return (
    <OperationalDialog
      title={title}
      open
      onOpenChange={(open) => {
        if (!open) {
          mounted.current = false;
          onClose();
        }
      }}
    >
      <form
        ref={form}
        onSubmit={submit}
        data-dirty={dirty ? "true" : "false"}
        aria-busy={busy}
        noValidate
        className="agenda-composer grid min-w-0 gap-5"
        data-agenda-theme={theme}
      >
        {Boolean(localError || error) && (
          <div
            ref={summary}
            role="alert"
            tabIndex={-1}
            className="space-y-2 rounded-md border border-destructive/50 p-3 text-sm text-destructive"
          >
            <p>{error instanceof Error ? error.message : localError}</p>
            {localError && error instanceof Error && <p>{localError}</p>}
            {Object.values(issues).length > 0 && (
              <ul className="list-disc pl-5">
                {[...new Set(Object.values(issues))].map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {base && (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
            <p className="break-words font-medium">{base.evento.titulo}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {periodoEvento(base.evento)} · Versão {base.evento.version}
            </p>
            {base.evento.serie_id && editor.tipo === "evento" && (
              <p className="mt-2 text-xs">
                Esta edição altera somente esta ocorrência e registra uma exceção na série.
              </p>
            )}
          </div>
        )}
        {isNew && (
          <div role="group" aria-label="Natureza do compromisso" className="agenda-mode-switch">
            <button
              type="button"
              aria-pressed={mode === "evento"}
              disabled={busy || !canCreateEvent}
              onClick={() => setMode("evento")}
            >
              Evento
            </button>
            <button
              type="button"
              aria-pressed={mode === "acao"}
              disabled={busy || !canCreateAction}
              onClick={() => setMode("acao")}
            >
              Ação
            </button>
          </div>
        )}
        {showEvent && (
          <AgendaEventFields
            key={epoch}
            org={org}
            value={value}
            onChange={setValue}
            labels={labels}
            onLabel={(id, name) => setLabels((l) => ({ ...l, [id]: name }))}
            onDenied={onDenied}
            originLocked={!!base || (editor.tipo === "evento" && !!editor.source)}
            errors={issues}
            action={mode === "acao"}
            scheduled={!isNew || mode === "evento" || schedule}
            onScheduledChange={isNew && mode === "acao" ? setSchedule : undefined}
            deadline={action.prazo || ""}
            onDeadlineChange={
              isNew && mode === "acao"
                ? (prazo) => setAction((v) => ({ ...v, prazo: prazo || null }))
                : undefined
            }
          />
        )}
        {(command === "cancelar_serie" || command === "editar_serie") && (
          <fieldset className="grid gap-3 rounded border border-border p-3">
            <legend className="px-1 text-sm font-medium">Alcance da alteração</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={uid + "-scope"}
                checked={scope === "esta_e_futuras"}
                onChange={() => setScope("esta_e_futuras")}
              />
              Esta e as futuras
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={uid + "-scope"}
                checked={scope === "todas_futuras"}
                onChange={() => setScope("todas_futuras")}
              />
              Toda a série futura
            </label>
            <p className="text-xs text-muted-foreground">
              Ocorrências realizadas, iniciadas, passadas e exceções individuais serão preservadas.
            </p>
          </fieldset>
        )}
        {showRule && <RecurrenceFields value={rule} onChange={setRule} />}
        {(command === "cancelar" || command === "editar_serie" || command === "cancelar_serie") && (
          <div>
            <label className="grid gap-1 text-sm">
              Motivo *
              <textarea
                className={fieldClass + " min-h-24"}
                value={motivo}
                minLength={5}
                maxLength={2000}
                onChange={(e) => setMotivo(e.target.value)}
                aria-invalid={!!issues["motivo"]}
                aria-describedby={issues["motivo"] ? uid + "-motivo" : undefined}
              />
            </label>
            {issues["motivo"] && (
              <p id={uid + "-motivo"} className="text-sm text-destructive">
                {issues["motivo"]}
              </p>
            )}
          </div>
        )}
        {command === "publicar" && (
          <p className="text-sm">
            Publicar confirma as reservas de pessoas e ferramentas após conferir conflitos,
            disponibilidade e qualificações para o período.
          </p>
        )}
        {command === "iniciar" && (
          <p className="text-sm">
            O início revalida acesso, disponibilidade e qualificações atuais. Pendências impedem
            iniciar e permanecem disponíveis na ficha.
          </p>
        )}
        {command === "concluir" && (
          <p className="text-sm">
            Esta ação conclui somente o evento. A execução e a verificação da ação ou do
            levantamento são feitas na origem. Ferramentas retiradas continuam sob custódia até a
            devolução.
          </p>
        )}
        {base && (
          <div className="space-y-3 rounded border border-border p-3">
            <ActionButton variant="ghost" loading={comparing} disabled={busy} onClick={compare}>
              Comparar versão atual
            </ActionButton>
            {Boolean(comparisonError) && <ErrorState error={comparisonError} onRetry={compare} />}{" "}
            {comparison && (
              <div className="grid gap-2 text-sm">
                <p>
                  Versão aberta: {base.evento.version}. Versão atual: {comparison.evento.version}.
                </p>
                <p>
                  {comparison.evento.titulo} · {periodoEvento(comparison.evento)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Seu preenchimento ainda está preservado. Usar a versão atual substituirá os campos
                  deste formulário.
                </p>
                <ActionButton
                  variant="ghost"
                  onClick={() => {
                    setBase(comparison);
                    setValue(inputFromDetail(comparison));
                    setLabels(labelsFromDetail(comparison));
                    setRule(comparison.serie?.regra ?? defaultRule);
                    setEpoch((e) => e + 1);
                    setComparison(null);
                    setIssues({});
                    setLocalError("");
                  }}
                >
                  Usar versão atual e substituir preenchimento
                </ActionButton>
              </div>
            )}
          </div>
        )}
        <div className="agenda-composer-footer flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Dialog.Close asChild>
            <ActionButton variant="ghost" disabled={busy}>
              Voltar
            </ActionButton>
          </Dialog.Close>
          <ActionButton type="submit" loading={busy}>
            {command
              ? titles[command]
              : base
                ? "Salvar alterações"
                : mode === "acao" && !schedule && isNew
                  ? "Criar ação"
                  : "Agendar"}
          </ActionButton>
        </div>
      </form>
    </OperationalDialog>
  );
}
