import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { fieldClass } from "@/features/operacao/components";
import { acessoAgendaNegado } from "./domain";
import { formatCivil, formatInstant } from "./calendar-domain";
import { agendaFreshness } from "./queries";
import { listarPendenciasSerieAgenda } from "./serie-pendencias.functions";

function reason(code: string | null) {
  if (code === "23P01")
    return "Conflito de período, pessoa ou ferramenta. Confira as reservas antes de reprocessar.";
  if (code === "23514")
    return "Requisito ou regra operacional não atendido. Confira as pessoas, competências e recursos da série.";
  if (code === "42501")
    return "O acesso atual à origem, ao responsável ou ao recurso não permitiu gerar esta ocorrência.";
  if (code === "23505")
    return "Uma ocorrência ou vínculo já existe. Confira a origem antes de reprocessar.";
  if (code === "HORARIO_CIVIL_INEXISTENTE")
    return "O horário civil não existe nessa data e nesse fuso. Esta ocorrência foi pulada pela regra de recorrência.";
  return "A geração não foi confirmada. Confira o código e as condições da série antes de reprocessar.";
}
export function AgendaSeriePending({
  org,
  event,
  serie,
  timezone,
  onDenied,
}: {
  org: string;
  event: string;
  serie: string;
  timezone: string;
  onDenied: (error: unknown) => void;
}) {
  const [version, setVersion] = useState<string | null>(null),
    [page, setPage] = useState(0),
    [versionPage, setVersionPage] = useState(0);
  const load = useServerFn(listarPendenciasSerieAgenda);
  const q = useQuery({
    queryKey: ["agenda-equipe", org, "ocorrencias-serie", event, serie, version, page, versionPage],
    ...agendaFreshness,
    // Returning to a cached page must revalidate cuts/counts changed by the worker.
    staleTime: 0,
    queryFn: ({ signal }) =>
      load({
        data: {
          organization_id: org,
          evento_id: event,
          versao_id: version,
          pagina: page,
          pagina_versoes: versionPage,
        },
        signal,
      }),
  });
  useEffect(() => {
    if (acessoAgendaNegado(q.error)) onDenied(q.error);
  }, [q.error, onDenied]);
  const data = q.isError ? undefined : q.data;
  return (
    <section
      aria-label="Ocorrências da série"
      className="mt-2 grid min-w-0 gap-3 border-t border-border pt-3"
    >
      <h3 className="text-sm font-medium">Ocorrências a conferir</h3>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <LoadingState label="Consultando ocorrências autorizadas…" />
      ) : (
        data && (
          <>
            {data.serie.materializacao_pendente && (
              <p className="text-sm">
                Há processamento da série ainda pendente. Isso não significa conflito em todas as
                datas.
              </p>
            )}
            {data.serie.ultima_falha_codigo && (
              <p className="rounded border border-border p-3 text-sm">
                Última falha do processamento: <code>{data.serie.ultima_falha_codigo}</code>.{" "}
                {reason(data.serie.ultima_falha_codigo)}
                {data.serie.ultima_tentativa && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Tentativa: {formatInstant(data.serie.ultima_tentativa, timezone)}
                  </span>
                )}
              </p>
            )}
            <label className="grid gap-1 text-sm">
              Versão da série
              <select
                className={fieldClass}
                value={data.versao.id}
                onChange={(e) => {
                  setVersion(e.target.value);
                  setPage(0);
                }}
              >
                {!data.versoes.registros.some((row) => row.id === data.versao.id) && (
                  <option value={data.versao.id}>
                    V{data.versao.numero} · desde {formatCivil(data.versao.inicio_aplicacao)}
                  </option>
                )}
                {data.versoes.registros.map((row) => (
                  <option key={row.id} value={row.id}>
                    V{row.numero} · desde {formatCivil(row.inicio_aplicacao)}
                    {row.id === data.serie.versao_atual_id ? " · Atual" : ""}
                  </option>
                ))}
              </select>
            </label>
            {(data.versoes.total > 25 || versionPage > 0) && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Versões · Página {versionPage + 1}</span>
                <ActionButton
                  variant="ghost"
                  disabled={!versionPage}
                  onClick={() => setVersionPage((p) => p - 1)}
                >
                  Página anterior de versões
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  disabled={(versionPage + 1) * 25 >= data.versoes.total}
                  onClick={() => setVersionPage((p) => p + 1)}
                >
                  Próxima página de versões
                </ActionButton>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Datas a partir de {formatCivil(data.versao.inicio_aplicacao)}
              {data.corte_exclusivo ? ` e anteriores a ${formatCivil(data.corte_exclusivo)}` : ""}.
              Ocorrências substituídas ou posteriores ao cancelamento não entram neste recorte.
            </p>
            {data.registros.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {data.total > 0
                  ? "Nenhum registro nesta página; retorne à anterior."
                  : "Nenhuma ocorrência bloqueada ou pulada nesta versão e recorte."}
              </p>
            ) : (
              <ol className="grid gap-2">
                {data.registros.map((row) => (
                  <li
                    key={row.serie_versao_id + row.data}
                    className="rounded border border-border p-3 text-sm"
                  >
                    <p className="font-medium">
                      {formatCivil(row.data, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}{" "}
                      · {row.estado === "bloqueada" ? "Bloqueada" : "Pulada"}
                    </p>
                    <p className="mt-1 break-words">{reason(row.codigo)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Código: {row.codigo ?? "não informado"} · {row.tentativas} tentativas
                    </p>
                    {row.estado === "bloqueada" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Próxima tentativa prevista: {formatInstant(row.proxima_tentativa, timezone)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {(data.total > 25 || page > 0) && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {data.total} ocorrências · Página {page + 1}
                </span>
                <div className="flex gap-2">
                  <ActionButton
                    variant="ghost"
                    disabled={!page}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Ocorrências anteriores
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    disabled={(page + 1) * 25 >= data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próximas ocorrências
                  </ActionButton>
                </div>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
