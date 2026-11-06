import { useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Download, Plus, Save, Trash2 } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/nexus/Page";
import type { NrSearch } from "@/features/nr/NrWorkspace";
import { PetField } from "../PetEditor";
import { PET_FUNCOES, petDate, petInstant } from "../ui-types";
import type { Json } from "../schemas";
import { PetCommandIntents } from "../command-intents";
import { isPetTransportFailure } from "../draft-recovery";
import { demoKey, type DemoScope } from "./hooks";
import {
  DEMO_STEPS,
  demoCanEnterStep,
  demoContextErrors,
  demoStateLabel,
  emptyDemoDraft,
  demoSeguranca,
  segurancaPendencias,
  segurancaTexto,
  type DemoCommand,
  type DemoDetail,
  type DemoDraft,
} from "./domain";
import { petDemoExecutar, petDemoObter, petDemoRegistros } from "./demo.functions";
import { demoExportDetail } from "./export-detail";
import { PetDemoHistory } from "./PetDemoHistory";
import { PetDemoFiles } from "./PetDemoFiles";
import { PetTeamSelector } from "../PetTeamSelector";
import { PetStepProgress } from "../mobile/PetStepProgress";
import { HazardMeasurePicker } from "../mobile/HazardMeasurePicker";
import { ReadingRows } from "../mobile/ReadingRows";
import { ProcedurePicker } from "../mobile/ProcedurePicker";
import "../mobile/pet-mobile.css";
import { ContatosEmergencia, FichaChecklist, QuenteFields, TesteMetaFields, VentilacaoFields } from "../mobile/FichaChecklist";
import { emptyFicha, fichaPendencias, leiturasDe, testeDaEntrada, type Ficha } from "../cotrirosa-ficha";
import {
  DEMO_AGENTES,
  DEMO_INSTRUMENTOS,
  DEMO_PERIGOS,
  DEMO_PONTOS,
  DEMO_PROCEDIMENTOS,
} from "./catalogo";

