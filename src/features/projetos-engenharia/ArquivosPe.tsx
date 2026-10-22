import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ActionButton, ErrorState, Section } from "@/components/nexus/Page";
import { mimeDetectado, sha256 } from "@/features/operacao/files";
import {
  baixarArquivoPe,
  cancelarArquivoPe,
  confirmarArquivoPe,
  listarArquivosPe,
  prepararArquivoPe,
  retomarArquivoPe,
  type PeArquivo,
} from "./pe-arquivos.functions";

export function ArquivosPe({
  org,
  versaoId,
  editavel,
}: {
  org: string;
  versaoId: string;
  editavel: boolean;
}) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelar, setCancelar] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const chaves = useRef(new Map<string, string>());
  const q = useQuery({
    queryKey: ["pe-files", org, versaoId],
    queryFn: () => listarArquivosPe({ data: { organization_id: org, versao_id: versaoId } }),
  });
  function chave(payload: string) {
    const atual = chaves.current.get(payload) ?? crypto.randomUUID();
    chaves.current.set(payload, atual);
    return atual;
  }
  async function atualizar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["pe-files", org, versaoId] }),
      qc.invalidateQueries({ queryKey: ["pe", org] }),
    ]);
  }
  async function concluir(id: string) {
    await confirmarArquivoPe({ data: { organization_id: org, id } });
    setEtapa("Original confirmado no armazenamento privado.");
    await atualizar();
  }
  async function enviar(file: File, pendente?: PeArquivo) {
    setBusy(true);
    setErro(null);
    setEtapa("Verificando conteúdo e integridade…");
    try {
      if (!file.size || file.size > 20 * 1024 * 1024)
        throw new Error(
          "Envie um original de até 20 MiB. PDFs maiores exigem a próxima ampliação do processamento.",
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = mimeDetectado(bytes);
      if (!mime || !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mime))
        throw new Error("Formato não suportado. Use PDF, PNG, JPEG ou WebP.");
      const hash = await sha256(bytes);
      if (
        pendente &&
        (pendente.tamanho !== file.size || pendente.mime !== mime || pendente.sha256 !== hash)
      )
        throw new Error(
          "O arquivo selecionado difere do original pendente. Selecione o mesmo conteúdo ou cancele o envio anterior.",
        );
      const staged = pendente
        ? await retomarArquivoPe({ data: { organization_id: org, id: pendente.id } })
        : await prepararArquivoPe({
            data: {
              organization_id: org,
              versao_id: versaoId,
              chave: chave(`${hash}:${file.size}:${mime}`),
              nome: file.name,
              tamanho: file.size,
              sha256: hash,
              mime: mime as PeArquivo["mime"],
            },
          });
      if (staged.token) {
        setEtapa("Enviando original…");
        const upload = await supabase.storage
          .from("nexus-operacional")
          .uploadToSignedUrl(staged.arquivo.caminho, staged.token, file, { contentType: mime });
        if (upload.error) {
          // Uma resposta perdida pode esconder um upload concluído. A confirmação verifica os bytes reais.
          try {
            await concluir(staged.arquivo.id);
            return;
          } catch {
            throw new Error(
              "O envio não foi confirmado. Use Reverificar armazenamento ou selecione o mesmo original para retomar.",
            );
          }
        }
      }
      setEtapa("Conferindo tamanho, tipo e SHA-256 no servidor…");
      await concluir(staged.arquivo.id);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível confirmar o arquivo.");
      setEtapa("");
    } finally {
      setBusy(false);
      await atualizar();
    }
  }
  async function verificar(id: string) {
    setBusy(true);
    setErro(null);
    setEtapa("Reverificando o armazenamento…");
    try {
      await concluir(id);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Original ainda não disponível.");
      setEtapa("");
    } finally {
      setBusy(false);
    }
  }
  async function baixar(id: string) {
    setErro(null);
    try {
      const { url } = await baixarArquivoPe({ data: { organization_id: org, id } });
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Download indisponível.");
    }
  }
  async function cancelarPendente() {
    if (!cancelar) return;
    const original = q.data?.find((arquivo) => arquivo.id === cancelar);
    setBusy(true);
    setErro(null);
    try {
      await cancelarArquivoPe({
        data: {
          organization_id: org,
          id: cancelar,
          chave: chave(`cancelar:${cancelar}:${motivo}`),
          motivo,
        },
      });
      // Cancelar encerra esta intenção. Reenviar os mesmos bytes é uma nova operação;
      // recibos anteriores continuam intactos no servidor para retries da operação encerrada.
      if (original)
        chaves.current.delete(`${original.sha256}:${original.tamanho}:${original.mime}`);
      setCancelar(null);
      setMotivo("");
      setEtapa("Envio pendente cancelado; o histórico foi preservado.");
      await atualizar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível cancelar o envio.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      title="Originais e referências desta versão"
      description="O PDF importado permanece separado do documento nativo. Leitura assistida/OCR ainda não foi executada."
    >
      <div className="grid min-w-0 gap-3">
        {editavel && (
          <label className="nx-upload-label">
            Adicionar original ou referência (PDF/imagem, até 20 MiB)
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void enviar(file);
                event.target.value = "";
              }}
            />
          </label>
        )}
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {etapa}
        </p>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        {q.isPending && (
          <p role="status" className="text-sm">
            Consultando originais…
          </p>
        )}
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum arquivo vinculado a esta versão.</p>
        )}
        <ul className="grid min-w-0 gap-3">
          {q.data?.map((arquivo) => (
            <li key={arquivo.id} className="grid min-w-0 gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{arquivo.nome}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {arquivo.estado === "vinculado"
                    ? "Original confirmado"
                    : "Envio pendente de confirmação"}{" "}
                  · {Math.ceil(arquivo.tamanho / 1024)} KiB
                </p>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  SHA-256: {arquivo.sha256}
                </p>
              </div>
              {arquivo.estado === "vinculado" ? (
                <ActionButton variant="ghost" disabled={busy} onClick={() => baixar(arquivo.id)}>
                  Baixar original autorizado
                </ActionButton>
              ) : editavel ? (
                <div className="grid gap-2">
                  {arquivo.meu_envio && (
                    <>
                      <ActionButton
                        variant="ghost"
                        disabled={busy}
                        onClick={() => verificar(arquivo.id)}
                      >
                        Reverificar armazenamento
                      </ActionButton>
                      <label className="nx-upload-label">
                        Selecionar o mesmo original para retomar
                        <input
                          type="file"
                          accept="application/pdf,image/png,image/jpeg,image/webp"
                          disabled={busy}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void enviar(file, arquivo);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </>
                  )}
                  <ActionButton
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setCancelar(arquivo.id);
                      setMotivo("");
                    }}
                  >
                    Cancelar envio pendente
                  </ActionButton>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Retorne ao rascunho para tratar esta pendência.
                </p>
              )}
            </li>
          ))}
        </ul>
        {cancelar && (
          <div className="grid gap-3 rounded-md border border-border p-3">
            <label className="grid gap-1 text-sm">
              Motivo do cancelamento
              <input
                className="min-h-11 rounded border border-input bg-background px-3"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                minLength={5}
                maxLength={2000}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                variant="ghost"
                disabled={busy || motivo.trim().length < 5}
                onClick={cancelarPendente}
              >
                Confirmar cancelamento
              </ActionButton>
              <ActionButton variant="ghost" disabled={busy} onClick={() => setCancelar(null)}>
                Manter envio
              </ActionButton>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
