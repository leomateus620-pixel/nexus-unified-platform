import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Ellipsis, Save } from "lucide-react";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { PetCommandIntents } from "./command-intents";
import { RecordFiles } from "@/features/operacao/RecordFiles";
import { petExecutar, petObter, petOpcoes } from "./pet.functions";
import {
  PET_ETAPAS,
  optionName,
  petSnapshotOption,
  petDate,
  type PetDetalhe,
  type PetExecute,
  type PetOpcoes,
  type PetUICommand,
} from "./ui-types";
import { PetConferencia, PetDraftStage, draftPayload, petDraft, type PetDraft } from "./PetEditor";
import { PetAcompanhamento, PetAvaliacoes } from "./PetOperations";
import { PetStatus } from "./ExecucaoWorkspace";
import { PetDocumentos } from "./PetDocumentos";
import { PetContingencia } from "./PetContingencia";
import type { Json } from "./schemas";
import "./pet.css";
import { retainPetDraftView } from "./draft-recovery";
import { PetAppearanceProvider, PetThemeToggle, usePetAppearance } from "./PetAppearance";
import { PET_PHASES, initialPetStage, petStageAvailable } from "./presentation";
import { PetEncerramento } from "./PetEncerramento";
import { PetResumoConsulta } from "./PetResumo";
import { PetCancelarRascunho } from "./PetCancelarRascunho";

