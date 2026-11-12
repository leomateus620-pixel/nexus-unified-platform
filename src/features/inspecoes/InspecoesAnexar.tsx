import { useId, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Paperclip } from "lucide-react";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { sha256 } from "@/features/operacao/files";
import { supabase } from "@/integrations/supabase/client";
import { InspecoesArquivos } from "./InspecoesArquivos";
import { inspecoesUploadMimes, mimeInspecoes } from "./arquivo-formatos";
import {
  inspecoesAnexos,
  inspecoesLimiteEnvio,
  inspecoesUploadCancelar,
  inspecoesUploadConfirmar,
  inspecoesUploadReservar,
} from "./inspecoes-upload.functions";
import type { InspecoesEscopo } from "./ui-contract";

const uploadRoles = ["foto", "art", "ensaio", "evidencia"] as const;
const roleLabels = {
  foto: "Fotografia",
  art: "ART",
  ensaio: "Evidência de ensaio",
  evidencia: "Evidência",
};

export function InspecoesAnexar({
  escopo,
  queryKey,
  levantamentoId,
  tag,
  edit,
  aprovado,
  atualizar,
}: {
  escopo: InspecoesEscopo;
  queryKey: readonly string[];
  levantamentoId: string;
  tag: string;
  edit: boolean;
  aprovado: boolean;
  atualizar: () => void;
}) {
  const label = useId();
  const load = useServerFn(inspecoesAnexos);
  const reserve = useServerFn(inspecoesUploadReservar);
  const confirm = useServerFn(inspecoesUploadConfirmar);
  const cancel = useServerFn(inspecoesUploadCancelar);
  const client = useQueryClient();
  const data = { organizationId: escopo.organizationId, levantamentoId };
  const list = useQuery({
    queryKey: [...queryKey, "anexos-levantamento", levantamentoId],
    queryFn: ({ signal }) => load({ data, signal }),
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<(typeof uploadRoles)[number]>("foto");
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const input = useRef<HTMLInputElement>(null);
  const retry = useRef<{ key: string; fingerprint: string } | null>(null);
  const papel = aprovado ? "original" : role;
  const onlyPdf = papel === "art" || papel === "original";
  const accepts = onlyPdf
    ? "application/pdf"
    : papel === "foto"
      ? "image/jpeg,image/png,image/webp"
      : inspecoesUploadMimes.join(",");
  const pending = list.data?.filter((file) => file.estado === "envio_pendente") ?? [];
  const verified =
    list.data?.filter((file) => !["envio_pendente", "envio_cancelado"].includes(file.estado)) ?? [];

  async function enviar(event: FormEvent) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setStatus("Verificando o arquivo…");
    setError(null);
    try {
      if (file.size === 0 || file.size > inspecoesLimiteEnvio)
        throw new Error("Selecione um arquivo de até 20 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = mimeInspecoes(bytes);
      const mime = inspecoesUploadMimes.find((item) => item === type);
      if (
        !mime ||
        (onlyPdf && mime !== "application/pdf") ||
        (papel === "foto" && !mime.startsWith("image/"))
      )
        throw new Error("O formato do arquivo não corresponde ao papel escolhido.");
      const hash = await sha256(bytes);
      const legenda = caption.trim() || undefined;
      const fingerprint = JSON.stringify([papel, file.name, hash, legenda]);
      const same = pending.find(
        (row) =>
          row.sha256 === hash &&
          row.nome === file.name &&
          row.papel === papel &&
          (row.legenda || "") === (legenda || ""),
      );
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { key: same?.id ?? crypto.randomUUID(), fingerprint };
      const target = await reserve({
        data: {
          ...data,
          chave: retry.current.key,
          papel,
          nome: file.name,
          mime,
          bytes: file.size,
          sha256: hash,
          legenda,
        },
      });
      if (target.file.estado === "envio_pendente") {
        setStatus("Enviando para o acervo privado…");
        const sent = await supabase.storage.from("inspecoes-acervo").upload(target.caminho, file, {
          contentType: mime,
          upsert: false,
        });
        if (sent.error && !/already exists|duplicate/i.test(sent.error.message)) throw sent.error;
        setStatus("Confirmando o tamanho e o hash…");
        await confirm({ data: { organizationId: escopo.organizationId, id: target.file.id } });
      }
      retry.current = null;
      if (input.current) input.current.value = "";
      setCaption("");
      setStatus("Arquivo anexado e verificado.");
      setOpen(false);
      void client.invalidateQueries({
        queryKey: [...queryKey, "ensaios-levantamento", levantamentoId],
      });
      atualizar();
    } catch (cause) {
      setError(cause);
      setStatus("");
    } finally {
      await list.refetch();
      setBusy(false);
    }
  }

  async function cancelar(id: string) {
    setBusy(true);
    setError(null);
    setStatus("Cancelando envio…");
    try {
      await cancel({ data: { organizationId: escopo.organizationId, id } });
      if (retry.current?.key === id) retry.current = null;
      await list.refetch();
      atualizar();
      setStatus("Envio cancelado.");
    } catch (cause) {
      setError(cause);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="insp-stack" aria-labelledby={label}>
      <div className="insp-work-head">
        <h5 className="insp-subheading" id={label}>
          Anexos do levantamento
        </h5>
        {(edit || aprovado) && (
          <ActionButton variant="ghost" disabled={busy} onClick={() => setOpen((value) => !value)}>
            <Paperclip size={16} aria-hidden="true" />
            {open ? "Fechar envio" : aprovado ? "Vincular PDF da revisão" : "Anexar evidência"}
          </ActionButton>
        )}
      </div>
      {open && (edit || aprovado) && (
        <form className="insp-work-form" onSubmit={(e) => void enviar(e)}>
          {!aprovado && (
            <label className="insp-field">
              Papel do arquivo
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as typeof role);
                  if (input.current) input.current.value = "";
                }}
              >
                {uploadRoles.map((item) => (
                  <option key={item} value={item}>
                    {roleLabels[item]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="insp-field">
            Selecionar arquivo
            <input ref={input} type="file" accept={accepts} required disabled={busy} />
          </label>
          <label className="insp-field">
            Legenda
            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={2000}
              disabled={busy}
            />
          </label>
          <ActionButton loading={busy} type="submit">
            Enviar e verificar
          </ActionButton>
        </form>
      )}
      {status && (
        <p className="insp-feedback" role="status">
          {status}
        </p>
      )}
      {error != null && <ErrorState error={error} />}
      {list.isPending ? (
        <LoadingState label="Carregando anexos…" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <>
          {pending.length > 0 && (
            <ul className="insp-pending-files">
              {pending.map((file) => (
                <li key={file.id}>
                  <span>{file.nome} · Envio pendente</span>
                  {(edit || aprovado) && (
                    <ActionButton
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void cancelar(file.id)}
                    >
                      Cancelar envio
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {verified.length > 0 ? (
            <InspecoesArquivos
              files={verified}
              escopo={escopo}
              queryKey={queryKey}
              context={tag}
              title="Levantamento"
              isDocument={false}
            />
          ) : (
            <p className="nr-muted">Nenhum anexo verificado.</p>
          )}
        </>
      )}
    </section>
  );
}
