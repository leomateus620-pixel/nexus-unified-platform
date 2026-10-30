import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileClock,
  LockKeyhole,
} from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { PetField } from "./PetEditor";
import { PetStatus } from "./ExecucaoWorkspace";
import { RetificacaoPet } from "./RetificacaoPet";
import {
  PetAssinaturasConsulta,
  PetCorrecoesConsulta,
  PetRegistrosIndividuais,
  PetTemposOficiais,
} from "./PetResumo";
import { petExitSignaturePending, petFinalSnapshot } from "./operation-presentation";
import { petDate, type PetDetalhe, type PetExecute, type PetOpcoes } from "./ui-types";
import "./pet-operations.css";

export function PetEncerramento({
  detail,
  options,
  onCommand,
  busy,
  errorMessage,
  evidences,
  documentos,
  contingencia,
  onDirtyChange,
  onOperation,
}: {
  detail: PetDetalhe;
  options: PetOpcoes;
  onCommand: PetExecute;
  busy: boolean;
  errorMessage?: string | undefined;
  evidences?: ((item: string) => ReactNode) | undefined;
  documentos?: ReactNode;
  contingencia?: ReactNode;
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
  onOperation?: (() => void) | undefined;
}) {
  const snapshot = petFinalSnapshot(detail);
  const [form, setForm] = useState(() => ({
    condicaoFinal: snapshot?.condicaoFinal || "",
    motivo: snapshot?.motivo || "",
    conferencia: !!snapshot,
  }));
  const [saved, setSaved] = useState(() => JSON.stringify(form));
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const version = useRef(detail.pet.version);
  const [localVersion, setLocalVersion] = useState(detail.pet.version);
  const dirty = JSON.stringify(form) !== saved;
  const snapshotId = snapshot?.id;
  const finalCondition = snapshot?.condicaoFinal;
  const finalReason = snapshot?.motivo;
  useEffect(() => {
    if (detail.pet.version !== version.current && !dirty) {
      version.current = detail.pet.version;
      setLocalVersion(detail.pet.version);
      const next = {
        condicaoFinal: finalCondition || "",
        motivo: finalReason || "",
        conferencia: !!snapshotId,
      };
      setForm(next);
      setSaved(JSON.stringify(next));
    }
  }, [detail.pet.version, dirty, snapshotId, finalCondition, finalReason]);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const active = detail.intervalos.filter((interval) => !interval.saida_em);
  const closed = ["encerrada", "cancelada"].includes(detail.pet.estado_documental);
  const issued = !!detail.pet.emitida_em;
  const canOperate = !!detail.permissoes["operar"];
  const exitPending = petExitSignaturePending(detail);
  const currentFinal =
    !!snapshot && (!detail.pet.revisao_atual_id || detail.pet.revisao_atual_id === snapshot.id);
  const finalSigners = ["supervisor", "vigia"].filter(
    (role) =>
      !detail.assinaturas.some(
        (signature) =>
          signature.finalidade === "encerramento" &&
          signature.estado === "validada" &&
          signature.revisao_id === snapshot?.id &&
          detail.participantes.some(
            (person) => person.id === signature.participante_id && person.funcao === role,
          ),
      ),
  );
  const originalAvailable =
    !!snapshot &&
    detail.documentos.some((document) => {
      return (
        document.revisao_id === snapshot.id &&
        ["encerramento", "original_assinado"].includes(document.tipo) &&
        document.estado === "disponivel"
      );
    });
  const documentaryReady =
    currentFinal && !exitPending.length && !finalSigners.length && originalAvailable;
  const conflict = dirty && localVersion !== detail.pet.version;
  const termination = snapshot?.terminoOperacional || detail.pet.termino_operacional_em;
  async function submit() {
    setLocalError("");
    setNotice("");
    if (
      !form.conferencia ||
      form.condicaoFinal.trim().length < 10 ||
      form.motivo.trim().length < 5
    ) {
      setLocalError(
        "Confira a presença, descreva a condição final com ao menos 10 caracteres e justifique com ao menos 5.",
      );
      return;
    }
    if (
      await onCommand({
        comando: "encerrar",
        dados: {
          pet_id: detail.pet.id,
          expected_version: localVersion,
          condicao_final: snapshot?.condicaoFinal || form.condicaoFinal,
          motivo: snapshot?.motivo || form.motivo,
          conferencia_presenca: true,
        },
      })
    ) {
      setSaved(JSON.stringify(form));
      setNotice(
        snapshot
          ? "Conferência de encerramento recebida. Consulte a situação documental atualizada."
          : "Condição final registrada. O encerramento documental depende das assinaturas e do original certificado.",
      );
    }
  }
  return (
    <div className="pet-operation-stack">
      <section className="nx-pet-panel pet-closing-heading">
        <div className="pet-completed-icon">
          <ClipboardCheck size={27} aria-hidden />
        </div>
        <div>
          <p className="nx-pet-kicker">Concluir esta permissão</p>
          <h2>Encerramento</h2>
          <p className="nx-pet-subtitle">
            Confira a saída de todos e registre como o espaço foi deixado.
          </p>
        </div>
        <PetStatus value={detail.pet.estado_documental} />
      </section>
      <section className="nx-pet-panel">
        <div className="pet-closing-checks">
          <div data-complete={!active.length}>
            <span>
              {active.length ? (
                <Circle size={19} aria-hidden />
              ) : (
                <CheckCircle2 size={19} aria-hidden />
              )}
            </span>
            <div>
              <h3>
                {active.length
                  ? `${active.length} pessoa(s) com presença aberta`
                  : "Todas as presenças resolvidas"}
              </h3>
              <p>
                {active.length
                  ? "Registre cada saída antes de preparar o encerramento."
                  : "O servidor confere a presença novamente ao registrar."}
              </p>
            </div>
          </div>
          <div data-complete={!!termination}>
            <span>
              {termination ? (
                <CheckCircle2 size={19} aria-hidden />
              ) : (
                <Circle size={19} aria-hidden />
              )}
            </span>
            <div>
              <h3>
                {termination ? "Término operacional registrado" : "Conferência da condição final"}
              </h3>
              <p>
                {termination
                  ? petDate(termination, detail.pet.timezone)
                  : "Descreva a condição final e confirme a conferência de presença."}
              </p>
            </div>
          </div>
          <div data-complete={detail.pet.estado_documental === "encerrada"}>
            <span>
              <FileClock size={19} aria-hidden />
            </span>
            <div>
              <h3>
                {detail.pet.estado_documental === "encerrada"
                  ? "Documentação encerrada"
                  : "Documentação a concluir"}
              </h3>
              <p>
                Assinaturas de saída, assinaturas da revisão final e original certificado são
                conferidos separadamente.
              </p>
            </div>
          </div>
        </div>
        {active.length > 0 && (
          <div className="nx-pet-notice" data-tone="danger" role="alert">
            <p>
              O encerramento não cria saídas. Resolva as presenças abertas, mesmo com a validade
              encerrada ou trabalho interrompido.
            </p>
            {onOperation && (
              <ActionButton variant="ghost" onClick={onOperation}>
                <ArrowLeft size={15} aria-hidden /> Voltar às presenças
              </ActionButton>
            )}
          </div>
        )}
        {!issued && (
          <p className="nx-pet-notice" data-tone="attention">
            Esta PET ainda não foi emitida. O encerramento operacional exige uma permissão emitida.
          </p>
        )}
      </section>
      <section className="nx-pet-panel">
        <div className="nx-pet-section-top">
          <div>
            <h2>Condição final do espaço</h2>
            <p className="nx-pet-subtitle">
              {snapshot
                ? "Conteúdo preservado na revisão final. Abrir esta tela não cria outra revisão."
                : "Registre o término sem omitir pendências documentais."}
            </p>
          </div>
          {snapshot && (
            <span className="pet-inline-note">
              <LockKeyhole size={14} aria-hidden /> Revisão {snapshot.versao ?? "final"}
            </span>
          )}
        </div>
        <form
          className="pet-closing-form"
          data-dirty={dirty}
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <PetField label="Condição final do espaço e término do trabalho">
            <textarea
              required
              minLength={10}
              readOnly={!!snapshot || closed || !canOperate}
              disabled={!issued || busy}
              value={form.condicaoFinal}
              onChange={(event) =>
                setForm((value) => ({ ...value, condicaoFinal: event.target.value }))
              }
            />
          </PetField>
          <PetField label="Justificativa e observações">
            <textarea
              required
              minLength={5}
              readOnly={!!snapshot || closed || !canOperate}
              disabled={!issued || busy}
              value={form.motivo}
              onChange={(event) => setForm((value) => ({ ...value, motivo: event.target.value }))}
            />
          </PetField>
          {!snapshot && (
            <label className="pet-confirmation">
              <input
                type="checkbox"
                checked={form.conferencia}
                disabled={!issued || closed || !canOperate || busy}
                onChange={(event) =>
                  setForm((value) => ({ ...value, conferencia: event.target.checked }))
                }
              />
              <span>Conferência de presença e condição final realizada.</span>
            </label>
          )}
          {evidences && (
            <details className="nx-pet-accordion">
              <summary>Evidências da condição final</summary>
              <div>{evidences("situacao_final")}</div>
            </details>
          )}
          {conflict && (
            <div role="alert" className="nx-pet-notice" data-tone="attention">
              <p>
                A PET mudou em outro registro. Seu preenchimento foi preservado. Confira a versão
                atual antes de confirmar o encerramento.
              </p>
              {snapshot ? (
                <>
                  <details className="nx-pet-accordion mt-3">
                    <summary>Consultar conteúdo final preservado</summary>
                    <div>
                      <p>{snapshot.condicaoFinal}</p>
                      <p>{snapshot.motivo}</p>
                    </div>
                  </details>
                  <ActionButton
                    variant="ghost"
                    className="mt-3"
                    onClick={() => {
                      const next = {
                        condicaoFinal: snapshot.condicaoFinal,
                        motivo: snapshot.motivo,
                        conferencia: true,
                      };
                      setForm(next);
                      setSaved(JSON.stringify(next));
                      setLocalVersion(detail.pet.version);
                      version.current = detail.pet.version;
                    }}
                  >
                    Usar conteúdo final preservado
                  </ActionButton>
                </>
              ) : (
                <ActionButton
                  variant="ghost"
                  className="mt-3"
                  onClick={() => {
                    setLocalVersion(detail.pet.version);
                    version.current = detail.pet.version;
                  }}
                >
                  Conferi a versão atual · manter preenchimento
                </ActionButton>
              )}
            </div>
          )}
          {(localError || errorMessage) && (
            <p role="alert" className="nx-pet-notice" data-tone="danger">
              {localError || errorMessage} O preenchimento foi preservado.
            </p>
          )}
          {notice && (
            <p role="status" className="nx-pet-notice">
              <Check size={15} aria-hidden /> {notice}
            </p>
          )}
          {!closed && (
            <div className="pet-closing-submit">
              <p className="nx-pet-hint">
                {snapshot
                  ? "A revalidação utiliza o mesmo conteúdo final preservado."
                  : "O término pode ser registrado com assinaturas pendentes. Isso ainda não encerra a documentação."}
              </p>
              <ActionButton
                type="submit"
                loading={busy}
                disabled={
                  !issued ||
                  !detail.permissoes["operar"] ||
                  active.length > 0 ||
                  conflict ||
                  (!snapshot && !form.conferencia) ||
                  (!!snapshot && !documentaryReady)
                }
              >
                {snapshot ? "Concluir encerramento documental" : "Registrar término e pendências"}
              </ActionButton>
            </div>
          )}
        </form>
      </section>
      {snapshot && !closed && (
        <section className="nx-pet-panel">
          <h2>Pendências documentais</h2>
          <div className="pet-closing-pending">
            <p data-complete={!exitPending.length}>
              {!exitPending.length ? (
                <CheckCircle2 size={17} aria-hidden />
              ) : (
                <Circle size={17} aria-hidden />
              )}{" "}
              {exitPending.length
                ? `${exitPending.length} assinatura(s) de saída pendente(s)`
                : "Assinaturas individuais de saída sem pendências retornadas"}
            </p>
            <p data-complete={!finalSigners.length}>
              {!finalSigners.length ? (
                <CheckCircle2 size={17} aria-hidden />
              ) : (
                <Circle size={17} aria-hidden />
              )}{" "}
              {finalSigners.length
                ? `Assinaturas certificadas da revisão final: ${finalSigners.map((role) => (role === "vigia" ? "vigia" : "supervisor")).join(" e ")} pendente(s)`
                : "Assinaturas da revisão final registradas"}
            </p>
            <p data-complete={originalAvailable}>
              {originalAvailable ? (
                <CheckCircle2 size={17} aria-hidden />
              ) : (
                <Circle size={17} aria-hidden />
              )}{" "}
              {originalAvailable
                ? "Original certificado disponível"
                : "Original certificado do encerramento pendente"}
            </p>
          </div>
          {!options.integracao_assinatura.configurada && (
            <p className="nx-pet-notice" data-tone="attention">
              <strong>Integração não configurada</strong> · A certificação permanece indisponível. O
              término operacional e os registros de saída preservados continuam consultáveis.
            </p>
          )}
          <details className="nx-pet-accordion">
            <summary>Consultar assinaturas</summary>
            <div>
              <PetAssinaturasConsulta detail={detail} options={options} />
            </div>
          </details>
        </section>
      )}
      <details className="nx-pet-panel pet-operation-disclosure">
        <summary>
          <span>Presenças e tempos oficiais</span>
          <span>{detail.intervalos.length} intervalo(s)</span>
        </summary>
        <PetTemposOficiais detail={detail} />
        <PetRegistrosIndividuais detail={detail} options={options} />
      </details>
      {snapshot ? (
        <PetCorrecoesConsulta detail={detail} options={options} />
      ) : (
        <RetificacaoPet detail={detail} options={options} />
      )}
      {documentos}
      {contingencia}
    </div>
  );
}
