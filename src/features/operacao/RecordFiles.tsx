import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ActionButton, ErrorState } from "@/components/nexus/Page";
import {
  baixarAnexo,
  cancelarAnexo,
  confirmarUpload,
  listarAnexos,
  prepararUpload,
  retomarUpload,
} from "./files.functions";
import { mimeDetectado, sha256 } from "./files";
import type { z } from "zod";
import { anexoPai, type Anexo, type uploadInput } from "./schemas";
import { IntencoesAnexoOperacional } from "./upload-intents";
import { captureOperationalContinuation } from "./continuation";
import { useOrg } from "@/features/org/session";

type Pai = z.infer<typeof anexoPai>;
export function RecordFiles({
  pai,
  readOnly = false,
}: {
  pai: z.input<typeof anexoPai>;
  readOnly?: boolean;
}) {
  const destino = anexoPai.parse(pai);
  return <ArquivosDoRegistro key={JSON.stringify(destino)} pai={destino} readOnly={readOnly} />;
}
function ArquivosDoRegistro({ pai, readOnly }: { pai: Pai; readOnly: boolean }) {
  const qc = useQueryClient();
  const org = useOrg();
  const context =
    org.isError || org.isPending || !org.data
      ? ""
      : JSON.stringify({
          orgId: org.data.orgId,
          userId: org.data.userId,
          roles: org.data.roles,
          capabilities: org.data.capabilities ?? [],
        });
  const currentContext = useRef(context);
  currentContext.current = context;
  const scope = useRef({ active: false, generation: 0 });
  const downloads = useRef(
    new Map<string, { controller: AbortController; valid: () => boolean }>(),
  );
  const section = useRef<HTMLElement>(null);
  const motivoId = useId();
  const [erro, setErro] = useState<Error | null>(null);
  const [progresso, setProgresso] = useState("");
  const [busy, setBusy] = useState(false);
  const busyLock = useRef(false);
  const intencoes = useRef(new IntencoesAnexoOperacional());
  const [cancelamento, setCancelamento] = useState<Anexo | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erroMotivo, setErroMotivo] = useState("");
  const q = useQuery({
    queryKey: ["anexos", pai],
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    retry: false,
    queryFn: ({ signal }) => listarAnexos({ data: pai, signal }),
  });
  useEffect(() => {
    const lifetime = scope.current;
    lifetime.active = true;
    lifetime.generation++;
    const pending = downloads.current;
    const unsubscribe = qc.getQueryCache().subscribe(() => {
      for (const item of pending.values()) if (!item.valid()) item.controller.abort();
    });
    return () => {
      lifetime.active = false;
      lifetime.generation++;
      unsubscribe();
      for (const item of pending.values()) item.controller.abort();
      pending.clear();
    };
  }, [qc]);
  useEffect(() => {
    for (const item of downloads.current.values()) if (!item.valid()) item.controller.abort();
  }, [context]);
  const visiveis = q.isError ? undefined : q.data;
  const podeAdicionar = !readOnly && visiveis?.permissoes.adicionar === true;
  const payloadArquivo = (a: Pick<Anexo, "nome" | "mime" | "tamanho" | "sha256">) => ({
    pai,
    nome: a.nome,
    tamanho: a.tamanho,
    mime: a.mime,
    sha256: a.sha256,
  });
  async function atualizar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["anexos", pai] }),
      ...(pai.qualificacao_id
        ? [qc.invalidateQueries({ queryKey: ["pessoas", pai.organization_id, "qualificacoes"] })]
        : []),
      ...(pai.ferramenta_id || pai.calibracao_id
        ? [qc.invalidateQueries({ queryKey: ["almoxarifado", pai.organization_id] })]
        : []),
    ]);
  }
  async function enviar(file: File, pending?: Anexo) {
    if (busyLock.current || !podeAdicionar) return;
    busyLock.current = true;
    setErro(null);
    setBusy(true);
    try {
      if (!file.size || file.size > 20 * 1024 * 1024)
        throw new Error("Envie um arquivo de até 20 MiB.");
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
          "Selecione o mesmo conteúdo do envio pendente. Nome e metadados originais serão preservados.",
        );
      const payload = payloadArquivo({
        nome: pending?.nome ?? file.name,
        tamanho: file.size,
        mime,
        sha256: hash,
      });
      const fingerprint = JSON.stringify(payload);
      const staged = pending
        ? await retomarUpload({ data: { organization_id: pai.organization_id, id: pending.id } })
        : await prepararUpload({
            data: { ...payload, mime, chave: intencoes.current.chave(fingerprint) },
          });
      intencoes.current.identificar(fingerprint, staged.anexo.id);
      setProgresso("Enviando arquivo…");
      if (staged.token) {
        const upload = await supabase.storage
          .from("nexus-operacional")
          .uploadToSignedUrl(staged.anexo.caminho, staged.token, file, { contentType: mime });
        if (upload.error) {
          try {
            await confirmarUpload({
              data: { organization_id: pai.organization_id, id: staged.anexo.id },
            });
            setProgresso("Arquivo confirmado.");
            return;
          } catch {
            throw new Error(
              "O envio permanece pendente. Use Reverificar envio ou retome com o mesmo arquivo.",
            );
          }
        }
      }
      setProgresso("Confirmando armazenamento e hash…");
      await confirmarUpload({
        data: { organization_id: pai.organization_id, id: staged.anexo.id },
      });
      setProgresso("Arquivo confirmado.");
    } catch (e) {
      setErro(
        e instanceof Error ? e : new Error("Não foi possível enviar o arquivo. Tente novamente."),
      );
      setProgresso("");
    } finally {
      await atualizar();
      setBusy(false);
      busyLock.current = false;
    }
  }
  async function confirmar(id: string) {
    if (busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    setErro(null);
    try {
      await confirmarUpload({ data: { organization_id: pai.organization_id, id } });
      setProgresso("Arquivo confirmado.");
      await atualizar();
    } catch (e) {
      setErro(e instanceof Error ? e : new Error("Arquivo ainda não disponível."));
    } finally {
      busyLock.current = false;
      setBusy(false);
    }
  }
  async function baixar(id: string) {
    if (
      downloads.current.has(id) ||
      !context ||
      org.data?.orgId !== pai.organization_id ||
      q.isError ||
      !q.data?.registros.some((a) => a.id === id && a.estado === "vinculado")
    )
      return;
    const generation = scope.current.generation;
    const controller = new AbortController();
    const valid = captureOperationalContinuation(
      qc,
      ["anexos", pai],
      () =>
        scope.current.active &&
        scope.current.generation === generation &&
        currentContext.current === context &&
        !controller.signal.aborted,
    );
    if (!valid()) return;
    downloads.current.set(id, { controller, valid });
    setErro(null);
    try {
      const { url } = await baixarAnexo({
        data: { organization_id: pai.organization_id, id },
        signal: controller.signal,
      });
      if (!valid()) return;
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.target = "_blank";
      a.click();
    } catch (e) {
      if (!valid()) return;
      setErro(e instanceof Error ? e : new Error("Download indisponível."));
    } finally {
      if (downloads.current.get(id)?.controller === controller) downloads.current.delete(id);
    }
  }
  async function cancelar() {
    if (!cancelamento || busyLock.current) return;
    if (motivo.trim().length < 5) {
      setErroMotivo("Explique o motivo com ao menos cinco caracteres.");
      document.getElementById(motivoId)?.focus();
      return;
    }
    busyLock.current = true;
    setBusy(true);
    setErro(null);
    setErroMotivo("");
    try {
      const payload = {
        organization_id: pai.organization_id,
        id: cancelamento.id,
        motivo: motivo.trim(),
      };
      await cancelarAnexo({
        data: { ...payload, chave: intencoes.current.chave(JSON.stringify(payload)) },
      });
      intencoes.current.cancelar(cancelamento.id, JSON.stringify(payloadArquivo(cancelamento)));
      setCancelamento(null);
      setMotivo("");
      setProgresso("Envio pendente cancelado; uma nova seleção iniciará outro envio.");
      await atualizar();
      requestAnimationFrame(() => section.current?.focus());
    } catch (e) {
      setErro(
        e instanceof Error
          ? e
          : new Error("Não foi possível cancelar o envio. Motivo preservado para repetir."),
      );
    } finally {
      busyLock.current = false;
      setBusy(false);
    }
  }
  return (
    <section ref={section} tabIndex={-1} className="space-y-3" aria-label="Arquivos privados">
      <h3 className="font-medium">Arquivos e evidências</h3>
      {podeAdicionar && (
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
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {q.isError ? "" : progresso}
      </p>
      {erro && !q.isError && (
        <p role="alert" className="text-sm text-destructive">
          {erro.message}
        </p>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.isPending && <p role="status">Consultando arquivos…</p>}
      {visiveis?.registros.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum arquivo vinculado.</p>
      )}
      <ul className="space-y-2">
        {visiveis?.registros.map((a) => (
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
            ) : !readOnly && (a.pode_retomar || a.pode_cancelar) ? (
              <div className="space-y-2">
                {a.pode_retomar && (
                  <>
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
                  </>
                )}
                {a.pode_cancelar && (
                  <ActionButton
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setCancelamento(a);
                      setMotivo("");
                      setErroMotivo("");
                    }}
                  >
                    Cancelar envio pendente
                  </ActionButton>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Confirmação pendente pelo autor.
              </span>
            )}
          </li>
        ))}
      </ul>
      {visiveis?.registros.length === 50 && (
        <p className="text-xs text-muted-foreground">
          Exibindo os 50 arquivos mais recentes deste registro.
        </p>
      )}
      {podeAdicionar && cancelamento && (
        <div className="grid gap-3 rounded-md border border-border p-3">
          <label htmlFor={motivoId} className="text-sm">
            Motivo do cancelamento
          </label>
          <input
            id={motivoId}
            className="min-h-11 rounded border border-input bg-background px-3"
            value={motivo}
            aria-invalid={!!erroMotivo}
            aria-describedby={erroMotivo ? `${motivoId}-error` : undefined}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={2000}
            disabled={busy}
          />
          {erroMotivo && (
            <p role="alert" id={`${motivoId}-error`} className="text-sm text-destructive">
              {erroMotivo}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="danger" disabled={busy} onClick={cancelar}>
              Confirmar cancelamento
            </ActionButton>
            <ActionButton variant="ghost" disabled={busy} onClick={() => setCancelamento(null)}>
              Manter envio
            </ActionButton>
          </div>
        </div>
      )}
    </section>
  );
}
