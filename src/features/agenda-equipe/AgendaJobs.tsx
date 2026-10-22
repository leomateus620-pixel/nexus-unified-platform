import type { ConfiguracaoAgenda } from "./types";
import { formatInstant } from "./calendar-domain";
export function AgendaJobs({
  jobs,
  timezone,
}: {
  jobs: NonNullable<ConfiguracaoAgenda["jobs"]>;
  timezone: string;
}) {
  return (
    <details className="mb-4 rounded-lg border border-border bg-card p-3">
      <summary className="cursor-pointer text-sm font-medium">Processamento dos lembretes</summary>
      <div className="mt-4 grid gap-3 text-sm">
        <p>
          {jobs.scheduler?.estado === "ativo"
            ? "Processamento automático ativo."
            : "Processamento automático indisponível."}
        </p>
        {jobs.scheduler?.estado !== "ativo" && (
          <p className="text-xs text-muted-foreground">
            Os compromissos permanecem salvos. A coordenação precisa restabelecer o processamento
            para gerar os lembretes futuros.
          </p>
        )}
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Última execução registrada</dt>
            <dd>
              {jobs.ultima_execucao
                ? formatInstant(jobs.ultima_execucao.iniciado_em, timezone) +
                  " · " +
                  (jobs.ultima_execucao.estado === "sucesso"
                    ? "Finalizada"
                    : jobs.ultima_execucao.estado === "falha"
                      ? "Com falha"
                      : "Em processamento")
                : "Nenhuma execução registrada"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fila desta organização</dt>
            <dd>
              {jobs.fila_organizacao.pendentes} pendentes · {jobs.fila_organizacao.falhas} com falha
              · {jobs.fila_organizacao.concluidos} concluídos
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          As notificações internas não enviam e-mail ou mensagem externa. Para uma falha de
          compromisso específico, abra sua ficha e use “Reprocessar notificações”.
        </p>
      </div>
    </details>
  );
}
