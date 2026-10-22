import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import {
  OperationalDialog,
  Pagination,
  fieldClass,
  useCommandKey,
} from "@/features/operacao/components";
import { executarIndisponibilidade, listarIndisponibilidades } from "./functions";
import { DISPONIBILIDADE_NEGADA, criarDados, type Indisponibilidade } from "./schemas";

export function IndisponibilidadesPessoa({
  orgId,
  userId,
  pessoaId,
  nome,
  ativa,
}: {
  orgId: string;
  userId: string;
  pessoaId: string;
  nome: string;
  ativa: boolean;
}) {
  const load = useServerFn(listarIndisponibilidades),
    execute = useServerFn(executarIndisponibilidade);
  const cache = useQueryClient();
  const [pagina, setPagina] = useState(0),
    [editor, setEditor] = useState<"nova" | Indisponibilidade | null>(null);
  const [denied, setDenied] = useState(false);
  const scope = ["pessoas", orgId, "indisponibilidades", userId, pessoaId] as const;
  const currentScope = useRef(0);
  const openEditor = (next: typeof editor) => {
    currentScope.current += 1;
    setEditor(next);
  };
  useEffect(
    () => () => {
      currentScope.current += 1;
    },
    [],
  );
  const query = useQuery({
    queryKey: [...scope, pagina],
    enabled: !denied,
    queryFn: ({ signal }) =>
      load({ data: { organization_id: orgId, pessoa_id: pessoaId, pagina }, signal }),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  const forbidden = denied || query.error?.message === DISPONIBILIDADE_NEGADA;
  useEffect(() => {
    if (!forbidden) return;
    currentScope.current += 1;
    setEditor(null);
    setDenied(true);
    const filter = { queryKey: ["pessoas", orgId, "indisponibilidades", userId, pessoaId] };
    void cache.cancelQueries(filter).then(() => cache.removeQueries(filter));
  }, [forbidden, cache, orgId, userId, pessoaId]);
  const save = async (
    dados: z.output<typeof criarDados> | { id: string; expected_version: number; motivo: string },
  ) => {
    const generation = currentScope.current;
    const comando = "pessoa_id" in dados ? ("registrar" as const) : ("cancelar" as const);
    try {
      const data =
        comando === "registrar"
          ? {
              organization_id: orgId,
              chave: keyFor({ comando, dados }),
              comando,
              dados: dados as z.output<typeof criarDados>,
            }
          : {
              organization_id: orgId,
              chave: keyFor({ comando, dados }),
              comando,
              dados: dados as { id: string; expected_version: number; motivo: string },
            };
      await execute({ data });
      if (generation !== currentScope.current) return false;
      setEditor(null);
      await Promise.all([
        cache.invalidateQueries({ queryKey: scope }),
        cache.invalidateQueries({ queryKey: ["agenda-equipe", orgId] }),
      ]);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === DISPONIBILIDADE_NEGADA) setDenied(true);
      throw error;
    }
  };
  const keyFor = useCommandKey();
  return (
    <section
      aria-label={`Disponibilidade de ${nome}`}
      className="space-y-3 border-t border-border pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Disponibilidade operacional</h3>
        {!forbidden &&
          query.data?.pode_gerir &&
          ativa &&
          supportedTimezone(query.data.timezone) && (
            <ActionButton variant="ghost" onClick={() => openEditor("nova")}>
              Registrar indisponibilidade
            </ActionButton>
          )}
      </div>
      <p className="text-sm text-muted-foreground">
        Bloqueios de alocação na Agenda. Registre somente contexto operacional, sem informações de
        saúde detalhadas.
      </p>
      {forbidden ? (
        <p role="alert" className="text-sm">
          {DISPONIBILIDADE_NEGADA}
        </p>
      ) : query.isPending ? (
        <LoadingState label="Consultando disponibilidade…" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        query.data && (
          <>
            {!supportedTimezone(query.data.timezone) && (
              <p role="alert" className="text-sm text-warning">
                Este navegador não interpreta o fuso {query.data.timezone}. Os instantes originais
                são exibidos com seu deslocamento. Atualize o navegador ou revise o fuso da
                organização antes de registrar um novo período.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Horários em {query.data.timezone}. Eventos consecutivos podem se encontrar no horário
              de término.
            </p>
            {!query.data.registros.length ? (
              <EmptyState
                title="Nenhum bloqueio cadastrado"
                hint="A disponibilidade também considera os compromissos confirmados na Agenda."
              />
            ) : (
              <ul className="space-y-2">
                {query.data.registros.map((row) => (
                  <li key={row.id} className="space-y-2 rounded border border-border p-3 text-sm">
                    <p className="font-medium">
                      {date(row.inicio, query.data.timezone)} → {date(row.fim, query.data.timezone)}
                    </p>
                    <p className="break-words">{row.motivo_operacional}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.cancelada_em ? "Cancelada" : "Bloqueio cadastrado"} · versão{" "}
                      {row.version}
                    </p>
                    {row.cancelada_em && (
                      <p className="break-words">Cancelamento: {row.motivo_cancelamento}</p>
                    )}
                    {query.data.pode_gerir && !row.cancelada_em && (
                      <ActionButton variant="ghost" onClick={() => openEditor(row)}>
                        Cancelar bloqueio
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Pagination page={pagina} total={query.data.total} onChange={setPagina} />
          </>
        )
      )}
      <OperationalDialog
        title={editor === "nova" ? "Registrar indisponibilidade" : "Cancelar indisponibilidade"}
        open={!!editor && !forbidden}
        onOpenChange={(open) => {
          if (!open) openEditor(null);
        }}
      >
        {editor && !forbidden && (
          <DisponibilidadeForm
            key={editor === "nova" ? "nova" : editor.id}
            pessoaId={pessoaId}
            nome={nome}
            timezone={query.data?.timezone || "America/Sao_Paulo"}
            registro={editor === "nova" ? null : editor}
            onSave={save}
            onReload={() => query.refetch()}
          />
        )}
      </OperationalDialog>
    </section>
  );
}
function date(value: string, timezone: string) {
  if (!supportedTimezone(timezone)) return `${value} (instante original)`;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
function supportedTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
function DisponibilidadeForm({
  pessoaId,
  nome,
  timezone,
  registro,
  onSave,
  onReload,
}: {
  pessoaId: string;
  nome: string;
  timezone: string;
  registro: Indisponibilidade | null;
  onSave: (
    data: z.output<typeof criarDados> | { id: string; expected_version: number; motivo: string },
  ) => Promise<boolean>;
  onReload: () => unknown;
}) {
  const id = useId(),
    lock = useRef(false),
    cancelField = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const f = useForm({
    resolver: zodResolver(criarDados),
    defaultValues: { pessoa_id: pessoaId, inicio_local: "", fim_local: "", timezone, motivo: "" },
  });
  const [cancelReason, setCancelReason] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (data: Parameters<typeof onSave>[0]) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar. Tente novamente.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      noValidate
      data-dirty={registro ? !!cancelReason : f.formState.isDirty}
      aria-busy={busy}
      onSubmit={
        registro
          ? (event) => {
              event.preventDefault();
              if (cancelReason.trim().length < 5 || cancelReason.trim().length > 1000) {
                setError("Informe motivo de cancelamento com 5 a 1000 caracteres.");
                cancelField.current?.focus();
                return;
              }
              void run({
                id: registro.id,
                expected_version: registro.version,
                motivo: cancelReason.trim(),
              });
            }
          : f.handleSubmit(run, () => setError("Confira os campos indicados antes de registrar."))
      }
      className="space-y-4"
    >
      <p className="text-sm font-medium">{nome}</p>
      {error && (
        <div
          id={`${id}-erro`}
          role="alert"
          className="space-y-2 rounded border border-destructive p-3 text-sm"
        >
          <p>{error}</p>
          <ActionButton variant="ghost" onClick={() => onReload()}>
            Atualizar lista sem descartar preenchimento
          </ActionButton>
        </div>
      )}
      {registro ? (
        <>
          <p className="text-sm">
            Cancelar libera o período para novas alocações. O registro e o motivo original
            permanecem no histórico.
          </p>
          <p className="text-sm">
            {date(registro.inicio, timezone)} → {date(registro.fim, timezone)}
          </p>
          <label htmlFor={`${id}-motivo`} className="block text-sm font-medium">
            Motivo do cancelamento *
          </label>
          <textarea
            ref={cancelField}
            id={`${id}-motivo`}
            className={fieldClass}
            value={cancelReason}
            maxLength={1000}
            required
            aria-invalid={!!error && cancelReason.trim().length < 5}
            aria-describedby={error ? `${id}-erro` : undefined}
            onChange={(event) => setCancelReason(event.target.value)}
          />
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Horários em {timezone}. Até 93 dias por registro. Um bloqueio sobre compromisso
            confirmado exige reagendamento prévio.
          </p>
          {(["inicio_local", "fim_local"] as const).map((name, index) => (
            <div key={name}>
              <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
                {index ? "Fim" : "Início"} *
              </label>
              <input
                id={`${id}-${name}`}
                type="datetime-local"
                className={fieldClass}
                {...f.register(name)}
                aria-invalid={!!f.formState.errors[name]}
                aria-describedby={f.formState.errors[name] ? `${id}-${name}-erro` : undefined}
              />
              {f.formState.errors[name] && (
                <p id={`${id}-${name}-erro`} className="text-sm text-destructive">
                  {f.formState.errors[name]?.message}
                </p>
              )}
            </div>
          ))}
          <label htmlFor={`${id}-motivo`} className="block text-sm font-medium">
            Motivo operacional *
          </label>
          <textarea
            id={`${id}-motivo`}
            className={fieldClass}
            maxLength={1000}
            {...f.register("motivo")}
            aria-invalid={!!f.formState.errors.motivo}
            aria-describedby={f.formState.errors.motivo ? `${id}-motivo-erro` : `${id}-ajuda`}
          />
          {f.formState.errors.motivo && (
            <p id={`${id}-motivo-erro`} className="text-sm text-destructive">
              {f.formState.errors.motivo.message}
            </p>
          )}
          <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
            Ex.: indisponibilidade de agenda ou atividade externa. Não registre diagnóstico ou
            prontuário.
          </p>
        </>
      )}
      <ActionButton type="submit" variant={registro ? "danger" : "primary"} disabled={busy}>
        {busy
          ? "Confirmando no servidor…"
          : registro
            ? "Confirmar cancelamento"
            : "Registrar indisponibilidade"}
      </ActionButton>
    </form>
  );
}
