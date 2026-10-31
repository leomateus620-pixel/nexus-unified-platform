import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Search, X } from "lucide-react";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import type { NrSearch } from "./NrWorkspace";
import { importResults, type NrImportMeta } from "./import-inspection.schemas";
import { nrImportacaoInspecionar } from "./import-inspection.functions";
import { NrCard, NrCardActions } from "./NrCards";

const labels: Record<string, string> = {
  identificado: "Identificado",
  extraido: "Extraído",
  importado: "Importado",
  ja_existente: "Já existente",
  duplicado_legitimo: "Duplicado legítimo",
  conflito: "Conflito",
  indisponivel: "Indisponível",
  erro: "Erro",
  sem_correspondencia: "Sem correspondência",
  com_pendencias: "Com pendências",
  concluido: "Concluído",
};
const text = (row: NrImportMeta, key: string) =>
  typeof row[key] === "string" ? (row[key] as string) : "";
const date = (value: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString("pt-BR")
    : "Não informada";

export function NrImportInspection({
  org,
  search,
  onSearch,
}: {
  org: string;
  search: NrSearch;
  onSearch: (patch: Partial<NrSearch>) => void;
}) {
  const load = useServerFn(nrImportacaoInspecionar);
  const opener = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const [term, setTerm] = useState(search.importBusca || "");
  useEffect(() => setTerm(search.importBusca || ""), [search.importBusca]);
  const lotId = search.importLote || "",
    itemId = search.importItem || "",
    page = search.importPagina || 0;
  const query = useQuery({
    queryKey: [
      "nr",
      org,
      "import-inspection",
      lotId,
      page,
      search.importResultado,
      search.importBusca,
    ],
    queryFn: ({ signal }) =>
      load({
        data: {
          organization_id: org,
          lote_id: lotId || undefined,
          pagina: page,
          limite: 25,
          resultado: importResults.find((value) => value === search.importResultado),
          busca: search.importBusca || "",
        },
        signal,
      }),
    retry: false,
  });
  const item = useQuery({
    queryKey: ["nr", org, "import-item", lotId, itemId],
    queryFn: ({ signal }) =>
      load({
        data: {
          organization_id: org,
          lote_id: lotId,
          item_id: itemId,
          pagina: 0,
          limite: 25,
          busca: "",
        },
        signal,
      }),
    enabled: !!lotId && !!itemId,
    retry: false,
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch({ importBusca: term.trim(), importPagina: 0, importItem: "" });
  }
  const rows = query.data?.rows ?? [],
    total = query.data?.total ?? 0;
  return (
    <section className="nr-panel">
      <div className="nr-panel-header">
        <div>
          <h2 ref={heading} tabIndex={-1} className="font-semibold">
            Conciliação das importações
          </h2>
          <p className="nr-muted">
            Visão administrativa da organização inteira. Cada resultado conserva sua origem,
            integridade e decisão de correspondência.
          </p>
        </div>
        {lotId && (
          <ActionButton
            variant="ghost"
            onClick={() =>
              onSearch({
                importLote: "",
                importItem: "",
                importPagina: 0,
                importResultado: "",
                importBusca: "",
              })
            }
          >
            <ArrowLeft size={15} />
            Todos os lotes
          </ActionButton>
        )}
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          {query.data?.lote && (
            <p className="my-3 break-all">
              Lote {lotId} ·{" "}
              <strong>
                {labels[text(query.data.lote, "estado")] || text(query.data.lote, "estado")}
              </strong>
            </p>
          )}
          {!!query.data?.por_resultado?.length && (
            <dl className="nr-facts my-4">
              {query.data.por_resultado.map((result) => (
                <div key={result.resultado}>
                  <dt>{labels[result.resultado] || result.resultado}</dt>
                  <dd>{result.quantidade.toLocaleString("pt-BR")}</dd>
                </div>
              ))}
            </dl>
          )}
          {lotId && (
            <form className="flex flex-wrap items-end gap-3 mb-4" onSubmit={submit}>
              <label className="nr-field flex-1 min-w-48">
                <span>Buscar item, caminho ou motivo</span>
                <input
                  className="nr-input"
                  maxLength={300}
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                />
              </label>
              <label className="nr-field">
                <span>Resultado</span>
                <select
                  className="nr-input"
                  value={search.importResultado || ""}
                  onChange={(event) =>
                    onSearch({
                      importResultado:
                        importResults.find((value) => value === event.target.value) ?? "",
                      importPagina: 0,
                      importItem: "",
                    })
                  }
                >
                  <option value="">Todos os resultados</option>
                  {importResults.map((result) => (
                    <option key={result} value={result}>
                      {labels[result]}
                    </option>
                  ))}
                </select>
              </label>
              <ActionButton type="submit" variant="ghost">
                <Search size={15} />
                Buscar
              </ActionButton>
            </form>
          )}
          <ul
            className="nr-card-grid"
            aria-label={lotId ? "Itens do lote de importação" : "Lotes de importação"}
          >
            {rows.map((row) => (
              <li key={text(row, "id")}>
                <NrCard>
                  {lotId ? (
                    <>
                      <header className="nr-card-heading">
                        <h3>{text(row, "tipo")}</h3>
                        <span className="nr-badge">
                          {labels[text(row, "resultado")] || text(row, "resultado")}
                        </span>
                      </header>
                      <p className="text-sm break-all mt-1">{text(row, "externo_id")}</p>
                      {text(row, "motivo") && (
                        <p className="nr-muted nr-prewrap mt-2">
                          {text(row, "motivo")}
                          {row["motivo_resumido"] === true
                            ? "… Abra o item para ler o motivo integral."
                            : ""}
                        </p>
                      )}
                      <NrCardActions>
                        <ActionButton
                          variant="ghost"
                          onClick={(event) => {
                            opener.current = event.currentTarget;
                            onSearch({ importItem: text(row, "id") });
                          }}
                        >
                          Inspecionar item
                        </ActionButton>
                      </NrCardActions>
                    </>
                  ) : (
                    <>
                      <header className="nr-card-heading">
                        <h3 className="break-all">{text(row, "origem")}</h3>
                        <span className="nr-badge">
                          {labels[text(row, "estado")] || text(row, "estado")}
                        </span>
                      </header>
                      <p className="nr-card-context">
                        Atualizado em {date(text(row, "updated_at"))}
                      </p>
                      <NrCardActions>
                        <ActionButton
                          onClick={() =>
                            onSearch({
                              importLote: text(row, "id"),
                              importPagina: 0,
                              importItem: "",
                              importResultado: "",
                              importBusca: "",
                            })
                          }
                        >
                          Inspecionar lote
                        </ActionButton>
                      </NrCardActions>
                    </>
                  )}
                </NrCard>
              </li>
            ))}
          </ul>
          {!rows.length && (
            <p className="nr-muted py-6">
              {lotId
                ? "Nenhum item corresponde aos filtros informados."
                : "Nenhum lote registrado nesta organização."}
            </p>
          )}
          {total > 0 && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 mt-4"
              aria-label="Paginação das importações"
            >
              <span className="nr-muted">
                Página {page + 1} de {Math.max(1, Math.ceil(total / 25))} ·{" "}
                {total.toLocaleString("pt-BR")} registros
              </span>
              <div className="flex gap-2">
                <ActionButton
                  variant="ghost"
                  disabled={page === 0}
                  onClick={() => onSearch({ importPagina: page - 1, importItem: "" })}
                >
                  Anterior
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  disabled={(page + 1) * 25 >= total}
                  onClick={() => onSearch({ importPagina: page + 1, importItem: "" })}
                >
                  Próxima
                </ActionButton>
              </div>
            </div>
          )}
        </>
      )}
      <Dialog.Root
        open={!!lotId && !!itemId}
        onOpenChange={(open) => {
          if (!open) onSearch({ importItem: "" });
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="nr-overlay" />
          <Dialog.Content
            className="nr-dialog max-w-4xl"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              (opener.current?.isConnected ? opener.current : heading.current)?.focus();
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold">Rastreabilidade do item</Dialog.Title>
              <Dialog.Close className="nr-dialog-close" aria-label="Fechar inspeção">
                <X size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="nr-muted mt-2">
              Snapshot privado e resultado da importação, preservados para conferência. Conteúdo da
              origem não cria aprovação ou assinatura Nexus.
            </Dialog.Description>
            {item.isPending ? (
              <LoadingState />
            ) : item.isError ? (
              <ErrorState error={item.error} onRetry={() => item.refetch()} />
            ) : (
              item.data?.item && (
                <>
                  <dl className="nr-facts my-4">
                    <div>
                      <dt>Resultado</dt>
                      <dd>
                        {labels[text(item.data.item, "resultado")] ||
                          text(item.data.item, "resultado")}
                      </dd>
                    </div>
                    <div>
                      <dt>Capturado em</dt>
                      <dd>{date(text(item.data.item, "capturado_em"))}</dd>
                    </div>
                  </dl>
                  {text(item.data.item, "motivo") && (
                    <p className="nr-prewrap my-4">{text(item.data.item, "motivo")}</p>
                  )}
                  <pre
                    className="nr-prewrap text-sm overflow-auto max-h-[55dvh] rounded-lg border border-slate-200 bg-slate-50 p-4"
                    tabIndex={0}
                    aria-label="Dados e evidências do item"
                  >
                    {JSON.stringify(item.data.item, null, 2)}
                  </pre>
                </>
              )
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
