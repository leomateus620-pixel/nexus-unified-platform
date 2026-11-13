import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDebouncedSearch } from "@/features/clientes/queries";
import { NrCard } from "@/features/nr/NrCards";
import {
  inspecoesAcessosExecutar,
  inspecoesAcessosHistorico,
  inspecoesAcessosListar,
  type InspecoesAcessoComando,
  type InspecoesMembro,
} from "./acessos.functions";
import { dataCivil } from "./apresentacao";
import type { InspecoesUnidade } from "./ui-contract";

type Props = { organizationId: string; userId: string; unidades: InspecoesUnidade[] };
type Comando = InspecoesAcessoComando extends infer T
  ? T extends { chave: string }
    ? Omit<T, "chave">
    : never
  : never;
type Atribuicao = InspecoesMembro["atribuicoes"][number];
type Edicao = { membro: InspecoesMembro; revogar?: Atribuicao };
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function paginar(total: number, pagina: number) {
  const ultima = Math.max(0, Math.ceil(total / 20) - 1);
  return { ultima, texto: `Página ${pagina + 1} de ${ultima + 1}` };
}

function Paginas({
  total,
  pagina,
  setPagina,
}: {
  total: number;
  pagina: number;
  setPagina: (value: number) => void;
}) {
  const { ultima, texto } = paginar(total, pagina);
  if (ultima === 0) return null;
  return (
    <div className="insp-actions">
      <ActionButton variant="ghost" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>
        Anterior
      </ActionButton>
      <span className="nr-muted" aria-live="polite">
        {texto}
      </span>
      <ActionButton
        variant="ghost"
        disabled={pagina >= ultima}
        onClick={() => setPagina(pagina + 1)}
      >
        Próxima
      </ActionButton>
    </div>
  );
}

function nomeEscopo(atribuicao: Atribuicao, unidades: InspecoesUnidade[]) {
  if (!atribuicao.cliente_id) return "Organização";
  const contexto = unidades.find(
    (item) =>
      item.cliente_id === atribuicao.cliente_id &&
      (!atribuicao.unidade_id || item.unidade_id === atribuicao.unidade_id),
  );
  if (!contexto) return "Contexto cadastrado anteriormente";
  return atribuicao.unidade_id
    ? `${contexto.cliente_nome} · ${contexto.unidade_nome}`
    : contexto.cliente_nome;
}

export function InspecoesAcessos(props: Props) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <section aria-label="Acessos de Inspeções" className="insp-stack">
      <div className="insp-actions">
        <ActionButton
          variant="ghost"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((value) => !value)}
        >
          Acessos de Inspeções
        </ActionButton>
      </div>
      <div id={panel} hidden={!open}>
        {open && <AcessosPainel {...props} />}
      </div>
    </section>
  );
}

