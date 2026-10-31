import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { nrArquivoBaixar, nrArquivoVersoesListar } from "./files.functions";
import { sourceDate } from "./technical-evidence";
import type { Norma } from "./domain";

/** Drive revision metadata never falls back to the current binary. */
export function NrFileVersions({
  org,
  norma,
  fileId,
}: {
  org: string;
  norma: Norma;
  fileId: string;
}) {
  const list = useServerFn(nrArquivoVersoesListar),
    download = useServerFn(nrArquivoBaixar);
  const [page, setPage] = useState(0),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["nr", org, norma, "versoes-origem-arquivo", fileId, page],
    queryFn: ({ signal }) =>
      list({ data: { organization_id: org, norma, id: fileId, pagina: page, limite: 25 }, signal }),
    retry: false,
  });
  async function historical(id: string) {
    setBusy(id);
    setError("");
    try {
      const response = await download({ data: { organization_id: org, id } });
      const link = document.createElement("a");
      link.href = response.url;
      link.download = response.arquivo.nome;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "A versão histórica não está disponível para este acesso.",
      );
    } finally {
      setBusy(null);
    }
  }
  if (query.isPending) return <LoadingState label="Carregando metadados das versões históricas…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return (
    <section aria-label="Versões históricas da origem" className="mt-3">
      <p className="nr-muted">
        Metadados preservados de versões anteriores. A disponibilidade de cada revisão é
        independente do arquivo atual.
      </p>
      {error && (
        <p className="nr-feedback" role="alert">
          {error}
        </p>
      )}
      {query.data.rows.length ? (
        <ul className="nr-record-list">
          {query.data.rows.map((version) => (
            <li key={version.id} className="py-3">
              <div className="nr-panel-header">
                <div>
                  <strong>Versão da origem {version.versao_origem}</strong>
                  <p>{version.nome_original || "Nome original não informado"}</p>
                  <p className="nr-muted">
                    {sourceDate(version.modificado_em)}
                    {version.autor_historico && ` · ${version.autor_historico} (autoria histórica)`}
                  </p>
                  <p className="text-sm">
                    {version.bytes_disponiveis
                      ? "Binário histórico obtido e identificado"
                      : version.estado === "pendente"
                        ? "Recuperação pendente"
                        : "Binário histórico indisponível"}
                  </p>
                  {version.motivo && <p className="nr-muted mt-1">{version.motivo}</p>}
                </div>
                {version.bytes_disponiveis && version.arquivo_historico_id && (
                  <ActionButton
                    variant="ghost"
                    loading={busy === version.arquivo_historico_id}
                    disabled={!!busy}
                    onClick={() => void historical(version.arquivo_historico_id!)}
                  >
                    <Download size={15} />
                    Baixar esta versão histórica
                  </ActionButton>
                )}
              </div>
              <details className="text-sm">
                <summary className="nr-muted cursor-pointer">Metadados da versão</summary>
                <dl className="nr-facts mt-2">
                  <div>
                    <dt>Formato declarado</dt>
                    <dd>{version.mime || "Não informado"}</dd>
                  </div>
                  <div>
                    <dt>Tamanho declarado na origem</dt>
                    <dd>
                      {version.tamanho_declarado ?? "Não informado"}
                      {version.tamanho_declarado && " bytes"}
                    </dd>
                  </div>
                  <div>
                    <dt>Retenção informada pela origem</dt>
                    <dd>
                      {version.retencao_origem === null
                        ? "Não informada"
                        : version.retencao_origem
                          ? "Sim"
                          : "Não"}
                    </dd>
                  </div>
                  <div>
                    <dt>Captura dos metadados</dt>
                    <dd>{sourceDate(version.capturado_em)}</dd>
                  </div>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="nr-muted my-3">
          Nenhum metadado de versão histórica associado a este arquivo.
        </p>
      )}
      {query.data.total > query.data.limite && (
        <div className="nr-pagination">
          <span>{query.data.total} versões históricas</span>
          <div className="nr-actions">
            <ActionButton variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Versões anteriores
            </ActionButton>
            <ActionButton
              variant="ghost"
              disabled={(page + 1) * query.data.limite >= query.data.total}
              onClick={() => setPage(page + 1)}
            >
              Mais versões
            </ActionButton>
          </div>
        </div>
      )}
    </section>
  );
}
