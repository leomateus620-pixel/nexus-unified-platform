import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "@/components/nexus/Page";
import { baixarAnexo } from "@/features/operacao/files.functions";
import { petGerarRelatorio } from "./documentos.functions";
import type { Json } from "./schemas";
import { Download, FileCheck2, FileText } from "lucide-react";
import { petLabel } from "./ui-types";
import { PET_RELATORIO_RENDER_VERSAO, type PetRelatorioRenderVersao } from "./relatorio-version";
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
  const tentativa = useRef<{
    chave: string;
    version?: number;
    renderVersao: PetRelatorioRenderVersao;
  } | null>(null);
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
        renderVersao: PET_RELATORIO_RENDER_VERSAO,
        ...(versao !== undefined ? { version: versao } : {}),
      };
      const r = await petGerarRelatorio({
        data: {
          organization_id: organizationId,
          id: petId,
          chave: tentativa.current.chave,
          render_versao: tentativa.current.renderVersao,
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
    <section className="nx-pet-panel" aria-label="Documentos da PET" aria-busy={busy}>
      <div className="nx-pet-section-top">
        <div>
          <p className="nx-pet-kicker">Acervo da permissão</p>
          <h2>Documentos e integridade</h2>
          <p className="nx-pet-subtitle">
            Gere uma consulta dos registros atuais ou abra um arquivo já preservado.
          </p>
        </div>
        <ActionButton onClick={() => void gerar()} loading={busy} disabled={busy}>
          <Download size={16} aria-hidden className="mr-2 inline" />
          {busy ? "Gerando PDF…" : "Gerar relatório PDF"}
        </ActionButton>
      </div>
      <p className="nx-pet-hint mt-3">
        Relatório de consulta · formato {PET_RELATORIO_RENDER_VERSAO} · impressão clara. A
        certificação permanece no original assinado. Um novo relatório preserva os anteriores.
      </p>
      {erro && (
        <p role="alert" className="nx-pet-notice mt-4" data-tone="danger">
          {erro}
        </p>
      )}
      {resultado && (
        <p role="status" className="nx-pet-notice mt-4">
          {resultado}
        </p>
      )}
      <div className="nx-pet-list mt-5">
        {documentos.map((d) => (
          <article className="nx-pet-card" key={String(d["id"])}>
            <div className="nx-pet-card-top">
              <div>
                <p className="nx-pet-card-title">
                  {d["tipo"] === "original_assinado" ? (
                    <FileCheck2 size={16} aria-hidden className="mr-2 inline" />
                  ) : (
                    <FileText size={16} aria-hidden className="mr-2 inline" />
                  )}
                  {petLabel(String(d["tipo"]))}
                </p>
                <p className="nx-pet-hint mt-1">{petLabel(String(d["estado"]))}</p>
              </div>
              {d["anexo_id"] && d["estado"] === "disponivel" && (
                <ActionButton variant="ghost" onClick={() => void original(String(d["anexo_id"]))}>
                  <Download size={14} aria-hidden className="mr-2 inline" /> Arquivo preservado
                </ActionButton>
              )}
            </div>
            <p className="nx-pet-hint break-all mt-3">
              SHA-256: {String(d["sha256"] || "Ainda não confirmado")}
            </p>
            <p className="nx-pet-hint break-all mt-1">Documento: {String(d["id"])}</p>
          </article>
        ))}
        {!documentos.length && (
          <p className="nx-pet-hint">Nenhum arquivo registrado no acervo desta PET.</p>
        )}
      </div>
    </section>
  );
}
