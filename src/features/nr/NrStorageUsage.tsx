import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, RefreshCw } from "lucide-react";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { nrArquivoConsumo } from "./files.functions";
import type { NrContexto } from "./domain";
import { NrCard, NrCardMeta } from "./NrCards";
const size = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value / 1024 / 1024) + " MiB";
export function NrStorageUsage({ org, contexto }: { org: string; contexto: NrContexto }) {
  const load = useServerFn(nrArquivoConsumo);
  const query = useQuery({
    queryKey: ["nr", org, "consumo-organizacao"],
    queryFn: ({ signal }) => load({ data: { organization_id: org }, signal }),
    retry: false,
    staleTime: 15000,
  });
  return (
    <section className="nr-panel">
      <div className="nr-panel-header">
        <div>
          <h2>
            <Database size={18} className="inline mr-2" aria-hidden />
            Acervo e processamento da organização
          </h2>
          <p className="nr-muted">
            Medição consolidada da organização inteira, independente do cliente selecionado.
          </p>
        </div>
        <ActionButton
          variant="ghost"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={15} />
          Atualizar medição
        </ActionButton>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        query.data && (
          <>
            <dl className="nr-facts">
              <div>
                <dt>Bytes físicos medidos</dt>
                <dd>
                  {size(query.data.bytes_fisicos_medidos)} ·{" "}
                  {query.data.bytes_fisicos_medidos.toLocaleString("pt-BR")} bytes
                </dd>
              </div>
              <div>
                <dt>Objetos físicos</dt>
                <dd>{query.data.objetos_fisicos.toLocaleString("pt-BR")}</dd>
              </div>
              <div>
                <dt>Objetos sem tamanho disponível</dt>
                <dd>{query.data.objetos_sem_tamanho.toLocaleString("pt-BR")}</dd>
              </div>
              {(
                [
                  ["Revisões documentais", query.data.quantidade_revisoes],
                  ["Uploads em andamento", query.data.uploads_em_andamento],
                  ["Falhas de arquivo", query.data.falhas],
                  ["Lotes em andamento", query.data.lotes_em_andamento],
                  ["Lotes com pendências", query.data.lotes_com_pendencias],
                ] as const
              ).map(([label, value]) =>
                typeof value === "number" ? (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value.toLocaleString("pt-BR")}</dd>
                  </div>
                ) : null,
              )}
            </dl>
            <p className="nr-muted">
              Escopo da medição: {query.data.escopo_medicao}. Coleta:{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "America/Sao_Paulo",
              }).format(new Date(query.data.medido_em))}{" "}
              (Brasília).
            </p>
            <p className="nr-source">
              Capacidade informada: {query.data.capacidade_informada}. O escopo dessa capacidade
              permanece sem confirmação e não é aplicado como quota automática. Memória informada do
              banco: {query.data.ram_banco_informada}; consumo de RAM não medido por esta consulta.
            </p>
            {query.data.por_unidade && (
              <section className="my-4" aria-label="Consumo físico por unidade">
                <h3>Consumo físico por unidade</h3>
                <ul className="nr-card-grid mt-3">
                  {query.data.por_unidade.map((row) => (
                    <li key={row.unidade_id}>
                      <NrCard kind="consumo">
                        <header className="nr-card-heading">
                          <div className="nr-card-identity">
                            <span className="nr-card-category">
                              {contexto.clientes.find((c) => c.id === row.cliente_id)?.nome ||
                                "Cliente autorizado"}
                            </span>
                            <h4>
                              {contexto.unidades.find((u) => u.id === row.unidade_id)?.nome ||
                                row.unidade_id}
                            </h4>
                          </div>
                        </header>
                        <NrCardMeta>
                          <div>
                            <dt>Objetos</dt>
                            <dd>{row.objetos.toLocaleString("pt-BR")}</dd>
                          </div>
                          <div>
                            <dt>Bytes medidos</dt>
                            <dd>{size(row.bytes)}</dd>
                          </div>
                        </NrCardMeta>
                      </NrCard>
                    </li>
                  ))}
                </ul>
                {!query.data.por_unidade.length && (
                  <p className="nr-muted">Sem objetos físicos contabilizados por unidade.</p>
                )}
              </section>
            )}
            {query.data.por_bucket && (
              <section className="my-4" aria-label="Consumo físico por bucket privado">
                <h3>Consumo físico por bucket privado</h3>
                <ul className="nr-card-grid mt-3">
                  {query.data.por_bucket.map((row) => (
                    <li key={row.bucket_id}>
                      <NrCard kind="consumo">
                        <header className="nr-card-heading">
                          <div className="nr-card-identity">
                            <span className="nr-card-category">Bucket privado</span>
                            <h4>{row.bucket_id}</h4>
                          </div>
                        </header>
                        <NrCardMeta>
                          <div>
                            <dt>Objetos</dt>
                            <dd>{row.objetos.toLocaleString("pt-BR")}</dd>
                          </div>
                          <div>
                            <dt>Bytes medidos</dt>
                            <dd>{size(row.bytes)}</dd>
                          </div>
                        </NrCardMeta>
                      </NrCard>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )
      )}
    </section>
  );
}
