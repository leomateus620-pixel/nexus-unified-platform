import { useId, useState } from "react";
import {
  calculateHypotheticalPrevention,
  INCIDENT_SCOPE,
  INCIDENT_STATISTICS,
  INCIDENT_TOTALS,
  parseHypotheticalPercent,
} from "./incidentStatistics";
import { PREVENTION_CONTROLS, SILO_SOURCES, SOURCE_REVIEW_DATE } from "./sources";

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const maxAnnualCases = Math.max(...INCIDENT_STATISTICS.map((row) => row.total));

export function SourcesPanel() {
  return (
    <div className="silo-sources">
      <p>
        Fontes primárias conferidas em {SOURCE_REVIEW_DATE.split("-").reverse().join("/")}. Os dados
        ficam versionados no módulo; a reprodução não consulta sites externos.
      </p>
      <ol>
        {SILO_SOURCES.map((source) => (
          <li key={source.id}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.title} <span aria-label="abre em nova aba">↗</span>
            </a>
            <p>
              {source.institution} · {source.edition}
            </p>
            <p>
              <strong>Local:</strong> {source.locator}
            </p>
            <p>{source.purpose}</p>
            <p className="silo-note">{source.limitation}</p>
          </li>
        ))}
      </ol>
      <p className="silo-note">
        OSHA é referência internacional. NR-31 e NR-33 exigem avaliação de aplicabilidade. Fotos,
        fabricante e esta cena não certificam dimensões, ancoragem ou resgate.
      </p>
    </div>
  );
}

export interface IncidentAnalysisProps {
  onReplayPrevention?: () => void;
  onClose?: () => void;
}

