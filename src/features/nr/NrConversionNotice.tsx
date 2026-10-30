import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FilePenLine } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { nrArquivoBaixar } from "./files.functions";
import type { NrRecord } from "./domain";

function dictionary(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function NrConversionNotice({ row }: { row: NrRecord }) {
  const conversion = dictionary(row.dados["conversao"]);
  const fileId = conversion["original_arquivo_id"] ?? row.dados["arquivo_original_id"];
  const converter = conversion["conversor"] ?? row.dados["converter"];
  const rawWarnings = conversion["avisos"] ?? row.dados["avisos_conversao"];
  const warnings = Array.isArray(rawWarnings)
    ? rawWarnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  const hasConversion = Object.keys(conversion).length > 0 || typeof fileId === "string";
  const download = useServerFn(nrArquivoBaixar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function original() {
    if (busy || typeof fileId !== "string") return;
    setBusy(true);
    setError("");
    try {
      const response = await download({
        data: { organization_id: row.organization_id, id: fileId },
      });
      const link = document.createElement("a");
      link.href = response.url;
      link.download = response.arquivo.nome;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Original indisponível para download.");
    } finally {
      setBusy(false);
    }
  }
  if (!hasConversion) return null;
  return (
    <aside className="nr-notice my-4" aria-label="Origem e limites da conversão DOCX">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <FilePenLine size={17} aria-hidden="true" /> Conteúdo convertido de DOCX
        </h3>
        <p className="mt-2">
          Esta cópia editável preserva o arquivo original. Confira tabelas, mesclas, imagens e
          notação matemática antes da revisão técnica.
        </p>
        {typeof converter === "string" && <p className="nr-muted mt-2">Conversor: {converter}</p>}
        {warnings.length > 0 && (
          <ul className="mt-3 list-disc pl-5">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        )}
        {typeof fileId === "string" && (
          <ActionButton
            variant="ghost"
            className="mt-3"
            loading={busy}
            onClick={() => void original()}
          >
            <Download size={16} aria-hidden="true" /> Baixar DOCX original
          </ActionButton>
        )}
        {error && (
          <p role="alert" className="nr-feedback mt-2">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
