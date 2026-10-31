import { nrLocalProposalChanges } from "./local-technical";
import { NrValue, nrLabel } from "./technical-display";

function CapturedValue({ present, value }: { present: boolean; value: unknown }) {
  if (!present) return <span className="nr-muted">Campo ausente no registro capturado</span>;
  return value && typeof value === "object" ? (
    <details>
      <summary>Consultar valor capturado</summary>
      <NrValue value={value} />
    </details>
  ) : (
    <NrValue value={value} />
  );
}

/** Before/after comes from the exact value captured before an edit, never a narrative. */
export function NrLocalProposedChanges({ value }: { value: Record<string, unknown> }) {
  const changes = nrLocalProposalChanges(value);
  if (!changes.length) return null;
  return (
    <details className="nr-panel">
      <summary>
        Alterações propostas na Nexus · {changes.length} {changes.length === 1 ? "campo" : "campos"}{" "}
        aguardando revisão
      </summary>
      <p className="nr-source">
        O valor anterior foi capturado antes da primeira edição de cada campo registrada neste
        marcador. A autoria, a data e a validação da origem referem-se aos valores históricos e não
        aprovam a proposta atual. Cálculos preservados não foram refeitos.
      </p>
      <div
        className="nr-table-wrap"
        role="region"
        tabIndex={0}
        aria-label="Comparação das alterações propostas"
      >
        <table className="nr-technical-table">
          <caption>Valores anteriores capturados e propostas de revisão na Nexus</caption>
          <thead>
            <tr>
              <th scope="col">Campo</th>
              <th scope="col">Valor anterior capturado</th>
              <th scope="col">Valor proposto na Nexus</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.path}>
                <th scope="row">
                  {change.path.split(".").map((part, index) => (
                    <span key={index}>
                      {index > 0 ? " · " : ""}
                      {change.path.startsWith("geometria.") && part === "altura"
                        ? "Altura (m)"
                        : nrLabel(part)}
                    </span>
                  ))}
                </th>
                <td>
                  {change.before ? (
                    <CapturedValue present={change.before.presente} value={change.before.valor} />
                  ) : (
                    <span className="nr-muted">
                      Valor anterior não capturado neste marcador. A comparação depende do histórico
                      de versões.
                    </span>
                  )}
                </td>
                <td>
                  <CapturedValue present={change.after.presente} value={change.after.valor} />
                  <small className="nr-badge">Proposta · revisão pendente</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