/** Content for the viewer's accessible dialog; no simulation authority here. */
export function IncidentAnalysis({ onReplayPrevention, onClose }: IncidentAnalysisProps) {
  const hypothesisId = useId();
  const resultId = useId();
  const [hypotheticalInput, setHypotheticalInput] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const percent = parseHypotheticalPercent(hypotheticalInput);
  const hypothesis = percent === null ? null : calculateHypotheticalPrevention(percent);
  const inputInvalid = hypotheticalInput.trim().length > 0 && percent === null;

  return (
    <article className="silo-analysis">
      <p className="silo-eyebrow">Análise educativa</p>
      <h2>O fluxo é a condição que precisa ser eliminada</h2>
      <p>
        A reconstituição mostra uma entrada insegura seguida de descarga. O caminho sem conexão
        permite perda de apoio, aprisionamento e ocultação pela massa granular. A retenção precoce
        configurada limita o deslocamento do técnico conectado; ele permanece em emergência e
        depende da interrupção do fluxo e de retirada planejada.
      </p>
      <div className="silo-analysis-callout">
        <strong>A proteção ilustrada tem limites.</strong>
        <p>
          A comparação usa exposição local comparável e a mesma trajetória livre. A linha impõe uma
          restrição geométrica; não há içamento automático, simulação de cargas ou certificação. Um
          trava-quedas para queda livre não garante resposta ao engolfamento lento.
        </p>
      </div>
      <section aria-labelledby="silo-statistics-title">
        <h3 id="silo-statistics-title">Casos documentados · {INCIDENT_SCOPE.territory}</h3>
        <p>
          {INCIDENT_SCOPE.mechanism}. Período {INCIDENT_SCOPE.period}.
        </p>
        <div className="silo-stat-totals" aria-label="Totais de 2022 a 2025">
          <div>
            <strong>{INCIDENT_TOTALS.total}</strong>
            <span>casos documentados</span>
          </div>
          <div>
            <strong>{INCIDENT_TOTALS.fatal}</strong>
            <span>casos fatais</span>
          </div>
          <div>
            <strong>{INCIDENT_TOTALS.nonFatal}</strong>
            <span>casos não fatais</span>
          </div>
        </div>
        <div className="silo-chart-legend" aria-hidden="true">
          <span className="silo-fatal-key">Fatais</span>
          <span className="silo-nonfatal-key">Não fatais</span>
        </div>
        <table className="silo-statistics-table">
          <caption>Aprisionamento/engolfamento em grãos, por ano — Purdue University</caption>
          <thead>
            <tr>
              <th scope="col">Ano</th>
              <th scope="col">Distribuição</th>
              <th scope="col">Fatais</th>
              <th scope="col">Não fatais</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {INCIDENT_STATISTICS.map((row) => (
              <tr key={row.year}>
                <th scope="row">{row.year}</th>
                <td>
                  <div className="silo-stat-bar" aria-hidden="true">
                    <span
                      className="silo-stat-fatal"
                      style={{ width: `${(row.fatal / maxAnnualCases) * 100}%` }}
                    />
                    <span
                      className="silo-stat-nonfatal"
                      style={{ width: `${(row.nonFatal / maxAnnualCases) * 100}%` }}
                    />
                  </div>
                </td>
                <td>{row.fatal}</td>
                <td>{row.nonFatal}</td>
                <td>{row.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td />
              <td>{INCIDENT_TOTALS.fatal}</td>
              <td>{INCIDENT_TOTALS.nonFatal}</td>
              <td>{INCIDENT_TOTALS.total}</td>
            </tr>
          </tfoot>
        </table>
        <p className="silo-note">
          {INCIDENT_SCOPE.unit} {INCIDENT_SCOPE.limitations}
        </p>
        <p className="silo-note">{INCIDENT_SCOPE.ascertainment}</p>
        <p className="silo-note">Brasil: {INCIDENT_SCOPE.brazil}</p>
        <button
          type="button"
          aria-expanded={sourcesOpen}
          onClick={() => setSourcesOpen(!sourcesOpen)}
        >
          {sourcesOpen ? "Recolher fontes e critérios" : "Fontes e critérios"}
        </button>
        {sourcesOpen && <SourcesPanel />}
      </section>
      <section>
        <h3>Prevenção antes da entrada</h3>
        <ol>
          {PREVENTION_CONTROLS.map((control) => (
            <li key={control}>{control}</li>
          ))}
        </ol>
        {onReplayPrevention && (
          <button type="button" onClick={onReplayPrevention}>
            Rever prevenção correta
          </button>
        )}
        <details>
          <summary>Outros mecanismos de engolfamento</summary>
          <p>
            O cenário anima fluxo pela descarga. Em uma ponte/crosta, material aglomerado cobre um
            vazio e pode ceder sob o trabalhador, mesmo após interromper a descarga. Uma massa
            aderida à parede pode desmoronar sobre quem está próximo. São mecanismos distintos;
            parar o fluxo não elimina automaticamente esses riscos.
          </p>
        </details>
      </section>
      <section>
        <h3>Tempo, ventilação e indicadores</h3>
        <p>
          Batimentos são ilustrativos. SpO₂ é saturação periférica estimada, distinta do oxigênio
          ambiental e da ventilação; aqui não existe curva médica validada para engolfamento. O
          estágio sinaliza a emergência, inclusive quando a leitura fica indisponível.
        </p>
        <p className="silo-note">
          A OSHA cita perda de autoextração em cerca de 5 s e cobertura em 11 s para um trabalhador
          de aproximadamente 1,83 m sob a condição de fluxo descrita. Esses tempos não são prazo
          para morte, garantia de resgate ou calibração para soja. Nenhum indicador calcula
          diagnóstico ou sobrevivência neste módulo.
        </p>
      </section>
      <details className="silo-hypothesis">
        <summary>Cenário hipotético de prevenção</summary>
        <p>
          A série histórica não mede a eficácia deste sistema. Selecione sua própria hipótese para
          explorar somente a aritmética; nenhum percentual científico é sugerido.
        </p>
        <label htmlFor={hypothesisId}>Proporção hipotética escolhida por você (%)</label>
        <input
          id={hypothesisId}
          type="text"
          inputMode="decimal"
          value={hypotheticalInput}
          onChange={(event) => setHypotheticalInput(event.target.value)}
          aria-invalid={inputInvalid || undefined}
          aria-describedby={resultId}
          placeholder="Informe entre 0 e 100"
        />
        <div id={resultId} aria-live="polite">
          {inputInvalid && (
            <p>Informe um percentual entre 0 e 100, usando ponto ou vírgula decimal.</p>
          )}
          {hypothesis && (
            <>
              <p>
                <strong>
                  {hypothesis.roundedCases} casos fatais potencialmente evitados na hipótese
                  escolhida
                </strong>
              </p>
              <p>
                {hypothesis.documentedFatalCases} × ({numberFormat.format(hypothesis.percent)} ÷
                100)
                {" = "}
                {numberFormat.format(hypothesis.exactCases)} → {hypothesis.roundedCases}.
                Arredondamento ao inteiro mais próximo (metade para cima).
              </p>
              <p className="silo-note">
                Premissa: a proporção escolhida se aplicaria a estes casos documentados. Não é
                previsão, eficácia comprovada nem contagem observada de vidas salvas.
              </p>
            </>
          )}
          {!hypothesis && !inputInvalid && <p>O resultado aparece após informar uma hipótese.</p>}
        </div>
      </details>
      {onClose && (
        <button type="button" onClick={onClose}>
          Voltar à simulação
        </button>
      )}
    </article>
  );
}
