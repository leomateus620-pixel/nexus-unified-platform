import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Clock3, Plus } from "lucide-react";
import { ActionButton, EmptyState } from "@/components/nexus/Page";
import { OperationalDialog } from "@/features/operacao/components";
import { decimalCampo, DECLARACOES } from "./domain";
import { PetField } from "./PetEditor";
import { PetStatus } from "./ExecucaoWorkspace";
import { RetificacaoPet } from "./RetificacaoPet";
import {
  optionName,
  PET_FUNCOES,
  petDate,
  petInstant,
  petDuration,
  petLabel,
  type PetDetalhe,
  type PetExecute,
  type PetOpcoes,
  type PetParticipante,
} from "./ui-types";

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
  const [open, setOpen] = useState(false),
    [erro, setErro] = useState("");
  const [form, setForm] = useState({
    etapa: "inicial",
    instrumento: "",
    numero_serie: "",
    responsavel_id: "",
    momento: "",
    calibracao: "",
    origem: "leitura_direta",
    outro_agente: "",
    outro_unidade: "",
    outro_valor: "",
  });
  const [values, setValues] = useState({ O2: "", LIE: "", H2S: "", CO: "" });
  const labels = { O2: "Oxigênio", LIE: "Inflamáveis", H2S: "H₂S", CO: "CO" };
  const units = { O2: "%vol", LIE: "%LIE", H2S: "ppm", CO: "ppm" };
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  async function save() {
    setErro("");
    const leituras = Object.entries(values)
      .filter(([, v]) => v.trim())
      .map(([agente, value]) => ({
        agente,
        valor: decimalCampo(value),
        unidade: units[agente as keyof typeof units],
        origem: form.origem,
      }));
    if (!leituras.length || leituras.some((l) => l.valor === null)) {
      setErro("Informe leituras numéricas válidas. Você pode usar vírgula decimal.");
      return;
    }
    if (form.outro_agente) {
      const value = decimalCampo(form.outro_valor);
      if (value === null || !form.outro_unidade) {
        setErro("Informe o valor e a unidade do agente adicional.");
        return;
      }
      leituras.push({
        agente: form.outro_agente,
        valor: value,
        unidade: form.outro_unidade,
        origem: form.origem,
      });
    }
    if (
      await onCommand({
        comando: "registrar_avaliacao",
        dados: {
          pet_id: detail.pet.id,
          expected_version: detail.pet.version,
          etapa: form.etapa,
          instrumento: form.instrumento,
          numero_serie: form.numero_serie,
          responsavel_id: form.responsavel_id,
          calibracao: form.calibracao,
          momento: petInstant(form.momento, detail.pet.timezone),
          leituras,
        },
      })
    )
      setOpen(false);
  }
  const closed = ["encerrada", "cancelada"].includes(detail.pet.estado_documental);
  return (
    <section className="nx-pet-panel">
      <div className="nx-pet-section-top">
        <div>
          <h2>Avaliações atmosféricas</h2>
          <p className="nx-pet-subtitle">
            Leituras estruturadas com origem, instrumento e horário. Os limites pertencem ao
            procedimento versionado, sem limites universais copiados da folha.
          </p>
        </div>
        {!closed && detail.permissoes["operar"] && (
          <ActionButton variant="ghost" onClick={() => setOpen(true)}>
            <Plus size={15} aria-hidden className="mr-1 inline" /> Registrar avaliação
          </ActionButton>
        )}
      </div>
      {!detail.avaliacoes?.length ? (
        <EmptyState
          title="Nenhuma avaliação registrada"
          hint="Registre teste inicial, avaliação após ventilação/isolamento e reavaliações pertinentes."
        />
      ) : (
        <div className="nx-pet-list">
          {detail.avaliacoes.map((a) => (
            <article key={a.id} className="nx-pet-card">
              <div className="nx-pet-card-top">
                <div>
                  <h3>{petLabel(a.etapa)}</h3>
                  <p className="nx-pet-subtitle">
                    {petDate(a.momento, detail.pet.timezone)} · {a.instrumento} · série{" "}
                    {a.numero_serie}
                  </p>
                </div>
              </div>
              <div className="nx-pet-grid-three">
                {(a.leituras || detail.leituras.filter((l) => l.avaliacao_id === a.id)).map(
                  (l, i) => (
                    <div className="nx-pet-metric" key={`${l.agente}:${i}`}>
                      <dt>{l.agente}</dt>
                      <dd>
                        {Number(l.valor).toLocaleString("pt-BR", { maximumFractionDigits: 6 })}{" "}
                        <span className="text-sm">{l.unidade}</span>
                      </dd>
                      <p className="nx-pet-hint">{petLabel(l.origem)}</p>
                    </div>
                  ),
                )}
              </div>
              <p className="nx-pet-hint mt-3">Verificação / calibração: {a.calibracao}</p>
            </article>
          ))}
        </div>
      )}
      <OperationalDialog open={open} onOpenChange={setOpen} title="Registrar avaliação atmosférica">
        <form
          className="nx-pet space-y-5"
          data-dirty="true"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="nx-pet-grid">
            <PetField label="Etapa">
              <select value={form.etapa} onChange={(e) => set("etapa", e.target.value)}>
                <option value="inicial">Teste inicial</option>
                <option value="apos_ventilacao">Após ventilação / isolamento</option>
                <option value="reavaliacao">Reavaliação</option>
              </select>
            </PetField>
            <PetField
              label="Momento da avaliação"
              hint={`Fuso: ${detail.pet.timezone}. Horário real da leitura.`}
            >
              <input
                required
                type="datetime-local"
                value={form.momento}
                onChange={(e) => set("momento", e.target.value)}
              />
            </PetField>
            <PetField label="Instrumento / detector">
              <input
                required
                value={form.instrumento}
                onChange={(e) => set("instrumento", e.target.value)}
              />
            </PetField>
            <PetField label="Número de série">
              <input
                required
                value={form.numero_serie}
                onChange={(e) => set("numero_serie", e.target.value)}
              />
            </PetField>
            <PetField label="Responsável pela avaliação">
              <select
                required
                value={form.responsavel_id}
                onChange={(e) => set("responsavel_id", e.target.value)}
              >
                <option value="">Selecione a pessoa</option>
                {options.pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {optionName(p)}
                  </option>
                ))}
              </select>
            </PetField>
            <PetField label="Verificação / calibração aplicável">
              <textarea
                required
                value={form.calibracao}
                onChange={(e) => set("calibracao", e.target.value)}
              />
            </PetField>
            <PetField label="Origem das leituras">
              <select value={form.origem} onChange={(e) => set("origem", e.target.value)}>
                <option value="leitura_direta">Leitura direta no instrumento</option>
                <option value="registro_instrumento">Registro do instrumento</option>
                <option value="informada_posteriormente">
                  Informada posteriormente · requer conferência
                </option>
              </select>
            </PetField>
          </div>
          <div className="nx-pet-grid">
            {Object.keys(values).map((agent) => (
              <PetField
                key={agent}
                label={`${labels[agent as keyof typeof labels]} (${units[agent as keyof typeof units]})`}
                hint="Use ponto ou vírgula decimal."
              >
                <div className="flex items-center gap-3">
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={values[agent as keyof typeof values]}
                    onChange={(e) => setValues((v) => ({ ...v, [agent]: e.target.value }))}
                  />
                  <span className="shrink-0 text-xs">{units[agent as keyof typeof units]}</span>
                </div>
              </PetField>
            ))}
          </div>
          <details className="nx-pet-accordion">
            <summary>Outro agente pertinente</summary>
            <div className="nx-pet-grid">
              <PetField label="Agente">
                <input
                  value={form.outro_agente}
                  onChange={(e) => set("outro_agente", e.target.value)}
                />
              </PetField>
              <PetField label="Unidade">
                <input
                  value={form.outro_unidade}
                  onChange={(e) => set("outro_unidade", e.target.value)}
                />
              </PetField>
              <PetField label="Valor">
                <input
                  inputMode="decimal"
                  value={form.outro_valor}
                  onChange={(e) => set("outro_valor", e.target.value)}
                />
              </PetField>
            </div>
          </details>
          {erro && (
            <p role="alert" className="nx-pet-field-error">
              {erro}
            </p>
          )}
          <p className="nx-pet-hint">
            Uma foto do detector não substitui a leitura estruturada. Não são aplicados limites
            universais presumidos; a conferência usa os critérios do modelo aprovado.
          </p>
          {evidences && (
            <details className="nx-pet-accordion">
              <summary>Foto do instrumento e evidências</summary>
              <div>{evidences("avaliacao_atmosferica")}</div>
            </details>
          )}
          {errorMessage && (
            <p role="alert" className="nx-pet-notice" data-tone="danger">
              {errorMessage} O preenchimento foi preservado.
            </p>
          )}
          <ActionButton type="submit" loading={busy}>
            Confirmar avaliação no servidor
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
}: {
  detail: PetDetalhe;
  options: PetOpcoes;
  onCommand: PetExecute;
  busy: boolean;
  documentos?: ReactNode;
  contingencia?: ReactNode;
  evidences?: ((item: string) => ReactNode) | undefined;
  errorMessage?: string | undefined;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const [entrada, setEntrada] = useState<PetParticipante | null>(null),
    [accepted, setAccepted] = useState(false),
    [signature, setSignature] = useState("");
  const [action, setAction] = useState<
      "interromper" | "encerrar" | "prorrogar" | "cancelar" | "trocar_vigia" | null
    >(null),
    [motivo, setMotivo] = useState(""),
    [final, setFinal] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [novoTermino, setNovoTermino] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [tipoOcorrencia, setTipoOcorrencia] = useState("interrupcao");
  const [substituto, setSubstituto] = useState("");
  const [condicoes, setCondicoes] = useState<Record<string, boolean>>({});
  const prorrogacaoCondicoes = [
    ["mesmas_atividades_riscos", "Mesmas atividades e riscos, conforme procedimento"],
    ["pausas_atendidas", "Pausas e intervalos previstos foram atendidos"],
    ["mesma_equipe", "Mesma equipe de trabalhadores autorizados"],
    ["continuidade_mantida", "Continuidade do trabalho mantida e condições de saída avaliadas"],
    ["monitoramento_continuo", "Monitoramento atmosférico contínuo mantido durante a continuidade"],
    ["vigia_relacionado", "Vigia e eventuais substitutos formalmente relacionados à PET"],
    ["supervisor_presente", "Supervisor presente e condições reavaliadas para a decisão"],
  ] as const;
  const active = detail.intervalos.filter((i) => !i.saida_em);
  const expired =
    !!detail.pet.emitida_em &&
    !detail.pet.encerrada_em &&
    now >= Date.parse(detail.pet.termino_previsto);
  const closed = ["encerrada", "cancelada"].includes(detail.pet.estado_documental);
  const issued = !!detail.pet.emitida_em;
  const canEnter =
    detail.permissoes["operar"] &&
    issued &&
    !expired &&
    !closed &&
    ["liberada", "em_atividade"].includes(detail.pet.condicao_operacional) &&
    options.integracao_assinatura.configurada;
  const names = (person: string) =>
    detail.participantes.find((p) => p.pessoa_id === person)?.nome_snapshot ||
    detail.participantes.find((p) => p.pessoa_id === person)?.nome ||
    optionName(options.pessoas.find((p) => p.id === person));
  const workers = detail.participantes.filter(
    (p) => p.funcao === "trabalhador" && !(p as unknown as { fim?: string }).fim && !p.fim_vigencia,
  );
  async function act() {
    if (!action) return;
    const dados = {
      pet_id: detail.pet.id,
      expected_version: detail.pet.version,
      motivo,
      ...(action === "encerrar" ? { condicao_final: final, conferencia_presenca: confirmed } : {}),
      ...(action === "prorrogar"
        ? {
            termino_novo: petInstant(novoTermino, detail.pet.timezone),
            supervisor_id: supervisorId,
            condicoes,
          }
        : {}),
    };
    if (
      await onCommand({
        comando: action === "prorrogar" ? "avaliar_prorrogacao" : action,
        dados: {
          ...dados,
          ...(action === "trocar_vigia" ? { pessoa_id: substituto } : {}),
          ...(action === "interromper"
            ? { tipo: tipoOcorrencia, momento: new Date().toISOString(), origem: "online" }
            : {}),
        },
      })
    )
      setAction(null);
  }
  const openAction = (a: typeof action) => {
    setAction(a);
    setMotivo("");
    setFinal("");
    setConfirmed(false);
    setNovoTermino("");
    setCondicoes({});
    setSupervisorId("");
    setTipoOcorrencia("interrupcao");
    setSubstituto("");
  };
  return (
    <div className="space-y-5">
      <section className="nx-pet-panel">
        <div className="nx-pet-section-top">
          <div>
            <h2>Pessoas no espaço confinado</h2>
            <p className="nx-pet-subtitle">
              Tempo visual a partir das entradas persistidas. Os intervalos oficiais são apurados
              pelo servidor.
            </p>
          </div>
          <PetStatus value={expired ? "expirada" : detail.pet.condicao_operacional} />
        </div>
        {expired && (
          <div role="alert" className="nx-pet-notice mb-4" data-tone="danger">
            Validade encerrada. Novas entradas estão bloqueadas. {active.length} pessoa(s) ainda sem
            saída registrada; nenhuma saída é criada automaticamente.
          </div>
        )}
        {!issued && (
          <p className="nx-pet-notice mb-4">
            Rascunho ou documento em conferência: entrada bloqueada até a emissão e liberação
            válidas.
          </p>
        )}
        {active.length ? (
          <div>
            {active.map((i) => (
              <div className="nx-pet-row" key={`${i.pessoa_id}:${i.entrada_em}`}>
                <div>
                  <p className="nx-pet-card-title">
                    {i.pessoa_nome || i.nome || names(i.pessoa_id)}
                  </p>
                  <p className="nx-pet-hint">
                    Entrada: {petDate(i.entrada_em, detail.pet.timezone)}
                  </p>
                </div>
                <div>
                  <p className="nx-pet-timer">
                    {petDuration((now - Date.parse(i.entrada_em)) / 1000)}
                  </p>
                  <p className="nx-pet-hint">Permanência em curso · visualização</p>
                </div>
                <div className="nx-pet-actions">
                  <ActionButton
                    loading={busy}
                    onClick={() =>
                      onCommand({
                        comando: "registrar_saida",
                        dados: {
                          pet_id: detail.pet.id,
                          expected_version: detail.pet.version,
                          pessoa_id: i.pessoa_id,
                          momento: new Date().toISOString(),
                          origem: "online",
                          declaracao: DECLARACOES.saida,
                        },
                      })
                    }
                  >
                    <ArrowUpFromLine size={15} aria-hidden className="mr-2 inline" /> Registrar
                    saída agora
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhuma presença aberta"
            hint="Emitir a PET não inicia a permanência da equipe. A entrada é individual."
          />
        )}
        {workers
          .filter((p) => !active.some((i) => i.pessoa_id === p.pessoa_id))
          .map((p) => (
            <div className="nx-pet-row" key={p.id}>
              <div>
                <h3>{p.nome_snapshot || p.nome || names(p.pessoa_id)}</h3>
                <p className="nx-pet-hint">{PET_FUNCOES[p.funcao]} · Sem entrada aberta</p>
              </div>
              <ActionButton
                variant="ghost"
                disabled={!canEnter || busy}
                onClick={() => {
                  setEntrada(p);
                  setAccepted(false);
                  setSignature("");
                }}
              >
                <ArrowDownToLine size={15} aria-hidden className="mr-2 inline" /> Registrar entrada
              </ActionButton>
            </div>
          ))}
        {!options.integracao_assinatura.configurada && (
          <p className="nx-pet-hint mt-4">
            Integração não configurada: novas entradas exigem as assinaturas certificadas previstas
            no procedimento. A saída de uma presença existente pode ser registrada de imediato e
            manter assinatura pendente.
          </p>
        )}
      </section>
      <section className="nx-pet-panel">
        <h2>Tempo e registros individuais</h2>
        <p className="nx-pet-subtitle mb-5">
          As fontes permanecem separadas. Nenhum destes valores é transferido automaticamente para a
          OS, cobrança ou folha.
        </p>
        <dl className="nx-pet-grid-three">
          <div className="nx-pet-metric">
            <dt>Duração documental · servidor</dt>
            <dd className="!text-base">
              {petDuration(detail.metricas.duracao_documental_segundos)}
            </dd>
            <p className="nx-pet-hint">Emissão até encerramento da PET.</p>
          </div>
          <div className="nx-pet-metric">
            <dt>Horas-pessoa · servidor</dt>
            <dd className="!text-base">{petDuration(detail.metricas.horas_pessoa_segundos)}</dd>
            <p className="nx-pet-hint">Soma das permanências individuais.</p>
          </div>
          <div className="nx-pet-metric">
            <dt>Apontamento da OS</dt>
            <dd className="!text-base">Fonte própria</dd>
            <p className="nx-pet-hint">Sem integração automática de horas.</p>
          </div>
        </dl>
        <div className="nx-pet-table-scroll mt-5">
          <table className="nx-pet-table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Entrada</th>
                <th>Saída</th>
                <th>Permanência</th>
              </tr>
            </thead>
            <tbody>
              {detail.intervalos.map((i, index) => (
                <tr key={`${i.pessoa_id}:${index}`}>
                  <td>{i.pessoa_nome || i.nome || names(i.pessoa_id)}</td>
                  <td>{petDate(i.entrada_em, detail.pet.timezone)}</td>
                  <td>
                    {i.saida_em ? (
                      petDate(i.saida_em, detail.pet.timezone)
                    ) : (
                      <PetStatus value="Presença pendente" attention />
                    )}
                  </td>
                  <td>{i.saida_em ? petDuration(i.segundos) : "Em curso"}</td>
                </tr>
              ))}
              {!detail.intervalos.length && (
                <tr>
                  <td colSpan={4}>Nenhum intervalo registrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {detail.presencas
          .filter((p) => p.tipo === "saida" && p.assinatura_pendente)
          .map((p) => (
            <p className="nx-pet-notice mt-3" data-tone="attention" key={p.id}>
              {names(p.pessoa_id)} · Saída registrada; assinatura pendente. Fato:{" "}
              {petDate(p.momento_declarado || p.momento, detail.pet.timezone)}.
            </p>
          ))}
      </section>
      <section className="nx-pet-panel">
        <h2>Condição operacional</h2>
        <p className="nx-pet-subtitle mb-4">
          Interromper o trabalho não pausa a permanência de ninguém. Em emergência, consulte os
          canais previstos e registre o fato imediatamente.
        </p>
        <div className="nx-pet-actions">
          <ActionButton
            variant="ghost"
            disabled={!issued || closed || busy || !detail.permissoes["operar"]}
            onClick={() => openAction("interromper")}
          >
            <AlertTriangle size={15} aria-hidden className="mr-2 inline" /> Interrupção / emergência
          </ActionButton>
          <ActionButton
            variant="ghost"
            disabled={!issued || closed || busy || !detail.permissoes["operar"]}
            onClick={() => openAction("prorrogar")}
          >
            Avaliar continuidade formal
          </ActionButton>
          <ActionButton
            variant="ghost"
            disabled={!issued || closed || busy || !detail.permissoes["operar"]}
            onClick={() => openAction("trocar_vigia")}
          >
            Registrar passagem de vigia
          </ActionButton>
          <ActionButton
            disabled={!issued || closed || busy || !detail.permissoes["operar"]}
            onClick={() => openAction("encerrar")}
          >
            Preparar encerramento
          </ActionButton>
          {!issued && !closed && (
            <ActionButton variant="danger" disabled={busy} onClick={() => openAction("cancelar")}>
              Cancelar rascunho
            </ActionButton>
          )}
        </div>
        <details className="nx-pet-accordion mt-5">
          <summary>Procedimentos e contatos de emergência</summary>
          <div>
            <p className="whitespace-pre-wrap text-sm">
              {String(
                detail.pet.conteudo?.["contatos_emergencia"] ||
                  "Contatos não informados. Confira o procedimento aprovado da organização.",
              )}
            </p>
            <p className="nx-pet-hint mt-4">
              Este aplicativo não afirma ter acionado resgate. O acionamento depende do canal
              operacional real e de sua confirmação.
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
      <RetificacaoPet detail={detail} options={options} />
      {documentos}
      {contingencia}
      <section className="nx-pet-panel">
        <h2>Histórico da permissão</h2>
        <p className="nx-pet-subtitle">
          Ocorrências e decisões preservadas com autoria e referência temporal.
        </p>
        <div className="nx-pet-timeline">
          {detail.eventos?.length ? (
            detail.eventos.map((e) => (
              <div key={e.id}>
                <strong>{petLabel(e.tipo)}</strong>
                <p>
                  {petDate(e.momento || e.criado_em || e.created_at, detail.pet.timezone)}
                  {e.motivo ? ` · ${e.motivo}` : ""}
                </p>
              </div>
            ))
          ) : (
            <p className="nx-pet-hint">Nenhum evento operacional adicional.</p>
          )}
        </div>
      </section>
      <OperationalDialog
        open={!!entrada}
        onOpenChange={(open) => {
          if (!open) setEntrada(null);
        }}
        title="Confirmar entrada individual"
      >
        <div className="nx-pet space-y-5">
          <h3>
            {entrada?.nome_snapshot || entrada?.nome || (entrada ? names(entrada.pessoa_id) : "")}
          </h3>
          <p className="nx-pet-notice">{DECLARACOES.entrada}</p>
          <label className="flex min-h-12 gap-3 items-center text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />{" "}
            Identidade e declaração conferidas pelo próprio signatário.
          </label>
          <PetField
            label="Assinatura certificada vinculada a esta entrada"
            hint="Identificador validado pelo provedor. O servidor verifica signatário, versão, finalidade e estado; texto digitado não valida certificação."
          >
            <select value={signature} onChange={(e) => setSignature(e.target.value)}>
              <option value="">Selecione a assinatura certificada</option>
              {detail.assinaturas
                .filter(
                  (s) =>
                    s.pessoa_id === entrada?.pessoa_id &&
                    s.finalidade === "entrada" &&
                    ["validada", "certificada_validada"].includes(s.estado),
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.provedor} · {petDate(s.assinada_em)}
                  </option>
                ))}
            </select>
          </PetField>
          {errorMessage && (
            <p role="alert" className="nx-pet-notice" data-tone="danger">
              {errorMessage}
            </p>
          )}
          <ActionButton
            loading={busy}
            disabled={!accepted || !signature || !canEnter}
            onClick={async () => {
              if (
                entrada &&
                (await onCommand({
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
                }))
              )
                setEntrada(null);
            }}
          >
            Confirmar entrada no servidor
          </ActionButton>
        </div>
      </OperationalDialog>
      <OperationalDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={
          action === "encerrar"
            ? "Preparar encerramento"
            : action === "prorrogar"
              ? "Avaliação formal de continuidade"
              : action === "trocar_vigia"
                ? "Passagem formal de vigia"
                : action === "cancelar"
                  ? "Cancelar rascunho"
                  : "Registrar interrupção ou emergência"
        }
      >
        <form
          className="nx-pet space-y-5"
          data-dirty="true"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            void act();
          }}
        >
          {action === "trocar_vigia" && (
            <>
              <p className="nx-pet-notice">
                A troca exige substituto previamente relacionado à PET e sua assinatura certificada
                vinculada à emissão. Um vigia não relacionado exige encerramento; o histórico
                anterior será preservado.
              </p>
              <PetField label="Substituto previamente relacionado">
                <select required value={substituto} onChange={(e) => setSubstituto(e.target.value)}>
                  <option value="">Selecione o substituto relacionado</option>
                  {detail.participantes
                    .filter((p) => p.funcao === "substituto_vigia" && !p.fim)
                    .map((p) => (
                      <option value={p.pessoa_id} key={p.id}>
                        {p.nome_snapshot || names(p.pessoa_id)}
                      </option>
                    ))}
                </select>
              </PetField>
            </>
          )}
          {action === "encerrar" && (
            <>
              <p className="nx-pet-notice" data-tone={active.length ? "danger" : undefined}>
                {active.length
                  ? `${active.length} pessoa(s) ainda sem saída. O encerramento não cria saídas e será bloqueado.`
                  : "Não há presença aberta nesta consulta. O servidor confere novamente ao encerrar."}
              </p>
              <PetField label="Condição final do espaço e término do trabalho">
                <textarea required value={final} onChange={(e) => setFinal(e.target.value)} />
              </PetField>
              <label className="flex min-h-12 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                Conferência de presença e condição final realizada.
              </label>
              {evidences && evidences("situacao_final")}
            </>
          )}
          {action === "prorrogar" && (
            <>
              <div className="nx-pet-notice" data-tone="attention">
                A continuidade depende da conferência de todas as condições da NR-33, item
                33.5.12.1, e do procedimento aprovado. A validade total não pode ultrapassar 24
                horas. Não é uma renovação automática.
              </div>
              <PetField label="Novo término proposto">
                <input
                  required
                  type="datetime-local"
                  value={novoTermino}
                  onChange={(e) => setNovoTermino(e.target.value)}
                />
              </PetField>
              <PetField label="Supervisor responsável pela decisão">
                <select
                  required
                  value={supervisorId}
                  onChange={(e) => setSupervisorId(e.target.value)}
                >
                  <option value="">Selecione o supervisor identificado em sua sessão</option>
                  {detail.participantes
                    .filter((p) => p.funcao === "supervisor" && !p.fim)
                    .map((p) => (
                      <option key={p.id} value={p.pessoa_id}>
                        {p.nome_snapshot || names(p.pessoa_id)}
                      </option>
                    ))}
                </select>
              </PetField>
              <fieldset>
                <legend className="text-sm font-semibold">
                  Condições cumulativas · NR-33, 33.5.12.1
                </legend>
                {prorrogacaoCondicoes.map(([key, label]) => (
                  <label key={key} className="flex min-h-12 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={condicoes[key] === true}
                      onChange={(e) => setCondicoes((c) => ({ ...c, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <p className="nx-pet-hint">
                O servidor também exige procedimento que permita prorrogação, avaliação atual e
                aditamento certificado disponível. A marcação local não comprova a liberação.
              </p>
            </>
          )}
          {action === "interromper" && (
            <PetField label="Tipo de ocorrência">
              <select value={tipoOcorrencia} onChange={(e) => setTipoOcorrencia(e.target.value)}>
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
              onChange={(e) => setMotivo(e.target.value)}
            />
          </PetField>
          {action === "interromper" && (
            <p className="nx-pet-hint">
              O registro não aciona equipes externas. Em emergência, use os canais reais previstos
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
              action === "encerrar"
                ? active.length > 0 || !confirmed
                : action === "prorrogar"
                  ? prorrogacaoCondicoes.some(([key]) => !condicoes[key]) || !supervisorId
                  : false
            }
          >
            {action === "encerrar"
              ? "Registrar término e pendências"
              : action === "prorrogar"
                ? "Submeter condições ao servidor"
                : action === "trocar_vigia"
                  ? "Registrar passagem no servidor"
                  : action === "cancelar"
                    ? "Confirmar cancelamento"
                    : "Registrar ocorrência"}
          </ActionButton>
        </form>
      </OperationalDialog>
    </div>
  );
}
