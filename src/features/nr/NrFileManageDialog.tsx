import { useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton } from "@/components/nexus/Page";
import { useCommandKey } from "@/features/operacao/components";
import { NrPicker } from "./NrEditor";
import { nrArquivoAlterar, nrArquivoCancelar } from "./files.functions";
import type { Norma } from "./domain";
export type ManagedNrFile = {
  id: string;
  nome: string;
  nome_exibicao?: string | null;
  version: number;
  pasta_id?: string | null;
  estado: string;
  cliente_id?: string;
  unidade_id?: string;
};
export type NrFileOperation = "renomear" | "mover" | "restaurar" | "arquivar";
export function NrFileManageDialog({
  org,
  norma,
  clienteId,
  unidadeId,
  arquivo,
  comando,
  onClose,
  onSaved,
}: {
  org: string;
  norma: Norma;
  clienteId: string;
  unidadeId: string;
  arquivo: ManagedNrFile;
  comando: NrFileOperation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const change = useServerFn(nrArquivoAlterar),
    archive = useServerFn(nrArquivoCancelar),
    keyFor = useCommandKey();
  const [name, setName] = useState(arquivo.nome_exibicao || arquivo.nome);
  const [folder, setFolder] = useState(arquivo.pasta_id || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guard = useRef(false);
  const element = useRef<HTMLDivElement>(null);
  const title = {
    renomear: "Alterar nome de exibição",
    mover: "Mover arquivo",
    restaurar: "Restaurar arquivo",
    arquivar: "Arquivar arquivo",
  }[comando];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      if (comando === "arquivar") {
        const payload = { organization_id: org, id: arquivo.id, motivo: reason };
        await archive({ data: { ...payload, chave: keyFor(payload) } });
      } else {
        const payload = {
          organization_id: org,
          id: arquivo.id,
          expected_version: arquivo.version,
          comando,
          dados:
            comando === "renomear"
              ? { nome_exibicao: name }
              : comando === "mover"
                ? { pasta_id: folder || null }
                : {},
        };
        await change({ data: { ...payload, chave: keyFor(payload) } });
      }
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "A alteração não foi concluída. O registro anterior foi preservado.",
      );
    } finally {
      setBusy(false);
      guard.current = false;
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="nr-overlay" />
        <Dialog.Content
          ref={element}
          className="nr-dialog"
          aria-describedby="nr-file-management-description"
          onOpenAutoFocus={(event) => {
            const field = element.current?.querySelector<HTMLElement>("input,textarea,select");
            if (field) {
              event.preventDefault();
              field.focus();
            }
          }}
        >
          <Dialog.Title className="nr-dialog-title">{title}</Dialog.Title>
          <Dialog.Description id="nr-file-management-description" className="nr-muted mt-2">
            {arquivo.nome_exibicao || arquivo.nome} · versão {arquivo.version}
          </Dialog.Description>
          <button
            type="button"
            className="nr-dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar operação de arquivo"
          >
            <X size={18} />
          </button>
          <form onSubmit={submit} className="nr-form">
            <fieldset disabled={busy}>
              {comando === "renomear" ? (
                <>
                  <label>
                    Nome de exibição *
                    <input
                      value={name}
                      required
                      minLength={1}
                      maxLength={500}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <p className="nr-muted">
                    O nome original, caminho de proveniência, identidade, hash e conteúdo físico
                    permanecem preservados.
                  </p>
                </>
              ) : comando === "mover" ? (
                <>
                  <NrPicker
                    org={org}
                    norma={norma}
                    recurso="pastas"
                    value={folder}
                    onChange={setFolder}
                    clienteId={clienteId}
                    unidadeId={unidadeId}
                    label="Pasta de destino"
                  />
                  <p className="nr-muted">
                    Mover altera somente a organização do acervo. O vínculo documental e os bytes
                    continuam os mesmos.
                  </p>
                </>
              ) : comando === "arquivar" ? (
                <>
                  <p>
                    O arquivo será retirado da lista ativa e poderá ser restaurado pela lixeira. A
                    operação não elimina os bytes. Retenções e documentos emitidos podem bloquear a
                    ação.
                  </p>
                  <label>
                    Motivo *
                    <textarea
                      value={reason}
                      required
                      minLength={3}
                      maxLength={4000}
                      rows={3}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                </>
              ) : (
                <p>
                  O servidor verificará contexto e conflito de nome antes de restaurar. Um registro
                  existente nunca será sobrescrito.
                </p>
              )}
            </fieldset>
            {error && (
              <p className="nr-feedback" role="alert">
                {error}
              </p>
            )}
            <div className="nr-form-footer">
              <span className="nr-muted">
                A alteração só será confirmada após resposta do servidor.
              </span>
              <div className="nr-actions">
                <ActionButton variant="ghost" disabled={busy} onClick={onClose}>
                  Cancelar
                </ActionButton>
                <ActionButton type="submit" loading={busy}>
                  {title}
                </ActionButton>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
