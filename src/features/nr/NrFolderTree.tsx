import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Folder } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { nrConsultar } from "./nr.functions";
import type { Norma, NrRecord } from "./domain";
import type { NrSearch } from "./NrWorkspace";
export function NrFolderTree({
  org,
  norma,
  search,
}: {
  org: string;
  norma: Norma;
  search: NrSearch;
}) {
  return (
    <details className="nr-panel">
      <summary className="cursor-pointer font-semibold min-h-11">Árvore de pastas</summary>
      <p className="nr-muted my-3">
        Explore as pastas para consultar documentos, fotos e anexos do acervo.
      </p>
      <FolderBranch org={org} norma={norma} search={search} parentId={null} ancestors={[]} />
    </details>
  );
}
function FolderBranch({
  org,
  norma,
  search,
  parentId,
  ancestors,
}: {
  org: string;
  norma: Norma;
  search: NrSearch;
  parentId: string | null;
  ancestors: string[];
}) {
  const consult = useServerFn(nrConsultar);
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["nr", org, norma, "pasta-arvore", search.cliente, search.unidade, parentId, page],
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma,
          recurso: "pastas",
          cliente_id: search.cliente || undefined,
          unidade_id: search.unidade || undefined,
          pasta_id: parentId,
          pagina: page,
          limite: 25,
        },
        signal,
      }),
    retry: false,
  });
  const result = query.data as { rows: NrRecord[]; total: number; limite: number } | undefined;
  return (
    <div>
      {query.isPending ? (
        <p role="status" className="nr-muted">
          Consultando pastas…
        </p>
      ) : query.isError ? (
        <p className="nr-feedback" role="alert">
          {query.error.message}
        </p>
      ) : (
        <>
          <ul className="nr-folder-branch">
            {result?.rows.map((row) => (
              <FolderNode
                key={row.id}
                org={org}
                norma={norma}
                search={search}
                row={row}
                ancestors={ancestors}
              />
            ))}
          </ul>
          {!result?.rows.length && <p className="nr-muted py-2">Sem subpastas.</p>}
          {(result?.total ?? 0) > 25 && (
            <div className="nr-actions">
              <ActionButton variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Pastas anteriores
              </ActionButton>
              <ActionButton
                variant="ghost"
                disabled={(page + 1) * 25 >= (result?.total ?? 0)}
                onClick={() => setPage(page + 1)}
              >
                Mais pastas
              </ActionButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function FolderNode({
  org,
  norma,
  search,
  row,
  ancestors,
}: {
  org: string;
  norma: Norma;
  search: NrSearch;
  row: NrRecord;
  ancestors: string[];
}) {
  const [open, setOpen] = useState(false);
  const cycle = ancestors.includes(row.id) || ancestors.length >= 32;
  return (
    <li>
      <div className="nr-folder-node">
        <button
          type="button"
          disabled={cycle}
          aria-expanded={open}
          aria-label={`${open ? "Recolher" : "Expandir"} pasta ${row.titulo}`}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight size={17} className={open ? "rotate-90" : ""} />
        </button>
        <Link
          to={String(`${norma === "NR33" ? "/nr-33" : "/nr-35"}/pastas/${row.id}`)}
          search={search}
        >
          <Folder size={17} aria-hidden />
          {row.titulo}
          {row.resumo_pasta && (
            <span className="nr-muted">
              {row.resumo_pasta.subpastas > 0 && `${row.resumo_pasta.subpastas} pastas · `}
              {row.resumo_pasta.documentos} documentos · {row.resumo_pasta.imagens} imagens
              {row.resumo_pasta.arquivos > row.resumo_pasta.imagens &&
                ` · ${row.resumo_pasta.arquivos - row.resumo_pasta.imagens} outros arquivos`}
            </span>
          )}
        </Link>
      </div>
      {cycle && <p className="nr-muted">Hierarquia limitada para revisão de integridade.</p>}
      {open && !cycle && (
        <div className="nr-folder-children">
          <FolderBranch
            org={org}
            norma={norma}
            search={search}
            parentId={row.id}
            ancestors={[...ancestors, row.id]}
          />
        </div>
      )}
    </li>
  );
}
export function NrFolderBreadcrumbs({
  org,
  norma,
  row,
  search,
}: {
  org: string;
  norma: Norma;
  row: NrRecord;
  search: NrSearch;
}) {
  const consult = useServerFn(nrConsultar);
  const query = useQuery({
    queryKey: ["nr", org, norma, "pasta-caminho", row.id, row.parent_id],
    enabled: !!row.parent_id,
    queryFn: async ({ signal }) => {
      const result: NrRecord[] = [];
      const seen = new Set([row.id]);
      let next = row.parent_id;
      while (next && result.length < 32) {
        if (seen.has(next))
          throw new Error("Ciclo na hierarquia de pastas. A relação exige revisão.");
        seen.add(next);
        const response = await consult({
          data: {
            organization_id: org,
            norma,
            recurso: "pastas",
            operacao: "detalhe",
            id: next,
            cliente_id: row.cliente_id || undefined,
            unidade_id: row.unidade_id || undefined,
          },
          signal,
        });
        const parent = (response as { registro: NrRecord }).registro;
        result.unshift(parent);
        next = parent.parent_id;
      }
      return result;
    },
    retry: false,
  });
  const base = norma === "NR33" ? "/nr-33" : "/nr-35";
  return (
    <nav aria-label="Caminho da pasta" className="nr-folder-breadcrumbs">
      <Link to={String(`${base}/pastas`)} search={{ ...search, pasta: "", pagina: 0 }}>
        Raiz
      </Link>
      {query.data?.map((parent) => (
        <span key={parent.id}>
          <ChevronRight size={14} aria-hidden />
          <Link to={String(`${base}/pastas/${parent.id}`)} search={search}>
            {parent.titulo}
          </Link>
        </span>
      ))}
      <span>
        <ChevronRight size={14} aria-hidden />
        <span aria-current="page">{row.titulo}</span>
      </span>
      {query.isError && (
        <span role="alert" className="nr-muted">
          Caminho ancestral indisponível: {query.error.message}
        </span>
      )}
    </nav>
  );
}
