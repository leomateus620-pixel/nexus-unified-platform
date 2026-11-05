import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoadingState, ErrorState } from "@/components/nexus/Page";
import { petDate } from "../ui-types";
import { petDemoRegistros } from "./demo.functions";
import { demoDetail } from "./domain";
import { demoKey, type DemoScope } from "./hooks";

export function PetDemoHistory({
  scope,
  user,
  id,
}: {
  scope: DemoScope;
  user: string;
  id: string;
}) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(0),
    load = useServerFn(petDemoRegistros);
  const q = useQuery({
    queryKey: [...demoKey(scope, user), id, "eventos", page],
    enabled: open,
    queryFn: ({ signal }) =>
      load({ data: { ...scope, id, recurso: "eventos", pagina: page }, signal }),
    retry: false,
  });
  const rows = q.data ? demoDetail.shape.eventos.parse(q.data.registros) : [];
  return (
    <details className="pet-demo-disclosure" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Histórico da demonstração</summary>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <ol className="pet-demo-timeline">
            {rows.map((e) => (
              <li key={e.id}>
                <strong>
                  {(
                    {
                      criar: "Rascunho criado",
                      salvar: "Preenchimento salvo",
                      iniciar: "Demonstração iniciada",
                      entrada: "Entrada registrada",
                      saida: "Saída registrada",
                      medicao: "Medição registrada",
                      ocorrencia: "Ocorrência",
                      prorrogar: "Período prorrogado",
                      encerrar: "Demonstração encerrada",
                      cancelar: "Demonstração cancelada",
                    } as Record<string, string>
                  )[e.tipo] ?? e.tipo}
                </strong>
                <time>{petDate(e.created_at)}</time>
                {!!e.dados["texto"] && <p>{String(e.dados["texto"])}</p>}
                {e.tipo === "medicao" && (
                  <p>
                    {String(e.dados["agente"])}: {String(e.dados["valor"])}{" "}
                    {String(e.dados["unidade"])}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {q.data && q.data.total > 50 && (
            <div className="pet-demo-pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>Página {page + 1}</span>
              <button disabled={(page + 1) * 50 >= q.data.total} onClick={() => setPage(page + 1)}>
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </details>
  );
}
