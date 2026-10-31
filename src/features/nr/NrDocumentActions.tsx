import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FilePenLine } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { useCommandKey } from "@/features/operacao/components";
import type { Norma } from "./domain";
import { nrDocumentoExportar, nrDocumentoConverterDocx } from "./documents.functions";
export function NrDocumentActions({
  org,
  norma,
  documentoId,
  expectedVersion,
}: {
  org: string;
  norma: Norma;
  documentoId: string;
  expectedVersion: number;
}) {
  const run = useServerFn(nrDocumentoExportar);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  async function exportFile(format: "pdf" | "docx") {
    if (busy) return;
    setBusy(format);
    setError("");
    try {
      const result = await run({
        data: {
          organization_id: org,
          norma,
          documento_id: documentoId,
          expected_version: expectedVersion,
          formato: format,
        },
      });
      const bytes = Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
      const blob = new Blob([bytes], { type: result.mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.nome;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setWarnings(result.avisos);
      setNotice(
        `Derivado de consulta gerado${result.paginas ? ` · ${result.paginas} páginas` : ""}. O arquivo baixado não foi armazenado, emitido ou assinado.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "A exportação não foi concluída.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="nr-source">
      <p className="nr-muted mb-3">
        Exportar o conteúdo desta revisão como cópia de consulta. Laudos e procedimentos emitidos
        são abertos pelos arquivos originais vinculados; esta exportação não substitui sua
        apresentação completa.
      </p>
      <div className="nr-actions">
        <ActionButton
          variant="ghost"
          disabled={!!busy}
          loading={busy === "pdf"}
          onClick={() => void exportFile("pdf")}
        >
          <Download size={15} />
          Exportar consulta PDF
        </ActionButton>
        <ActionButton
          variant="ghost"
          disabled={!!busy}
          loading={busy === "docx"}
          onClick={() => void exportFile("docx")}
        >
          <Download size={15} />
          Exportar consulta DOCX
        </ActionButton>
      </div>
      {notice && (
        <p className="nr-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="nr-feedback">
          {error}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="nr-muted mt-3">
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
export function NrDocxConvertButton({
  org,
  norma,
  documentoId,
  arquivoId,
  expectedVersion,
}: {
  org: string;
  norma: Norma;
  documentoId: string;
  arquivoId: string;
  expectedVersion: number;
}) {
  const run = useServerFn(nrDocumentoConverterDocx),
    keyFor = useCommandKey(),
    qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ id: string; avisos: string[] } | null>(null);
  async function convert() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        organization_id: org,
        norma,
        documento_id: documentoId,
        arquivo_id: arquivoId,
        expected_version: expectedVersion,
      };
      const response = await run({ data: { ...payload, chave: keyFor(payload) } });
      setResult({ id: response.registro.id, avisos: response.avisos });
      await qc.invalidateQueries({ queryKey: ["nr", org] });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Conversão não concluída. O original permanece preservado.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <ActionButton
        variant="ghost"
        loading={busy}
        disabled={!!result}
        onClick={() => void convert()}
      >
        <FilePenLine size={15} />
        Criar edição derivada do DOCX
      </ActionButton>
      {error && (
        <p role="alert" className="nr-feedback">
          {error}
        </p>
      )}
      {result && (
        <div className="nr-notice" role="status">
          <div>
            <p>
              Edição derivada criada. O arquivo original e suas revisões permanecem preservados.
            </p>
            <Link
              className="underline"
              to={String(`${norma === "NR33" ? "/nr-33" : "/nr-35"}/documentos/${result.id}`)}
            >
              Abrir conteúdo convertido
            </Link>
            {result.avisos.map((warning, index) => (
              <p className="nr-muted" key={index}>
                {warning}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