export function PetWorkspace({ petId }: { petId: string }) {
  const session = useOrg();
  if (session.isPending) return <LoadingState label="Conferindo sessão…" />;
  if (session.isError || !session.data)
    return (
      <ErrorState
        error={session.error || new Error("Sessão indisponível.")}
        onRetry={() => session.refetch()}
      />
    );
  return (
    <PetAppearanceProvider organizationId={session.data.orgId} userId={session.data.userId}>
      <PetConnected
        key={`${session.data.orgId}:${session.data.userId}:${session.data.roles.join(",")}:${JSON.stringify(session.data.capabilities)}:${petId}`}
        organizationId={session.data.orgId}
        userId={session.data.userId}
        petId={petId}
      />
    </PetAppearanceProvider>
  );
}
function PetConnected({
  organizationId,
  userId,
  petId,
}: {
  organizationId: string;
  userId: string;
  petId: string;
}) {
  const get = useServerFn(petObter),
    getOptions = useServerFn(petOpcoes),
    execute = useServerFn(petExecutar),
    client = useQueryClient();
  const intents = useRef(new PetCommandIntents()),
    lock = useRef(false),
    alive = useRef(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const detail = useQuery({
    queryKey: ["pet", organizationId, userId, "ficha", petId],
    queryFn: ({ signal }) =>
      get({
        data: { organization_id: organizationId, id: petId },
        signal,
      }) as unknown as Promise<PetDetalhe>,
    refetchInterval: 30_000,
    retry: false,
    refetchOnWindowFocus: "always",
  });
  const options = useQuery({
    queryKey: ["pet", organizationId, userId, "opcoes"],
    queryFn: ({ signal }) =>
      getOptions({
        data: { organization_id: organizationId },
        signal,
      }) as unknown as Promise<PetOpcoes>,
    retry: false,
  });
  const command: PetExecute = async (value) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await execute({
        data: {
          organization_id: organizationId,
          comando: { ...value, chave: intents.current.key(value) },
        },
      });
      if (!alive.current) return false;
      await client.invalidateQueries({ queryKey: ["pet", organizationId] });
      if (!alive.current) return false;
      intents.current.confirmed(value);
      setNotice(
        value.comando === "registrar_saida"
          ? "Saída registrada no servidor. Confira a pendência individual de assinatura."
          : "Registro confirmado no servidor.",
      );
      return true;
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e
            : new Error("Não foi possível confirmar. O preenchimento foi preservado."),
        );
      return false;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  if (detail.isPending || options.isPending)
    return <LoadingState label="Carregando permissão, equipe e documentos…" />;
  const retainDetail = detail.isError && retainPetDraftView(detail.error, !!detail.data);
  const retainOptions = options.isError && retainPetDraftView(options.error, !!options.data);
  if ((detail.isError && !retainDetail) || (options.isError && !retainOptions))
    return (
      <ErrorState
        error={detail.error || options.error}
        onRetry={() => {
          void detail.refetch();
          void options.refetch();
        }}
      />
    );
  const petData = detail.data;
  const optionData = options.data;
  if (!petData || !optionData)
    return (
      <ErrorState
        error={new Error("Dados indisponíveis. Consulte novamente para conferir seu acesso.")}
        onRetry={() => {
          void detail.refetch();
          void options.refetch();
        }}
      />
    );
  const transportNotice =
    retainDetail || retainOptions
      ? new Error(
          "Falha de conexão ao atualizar a PET. O preenchimento foi preservado nesta tela; a situação atual ainda não foi confirmada no servidor.",
        )
      : null;
  return (
    <PetFicha
      documentos={
        <PetDocumentos
          organizationId={organizationId}
          petId={petId}
          versao={petData.pet.version}
          documentos={petData.documentos as unknown as Record<string, Json>[]}
        />
      }
      contingencia={
        <PetContingencia
          organizationId={organizationId}
          petId={petId}
          version={petData.pet.version}
        />
      }
      detail={petData}
      options={optionData}
      onCommand={command}
      busy={busy}
      error={error || transportNotice}
      notice={notice}
      onReload={() => detail.refetch()}
      evidences={(item) => (
        <RecordFiles
          pai={{ organization_id: organizationId, pet_id: petId, pet_item: item }}
          readOnly={["encerrada", "cancelada"].includes(petData.pet.estado_documental)}
        />
      )}
    />
  );
}
export function PetFicha({
  detail,
  options,
  onCommand,
  busy = false,
  error = null,
  notice = "",
  onReload,
  evidences,
  documentos,
  contingencia,
}: {
  detail: PetDetalhe;
  options: PetOpcoes;
  onCommand: PetExecute;
  busy?: boolean;
  error?: Error | null;
  notice?: string;
  onReload?: () => unknown;
  evidences?: ((item: string) => ReactNode) | undefined;
  documentos?: ReactNode;
  contingencia?: ReactNode;
}) {
  const readOnly =
    !detail.permissoes["editar"] ||
    !["rascunho", "em_conferencia"].includes(detail.pet.estado_documental);
  const { theme } = usePetAppearance();
  const [stage, setStage] = useState(() => initialPetStage(detail));
  const [closureDirty, setClosureDirty] = useState(false);
  const [showLocalClosure, setShowLocalClosure] = useState(false);
  const goTo = (next: number, item?: string) => {
    if (!petStageAvailable(detail, next)) return;
    setStage(next);
    if (item)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const group = Array.from(document.querySelectorAll<HTMLElement>("[data-pet-field]")).find(
            (node) => node.dataset["petField"] === item,
          );
          let parent = group?.parentElement;
          while (parent) {
            if (parent instanceof HTMLDetailsElement) parent.open = true;
            parent = parent.parentElement;
          }
          group?.scrollIntoView({
            block: "center",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          });
          group
            ?.querySelector<HTMLElement>("input,select,textarea,button")
            ?.focus({ preventScroll: true });
        }),
      );
  };
  const mainRef = useRef<HTMLElement>(null);
  const previousStage = useRef(stage);
  useEffect(() => {
    if (previousStage.current !== stage) {
      previousStage.current = stage;
      if (window.matchMedia("(max-width:850px)").matches)
        mainRef.current?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
    }
  }, [stage]);
  const [draft, setDraft] = useState<PetDraft>(() => petDraft(detail));
  const [saved, setSaved] = useState(() => JSON.stringify(petDraft(detail)));
  const [localError, setLocalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ atividade?: string; termino_previsto?: string }>(
    {},
  );
  const [contextOpen, setContextOpen] = useState(false);
  const dirty = JSON.stringify(draft) !== saved;
  const serverStage = initialPetStage(detail);
  const previousServerStage = useRef(serverStage);
  useEffect(() => {
    if (serverStage !== previousServerStage.current) {
      if (serverStage === 7 || (!dirty && !closureDirty && stage === previousServerStage.current))
        setStage(serverStage);
      previousServerStage.current = serverStage;
    }
  }, [serverStage, stage, dirty, closureDirty]);
  const currentVersion = useRef(detail.pet.version);
  const [localVersion, setLocalVersion] = useState(detail.pet.version);
  useEffect(() => {
    if (detail.pet.version !== currentVersion.current) {
      currentVersion.current = detail.pet.version;
      if (!dirty) {
        const next = petDraft(detail);
        setDraft(next);
        setSaved(JSON.stringify(next));
        setLocalVersion(detail.pet.version);
      }
    }
  }, [detail, dirty]);
  const blocker = useBlocker({
    withResolver: true,
    shouldBlockFn: () => dirty || closureDirty,
    enableBeforeUnload: () => dirty || closureDirty,
  });
  const supervisor = detail.participantes.find(
    (p) => p.funcao === "supervisor" && !(p as unknown as { fim?: string }).fim,
  );
  const vigia = detail.participantes.find(
    (p) => p.funcao === "vigia" && !(p as unknown as { fim?: string }).fim,
  );
  const person = (p: typeof supervisor) =>
    p?.nome_snapshot || p?.nome || optionName(options.pessoas.find((o) => o.id === p?.pessoa_id));
  const expired =
    !!detail.pet.emitida_em &&
    !detail.pet.encerrada_em &&
    Date.now() >= Date.parse(detail.pet.termino_previsto);
  async function save(advance = false) {
    setLocalError("");
    setFieldErrors({});
    if (!draft.atividade.trim()) {
      setFieldErrors({ atividade: "Descreva a atividade a realizar." });
      goTo(0, "atividade");
      return;
    }
    if (!draft.termino_previsto || Number.isNaN(Date.parse(draft.termino_previsto))) {
      setFieldErrors({ termino_previsto: "Informe uma validade prevista válida." });
      goTo(0, "termino_previsto");
      return;
    }
    let payload: Record<string, Json>;
    try {
      payload = draftPayload(
        draft,
        detail.pet.timezone,
        detail.pet.conteudo,
        detail.pet.termino_previsto,
      );
    } catch (e) {
      setFieldErrors({
        termino_previsto: e instanceof Error ? e.message : "Confira a validade prevista.",
      });
      goTo(0, "termino_previsto");
      return;
    }
    const ok = await onCommand({
      comando: "salvar_rascunho",
      dados: {
        pet_id: detail.pet.id,
        expected_version: localVersion,
        ...payload,
        modelo_id: draft.modelo_id || null,
      },
    });
    if (ok) {
      setSaved(JSON.stringify(draft));
      setLocalVersion((v) => v + 1);
      if (advance) setStage((s) => Math.min(4, s + 1));
    }
  }
  return (
    <div className="nx-pet pet-workspace" data-pet-theme={theme}>
      <Link
        className="nx-pet-link mb-4"
        to="/execucao/ordens/$ordemId"
        params={{ ordemId: detail.pet.os_id }}
      >
        <ArrowLeft size={15} aria-hidden /> {detail.os?.numero || "Ordem de serviço"} · Voltar à OS
      </Link>
      <header className="nx-pet-header">
        <div>
          <p className="nx-pet-kicker">Permissão de Entrada e Trabalho</p>
          <h1 className="nx-pet-title">
            {detail.pet.numero} <span className="font-normal text-muted-foreground">/</span>{" "}
            {optionName(petSnapshotOption(detail, "espaco") || detail.espaco)}
          </h1>
          <p className="nx-pet-description">{detail.pet.atividade}</p>
        </div>
        <div className="nx-pet-actions">
          <PetThemeToggle />
          <PetStatus value={detail.pet.estado_documental} />
          {expired && <PetStatus value="expirada" />}
          <ActionButton
            variant="ghost"
            className="nx-pet-summary-toggle"
            onClick={() => setContextOpen(!contextOpen)}
            aria-expanded={contextOpen}
            aria-controls="pet-context"
            aria-label="Detalhes e opções da PET"
            title="Detalhes e opções da PET"
          >
            <Ellipsis size={18} aria-hidden />
          </ActionButton>
        </div>
      </header>
      {notice && (
        <p role="status" className="nx-pet-notice mb-4">
          <Check size={15} aria-hidden className="mr-2 inline" />
          {notice}
        </p>
      )}
      {(error || localError) && (
        <div role="alert" className="nx-pet-notice mb-4" data-tone="danger">
          <strong>{localError || error?.message}</strong>
          <p className="mt-1">
            Seu preenchimento permanece nesta tela. Confira a situação no servidor antes de repetir
            a ação.
          </p>
          {onReload && (
            <ActionButton variant="ghost" className="mt-3" onClick={() => onReload()}>
              Consultar versão atual
            </ActionButton>
          )}
        </div>
      )}
      {serverStage === 7 && closureDirty && (
        <div role="alert" className="nx-pet-notice mb-4" data-tone="attention">
          <p>
            A PET foi finalizada em outra atualização. Seu preenchimento local de encerramento não
            foi enviado.
          </p>
          <div className="nx-pet-actions mt-3">
            <ActionButton variant="ghost" onClick={() => setShowLocalClosure((value) => !value)}>
              {showLocalClosure ? "Ocultar comparação" : "Comparar preenchimento local"}
            </ActionButton>
            <ActionButton
              variant="ghost"
              onClick={() => {
                setShowLocalClosure(false);
                setClosureDirty(false);
              }}
            >
              Descartar preenchimento local
            </ActionButton>
          </div>
        </div>
      )}
      {dirty && localVersion !== detail.pet.version && (
        <p role="alert" className="nx-pet-notice mb-4" data-tone="attention">
          Há uma versão mais recente no servidor. O preenchimento local foi preservado para
          comparação. Não é possível sobrescrever a alteração de outro dispositivo.
        </p>
      )}
      {blocker.status === "blocked" && (
        <div role="alert" className="nx-pet-notice mb-4" data-tone="attention">
          <p>Há alterações de rascunho ainda não confirmadas no servidor.</p>
          <div className="nx-pet-actions mt-3">
            <ActionButton variant="ghost" onClick={() => blocker.reset?.()}>
              Continuar preenchendo
            </ActionButton>
            <ActionButton variant="danger" onClick={() => blocker.proceed?.()}>
              Sair e descartar alterações
            </ActionButton>
          </div>
        </div>
      )}
      {contextOpen && (
        <section
          id="pet-context"
          className="nx-pet-panel pet-context-drawer"
          aria-label="Contexto da permissão"
        >
          <dl className="nx-pet-facts">
            <div>
              <dt>OS vinculada</dt>
              <dd>{detail.os?.numero}</dd>
            </div>
            <div>
              <dt>Supervisor de entrada</dt>
              <dd>{person(supervisor)}</dd>
            </div>
            <div>
              <dt>Vigia</dt>
              <dd>{person(vigia)}</dd>
            </div>
            <div>
              <dt>Validade</dt>
              <dd>{petDate(detail.pet.termino_previsto, detail.pet.timezone)}</dd>
            </div>
            <div>
              <dt>Versão documental</dt>
              <dd>{detail.pet.version}</dd>
            </div>
          </dl>
          <div className="nx-pet-actions mt-4">
            <PetCancelarRascunho
              detail={detail}
              onCommand={onCommand}
              busy={busy}
              errorMessage={error?.message}
            />
          </div>
        </section>
      )}
      <nav className="pet-phases" aria-label="Fases da PET">
        {PET_PHASES.filter((phase) =>
          phase.stages.some((index) => petStageAvailable(detail, index)),
        ).map((phase, index) => (
          <button
            type="button"
            key={phase.name}
            aria-current={(phase.stages as readonly number[]).includes(stage) ? "step" : undefined}
            onClick={() => goTo(phase.stages[0]!)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {phase.name}
          </button>
        ))}
      </nav>
      {stage < 4 && (
        <nav className="pet-preparation-steps" aria-label="Etapas da preparação">
          {PET_ETAPAS.slice(0, 4).map((label, index) => (
            <button
              type="button"
              key={label}
              aria-current={stage === index ? "step" : undefined}
              onClick={() => goTo(index)}
            >
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className="pet-content-layout">
        <main ref={mainRef} className="nx-pet-main">
          {stage < 4 && (
            <>
              <PetDraftStage
                stage={stage}
                draft={draft}
                onChange={(value) => {
                  setDraft(value);
                  setFieldErrors({});
                }}
                fieldErrors={fieldErrors}
                detail={detail}
                options={options}
                readOnly={readOnly}
                evidences={evidences}
              />
              {stage === 3 && (
                <PetAvaliacoes
                  detail={detail}
                  options={options}
                  onCommand={onCommand}
                  busy={busy}
                  errorMessage={error?.message}
                  evidences={evidences}
                />
              )}
              <footer className="nx-pet-footer">
                <div>
                  <p className="nx-pet-save-state">
                    {dirty
                      ? "Alterações nesta tela · ainda não confirmadas"
                      : `Versão ${detail.pet.version} confirmada no servidor`}
                  </p>
                </div>
                <div className="nx-pet-actions">
                  {stage > 0 && (
                    <ActionButton variant="ghost" onClick={() => setStage((s) => s - 1)}>
                      <ArrowLeft size={15} aria-hidden />
                      <span className="sr-only">Etapa anterior</span>
                    </ActionButton>
                  )}
                  {!readOnly && (
                    <ActionButton
                      variant="ghost"
                      loading={busy}
                      disabled={!dirty || localVersion !== detail.pet.version}
                      onClick={() => save(false)}
                    >
                      <Save size={15} aria-hidden />
                      <span>Salvar</span>
                    </ActionButton>
                  )}
                  <ActionButton
                    loading={busy}
                    disabled={!readOnly && dirty && localVersion !== detail.pet.version}
                    onClick={() =>
                      !readOnly && dirty ? save(true) : setStage((s) => Math.min(5, s + 1))
                    }
                  >
                    {!readOnly && dirty ? "Salvar e continuar" : "Continuar"}
                    <ArrowRight size={14} aria-hidden className="ml-2 inline" />
                  </ActionButton>
                </div>
              </footer>
            </>
          )}
          {stage === 4 && (
            <>
              {dirty && (
                <div className="nx-pet-notice" data-tone="attention">
                  Confirme as alterações do rascunho antes da conferência.
                  <div className="mt-3">
                    <ActionButton loading={busy} onClick={() => save(false)}>
                      Salvar rascunho no servidor
                    </ActionButton>
                  </div>
                </div>
              )}
              <PetConferencia
                detail={detail}
                options={options}
                onCommand={
                  dirty
                    ? async () => {
                        setLocalError("Salve o rascunho antes de conferir ou emitir.");
                        return false;
                      }
                    : onCommand
                }
                busy={busy}
                onPending={goTo}
              />
            </>
          )}
          {stage === 5 && (
            <PetAcompanhamento
              detail={detail}
              options={options}
              onCommand={onCommand}
              busy={busy}
              errorMessage={error?.message}
              documentos={documentos}
              contingencia={contingencia}
              evidences={evidences}
              onEncerramento={() => goTo(6)}
            />
          )}
          {(petStageAvailable(detail, 6) || closureDirty) && (
            <div
              hidden={stage !== 6 && !showLocalClosure}
              aria-label={
                serverStage === 7 ? "Comparação do preenchimento local não enviado" : undefined
              }
            >
              <PetEncerramento
                detail={detail}
                options={options}
                onCommand={onCommand}
                busy={busy}
                errorMessage={error?.message}
                evidences={evidences}
                documentos={documentos}
                contingencia={contingencia}
                onDirtyChange={setClosureDirty}
                onOperation={() => goTo(5)}
              />
            </div>
          )}
          {stage === 7 && (
            <PetResumoConsulta
              detail={detail}
              options={options}
              documentos={documentos}
              evidences={evidences}
            />
          )}
        </main>
      </div>
    </div>
  );
}
