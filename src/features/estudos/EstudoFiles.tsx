import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ActionButton, ErrorState } from "@/components/nexus/Page";
import { mimeDetectado, sha256 } from "@/features/operacao/files";
import { IntencoesArquivoEstudo } from "./upload-intents";
import {
  baixarArquivoEstudo,
  cancelarArquivoEstudo,
  confirmarArquivoEstudo,
  listarArquivosEstudo,
  prepararArquivoEstudo,
  retomarArquivoEstudo,
  type EstudoArquivo,
} from "./est-arquivos.functions";

export function EstudoFiles({
  org,
  estudoId,
  revisaoId,
  perigoId,
  readOnly = false,
}: {
  org: string;
  estudoId: string;
  revisaoId: string;
  perigoId: string | null;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [pagina, setPagina] = useState(0);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState("");
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const intencoes = useRef(new IntencoesArquivoEstudo());
  const destino = {
    organization_id: org,
    estudo_id: estudoId,
    revisao_id: revisaoId,
    perigo_id: perigoId,
  };
  const prefixo = ["estudo-arquivos", org, revisaoId, perigoId] as const;
  const q = useQuery({
    queryKey: [...prefixo, pagina],
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    retry: false,
    queryFn: ({ signal }) => listarArquivosEstudo({ data: { ...destino, pagina }, signal }),
  });
  // A failed authorization/refetch must not keep showing previously cached private metadata.
  const visiveis = q.isError ? undefined : q.data;
  async function atualizar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: prefixo }),
      qc.invalidateQueries({ queryKey: ["estudos", org] }),
    ]);
  }
  async function confirmar(id: string) {
    await confirmarArquivoEstudo({ data: { organization_id: org, id } });
    setProgresso("Evidência confirmada no armazenamento privado.");
    await atualizar();
  }
  async function enviar(file: File, pendente?: EstudoArquivo) {
    setBusy(true);
    setErro(null);
    setProgresso("Verificando conteúdo e integridade…");
    try {
      if (!file.size || file.size > 20 * 1024 * 1024)
        throw new Error("Envie PDF, PNG, JPEG ou WebP de até 20 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = mimeDetectado(bytes);
      if (!mime || !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mime))
        throw new Error("O formato do conteúdo não é suportado. Use PDF, PNG, JPEG ou WebP.");
      const hash = await sha256(bytes);
      if (
        pendente &&
        (pendente.tamanho !== file.size || pendente.mime !== mime || pendente.sha256 !== hash)
      )
        throw new Error(
          "Selecione o mesmo original do envio pendente. Para trocar o conteúdo, cancele o envio anterior.",
        );
      const payload = {
        ...destino,
        nome: file.name,
        tamanho: file.size,
        mime: mime as "application/pdf" | "image/png" | "image/jpeg" | "image/webp",
        sha256: hash,
      };
      const identidade = JSON.stringify(payload);
      const staged = pendente
        ? await retomarArquivoEstudo({ data: { organization_id: org, id: pendente.id } })
        : await prepararArquivoEstudo({
            data: { ...payload, chave: intencoes.current.chave(identidade) },
          });
      intencoes.current.identificar(identidade, staged.arquivo.id);
      if (staged.token) {
        setProgresso("Enviando evidência…");
        const upload = await supabase.storage
          .from("nexus-operacional")
          .uploadToSignedUrl(staged.arquivo.caminho, staged.token, file, { contentType: mime });
        if (upload.error) {
          // Se só a resposta se perdeu, o servidor pode confirmar o objeto já armazenado.
          try {
            await confirmar(staged.arquivo.id);
            return;
          } catch {
            throw new Error(
              "Envio não confirmado. Use Reverificar armazenamento ou selecione o mesmo original para retomar.",
            );
          }
        }
      }
      setProgresso("Conferindo tipo, tamanho e SHA-256 no servidor…");
      await confirmar(staged.arquivo.id);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível confirmar a evidência.");
      setProgresso("");
    } finally {
      setBusy(false);
      await atualizar();
    }
  }
  async function reverificar(id: string) {
    setBusy(true);
    setErro(null);
    setProgresso("Reverificando o armazenamento…");
    try {
      await confirmar(id);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "A evidência ainda não está disponível.");
      setProgresso("");
    } finally {
      setBusy(false);
    }
  }
  async function baixar(id: string) {
    setErro(null);
    try {
      const { url } = await baixarArquivoEstudo({ data: { organization_id: org, id } });
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Download indisponível.");
    }
  }
  async function cancelar() {
    if (!cancelarId) return;
    const original = visiveis?.rows.find((arquivo) => arquivo.id === cancelarId);
    setBusy(true);
    setErro(null);
    try {
      const payload = JSON.stringify({ cancelarId, motivo });
      await cancelarArquivoEstudo({
        data: {
          organization_id: org,
          id: cancelarId,
          chave: intencoes.current.chave(payload),
          motivo,
        },
      });
      intencoes.current.cancelar(
        cancelarId,
        original
          ? JSON.stringify({
              ...destino,
              nome: original.nome,
              tamanho: original.tamanho,
              mime: original.mime,
              sha256: original.sha256,
            })
          : undefined,
      );
      setCancelarId(null);
      setMotivo("");
      setProgresso("Envio pendente cancelado. O histórico foi preservado.");
      await atualizar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível cancelar o envio.");
    } finally {
      setBusy(false);
    }
  }
  const label = perigoId ? "Evidências deste perigo" : "Referências gerais desta revisão";
  return (
    <section className="min-w-0 space-y-3" aria-label={label}>
      <h3 className="font-medium">{label}</h3>
      {!readOnly && !q.isError && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="nx-upload-label">
            Adicionar foto
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void enviar(file);
                e.target.value = "";
              }}
            />
          </label>
          <label className="nx-upload-label">
            Adicionar PDF ou imagem (até 20 MiB)
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
        </div>
      )}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {progresso}
      </p>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {q.isPending && (
        <p role="status" className="text-sm">
          Consultando evidências…
        </p>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {visiveis?.total === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma evidência vinculada{" "}
          {perigoId ? "a este perigo" : "ao contexto geral desta revisão"}.
        </p>
      )}
      <ul className="grid min-w-0 gap-3">
        {visiveis?.rows.map((arquivo) => (
          <li key={arquivo.id} className="grid min-w-0 gap-3 rounded-md border border-border p-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{arquivo.nome}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {arquivo.estado === "vinculado"
                  ? "Armazenamento confirmado"
                  : "Envio pendente de confirmação"}{" "}
                · {Math.ceil(arquivo.tamanho / 1024)} KiB
              </p>
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Integridade do original</summary>
                <p className="mt-2 break-all font-mono">SHA-256: {arquivo.sha256}</p>
              </details>
            </div>
            {arquivo.estado === "vinculado" ? (
              <ActionButton variant="ghost" disabled={busy} onClick={() => baixar(arquivo.id)}>
                Baixar original autorizado
              </ActionButton>
            ) : !readOnly ? (
              <div className="grid gap-2">
                {arquivo.meu_envio && (
                  <>
                    <ActionButton
                      variant="ghost"
                      disabled={busy}
                      onClick={() => reverificar(arquivo.id)}
                    >
                      Reverificar armazenamento
                    </ActionButton>
                    <label className="nx-upload-label">
                      Retomar com o mesmo original
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void enviar(file, arquivo);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </>
                )}
                <ActionButton
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setCancelarId(arquivo.id);
                    setMotivo("");
                  }}
                >
                  Cancelar envio pendente
                </ActionButton>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pendência de armazenamento preservada nesta revisão.
              </p>
            )}
          </li>
        ))}
      </ul>
      {visiveis && visiveis.total > 25 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Página {pagina + 1} de {Math.ceil(visiveis.total / 25)}
          </span>
          <div className="flex gap-2">
            <ActionButton
              variant="ghost"
              disabled={busy || pagina === 0}
              onClick={() => setPagina(pagina - 1)}
            >
              Anterior
            </ActionButton>
            <ActionButton
              variant="ghost"
              disabled={busy || (pagina + 1) * 25 >= visiveis.total}
              onClick={() => setPagina(pagina + 1)}
            >
              Próxima
            </ActionButton>
          </div>
        </div>
      )}
      {cancelarId && (
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
              variant="danger"
              disabled={busy || motivo.trim().length < 5}
              onClick={cancelar}
            >
              Confirmar cancelamento
            </ActionButton>
            <ActionButton variant="ghost" disabled={busy} onClick={() => setCancelarId(null)}>
              Manter envio
            </ActionButton>
          </div>
        </div>
      )}
    </section>
  );
}
