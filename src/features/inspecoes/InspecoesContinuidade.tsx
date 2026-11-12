import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import { NrCard } from "@/features/nr/NrCards";
import { Badge, dataCivil, Fatos, legenda } from "./apresentacao";
import {
  inspecoesContinuidadeCiclos,
  inspecoesContinuidadeContratos,
  inspecoesContinuidadeExecutar,
  inspecoesContinuidadeOpcoes,
  type ContinuidadeCiclo,
  type ContinuidadeComando,
  type ContinuidadeContrato,
  type ContinuidadeEscopo,
  type ContinuidadeOS,
  type ContinuidadeSegmento,
} from "./continuidade.functions";
import type { InspecoesEscopo } from "./ui-contract";

type Props = {
  scope: InspecoesEscopo;
  queryKey: readonly string[];
  canManage: boolean;
  compact?: boolean;
};
type ContextProps = Omit<Props, "scope"> & { scope: ContinuidadeEscopo };
type Submit = (command: ContinuidadeComando, success: string, done?: () => void) => void;
type Choice = { id: string; label: string };
const recorteLabel: Record<ContinuidadeSegmento, string> = {
  CC: "Obra e pavimento",
  "AG-A": "Ciclo de atendimento da unidade",
  "AG-B": "Ciclo de atendimento da unidade",
  IN: "Grupo de equipamentos",
};

function value(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function Choices({
  label,
  name,
  options,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  options: Choice[];
  defaultValue?: string | undefined;
  required?: boolean;
}) {
  const [selection, setSelection] = useState<Choice | undefined>(() =>
    options.find(({ id }) => id === defaultValue),
  );
  const visible =
    selection && !options.some(({ id }) => id === selection.id) ? [selection, ...options] : options;
  return (
    <label className="insp-field">
      {label}
      <select
        name={name}
        value={selection?.id ?? ""}
        onChange={(event) => setSelection(visible.find(({ id }) => id === event.target.value))}
        required={required}
      >
        <option value="">Selecione</option>
        {visible.map(({ id, label: option }) => (
          <option key={id} value={id}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required = false,
  minLength,
  maxLength = 200,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  type?: "text" | "date";
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <label className="insp-field">
      {label}
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
      />
    </label>
  );
}

function Pager({
  page,
  total,
  limit,
  onChange,
  label,
}: {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages < 2) return null;
  return (
    <nav className="insp-pagination" aria-label={label}>
      <ActionButton variant="ghost" disabled={page === 0} onClick={() => onChange(page - 1)}>
        Anterior
      </ActionButton>
      <span>
        {page + 1} de {pages}
      </span>
      <ActionButton variant="ghost" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>
        Próxima
      </ActionButton>
    </nav>
  );
}

function orderChoices(orders: ContinuidadeOS[]): Choice[] {
  return orders.map(({ id, numero, titulo }) => ({ id, label: "OS " + numero + " · " + titulo }));
}

function ContractForm({
  contract,
  busy,
  submit,
  proposals,
  packages,
  close,
}: {
  contract?: ContinuidadeContrato | undefined;
  busy: boolean;
  submit: Submit;
  proposals: Choice[];
  packages: Choice[];
  close: () => void;
}) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = {
      titulo: value(data, "titulo"),
      referencia: value(data, "referencia") || undefined,
      proposta_id: value(data, "proposta") || undefined,
      pacote_id: value(data, "pacote") || undefined,
      inicio: value(data, "inicio") || undefined,
      fim: value(data, "fim") || undefined,
    };
    submit(
      contract
        ? {
            acao: "editar_contrato",
            contrato_id: contract.id,
            version: contract.version,
            ...fields,
          }
        : { acao: "criar_contrato", ...fields },
      "Contrato salvo.",
      close,
    );
  }
  return (
    <NrCard className="insp-record">
      <form className="insp-stack" onSubmit={onSubmit}>
        <h4>{contract ? "Editar contrato" : "Novo contrato"}</h4>
        <div className="insp-grid">
          <Field
            name="titulo"
            label="Título do contrato"
            defaultValue={contract?.titulo ?? null}
            minLength={3}
            required
          />
          <Field
            name="referencia"
            label="Referência documental do contrato"
            defaultValue={contract?.referencia ?? null}
            minLength={3}
          />
          <Field
            name="inicio"
            label="Início da vigência"
            type="date"
            defaultValue={contract?.inicio ?? null}
          />
          <Field
            name="fim"
            label="Fim da vigência"
            type="date"
            defaultValue={contract?.fim ?? null}
          />
          <Choices
            name="proposta"
            label="Proposta da Nexus"
            options={proposals}
            defaultValue={contract?.proposta?.id}
          />
          <Choices
            name="pacote"
            label="Pacote de serviço"
            options={packages}
            defaultValue={contract?.pacote?.id}
          />
        </div>
        <div className="insp-work-head">
          <ActionButton type="submit" disabled={busy}>
            Salvar contrato
          </ActionButton>
          <ActionButton type="button" variant="ghost" onClick={close}>
            Fechar formulário
          </ActionButton>
        </div>
      </form>
    </NrCard>
  );
}

function CycleForm({
  contract,
  busy,
  orders,
  submit,
  close,
}: {
  contract: ContinuidadeContrato;
  busy: boolean;
  orders: Choice[];
  submit: Submit;
  close: () => void;
}) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit(
      {
        acao: "planejar_ciclo",
        contrato_id: contract.id,
        version: contract.version,
        titulo: value(data, "titulo"),
        recorte: value(data, "recorte"),
        janela_inicio: value(data, "janela_inicio") || undefined,
        janela_fim: value(data, "janela_fim") || undefined,
        detalhes: value(data, "detalhes") || undefined,
        os_id: value(data, "ordem") || undefined,
      },
      "Ciclo planejado.",
      close,
    );
  }
  return (
    <NrCard className="insp-record">
      <form className="insp-stack" onSubmit={onSubmit}>
        <h4>Planejar ciclo</h4>
        <div className="insp-grid">
          <Field name="titulo" label="Título do ciclo" minLength={3} required />
          <Field name="recorte" label={recorteLabel[contract.segmento]} minLength={2} required />
          <Field name="janela_inicio" label="Início da janela" type="date" />
          <Field name="janela_fim" label="Fim da janela" type="date" />
          <Choices name="ordem" label="Ordem de serviço da Nexus" options={orders} />
          <label className="insp-field">
            Detalhes do atendimento
            <textarea name="detalhes" rows={2} maxLength={2000} />
          </label>
        </div>
        <div className="insp-work-head">
          <ActionButton type="submit" disabled={busy}>
            Salvar ciclo
          </ActionButton>
          <ActionButton type="button" variant="ghost" onClick={close}>
            Fechar formulário
          </ActionButton>
        </div>
      </form>
    </NrCard>
  );
}

