import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { RecordFiles } from "@/features/operacao/RecordFiles";
import { listarAnexos } from "@/features/operacao/files.functions";
import { anexoPai } from "@/features/operacao/schemas";
import { useCommandKey } from "@/features/operacao/components";
import { useOrg } from "@/features/org/session";
import { petRetificar } from "./retificacoes.functions";
import { PetField } from "./PetEditor";
import { PetStatus } from "./ExecucaoWorkspace";
import {
  optionName,
  petDateInput,
  petInstant,
  petLabel,
  type PetDetalhe,
  type PetOpcoes,
} from "./ui-types";
import type { Json } from "./schemas";

type Retificacao = {
  id: string;
  evento_id: string;
  estado?: string;
  version?: number;
  momento_original?: string;
  momento_corrigido: string;
  motivo: string;
  evidencia_id?: string;
  created_at?: string;
  solicitado_por?: string;
  solicitado_em?: string;
  [key: string]: unknown;
};
type Decisao = {
  id: string;
  retificacao_id: string;
  decisao: string;
  responsavel_id: string;
  decidido_em?: string;
  motivo: string;
  created_at?: string;
  [key: string]: unknown;
};
type IntervaloEfetivo = {
  id?: string;
  pessoa_id: string;
  pessoa_nome?: string;
  entrada_em: string;
  saida_em?: string | null;
  entrada_efetiva_em?: string;
  saida_efetiva_em?: string | null;
  entrada_original_em?: string;
  saida_original_em?: string | null;
  segundos?: number;
  [key: string]: unknown;
};
type DetalheRetificavel = PetDetalhe & {
  retificacoes?: Retificacao[];
  retificacao_decisoes?: Decisao[];
  intervalos_efetivos?: IntervaloEfetivo[];
};
function dateTime(value: string | undefined, timezone: string) {
  if (!value) return "Não informado";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: timezone,
      }).format(d);
}
function inputSeconds(value: string, timezone: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const seconds = new Intl.DateTimeFormat("en-US", { timeZone: timezone, second: "2-digit" })
    .format(d)
    .padStart(2, "0");
  return `${petDateInput(value, timezone)}:${seconds}`;
}
function instantSeconds(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::[0-5]\d)?$/.test(value))
    throw new Error("Informe data e horário válidos, com segundos quando necessários.");
  return new Date(
    Date.parse(petInstant(value.slice(0, 16), timezone)) + Number(value.slice(17) || 0) * 1000,
  ).toISOString();
}

