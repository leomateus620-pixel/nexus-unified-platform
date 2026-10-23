import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "@/components/nexus/Page";
import { baixarAnexo } from "@/features/operacao/files.functions";
import { petGerarRelatorio } from "./documentos.functions";
import type { Json } from "./schemas";
export function baixarBytes(base64: string, nome: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function PetDocumentos({
  organizationId,
  petId,
  versao,
  documentos = [],
}: {
  organizationId: string;
  petId: string;
  versao?: number;
  documentos?: Record<string, Json>[];
}) {
  const [busy, setBusy] = useState(false),
    [erro, setErro] = useState("");
  const [resultado, setResultado] = useState("");
  const tentativa = useRef<{ chave: string; version?: number } | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    tentativa.current = null;
    setResultado("");
    setErro("");
  }, [organizationId, petId]);
  async function gerar() {
    setBusy(true);
    setErro("");
    setResultado("");
    try {
      tentativa.current ??= {
        chave: crypto.randomUUID(),
        ...(versao !== undefined ? { version: versao } : {}),
      };
      const r = await petGerarRelatorio({
        data: {
          organization_id: organizationId,
          id: petId,
          chave: tentativa.current.chave,
          ...(tentativa.current.version !== undefined
            ? { expected_version: tentativa.current.version }
            : {}),
        },
      });
      baixarBytes(r.base64, r.nome);
      setResultado(r.mensagem);
      if (r.persistido || r.estado_arquivamento === "nao_configurado") tentativa.current = null;
      await queryClient.invalidateQueries({ queryKey: ["pet", organizationId] });
    } catch (e) {
      setErro((e as Error).message);
      if ((e as Error).message.includes("A PET mudou")) tentativa.current = null;
    } finally {
      setBusy(false);
    }
  }
  async function original(id: string) {
    setErro("");
    try {
      const r = await baixarAnexo({ data: { organization_id: organizationId, id } });
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  return (
    <section className="nx-pet-panel" aria-label="Documentos da PET">
      <h2>Documentos e integridade</h2>
      <p>
        O relatório de consulta é derivado dos registros. A certificação pertence ao arquivo
        original assinado, preservado separadamente.
      </p>
      <ActionButton onClick={() => void gerar()} disabled={busy}>
        {busy ? "Gerando PDF…" : "Baixar relatório PDF"}
      </ActionButton>
      {erro && <p role="alert">{erro}</p>}
      {resultado && <p role="status">{resultado}</p>}
      {documentos.map((d) => (
        <article key={String(d["id"])}>
          <strong>
            {String(d["tipo"])} · {String(d["estado"])}
          </strong>
          <p className="break-all">SHA-256: {String(d["sha256"] || "Pendente")}</p>
          {d["anexo_id"] && d["estado"] === "disponivel" && (
            <ActionButton variant="ghost" onClick={() => void original(String(d["anexo_id"]))}>
              Baixar artefato preservado
            </ActionButton>
          )}
        </article>
      ))}
    </section>
  );
}
