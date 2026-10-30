import type { ReactNode } from "react";
import { CheckCircle2, Clock3, FileCheck2, History, UsersRound, XCircle } from "lucide-react";
import { PetStatus } from "./ExecucaoWorkspace";
import { PET_CONTROLES } from "./PetEditor";
import { petDangerEvidenceItem } from "./evidence-context";
import {
  petExitSignaturePending,
  petFinalSnapshot,
  petHistoricalName,
} from "./operation-presentation";
import {
  PET_FUNCOES,
  optionName,
  petDate,
  petDuration,
  petLabel,
  petSnapshotOption,
  type PetDetalhe,
  type PetOpcoes,
} from "./ui-types";
import "./pet-operations.css";

export function PetTemposOficiais({ detail }: { detail: PetDetalhe }) {
  return (
    <dl className="pet-operation-metrics">
      <div>
        <dt>
          <Clock3 size={15} aria-hidden /> Duração documental
        </dt>
        <dd>{petDuration(detail.metricas.duracao_documental_segundos)}</dd>
        <p>Da emissão ao encerramento documental.</p>
      </div>
      <div>
        <dt>
          <UsersRound size={15} aria-hidden /> Horas-pessoa
        </dt>
        <dd>{petDuration(detail.metricas.horas_pessoa_segundos)}</dd>
        <p>Soma oficial das permanências individuais.</p>
      </div>
    </dl>
  );
}