function CycleCard({
  cycle,
  contract,
  canManage,
  busy,
  orders,
  submit,
}: {
  cycle: ContinuidadeCiclo;
  contract: ContinuidadeContrato;
  canManage: boolean;
  busy: boolean;
  orders: Choice[];
  submit: Submit;
}) {
  function bind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(
      {
        acao: "vincular_os",
        contrato_id: contract.id,
        version: contract.version,
        ciclo_id: cycle.id,
        ciclo_version: cycle.version,
        os_id: value(new FormData(event.currentTarget), "ordem"),
      },
      "Ordem de serviço vinculada.",
    );
  }
  return (
    <NrCard className="insp-record">
      <h4>{cycle.titulo}</h4>
      <Fatos
        items={[
          [recorteLabel[contract.segmento], cycle.recorte],
          ["Início da janela", dataCivil(cycle.janela_inicio)],
          ["Fim da janela", dataCivil(cycle.janela_fim)],
          [
            "Ordem de serviço",
            cycle.ordem
              ? "OS " +
                cycle.ordem.numero +
                " · " +
                cycle.ordem.titulo +
                " · " +
                legenda(cycle.ordem.estado)
              : cycle.tem_ordem
                ? "Vinculada · consulta restrita na Nexus"
                : "Aguardando vínculo",
          ],
        ]}
      />
      {cycle.detalhes && <p>{cycle.detalhes}</p>}
      {canManage && !cycle.tem_ordem && contract.estado !== "cancelado" && (
        <form className="insp-stack" onSubmit={bind}>
          <Choices
            name="ordem"
            label={"Ordem de serviço para " + cycle.titulo}
            options={orders}
            required
          />
          <ActionButton type="submit" disabled={busy || !orders.length}>
            Vincular OS
          </ActionButton>
        </form>
      )}
    </NrCard>
  );
}

