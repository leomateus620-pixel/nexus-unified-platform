import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { nrConsultar } from "./nr.functions";
import { nrRevisaoDetalhe, nrRevisoesListar } from "./history.functions";
import type { Norma, NrRecord } from "./domain";
import { parseNative, type NativeContent } from "./native-content";
import { NrContentEditor } from "./NrContentEditor";

export type NrDocumentModelSelection = {
  modelo_id: string;
  modelo_versao_id?: string;
  modelo_expected_version: number;
  normas: Norma[];
  conteudo: NativeContent;
};

/** A version is chosen explicitly; a current-body snapshot is created only in the save transaction. */
export function NrDocumentModelSelector({
  org,
  norma,
  clienteId,
  unidadeId,
  onSelection,
}: {
  org: string;
  norma: Norma;
  clienteId: string;
  unidadeId: string;
  onSelection: (value: NrDocumentModelSelection | null) => void;
}) {
  const consult = useServerFn(nrConsultar);
  const revisions = useServerFn(nrRevisoesListar);
  const revisionDetail = useServerFn(nrRevisaoDetalhe);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [modelId, setModelId] = useState("");
  const [versionId, setVersionId] = useState("");
  useEffect(() => {
    setModelId("");
    setVersionId("");
  }, [clienteId, unidadeId]);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const list = useQuery({
    queryKey: ["nr", org, norma, "modelos-documento", clienteId, unidadeId, term],
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso: "modelos",
          tipo: "documento",
          cliente_id: clienteId || undefined,
          unidade_id: unidadeId || undefined,
          busca: term,
          pagina: 0,
          limite: 25,
        },
        signal,
      }),
    retry: false,
  });
  const current = useQuery({
    queryKey: ["nr", org, norma, "modelo-documento", modelId, clienteId, unidadeId],
    enabled: !!modelId,
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso: "modelos",
          id: modelId,
          operacao: "detalhe",
          cliente_id: clienteId || undefined,
          unidade_id: unidadeId || undefined,
        },
        signal,
      }),
    retry: false,
  });
  const versions = useInfiniteQuery({
    queryKey: ["nr", org, norma, "modelo-documento-versoes", modelId],
    enabled: !!modelId,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      revisions({
        data: {
          organization_id: org,
          norma,
          recurso: "modelos",
          registro_id: modelId,
          pagina: pageParam,
          limite: 25,
        },
        signal,
      }),
    getNextPageParam: (last) =>
      (last.pagina + 1) * last.limite < last.total ? last.pagina + 1 : undefined,
    retry: false,
  });
  const past = useQuery({
    queryKey: ["nr", org, norma, "modelo-documento-versao", modelId, versionId],
    enabled: !!modelId && !!versionId,
    queryFn: ({ signal }) =>
      revisionDetail({
        data: {
          organization_id: org,
          norma,
          recurso: "modelos",
          registro_id: modelId,
          revisao_id: versionId,
        },
        signal,
      }),
    retry: false,
  });
  const model =
    current.data && "registro" in current.data ? (current.data.registro as NrRecord) : null;
  const content = useMemo(
    () => parseNative(versionId ? past.data?.["conteudo"] : model?.conteudo),
    [versionId, past.data, model],
  );
  useEffect(() => {
    onSelection(
      model && content && (!versionId || past.isSuccess)
        ? {
            modelo_id: model.id,
            modelo_expected_version: model.version,
            normas: model.normas,
            conteudo: content,
            ...(versionId ? { modelo_versao_id: versionId } : {}),
          }
        : null,
    );
  }, [model, content, versionId, past.isSuccess, onSelection]);
  const rows = list.data && "rows" in list.data ? (list.data.rows as NrRecord[]) : [];
  const versionRows = versions.data?.pages.flatMap((page) => page.rows) ?? [];
  return (
    <section className="nr-panel nr-wide" aria-label="Modelo de documento">
      <h3>Modelo e versão de origem</h3>
      <div className="nr-field-grid">
        <label>
          Buscar modelo de documento
          <input
            type="search"
            value={search}
            maxLength={200}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Modelo de documento *
          <select
            value={modelId}
            required
            onChange={(e) => {
              setModelId(e.target.value);
              setVersionId("");
            }}
          >
            <option value="">Selecione um modelo</option>
            {modelId && !rows.some((row) => row.id === modelId) && (
              <option value={modelId}>{model?.titulo || "Modelo selecionado"}</option>
            )}
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.titulo}
              </option>
            ))}
          </select>
        </label>
        {model && (
          <label className="nr-wide">
            Versão do modelo *
            <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              <option value="">Capturar conteúdo atual · versão de edição {model.version}</option>
              {versionRows.map((row) => (
                <option key={String(row["id"])} value={String(row["id"])}>
                  Versão preservada {String(row["numero"])} ·{" "}
                  {typeof row["created_at"] === "string" &&
                  !Number.isNaN(new Date(row["created_at"]).valueOf())
                    ? new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(row["created_at"]))
                    : "Data não informada"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {versions.hasNextPage && (
        <ActionButton
          variant="ghost"
          loading={versions.isFetchingNextPage}
          onClick={() => void versions.fetchNextPage()}
        >
          Carregar mais 25 versões
        </ActionButton>
      )}
      {(list.isFetching || (modelId && current.isPending) || (versionId && past.isPending)) && (
        <LoadingState label="Consultando conteúdo autorizado do modelo…" />
      )}
      {[list, current, versions, past].find((query) => query.isError)?.error && (
        <ErrorState error={[list, current, versions, past].find((query) => query.isError)!.error} />
      )}
      {model && !content && !past.isFetching && (
        <p role="alert" className="nr-source">
          Este modelo não tem conteúdo nativo suportado. Selecione outra versão ou configure um
          modelo de documento na biblioteca.
        </p>
      )}
      {content && (
        <details className="nr-source mt-3">
          <summary>Prévia do conteúdo que será copiado · {content.blocos.length} blocos</summary>
          <NrContentEditor value={content} readOnly modelTemplate org={org} />
        </details>
      )}
      <p className="nr-muted mt-3">
        O servidor preserva a versão exata do modelo e captura os campos autorizados. O documento
        nasce como rascunho, com identidade própria. Revise e edite o conteúdo depois de salvar; o
        modelo e os documentos anteriores permanecem preservados.
      </p>
    </section>
  );
}
