import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, Plus, RotateCcw, Save, Send, ShieldCheck } from "lucide-react";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import { NrCard } from "@/features/nr/NrCards";
import { InspecoesEnsaios } from "./InspecoesCampo";
import { InspecoesAnexar } from "./InspecoesAnexar";
import { Badge, Fatos, dataCivil, legenda } from "./apresentacao";
import { inspecoesExecutar, inspecoesLevantamentos } from "./inspecoes.functions";
import {
  pareceresLevantamento,
  respostasLevantamento,
  tiposLevantamento,
  type InspecoesAtribuicao,
  type InspecoesComando,
  type InspecoesConteudoLevantamento,
  type InspecoesEscopo,
  type InspecoesLevantamento,
  type InspecoesLevantamentos,
  type InspecoesRegistro,
} from "./ui-contract";

type Props = {
  ativo: InspecoesRegistro;
  escopo: InspecoesEscopo;
  queryKey: readonly string[];
  atribuicao?: InspecoesAtribuicao | undefined;
  visualizacaoTst?: boolean | undefined;
  userId: string;
};
type Intent = InspecoesComando extends infer C
  ? C extends { chave: string }
    ? Omit<C, "chave" | "atribuicaoId">
    : never
  : never;
type Executar = (intent: Intent) => Promise<InspecoesLevantamento>;