type Props = {
  scope: DemoScope;
  user: string;
  id: string;
  step: number;
  onSearch: (patch: Partial<NrSearch>) => void;
  active: boolean;
};
export function PetDemoWorkspace(props: Props) {
  const load = useServerFn(petDemoObter);
  const detail = useQuery({
    queryKey: [...demoKey(props.scope, props.user), "detalhe", props.id],
    enabled: props.id !== "nova",
    queryFn: ({ signal }) => load({ data: { ...props.scope, id: props.id }, signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (props.id !== "nova" && detail.isPending) return <LoadingState label="Abrindo PET…" />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  return (
    <DemoEditor
      key={props.id}
      {...props}
      detail={detail.data}
      reload={async () => {
        const r = await detail.refetch();
        if (r.error) throw r.error;
        return r.data;
      }}
    />
  );
}
function DemoEditor({
  scope,
  user,
  id,
  step: requestedStep,
  onSearch,
  active,
  detail,
  reload,
}: Props & { detail: DemoDetail | undefined; reload: () => Promise<DemoDetail | undefined> }) {
  const readReport = useServerFn(petDemoObter),
    readReportPage = useServerFn(petDemoRegistros);
  const execute = useServerFn(petDemoExecutar),
    cache = useQueryClient();
  const [draft, setDraft] = useState<DemoDraft>(() => detail?.sessao.conteudo ?? emptyDemoDraft());
  const [dirty, setDirty] = useState(false),
    dirtyRef = useRef(false),
    version = useRef(detail?.sessao.version);
  const [busy, setBusy] = useState(false),
    busyLock = useRef(false),
    intents = useRef(new PetCommandIntents());
  const [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [agent, setAgent] = useState(""),
    [reading, setReading] = useState(""),
    [unit, setUnit] = useState("");
  const [note, setNote] = useState(""),
    [extension, setExtension] = useState(""),
    [person, setPerson] = useState("");
  const session = detail?.sessao,
    final = session && ["encerrada", "cancelada"].includes(session.estado);
  const editable = !session || (!!detail?.pode_editar && session.estado === "rascunho");
  const step = demoCanEnterStep(session, requestedStep) ? requestedStep : (session?.etapa ?? 0);
  const contentRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<HTMLDivElement>(null);
  const blocker = useBlocker({
    withResolver: true,
    enableBeforeUnload: () => dirtyRef.current,
    shouldBlockFn: ({ current, next }) =>
      dirtyRef.current &&
      (current.pathname !== next.pathname ||
        (current.search as Partial<NrSearch>)["local"] !==
          (next.search as Partial<NrSearch>)["local"] ||
        (current.search as Partial<NrSearch>)["unidade"] !==
          (next.search as Partial<NrSearch>)["unidade"] ||
        (current.search as Partial<NrSearch>)["petDemo"] !==
          (next.search as Partial<NrSearch>)["petDemo"]),
  });
  useEffect(() => {
    if (blocker.status !== "blocked") return;
    const previous = document.activeElement as HTMLElement | null;
    leaveRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [blocker.status]);
  useEffect(() => {
    if (active) {
      contentRef.current?.scrollTo(0, 0);
      contentRef.current?.querySelector<HTMLElement>("h4")?.focus();
    }
  }, [step, active]);
  const ficha: Ficha = draft.ficha ?? emptyFicha();
  const setFicha = (f: Ficha) => set("ficha", f);
  const fichaPend = fichaPendencias(ficha, draft.leituras);
  const goToFicha = (id: string) => {
    const tgt = id.startsWith("teste_") || id.startsWith("pre_") || id.startsWith("dur_") ? 3 : 2;
    onSearch({ etapaDemo: tgt });
    setTimeout(() => document.getElementById(`ficha-${id}`)?.scrollIntoView({ block: "center" }), 150);
  };
  const set = <K extends keyof DemoDraft>(key: K, value: DemoDraft[K]) => {
    setDraft((old) => ({ ...old, [key]: value }));
    dirtyRef.current = true;
    setDirty(true);
    setSaved("");
  };
  const go = (value: number) => onSearch({ etapaDemo: value });
  async function command(
    comando: DemoCommand["comando"],
    dados: Record<string, Json>,
    next?: number,
  ) {
    if (busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    setError("");
    const payload = {
      comando,
      norma: scope.norma,
      ...(session ? { id: session.id, expected_version: version.current } : {}),
      dados,
    };
    try {
      const r = await execute({
        data: { ...scope, comando: { ...payload, chave: intents.current.key(payload) } },
      });
      intents.current.confirmed(payload);
      version.current = r.version;
      dirtyRef.current = false;
      setDirty(false);
      setSaved("Salvo agora");
      await cache.invalidateQueries({ queryKey: ["pet-demo", scope.organization_id] });
      if (id !== "nova") {
        const updated = await reload();
        if (updated) setDraft(updated.sessao.conteudo);
      }
      onSearch({ petDemo: r.id, etapaDemo: next ?? step });
    } catch (e) {
      setError(
        isPetTransportFailure(e)
          ? "A conexão falhou. Seu preenchimento está preservado; use Salvar novamente para retomar."
          : e instanceof Error
            ? e.message
            : "Não foi possível salvar. Seu preenchimento está preservado.",
      );
    } finally {
      busyLock.current = false;
      setBusy(false);
    }
  }
  async function exportReport(kind: "pdf" | "csv") {
    if (!session || busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    setError("");
    try {
      const fresh = await demoExportDetail(
        () => readReport({ data: { ...scope, id: session.id } }),
        (recurso, pagina) =>
          readReportPage({ data: { ...scope, id: session.id, recurso, pagina } }),
      );
      const report = await import("./report");
      if (kind === "pdf") await report.downloadDemoReport(fresh);
      else report.downloadDemoCsv(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar. Tente novamente.");
    } finally {
      busyLock.current = false;
      setBusy(false);
    }
  }
  async function save(advance: boolean) {
    const errors = demoContextErrors(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError("Confira os campos indicados antes de salvar.");
      if (errors["atividade"] || errors["termino_previsto"] || errors["inicio_previsto"]) go(0);
      return;
    }
    const next = advance ? Math.min(4, step + 1) : step;
    await command(
      session ? "salvar" : "criar",
      session
        ? { conteudo: draft as unknown as Json, etapa: next }
        : {
            cliente_id: scope.cliente_id,
            unidade_id: scope.unidade_id,
            local_id: scope.local_id!,
            conteudo: draft as unknown as Json,
          },
      next,
    );
  }
  const closedOrOperating = !editable;
  const workers = draft.equipe.filter((p) => p.funcao === "trabalhador"),
    open = detail?.presencas.filter((p) => !p.saida_em) ?? [];
  const dateValue = (value: string) =>
    value
      ? new Date(value)
          .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
          .replace(" ", "T")
          .slice(0, 16)
      : "";
  const dateChange = (key: "inicio_previsto" | "termino_previsto", value: string) => {
    try {
      set(key, value ? petInstant(value, "America/Sao_Paulo") : "");
    } catch {
      set(key, "");
    }
  };
  const readingsInput = (
    <div className="pet-demo-reading-input">
      <PetField label="Agente">
        <input
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          placeholder="Informe o agente"
        />
      </PetField>
      <PetField label="Valor">
        <input inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} />
      </PetField>
      <PetField label="Unidade">
        <input value={unit} onChange={(e) => setUnit(e.target.value)} />
      </PetField>
    </div>
  );
  return (
    <section
      className="pet-demo pet-demo-workflow"
      aria-label="Preenchimento da PET de demonstração"
    >
      <div className="pet-demo-workflow-heading">
        <div>
          <span className="pet-demo-eyebrow">{session?.numero ?? "Nova PET"} · Demonstração</span>
          <h3>{session ? demoStateLabel[session.estado] : "Comece por aqui"}</h3>
        </div>
        <button className="pet-demo-text" onClick={() => onSearch({ petDemo: "", etapaDemo: 0, visualizacao: "expandida" })}>
          <ArrowLeft size={15} /> Histórico do silo
        </button>
      </div>
      <nav className="pet-demo-steps" aria-label="Etapas da PET">
        {DEMO_STEPS.map((label, i) => (
          <button
            key={label}
            disabled={busy || !demoCanEnterStep(session, i)}
            aria-current={step === i ? "step" : undefined}
            onClick={() => go(i)}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <PetStepProgress
        steps={DEMO_STEPS}
        current={step}
        canEnter={(i) => demoCanEnterStep(session, i)}
        onGo={go}
        disabled={busy}
      />
      <div className="pet-demo-form-body" ref={contentRef}>
        <h4 tabIndex={-1}>{DEMO_STEPS[step]}</h4>
        {session && step === 7 && (
          <details className="pet-demo-disclosure">
            <summary>Identificação registrada</summary>
            <p>{session.identificacao.unidade}</p>
            <p>
              {session.identificacao.tag} · {session.identificacao.titulo}
            </p>
          </details>
        )}
        {error && (
          <div className="pet-demo-error" role="alert">
            <p>{error}</p>
            {session && (
              <button
                onClick={async () => {
                  try {
                    const r = await reload();
                    if (r) {
                      setDraft(r.sessao.conteudo);
                      version.current = r.sessao.version;
                      dirtyRef.current = false;
                      setDirty(false);
                      setError("");
                    }
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Usar a versão salva no servidor
              </button>
            )}
          </div>
        )}
        {step === 0 && (
          <>
            <p className="pet-demo-hint">
              Defina a atividade e o período. O silo já está selecionado.
            </p>
            <fieldset disabled={closedOrOperating || busy}>
              <div className="pet-demo-form-grid">
                <PetField label="Atividade" error={fieldErrors["atividade"]} wide>
                  <textarea
                    value={draft.atividade}
                    onChange={(e) => set("atividade", e.target.value)}
                    rows={3}
                    placeholder="Descreva a atividade"
                  />
                </PetField>
                <PetField label="Início previsto" error={fieldErrors["inicio_previsto"]}>
                  <input
                    type="datetime-local"
                    value={dateValue(draft.inicio_previsto)}
                    onChange={(e) => dateChange("inicio_previsto", e.target.value)}
                  />
                </PetField>
                <PetField label="Término previsto" error={fieldErrors["termino_previsto"]}>
                  <input
                    type="datetime-local"
                    value={dateValue(draft.termino_previsto)}
                    onChange={(e) => dateChange("termino_previsto", e.target.value)}
                  />
                </PetField>
              </div>
              <p className="pet-demo-hint">Horário de Brasília</p>
            </fieldset>
          </>
        )}
        {step === 1 && (
          <>
            <p className="pet-demo-hint">
              Adicione os participantes desta demonstração e suas funções.
            </p>
            <PetTeamSelector
              scope={{
                organization_id: scope.organization_id,
                cliente_id: scope.cliente_id,
                unidade_id: scope.unidade_id,
              }}
              equipe={draft.equipe}
              disabled={closedOrOperating || busy}
              editable={editable}
              onAdd={(m) =>
                set("equipe", [
                  ...draft.equipe,
                  { id: crypto.randomUUID(), nome: m.nome, funcao: m.funcao, ...(m.pessoa_id ? { pessoa_id: m.pessoa_id } : {}) },
                ])
              }
              onRemove={(id) => set("equipe", draft.equipe.filter((x) => x.id !== id))}
            />
          </>
        )}
        {step === 2 && (
          <HazardMeasurePicker
            catalogo={DEMO_PERIGOS}
            value={demoSeguranca(draft)}
            disabled={closedOrOperating || busy}
            onChange={(list) => {
              const t = segurancaTexto(list);
              setDraft((old) => ({ ...old, seguranca: list, perigos: t.perigos, medidas: t.medidas }));
              dirtyRef.current = true;
              setDirty(true);
              setSaved("");
            }}
          />
        )}
        {step === 2 && (
          <>
            <h5 className="pet-demo-section-heading">Medidas de controle e prevenção</h5>
            <FichaChecklist fase="controle" outros ficha={ficha} onChange={setFicha} disabled={closedOrOperating || busy} />
          </>
        )}
        {step === 3 && (
          <>
            <div className="pet-fc-testes">
              {(["inicial", "pos_ventilacao"] as const).map((m) => (
                <div key={m}>
                  <ReadingRows
                    key={m}
                    momento={m}
                    legend={m === "inicial" ? "Teste inicial da atmosfera" : "Teste após ventilação e isolamento"}
                    agentes={DEMO_AGENTES}
                    instrumentos={DEMO_INSTRUMENTOS}
                    pontos={DEMO_PONTOS}
                    value={draft.leituras}
                    disabled={closedOrOperating || busy}
                    onChange={(v) => set("leituras", v)}
                  />
                  <TesteMetaFields momento={m} instrumentos={DEMO_INSTRUMENTOS} ficha={ficha} onChange={setFicha} disabled={closedOrOperating || busy} />
                </div>
              ))}
            </div>
            <h5 className="pet-demo-section-heading">Procedimentos antes da entrada</h5>
            <FichaChecklist fase="antes" ficha={ficha} onChange={setFicha} disabled={closedOrOperating || busy} />
            <VentilacaoFields ficha={ficha} onChange={setFicha} disabled={closedOrOperating || busy} />
            <h5 className="pet-demo-section-heading">Durante o trabalho (previsto)</h5>
            <FichaChecklist fase="durante" ficha={ficha} onChange={setFicha} disabled={closedOrOperating || busy} />
            <QuenteFields ficha={ficha} onChange={setFicha} disabled={closedOrOperating || busy} />
            <ProcedurePicker
              grupos={DEMO_PROCEDIMENTOS}
              value={draft.procedimentos_sel ?? []}
              disabled={closedOrOperating || busy}
              onChange={(v) => set("procedimentos_sel", v)}
            />
            <fieldset disabled={closedOrOperating || busy}>
              <PetField label="Observações (exceções)">
                <textarea
                  rows={3}
                  value={draft.procedimentos}
                  onChange={(e) => set("procedimentos", e.target.value)}
                />
              </PetField>
            </fieldset>
          </>
        )}
        {step === 4 && (
          <>
            <p className="pet-demo-hint">
              Revise o preenchimento antes de iniciar o acompanhamento.
            </p>
            <dl className="pet-demo-summary">
              <dt>Atividade</dt>
              <dd>{draft.atividade || "Não preenchida"}</dd>
              <dt>Período</dt>
              <dd>
                {petDate(draft.inicio_previsto)} → {petDate(draft.termino_previsto)}
              </dd>
              <dt>Equipe</dt>
              <dd>
                {draft.equipe.map((p) => `${p.nome} · ${PET_FUNCOES[p.funcao]}`).join("; ") ||
                  "Nenhum participante"}
              </dd>
              {segurancaPendencias(demoSeguranca(draft)).length > 0 && (
                <>
                  <dt>Pendências de segurança</dt>
                  <dd className="pet-demo-pend">
                    <ul>
                      {segurancaPendencias(demoSeguranca(draft)).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </dd>
                </>
              )}
              {fichaPend.length > 0 && (
                <>
                  <dt>Pendências da ficha ({fichaPend.length})</dt>
                  <dd className="pet-demo-pend pet-fc-pend">
                    <ul>
                      {fichaPend.map((x, i) => (
                        <li key={x.id + i} data-tipo={x.tipo}>
                          <button type="button" onClick={() => goToFicha(x.id)}>
                            {x.tipo === "impeditiva" ? "Impeditiva · " : ""}{x.texto}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </>
              )}
              <dt>Testes atmosféricos</dt>
              <dd>
                {(["inicial", "pos_ventilacao"] as const).map((m) => (
                  <div key={m}>
                    <strong>{m === "inicial" ? "Inicial" : "Após ventilação"}{testeDaEntrada(ficha) === m ? " · fundamenta a entrada" : ""}:</strong>{" "}
                    {leiturasDe(draft.leituras, m).map((l) => `${l.agente} ${l.valor} ${l.unidade}${l.coletada_em ? ` (${new Date(l.coletada_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})` : ""}`).join(" · ") || "sem leituras"}
                    {ficha.testes?.[m]?.responsavel ? ` — ${ficha.testes[m]!.responsavel}` : ""}
                  </div>
                ))}
              </dd>
              <dt>Segurança</dt>
              <dd>
                {draft.perigos || "Não preenchida"}
                <br />
                {draft.medidas}
              </dd>
              <dt>Leituras</dt>
              <dd>
                {draft.leituras.map((l) => `${l.agente}: ${l.valor} ${l.unidade}`).join(" · ") ||
                  "Nenhuma leitura"}
              </dd>
              <dt>Procedimentos</dt>
              <dd>{draft.procedimentos || "Não preenchidos"}</dd>
            </dl>
            {editable && (
              <p className="pet-demo-hint">
                Inclua trabalhador e vigia para experimentar entradas e saídas.
              </p>
            )}
          </>
        )}
        {step === 5 && (
          <>
            <ContatosEmergencia />
            <div className="pet-demo-section-heading">
              <h5>Entradas e saídas</h5>
              <span>{open.length} presentes na demonstração</span>
            </div>
            {!final && detail?.pode_editar && (
              <div className="pet-demo-inline">
                <PetField label="Trabalhador">
                  <select value={person} onChange={(e) => setPerson(e.target.value)}>
                    <option value="">Selecione</option>
                    {workers
                      .filter((w) => !open.some((p) => p.participante_id === w.id))
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.nome}
                        </option>
                      ))}
                  </select>
                </PetField>
                <button
                  className="pet-demo-secondary"
                  disabled={busy || !person}
                  onClick={() => void command("entrada", { participante_id: person })}
                >
                  Registrar entrada
                </button>
              </div>
            )}
            <div className="pet-demo-rows">
              {detail?.presencas.map((p) => (
                <div key={p.id}>
                  <span>
                    <strong>{p.nome}</strong>
                    <small>
                      Entrada: {petDate(p.entrada_em)}
                      {p.saida_em && ` · Saída: ${petDate(p.saida_em)}`}
                    </small>
                  </span>
                  {!p.saida_em && detail?.pode_editar && (
                    <button
                      disabled={busy}
                      onClick={() => void command("saida", { participante_id: p.participante_id })}
                    >
                      Registrar saída
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!final && detail?.pode_editar && (
              <>
                <details className="pet-demo-disclosure">
                  <summary>Nova medição</summary>
                  {readingsInput}
                  <button
                    className="pet-demo-secondary"
                    disabled={
                      busy ||
                      !agent.trim() ||
                      !unit.trim() ||
                      !reading ||
                      !Number.isFinite(Number(reading.replace(",", ".")))
                    }
                    onClick={() =>
                      void command("medicao", {
                        agente: agent,
                        valor: reading.replace(",", "."),
                        unidade: unit,
                      })
                    }
                  >
                    Registrar medição
                  </button>
                </details>
                <details className="pet-demo-disclosure">
                  <summary>Registrar ocorrência</summary>
                  <PetField label="Ocorrência">
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} />
                  </PetField>
                  <button
                    className="pet-demo-secondary"
                    disabled={busy || note.trim().length < 3}
                    onClick={() => void command("ocorrencia", { texto: note })}
                  >
                    Salvar ocorrência
                  </button>
                </details>
                <details className="pet-demo-disclosure">
                  <summary>Prorrogar período</summary>
                  <PetField label="Novo término">
                    <input
                      type="datetime-local"
                      value={extension}
                      onChange={(e) => setExtension(e.target.value)}
                    />
                  </PetField>
                  <button
                    className="pet-demo-secondary"
                    disabled={busy || !extension}
                    onClick={() =>
                      void command("prorrogar", {
                        termino_previsto: petInstant(extension, "America/Sao_Paulo"),
                      })
                    }
                  >
                    Confirmar prorrogação
                  </button>
                </details>
              </>
            )}
          </>
        )}
        {step === 6 && (
          <>
            <p>
              {open.length
                ? `${open.length} participante(s) ainda estão dentro. Registre as saídas na etapa Acompanhamento.`
                : "Todas as saídas foram registradas. Você pode concluir a demonstração."}
            </p>
            <PetField label="Observações de encerramento">
              <textarea
                disabled={busy || !!final}
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </PetField>
          </>
        )}
        {step === 7 && (
          <>
            <div className="pet-demo-complete">
              <Check size={24} />
              <div>
                <h5>{session && demoStateLabel[session.estado]}</h5>
                <p>
                  {session?.numero} · {session?.identificacao.tag}
                </p>
              </div>
            </div>
            <p>{draft.atividade}</p>
            <p className="pet-demo-hint">{petDate(session?.encerrada_em ?? undefined)}</p>
          </>
        )}
        {session && (step === 4 || step === 7) && (
          <PetDemoFiles scope={scope} user={user} detail={detail!} reload={reload} />
        )}
        {session && (step >= 5 || step === 4) && (
          <PetDemoHistory scope={scope} user={user} id={session.id} />
        )}
        {session && (
          <details className="pet-demo-disclosure">
            <summary>Mais opções</summary>
            <div className="pet-demo-inline">
              <button disabled={busy} onClick={() => void exportReport("pdf")}>
                <Download size={16} /> Relatório PDF
              </button>
              <button disabled={busy} onClick={() => void exportReport("csv")}>
                Exportar CSV
              </button>
            </div>
            {!final && detail?.pode_editar && (
              <>
                <PetField label="Motivo do cancelamento">
                  <input value={note} onChange={(e) => setNote(e.target.value)} />
                </PetField>
                <button
                  disabled={busy || note.trim().length < 3 || open.length > 0}
                  onClick={() => void command("cancelar", { texto: note }, 7)}
                >
                  Cancelar demonstração
                </button>
              </>
            )}
          </details>
        )}
      </div>
      <footer className="pet-demo-footer">
        <span role="status">
          {busy
            ? "Salvando…"
            : dirty
              ? "Alterações não salvas"
              : saved || (session ? "Salvo" : "Ainda não salvo")}
        </span>
        <div>
          {step > 0 && (
            <button className="pet-demo-text" disabled={busy} onClick={() => go(step - 1)}>
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
          {editable && step < 4 && (
            <>
              <button
                className="pet-demo-secondary"
                disabled={busy}
                onClick={() => void save(false)}
              >
                <Save size={16} /> Salvar
              </button>
              <button className="pet-demo-primary" disabled={busy} onClick={() => void save(true)}>
                Salvar e continuar <ArrowRight size={16} />
              </button>
            </>
          )}
          {editable &&
            step === 4 &&
            (dirty || !session ? (
              <button className="pet-demo-primary" disabled={busy} onClick={() => void save(false)}>
                Salvar conferência
              </button>
            ) : (
              <button
                className="pet-demo-primary"
                disabled={busy}
                onClick={() => void command("iniciar", {}, 5)}
              >
                Iniciar acompanhamento <ArrowRight size={16} />
              </button>
            ))}
          {session?.estado === "em_andamento" && step === 5 && (
            <button className="pet-demo-primary" disabled={busy} onClick={() => go(6)}>
              Ir para encerramento <ArrowRight size={16} />
            </button>
          )}
          {session?.estado === "em_andamento" && step === 6 && detail?.pode_editar && (
            <button
              className="pet-demo-primary"
              disabled={busy || open.length > 0 || note.trim().length < 3}
              onClick={() => void command("encerrar", { texto: note }, 7)}
            >
              Encerrar demonstração <Check size={16} />
            </button>
          )}
        </div>
      </footer>
      {blocker.status === "blocked" && (
        <div
          ref={leaveRef}
          className="pet-demo-leave"
          role="alertdialog"
          aria-modal="true"
          aria-label="Preenchimento não salvo"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              blocker.reset();
            }
            if (event.key === "Tab") {
              const buttons = [...event.currentTarget.querySelectorAll("button")];
              if (event.shiftKey && document.activeElement === buttons[0]) {
                event.preventDefault();
                buttons.at(-1)?.focus();
              } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
                event.preventDefault();
                buttons[0]?.focus();
              }
            }
          }}
        >
          <h4>Há alterações não salvas</h4>
          <p>Continue preenchendo ou saia descartando essas alterações.</p>
          <button className="pet-demo-primary" onClick={() => blocker.reset()}>
            Continuar preenchendo
          </button>
          <button onClick={() => blocker.proceed()}>Sair sem salvar</button>
        </div>
      )}
    </section>
  );
}