function AcessosPainel(props: Props) {
  const { organizationId, userId, unidades } = props;
  const load = useServerFn(inspecoesAcessosListar);
  const [busca, setBusca] = useState("");
  const filtro = useDebouncedSearch(busca);
  const [pagina, setPagina] = useState(0);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [historico, setHistorico] = useState<InspecoesMembro | null>(null);
  const [feedback, setFeedback] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLHeadingElement | null>(null);
  const query = useQuery({
    queryKey: ["inspecoes", organizationId, userId, "acessos", pagina, filtro],
    queryFn: ({ signal }) => load({ data: { organizationId, busca: filtro, pagina }, signal }),
    retry: false,
  });
  function focusAfterClose(event: Event) {
    event.preventDefault();
    (opener.current?.isConnected ? opener.current : list.current)?.focus({ preventScroll: true });
  }
  return (
    <div className="insp-stack">
      <h3 ref={list} tabIndex={-1} className="insp-subheading">
        Usuários e atribuições
      </h3>
      <p className="nr-muted">
        Atribuições técnicas exigem pessoa vinculada e qualificação conferida na Nexus. Para
        associar pela primeira vez um perfil técnico, a competência deve se chamar Engenharia de
        Segurança do Trabalho (EST) ou Técnico em Segurança do Trabalho (TST), com evidência
        vinculada e conferência independente.
      </p>
      <div className="insp-actions">
        <Link to="/configuracoes" className="insp-text-link">
          Gerenciar membros
        </Link>
        <Link to="/equipe" search={{ area: "qualificacoes" }} className="insp-text-link">
          Consultar qualificações
        </Link>
      </div>
      <label className="insp-field">
        Buscar membro
        <input
          type="search"
          value={busca}
          maxLength={100}
          onChange={(event) => {
            setBusca(event.target.value);
            setPagina(0);
          }}
        />
      </label>
      {feedback && (
        <p className="insp-feedback" role="status">
          {feedback}
        </p>
      )}
      {query.isPending ? (
        <LoadingState label="Carregando membros da organização…" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.membros.length ? (
        <>
          <ul className="insp-grid">
            {query.data.membros.map((membro) => (
              <li key={membro.user_id}>
                <NrCard className="insp-record">
                  <h4>{membro.nome}</h4>
                  {membro.email && <p className="nr-muted">{membro.email}</p>}
                  {membro.atribuicoes.some((item) => !item.revogada_em) ? (
                    <ul className="insp-stack">
                      {membro.atribuicoes
                        .filter((item) => !item.revogada_em)
                        .map((item) => (
                          <li key={item.id} className="insp-stack">
                            <p>
                              <strong>{item.perfil}</strong> · {nomeEscopo(item, unidades)}
                            </p>
                            <p className="nr-muted">
                              {item.valida ? "Ativa" : "Fora de vigência ou sem qualificação ativa"}{" "}
                              · {dataCivil(item.inicio)}
                              {item.fim ? ` a ${dataCivil(item.fim)}` : ""}
                            </p>
                            <div className="insp-actions">
                              <ActionButton
                                variant="danger"
                                onClick={(event) => {
                                  opener.current = event.currentTarget;
                                  setEdicao({ membro, revogar: item });
                                }}
                              >
                                Revogar {item.perfil}
                              </ActionButton>
                            </div>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="nr-muted">Sem atribuição vigente.</p>
                  )}
                  <div className="insp-actions">
                    {membro.qualificacoes.length > 0 && (
                      <ActionButton
                        onClick={(event) => {
                          opener.current = event.currentTarget;
                          setEdicao({ membro });
                        }}
                      >
                        Designar atuação
                      </ActionButton>
                    )}
                    {membro.atribuicoes.length > 0 && (
                      <ActionButton
                        variant="ghost"
                        onClick={(event) => {
                          opener.current = event.currentTarget;
                          setHistorico(membro);
                        }}
                      >
                        Histórico de acesso
                      </ActionButton>
                    )}
                  </div>
                  {!membro.qualificacoes.length && (
                    <p className="nr-muted">Qualificação vigente ainda indisponível.</p>
                  )}
                </NrCard>
              </li>
            ))}
          </ul>
          <Paginas total={query.data.total} pagina={pagina} setPagina={setPagina} />
        </>
      ) : (
        <EmptyState title="Nenhum membro localizado" />
      )}
      {edicao && (
        <AcessoEditor
          {...props}
          edicao={edicao}
          focusAfterClose={focusAfterClose}
          close={() => setEdicao(null)}
          saved={(acao) =>
            setFeedback(acao === "designar" ? "Atribuição registrada." : "Atribuição revogada.")
          }
        />
      )}
      {historico && (
        <AcessoHistorico
          {...props}
          membro={historico}
          close={() => setHistorico(null)}
          focusAfterClose={focusAfterClose}
        />
      )}
    </div>
  );
}

function AcessoEditor({
  organizationId,
  userId,
  unidades,
  edicao,
  close,
  saved,
  focusAfterClose,
}: Props & {
  edicao: Edicao;
  close: () => void;
  saved: (acao: Comando["acao"]) => void;
  focusAfterClose: (event: Event) => void;
}) {
  const { membro, revogar } = edicao;
  const save = useServerFn(inspecoesAcessosExecutar);
  const cache = useQueryClient();
  const request = useRef<{ payload: string; key: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [perfil, setPerfil] = useState<"EST" | "TST">(membro.tem_registro ? "EST" : "TST");
  const [qualificacaoId, setQualificacaoId] = useState(membro.qualificacoes[0]?.id ?? "");
  const [cliente, setCliente] = useState("");
  const [unidade, setUnidade] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [associar, setAssociar] = useState(false);
  const [ensaios, setEnsaios] = useState(false);
  const [biblioteca, setBiblioteca] = useState(false);
  const [importacao, setImportacao] = useState(false);
  const qualificacao = membro.qualificacoes.find((item) => item.id === qualificacaoId);
  const precisaAssociar = !!qualificacao && !qualificacao.perfis.includes(perfil);
  const podeAssociar = !!qualificacao?.perfis_para_associar.includes(perfil);
  const podeSalvar =
    motivo.trim().length >= 5 &&
    (!!revogar || (!!qualificacao && (!precisaAssociar || (associar && podeAssociar))));
  const mutation = useMutation({
    mutationFn: (data: Comando) => {
      const payload = JSON.stringify(data);
      if (request.current?.payload !== payload)
        request.current = { payload, key: crypto.randomUUID() };
      return save({ data: { organizationId, comando: { ...data, chave: request.current.key } } });
    },
    onSuccess: async ({ acao }) => {
      await cache.invalidateQueries({ queryKey: ["inspecoes", organizationId] });
      saved(acao);
      close();
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!podeSalvar || mutation.isPending) return;
    mutation.mutate(
      revogar
        ? { acao: "revogar", atribuicao_id: revogar.id, motivo }
        : {
            acao: "designar",
            user_id: membro.user_id,
            qualificacao_id: qualificacaoId,
            perfil,
            cliente_id: cliente || null,
            unidade_id: unidade || null,
            inicio: inicio || undefined,
            fim: fim || null,
            motivo,
            vincular_competencia: precisaAssociar && associar,
            ensaios,
            biblioteca: perfil === "EST" && biblioteca,
            importacao: perfil === "EST" && importacao,
          },
    );
  }
  const clients = Array.from(new Map(unidades.map((item) => [item.cliente_id, item.cliente_nome])));
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !mutation.isPending) close();
      }}
    >
      <DialogContent className="nx-nr-workspace insp-dialog" onCloseAutoFocus={focusAfterClose}>
        <DialogHeader className="insp-dialog-header">
          <DialogTitle>
            {revogar ? `Revogar atribuição ${revogar.perfil}` : "Designar atuação técnica"}
          </DialogTitle>
          <DialogDescription>
            {membro.nome}
            {revogar && ` · ${nomeEscopo(revogar, unidades)}`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="insp-dialog-scroll insp-stack">
          {!revogar && (
            <>
              <label className="insp-field">
                Perfil
                <select
                  value={perfil}
                  onChange={(event) => {
                    setPerfil(event.target.value === "EST" ? "EST" : "TST");
                    setAssociar(false);
                  }}
                >
                  <option value="EST" disabled={!membro.tem_registro}>
                    EST
                  </option>
                  <option value="TST">TST</option>
                </select>
              </label>
              {!membro.tem_registro && (
                <p className="nr-muted">EST exige registro profissional cadastrado em Equipe.</p>
              )}
              <label className="insp-field">
                Qualificação conferida
                <select
                  value={qualificacaoId}
                  onChange={(event) => {
                    setQualificacaoId(event.target.value);
                    setAssociar(false);
                  }}
                  required
                >
                  {membro.qualificacoes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                      {item.validade && ` · até ${dataCivil(item.validade)}`}
                    </option>
                  ))}
                </select>
              </label>
              {precisaAssociar &&
                (!podeAssociar ? (
                  <p className="nr-muted">
                    Para associar a qualificação, use a competência de{" "}
                    {perfil === "EST"
                      ? "Engenharia de Segurança do Trabalho"
                      : "Técnico em Segurança do Trabalho"}{" "}
                    com evidência vinculada e conferência independente.
                  </p>
                ) : (
                  <label className="insp-choice">
                    <input
                      type="checkbox"
                      checked={associar}
                      onChange={(event) => setAssociar(event.target.checked)}
                    />{" "}
                    Associo esta competência ao perfil {perfil} na organização.
                  </label>
                ))}
              <div className="insp-grid">
                <label className="insp-field">
                  Cliente
                  <select
                    value={cliente}
                    onChange={(event) => {
                      setCliente(event.target.value);
                      setUnidade("");
                    }}
                  >
                    <option value="">Toda a organização</option>
                    {clients.map(([id, nome]) => (
                      <option key={id} value={id}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="insp-field">
                  Unidade
                  <select
                    value={unidade}
                    disabled={!cliente}
                    onChange={(event) => setUnidade(event.target.value)}
                  >
                    <option value="">Todas as unidades do cliente</option>
                    {unidades
                      .filter((item) => item.cliente_id === cliente)
                      .map((item) => (
                        <option key={item.unidade_id} value={item.unidade_id}>
                          {item.unidade_nome}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="insp-field">
                  Início da vigência
                  <input
                    type="date"
                    value={inicio}
                    onChange={(event) => setInicio(event.target.value)}
                  />
                </label>
                <label className="insp-field">
                  Fim da vigência
                  <input
                    type="date"
                    value={fim}
                    min={inicio || undefined}
                    max={qualificacao?.validade || undefined}
                    onChange={(event) => setFim(event.target.value)}
                  />
                </label>
              </div>
              <p className="nr-muted">
                Sem data de início, a designação começa hoje. A qualificação limita a vigência da
                atuação.
              </p>
              <fieldset className="insp-stack">
                <legend>Capacidades adicionais</legend>
                <label className="insp-choice">
                  <input
                    type="checkbox"
                    checked={ensaios}
                    onChange={(event) => setEnsaios(event.target.checked)}
                  />{" "}
                  Registrar ensaios
                </label>
                {perfil === "EST" && (
                  <>
                    <label className="insp-choice">
                      <input
                        type="checkbox"
                        checked={biblioteca}
                        onChange={(event) => setBiblioteca(event.target.checked)}
                      />{" "}
                      Homologar protocolos
                    </label>
                    <label className="insp-choice">
                      <input
                        type="checkbox"
                        checked={importacao}
                        onChange={(event) => setImportacao(event.target.checked)}
                      />{" "}
                      Importar acervo
                    </label>
                  </>
                )}
              </fieldset>
            </>
          )}
          <label className="insp-field">
            {revogar ? "Motivo da revogação" : "Motivo e referência da designação"}
            <textarea
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              minLength={5}
              maxLength={2000}
              rows={3}
              required
            />
          </label>
          {mutation.isError && <ErrorState error={mutation.error} />}
          <div className="insp-actions">
            <ActionButton variant="ghost" disabled={mutation.isPending} onClick={close}>
              Cancelar
            </ActionButton>
            <ActionButton
              type="submit"
              variant={revogar ? "danger" : "primary"}
              loading={mutation.isPending}
              disabled={!podeSalvar}
            >
              {revogar ? "Confirmar revogação" : "Salvar atribuição"}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AcessoHistorico({
  organizationId,
  userId,
  membro,
  close,
  focusAfterClose,
}: Props & {
  membro: InspecoesMembro;
  close: () => void;
  focusAfterClose: (event: Event) => void;
}) {
  const load = useServerFn(inspecoesAcessosHistorico);
  const [pagina, setPagina] = useState(0);
  const query = useQuery({
    queryKey: ["inspecoes", organizationId, userId, "acessos", "historico", membro.user_id, pagina],
    queryFn: ({ signal }) =>
      load({ data: { organizationId, usuarioId: membro.user_id, pagina }, signal }),
    retry: false,
  });
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent className="nx-nr-workspace insp-dialog" onCloseAutoFocus={focusAfterClose}>
        <DialogHeader className="insp-dialog-header">
          <DialogTitle>Histórico de acesso</DialogTitle>
          <DialogDescription>{membro.nome}</DialogDescription>
        </DialogHeader>
        <div className="insp-dialog-scroll insp-stack">
          {query.isPending ? (
            <LoadingState label="Carregando histórico…" />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : query.data.eventos.length ? (
            <>
              <ol className="insp-stack">
                {query.data.eventos.map((item) => (
                  <li key={item.id}>
                    <NrCard className="insp-record">
                      <h4>
                        {item.acao === "designada" ? "Designação" : "Revogação"} {item.perfil}
                      </h4>
                      <p className="nr-muted">
                        {dataHora.format(new Date(item.criado_em))} · {item.autor}
                      </p>
                      <p className="insp-preserve-lines">{item.motivo}</p>
                    </NrCard>
                  </li>
                ))}
              </ol>
              <Paginas total={query.data.total} pagina={pagina} setPagina={setPagina} />
            </>
          ) : (
            <EmptyState title="Nenhum evento de acesso registrado" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
