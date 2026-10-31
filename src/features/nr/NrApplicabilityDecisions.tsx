import type { NrJson } from "./domain";
import { NrStructuredValue } from "./NrStructuredValue";
import { nrLabel, nrObject } from "./technical-display";
import { sourceDate } from "./technical-evidence";

const text = (value: unknown) => (typeof value === "string" ? value : "");
const norms = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => (item === "NR33" ? "NR-33" : item === "NR35" ? "NR-35" : item))
        .join(" · ")
    : "Não informado";
const results: Record<string, string> = {
  aplicada: "Recorte documental atualizado",
  mantida: "Recorte preservado",
  pendente_analise: "Análise de aplicabilidade pendente",
  pendente_divergencia: "Não aplicado · registro divergente",
  sem_correspondencia: "Não aplicado · vínculo não conciliado",
};
const decisions: Record<string, string> = {
  incluir_nr35: "Incluir consulta pela NR-35",
  manter_recorte: "Manter o recorte registrado",
  revisao_pendente: "Encaminhar para análise de aplicabilidade",
};
const known = new Set([
  "id",
  "versao",
  "decisao",
  "resultado",
  "normas_anteriores",
  "normas_decididas",
  "normas_aplicadas",
  "justificativa",
  "motivo_resultado",
  "evidencias",
  "fonte_sha256",
  "externo_id",
  "aprovacao_profissional",
  "autoriza_operacao",
  "created_at",
]);
const fields: Record<string, string> = {
  titulo: "Título",
  descricao: "Descrição",
  desfecho: "Desfecho histórico",
  conclusao: "Conclusão histórica",
  encaminhamento: "Encaminhamento",
};

/** A conciliação é consultada por registro; não cria validação técnica ou poderes retroativos. */
export function NrApplicabilityDecisions({ value }: { value: NrJson[] | undefined }) {
  if (!value?.length) return null;
  return (
    <section className="nr-panel my-4" aria-label="Decisões de aplicabilidade documental">
      <h3 className="font-semibold">Enquadramento e conciliação documental</h3>
      <p className="nr-muted mt-1">
        Decisões sobre a organização do acervo, com a evidência e a versão utilizadas.
      </p>
      {value.map((entry, index) => {
        const item = nrObject(entry),
          evidence = Array.isArray(item["evidencias"]) ? item["evidencias"] : [];
        const extra = Object.fromEntries(Object.entries(item).filter(([key]) => !known.has(key)));
        return (
          <article
            key={text(item["id"]) || index}
            className="nr-source my-3"
            aria-label={`Decisão documental ${index + 1}`}
          >
            <div className="nr-actions">
              <strong>
                {results[text(item["resultado"])] ??
                  nrLabel(text(item["resultado"]) || "resultado_nao_informado")}
              </strong>
              <span className="nr-muted">{sourceDate(item["created_at"])}</span>
            </div>
            <p className="mt-2">
              {decisions[text(item["decisao"])] ??
                nrLabel(text(item["decisao"]) || "decisao_nao_informada")}
            </p>
            <dl className="nr-facts my-3">
              <div>
                <dt>Normas anteriores</dt>
                <dd>{norms(item["normas_anteriores"])}</dd>
              </div>
              <div>
                <dt>Escopo da decisão</dt>
                <dd>{norms(item["normas_decididas"])}</dd>
              </div>
              <div>
                <dt>Normas após a execução</dt>
                <dd>{norms(item["normas_aplicadas"])}</dd>
              </div>
              <div>
                <dt>Versão da conciliação</dt>
                <dd className="break-words">{text(item["versao"]) || "Não informada"}</dd>
              </div>
            </dl>
            <p className="font-medium">Justificativa</p>
            <p className="nr-prewrap mt-1">
              {text(item["justificativa"]) || "Justificativa não informada."}
            </p>
            {text(item["motivo_resultado"]) && (
              <p className="nr-prewrap mt-2">{text(item["motivo_resultado"])}</p>
            )}
            {evidence.length > 0 && (
              <div className="mt-3">
                <h4 className="font-medium">Evidência da própria pendência de origem</h4>
                {evidence.map((raw, evidenceIndex) => {
                  const proof = nrObject(raw);
                  return (
                    <blockquote key={evidenceIndex} className="border-l-2 border-border pl-3 my-2">
                      <p className="text-sm nr-muted">
                        {fields[text(proof["campo"])] ??
                          nrLabel(text(proof["campo"]) || "campo_de_origem")}
                      </p>
                      <p className="nr-prewrap">
                        {text(proof["trecho"]) || "Trecho não informado."}
                      </p>
                    </blockquote>
                  );
                })}
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer font-medium">
                Fonte e rastreabilidade da decisão
              </summary>
              <dl className="nr-facts mt-2">
                <div>
                  <dt>Identidade na origem</dt>
                  <dd className="break-words">{text(item["externo_id"]) || "Não informada"}</dd>
                </div>
                <div>
                  <dt>SHA-256 da fonte preservada</dt>
                  <dd className="break-all">{text(item["fonte_sha256"]) || "Não informado"}</dd>
                </div>
              </dl>
              {evidence.map((raw, evidenceIndex) => {
                const proof = nrObject(raw);
                return text(proof["campo_sha256"]) ? (
                  <p className="text-sm mt-2 break-all" key={evidenceIndex}>
                    SHA-256 do campo {fields[text(proof["campo"])] ?? nrLabel(text(proof["campo"]))}
                    : {text(proof["campo_sha256"])}
                  </p>
                ) : null;
              })}
              <p className="nr-muted mt-2">
                A conciliação documental mantém as aprovações profissionais e a autorização
                operacional nos seus fluxos próprios.
              </p>
              {Object.keys(extra).length > 0 && (
                <NrStructuredValue value={extra} title="Outras informações preservadas" />
              )}
            </details>
          </article>
        );
      })}
    </section>
  );
}
