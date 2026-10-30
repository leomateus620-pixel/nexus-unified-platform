import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Clock3,
  History,
  Plus,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { OperationalDialog } from "@/features/operacao/components";
import { DECLARACOES } from "./domain";
import { PetField } from "./PetEditor";
import { PetStatus } from "./ExecucaoWorkspace";
import { PetPicker } from "./PetPicker";
import { usePetAppearance } from "./PetAppearance";
import {
  PetAvaliacoesConsulta,
  PetHistoricoEventos,
  PetRegistrosIndividuais,
  PetTemposOficiais,
} from "./PetResumo";
import {
  petAssessmentAgents,
  petCurrentApprovedModel,
  petHistoricalName,
  petStructuredReadings,
  type PetReadingField,
} from "./operation-presentation";
import {
  PET_FUNCOES,
  petDate,
  petDuration,
  petInstant,
  type PetDetalhe,
  type PetExecute,
  type PetOpcoes,
  type PetParticipante,
  type PetUICommand,
} from "./ui-types";
import "./pet-operations.css";

const emptyAssessment = {
  etapa: "inicial",
  instrumento: "",
  numero_serie: "",
  responsavel_id: "",
  momento: "",
  calibracao: "",
  origem: "leitura_direta",
};

export function PetAvaliacoes({
  detail,
  options,
  onCommand,
  busy,
  evidences,
  errorMessage,
}: {
  detail: PetDetalhe;
  options: PetOpcoes;
  onCommand: PetExecute;
  busy: boolean;
  evidences?: ((item: string) => ReactNode) | undefined;
  errorMessage?: string | undefined;
}) {
  const { theme } = usePetAppearance();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyAssessment);
  const [readings, setReadings] = useState<PetReadingField[]>([]);
  const [extras, setExtras] = useState<PetReadingField[]>([]);
  const [modelId, setModelId] = useState("");
  const [openingVersion, setOpeningVersion] = useState(detail.pet.version);
  const model = petCurrentApprovedModel(detail, options);
  const agents = petAssessmentAgents(model);
  const closed = ["encerrada", "cancelada"].includes(detail.pet.estado_documental);
  const canRecord = !closed && detail.permissoes["operar"];
  const responsible = detail.participantes.filter(
    (person) =>
      ["supervisor", "vigia", "substituto_vigia"].includes(person.funcao) &&
      !person.fim &&
      !person.fim_vigencia,
  );
  const responsibleOptions = responsible.filter(
    (person, index, rows) => rows.findIndex((row) => row.pessoa_id === person.pessoa_id) === index,
  );
  const dirty =
    JSON.stringify(form) !== JSON.stringify(emptyAssessment) ||
    readings.some((reading) => reading.valor !== "") ||
    extras.length > 0;
  const modelChanged = open && modelId !== model?.id;
  const versionChanged = open && openingVersion !== detail.pet.version;
  function begin() {
    setError("");
    setForm(emptyAssessment);
    setReadings(agents.map((agent) => ({ ...agent, valor: "" })));
    setExtras([]);
    setModelId(model?.id || "");
    setOpeningVersion(detail.pet.version);
    setOpen(true);
  }
  function set(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function save() {
    setError("");
    try {
      if (!form.responsavel_id) throw new Error("Selecione o responsável relacionado à PET.");
      if (modelChanged || versionChanged)
        throw new Error(
          "A PET ou o modelo mudou. Seu preenchimento foi preservado; confira a versão atual antes de registrar.",
        );
      const leituras = petStructuredReadings([...readings, ...extras], form.origem);
      const momento = petInstant(form.momento, detail.pet.timezone);
      if (
        await onCommand({
          comando: "registrar_avaliacao",
          dados: {
            pet_id: detail.pet.id,
            expected_version: openingVersion,
            etapa: form.etapa,
            instrumento: form.instrumento,
            numero_serie: form.numero_serie,
            responsavel_id: form.responsavel_id,
            calibracao: form.calibracao,
            momento,
            leituras,
          },
        })
      )
        setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confira os dados da avaliação.");
    }
  }
  return (
    <section
      className="nx-pet-panel pet-atmosphere-panel"
      data-pet-field="avaliacoes"
      tabIndex={-1}
    >
      <div className="nx-pet-section-top">
        <div>
          <p className="nx-pet-kicker">Condições do ambiente</p>
          <h2>Avaliações atmosféricas</h2>
          <p className="nx-pet-subtitle">Leituras, instrumento e horário de cada verificação.</p>
        </div>
        {canRecord && (
          <ActionButton variant="ghost" disabled={!model || !agents.length || busy} onClick={begin}>
            <Plus size={15} aria-hidden /> Registrar avaliação
          </ActionButton>
        )}
      </div>
      {canRecord && (!model || !agents.length) && (
        <p className="nx-pet-notice" data-tone="attention">
          Selecione e salve um modelo aprovado com agentes e unidades para registrar a avaliação.
        </p>
      )}
      <PetAvaliacoesConsulta detail={detail} />
      <p className="nx-pet-hint pet-atmosphere-footnote">
        Os critérios pertencem ao modelo aprovado. Leituras pontuais e fotos não substituem
        monitoramento atmosférico contínuo.
      </p>
      <OperationalDialog open={open} onOpenChange={setOpen} title="Registrar avaliação atmosférica">
        <form
          className="nx-pet pet-operation-form"
          data-pet-theme={theme}
          data-dirty={dirty}
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="nx-pet-grid">
            <PetField label="Etapa">
              <select value={form.etapa} onChange={(event) => set("etapa", event.target.value)}>
                <option value="inicial">Teste inicial</option>
                <option value="apos_ventilacao">Após ventilação / isolamento</option>
                <option value="reavaliacao">Reavaliação</option>
              </select>
            </PetField>
            <PetField
              label="Momento da avaliação"
              hint={`Horário real da leitura · ${detail.pet.timezone}`}
            >
              <input
                required
                type="datetime-local"
                value={form.momento}
                onChange={(event) => set("momento", event.target.value)}
              />
            </PetField>
            <PetField label="Instrumento / detector">
              <input
                required
                minLength={2}
                value={form.instrumento}
                onChange={(event) => set("instrumento", event.target.value)}
              />
            </PetField>
            <PetField label="Número de série">
              <input
                required
                minLength={2}
                value={form.numero_serie}
                onChange={(event) => set("numero_serie", event.target.value)}
              />
            </PetField>
            <PetPicker
              label="Responsável pela avaliação"
              value={form.responsavel_id}
              options={responsibleOptions.map((person) => ({
                id: person.pessoa_id,
                label:
                  person.nome_snapshot ||
                  person.nome ||
                  petHistoricalName(detail, options, person.pessoa_id),
                description: PET_FUNCOES[person.funcao] || person.funcao,
              }))}
              onChange={(value) => set("responsavel_id", value)}
              placeholder="Selecionar responsável relacionado"
            />
            <PetField label="Origem das leituras">
              <select value={form.origem} onChange={(event) => set("origem", event.target.value)}>
                <option value="leitura_direta">Leitura direta no instrumento</option>
                <option value="registro_instrumento">Registro do instrumento</option>
                <option value="informada_posteriormente">
                  Informada posteriormente · requer conferência
                </option>
              </select>
            </PetField>
            <PetField wide label="Verificação / calibração aplicável">
              <textarea
                required
                minLength={3}
                value={form.calibracao}
                onChange={(event) => set("calibracao", event.target.value)}
              />
            </PetField>
          </div>
          <fieldset className="pet-reading-fieldset">
            <legend>Leituras do modelo aprovado</legend>
            <p className="nx-pet-hint">
              Use ponto ou vírgula decimal. As unidades foram definidas no procedimento.
            </p>
            <div className="pet-reading-inputs">
              {readings.map((reading, index) => (
                <div
                  key={`${reading.agente}:${reading.unidade}`}
                  data-pet-field={`avaliacoes.${reading.agente}`}
                >
                  <PetField label={`${reading.agente} (${reading.unidade})`}>
                    <div className="pet-reading-input">
                      <input
                        required
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`${reading.agente} em ${reading.unidade}`}
                        value={reading.valor}
                        onChange={(event) =>
                          setReadings((previous) =>
                            previous.map((row, position) =>
                              position === index ? { ...row, valor: event.target.value } : row,
                            ),
                          )
                        }
                      />
                      <span>{reading.unidade}</span>
                    </div>
                  </PetField>
                </div>
              ))}
            </div>
          </fieldset>
          <details className="nx-pet-accordion" open={extras.length > 0 || undefined}>
            <summary>Outros agentes pertinentes</summary>
            <div className="pet-extra-agents">
              {extras.map((reading, index) => (
                <div className="pet-extra-agent" key={index}>
                  <PetField label="Agente">
                    <input
                      required
                      value={reading.agente}
                      onChange={(event) =>
                        setExtras((previous) =>
                          previous.map((row, position) =>
                            position === index ? { ...row, agente: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </PetField>
                  <PetField label="Unidade">
                    <input
                      required
                      value={reading.unidade}
                      onChange={(event) =>
                        setExtras((previous) =>
                          previous.map((row, position) =>
                            position === index ? { ...row, unidade: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </PetField>
                  <PetField label="Valor">
                    <input
                      required
                      inputMode="decimal"
                      value={reading.valor}
                      onChange={(event) =>
                        setExtras((previous) =>
                          previous.map((row, position) =>
                            position === index ? { ...row, valor: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </PetField>
                  <ActionButton
                    variant="ghost"
                    aria-label={`Remover agente adicional ${index + 1}`}
                    onClick={() =>
                      setExtras((previous) => previous.filter((_, position) => position !== index))
                    }
                  >
                    <Trash2 size={15} aria-hidden />
                  </ActionButton>
                </div>
              ))}
              <ActionButton
                variant="ghost"
                onClick={() =>
                  setExtras((previous) => [...previous, { agente: "", unidade: "", valor: "" }])
                }
              >
                <Plus size={15} aria-hidden /> Adicionar agente
              </ActionButton>
            </div>
          </details>
          {evidences && (
            <details className="nx-pet-accordion">
              <summary>Foto do instrumento e evidências</summary>
              <div>{evidences("avaliacao_atmosferica")}</div>
            </details>
          )}
          {(modelChanged || versionChanged) && (
            <p role="alert" className="nx-pet-notice" data-tone="attention">
              A PET ou o modelo foi atualizado. O preenchimento continua disponível para
              conferência.
              {versionChanged && !modelChanged && (
                <ActionButton
                  variant="ghost"
                  className="mt-3"
                  onClick={() => setOpeningVersion(detail.pet.version)}
                >
                  Conferi a versão atual · manter leituras
                </ActionButton>
              )}
            </p>
          )}
          {(error || errorMessage) && (
            <p role="alert" className="nx-pet-notice" data-tone="danger">
              {error || errorMessage} O preenchimento foi preservado.
            </p>
          )}
          <ActionButton
            type="submit"
            loading={busy}
            disabled={modelChanged || versionChanged || !canRecord || !model || !readings.length}
          >
            Registrar avaliação
          </ActionButton>
        </form>
      </OperationalDialog>
    </section>
  );
}

export function PetAcompanhamento({
  detail,
  options,
  onCommand,
  busy,
  documentos,
  contingencia,
  evidences,
  errorMessage,
  onEncerramento,
}: {
  detail: PetDetalhe;
  options: PetOpcoes;
  onCommand: PetExecute;
  busy: boolean;
  documentos?: ReactNode;
  contingencia?: ReactNode;
  evidences?: ((item: string) => ReactNode) | undefined;
  errorMessage?: string | undefined;
  onEncerramento?: (() => void) | undefined;
}) {
  const { theme } = usePetAppearance();
  const [now, setNow] = useState(Date.now());
  const [entrada, setEntrada] = useState<PetParticipante | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState("");
  const [action, setAction] = useState<"interromper" | "cancelar" | "trocar_vigia" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [tipoOcorrencia, setTipoOcorrencia] = useState("interrupcao");
  const [substituto, setSubstituto] = useState("");
  const exitRequests = useRef(new Map<string, PetUICommand>());
  const entryRequest = useRef<{ identity: string; command: PetUICommand } | null>(null);
  const actionRequest = useRef<{ identity: string; command: PetUICommand } | null>(null);
  const active = detail.intervalos.filter((interval) => !interval.saida_em);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const expired =
    !!detail.pet.emitida_em &&
    !detail.pet.encerrada_em &&
    now >= Date.parse(detail.pet.termino_previsto);
  const closed = ["encerrada", "cancelada"].includes(detail.pet.estado_documental);
  const issued = !!detail.pet.emitida_em;
  const canOperate = !!detail.permissoes["operar"] && !closed;
  const canEnter =
    canOperate &&
    issued &&
    !expired &&
    detail.pet.estado_documental === "emitida" &&
    ["liberada", "em_atividade"].includes(detail.pet.condicao_operacional) &&
    options.integracao_assinatura.configurada;
  const workers = detail.participantes.filter(
    (person) => person.funcao === "trabalhador" && !person.fim && !person.fim_vigencia,
  );
  const availableWorkers = workers.filter(
    (person) => !active.some((interval) => interval.pessoa_id === person.pessoa_id),
  );
  const substitutes = detail.participantes.filter(
    (person) => person.funcao === "substituto_vigia" && !person.fim && !person.fim_vigencia,
  );
  const currentWatch = detail.participantes.find(
    (person) => person.funcao === "vigia" && !person.fim && !person.fim_vigencia,
  );
  const canChangeWatch =
    canOperate &&
    issued &&
    !expired &&
    detail.pet.estado_documental === "emitida" &&
    substitutes.length > 0;
  function openAction(next: typeof action) {
    actionRequest.current = null;
    setAction(next);
    setMotivo("");
    setSubstituto("");
    setTipoOcorrencia("interrupcao");
  }
  async function act() {
    if (!action) return;
    const identity = JSON.stringify([action, motivo, substituto, tipoOcorrencia]);
    if (actionRequest.current?.identity !== identity)
      actionRequest.current = {
        identity,
        command: {
          comando: action,
          dados: {
            pet_id: detail.pet.id,
            expected_version: detail.pet.version,
            motivo,
            ...(action === "trocar_vigia" ? { pessoa_id: substituto } : {}),
            ...(action === "interromper"
              ? { tipo: tipoOcorrencia, momento: new Date().toISOString(), origem: "online" }
              : {}),
          },
        },
      };
    if (await onCommand(actionRequest.current.command)) setAction(null);
  }
  return (
    <div className="pet-operation-stack">
      <section className="nx-pet-panel pet-presence-panel">
        <div className="pet-presence-heading">
          <div>
            <p className="nx-pet-kicker">Operação em campo</p>
            <h2>Pessoas no espaço confinado</h2>
          </div>
          <PetStatus value={expired ? "expirada" : detail.pet.condicao_operacional} />
        </div>
        <div className="pet-presence-overview">
          <div className="pet-presence-total">
            <strong>{active.length.toString().padStart(2, "0")}</strong>
            <span>{active.length === 1 ? "pessoa no espaço" : "pessoas no espaço"}</span>
          </div>
          <div>
            <span>Vigia atual</span>
            <strong>
              {currentWatch
                ? currentWatch.nome_snapshot ||
                  currentWatch.nome ||
                  petHistoricalName(detail, options, currentWatch.pessoa_id)
                : "Não relacionado"}
            </strong>
          </div>
          <div>
            <span>Validade da PET</span>
            <strong>{petDate(detail.pet.termino_previsto, detail.pet.timezone)}</strong>
          </div>
        </div>
        {expired && (
          <p role="alert" className="nx-pet-notice" data-tone="danger">
            Validade encerrada. Novas entradas estão bloqueadas. {active.length} pessoa(s) ainda sem
            saída registrada; nenhuma saída é criada automaticamente.
          </p>
        )}
        {!issued && (
          <p className="nx-pet-notice" data-tone="attention">
            Rascunho não autoriza entrada. A operação depende da emissão e liberação válidas.
          </p>
        )}
        {active.length ? (
          <div className="pet-presence-list">
            {active.map((interval) => (
              <article
                className="pet-presence-person"
                key={`${interval.pessoa_id}:${interval.entrada_em}`}
              >
                <div className="pet-person-avatar" aria-hidden>
                  <UsersRound size={19} />
                </div>
                <div className="pet-person-identity">
                  <h3>
                    {interval.pessoa_nome ||
                      interval.nome ||
                      petHistoricalName(detail, options, interval.pessoa_id)}
                  </h3>
                  <p>Entrada {petDate(interval.entrada_em, detail.pet.timezone)}</p>
                </div>
                <div className="pet-person-time">
                  <strong>{petDuration((now - Date.parse(interval.entrada_em)) / 1000)}</strong>
                  <span>Em curso · contador visual</span>
                </div>
                <ActionButton
                  loading={busy}
                  disabled={!canOperate}
                  onClick={() => {
                    const identity = `${interval.pessoa_id}:${interval.entrada_em}`;
                    let request = exitRequests.current.get(identity);
                    if (!request) {
                      request = {
                        comando: "registrar_saida",
                        dados: {
                          pet_id: detail.pet.id,
                          expected_version: detail.pet.version,
                          pessoa_id: interval.pessoa_id,
                          momento: new Date().toISOString(),
                          origem: "online",
                          declaracao: DECLARACOES.saida,
                        },
                      };
                      exitRequests.current.set(identity, request);
                    }
                    return onCommand(request);
                  }}
                >
                  <ArrowUpFromLine size={16} aria-hidden /> Registrar saída agora
                </ActionButton>
              </article>
            ))}
          </div>
        ) : (
          <div className="pet-operation-empty pet-presence-empty">
            <ShieldCheck size={27} aria-hidden />
            <div>
              <h3>Nenhuma presença aberta</h3>
              <p>
                {issued
                  ? "A entrada é individual e depende das condições atuais da permissão."
                  : "Emitir a PET não inicia a permanência da equipe."}
              </p>
            </div>
          </div>
        )}
        {!options.integracao_assinatura.configurada && (
          <p className="pet-presence-integration">
            <strong>Integração não configurada</strong> · Novas entradas exigem assinatura
            certificada. A saída de uma presença existente pode ser registrada imediatamente e
            manter assinatura pendente.
          </p>
        )}
        {availableWorkers.length > 0 && (
          <details className="nx-pet-accordion pet-available-workers">
            <summary>
              Trabalhadores sem presença aberta <span>{availableWorkers.length}</span>
            </summary>
            <div>
              {availableWorkers.map((person) => (
                <div className="pet-available-person" key={person.id}>
                  <div>
                    <h3>
                      {person.nome_snapshot ||
                        person.nome ||
                        petHistoricalName(detail, options, person.pessoa_id)}
                    </h3>
                    <p>Trabalhador autorizado</p>
                  </div>
                  <ActionButton
                    variant="ghost"
                    disabled={!canEnter || busy}
                    onClick={() => {
                      setEntrada(person);
                      entryRequest.current = null;
                      setAccepted(false);
                      setSignature("");
                    }}
                  >
                    <ArrowDownToLine size={15} aria-hidden /> Registrar entrada
                  </ActionButton>
                </div>
              ))}
            </div>
          </details>
        )}
        {issued && !closed && onEncerramento && (
          <div className="pet-operation-next">
            <div>
              <h3>
                {active.length
                  ? "Encerramento depende das saídas"
                  : "Pronto para conferir o término"}
              </h3>
              <p>Condição final e pendências documentais em uma etapa própria.</p>
            </div>
            <ActionButton variant="ghost" onClick={onEncerramento}>
              Preparar encerramento <ArrowRight size={15} aria-hidden />
            </ActionButton>
          </div>
        )}
      </section>
      <section className="nx-pet-panel pet-operation-actions">
        <div>
          <h2>Durante o trabalho</h2>
          <p className="nx-pet-subtitle">
            Interromper não pausa a permanência. Registre também as saídas.
          </p>
        </div>
        <div className="nx-pet-actions">
          <ActionButton
            variant="danger"
            disabled={!issued || !canOperate || busy}
            onClick={() => openAction("interromper")}
          >
            <AlertTriangle size={16} aria-hidden /> Interrupção / emergência
          </ActionButton>
          <ActionButton
            variant="ghost"
            disabled={!canChangeWatch || busy}
            onClick={() => openAction("trocar_vigia")}
          >
            Passagem de vigia
          </ActionButton>
          {!issued && !closed && (
            <ActionButton
              variant="ghost"
              disabled={!canOperate || busy}
              onClick={() => openAction("cancelar")}
            >
              Cancelar rascunho
            </ActionButton>
          )}
        </div>
        <details className="nx-pet-accordion">
          <summary>Contatos de emergência e resgate</summary>
          <div>
            <p className="pet-preserved-text">
              {String(
                detail.pet.conteudo?.["contatos_emergencia"] ||
                  "Contatos não informados. Confira o procedimento aprovado.",
              )}
            </p>
            <p className="nx-pet-hint">
              O registro no aplicativo não aciona resgate. Use o canal operacional real e confirme o
              acionamento.
            </p>
          </div>
        </details>
        <details className="pet-continuity-disclosure">
          <summary>Continuidade formal</summary>
          <div>
            <ActionButton variant="ghost" disabled>
              Avaliar continuidade formal
            </ActionButton>
            <p className="nx-pet-hint">
              <strong>Integração não configurada · aditamento certificado.</strong> A continuidade
              exige as condições cumulativas do procedimento e documento certificado. A validade não
              é renovada automaticamente. Prepare nova PET ou siga a contingência física aprovada.
            </p>
          </div>
        </details>
      </section>
      <PetAvaliacoes
        detail={detail}
        options={options}
        onCommand={onCommand}
        busy={busy}
        evidences={evidences}
        errorMessage={errorMessage}
      />
      <details className="nx-pet-panel pet-operation-disclosure">
        <summary>
          <span>
            <Clock3 size={16} aria-hidden /> Tempos e registros individuais
          </span>
          <span>{detail.intervalos.length} intervalo(s)</span>
        </summary>
        <PetTemposOficiais detail={detail} />
        <PetRegistrosIndividuais detail={detail} options={options} />
      </details>
      {documentos && (
        <details className="nx-pet-panel pet-operation-disclosure pet-nested-panel">
          <summary>
            <span>Documentos da permissão</span>
            <span>{detail.documentos.length} artefato(s)</span>
          </summary>
          {documentos}
        </details>
      )}
      {contingencia}
      <details className="nx-pet-panel pet-operation-disclosure">
        <summary>
          <span>
            <History size={16} aria-hidden /> Histórico da permissão
          </span>
          <span>{detail.eventos?.length || 0} evento(s)</span>
        </summary>
        <PetHistoricoEventos detail={detail} />
      </details>
      <OperationalDialog
        open={!!entrada}
        onOpenChange={(open) => {
          if (!open) setEntrada(null);
        }}
        title="Confirmar entrada individual"
      >
        <form
          className="nx-pet pet-operation-form"
          data-pet-theme={theme}
          data-dirty={accepted || !!signature}
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();
            if (!entrada || !accepted || !signature || !canEnter) return;
            const identity = `${entrada.id}:${signature}`;
            if (entryRequest.current?.identity !== identity)
              entryRequest.current = {
                identity,
                command: {
                  comando: "registrar_entrada",
                  dados: {
                    pet_id: detail.pet.id,
                    expected_version: detail.pet.version,
                    pessoa_id: entrada.pessoa_id,
                    momento: new Date().toISOString(),
                    origem: "online",
                    declaracao: DECLARACOES.entrada,
                    assinatura_id: signature,
                  },
                },
              };
            if (await onCommand(entryRequest.current.command)) setEntrada(null);
          }}
        >
          <div className="pet-entry-person">
            <div className="pet-person-avatar" aria-hidden>
              <UsersRound size={20} />
            </div>
            <div>
              <h3>
                {entrada?.nome_snapshot ||
                  entrada?.nome ||
                  (entrada ? petHistoricalName(detail, options, entrada.pessoa_id) : "")}
              </h3>
              <p>Trabalhador autorizado · entrada individual</p>
            </div>
          </div>
          <p className="nx-pet-notice">{DECLARACOES.entrada}</p>
          <label className="pet-confirmation">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>Identidade e declaração conferidas pelo próprio signatário.</span>
          </label>
          <PetField
            label="Assinatura certificada desta entrada"
            hint="O servidor verifica pessoa, versão, finalidade e estado da assinatura."
          >
            <select
              required
              value={signature}
              onChange={(event) => setSignature(event.target.value)}
            >
              <option value="">Selecione a assinatura certificada</option>
              {detail.assinaturas
                .filter(
                  (item) =>
                    item.pessoa_id === entrada?.pessoa_id &&
                    item.finalidade === "entrada" &&
                    ["validada", "certificada_validada"].includes(item.estado),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.provedor || "Provedor"} · {petDate(item.assinada_em, detail.pet.timezone)}
                  </option>
                ))}
            </select>
          </PetField>
          {errorMessage && (
            <p role="alert" className="nx-pet-notice" data-tone="danger">
              {errorMessage} O preenchimento foi preservado.
            </p>
          )}
          <ActionButton
            type="submit"
            loading={busy}
            disabled={!accepted || !signature || !canEnter}
          >
            Confirmar entrada
          </ActionButton>
        </form>
      </OperationalDialog>
      <OperationalDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={
          action === "trocar_vigia"
            ? "Passagem formal de vigia"
            : action === "cancelar"
              ? "Cancelar rascunho"
              : "Registrar interrupção ou emergência"
        }
      >
        <form
          className="nx-pet pet-operation-form"
          data-pet-theme={theme}
          data-dirty={!!motivo || !!substituto || tipoOcorrencia !== "interrupcao"}
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void act();
          }}
        >
          {action === "trocar_vigia" && (
            <>
              <p className="nx-pet-notice">
                O substituto precisa estar relacionado à PET e ter assinatura certificada vinculada
                à emissão. Um vigia não relacionado exige encerramento.
              </p>
              <PetPicker
                label="Substituto previamente relacionado"
                value={substituto}
                options={substitutes.map((person) => ({
                  id: person.pessoa_id,
                  label:
                    person.nome_snapshot ||
                    person.nome ||
                    petHistoricalName(detail, options, person.pessoa_id),
                }))}
                onChange={setSubstituto}
                placeholder="Selecionar substituto"
              />
            </>
          )}
          {action === "interromper" && (
            <PetField label="Tipo de ocorrência">
              <select
                value={tipoOcorrencia}
                onChange={(event) => setTipoOcorrencia(event.target.value)}
              >
                <option value="interrupcao">Interrupção</option>
                <option value="condicao_imprevista">Condição não prevista</option>
                <option value="emergencia">Emergência</option>
              </select>
            </PetField>
          )}
          <PetField
            label={
              action === "interromper"
                ? "Ocorrência, motivo e medida imediata"
                : "Justificativa e observações"
            }
          >
            <textarea
              required
              minLength={5}
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
            />
          </PetField>
          {action === "interromper" && (
            <p className="nx-pet-hint">
              O aplicativo não aciona equipes externas. Em emergência, use os canais reais previstos
              no procedimento e confirme o acionamento.
            </p>
          )}
          {errorMessage && (
            <p role="alert" className="nx-pet-notice" data-tone="danger">
              {errorMessage} O preenchimento foi preservado.
            </p>
          )}
          <ActionButton
            type="submit"
            loading={busy}
            disabled={
              !canOperate || (action === "trocar_vigia" && (!canChangeWatch || !substituto))
            }
          >
            {action === "trocar_vigia"
              ? "Registrar passagem de vigia"
              : action === "cancelar"
                ? "Confirmar cancelamento"
                : "Registrar ocorrência"}
          </ActionButton>
        </form>
      </OperationalDialog>
    </div>
  );
}
