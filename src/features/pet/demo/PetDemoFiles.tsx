import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { petDemoArquivo, petDemoRegistros } from "./demo.functions";
import { demoFile } from "./domain";
import { demoKey } from "./hooks";
import type { DemoDetail } from "./domain";
import type { DemoScope } from "./hooks";
export function PetDemoFiles({
  scope,
  detail,
  reload,
  user,
}: {
  scope: DemoScope;
  detail: DemoDetail;
  reload: () => Promise<unknown>;
  user: string;
}) {
  const fileFn = useServerFn(petDemoArquivo),
    input = useRef<HTMLInputElement>(null),
    lock = useRef(false);
  const load = useServerFn(petDemoRegistros),
    cache = useQueryClient(),
    [page, setPage] = useState(0),
    [open, setOpen] = useState(false);
  const pending = useRef(new Map<string, string>());
  const files = useQuery({
    queryKey: [...demoKey(scope, user), detail.sessao.id, "anexos", page],
    enabled: open,
    queryFn: ({ signal }) =>
      load({ data: { ...scope, id: detail.sessao.id, recurso: "anexos", pagina: page }, signal }),
    retry: false,
  });
  const rows = files.data ? demoFile.array().parse(files.data.registros) : detail.anexos;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const editable = detail.pode_editar && !["encerrada", "cancelada"].includes(detail.sessao.estado);
  async function upload(file: File) {
    if (lock.current) return;
    const validMime = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
    if (
      !validMime.includes(file.type as (typeof validMime)[number]) ||
      file.size < 1 ||
      file.size > 20 * 1024 * 1024
    ) {
      setError("Escolha PDF ou imagem de até 20 MiB.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    const old = rows.find(
      (a) =>
        a.estado === "pendente" &&
        a.nome === file.name &&
        a.tamanho === file.size &&
        a.mime === file.type,
    );
    const intent = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    const fileId = old?.id ?? pending.current.get(intent) ?? crypto.randomUUID();
    pending.current.set(intent, fileId);
    const data = {
      ...scope,
      id: detail.sessao.id,
      arquivo_id: fileId,
      nome: file.name,
      tamanho: file.size,
      mime: file.type as (typeof validMime)[number],
    };
    try {
      let confirmed = false;
      if (old || pending.current.has(intent)) {
        try {
          await fileFn({ data: { ...data, comando: "confirmar" } });
          confirmed = true;
        } catch {
          /* Retomar o envio do mesmo arquivo. */
        }
      }
      if (!confirmed) {
        const p = await fileFn({ data: { ...data, comando: "preparar" } });
        if (p.estado !== "disponivel") {
          const sent = await supabase.storage
            .from("nexus-pet-demo")
            .uploadToSignedUrl(p.caminho, p.token, file, { contentType: file.type });
          if (sent.error) throw sent.error;
          await fileFn({ data: { ...data, comando: "confirmar" } });
        }
      }
      await reload();
      pending.current.delete(intent);
      await cache.invalidateQueries({
        queryKey: [...demoKey(scope, user), detail.sessao.id, "anexos"],
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Envio não confirmado. Selecione o mesmo arquivo para tentar novamente.",
      );
      try {
        await reload();
      } catch {
        /* Preserve the upload error during connection loss. */
      }
    } finally {
      lock.current = false;
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <details className="pet-demo-disclosure" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Anexos <span>{files.data?.total ?? detail.anexos.length}</span>
      </summary>
      {editable && (
        <label className="pet-demo-upload">
          <Paperclip size={16} /> {busy ? "Enviando…" : "Adicionar PDF ou imagem"}
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      {files.isError && (
        <p role="alert">
          Não foi possível consultar os anexos.{" "}
          <button onClick={() => files.refetch()}>Tentar novamente</button>
        </p>
      )}
      <div className="pet-demo-rows">
        {rows.map((a) => (
          <div key={a.id}>
            <span>
              {a.nome}
              <small>
                {a.estado === "pendente"
                  ? "Envio pendente · selecione o mesmo arquivo para retomar"
                  : "Arquivo da demonstração"}
              </small>
            </span>
            <button
              disabled={a.estado !== "disponivel"}
              onClick={async () => {
                const target = window.open("about:blank", "_blank");
                if (target) target.opener = null;
                try {
                  const r = await fileFn({
                    data: { ...scope, id: detail.sessao.id, arquivo_id: a.id, comando: "abrir" },
                  });
                  if (target) target.location.replace(r.url);
                  else
                    setError(
                      "Permita abrir uma nova aba e tente novamente para consultar o arquivo.",
                    );
                } catch (e) {
                  target?.close();
                  setError(String(e));
                }
              }}
            >
              Abrir
            </button>
          </div>
        ))}
      </div>
      {!!files.data && files.data.total > 20 && (
        <div className="pet-demo-pagination">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>Página {page + 1}</span>
          <button disabled={(page + 1) * 20 >= files.data.total} onClick={() => setPage(page + 1)}>
            Próxima
          </button>
        </div>
      )}
    </details>
  );
}