function ScopedContinuity({ scope, queryKey, canManage, compact }: ContextProps) {
  const titleId = useId();
  const cache = useQueryClient();
  const fetchContracts = useServerFn(inspecoesContinuidadeContratos);
  const fetchCycles = useServerFn(inspecoesContinuidadeCiclos);
  const fetchOptions = useServerFn(inspecoesContinuidadeOpcoes);
  const exec = useServerFn(inspecoesContinuidadeExecutar);
  const [page, setPage] = useState(0);
  const [cyclePage, setCyclePage] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [mode, setMode] = useState<"new" | "edit" | "cancel" | "cycle">();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const attempted = useRef<{ signature: string; chave: string } | null>(null);
  const key = [...queryKey, "continuidade", scope.organizationId, scope.clienteId, scope.unidadeId];
  const contracts = useQuery({
    queryKey: [...key, "contratos", page],
    queryFn: ({ signal }) => fetchContracts({ data: { ...scope, pagina: page }, signal }),
    retry: false,
  });
  const current = contracts.data?.contratos.find(({ id }) => id === selected);
  const cycles = useQuery({
    queryKey: [...key, "ciclos", current?.id, cyclePage],
    queryFn: ({ signal }) =>
      fetchCycles({ data: { ...scope, contratoId: current!.id, pagina: cyclePage }, signal }),
    enabled: Boolean(current),
    retry: false,
  });
  const options = useQuery({
    queryKey: [...key, "opcoes", search],
    queryFn: ({ signal }) => fetchOptions({ data: { ...scope, busca: search }, signal }),
    enabled: canManage && Boolean(mode === "new" || mode === "edit" || current),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({ comando, chave }: { comando: ContinuidadeComando; chave: string }) =>
      exec({ data: { ...scope, comando, chave } }),
  });
  const submit: Submit = (comando, success, done) => {
    const signature = JSON.stringify(comando);
    if (attempted.current?.signature !== signature) {
      attempted.current = { signature, chave: crypto.randomUUID() };
    }
    setStatus("");
    mutation.mutate(
      { comando, chave: attempted.current.chave },
      {
        onSuccess: (result) => {
          attempted.current = null;
          setStatus(success);
          if (comando.acao === "criar_contrato") {
            setPage(0);
            setSelected(result.contrato_id);
          }
          if (comando.acao === "planejar_ciclo") setCyclePage(0);
          done?.();
          void cache.invalidateQueries({ queryKey: key });
        },
      },
    );
  };
  const close = () => setMode(undefined);
  const orders = orderChoices(options.data?.ordens ?? []);
  const proposals = (options.data?.propostas ?? []).map(({ id, numero, titulo }) => ({
    id,
    label: numero + (titulo ? " · " + titulo : ""),
  }));
  const packages = (options.data?.pacotes ?? []).map(({ id, codigo, titulo }) => ({
    id,
    label: (codigo ? codigo + " · " : "") + titulo,
  }));
  if (current?.proposta && !proposals.some(({ id }) => id === current.proposta?.id)) {
    proposals.push({ id: current.proposta.id, label: current.proposta.numero });
  }
  if (current?.pacote && !packages.some(({ id }) => id === current.pacote?.id)) {
    packages.push({ id: current.pacote.id, label: current.pacote.titulo });
  }

  return (
    <section className="insp-stack" aria-labelledby={titleId}>
      <div className="insp-work-head">
        <h3 className="insp-subheading" id={titleId}>
          {compact ? "Contratos da unidade" : "Contratos, ciclos e ordens de serviço"}
        </h3>
        {canManage && contracts.data?.segmento && mode !== "new" && (
          <ActionButton onClick={() => setMode("new")}>Novo contrato</ActionButton>
        )}
      </div>
      {contracts.isPending && <LoadingState label="Carregando contratos" />}
      {contracts.isError && (
        <ErrorState error={contracts.error} onRetry={() => void contracts.refetch()} />
      )}
      {status && <p role="status">{status}</p>}
      {mutation.isPending && <p role="status">Salvando continuidade…</p>}
      {mutation.isError && <ErrorState error={mutation.error} />}
      {canManage && contracts.data?.segmento === null && (
        <p>O segmento da unidade precisa ser definido para planejar ciclos.</p>
      )}
      {canManage && (mode || current) && (
        <form
          className="insp-work-head"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(value(new FormData(event.currentTarget), "busca"));
          }}
        >
          <label className="insp-field">
            Buscar proposta ou OS por título
            <input name="busca" type="search" maxLength={80} />
          </label>
          <ActionButton type="submit" variant="ghost">
            Buscar vínculos
          </ActionButton>
        </form>
      )}
      {options.isError && (
        <ErrorState error={options.error} onRetry={() => void options.refetch()} />
      )}
      {canManage && (mode === "new" || (mode === "edit" && current)) && (
        <ContractForm
          key={mode === "new" ? "new" : current?.id}
          contract={mode === "edit" ? current : undefined}
          busy={mutation.isPending}
          submit={submit}
          proposals={proposals}
          packages={packages}
          close={close}
        />
      )}
      {contracts.data?.contratos.length === 0 && (
        <EmptyState title="Nenhum contrato cadastrado nesta unidade" />
      )}
      {contracts.data?.contratos.length ? (
        <div className="insp-grid">
          {contracts.data.contratos.map((contract) => (
            <NrCard className="insp-record" key={contract.id}>
              <h4>{contract.titulo}</h4>
              <Badge value={contract.estado} />
              <Fatos
                items={[
                  ["Referência", contract.referencia],
                  ["Início", dataCivil(contract.inicio)],
                  ["Fim", dataCivil(contract.fim)],
                  [
                    "Prazo contratual",
                    contract.situacao_prazo === "em_aviso"
                      ? "Em aviso · D57 (60 dias)"
                      : contract.situacao_prazo && legenda(contract.situacao_prazo),
                  ],
                  ["Proposta", contract.proposta?.numero],
                  ["Pacote", contract.pacote?.codigo],
                ]}
              />
              {contract.cancelamento_motivo && <p>Cancelamento · {contract.cancelamento_motivo}</p>}
              <ActionButton
                variant="ghost"
                aria-expanded={selected === contract.id}
                onClick={() => {
                  setSelected(selected === contract.id ? undefined : contract.id);
                  setCyclePage(0);
                  close();
                }}
              >
                Consultar ciclos
              </ActionButton>
            </NrCard>
          ))}
        </div>
      ) : null}
      {contracts.data && (
        <Pager
          label="Páginas de contratos"
          page={page}
          total={contracts.data.total}
          limit={contracts.data.limite}
          onChange={(next) => {
            setPage(next);
            setSelected(undefined);
            close();
          }}
        />
      )}
      {current && (
        <>
          <div className="insp-work-head">
            <h4>Ciclos de {current.titulo}</h4>
            {canManage && current.estado !== "cancelado" && (
              <div className="insp-work-head">
                <ActionButton onClick={() => setMode("cycle")}>Planejar ciclo</ActionButton>
                {current.estado === "rascunho" && (
                  <>
                    <ActionButton variant="ghost" onClick={() => setMode("edit")}>
                      Editar
                    </ActionButton>
                    <ActionButton
                      variant="ghost"
                      disabled={mutation.isPending}
                      onClick={() =>
                        submit(
                          {
                            acao: "ativar_contrato",
                            contrato_id: current.id,
                            version: current.version,
                          },
                          "Vigência registrada.",
                        )
                      }
                    >
                      Registrar vigência
                    </ActionButton>
                  </>
                )}
                <ActionButton variant="ghost" onClick={() => setMode("cancel")}>
                  Cancelar contrato
                </ActionButton>
              </div>
            )}
          </div>
          {mode === "cycle" && canManage && (
            <CycleForm
              contract={current}
              busy={mutation.isPending}
              orders={orders}
              submit={submit}
              close={close}
            />
          )}
          {mode === "cancel" && canManage && (
            <form
              className="insp-stack"
              onSubmit={(event) => {
                event.preventDefault();
                submit(
                  {
                    acao: "cancelar_contrato",
                    contrato_id: current.id,
                    version: current.version,
                    motivo: value(new FormData(event.currentTarget), "motivo"),
                  },
                  "Cancelamento registrado.",
                  close,
                );
              }}
            >
              <label className="insp-field">
                Motivo do cancelamento
                <textarea name="motivo" required minLength={8} maxLength={2000} />
              </label>
              <div className="insp-work-head">
                <ActionButton type="submit" disabled={mutation.isPending}>
                  Confirmar cancelamento
                </ActionButton>
                <ActionButton type="button" variant="ghost" onClick={close}>
                  Voltar
                </ActionButton>
              </div>
            </form>
          )}
          {cycles.isPending && <LoadingState label="Carregando ciclos" />}
          {cycles.isError && (
            <ErrorState error={cycles.error} onRetry={() => void cycles.refetch()} />
          )}
          {cycles.data?.ciclos.length === 0 && (
            <EmptyState title="Nenhum ciclo planejado neste contrato" />
          )}
          {cycles.data?.ciclos.length ? (
            <div className="insp-grid">
              {cycles.data.ciclos.map((cycle) => (
                <CycleCard
                  key={cycle.id}
                  cycle={cycle}
                  contract={current}
                  canManage={canManage}
                  busy={mutation.isPending}
                  orders={orders}
                  submit={submit}
                />
              ))}
            </div>
          ) : null}
          {cycles.data && (
            <Pager
              label="Páginas de ciclos"
              page={cyclePage}
              total={cycles.data.total}
              limit={cycles.data.limite}
              onChange={setCyclePage}
            />
          )}
        </>
      )}
    </section>
  );
}

export function InspecoesContinuidade({ scope, ...props }: Props) {
  if (!scope.clienteId || !scope.unidadeId) {
    return <EmptyState title="Selecione uma unidade para consultar contratos e ciclos" />;
  }
  return (
    <ScopedContinuity
      key={[...props.queryKey, scope.clienteId, scope.unidadeId].join("/")}
      scope={{ ...scope, clienteId: scope.clienteId, unidadeId: scope.unidadeId }}
      {...props}
    />
  );
}
