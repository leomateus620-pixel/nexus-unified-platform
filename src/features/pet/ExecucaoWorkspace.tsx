import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, FileCheck2, Plus, Search, ShieldCheck } from "lucide-react";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import { OperationalDialog, useCommandKey } from "@/features/operacao/components";
import { useOrg } from "@/features/org/session";
import { useOperationalAccess } from "@/features/operacao/access";
import { petExecutar, petListar, petOpcoes } from "./pet.functions";
import {
  optionName,
  petDate,
  petLabel,
  type PetLista,
  type PetOpcoes,
  type PetOrdem,
  type PetResumo,
  type PetUICommand,
} from "./ui-types";
import "./pet.css";
import { PetAppearanceProvider, PetThemeToggle, usePetAppearance } from "./PetAppearance";
import {
  petListStateKey,
  readPetListState,
  writePetListState,
  petListPageAfterResponse,
} from "./list-state";
import { nrSearchSchema } from "@/features/nr/route-state";

function listSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function PetStatus({ value, attention = false }: { value: string; attention?: boolean }) {
  const tone =
    attention || ["expirada", "emergencia"].includes(value)
      ? "danger"
      : ["encerramento_pendente", "interrompida"].includes(value)
        ? "attention"
        : ["emitida", "em_atividade", "encerrada", "em_execucao"].includes(value)
          ? "ok"
          : "neutral";
  return (
    <span className="nx-pet-status" data-tone={tone}>
      {petLabel(value)}
    </span>
  );
}
export function PetCard({ pet, onOpen }: { pet: PetResumo; onOpen?: () => void }) {
  const expired =
    !!pet.emitida_em && !pet.encerrada_em && new Date(pet.termino_previsto).getTime() <= Date.now();
  return (
    <article className="nx-pet-card">
      <div className="nx-pet-card-top">
        <div>
          <p className="nx-pet-card-code">{pet.numero}</p>
          <h3 className="nx-pet-card-title">{pet.espaco_nome || "Espaço confinado"}</h3>
        </div>
        <PetStatus value={expired ? "expirada" : pet.estado_documental} />
      </div>
      <p className="nx-pet-subtitle">{pet.atividade}</p>
      <div className="nx-pet-card-meta mt-3">
        <span>Validade: {petDate(pet.termino_previsto, pet.timezone)}</span>
        <span>Responsável: {pet.responsavel_nome || "A definir"}</span>
      </div>
      <div className="nx-pet-card-bottom">
        <span>
          {pet.presentes ?? 0}{" "}
          {(pet.presentes ?? 0) === 1
            ? "pessoa sem saída registrada"
            : "pessoas sem saída registrada"}
          {pet.assinaturas_pendentes
            ? ` · ${pet.assinaturas_pendentes} assinatura(s) pendente(s)`
            : ""}
        </span>
        <Link
          className="nx-pet-link"
          to={String(pet.cliente_id ? `/nr-33/pets/${pet.id}` : `/execucao/pets/${pet.id}`)}
          search={
            pet.cliente_id
              ? {
                  ...nrSearchSchema.parse({}),
                  cliente: pet.cliente_id,
                  unidade: pet.unidade_id,
                  local: pet.local_nr_id ?? "",
                }
              : {}
          }
          onClick={(event) => {
            if (
              event.button === 0 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            )
              onOpen?.();
          }}
        >
          Abrir PET <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
    </article>
  );
}
export function ExecucaoWorkspace({ ordemId }: { ordemId?: string | undefined }) {
  const session = useOrg();
  const org = session.data?.orgId || "";
  const user = session.data?.userId || "";
  const access = useOperationalAccess(org, user);
  if (!session.data || session.isPending || access.isPending)
    return <LoadingState label="Carregando Execução e permissões…" />;
  if (session.isError || access.isError)
    return <ErrorState error={session.error || access.error} onRetry={() => access.refetch()} />;
  return (
    <PetAppearanceProvider organizationId={org} userId={user}>
      <ExecucaoContent
        key={`${org}:${user}:${ordemId || "lista"}:${session.data.roles.join(",")}:${JSON.stringify(access.data)}`}
        organizationId={org}
        userId={user}
        ordemId={ordemId}
        canManage={access.data.gerirOperacao}
      />
    </PetAppearanceProvider>
  );
}
function ExecucaoContent({
  organizationId,
  userId,
  ordemId,
  canManage,
}: {
  organizationId: string;
  userId: string;
  ordemId?: string | undefined;
  canManage: boolean;
}) {
  const { theme } = usePetAppearance();
  const stateKey = petListStateKey(organizationId, userId, ordemId);
  const [restored] = useState(() => readPetListState(listSessionStorage(), stateKey));
  const [page, setPage] = useState(restored.page);
  const listFn = useServerFn(petListar),
    optionsFn = useServerFn(petOpcoes),
    executeFn = useServerFn(petExecutar);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(restored.search);
  const [tab] = useState<"ordens" | "pets">("ordens");
  const pendingScroll = useRef<number | null>(restored.scrollY);
  const positionCaptured = useRef(false);
  const currentView = useRef(restored);
  currentView.current = { ...currentView.current, search, page, tab };
  useEffect(() => {
    positionCaptured.current = false;
    writePetListState(listSessionStorage(), stateKey, currentView.current);
  }, [stateKey, search, page, tab]);
  useEffect(
    () => () => {
      const state = currentView.current;
      writePetListState(listSessionStorage(), stateKey, {
        ...state,
        scrollY:
          pendingScroll.current === null && !positionCaptured.current
            ? window.scrollY
            : state.scrollY,
      });
    },
    [stateKey],
  );
  const capturePosition = () => {
    pendingScroll.current = null;
    positionCaptured.current = true;
    currentView.current = { ...currentView.current, scrollY: window.scrollY };
    writePetListState(listSessionStorage(), stateKey, currentView.current);
  };
  const [dialog, setDialog] = useState<"os" | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const keyFor = useCommandKey();
  const [notice, setNotice] = useState("");
  const list = useQuery({
    queryKey: [
      "pet",
      organizationId,
      userId,
      "lista",
      ordemId,
      tab,
      ordemId || tab === "pets" ? search : "",
      page,
    ],
    queryFn: ({ signal }) =>
      listFn({
        data: {
          organization_id: organizationId,
          filtros: {
            ...(ordemId ? { os_id: ordemId } : {}),
            busca: ordemId || tab === "pets" ? search : "",
            pagina: page,
            limite: 20,
          },
        },
        signal,
      }) as Promise<PetLista>,
    refetchInterval: 30_000,
    placeholderData: (previous, query) => (query?.queryKey[4] === ordemId ? previous : undefined),
    retry: false,
  });
  const confirmedPage = list.isSuccess && !list.isFetching && !list.isPlaceholderData;
  const correctedPage = petListPageAfterResponse(page, list.data, confirmedPage);
  useEffect(() => {
    if (correctedPage !== null) setPage(correctedPage);
  }, [correctedPage]);
  useEffect(() => {
    if (!confirmedPage || correctedPage !== null || pendingScroll.current === null) return;
    const top = pendingScroll.current;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        pendingScroll.current = null;
        window.scrollTo({ top, behavior: "instant" });
        currentView.current = { ...currentView.current, scrollY: window.scrollY };
        writePetListState(listSessionStorage(), stateKey, currentView.current);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [confirmedPage, correctedPage, stateKey]);
  const options = useQuery({
    queryKey: ["pet", organizationId, userId, "opcoes"],
    queryFn: ({ signal }) =>
      optionsFn({ data: { organization_id: organizationId }, signal }) as Promise<PetOpcoes>,
    retry: false,
  });
  const [form, setForm] = useState({
    cliente_id: "",
    unidade_id: "",
    titulo: "",
    escopo: "",
    responsavel_id: "",
    os_id: ordemId || "",
    espaco_id: "",
    atividade: "",
    termino_previsto: "",
    timezone: "America/Sao_Paulo",
    identificacao: "",
    localizacao: "",
  });
  function set(name: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [name]: value, ...(name === "cliente_id" ? { unidade_id: "" } : {}) }));
  }
  async function command(comando: PetUICommand["comando"], dados: PetUICommand["dados"]) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const payload = { comando, dados };
      const saved = (await executeFn({
        data: { organization_id: organizationId, comando: { ...payload, chave: keyFor(payload) } },
      })) as unknown as { id?: string; pet?: { id: string }; os?: { id: string } };
      await queryClient.invalidateQueries({ queryKey: ["pet", organizationId] });
      setDialog(null);
      setNotice("Registro confirmado no servidor.");
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e
          : new Error("Não foi possível salvar. O preenchimento foi preservado."),
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (list.isPending) return <LoadingState label="Consultando ordens de serviço e PETs…" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const ordem = ordemId ? list.data.ordens.find((o) => o.id === ordemId) : null;
  if (ordemId && !ordem)
    return <ErrorState error={new Error("Ordem indisponível ou sem permissão de acesso.")} />;
  const pets = list.data.registros;
  const ordens = list.data.ordens.filter((o) =>
    `${o.numero} ${o.titulo}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const opts = options.data;
  const nome = (group: "clientes" | "unidades" | "pessoas", id: string) =>
    optionName(opts?.[group]?.find((p) => p.id === id));
  return (
    <div className="nx-pet space-y-5">
      {ordem && (
        <Link to="/execucao" className="nx-pet-link">
          <ArrowLeft size={15} aria-hidden /> Execução e ordens de serviço
        </Link>
      )}
      <header className="nx-pet-header">
        <div>
          <p className="nx-pet-kicker">Execução / Ordens de Serviço</p>
          <h1 className="nx-pet-title">
            {ordem ? `${ordem.numero} · ${ordem.titulo}` : "Ordens de serviço"}
          </h1>
          <p className="nx-pet-description">
            {ordem
              ? "Escopo e execução da OS, com permissões específicas para cada espaço confinado."
              : "Acompanhe escopo, equipe e execução. A operação da PET fica na unidade."}
          </p>
        </div>
        {canManage && !ordem && (
          <ActionButton onClick={() => setDialog("os")}>
            <Plus size={16} aria-hidden className="mr-2 inline" />
            Nova ordem de serviço
          </ActionButton>
        )}
      </header>
      {notice && (
        <p role="status" className="nx-pet-notice">
          {notice}
        </p>
      )}
      {!ordem && (
        <div className="nx-pet-grid">
          <div className="nx-pet-panel">
            <ShieldCheck size={22} aria-hidden className="mb-3 text-primary" />
            <h2>OS organiza o serviço</h2>
            <p className="nx-pet-subtitle">
              Escopo, equipe e execução possuem registros próprios. Horas da PET não geram
              apontamento ou cobrança na OS.
            </p>
          </div>
          <div className="nx-pet-panel">
            <FileCheck2 size={22} aria-hidden className="mb-3 text-primary" />
            <h2>PET autoriza uma entrada específica</h2>
            <p className="nx-pet-subtitle">
              Espaço, condições, pessoas, validade e documentos rastreáveis. Uma OS pode reunir
              várias PETs.
            </p>
          </div>
        </div>
      )}
      {ordem && (
        <div className="nx-pet-panel">
          <div className="nx-pet-section-top">
            <div>
              <h2>Contexto do serviço</h2>
              <p className="nx-pet-subtitle">Dados do cadastro canônico da organização.</p>
            </div>
            <PetStatus value={ordem.estado} />
          </div>
          <dl className="nx-pet-grid">
            <div>
              <dt className="nx-pet-hint">Cliente</dt>
              <dd>{nome("clientes", ordem.cliente_id)}</dd>
            </div>
            <div>
              <dt className="nx-pet-hint">Unidade</dt>
              <dd>{nome("unidades", ordem.unidade_id)}</dd>
            </div>
            <div>
              <dt className="nx-pet-hint">Responsável</dt>
              <dd>
                {ordem.responsavel_id ? nome("pessoas", ordem.responsavel_id) : "Não definido"}
              </dd>
            </div>
            <div>
              <dt className="nx-pet-hint">Escopo da OS</dt>
              <dd className="text-sm">{ordem.escopo}</dd>
            </div>
          </dl>
          <p className="nx-pet-notice mt-5">
            Encerrar uma PET não conclui esta OS. A conclusão da OS exige tratar as PETs e as
            presenças pendentes.
          </p>
          {canManage && !["concluida", "cancelada"].includes(ordem.estado) && (
            <div className="nx-pet-actions mt-4">
              <ActionButton
                variant="ghost"
                loading={busy}
                onClick={() =>
                  command("concluir_os", { os_id: ordem.id, expected_version: ordem.version })
                }
              >
                Concluir OS
              </ActionButton>
            </div>
          )}
        </div>
      )}
      <section
        className={`nx-pet-panel${ordem || tab === "pets" ? " pet-section" : ""}`}
        data-pet-theme={ordem || tab === "pets" ? theme : undefined}
      >
        <div className="nx-pet-section-top">
          <div>
            <h2>{ordem ? "Permissões de Entrada e Trabalho" : "Seu workspace de execução"}</h2>
            <p className="nx-pet-subtitle">
              {ordem
                ? "Consulte o documento, a presença e as pendências de cada autorização."
                : "Consulte os registros autorizados ao seu perfil."}
            </p>
          </div>
          <div className="nx-pet-actions">
            {(ordem || tab === "pets") && <PetThemeToggle />}
            {ordem && (
              <Link
                className="nx-pet-link"
                to={String("/nr-33/pets")}
                search={{
                  ...nrSearchSchema.parse({}),
                  cliente: ordem.cliente_id,
                  unidade: ordem.unidade_id,
                }}
              >
                Abrir PETs na unidade
              </Link>
            )}
          </div>
        </div>
        <div className="nx-pet-controls">
          <label className="nx-pet-field">
            <span>
              <Search size={12} aria-hidden className="mr-1 inline" /> Buscar{" "}
              {ordem || tab === "pets" ? "PET ou espaço" : "OS"}
            </span>
            <input
              type="search"
              maxLength={120}
              value={search}
              onChange={(e) => {
                pendingScroll.current = null;
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Número, atividade ou identificação"
            />
          </label>
        </div>
        <div className="nx-pet-list">
          {ordem || tab === "pets" ? (
            pets.length ? (
              pets.map((p) => <PetCard key={p.id} pet={p} onOpen={capturePosition} />)
            ) : (
              <EmptyState
                title="Nenhuma PET encontrada"
                hint={
                  search
                    ? "Ajuste a busca para consultar outras permissões."
                    : "Consulte e prepare permissões pelo painel da unidade."
                }
              />
            )
          ) : ordens.length ? (
            ordens.map((o) => <OrdemCard key={o.id} ordem={o} />)
          ) : (
            <EmptyState
              title="Nenhuma ordem de serviço"
              hint="Cadastre a OS com cliente e unidade reais para organizar o serviço."
            />
          )}
        </div>
        {(ordem || tab === "pets") && list.data.total > (list.data.limite || 20) && (
          <PetPagination
            page={page}
            total={list.data.total}
            limit={list.data.limite || 20}
            onChange={(next) => {
              pendingScroll.current = null;
              setPage(next);
            }}
          />
        )}
      </section>
      <OperationalDialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title="Nova ordem de serviço"
      >
        <form
          className="nx-pet space-y-4"
          data-dirty="true"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            if (dialog === "os")
              void command("criar_os", {
                cliente_id: form.cliente_id,
                unidade_id: form.unidade_id,
                titulo: form.titulo,
                escopo: form.escopo,
                responsavel_id: form.responsavel_id || null,
              });
          }}
        >
          {options.isError && (
            <ErrorState error={options.error} onRetry={() => options.refetch()} />
          )}
          {dialog === "os" && (
            <>
              <label className="nx-pet-field">
                Cliente
                <select
                  required
                  value={form.cliente_id}
                  onChange={(e) => set("cliente_id", e.target.value)}
                >
                  <option value="">Selecione o cliente</option>
                  {opts?.clientes.map((o) => (
                    <option value={o.id} key={o.id}>
                      {optionName(o)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="nx-pet-field">
                Unidade
                <select
                  required
                  value={form.unidade_id}
                  onChange={(e) => set("unidade_id", e.target.value)}
                >
                  <option value="">Selecione a unidade</option>
                  {opts?.unidades
                    .filter((o) => o.cliente_id === form.cliente_id)
                    .map((o) => (
                      <option value={o.id} key={o.id}>
                        {optionName(o)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="nx-pet-field">
                Título do serviço
                <input
                  required
                  maxLength={200}
                  value={form.titulo}
                  onChange={(e) => set("titulo", e.target.value)}
                />
              </label>
              <label className="nx-pet-field">
                Escopo da OS
                <textarea
                  required
                  value={form.escopo}
                  onChange={(e) => set("escopo", e.target.value)}
                />
              </label>
              <label className="nx-pet-field">
                Responsável
                <select
                  value={form.responsavel_id}
                  onChange={(e) => set("responsavel_id", e.target.value)}
                >
                  <option value="">A definir</option>
                  {opts?.pessoas.map((o) => (
                    <option value={o.id} key={o.id}>
                      {optionName(o)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="nx-pet-notice" data-tone="danger">
              {error.message} O preenchimento continua disponível.
            </p>
          )}
          <ActionButton
            type="submit"
            loading={busy}
            disabled={options.isPending || options.isError}
          >
            {dialog === "os"
              ? "Criar OS"
              : dialog === "espaco"
                ? "Salvar espaço"
                : "Criar e preparar PET"}
          </ActionButton>
        </form>
      </OperationalDialog>
    </div>
  );
}
function OrdemCard({ ordem }: { ordem: PetOrdem }) {
  return (
    <article className="nx-pet-card">
      <div className="nx-pet-card-top">
        <div>
          <p className="nx-pet-card-code">{ordem.numero}</p>
          <h3 className="nx-pet-card-title">{ordem.titulo}</h3>
        </div>
        <PetStatus value={ordem.estado} />
      </div>
      <p className="nx-pet-subtitle">{ordem.escopo}</p>
      <div className="nx-pet-card-bottom">
        <span>Consultar permissões e presenças vinculadas</span>
        <Link className="nx-pet-link" to="/execucao/ordens/$ordemId" params={{ ordemId: ordem.id }}>
          Abrir OS <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
    </article>
  );
}

export function PetHistoricoUnidade({ unidadeId }: { unidadeId: string }) {
  const session = useOrg();
  return (
    <PetHistoricoUnidadeScope
      key={`${session.data?.orgId}:${session.data?.userId}:${unidadeId}`}
      unidadeId={unidadeId}
    />
  );
}
function PetHistoricoUnidadeScope({ unidadeId }: { unidadeId: string }) {
  const org = useOrg();
  const load = useServerFn(petListar);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const q = useQuery<PetLista>({
    queryKey: ["pet", org.data?.orgId, org.data?.userId, "unidade", unidadeId, search, page],
    placeholderData: (previous, query) =>
      query?.queryKey[1] === org.data?.orgId &&
      query?.queryKey[2] === org.data?.userId &&
      query?.queryKey[4] === unidadeId
        ? previous
        : undefined,
    enabled: !!org.data?.orgId && !!unidadeId,
    queryFn: ({ signal }) =>
      load({
        data: {
          organization_id: org.data!.orgId,
          filtros: { unidade_id: unidadeId, busca: search, pagina: page, limite: 20 },
        },
        signal,
      }) as Promise<PetLista>,
    retry: false,
  });
  const correctedPage = petListPageAfterResponse(
    page,
    q.data,
    q.isSuccess && !q.isFetching && !q.isPlaceholderData,
  );
  useEffect(() => {
    if (correctedPage !== null) setPage(correctedPage);
  }, [correctedPage]);
  return (
    <section className="nx-pet nx-pet-panel">
      <div className="nx-pet-section-top">
        <div>
          <h2>Histórico de PETs</h2>
          <p className="nx-pet-subtitle">
            Permissões, presenças e documentos desta unidade. A consulta mantém a identificação
            histórica de cada emissão.
          </p>
        </div>
      </div>
      <label className="nx-pet-field mb-4">
        Buscar número, espaço ou atividade
        <input
          type="search"
          maxLength={120}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </label>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="nx-pet-list">
          {q.data.registros.map((p) => (
            <PetCard key={p.id} pet={p} />
          ))}
          {!q.data.registros.length && (
            <EmptyState
              title="Esta unidade ainda não possui PETs"
              hint="As permissões criadas nas ordens de serviço aparecerão aqui."
            />
          )}
          {q.data.total > (q.data.limite || 20) && (
            <PetPagination
              page={page}
              total={q.data.total}
              limit={q.data.limite || 20}
              onChange={setPage}
            />
          )}
        </div>
      )}
    </section>
  );
}
function PetPagination({
  page,
  total,
  limit,
  onChange,
}: {
  page: number;
  total: number;
  limit: number;
  onChange: (value: number) => void;
}) {
  return (
    <nav className="pet-pagination" aria-label="Páginas de PETs">
      <span>
        {total} permissões · Página {page + 1} de {Math.ceil(total / limit)}
      </span>
      <div className="nx-pet-actions">
        <ActionButton variant="ghost" disabled={page === 0} onClick={() => onChange(page - 1)}>
          Anterior
        </ActionButton>
        <ActionButton
          variant="ghost"
          disabled={(page + 1) * limit >= total}
          onClick={() => onChange(page + 1)}
        >
          Próxima
        </ActionButton>
      </div>
    </nav>
  );
}
