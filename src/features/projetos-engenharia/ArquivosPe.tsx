import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ActionButton, ErrorState, Section } from "@/components/nexus/Page";
import { mimeDetectado, sha256 } from "@/features/operacao/files";
import { useOrg, useSessionUser } from "@/features/org/session";
import { LeitorArquivoPe } from "./LeitorArquivoPe";
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
  const context = useOrg();
  const user = useSessionUser();
  const readerAllowed =
    !context.isError &&
    !!context.data &&
    !!user &&
    context.data.orgId === org &&
    context.data.userId === user.id;
  const readerContext = JSON.stringify({
    org,
    versaoId,
    user: user?.id ?? null,
    resolvedUser: context.data?.userId ?? null,
    resolvedOrg: context.data?.orgId ?? null,
    roles: [...(context.data?.roles ?? [])].sort(),
    capabilities: [...(context.data?.capabilities ?? [])].sort(),
  });
  return (
    <ArquivosDaVersao
      key={`${org}:${versaoId}`}
      org={org}
      versaoId={versaoId}
      editavel={editavel}
      readerAllowed={readerAllowed}
      readerContext={readerContext}
    />
  );
}

function ArquivosDaVersao({
  org,
  versaoId,
  editavel,
  readerAllowed,
  readerContext,
}: {
  org: string;
  versaoId: string;
  editavel: boolean;
  readerAllowed: boolean;
  readerContext: string;
}) {
  const qc = useQueryClient();
  const section = useRef<HTMLDivElement>(null);
  const ativo = useRef(true);
  const ocupado = useRef(false);
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelar, setCancelar] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [reading, setReading] = useState<{ arquivo: PeArquivo; context: string } | null>(null);
  const chaves = useRef(new Map<string, string>());
  const q = useQuery({
    queryKey: ["pe-files", org, versaoId],
    enabled: !!org && !!versaoId,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    retry: false,
    queryFn: ({ signal }) =>
      listarArquivosPe({ data: { organization_id: org, versao_id: versaoId }, signal }),
  });
  const visiveis = q.isError ? undefined : q.data;
  const podeEnviar = editavel && visiveis?.permissoes.adicionar === true;
  const canReadOriginal = readerAllowed && visiveis?.permissoes.ler === true;
  const acesso = useRef({ ler: false, enviar: false });
  acesso.current = { ler: visiveis?.permissoes.ler === true, enviar: podeEnviar };
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);
  useEffect(() => {
    if (q.isError || !podeEnviar) {
      setCancelar(null);
      setMotivo("");
      if (q.isError) {
        setEtapa("");
        section.current?.focus();
      }
    }
  }, [q.isError, podeEnviar]);
  useEffect(() => {
    if (reading && (!canReadOriginal || reading.context !== readerContext)) {
      setReading(null);
    }
  }, [reading, canReadOriginal, readerContext]);
  const identidade = (a: Pick<PeArquivo, "nome" | "sha256" | "tamanho" | "mime">) =>
    JSON.stringify({
      org,
      versaoId,
      nome: a.nome,
      hash: a.sha256,
      tamanho: a.tamanho,
      mime: a.mime,
    });
  function chave(payload: string) {
    const atual = chaves.current.get(payload) ?? crypto.randomUUID();
    chaves.current.set(payload, atual);
    return atual;
  }
  function encerrarIntencoes(original: PeArquivo) {
    // O banco deduplica bytes da mesma versão e preserva o nome canônico.
    // Todos os nomes locais que apontaram a esse original encerram juntos.
    for (const payload of chaves.current.keys()) {
      try {
        const dados: unknown = JSON.parse(payload);
        if (!dados || typeof dados !== "object" || Array.isArray(dados)) continue;
        const intencao = dados as Record<string, unknown>;
        if (
          intencao["org"] === org &&
          intencao["versaoId"] === versaoId &&
          intencao["hash"] === original.sha256 &&
          intencao["tamanho"] === original.tamanho &&
          intencao["mime"] === original.mime
        )
          chaves.current.delete(payload);
      } catch {
        // Chaves de cancelamento não são intenções de upload.
      }
    }
  }
  async function atualizar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["pe-files", org, versaoId] }),
      qc.invalidateQueries({ queryKey: ["pe", org] }),
    ]);
  }
  async function concluir(id: string) {
    if (!ativo.current || !acesso.current.enviar) return;
    await confirmarArquivoPe({ data: { organization_id: org, id } });
    if (!ativo.current) return;
    setEtapa("Original confirmado no armazenamento privado.");
  }
  async function enviar(file: File, pendente?: PeArquivo) {
    if (ocupado.current || !podeEnviar) return;
    ocupado.current = true;
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
      if (!ativo.current || !acesso.current.enviar) return;
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
              chave: chave(
                identidade({
                  nome: file.name,
                  sha256: hash,
                  tamanho: file.size,
                  mime: mime as PeArquivo["mime"],
                }),
              ),
              nome: file.name,
              tamanho: file.size,
              sha256: hash,
              mime: mime as PeArquivo["mime"],
            },
          });
      if (!ativo.current || !acesso.current.enviar) return;
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
      if (!ativo.current) return;
      setErro(error instanceof Error ? error.message : "Não foi possível confirmar o arquivo.");
      setEtapa("");
    } finally {
      await atualizar();
      ocupado.current = false;
      if (ativo.current) setBusy(false);
    }
  }
  async function verificar(id: string) {
    if (ocupado.current || !podeEnviar) return;
    ocupado.current = true;
    setBusy(true);
    setErro(null);
    setEtapa("Reverificando o armazenamento…");
    try {
      await concluir(id);
    } catch (error) {
      if (!ativo.current) return;
      setErro(error instanceof Error ? error.message : "Original ainda não disponível.");
      setEtapa("");
    } finally {
      await atualizar();
      ocupado.current = false;
      if (ativo.current) setBusy(false);
    }
  }
  async function baixar(id: string) {
    if (!acesso.current.ler || ocupado.current) return;
    setErro(null);
    try {
      const { url } = await baixarArquivoPe({ data: { organization_id: org, id } });
      if (!ativo.current || !acesso.current.ler) return;
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch (error) {
      if (!ativo.current) return;
      setErro(error instanceof Error ? error.message : "Download indisponível.");
      await q.refetch();
    }
  }
  async function cancelarPendente() {
    if (!cancelar || ocupado.current || !podeEnviar) return;
    const original = visiveis?.rows.find((arquivo) => arquivo.id === cancelar);
    if (!original) return;
    ocupado.current = true;
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
      if (!ativo.current) return;
      // Cancelar encerra esta intenção. Reenviar os mesmos bytes é uma nova operação;
      // recibos anteriores continuam intactos no servidor para retries da operação encerrada.
      encerrarIntencoes(original);
      setCancelar(null);
      setMotivo("");
      setEtapa("Envio pendente cancelado; o histórico foi preservado.");
    } catch (error) {
      if (!ativo.current) return;
      setErro(error instanceof Error ? error.message : "Não foi possível cancelar o envio.");
    } finally {
      await atualizar();
      ocupado.current = false;
      if (ativo.current) setBusy(false);
    }
  }
  return (
    <Section
      title="Originais e referências desta versão"
      description="O original permanece preservado. A prévia por página não executa OCR nem transforma o PDF em modelo editável."
    >
      <div ref={section} tabIndex={-1} className="grid min-w-0 gap-3">
        {podeEnviar && (
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
        {reading && canReadOriginal && reading.context === readerContext && (
          <LeitorArquivoPe
            key={`${readerContext}:${reading.arquivo.id}:${reading.arquivo.sha256}`}
            organizationId={org}
            versaoId={versaoId}
            arquivo={reading.arquivo}
            onClose={() => setReading(null)}
          />
        )}
        {visiveis?.rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum arquivo vinculado a esta versão.</p>
        )}
        {visiveis?.rows.length === 100 && (
          <p className="text-sm text-muted-foreground">
            Esta consulta exibe os 100 originais mais recentes desta versão. Os arquivos anteriores
            permanecem preservados.
          </p>
        )}
        <ul className="grid min-w-0 gap-3">
          {visiveis?.rows.map((arquivo) => (
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
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    variant="ghost"
                    disabled={busy || !canReadOriginal}
                    onClick={() => setReading({ arquivo, context: readerContext })}
                  >
                    Ler original
                  </ActionButton>
                  <ActionButton variant="ghost" disabled={busy} onClick={() => baixar(arquivo.id)}>
                    Baixar original autorizado
                  </ActionButton>
                </div>
              ) : podeEnviar ? (
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
        {podeEnviar &&
          cancelar &&
          visiveis?.rows.some((a) => a.id === cancelar && a.estado !== "vinculado") && (
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
