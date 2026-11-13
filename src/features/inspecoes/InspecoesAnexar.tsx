import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Paperclip } from "lucide-react";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { sha256 } from "@/features/operacao/files";
import { supabase } from "@/integrations/supabase/client";
import { InspecoesArquivos } from "./InspecoesArquivos";
import {
  detectarArquivoInspecoes,
  inspecoesUploadMimes,
  mimesPorPapel,
  type InspecoesAnexoAlvo,
  type InspecoesAnexoPapel,
} from "./arquivo-formatos";
import {
  inspecoesAnexosPorAlvo,
  inspecoesLimiteEnvio,
  inspecoesUploadCancelar,
  inspecoesUploadConfirmar,
  inspecoesUploadReservar,
} from "./inspecoes-upload.functions";
import type { InspecoesArquivo, InspecoesEscopo } from "./ui-contract";

const rolesLevantamento = ["foto", "art", "ensaio", "evidencia"] as const;
const rolesAcervo = [
  "documento",
  "contrato",
  "foto",
  "art",
  "certificado",
  "projeto",
  "evidencia",
] as const;
const roleLabels: Record<InspecoesAnexoPapel, string> = {
  original: "PDF para emissão",
  documento: "Documento",
  contrato: "Contrato",
  foto: "Fotografia",
  art: "ART",
  certificado: "Certificado",
  projeto: "Projeto",
  ensaio: "Evidência de ensaio",
  evidencia: "Evidência",
};
const titles = {
  levantamento: "Anexos do levantamento",
  registro: "Anexos do registro",
  unidade: "Documentos e fotos da unidade",
  contrato: "Anexos do contrato",
};
const events: Record<string, string> = {
  envio_reservado: "Envio reservado",
  envio_cancelado: "Envio cancelado",
  original_verificado: "Arquivo verificado",
  miniaturas_verificadas: "Miniatura e prévia verificadas",
  falha_miniaturas: "Falha ao gerar a miniatura ou prévia",
};
const formatDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

type Props = {
  escopo: InspecoesEscopo;
  queryKey: readonly string[];
  tag: string;
  edit: boolean;
  aprovado?: boolean;
  exibirAcervo?: boolean;
  acoesArquivo?: ((file: InspecoesArquivo) => ReactNode) | undefined;
  atualizar: () => void;
} & (
  { levantamentoId: string; alvo?: never } | { levantamentoId?: never; alvo: InspecoesAnexoAlvo }
);

export function InspecoesAnexar(props: Props) {
  const alvo = props.alvo ?? { tipo: "levantamento", id: props.levantamentoId };
  return <AnexarAlvo key={`${alvo.tipo}:${alvo.id}`} {...props} destino={alvo} />;
}