export function RetificacaoPet({ detail, options }: { detail: PetDetalhe; options: PetOpcoes }) {
  const session = useOrg();
  if (session.isPending) return <LoadingState label="Conferindo acesso às retificações…" />;
  if (session.isError || !session.data)
    return (
      <ErrorState error={session.error || new Error("Sessão indisponível para retificação.")} />
    );
  return (
    <RetificacaoContent
      key={`${session.data.orgId}:${session.data.userId}:${detail.pet.id}`}
      organizationId={session.data.orgId}
      userId={session.data.userId}
      detail={detail}
      options={options}
    />
  );
}
function RetificacaoContent({
  organizationId,
  userId,
  detail,
  options,
}: {
  organizationId: string;
  userId: string;
  detail: DetalheRetificavel;
  options: PetOpcoes;
}) {
  const execute = useServerFn(petRetificar),
    filesFn = useServerFn(listarAnexos),
    client = useQueryClient();
  const keyFor = useCommandKey(),
    lock = useRef(false),
    alive = useRef(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [evento, setEvento] = useState(""),
    [momento, setMomento] = useState(""),
    [motivo, setMotivo] = useState(""),
    [evidencia, setEvidencia] = useState("");
  const [retificacao, setRetificacao] = useState(""),
    [responsavel, setResponsavel] = useState(""),
    [decisao, setDecisao] = useState<"aprovar" | "recusar">("aprovar"),
    [motivoDecisao, setMotivoDecisao] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const pai = anexoPai.parse({ organization_id: organizationId, pet_id: detail.pet.id });
  const files = useQuery({
    queryKey: ["anexos", pai],
    queryFn: ({ signal }) => filesFn({ data: pai, signal }),
    retry: false,
    refetchOnWindowFocus: "always",
  });
  const intervalos = detail.intervalos as unknown as Array<{
    entrada_id: string;
    saida_id: string | null;
    saida_em: string | null;
  }>;
  const closedEvents = new Set(
    intervalos
      .filter((i) => i.saida_em)
      .flatMap((i) => [i.entrada_id, i.saida_id])
      .filter((id): id is string => !!id),
  );
  const events = detail.presencas.filter(
    (e) => ["entrada", "saida"].includes(e.tipo) && closedEvents.has(e.id),
  );
  const noOpen = !detail.intervalos.some((i) => !i.saida_em);
  const eligible =
    noOpen &&
    intervalos.some((i) => i.saida_em) &&
    detail.pet.estado_documental === "encerramento_pendente" &&
    detail.pet.condicao_operacional === "terminada";
  const requests = detail.retificacoes || [],
    decisions = detail.retificacao_decisoes || [];
  const pending = requests.filter((r) => !decisions.some((d) => d.retificacao_id === r.id));
  const selected = pending.find((r) => r.id === retificacao);
  const name = (id: string) =>
    detail.participantes.find((p) => p.pessoa_id === id)?.nome_snapshot ||
    optionName(options.pessoas.find((p) => p.id === id));
  const original = events.find((e) => e.id === evento);
  const confirmed = files.data?.registros.filter((a) => a.estado === "vinculado") || [];
  const effective = detail.intervalos as unknown as IntervaloEfetivo[];
  async function command(comando: "solicitar" | "decidir", dados: Record<string, Json>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = { comando, dados };
      await execute({
        data: { organization_id: organizationId, comando: { ...payload, chave: keyFor(payload) } },
      });
      if (!alive.current) return false;
      await client.invalidateQueries({ queryKey: ["pet", organizationId] });
      if (!alive.current) return false;
      setNotice(
        comando === "solicitar"
          ? "Solicitação registrada. O horário oficial só muda após a decisão técnica autorizada."
          : "Decisão confirmada no servidor. Os eventos originais e as decisões anteriores permanecem preservados.",
      );
      return true;
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível confirmar a retificação. O preenchimento foi preservado.",
        );
      return false;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function request() {
    try {
      const timestamp = instantSeconds(momento, detail.pet.timezone);
      if (
        await command("solicitar", {
          pet_id: detail.pet.id,
          expected_version: detail.pet.version,
          evento_id: evento,
          momento_corrigido: timestamp,
          motivo,
          evidencia_id: evidencia,
        })
      ) {
        setEvento("");
        setMomento("");
        setMotivo("");
        setEvidencia("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira o horário declarado.");
    }
  }
  return (
    <details className="nx-pet-panel">
      <summary className="min-h-11 cursor-pointer text-sm font-semibold">
        Retificação auditável de horários
      </summary>
      <p className="nx-pet-subtitle my-4">
        Solicite correção justificada de entrada ou saída de um intervalo já fechado. A decisão
        exige responsável técnico independente, identificado em sua própria sessão. O evento
        original e sua evidência permanecem preservados.
      </p>
      {!eligible && (
        <p className="nx-pet-notice" data-tone="attention">
          Para solicitar ou decidir uma retificação, todas as pessoas precisam estar fora, os
          intervalos fechados e a PET em encerramento pendente com término operacional registrado,
          antes do snapshot final. Não se retifica um evento de presença aberta por este fluxo.
        </p>
      )}
      <p className="nx-pet-hint my-4">
        O procedimento aprovado deve autorizar retificação. A validação de horário, evidência,
        independência do decisor, estado e versão é feita novamente no servidor; a seleção nesta
        tela não concede autorização.
      </p>
      {notice && (
        <p role="status" className="nx-pet-notice mb-4">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="nx-pet-notice mb-4" data-tone="danger">
          {error} O preenchimento continua disponível.
        </p>
      )}
      <form
        data-dirty={!!evento || !!motivo}
        aria-busy={busy}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void request();
        }}
      >
        <h3>Solicitar correção</h3>
        <div className="nx-pet-grid">
          <PetField label="Evento de intervalo fechado">
            <select
              required
              disabled={!eligible || busy}
              value={evento}
              onChange={(e) => {
                setEvento(e.target.value);
                const row = events.find((p) => p.id === e.target.value);
                setMomento(
                  row
                    ? inputSeconds(row.momento_declarado || row.momento, detail.pet.timezone)
                    : "",
                );
              }}
            >
              <option value="">Selecione a pessoa e o evento original</option>
              {events.map((e) => (
                <option value={e.id} key={e.id}>
                  {name(e.pessoa_id)} · {petLabel(e.tipo)} ·{" "}
                  {dateTime(e.momento_declarado || e.momento, detail.pet.timezone)}
                </option>
              ))}
            </select>
          </PetField>
          <PetField
            label="Horário corrigido proposto"
            hint={`Fuso da PET: ${detail.pet.timezone}. O horário original não será sobrescrito.`}
          >
            <input
              required
              type="datetime-local"
              step="1"
              disabled={!eligible || busy}
              value={momento}
              onChange={(e) => setMomento(e.target.value)}
            />
          </PetField>
          <PetField wide label="Motivo e fundamento da correção">
            <textarea
              required
              minLength={10}
              maxLength={4000}
              disabled={!eligible || busy}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </PetField>
          <PetField
            wide
            label="Evidência confirmada vinculada à PET"
            hint="Envio pendente não atende a este requisito. Selecione o arquivo já verificado pelo pipeline privado."
          >
            <select
              required
              disabled={!eligible || busy || files.isPending || files.isError}
              value={evidencia}
              onChange={(e) => setEvidencia(e.target.value)}
            >
              <option value="">Selecione a evidência confirmada</option>
              {confirmed.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.nome} · {a.pet_item || "Contexto da PET"} · SHA-256 {a.sha256.slice(0, 12)}…
                </option>
              ))}
            </select>
          </PetField>
        </div>
        {original && (
          <p className="nx-pet-notice">
            Original: {name(original.pessoa_id)} · {petLabel(original.tipo)} ·{" "}
            {dateTime(original.momento_declarado || original.momento, detail.pet.timezone)}.
            Recebido no servidor: {dateTime(original.recebido_em, detail.pet.timezone)}.
          </p>
        )}
        {files.isError && <ErrorState error={files.error} onRetry={() => files.refetch()} />}
        <details className="nx-pet-accordion">
          <summary>Consultar ou anexar evidências da retificação</summary>
          <div>
            <RecordFiles
              pai={{
                organization_id: organizationId,
                pet_id: detail.pet.id,
                pet_item: "retificacao",
              }}
              readOnly={!eligible}
            />
          </div>
        </details>
        <ActionButton type="submit" loading={busy} disabled={!eligible || !evento || !evidencia}>
          Registrar solicitação no servidor
        </ActionButton>
      </form>
      <section className="mt-7 border-t border-border pt-5">
        <h3>Decisão técnica independente</h3>
        <p className="nx-pet-subtitle mb-4">
          O solicitante não aprova a própria correção. A decisão utiliza o procedimento vigente e
          conserva o antes/depois para revisão.
        </p>
        <form
          className="space-y-4"
          data-dirty={!!retificacao || !!motivoDecisao}
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            if (selected)
              void command("decidir", {
                retificacao_id: selected.id,
                expected_version: detail.pet.version,
                responsavel_id: responsavel,
                decisao,
                motivo: motivoDecisao,
              });
          }}
        >
          <div className="nx-pet-grid">
            <PetField label="Solicitação pendente">
              <select
                required
                disabled={!eligible || busy}
                value={retificacao}
                onChange={(e) => setRetificacao(e.target.value)}
              >
                <option value="">Selecione a solicitação a analisar</option>
                {pending.map((r) => (
                  <option value={r.id} key={r.id}>
                    {dateTime(r.solicitado_em || r.created_at, detail.pet.timezone)} ·{" "}
                    {r.motivo.slice(0, 80)}
                  </option>
                ))}
              </select>
            </PetField>
            <PetField label="Sua identificação como responsável técnico">
              <select
                required
                disabled={!eligible || busy}
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
              >
                <option value="">Selecione sua pessoa operacional</option>
                {options.pessoas.map((p) => (
                  <option value={p.id} key={p.id}>
                    {optionName(p)}
                  </option>
                ))}
              </select>
            </PetField>
            <PetField label="Decisão">
              <select
                disabled={!eligible || busy}
                value={decisao}
                onChange={(e) => setDecisao(e.target.value as "aprovar" | "recusar")}
              >
                <option value="aprovar">Aprovar correção proposta</option>
                <option value="recusar">Recusar correção proposta</option>
              </select>
            </PetField>
            <PetField wide label="Fundamentação da decisão">
              <textarea
                required
                minLength={10}
                maxLength={4000}
                disabled={!eligible || busy}
                value={motivoDecisao}
                onChange={(e) => setMotivoDecisao(e.target.value)}
              />
            </PetField>
          </div>
          {selected && (
            <p className="nx-pet-notice">
              Correção proposta: {dateTime(selected.momento_original, detail.pet.timezone)} →{" "}
              {dateTime(selected.momento_corrigido, detail.pet.timezone)}. Motivo: {selected.motivo}
            </p>
          )}
          <ActionButton
            type="submit"
            loading={busy}
            disabled={!eligible || !selected || !responsavel}
          >
            Confirmar decisão técnica no servidor
          </ActionButton>
        </form>
      </section>
      <section className="mt-7 border-t border-border pt-5">
        <h3>Intervalos efetivos e registros originais</h3>
        <p className="nx-pet-subtitle mb-4">
          Os tempos oficiais usam somente decisões aprovadas. Recusas e solicitações pendentes não
          alteram a projeção. O servidor revalida a ordem dos eventos e a ausência de sobreposição.
        </p>
        <div className="nx-pet-table-scroll">
          <table className="nx-pet-table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Entrada original</th>
                <th>Entrada efetiva</th>
                <th>Saída original</th>
                <th>Saída efetiva</th>
              </tr>
            </thead>
            <tbody>
              {effective
                .filter((i) => i.saida_em)
                .map((i, index) => (
                  <tr key={i.id || `${i.pessoa_id}:${index}`}>
                    <td>{i.pessoa_nome || name(i.pessoa_id)}</td>
                    <td>{dateTime(i.entrada_original_em || i.entrada_em, detail.pet.timezone)}</td>
                    <td>{dateTime(i.entrada_em, detail.pet.timezone)}</td>
                    <td>
                      {dateTime(
                        i.saida_original_em || i.saida_em || undefined,
                        detail.pet.timezone,
                      )}
                    </td>
                    <td>{dateTime(i.saida_em || undefined, detail.pet.timezone)}</td>
                  </tr>
                ))}
              {!effective.some((i) => i.saida_em) && (
                <tr>
                  <td colSpan={5}>Nenhum intervalo fechado disponível.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-7 border-t border-border pt-5">
        <h3>Solicitações e decisões preservadas</h3>
        <div className="nx-pet-list mt-4">
          {requests.length ? (
            requests.map((r) => {
              const decision = decisions.find((d) => d.retificacao_id === r.id);
              return (
                <article key={r.id} className="nx-pet-card">
                  <div className="nx-pet-card-top">
                    <p className="nx-pet-card-code">{r.id}</p>
                    <PetStatus
                      value={
                        decision
                          ? decision.decisao === "aprovada"
                            ? "Correção aprovada"
                            : "Correção recusada"
                          : "Análise técnica pendente"
                      }
                    />
                  </div>
                  <p className="text-sm">
                    {dateTime(r.momento_original, detail.pet.timezone)} →{" "}
                    {dateTime(r.momento_corrigido, detail.pet.timezone)}
                  </p>
                  <p className="nx-pet-subtitle">Solicitação: {r.motivo}</p>
                  {r.evidencia_id && (
                    <p className="nx-pet-hint mt-2">
                      Evidência:{" "}
                      {confirmed.find((a) => a.id === r.evidencia_id)?.nome || r.evidencia_id}
                    </p>
                  )}
                  {decision && (
                    <p className="nx-pet-subtitle">
                      Decisão: {decision.motivo} · {name(decision.responsavel_id)} ·{" "}
                      {dateTime(decision.decidido_em || decision.created_at, detail.pet.timezone)}
                    </p>
                  )}
                </article>
              );
            })
          ) : (
            <p className="nx-pet-hint">Nenhuma retificação solicitada.</p>
          )}
        </div>
      </section>
    </details>
  );
}
