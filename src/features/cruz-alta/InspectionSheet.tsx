import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronRight, FileCheck2, FileText, RefreshCw } from "lucide-react";
import { cruzAlta } from "./context";
import { objects } from "./manifest";
import { caInspectionOpen, caInspectionReview, caInspectionSyncNow } from "./inspection.functions";
import {
  formatInspectionDate,
  inspectDueStatus,
  inspectionFields,
  type CaInspectionEvidence,
  type CaInspectionLine,
  type CaInspectionSummary,
  type InspectionField,
} from "./inspection-domain";

const Pdf = lazy(() =>
  import("@/features/nr/NrOriginalPreview").then((module) => ({
    default: module.NrOriginalPreview,
  })),
);
const fieldLabels: Record<InspectionField, string> = {
  installation: "Instalação",
  rt: "Responsabilidade técnica (RT)",
  inspection: "Última inspeção",
  due: "Próxima inspeção",
};
const dueLabels = {
  current: "Prazo vigente",
  soon: "Vence em até 30 dias",
  overdue: "Prazo vencido",
  unknown: "Prazo a confirmar",
};
const documentState = {
  pending: "Em revisão",
  approved: "Conferido",
  dismissed: "Descartado na revisão",
  historical: "Histórico",
};
type OpenEvidence = (id: string, page: number) => void;

function evidenceCaption(evidence: CaInspectionEvidence) {
  return `${evidence.kind === "laudo" ? "Laudo" : "Placa"} · rev. ${evidence.revision} · p. ${evidence.page}`;
}
function SourceButton({
  evidence,
  onOpen,
}: {
  evidence: CaInspectionEvidence;
  onOpen: OpenEvidence;
}) {
  return (
    <button
      type="button"
      className="ca-inspection-source"
      onClick={() => onOpen(evidence.id, evidence.page)}
      aria-label={`Abrir ${evidence.title}, revisão ${evidence.revision}, página ${evidence.page}`}
    >
      <FileText size={13} aria-hidden="true" />
      {evidenceCaption(evidence)}
    </button>
  );
}
function actionError(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível confirmar a operação.";
}

export function InspectionSourcesReader({
  user,
  object,
  summary,
  evidenceId,
  page,
  pending,
}: {
  user: string;
  object: string;
  summary: CaInspectionSummary | undefined;
  evidenceId: string;
  page: number | undefined;
  pending: boolean;
}) {
  const open = useServerFn(caInspectionOpen);
  const line = summary?.lines.find(({ key }) => key === object);
  const references = line
    ? [line.restriction, ...Object.values(line.fields), ...line.documents]
    : [];
  const evidence = page
    ? references.find((item) => item?.id === evidenceId && item.page === page)
    : (line?.documents.find((item) => item.id === evidenceId) ??
      references.find((item) => item?.id === evidenceId));
  const authorize = () =>
    open({ data: { organization_id: cruzAlta.org, key: object, id: evidenceId } });
  const q = useQuery({
    queryKey: ["cruz-alta-evidencia", user, cruzAlta.org, object, evidence?.id],
    queryFn: authorize,
    enabled: !!evidence,
    retry: false,
    gcTime: 0,
  });

  if (pending) return <p role="status">Conferindo a evidência no acervo privado…</p>;
  if (!evidence)
    return (
      <p role="alert" className="ca-feedback">
        A evidência está indisponível para esta linha.
      </p>
    );
  return (
    <>
      <header className="ca-reader-title">
        <h3>{evidence.title}</h3>
        <p>
          {evidenceCaption(evidence)}{" "}
          <span className="ca-version">{documentState[evidence.state]}</span>
        </p>
      </header>
      {q.isError ? (
        <>
          <p role="alert" className="ca-feedback">
            {actionError(q.error)}
          </p>
          <button className="ca-action" onClick={() => void q.refetch()}>
            Tentar novamente
          </button>
        </>
      ) : q.data ? (
        <Suspense fallback={<p role="status">Preparando o leitor…</p>}>
          <Pdf
            org={cruzAlta.org}
            url={q.data.url}
            file={{
              id: q.data.id,
              nome: q.data.title,
              mime: q.data.mime,
              tamanho: q.data.size,
              sha256: q.data.sha256,
            }}
            authorizePreview={authorize}
            showOriginalLink={false}
            initialPage={evidence.page}
          />
        </Suspense>
      ) : (
        <p role="status">Preparando prévia privada…</p>
      )}
    </>
  );
}

const byKey = new Map(objects.map((object) => [object.id, object]));