export function PetRegistrosIndividuais({
  detail,
  options,
}: {
  detail: PetDetalhe;
  options: PetOpcoes;
}) {
  const pending = petExitSignaturePending(detail);
  return (
    <div className="pet-operation-records">
      <div className="nx-pet-table-scroll">
        <table className="nx-pet-table">
          <caption className="sr-only">Entradas, saídas e permanência oficial por pessoa</caption>
          <thead>
            <tr>
              <th scope="col">Pessoa</th>
              <th scope="col">Entrada</th>
              <th scope="col">Saída</th>
              <th scope="col">Permanência</th>
            </tr>
          </thead>
          <tbody>
            {detail.intervalos.map((interval, index) => (
              <tr key={`${interval.pessoa_id}:${interval.entrada_em}:${index}`}>
                <td data-label="Pessoa">
                  {interval.pessoa_nome ||
                    interval.nome ||
                    petHistoricalName(detail, options, interval.pessoa_id)}
                </td>
                <td data-label="Entrada">
                  {petDate(interval.entrada_em, detail.pet.timezone)}
                  {(interval as typeof interval & { entrada_original_em?: string })
                    .entrada_original_em &&
                    (interval as typeof interval & { entrada_original_em?: string })
                      .entrada_original_em !== interval.entrada_em && (
                      <small className="pet-original-time">
                        Original:{" "}
                        {petDate(
                          (interval as typeof interval & { entrada_original_em?: string })
                            .entrada_original_em,
                          detail.pet.timezone,
                        )}
                      </small>
                    )}
                </td>
                <td data-label="Saída">
                  {interval.saida_em ? (
                    <>
                      {petDate(interval.saida_em, detail.pet.timezone)}
                      {(interval as typeof interval & { saida_original_em?: string })
                        .saida_original_em &&
                        (interval as typeof interval & { saida_original_em?: string })
                          .saida_original_em !== interval.saida_em && (
                          <small className="pet-original-time">
                            Original:{" "}
                            {petDate(
                              (interval as typeof interval & { saida_original_em?: string })
                                .saida_original_em,
                              detail.pet.timezone,
                            )}
                          </small>
                        )}
                    </>
                  ) : (
                    <PetStatus value="Presença pendente" attention />
                  )}
                </td>
                <td data-label="Permanência">
                  {interval.saida_em ? petDuration(interval.segundos) : "Em curso"}
                </td>
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
      {pending.map((event) => (
        <p className="nx-pet-notice" data-tone="attention" key={event.id}>
          <strong>{petHistoricalName(detail, options, event.pessoa_id)}</strong> · Saída registrada;
          assinatura pendente.{" "}
          {petDate(event.momento_declarado || event.momento, detail.pet.timezone)}.
        </p>
      ))}
      <p className="nx-pet-hint">
        Tempos oficiais apurados pelo servidor. O apontamento da OS, a cobrança e a folha têm
        registros próprios.
      </p>
    </div>
  );
}

export function PetAvaliacoesConsulta({ detail }: { detail: PetDetalhe }) {
  return detail.avaliacoes?.length ? (
    <div className="pet-atmosphere-records">
      {detail.avaliacoes.map((assessment) => (
        <article key={assessment.id} className="pet-atmosphere-record">
          <div className="pet-atmosphere-record-heading">
            <div>
              <h3>{petLabel(assessment.etapa)}</h3>
              <p>{petDate(assessment.momento, detail.pet.timezone)}</p>
            </div>
            <span>
              {assessment.instrumento} · série {assessment.numero_serie}
            </span>
          </div>
          <dl className="pet-reading-values">
            {(
              assessment.leituras ||
              detail.leituras.filter((reading) => reading.avaliacao_id === assessment.id)
            ).map((reading, index) => (
              <div key={`${reading.agente}:${index}`}>
                <dt>{reading.agente}</dt>
                <dd>
                  {Number(reading.valor).toLocaleString("pt-BR", { maximumFractionDigits: 6 })}{" "}
                  <span>{reading.unidade}</span>
                </dd>
                <p>{petLabel(reading.origem)}</p>
              </div>
            ))}
          </dl>
          <p className="nx-pet-hint">Verificação / calibração: {assessment.calibracao}</p>
        </article>
      ))}
    </div>
  ) : (
    <p className="pet-operation-empty">Nenhuma avaliação registrada.</p>
  );
}

export function PetAssinaturasConsulta({
  detail,
  options,
}: {
  detail: PetDetalhe;
  options: PetOpcoes;
}) {
  return detail.assinaturas.length ? (
    <div className="pet-signature-list">
      {detail.assinaturas.map((signature) => (
        <article key={signature.id}>
          <div>
            <h3>{signature.nome || petHistoricalName(detail, options, signature.pessoa_id)}</h3>
            <p>
              {petLabel(signature.finalidade)} · {petLabel(signature.metodo)}
            </p>
          </div>
          <PetStatus value={signature.estado} />
          <div className="pet-signature-meta">
            <span>{signature.provedor || "Provedor não informado"}</span>
            <span>
              {petDate(
                signature.assinada_em || signature.criada_em || signature.created_at,
                detail.pet.timezone,
              )}
            </span>
          </div>
          {(signature.conteudo_sha256 || signature.conteudo_hash) && (
            <details className="pet-integrity-detail">
              <summary>Integridade do conteúdo</summary>
              <p>SHA-256: {signature.conteudo_sha256 || signature.conteudo_hash}</p>
            </details>
          )}
        </article>
      ))}
    </div>
  ) : (
    <p className="pet-operation-empty">Nenhuma assinatura registrada.</p>
  );
}

export function PetHistoricoEventos({ detail }: { detail: PetDetalhe }) {
  return detail.eventos?.length ? (
    <ol className="pet-operation-timeline">
      {detail.eventos.map((event) => (
        <li key={event.id}>
          <span aria-hidden />
          <div>
            <h3>{petLabel(event.tipo)}</h3>
            <time>
              {petDate(event.momento || event.criado_em || event.created_at, detail.pet.timezone)}
            </time>
            {event.motivo && <p>{event.motivo}</p>}
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <p className="pet-operation-empty">Nenhum evento operacional adicional.</p>
  );
}

export function PetCorrecoesConsulta({
  detail,
  options,
}: {
  detail: PetDetalhe;
  options: PetOpcoes;
}) {
  type Correction = {
    id: string;
    pessoa_id?: string;
    momento_original?: string;
    momento_corrigido?: string;
    motivo: string;
    solicitado_em?: string;
    created_at?: string;
  };
  type Decision = {
    id: string;
    retificacao_id: string;
    decisao: string;
    responsavel_id: string;
    motivo: string;
    decidido_em?: string;
    created_at?: string;
  };
  const record = detail as PetDetalhe & {
    retificacoes?: Correction[];
    retificacao_decisoes?: Decision[];
  };
  if (!record.retificacoes?.length) return null;
  return (
    <details className="nx-pet-panel pet-operation-disclosure">
      <summary>
        <span>Retificações e decisões</span>
        <span>{record.retificacoes.length} solicitação(ões)</span>
      </summary>
      <div className="pet-review-safety">
        {record.retificacoes.map((correction) => {
          const decisions =
            record.retificacao_decisoes?.filter(
              (decision) => decision.retificacao_id === correction.id,
            ) || [];
          return (
            <article key={correction.id}>
              <h3>
                {correction.pessoa_id
                  ? petHistoricalName(detail, options, correction.pessoa_id)
                  : "Correção de horário"}
              </h3>
              <dl className="pet-review-facts">
                <div>
                  <dt>Horário original</dt>
                  <dd>{petDate(correction.momento_original, detail.pet.timezone)}</dd>
                </div>
                <div>
                  <dt>Horário proposto</dt>
                  <dd>{petDate(correction.momento_corrigido, detail.pet.timezone)}</dd>
                </div>
              </dl>
              <p>{correction.motivo}</p>
              {decisions.length ? (
                decisions.map((decision) => (
                  <div className="pet-correction-decision" key={decision.id}>
                    <h3>
                      {decision.decisao === "aprovar" ? "Correção aprovada" : "Correção recusada"}
                    </h3>
                    <p>
                      {petHistoricalName(detail, options, decision.responsavel_id)} ·{" "}
                      {petDate(decision.decidido_em || decision.created_at, detail.pet.timezone)}
                    </p>
                    <p>{decision.motivo}</p>
                  </div>
                ))
              ) : (
                <p className="nx-pet-hint">
                  Solicitação pendente de decisão. O horário oficial permanece preservado.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </details>
  );
}

export function PetResumoConsulta({
  detail,
  options,
  documentos,
  evidences,
}: {
  detail: PetDetalhe;
  options: PetOpcoes;
  documentos?: ReactNode;
  evidences?: ((item: string) => ReactNode) | undefined;
}) {
  const cancelled = detail.pet.estado_documental === "cancelada";
  const issued = !!detail.pet.emitida_em;
  const final = petFinalSnapshot(detail);
  const content = detail.pet.conteudo || {};
  const dangers = Array.isArray(content["perigos"])
    ? (content["perigos"] as {
        grupo: string;
        perigo: string;
        medida: string;
        evidencia?: string;
      }[])
    : [];
  const procedures = content["procedimentos"] as Record<string, string> | undefined;
  const monitoring = content["monitoramento_continuo"] as
    { confirmado?: boolean; equipamento?: string; registro?: string } | undefined;
  const model =
    detail.modelo || options.modelos.find((item) => item.id === detail.pet.modelo_versao_id);
  const requirementLabels = new Map(PET_CONTROLES.flatMap((group) => group.itens));
  const procedure = model?.["procedimento"] as
    { itens?: { id: string; rotulo?: string }[] } | undefined;
  if (Array.isArray(procedure?.itens))
    for (const item of procedure.itens)
      if (item.rotulo) requirementLabels.set(item.id, item.rotulo);
  const procedureLabels: Record<string, string> = {
    bloqueio: "Bloqueio, travamento e etiquetagem",
    purga: "Purga / lavagem",
    ventilacao_tipo: "Ventilação / exaustão",
    ventilacao_equipamento: "Equipamento de ventilação",
    ventilacao_minutos: "Duração da ventilação (min)",
    comunicacao: "Comunicação",
    resgate: "Emergência e resgate",
    treinamentos: "Treinamentos e qualificações",
    dispositivo_verificacao: "Verificação do dispositivo",
    dispositivo_adequado: "Dispositivo adequado",
  };
  return (
    <div className="pet-operation-stack">
      <section
        className="nx-pet-panel pet-completed-heading"
        data-cancelled={cancelled || undefined}
      >
        <div className="pet-completed-icon">
          {cancelled ? <XCircle size={27} aria-hidden /> : <CheckCircle2 size={27} aria-hidden />}
        </div>
        <div>
          <p className="nx-pet-kicker">Consulta da permissão</p>
          <h2>{cancelled ? "Permissão cancelada" : "Permissão encerrada"}</h2>
          <p className="nx-pet-subtitle">
            {cancelled
              ? issued
                ? "Consulte o cancelamento e os registros preservados."
                : "Preparação cancelada. Esta PET não foi emitida para execução."
              : `Encerramento documental registrado em ${petDate(detail.pet.encerrada_em, detail.pet.timezone)}.`}
          </p>
        </div>
        <PetStatus value={detail.pet.estado_documental} />
      </section>
      <section className="nx-pet-panel">
        <div className="pet-section-label">
          <FileCheck2 size={17} aria-hidden />
          <h2>O trabalho registrado</h2>
        </div>
        <p className="pet-review-activity">{detail.pet.atividade}</p>
        <dl className="pet-review-facts">
          <div>
            <dt>Espaço confinado</dt>
            <dd>{optionName(petSnapshotOption(detail, "espaco") || detail.espaco)}</dd>
          </div>
          <div>
            <dt>OS vinculada</dt>
            <dd>{detail.os?.numero || "Não informada"}</dd>
          </div>
          <div>
            <dt>Emissão</dt>
            <dd>{issued ? petDate(detail.pet.emitida_em, detail.pet.timezone) : "Não emitida"}</dd>
          </div>
          <div>
            <dt>Jornada prevista</dt>
            <dd>{petDate(detail.pet.termino_previsto, detail.pet.timezone)}</dd>
          </div>
        </dl>
        {final && (
          <div className="pet-final-condition">
            <h3>Condição final</h3>
            <p>{final.condicaoFinal}</p>
            <p className="nx-pet-hint">{final.motivo}</p>
            {evidences && (
              <details className="nx-pet-accordion">
                <summary>Evidências da condição final</summary>
                <div>{evidences("situacao_final")}</div>
              </details>
            )}
          </div>
        )}
      </section>
      {issued && (
        <section className="nx-pet-panel">
          <h2>Tempos e presenças</h2>
          <PetTemposOficiais detail={detail} />
          <PetRegistrosIndividuais detail={detail} options={options} />
        </section>
      )}
      <PetCorrecoesConsulta detail={detail} options={options} />
      <details className="nx-pet-panel pet-operation-disclosure">
        <summary>
          <span>Equipe e responsabilidades</span>
          <span>{detail.participantes.length} vínculo(s)</span>
        </summary>
        <div className="pet-review-team">
          {detail.participantes.map((person) => (
            <article key={person.id}>
              <h3>
                {person.nome_snapshot ||
                  person.nome ||
                  petHistoricalName(detail, options, person.pessoa_id)}
              </h3>
              <p>
                {PET_FUNCOES[person.funcao] || petLabel(person.funcao)} ·{" "}
                {person.classificacao === "terceirizado"
                  ? `Terceirizado · ${person.empresa || "Empresa não informada"}`
                  : "Interno"}
              </p>
              <p className="nx-pet-hint">
                {petDate(person.inicio || person.inicio_vigencia, detail.pet.timezone)}
                {person.fim || person.fim_vigencia
                  ? ` até ${petDate(person.fim || person.fim_vigencia, detail.pet.timezone)}`
                  : " · vínculo registrado"}
              </p>
            </article>
          ))}
        </div>
      </details>
      <details className="nx-pet-panel pet-operation-disclosure">
        <summary>
          <span>Perigos, controles e procedimentos</span>
          <span>{dangers.length} perigo(s)</span>
        </summary>
        <div className="pet-review-safety">
          {dangers.map((danger, index) => (
            <article key={`${danger.grupo}:${danger.perigo}:${index}`}>
              <p className="nx-pet-kicker">{danger.grupo}</p>
              <h3>{danger.perigo}</h3>
              <p>{danger.medida}</p>
              {danger.evidencia && <p className="nx-pet-hint">{danger.evidencia}</p>}
              {evidences && (
                <details className="nx-pet-accordion">
                  <summary>Consultar evidências</summary>
                  <div>{evidences(petDangerEvidenceItem(danger.grupo, danger.perigo))}</div>
                </details>
              )}
            </article>
          ))}
          {detail.respostas.length > 0 && (
            <dl className="pet-review-facts">
              {detail.respostas.map((answer) => (
                <div key={answer.item}>
                  <dt>{requirementLabels.get(answer.item) || answer.item.replaceAll("_", " ")}</dt>
                  <dd>
                    {petLabel(answer.resposta)}
                    {answer.justificativa ? ` · ${answer.justificativa}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {procedures && (
            <dl className="pet-review-facts">
              {Object.entries(procedures)
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{procedureLabels[key] || petLabel(key)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
          )}
          {monitoring && (
            <div>
              <h3>Monitoramento atmosférico contínuo</h3>
              <dl className="pet-review-facts">
                <div>
                  <dt>Verificação de campo</dt>
                  <dd>
                    {monitoring.confirmado ? "Registrada conforme procedimento" : "Não confirmada"}
                  </dd>
                </div>
                <div>
                  <dt>Equipamento</dt>
                  <dd>{monitoring.equipamento || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Procedimento e registro</dt>
                  <dd>{monitoring.registro || "Não informado"}</dd>
                </div>
              </dl>
            </div>
          )}
          <div>
            <h3>Contatos de emergência e resgate</h3>
            <p>{String(content["contatos_emergencia"] || "Não informados")}</p>
          </div>
        </div>
      </details>
      <details className="nx-pet-panel pet-operation-disclosure">
        <summary>
          <span>Avaliações atmosféricas</span>
          <span>{detail.avaliacoes?.length || 0} registro(s)</span>
        </summary>
        <PetAvaliacoesConsulta detail={detail} />
      </details>
      <details className="nx-pet-panel pet-operation-disclosure">
        <summary>
          <span>Assinaturas e integridade</span>
          <span>{detail.assinaturas.length} registro(s)</span>
        </summary>
        <PetAssinaturasConsulta detail={detail} options={options} />
      </details>
      {documentos}
      <details className="nx-pet-panel pet-operation-disclosure">
        <summary>
          <span>
            <History size={16} aria-hidden /> Histórico da permissão
          </span>
          <span>{detail.eventos?.length || 0} evento(s)</span>
        </summary>
        <PetHistoricoEventos detail={detail} />
      </details>
    </div>
  );
}