function AnexarAlvo({
  escopo,
  queryKey,
  destino,
  tag,
  edit,
  aprovado = false,
  exibirAcervo = true,
  acoesArquivo,
  atualizar,
}: Props & { destino: InspecoesAnexoAlvo }) {
  const label = useId();
  const load = useServerFn(inspecoesAnexosPorAlvo);
  const reserve = useServerFn(inspecoesUploadReservar);
  const confirm = useServerFn(inspecoesUploadConfirmar);
  const cancel = useServerFn(inspecoesUploadCancelar);
  const client = useQueryClient();
  const data = { ...escopo, alvo: destino };
  const [pagina, setPagina] = useState(0);
  const list = useQuery({
    queryKey: [...queryKey, "anexos", destino.tipo, destino.id, pagina],
    queryFn: ({ signal }) => load({ data: { ...data, pagina }, signal }),
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<InspecoesAnexoPapel>(
    destino.tipo === "levantamento"
      ? "foto"
      : destino.tipo === "contrato"
        ? "contrato"
        : "documento",
  );
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const input = useRef<HTMLInputElement>(null);
  const retry = useRef<{ key: string; fingerprint: string } | null>(null);
  const locked = useRef(false);
  const papel = aprovado ? "original" : role;
  const allowedMimes = mimesPorPapel(papel).filter(
    (mime) => destino.tipo !== "levantamento" || !mime.endsWith("wordprocessingml.document"),
  );
  const pending = list.data?.files.filter((file) => file.estado === "envio_pendente") ?? [];
  const verified =
    list.data?.files.filter(
      (file) => !["envio_pendente", "envio_cancelado"].includes(file.estado),
    ) ?? [];
  const previewPending = verified.filter(
    (file) =>
      file.papel === "foto" &&
      file.autoriaPropria &&
      ["original_verificado", "falha_processamento"].includes(file.estado) &&
      (!file.possuiMiniatura || !file.possuiPrevia),
  );
  const roles = destino.tipo === "levantamento" ? rolesLevantamento : rolesAcervo;
  const canWrite = edit || aprovado;

  async function perform(message: string, work: () => Promise<void>) {
    if (!canWrite || locked.current) return;
    locked.current = true;
    setBusy(true);
    setStatus(message);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause);
      setStatus("");
    } finally {
      await list.refetch();
      locked.current = false;
      setBusy(false);
    }
  }

  function feedback(file: InspecoesArquivo) {
    setStatus(
      file.estado === "falha_processamento"
        ? "Arquivo verificado. Você pode baixar o original e tentar gerar as miniaturas novamente."
        : "Arquivo anexado e verificado.",
    );
    if (destino.tipo === "levantamento")
      void client.invalidateQueries({
        queryKey: [...queryKey, "ensaios-levantamento", destino.id],
      });
    atualizar();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return;
    await perform("Verificando o arquivo…", async () => {
      if (file.size === 0 || file.size > inspecoesLimiteEnvio)
        throw new Error("Selecione um arquivo de até 20 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = await detectarArquivoInspecoes(bytes);
      const mime = inspecoesUploadMimes.find((item) => item === type);
      if (!mime || !allowedMimes.includes(mime))
        throw new Error("O formato do arquivo não corresponde ao papel escolhido.");
      const hash = await sha256(bytes);
      const legenda = caption.trim() || undefined;
      const fingerprint = JSON.stringify([papel, file.name, hash, legenda]);
      const same = pending.find(
        (row) =>
          row.autoriaPropria &&
          row.sha256 === hash &&
          row.nome === file.name &&
          row.papel === papel &&
          (row.legenda || "") === (legenda || ""),
      );
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { key: same?.id ?? crypto.randomUUID(), fingerprint };
      const target = await reserve({
        data: {
          organizationId: escopo.organizationId,
          alvo: destino,
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
      }
      setStatus(
        papel === "foto"
          ? "Verificando a foto e preparando miniaturas…"
          : "Confirmando o tamanho e o hash…",
      );
      const verifiedFile = await confirm({
        data: { organizationId: escopo.organizationId, id: target.file.id },
      });
      retry.current = null;
      if (input.current) input.current.value = "";
      setCaption("");
      setOpen(false);
      feedback(verifiedFile);
    });
  }

  const cancelar = (id: string) =>
    perform("Cancelando envio…", async () => {
      await cancel({ data: { organizationId: escopo.organizationId, id } });
      if (retry.current?.key === id) retry.current = null;
      atualizar();
      setStatus("Envio cancelado.");
    });

  const processarFoto = (id: string) =>
    perform("Preparando miniatura e prévia…", async () => {
      feedback(await confirm({ data: { organizationId: escopo.organizationId, id } }));
    });

  return (
    <section className="insp-stack" aria-labelledby={label}>
      <div className="insp-work-head">
        <h5 className="insp-subheading" id={label}>
          {titles[destino.tipo]}
        </h5>
        {canWrite && (
          <ActionButton variant="ghost" disabled={busy} onClick={() => setOpen((value) => !value)}>
            <Paperclip size={16} aria-hidden="true" />
            {open
              ? "Fechar envio"
              : aprovado
                ? "Vincular PDF da revisão"
                : destino.tipo === "levantamento"
                  ? "Anexar evidência"
                  : "Anexar arquivo"}
          </ActionButton>
        )}
      </div>
      {open && canWrite && (
        <form className="insp-work-form" onSubmit={(event) => void enviar(event)}>
          {!aprovado && (
            <label className="insp-field">
              Papel do arquivo
              <select
                value={role}
                disabled={busy}
                onChange={(event) => {
                  const next = roles.find((item) => item === event.target.value);
                  if (next) setRole(next);
                  if (input.current) input.current.value = "";
                }}
              >
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {roleLabels[item]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="insp-field">
            Selecionar arquivo
            <input
              ref={input}
              type="file"
              accept={allowedMimes.join(",")}
              required
              disabled={busy}
            />
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
                  {canWrite && (
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
          {canWrite && previewPending.length > 0 && (
            <ul className="insp-pending-files">
              {previewPending.map((file) => (
                <li key={file.id}>
                  <span>{file.nome} · Representações pendentes</span>
                  <ActionButton
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void processarFoto(file.id)}
                  >
                    Tentar gerar miniaturas
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
          {exibirAcervo &&
            (verified.length > 0 ? (
              <InspecoesArquivos
                files={verified}
                escopo={escopo}
                queryKey={queryKey}
                context={tag}
                title={titles[destino.tipo]}
                isDocument={false}
                {...(acoesArquivo ? { acoesArquivo } : {})}
              />
            ) : (
              <p className="nr-muted">Nenhum anexo disponível nesta página.</p>
            ))}
          {list.data.history.length > 0 && (
            <details>
              <summary>Histórico de anexos</summary>
              <ul className="insp-pending-files">
                {list.data.history.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      {events[entry.evento] ?? entry.evento} · {entry.arquivo_nome}
                    </span>
                    <time dateTime={entry.ocorrido_em}>
                      {formatDate.format(new Date(entry.ocorrido_em))}
                    </time>
                    {entry.autor_nome && <small>{entry.autor_nome}</small>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {list.data.total > list.data.pageSize && (
            <div className="insp-actions" aria-label="Paginação de anexos">
              <ActionButton
                variant="ghost"
                disabled={busy || pagina === 0}
                onClick={() => setPagina((page) => page - 1)}
              >
                Anterior
              </ActionButton>
              <span>Página {pagina + 1}</span>
              <ActionButton
                variant="ghost"
                disabled={busy || (pagina + 1) * list.data.pageSize >= list.data.total}
                onClick={() => setPagina((page) => page + 1)}
              >
                Próxima
              </ActionButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