export function RelatedInspections({
  object,
  lines,
  onOpen,
}: {
  object: string;
  lines: CaInspectionLine[];
  onOpen: (id: string) => void;
}) {
  const related = lines.filter((line) => {
    let current = byKey.get(line.key)?.parent;
    while (current) {
      if (current === object) return true;
      current = byKey.get(current)?.parent;
    }
    return false;
  });
  if (!related.length) return null;
  return (
    <section className="ca-detail-section ca-inspections-related">
      <h3>
        <FileCheck2 size={17} aria-hidden="true" /> Laudos e inspeções
      </h3>
      <ul>
        {related.map((line) => {
          const item = byKey.get(line.key);
          const due = inspectDueStatus(line.fields.due?.value ?? null);
          return (
            <li key={line.key}>
              <button type="button" onClick={() => onOpen(line.key)}>
                <span>
                  <strong>{item?.name}</strong>
                  <small>
                    Próxima inspeção · {formatInspectionDate(line.fields.due?.value)}
                    {line.status === "review"
                      ? " · Em revisão"
                      : line.status === "stale"
                        ? " · Atualização pendente"
                        : ""}
                  </small>
                </span>
                <span className="ca-inspection-deadline" data-state={due}>
                  {dueLabels[due]}
                </span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function InspectionSection({
  object,
  summary,
  pending,
  onOpen,
  refresh,
}: {
  object: string;
  summary: CaInspectionSummary | undefined;
  pending: boolean;
  onOpen: OpenEvidence;
  refresh: () => Promise<unknown>;
}) {
  const isUnit = object === "unidade";
  const line = summary?.lines.find(({ key }) => key === object);
  const due = inspectDueStatus(line?.fields.due?.value ?? null);
  const configured = summary && summary.status !== "not_configured";
  const reviews = line?.reviews ?? (line?.review ? [line.review] : []);
  const sync = useServerFn(caInspectionSyncNow);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [error, setError] = useState("");
  const lastSync = summary?.lastSync ? new Date(summary.lastSync) : null;

  return (
    <section className="ca-detail-section ca-inspection-sheet">
      <header>
        <h3>
          <FileCheck2 size={18} aria-hidden="true" /> Laudos e inspeções
        </h3>
        {line && (
          <span className="ca-inspection-deadline" data-state={due}>
            {dueLabels[due]}
          </span>
        )}
      </header>
      {pending ? (
        <p role="status">Consultando laudos e inspeções…</p>
      ) : !summary ? (
        <p>Consulta de laudos indisponível.</p>
      ) : !configured ? (
        <p>Integração não configurada.</p>
      ) : !line && !isUnit ? (
        <p>Nenhum laudo associado a esta linha.</p>
      ) : null}
      {isUnit && configured && (
        <>
          <p>{summary.lines.length} linhas com registros de laudos ou inspeções.</p>
          {lastSync && !Number.isNaN(lastSync.getTime()) && (
            <p className="ca-hint">
              Última sincronização{" "}
              {lastSync.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </p>
          )}
          {summary.status === "failed" && (
            <p className="ca-feedback" role="status">
              A última tentativa de sincronização não foi concluída.
            </p>
          )}
          {summary.canReview && (
            <button
              type="button"
              className="ca-action"
              disabled={syncing || summary.status === "running"}
              onClick={async () => {
                setSyncing(true);
                setSyncStatus("");
                setError("");
                try {
                  const result = await sync({ data: { organization_id: cruzAlta.org } });
                  await refresh();
                  setSyncStatus(
                    result.queued > 0
                      ? "Sincronização solicitada."
                      : "A conferência já está na fila ou foi feita recentemente.",
                  );
                } catch (error) {
                  setError(actionError(error));
                } finally {
                  setSyncing(false);
                }
              }}
            >
              <RefreshCw size={15} aria-hidden="true" />{" "}
              {syncing || summary.status === "running" ? "Sincronizando…" : "Sincronizar agora"}
            </button>
          )}
          {syncStatus && <p role="status">{syncStatus}</p>}
          {error && (
            <p role="alert" className="ca-feedback">
              {error}
            </p>
          )}
        </>
      )}
      {isUnit && summary?.canReview && !!summary.unmatched?.length && (
        <details className="ca-inspection-documents">
          <summary>Arquivos aguardando identificação ({summary.unmatched.length})</summary>
          <ul>
            {summary.unmatched.map((document) => (
              <li key={document.id}>
                <strong>{document.title}</strong>
                <p className="ca-hint">
                  {document.issues.join(" · ") || "Vínculo com a linha de vida a confirmar."}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {line && (
        <>
          {line.status !== "verified" && (
            <p className="ca-inspection-caution">
              <AlertTriangle size={15} aria-hidden="true" />
              {line.status === "review"
                ? reviews.length
                  ? "Há evidência em revisão."
                  : "Há registros a confirmar."
                : "A sincronização deste registro está pendente."}
            </p>
          )}
          <dl className="ca-metadata ca-inspection-dates">
            {inspectionFields.map((field) => {
              const datum = line.fields[field];
              return (
                <div key={field}>
                  <dt>{fieldLabels[field]}</dt>
                  <dd>{formatInspectionDate(datum?.value)}</dd>
                  {datum && (
                    <dd>
                      <SourceButton evidence={datum} onOpen={onOpen} />
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
          {line.restriction && (
            <section className="ca-inspection-restriction">
              <h4>
                <AlertTriangle size={15} aria-hidden="true" /> Restrição registrada
              </h4>
              <p>{line.restriction.text}</p>
              <SourceButton evidence={line.restriction} onOpen={onOpen} />
            </section>
          )}
          <p className="ca-hint">
            O prazo e as restrições aqui apresentados são registros documentais. A liberação de uso
            segue a avaliação operacional da linha.
          </p>
          {!!line.documents.length && (
            <details className="ca-inspection-documents">
              <summary>Documentos de evidência ({line.documents.length})</summary>
              <ul>
                {line.documents.map((document) => (
                  <li key={document.id + "/" + document.page}>
                    <strong>{document.title}</strong>
                    <span className="ca-version">{documentState[document.state]}</span>
                    <SourceButton evidence={document} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            </details>
          )}
          {summary?.canReview &&
            reviews.map((review) => (
              <InspectionReview
                key={review.id + "/" + line.version}
                line={line}
                review={review}
                onOpen={onOpen}
                refresh={refresh}
              />
            ))}
        </>
      )}
    </section>
  );
}

function InspectionReview({
  line,
  review,
  onOpen,
  refresh,
}: {
  line: CaInspectionLine;
  review: NonNullable<CaInspectionLine["review"]>;
  onOpen: OpenEvidence;
  refresh: () => Promise<unknown>;
}) {
  const submitReview = useServerFn(caInspectionReview);
  const [adopt, setAdopt] = useState<InspectionField[]>([]);
  const [restriction, setRestriction] = useState<"adopt" | "keep" | "remove" | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const evidence = line.documents.find((document) => document.id === review.id);
  async function apply(action: "approve" | "dismiss") {
    setError("");
    if ((action === "dismiss" || restriction === "remove") && !note.trim()) {
      setError("Informe o motivo para registrar esta decisão.");
      return;
    }
    if (action === "approve" && !restriction) {
      setError("Escolha como tratar a restrição.");
      return;
    }
    setBusy(true);
    try {
      await submitReview({
        data: {
          organization_id: cruzAlta.org,
          key: line.key,
          version: line.version,
          evidence: review.id,
          action,
          ...(action === "approve" && restriction ? { adopt, restriction } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      await refresh();
    } catch (error) {
      setError(actionError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="ca-inspection-review">
      <summary>Validar a restrição e as datas</summary>
      {evidence && <SourceButton evidence={evidence} onOpen={onOpen} />}
      {!!review.reasons.length && (
        <ul>
          {review.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}
      {review.restriction && <p className="ca-inspection-candidate">{review.restriction}</p>}
      {!!review.fields?.length && (
        <fieldset>
          <legend>Datas a adotar desta evidência</legend>
          {review.fields.map((field) => (
            <label className="ca-inspection-choice" key={field}>
              <input
                type="checkbox"
                checked={adopt.includes(field)}
                onChange={(event) =>
                  setAdopt((current) =>
                    event.target.checked
                      ? [...current, field]
                      : current.filter((key) => key !== field),
                  )
                }
              />
              <span>
                {fieldLabels[field]}{" "}
                <small>Atual: {formatInspectionDate(line.fields[field]?.value)}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <label>
        Decisão sobre a restrição
        <select
          value={restriction}
          onChange={(event) => setRestriction(event.target.value as typeof restriction)}
        >
          <option value="">Escolha uma decisão</option>
          {review.restriction && <option value="adopt">Adotar o texto da evidência</option>}
          <option value="keep">Manter o registro atual</option>
          {line.restriction && <option value="remove">Remover a restrição registrada</option>}
        </select>
      </label>
      <label>
        Motivo da decisão
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} />
      </label>
      {error && (
        <p role="alert" className="ca-feedback">
          {error}
        </p>
      )}
      <div className="ca-actions">
        <button
          type="button"
          className="ca-action ca-primary"
          disabled={busy}
          onClick={() => void apply("approve")}
        >
          Confirmar validação
        </button>
        <button
          type="button"
          className="ca-action"
          disabled={busy}
          onClick={() => void apply("dismiss")}
        >
          Descartar evidência
        </button>
      </div>
    </details>
  );
}
