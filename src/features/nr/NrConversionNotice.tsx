import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Download, FilePenLine } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { nrArquivoBaixar } from "./files.functions";
import type { Norma, NrRecord } from "./domain";
import { sourceDate } from "./technical-evidence";

function dictionary(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function NrConversionNotice({ row, norma }: { row: NrRecord; norma?: Norma }) {
  const conversion = dictionary(row.dados["conversao"]);
  const fileId = conversion["original_arquivo_id"] ?? row.dados["arquivo_original_id"];
  const converter = conversion["conversor"] ?? row.dados["converter"];
  const rawWarnings = conversion["avisos"] ?? row.dados["avisos_conversao"];
  const warnings = Array.isArray(rawWarnings)
    ? rawWarnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  const hasConversion = Object.keys(conversion).length > 0 || typeof fileId === "string";
  const summary = row.resumo_documental;
  const base = (norma ?? row.normas[0]) === "NR35" ? "/nr-35" : "/nr-33";
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
  if (!hasConversion && !summary) return null;
  return (
    <aside className="nr-source my-4" aria-label="Origem, arquivos e linhagem documental">
      <div>
        {summary && (
          <section className="mb-4">
            <h3 className="font-semibold">Documento, revisão e arquivos originais</h3>
            <dl className="nr-facts mt-3">
              <div>
                <dt>Revisão preservada</dt>
                <dd>
                  {summary.revisao_numero ?? "Não informada"} ·{" "}
                  {summary.vigencia_apresentacao.replaceAll("_", " ")}
                </dd>
              </div>
              <div>
                <dt>Data da origem</dt>
                <dd>{sourceDate(summary.data_origem_texto || summary.data_origem)}</dd>
              </div>
              <div>
                <dt>Representações confirmadas</dt>
                <dd>
                  {summary.arquivos_word} Word · {summary.arquivos_pdf} PDF ·{" "}
                  {summary.arquivos_total} arquivos vinculados
                </dd>
              </div>
              {summary.autor_historico && (
                <div>
                  <dt>Responsável histórico</dt>
                  <dd>{summary.autor_historico}</dd>
                </div>
              )}
            </dl>
            {summary.motivo_substituicao && (
              <p className="nr-notice mt-3">
                Nota preservada da origem: {summary.motivo_substituicao}
                {summary.vigencia === "vigente" && (
                  <span className="block mt-2">
                    A vigência estruturada ainda está registrada como vigente. A nota exige
                    conferência da revisão; não foi criada uma sucessão sem documento comprovado.
                  </span>
                )}
              </p>
            )}
            {summary.disponibilidade === "sem_arquivo_confirmado" && (
              <p className="nr-muted mt-2">
                Nenhum binário confirmado nesta revisão. O conteúdo de consulta abaixo não substitui
                o original emitido.
              </p>
            )}
            {summary.correspondencia_pendente && (
              <p className="nr-notice mt-3">
                Cópia editável com correspondência documental pendente. O arquivo de origem e os
                vínculos existentes estão preservados; esta cópia permanece acessível sem ser
                agrupada por semelhança de título.
              </p>
            )}
            {summary.linhagem_comprovada && summary.documento_origem_id && (
              <p className="mt-3">
                <Link
                  className="underline"
                  to={String(`${base}/documentos/${summary.documento_origem_id}`)}
                  search={(current) => ({
                    ...current,
                    cliente: row.cliente_id || "",
                    unidade: row.unidade_id || "",
                    pagina: 0,
                  })}
                >
                  Abrir documento de origem desta cópia
                </Link>
              </p>
            )}
            {summary.copias_editaveis.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium">Cópias editáveis ligadas ao original</h4>
                <ul className="nr-record-list">
                  {summary.copias_editaveis.map((copy) => (
                    <li key={copy.id} className="py-2">
                      <Link
                        className="underline"
                        to={String(`${base}/documentos/${copy.id}`)}
                        search={(current) => ({
                          ...current,
                          cliente: row.cliente_id || "",
                          unidade: row.unidade_id || "",
                          pagina: 0,
                        })}
                      >
                        {copy.titulo}
                      </Link>
                      <p className="nr-muted">
                        {copy.estado.replaceAll("_", " ")} · derivada do DOCX original, com
                        identidade própria
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
        {hasConversion && (
          <>
            <h3 className="flex items-center gap-2 font-semibold">
              <FilePenLine size={17} aria-hidden="true" /> Conteúdo convertido de DOCX
            </h3>
            <p className="mt-2">
              Esta cópia editável preserva o arquivo original. Confira tabelas, mesclas, imagens e
              notação matemática antes da revisão técnica.
            </p>
            {typeof converter === "string" && (
              <details className="nr-muted mt-2">
                <summary className="cursor-pointer">Informações da conversão</summary>
                <p>{converter}</p>
              </details>
            )}
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
          </>
        )}
      </div>
    </aside>
  );
}
