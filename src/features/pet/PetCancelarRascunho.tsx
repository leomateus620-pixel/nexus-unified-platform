import { useState } from "react";
import { XCircle } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { useOperationalAccess } from "@/features/operacao/access";
import { OperationalDialog } from "@/features/operacao/components";
import { PetField } from "./PetEditor";
import { usePetAppearance } from "./PetAppearance";
import type { PetDetalhe, PetExecute } from "./ui-types";
import "./pet-operations.css";

export function PetCancelarRascunho({
  detail,
  onCommand,
  busy,
  errorMessage,
}: {
  detail: PetDetalhe;
  onCommand: PetExecute;
  busy: boolean;
  errorMessage?: string | undefined;
}) {
  const session = useOrg();
  const access = useOperationalAccess(session.data?.orgId || "", session.data?.userId || "");
  const { theme } = usePetAppearance();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [expectedVersion, setExpectedVersion] = useState(detail.pet.version);
  const [localError, setLocalError] = useState("");
  const allowed =
    !session.isPending &&
    !session.isError &&
    !access.isPending &&
    !access.isError &&
    access.data?.gerirOperacao === true &&
    !detail.pet.emitida_em &&
    !["encerrada", "cancelada"].includes(detail.pet.estado_documental);
  const stale = expectedVersion !== detail.pet.version;
  async function cancel() {
    setLocalError("");
    if (!allowed || stale || !confirmed || motivo.trim().length < 5 || motivo.length > 4000) {
      setLocalError(
        stale
          ? "A PET mudou. O motivo foi preservado; confira a versão atual antes de tentar novamente."
          : "Informe o motivo com 5 a 4.000 caracteres e confirme o cancelamento.",
      );
      return;
    }
    if (
      await onCommand({
        comando: "cancelar",
        dados: { pet_id: detail.pet.id, expected_version: expectedVersion, motivo },
      })
    )
      setOpen(false);
  }
  if (!allowed) return null;
  return (
    <>
      <ActionButton
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setMotivo("");
          setConfirmed(false);
          setLocalError("");
          setExpectedVersion(detail.pet.version);
          setOpen(true);
        }}
      >
        <XCircle size={15} aria-hidden /> Cancelar rascunho
      </ActionButton>
      <OperationalDialog open={open} onOpenChange={setOpen} title="Cancelar rascunho da PET">
        <form
          className="nx-pet pet-operation-form"
          data-pet-theme={theme}
          data-dirty={!!motivo || confirmed}
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void cancel();
          }}
        >
          <p className="nx-pet-notice">
            O cancelamento preserva o histórico deste rascunho. A permissão não foi emitida e não
            autoriza entrada.
          </p>
          <PetField label="Motivo do cancelamento">
            <textarea
              required
              minLength={5}
              maxLength={4000}
              disabled={busy}
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
            />
          </PetField>
          <label className="pet-confirmation">
            <input
              type="checkbox"
              disabled={busy}
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>Confirmo o cancelamento deste rascunho da PET.</span>
          </label>
          {stale && (
            <p role="alert" className="nx-pet-notice" data-tone="attention">
              A PET mudou desde a abertura do formulário. O motivo permanece nesta tela. Confira a
              versão atual e reabra o cancelamento para usar a versão conferida.
            </p>
          )}
          {(localError || errorMessage) && (
            <p role="alert" className="nx-pet-notice" data-tone="danger">
              {localError || errorMessage} O preenchimento foi preservado.
            </p>
          )}
          <ActionButton
            type="submit"
            variant="danger"
            loading={busy}
            disabled={!confirmed || motivo.trim().length < 5 || motivo.length > 4000 || stale}
          >
            Confirmar cancelamento do rascunho
          </ActionButton>
        </form>
      </OperationalDialog>
    </>
  );
}