export function InspecoesLevantamentoPanel({
  ativo,
  escopo,
  queryKey,
  atribuicao,
  userId,
  visualizacaoTst,
}: Props) {
  const fetch = useServerFn(inspecoesLevantamentos);
  const execute = useServerFn(inspecoesExecutar);
  const client = useQueryClient();
  const key = [...queryKey, "levantamentos", ativo.id];
  const query = useQuery<InspecoesLevantamentos>({
    queryKey: key,
    queryFn: ({ signal }) =>
      fetch({
        data: { organizationId: escopo.organizationId, ativoId: ativo.id, visualizacaoTst },
        signal,
      }),
    retry: false,
  });
  const [showCreate, setShowCreate] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [tipo, setTipo] = useState<(typeof tiposLevantamento)[number]>("T1");
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState("");
  const request = useRef<{ fingerprint: string; chave: string } | null>(null);
  const canAct =
    !!atribuicao &&
    (!atribuicao.cliente_id || atribuicao.cliente_id === ativo.cliente_id) &&
    (!atribuicao.unidade_id || atribuicao.unidade_id === ativo.unidade_id);
  const isEst = canAct && atribuicao?.perfil === "EST";
  const mutation = useMutation({
    mutationFn: (data: InspecoesComando) =>
      execute({ data: { organizationId: escopo.organizationId, ...data } }),
    onSuccess: (row) => {
      request.current = null;
      client.setQueryData<InspecoesLevantamentos>(key, (before) => ({
        candidatos: before?.candidatos ?? [],
        items: before?.items.some(({ id }) => id === row.id)
          ? before.items.map((item) => (item.id === row.id ? row : item))
          : [row, ...(before?.items ?? [])],
      }));
      void client.invalidateQueries({ queryKey: key });
      if (row.estado === "emitido")
        void client.invalidateQueries({ queryKey: [...queryKey, "painel"] });
    },
  });

  const executar: Executar = async (intent) => {
    const fingerprint = JSON.stringify({ atribuicao: atribuicao?.id, intent });
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, chave: crypto.randomUUID() };
    setStatus("");
    const row = await mutation.mutateAsync({
      ...intent,
      chave: request.current.chave,
      atribuicaoId: atribuicao?.id,
    });
    const messages = {
      criar: "Levantamento criado.",
      salvar: "Rascunho salvo.",
      submeter: "Levantamento submetido ao EST.",
      devolver: "Levantamento devolvido para correção.",
      aprovar: "Levantamento aprovado.",
      emitir: "Revisão emitida.",
    };
    setStatus(messages[intent.comando]);
    return row;
  };

  async function criar(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await executar({
        comando: "criar",
        dados: { ativo_id: ativo.id, tipo, atribuido_a: assignee || undefined },
      });
      setShowCreate(false);
      setSelection(result.id);
    } catch {
      /* Estado de falha exibido abaixo. */
    }
  }

  const selected = query.data?.items.find(({ id }) => id === selection);
  const candidates = Array.from(
    new Map(query.data?.candidatos?.map((item) => [item.user_id, item])).values(),
  );
  return (
    <section className="insp-stack" aria-labelledby="insp-work-title">
      <div className="insp-work-head">
        <div>
          <h3 className="insp-subheading" id="insp-work-title">
            Levantamentos
          </h3>
          <p className="nr-muted">Coleta, revisão do EST e emissão vinculadas a este ativo.</p>
        </div>
        {isEst && (
          <ActionButton
            variant="ghost"
            onClick={() => {
              mutation.reset();
              setShowCreate((open) => !open);
            }}
          >
            <Plus size={17} aria-hidden="true" />
            {showCreate ? "Fechar cadastro" : "Novo levantamento"}
          </ActionButton>
        )}
      </div>
      {showCreate && isEst && (
        <form className="insp-work-form" onSubmit={(event) => void criar(event)}>
          <label className="insp-field">
            Tipo da inspeção
            <select value={tipo} onChange={(event) => setTipo(event.target.value as typeof tipo)}>
              {tiposLevantamento.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="insp-field">
            Atribuir a
            <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              <option value="">Sem atribuição inicial</option>
              {candidates.map(({ user_id, nome }) => (
                <option key={user_id} value={user_id}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
          <ActionButton type="submit" loading={mutation.isPending}>
            Criar levantamento
          </ActionButton>
        </form>
      )}
      {status && (
        <p className="insp-feedback" role="status">
          {status}
        </p>
      )}
      {mutation.isError && <ErrorState error={mutation.error} />}
      {query.isPending ? (
        <LoadingState label="Carregando levantamentos…" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length ? (
        <ul className="insp-related-list">
          {query.data.items.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                aria-expanded={row.id === selection}
                onClick={() => {
                  setSelection((current) => (current === row.id ? null : row.id));
                  mutation.reset();
                }}
              >
                <span>
                  <small>
                    {row.tipo} · versão {row.version}
                  </small>
                  <strong>{row.conteudo.codigo_documento || `Levantamento ${row.tipo}`}</strong>
                  <small>{dataCivil(row.data_inspecao)}</small>
                </span>
                <Badge value={row.estado} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Nenhum levantamento disponível"
          hint={
            isEst
              ? "Inicie um levantamento para este ativo."
              : "O EST atribui os levantamentos de campo."
          }
        />
      )}
      {selected && (
        <LevantamentoEditor
          key={selected.id}
          row={selected}
          isEst={isEst}
          canAct={canAct}
          atribuicao={atribuicao}
          userId={userId}
          executar={executar}
          escopo={escopo}
          queryKey={queryKey}
          tag={ativo.codigo || ativo.titulo}
          saving={mutation.isPending}
          atualizar={() => void query.refetch()}
        />
      )}
    </section>
  );
}

const fields = [
  { key: "data_inspecao", label: "Data da inspeção", type: "date" },
  { key: "protocolo", label: "Protocolo aplicado", max: 160 },
  { key: "codigo_documento", label: "Código do laudo", max: 160 },
  { key: "revisao_documento", label: "Revisão do laudo", max: 60 },
  { key: "art", label: "Número da ART", max: 120 },
  { key: "art_inicio", label: "Início da ART", type: "date" },
  { key: "prazo_restricao", label: "Prazo de restrição", type: "date" },
] as const;

function LevantamentoEditor({
  row,
  isEst,
  canAct,
  atribuicao,
  userId,
  executar,
  saving,
  atualizar,
  escopo,
  queryKey,
  tag,
}: {
  row: InspecoesLevantamento;
  isEst: boolean;
  canAct: boolean;
  atribuicao?: InspecoesAtribuicao | undefined;
  userId: string;
  executar: Executar;
  saving: boolean;
  atualizar: () => void;
  escopo: InspecoesEscopo;
  queryKey: readonly string[];
  tag: string;
}) {
  const [values, setValues] = useState<InspecoesConteudoLevantamento>(row.conteudo);
  const [version, setVersion] = useState(row.version);
  const [dirty, setDirty] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [parecer, setParecer] = useState<(typeof pareceresLevantamento)[number]>("apto");
  const edit =
    canAct &&
    row.estado === "rascunho" &&
    (isEst || row.created_by === userId || row.atribuido_a === userId);
  const stale = row.version !== version && dirty;
  useEffect(() => {
    if (!dirty) {
      setValues(row.conteudo);
      setVersion(row.version);
    }
  }, [dirty, row.conteudo, row.version]);
  function change(update: Partial<InspecoesConteudoLevantamento>) {
    setValues((current) => ({ ...current, ...update }));
    setDirty(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const next = await executar({
        comando: "salvar",
        id: row.id,
        expected_version: version,
        dados: values,
      });
      setValues(next.conteudo);
      setVersion(next.version);
      setDirty(false);
    } catch {
      atualizar();
    }
  }
  async function action(comando: "submeter" | "devolver" | "aprovar" | "emitir") {
    const base = { id: row.id, expected_version: row.version };
    try {
      if (comando === "devolver") await executar({ ...base, comando, dados: { motivo } });
      else if (comando === "aprovar")
        await executar({ ...base, comando, dados: { motivo, parecer } });
      else await executar({ ...base, comando, dados: {} });
      setMotivo("");
    } catch {
      atualizar();
    }
  }
  return (
    <NrCard className="insp-record insp-editor">
      <div className="insp-asset-title">
        <ClipboardCheck size={20} aria-hidden="true" />
        <h4>Ficha de levantamento {row.tipo}</h4>
      </div>
      <Fatos
        items={[
          ["Estado do levantamento", <Badge value={row.estado} />],
          ["Versão", row.version],
          [
            "Resultado calculado · prévia",
            row.resultado_calculado ? legenda(row.resultado_calculado) : "",
          ],
          ["Justificativa do cálculo", row.calculo_justificativa],
          [
            "Parecer EST",
            row.parecer_est ? <Badge value={row.parecer_est} kind="tecnico" /> : "Pendente",
          ],
          ["Justificativa do EST", row.justificativa_est],
          ["Motivo da devolução", row.devolucao],
          ["Prazo de restrição", dataCivil(row.prazo_restricao)],
          ["Validade técnica", dataCivil(row.validade_tecnica)],
        ]}
      />
      {row.alertas?.map((alert) => (
        <p key={alert} className="insp-feedback">
          {alert}
        </p>
      ))}
      {stale && (
        <div className="insp-feedback" role="alert">
          <p>
            Outra pessoa salvou a versão {row.version}. Compare a versão atual com seu preenchimento
            antes de conciliar.
          </p>
          <details>
            <summary>Consultar a versão atual</summary>
            <Fatos items={fields.map(({ key, label }) => [label, row.conteudo[key]])} />
            <p>{row.conteudo.observacoes}</p>
            <ul>
              {row.checklist.map(({ id, item }) => (
                <li key={id}>
                  {item} · {row.conteudo.respostas?.[id] || "Sem resposta"}
                </li>
              ))}
            </ul>
          </details>
          <ActionButton variant="ghost" onClick={() => setVersion(row.version)}>
            Usar meu preenchimento na versão atual
          </ActionButton>
        </div>
      )}
      <form className="insp-stack" onSubmit={(event) => void save(event)}>
        <fieldset className="insp-work-grid" disabled={!edit || saving}>
          <legend>Informações da visita</legend>
          {fields.map((field) => (
            <label key={field.key} className="insp-field">
              {field.label}
              <input
                type={"type" in field ? field.type : "text"}
                maxLength={"max" in field ? field.max : undefined}
                value={values[field.key] ?? ""}
                onChange={(event) => change({ [field.key]: event.target.value || undefined })}
              />
            </label>
          ))}
        </fieldset>
        <fieldset className="insp-stack" disabled={!edit || saving}>
          <legend>Checklist desta revisão</legend>
          <p className="nr-muted">
            C · Conforme · CR · Conforme com restrição · NC · Não conforme · NA · Não aplicável
          </p>
          {row.checklist.length ? (
            <ul className="insp-checklist">
              {row.checklist.map(({ id, item, critico }) => (
                <li key={id}>
                  <label className="insp-field">
                    <span>
                      {item}
                      {critico && <strong className="insp-critical"> · Crítico</strong>}
                    </span>
                    <select
                      value={values.respostas?.[id] ?? ""}
                      onChange={(event) => {
                        const selected = event.target.value as
                          (typeof respostasLevantamento)[number] | "";
                        const next = { ...values.respostas };
                        if (selected) next[id] = selected;
                        else delete next[id];
                        change({ respostas: next });
                      }}
                    >
                      <option value="">Sem resposta</option>
                      {respostasLevantamento.map((answer) => (
                        <option key={answer}>{answer}</option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhum item de checklist aplicável nesta revisão" />
          )}
          <label className="insp-field">
            Observações e ações da visita
            <textarea
              rows={3}
              maxLength={8000}
              value={values.observacoes ?? ""}
              onChange={(event) => change({ observacoes: event.target.value })}
            />
          </label>
          <label className="insp-field">
            Limitação impeditiva
            <textarea
              rows={2}
              maxLength={4000}
              value={values.limitacao_impeditiva ?? ""}
              onChange={(event) => change({ limitacao_impeditiva: event.target.value })}
            />
          </label>
        </fieldset>
        {edit && (
          <div className="insp-actions">
            <ActionButton type="submit" loading={saving} disabled={!dirty || stale}>
              <Save size={16} aria-hidden="true" />
              Salvar rascunho
            </ActionButton>
            <ActionButton
              variant="ghost"
              disabled={
                saving || dirty || !row.data_inspecao || row.resultado_calculado === "incompleto"
              }
              onClick={() => void action("submeter")}
            >
              <Send size={16} aria-hidden="true" />
              Submeter ao EST
            </ActionButton>
            {(dirty || !row.data_inspecao || row.resultado_calculado === "incompleto") && (
              <span className="nr-muted">
                Salve a data e o checklist concluído ou a limitação impeditiva para submeter.
              </span>
            )}
          </div>
        )}
      </form>
      <InspecoesEnsaios
        escopo={escopo}
        queryKey={queryKey}
        row={row}
        tag={tag}
        atribuicao={atribuicao}
        userId={userId}
        canEdit={edit}
      />
      <InspecoesAnexar
        escopo={escopo}
        queryKey={queryKey}
        levantamentoId={row.id}
        tag={tag}
        edit={edit}
        aprovado={row.estado === "aprovado" && isEst}
        atualizar={atualizar}
      />
      {row.estado === "em_revisao" && (
        <section className="insp-stack" aria-label="Revisão técnica">
          {row.bloqueios && row.bloqueios.length > 0 && (
            <div className="insp-feedback" role="status">
              <h5>Requisitos pendentes para aprovação</h5>
              <ul>
                {row.bloqueios.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {isEst && (
            <>
              <label className="insp-field">
                Parecer técnico
                <select
                  value={parecer}
                  onChange={(event) => setParecer(event.target.value as typeof parecer)}
                >
                  {pareceresLevantamento.map((item) => (
                    <option key={item} value={item}>
                      {legenda(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="insp-field">
                Justificativa da decisão
                <textarea
                  rows={3}
                  value={motivo}
                  maxLength={4000}
                  onChange={(event) => setMotivo(event.target.value)}
                />
              </label>
              <div className="insp-actions">
                <ActionButton
                  variant="ghost"
                  disabled={saving || motivo.trim().length < 5}
                  onClick={() => void action("devolver")}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  Devolver para correção
                </ActionButton>
                <ActionButton
                  disabled={
                    saving ||
                    motivo.trim().length < 5 ||
                    row.bloqueios === undefined ||
                    row.bloqueios.length > 0
                  }
                  onClick={() => void action("aprovar")}
                >
                  <ShieldCheck size={16} aria-hidden="true" />
                  Aprovar
                </ActionButton>
              </div>
            </>
          )}
        </section>
      )}
      {row.estado === "aprovado" && isEst && (
        <>
          {row.bloqueios && row.bloqueios.length > 0 && (
            <div className="insp-feedback" role="status">
              <h5>Requisitos pendentes para emissão</h5>
              <ul>
                {row.bloqueios.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="insp-actions">
            <ActionButton
              disabled={saving || row.bloqueios === undefined || row.bloqueios.length > 0}
              onClick={() => void action("emitir")}
            >
              Emitir revisão
            </ActionButton>
          </div>
        </>
      )}
    </NrCard>
  );
}
