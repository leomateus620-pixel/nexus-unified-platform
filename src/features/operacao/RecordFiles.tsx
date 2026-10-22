import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ActionButton, ErrorState } from "@/components/nexus/Page";
import {
  baixarAnexo,
  confirmarUpload,
  listarAnexos,
  prepararUpload,
  retomarUpload,
} from "./files.functions";
import { mimeDetectado, sha256 } from "./files";
import type { z } from "zod";
import type { Anexo, anexoPai, uploadInput } from "./schemas";
import { useCommandKey } from "./components";

export function RecordFiles({
  pai,
  readOnly = false,
}: {
  pai: z.input<typeof anexoPai>;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<Error | null>(null);
  const [progresso, setProgresso] = useState("");
  const [busy, setBusy] = useState(false);
  const keyFor = useCommandKey();
  const q = useQuery({
    queryKey: ["anexos", pai],
    queryFn: ({ signal }) => listarAnexos({ data: pai, signal }),
  });
  async function enviar(file: File, pending?: Anexo) {
    setErro(null);
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Limite de 20 MB por arquivo.");
      setProgresso("Verificando arquivo…");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = mimeDetectado(bytes) as z.infer<typeof uploadInput>["mime"] | null;
      if (!mime) throw new Error("Envie PDF, PNG, JPEG ou WebP.");
      const hash = await sha256(bytes);
      if (
        pending &&
        (pending.sha256 !== hash || pending.tamanho !== file.size || pending.mime !== mime)
      )
        throw new Error(
          "Selecione o mesmo arquivo do envio pendente. Nome, tipo e conteúdo não podem substituir a evidência original.",
        );
      const payload = { pai, nome: file.name, tamanho: file.size, mime, sha256: hash };
      const staged = pending
        ? await retomarUpload({ data: { organization_id: pai.organization_id, id: pending.id } })
        : await prepararUpload({ data: { ...payload, chave: keyFor(payload) } });
      setProgresso("Enviando arquivo…");
      if (staged.token) {
        const upload = await supabase.storage
          .from("nexus-operacional")
          .uploadToSignedUrl(staged.anexo.caminho, staged.token, file, { contentType: mime });
        if (upload.error) {
          // Uma resposta de rede perdida pode ter ocorrido após o Storage concluir o upload.
          // A confirmação verifica bytes/hash; nunca sobrescreve o objeto existente.
          try {
            await confirmarUpload({
              data: { organization_id: pai.organization_id, id: staged.anexo.id },
            });
            await qc.invalidateQueries({ queryKey: ["anexos", pai] });
            setProgresso("Arquivo confirmado.");
            return;
          } catch {
            throw new Error(
              `${upload.error.message}. O envio permanece pendente; use Reverificar ou Retomar com o mesmo arquivo.`,
            );
          }
        }
      }
      setProgresso("Confirmando armazenamento e hash…");
      await confirmarUpload({
        data: { organization_id: pai.organization_id, id: staged.anexo.id },
      });
      await qc.invalidateQueries({ queryKey: ["anexos", pai] });
      setProgresso("Arquivo confirmado.");
    } catch (e) {
      setErro(
        e instanceof Error ? e : new Error("Não foi possível enviar o arquivo. Tente novamente."),
      );
      setProgresso("");
      await qc.invalidateQueries({ queryKey: ["anexos", pai] });
    } finally {
      setBusy(false);
    }
  }
  async function confirmar(id: string) {
    setErro(null);
    try {
      await confirmarUpload({ data: { organization_id: pai.organization_id, id } });
      await qc.invalidateQueries({ queryKey: ["anexos", pai] });
    } catch (e) {
      setErro(e instanceof Error ? e : new Error("Arquivo ainda não disponível."));
    }
  }
  async function baixar(id: string) {
    try {
      const { url } = await baixarAnexo({ data: { organization_id: pai.organization_id, id } });
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.target = "_blank";
      a.click();
    } catch (e) {
      setErro(e instanceof Error ? e : new Error("Download indisponível."));
    }
  }
  return (
    <section className="space-y-3" aria-label="Arquivos privados">
      <h3 className="font-medium">Arquivos e evidências</h3>
      {!readOnly && (
        <label className="nx-upload-label">
          Adicionar PDF ou imagem (até 20 MB)
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void enviar(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {progresso}
      </p>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro.message}
        </p>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.isPending && <p>Consultando arquivos…</p>}
      {!q.isPending && !q.isError && !q.data?.length && (
        <p className="text-sm text-muted-foreground">Nenhum arquivo vinculado.</p>
      )}
      <ul className="space-y-2">
        {q.data?.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"
          >
            <span className="min-w-0 break-all text-sm">
              {a.nome}
              <small className="block text-muted-foreground">
                {a.estado === "vinculado"
                  ? "Armazenamento confirmado"
                  : "Envio pendente de confirmação"}{" "}
                · {Math.ceil(a.tamanho / 1024)} KB
              </small>
            </span>
            {a.estado === "vinculado" ? (
              <ActionButton variant="ghost" onClick={() => baixar(a.id)}>
                Baixar
              </ActionButton>
            ) : a.pode_retomar && !readOnly ? (
              <div className="space-y-2">
                <ActionButton variant="ghost" disabled={busy} onClick={() => confirmar(a.id)}>
                  Reverificar envio
                </ActionButton>
                <label className="nx-upload-label text-xs">
                  Retomar envio do mesmo arquivo
                  <input
                    aria-label={`Retomar envio de ${a.nome}`}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void enviar(file, a);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Confirmação pendente pelo autor.
              </span>
            )}
          </li>
        ))}
      </ul>
      {q.data?.length === 50 && (
        <p className="text-xs text-muted-foreground">
          Exibindo os 50 arquivos mais recentes deste registro.
        </p>
      )}
    </section>
  );
}
