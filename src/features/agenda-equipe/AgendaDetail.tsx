import { useEffect, useRef, useState } from "react";
import { ActionButton, ErrorState, LoadingState, Section } from "@/components/nexus/Page";
import { fieldClass } from "@/features/operacao/components";
import {
  acessoAgendaNegado,
  eventForSave,
  inputFromDetail,
  periodoEvento,
  estadoLabels,
  tipoLabels,
} from "./domain";
import { formatInstant, supportsTimezone } from "./calendar-domain";
import { useAgendaHistory } from "./queries";
import type { ComandoBody, DetalheAgenda } from "./types";
import type { AgendaEditor } from "./AgendaForms";
import { RecordFiles } from "@/features/operacao/RecordFiles";
import { AgendaSeriePending } from "./AgendaSeriePending";
type Props = {
  org: string;
  detail: DetalheAgenda;
  busy: boolean;
  onEdit: (editor: AgendaEditor) => void;
  onCommand: (body: ComandoBody) => Promise<boolean>;
  onOpenSource: () => void;
  onBack: () => void;
  onDenied: (error: unknown) => void;
  canRetryNotifications: boolean;
};
export function AgendaDetail({
  org,
  detail,
  busy,
  onEdit,
  onCommand,
  onOpenSource,
  onBack,
  onDenied,
  canRetryNotifications,
}: Props) {
  const e = detail.evento,
    p = detail.permissoes;
  const civilAvailable = supportsTimezone(e.timezone);
  const [comment, setComment] = useState(""),
    [commentError, setCommentError] = useState("");
  const composing = useRef(false);
  async function sendComment() {
    if (busy || composing.current) return;
    composing.current = true;
    try {
      if (comment.trim().length < 3) {
        setCommentError("Escreva ao menos três caracteres.");
        return;
      }
      const ok = await onCommand({
        comando: "comentar",
        dados: { evento_id: e.id, texto: comment.trim() },
      });
      if (ok) {
        setComment("");
        setCommentError("");
      } else setCommentError("O comentário não foi confirmado; seu texto foi preservado.");
    } finally {
      composing.current = false;
    }
  }
  return (
    <div className="grid min-w-0 gap-4">
      <Section
        title={e.titulo}
        description={estadoLabels[e.estado] + " · " + tipoLabels[e.tipo] + " · Versão " + e.version}
        actions={
          <ActionButton variant="ghost" onClick={onBack}>
            Voltar à agenda
          </ActionButton>
        }
      >
        <p className="break-words text-sm font-medium">{periodoEvento(e, "America/Sao_Paulo")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
            <span>Categoria</span>
            <select
              aria-label="Categoria do evento"
              className="min-h-11 max-w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              value={e.tipo}
              disabled={busy || !p.editar}
              onChange={(event) => {
                const tipo = event.target.value as typeof e.tipo;
                if (tipo !== e.tipo)
                  void onCommand({
                    comando: "salvar_evento",
                    dados: {
                      evento_id: e.id,
                      expected_version: e.version,
                      evento: eventForSave({ ...inputFromDetail(detail), tipo }, detail),
                    },
                  });
              }}
            >
              {Object.entries(tipoLabels).map(([value, label]) => (
                <option
                  key={value}
                  value={value}
                  disabled={!e.bloqueia_recursos && value !== "reuniao"}
                >
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Responsável</dt>
            <dd className="break-words">{e.responsavel_nome}</dd>
          </div>
          {e.local && (
            <div>
              <dt className="text-xs text-muted-foreground">Local</dt>
              <dd className="whitespace-pre-wrap break-words">{e.local}</dd>
            </div>
          )}
          {e.cliente_nome && (
            <div>
              <dt className="text-xs text-muted-foreground">Cliente e unidade</dt>
              <dd>
                {e.cliente_nome}
                {e.unidade_nome ? " · " + e.unidade_nome : ""}
              </dd>
            </div>
          )}
          {e.projeto_nome && e.projeto_nome !== e.cliente_nome && (
            <div>
              <dt className="text-xs text-muted-foreground">Projeto</dt>
              <dd>{e.projeto_nome}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Origem</dt>
            <dd className="break-words">
              {e.origem.tipo === "independente"
                ? "Evento independente"
                : e.origem.tipo === "acao"
                  ? "Ação: " + e.origem.titulo
                  : "Levantamento: " + e.origem.titulo}
            </dd>
          </div>
        </dl>
        {e.descricao && (
          <p className="mt-4 whitespace-pre-wrap break-words text-sm">{e.descricao}</p>
        )}
        {e.motivo && (
          <p className="mt-4 whitespace-pre-wrap rounded bg-muted/20 p-3 text-sm">
            Motivo: {e.motivo}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {p.editar && civilAvailable && (
            <ActionButton
              variant="ghost"
              onClick={() =>
                onEdit({
                  tipo: "evento",
                  base: detail,
                  day: e.data_inicio ?? "",
                })
              }
            >
              Editar compromisso
            </ActionButton>
          )}
          {p.publicar && (
            <ActionButton
              onClick={() => onEdit({ tipo: "comando", comando: "publicar", base: detail })}
            >
              Publicar
            </ActionButton>
          )}
          {p.iniciar && (
            <ActionButton
              onClick={() => onEdit({ tipo: "comando", comando: "iniciar", base: detail })}
            >
              Iniciar atividade
            </ActionButton>
          )}
          {p.concluir && (
            <ActionButton
              onClick={() => onEdit({ tipo: "comando", comando: "concluir", base: detail })}
            >
              Concluir evento
            </ActionButton>
          )}
          {p.abrir_origem && e.origem.tipo !== "independente" && (
            <ActionButton variant="ghost" onClick={onOpenSource}>
              Abrir origem
            </ActionButton>
          )}
          {p.cancelar && (
            <ActionButton
              variant="danger"
              onClick={() => onEdit({ tipo: "comando", comando: "cancelar", base: detail })}
            >
              Cancelar compromisso
            </ActionButton>
          )}
        </div>
        {detail.bloqueios.length > 0 && (
          <div role="status" className="mt-4 rounded-md border border-warning/50 p-3 text-sm">
            <h3 className="font-medium">Pendências para a atividade</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {detail.bloqueios.map((b, i) => (
                <li key={b.codigo + i}>{b.mensagem}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>
      {!civilAvailable && (
        <p role="status" className="rounded border border-warning/50 p-3 text-sm">
          O fuso {e.timezone} não é suportado neste navegador. Os instantes originais foram
          preservados. A edição civil do período e da recorrência fica indisponível; não foi
          aplicada uma conversão para outro fuso.
        </p>
      )}
      <Section
        title="Pessoas e confirmações"
        description="Confirmar participação não conclui o compromisso nem a atividade de origem."
      >
        <ul className="space-y-3">
          {detail.participantes.map((participant) => (
            <li key={participant.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{participant.pessoa_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {participant.funcao === "responsavel"
                      ? "Responsável"
                      : participant.funcao === "observador"
                        ? "Observador"
                        : "Participante"}{" "}
                    ·{" "}
                    {participant.confirmacao === "pendente"
                      ? "Confirmação pendente"
                      : participant.confirmacao === "confirmada"
                        ? "Participação confirmada"
                        : "Participação recusada"}
                    {!participant.vigente ? " · Participação encerrada" : ""}
                  </p>
                  {participant.ciencia_em && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ciência em {formatInstant(participant.ciencia_em, e.timezone)}
                    </p>
                  )}
                </div>
                {participant.pode_confirmar && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      variant="ghost"
                      disabled={busy || participant.confirmacao === "confirmada"}
                      onClick={() =>
                        onCommand({
                          comando: "confirmar",
                          dados: {
                            participante_id: participant.id,
                            expected_version: participant.version,
                            confirmacao: "confirmada",
                          },
                        })
                      }
                    >
                      Confirmar presença
                    </ActionButton>
                    <ActionButton
                      variant="ghost"
                      disabled={busy || participant.confirmacao === "recusada"}
                      onClick={() =>
                        onCommand({
                          comando: "confirmar",
                          dados: {
                            participante_id: participant.id,
                            expected_version: participant.version,
                            confirmacao: "recusada",
                          },
                        })
                      }
                    >
                      Recusar participação
                    </ActionButton>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>
      {(detail.competencias.length > 0 || detail.ferramentas.length > 0) && (
        <Section title="Requisitos e recursos">
          <div className="grid gap-4">
            {detail.competencias.length > 0 && (
              <div>
                <h3 className="text-sm font-medium">Competências exigidas</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {detail.competencias.map((c) => (
                    <li key={c.competencia_id}>
                      {c.nome}
                      <span className="block text-xs text-muted-foreground">
                        {c.exige_evidencia ? "Evidência exigida" : "Evidência conforme política"} ·{" "}
                        {c.exige_validade
                          ? "Validade exigida"
                          : "Sem exigência de validade nesta política"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detail.ferramentas.length > 0 && (
              <div>
                <h3 className="text-sm font-medium">Ferramentas</h3>
                <ul className="mt-2 space-y-2">
                  {detail.ferramentas.map((f) => (
                    <li key={f.id} className="rounded border border-border p-3 text-sm">
                      <p>
                        {f.patrimonio} · {f.descricao}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {f.pessoa_nome} ·{" "}
                        {f.estado === "retirada"
                          ? "Retirada, devolução física pendente"
                          : f.estado === "reservada"
                            ? "Reserva confirmada"
                            : f.estado === "devolvida"
                              ? "Devolvida"
                              : f.estado === "cancelada"
                                ? "Cancelada"
                                : "Planejada"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}
      <Section
        title="Repetição"
        description={
          detail.serie
            ? "Uma série mantém suas versões e exceções; ocorrências realizadas permanecem preservadas."
            : "Este compromisso não pertence a uma série."
        }
      >
        {detail.serie ? (
          <div className="grid gap-3">
            <p className="text-sm">
              Série V{detail.serie.numero} ·{" "}
              {detail.serie.estado === "ativa" ? "Ativa" : "Cancelada"} ·{" "}
              {detail.serie.regra.frequencia} a cada {detail.serie.regra.intervalo}
            </p>
            <p className="text-xs text-muted-foreground">
              Fuso {detail.serie.timezone}.{" "}
              {detail.serie.materializado_ate
                ? "Horizonte de geração tentado até " +
                  detail.serie.materializado_ate +
                  ". Confira as ocorrências pendentes abaixo."
                : "Horizonte aguardando processamento."}{" "}
              {detail.serie.pendencias} pendências de geração.
            </p>
            {e.excecao && <p className="text-sm">Esta visita possui uma exceção individual.</p>}
            <div className="flex flex-wrap gap-2">
              {detail.serie.permissoes.editar && civilAvailable && (
                <ActionButton
                  variant="ghost"
                  onClick={() =>
                    onEdit({
                      tipo: "comando",
                      comando: "editar_serie",
                      base: detail,
                    })
                  }
                >
                  Editar série futura
                </ActionButton>
              )}
              {detail.serie.permissoes.cancelar && (
                <ActionButton
                  variant="danger"
                  onClick={() =>
                    onEdit({
                      tipo: "comando",
                      comando: "cancelar_serie",
                      base: detail,
                    })
                  }
                >
                  Cancelar série futura
                </ActionButton>
              )}
              {detail.serie.permissoes.reprocessar && (
                <ActionButton
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    onCommand({
                      comando: "reprocessar_serie",
                      dados: {
                        serie_id: detail.serie!.id,
                        expected_version: detail.serie!.version,
                      },
                    })
                  }
                >
                  Reprocessar pendências
                </ActionButton>
              )}
            </div>
            {canRetryNotifications && (
              <AgendaSeriePending
                key={detail.serie.id}
                org={org}
                event={e.id}
                serie={detail.serie.id}
                timezone={detail.serie.timezone}
                onDenied={onDenied}
              />
            )}
          </div>
        ) : (
          p.editar_serie &&
          civilAvailable && (
            <ActionButton
              variant="ghost"
              onClick={() =>
                onEdit({
                  tipo: "comando",
                  comando: "criar_serie",
                  base: detail,
                })
              }
            >
              Repetir compromisso
            </ActionButton>
          )
        )}
      </Section>
      <Section
        title="Arquivos do compromisso"
        description="Instruções e evidências desta visita. Os arquivos da ação ou do levantamento continuam disponíveis na origem."
      >
        <RecordFiles pai={{ organization_id: org, agenda_evento_id: e.id }} />
      </Section>
      <Section title="Comentários e histórico">
        {canRetryNotifications && (
          <div className="mb-4">
            <ActionButton
              variant="ghost"
              disabled={busy}
              onClick={() =>
                onCommand({ comando: "reprocessar_notificacoes", dados: { evento_id: e.id } })
              }
            >
              Reprocessar notificações
            </ActionButton>
          </div>
        )}
        {p.comentar && (
          <div className="mb-4 grid gap-2">
            <label className="grid gap-1 text-sm">
              Novo comentário
              <textarea
                className={fieldClass + " min-h-24"}
                maxLength={4000}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
            {commentError && (
              <p role="alert" className="text-sm text-destructive">
                {commentError}
              </p>
            )}
            <ActionButton disabled={busy || !comment.trim()} onClick={sendComment}>
              Registrar comentário
            </ActionButton>
          </div>
        )}
        <AgendaHistory key={e.id} org={org} id={e.id} timezone={e.timezone} onDenied={onDenied} />
      </Section>
    </div>
  );
}
function AgendaHistory({
  org,
  id,
  timezone,
  onDenied,
}: {
  org: string;
  id: string;
  timezone: string;
  onDenied: (error: unknown) => void;
}) {
  const [tipo, setTipo] = useState<"revisoes" | "comentarios">("comentarios"),
    [page, setPage] = useState(0);
  const q = useAgendaHistory(org, id, tipo, page);
  useEffect(() => {
    if (acessoAgendaNegado(q.error)) onDenied(q.error);
  }, [q.error, onDenied]);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2" aria-label="Conteúdo do histórico">
        <ActionButton
          variant="ghost"
          aria-pressed={tipo === "comentarios"}
          onClick={() => {
            setTipo("comentarios");
            setPage(0);
          }}
        >
          Comentários
        </ActionButton>
        <ActionButton
          variant="ghost"
          aria-pressed={tipo === "revisoes"}
          onClick={() => {
            setTipo("revisoes");
            setPage(0);
          }}
        >
          Revisões do compromisso
        </ActionButton>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <LoadingState label="Consultando histórico autorizado…" />
      ) : (
        q.data && (
          <>
            {q.data.registros.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro neste recorte.</p>
            ) : q.data.tipo === "comentarios" ? (
              <ol className="space-y-3">
                {q.data.registros.map((c) => (
                  <li key={c.id} className="rounded border border-border p-3 text-sm">
                    <p className="whitespace-pre-wrap break-words">{c.texto}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {c.autor_nome} · {formatInstant(c.created_at, timezone)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <ol className="space-y-2">
                {q.data.registros.map((r) => (
                  <li key={r.versao} className="rounded border border-border p-3 text-sm">
                    Versão {r.versao} · {formatInstant(r.created_at, timezone)}
                  </li>
                ))}
              </ol>
            )}
            {q.data.total > q.data.limite && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {q.data.total} registros · Página {page + 1}
                </span>
                <div className="flex gap-2">
                  <ActionButton
                    variant="ghost"
                    disabled={!page}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    disabled={(page + 1) * q.data.limite >= q.data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </ActionButton>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
