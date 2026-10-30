import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { useCommandKey } from "@/features/operacao/components";
import type { Norma, NrRecord } from "./domain";
import { nrRevisarImpactos } from "./impactos.functions";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function NrDocumentImpacts({
  org,
  norma,
  row,
}: {
  org: string;
  norma: Norma;
  row: NrRecord;
}) {
  const run = useServerFn(nrRevisarImpactos),
    keyFor = useCommandKey(),
    qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const raw = row as NrRecord & {
    base_version_atual?: number | null;
    pode_revisar_impactos?: boolean;
    bloqueio_revisao_impactos?: string | null;
    impactos_pendentes?: number;
    revisao_atual_id?: string | null;
  };
  const impacts = (row.impactos ?? []).map(object);
  const pending = impacts.filter((item) => item["estado"] === "pendente");
  const currentAffected = pending.some(
    (impact) => impact["revisao_origem_id"] === raw.revisao_atual_id,
  );
  const canReview =
    raw.pode_revisar_impactos === true &&
    row.estado === "rascunho" &&
    !row.arquivado_em &&
    !currentAffected &&
    !!raw.revisao_atual_id &&
    !!raw.base_version_atual;
  async function submit() {
    if (busy || !raw.revisao_atual_id || !raw.base_version_atual) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        organization_id: org,
        norma,
        documento_id: row.id,
        revisao_id: raw.revisao_atual_id,
        expected_version: row.version,
        base_expected_version: raw.base_version_atual,
        motivo: reason,
      };
      const result = await run({ data: { ...payload, chave: keyFor(payload) } });
      setOpen(false);
      setNotice(
        `${result.impactos_revisados} impactos conferidos na revisão em rascunho. Esta conferência não emite ou assina o documento.`,
      );
      await qc.invalidateQueries({ queryKey: ["nr", org] });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível registrar a conferência. Seu motivo foi preservado.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!impacts.length && !row.revisao_necessaria) return null;
  return (
    <section className="nr-panel my-4" aria-label="Impactos de alterações da base">
      {row.revisao_necessaria ? (
        <>
          <div className="nr-actions">
            <AlertCircle size={20} aria-hidden />
            <h3 className="font-semibold">A base vinculada mudou · revisão necessária</h3>
          </div>
          <p className="nr-muted mt-2">
            {raw.impactos_pendentes ?? pending.length}{" "}
            {(raw.impactos_pendentes ?? pending.length) === 1
              ? "impacto pendente"
              : "impactos pendentes"}
            . O conteúdo e o snapshot anteriores permanecem preservados. Confira as alterações e
            trate-as em uma nova revisão.
          </p>
        </>
      ) : (
        <p className="nr-notice">
          <CheckCircle2 size={17} aria-hidden />
          As alterações registradas foram conferidas em revisão própria. O histórico permanece
          disponível.
        </p>
      )}
      <details className="my-3">
        <summary className="cursor-pointer min-h-11">
          Alterações e conferências · {impacts.length}{" "}
          {impacts.length === 1 ? "registro recente" : "registros recentes"}
        </summary>
        {impacts.map((impact, index) => (
          <div key={String(impact["id"] ?? index)} className="nr-source">
            <strong>
              Base {String(impact["base_version_anterior"])} → {String(impact["base_version_nova"])}{" "}
              · {String(impact["estado"])}
            </strong>
            <p className="nr-muted">
              Campos:{" "}
              {Array.isArray(impact["campos_alterados"])
                ? impact["campos_alterados"].map(String).join(", ")
                : "Consultar registro"}
            </p>
            <details>
              <summary className="cursor-pointer min-h-11">Comparar valores preservados</summary>
              <dl>
                {Object.entries(object(impact["alteracoes"])).map(([field, value]) => {
                  const pair = object(value);
                  return (
                    <div key={field} className="my-3">
                      <dt className="font-semibold">{field}</dt>
                      <dd className="nr-prewrap break-words">
                        Anterior:{" "}
                        {typeof pair["anterior"] === "object"
                          ? JSON.stringify(pair["anterior"], null, 2)
                          : String(pair["anterior"] ?? "Não informado")}
                        <br />
                        Novo:{" "}
                        {typeof pair["novo"] === "object"
                          ? JSON.stringify(pair["novo"], null, 2)
                          : String(pair["novo"] ?? "Não informado")}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </details>
            {!!impact["motivo"] && (
              <p className="nr-prewrap">Conferência: {String(impact["motivo"])}</p>
            )}
          </div>
        ))}
      </details>
      {notice && (
        <p role="status" className="nr-notice">
          {notice}
        </p>
      )}
      {row.revisao_necessaria &&
        (canReview ? (
          <>
            {!open ? (
              <ActionButton variant="ghost" onClick={() => setOpen(true)}>
                Registrar conferência dos impactos
              </ActionButton>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <label>
                  Conferência, decisões e evidências *
                  <textarea
                    rows={4}
                    autoFocus
                    required
                    minLength={3}
                    maxLength={4000}
                    disabled={busy}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <p className="nr-muted my-2">
                  O servidor exige vínculo profissional ativo, confere a versão da base e registra a
                  revisão e o hash considerados. A ação não representa aprovação, emissão ou
                  assinatura.
                </p>
                {error && (
                  <p className="nr-feedback" role="alert">
                    {error}
                  </p>
                )}
                <div className="nr-actions">
                  <ActionButton variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                    Continuar revisão depois
                  </ActionButton>
                  <ActionButton type="submit" loading={busy}>
                    Confirmar conferência
                  </ActionButton>
                </div>
              </form>
            )}
          </>
        ) : (
          <p className="nr-source">
            {!raw.pode_revisar_impactos
              ? raw.bloqueio_revisao_impactos ||
                "A conferência técnica não está disponível para seu vínculo atual."
              : row.arquivado_em
                ? "Restaure o documento antes de registrar a conferência."
                : "Crie uma nova revisão em rascunho para registrar a conferência dos impactos. A revisão afetada permanece preservada."}
          </p>
        ))}
    </section>
  );
}
