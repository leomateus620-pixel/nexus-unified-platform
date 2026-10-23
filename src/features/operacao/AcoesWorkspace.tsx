import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/nexus/Page";
import { useOrg, useOrgId } from "@/features/org/session";
import { acaoDados, type AcaoOperacional } from "./schemas";
import {
  listarAcoes,
  listarPessoas,
  obterAcao,
  salvarAcao,
  transicionarAcao,
} from "./operacao.functions";
import { fieldClass, OperationalDialog, Pagination, useCommandKey } from "./components";
import { RecordFiles } from "./RecordFiles";
import { useOperationalAccess, type OperationalAccess } from "./access";

const estados: Record<AcaoOperacional["estado"], string> = {
  aberta: "Aberta",
  em_execucao: "Em execução",
  aguardando_verificacao: "Aguardando verificação",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
export function AcoesWorkspace({
  selectedId = "",
  onSelect,
}: { selectedId?: string | undefined; onSelect?: ((id: string) => void) | undefined } = {}) {
  const org = useOrg();
  const access = useOperationalAccess(org.data?.orgId ?? "", org.data?.userId ?? "");
  if (access.isPending) return <LoadingState label="Conferindo acesso operacional…" />;
  if (access.isError) return <ErrorState error={access.error} onRetry={() => access.refetch()} />;
  return (
    <AcoesContent
      key={`${org.data?.userId}:${org.data?.orgId}:${org.data?.roles.slice().sort().join(",")}:${JSON.stringify(access.data)}`}
      access={access.data}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}
function AcoesContent({
  access,
  selectedId,
  onSelect,
}: {
  access: OperationalAccess;
  selectedId: string;
  onSelect?: ((id: string) => void) | undefined;
}) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [encerradas, setEncerradas] = useState(false);
  const [localSel, setLocalSel] = useState<AcaoOperacional | null>(null);
  const [transitionBase, setTransitionBase] = useState<AcaoOperacional | null>(null);
  const [refreshed, setRefreshed] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [next, setNext] = useState<AcaoOperacional["estado"] | null>(null);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const keyFor = useCommandKey();
  const focused = useQuery({
    queryKey: ["acoes-operacionais", orgId, "ficha", selectedId],
    enabled: !!orgId && !!selectedId,
    queryFn: ({ signal }) =>
      obterAcao({ data: { organization_id: orgId, id: selectedId }, signal }),
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });
  const sel = selectedId ? (focused.isError ? null : (focused.data ?? null)) : localSel;
  const setSel = (action: AcaoOperacional | null) => {
    setLocalSel(action);
    if (action) qc.setQueryData(["acoes-operacionais", orgId, "ficha", action.id], action);
  };
  const chooseNext = (state: AcaoOperacional["estado"]) => {
    setRefreshed(null);
    setTransitionBase(sel);
    setNext(state);
    setMotivo("");
  };
  const canManage = access.gerirOperacao;
  const canExecute = !!sel && (canManage || access.pessoaId === sel.responsavel_id);
  const canReview =
    canExecute &&
    access.revisarOperacao &&
    (!sel?.exige_verificacao || access.pessoaId !== sel.responsavel_id);
  const detail = useRef<HTMLDivElement>(null);
  const transitionId = useId();
  const select = (action: AcaoOperacional) => {
    setSel(action);
    onSelect?.(action.id);
    setErro(null);
    setNext(null);
    requestAnimationFrame(() => {
      if (window.innerWidth < 1280) {
        detail.current?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
        detail.current?.focus({ preventScroll: true });
      }
    });
  };
  useEffect(() => {
    const id = setTimeout(() => {
      setBusca(search);
      setPagina(0);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);
  const q = useQuery({
    queryKey: ["acoes-operacionais", orgId, busca, pagina, encerradas],
    enabled: !!orgId,
    queryFn: ({ signal }) =>
      listarAcoes({
        data: { organization_id: orgId, busca, pagina, arquivados: encerradas },
        signal,
      }),
  });
  async function transicionar() {
    const target = transitionBase ?? sel;
    if (!target || !next) return;
    if (
      ["aguardando_verificacao", "concluida", "cancelada"].includes(next) &&
      motivo.trim().length < 5
    ) {
      setErro("Informe resultado ou justificativa com ao menos cinco caracteres.");
      requestAnimationFrame(() => document.getElementById(transitionId)?.focus());
      return;
    }
    setSaving(true);
    setErro(null);
    const payload = {
      organization_id: orgId,
      id: target.id,
      expected_version: target.version,
      estado: next,
      motivo: motivo || null,
    };
    try {
      const updated = await transicionarAcao({ data: { ...payload, chave: keyFor(payload) } });
      setSel(updated);
      setNext(null);
      setMotivo("");
      await qc.invalidateQueries({ queryKey: ["acoes-operacionais", orgId] });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a mudança.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Conformidade"
        title="Ações operacionais"
        description="Problema, responsável, prazo e evidência de resolução. A verificação mantém a responsabilidade por cada decisão."
        actions={canManage && <ActionButton onClick={() => setNova(true)}>Nova ação</ActionButton>}
      />
      <div className="flex flex-wrap gap-3">
        <label className="min-w-0 flex-1 text-sm">
          Buscar ação
          <input
            className={fieldClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Título"
          />
        </label>
        <label className="text-sm">
          Situação
          <select
            className={fieldClass}
            value={String(encerradas)}
            onChange={(e) => {
              setEncerradas(e.target.value === "true");
              setPagina(0);
            }}
          >
            <option value="false">Em aberto</option>
            <option value="true">Encerradas</option>
          </select>
        </label>
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
        <Section title="Fila de trabalho">
          {q.isPending && <p role="status">Consultando ações…</p>}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
          {q.data?.rows.length === 0 && (
            <EmptyState
              title={busca ? "Nenhuma ação encontrada" : "Nenhuma ação neste recorte"}
              hint={
                busca
                  ? "Ajuste a busca ou a situação."
                  : "As ações atribuídas ao seu contexto aparecerão aqui."
              }
            />
          )}
          <ul className="space-y-2">
            {q.data?.rows.map((a) => (
              <li key={a.id}>
                <button
                  aria-pressed={sel?.id === a.id}
                  onClick={() => select(a)}
                  className="w-full rounded-md border border-border p-4 text-left hover:bg-accent focus-visible:outline-2"
                >
                  <span className="block break-words font-medium">{a.titulo}</span>
                  <span className="mt-2 block text-sm text-muted-foreground">
                    {estados[a.estado]} · prioridade {a.prioridade} ·{" "}
                    {a.prazo ? `prazo ${a.prazo.split("-").reverse().join("/")}` : "Sem prazo"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {q.data && <Pagination page={pagina} total={q.data.total} onChange={setPagina} />}
        </Section>
        <div
          ref={detail}
          tabIndex={-1}
          className="scroll-mt-20 outline-none"
          role="region"
          aria-label="Detalhe da ação selecionada"
        >
          <Section title={sel?.titulo ?? "Detalhe da ação"}>
            {selectedId && focused.isPending ? (
              <LoadingState label="Abrindo ação vinculada…" />
            ) : selectedId && focused.isError ? (
              <ErrorState error={focused.error} onRetry={() => focused.refetch()} />
            ) : !sel ? (
              <p className="text-sm text-muted-foreground">
                Selecione uma ação para ver o problema e o próximo passo.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm">
                  {estados[sel.estado]} · versão {sel.version}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {sel.descricao || "Sem descrição adicional."}
                </p>
                {sel.conclusao && (
                  <div className="rounded border border-border p-3 text-sm">
                    <h3 className="font-medium">Resultado informado</h3>
                    <p className="whitespace-pre-wrap">{sel.conclusao}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {sel.estado === "aberta" && canExecute && (
                    <ActionButton
                      onClick={() => {
                        chooseNext("em_execucao");
                      }}
                    >
                      Iniciar ação
                    </ActionButton>
                  )}
                  {sel.estado === "em_execucao" && canExecute && (
                    <ActionButton
                      onClick={() => {
                        chooseNext("aguardando_verificacao");
                      }}
                    >
                      Enviar para verificação
                    </ActionButton>
                  )}
                  {sel.estado === "aguardando_verificacao" && canReview && (
                    <>
                      <ActionButton
                        onClick={() => {
                          chooseNext("concluida");
                        }}
                      >
                        Verificar e concluir
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        onClick={() => {
                          chooseNext("em_execucao");
                        }}
                      >
                        Devolver para correção
                      </ActionButton>
                    </>
                  )}
                  {canManage && !["concluida", "cancelada"].includes(sel.estado) && (
                    <ActionButton
                      variant="danger"
                      onClick={() => {
                        chooseNext("cancelada");
                      }}
                    >
                      Cancelar ação
                    </ActionButton>
                  )}
                </div>
                <RecordFiles
                  pai={{ organization_id: orgId, acao_id: sel.id }}
                  readOnly={["concluida", "cancelada"].includes(sel.estado)}
                  key={sel.id}
                />
              </div>
            )}
          </Section>
        </div>
      </div>
      <OperationalDialog title="Nova ação operacional" open={nova} onOpenChange={setNova}>
        <AcaoForm
          orgId={orgId}
          onSaved={async (a) => {
            setSel(a);
            onSelect?.(a.id);
            setNova(false);
            await qc.invalidateQueries({ queryKey: ["acoes-operacionais", orgId] });
          }}
        />
      </OperationalDialog>
      <OperationalDialog
        title={
          next === "cancelada"
            ? `Cancelar: ${sel?.titulo ?? "ação"}`
            : "Registrar mudança de estado"
        }
        open={next !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setNext(null);
        }}
      >
        <form
          data-dirty={!!motivo}
          aria-busy={saving}
          onSubmit={(event) => {
            event.preventDefault();
            void transicionar();
          }}
        >
          <p className="mb-3 text-sm">
            {next === "cancelada"
              ? "O cancelamento preserva o registro e o histórico. Informe por que este trabalho não será realizado."
              : `Próximo estado: ${next ? estados[next] : ""}. Evidência e autorização serão conferidas no servidor.`}
          </p>
          <label className="text-sm">
            Resultado ou justificativa
            <textarea
              id={transitionId}
              className={`${fieldClass} mt-1 min-h-28`}
              aria-invalid={!!erro}
              aria-describedby={erro ? `${transitionId}-error` : undefined}
              maxLength={10000}
              disabled={saving}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          {erro && (
            <p id={`${transitionId}-error`} role="alert" className="my-3 text-sm text-destructive">
              {erro}
            </p>
          )}
          {refreshed && (
            <p role="status" className="my-3 text-sm">
              {refreshed}
            </p>
          )}
          <ActionButton type="submit" loading={saving} className="mt-4">
            Confirmar mudança
          </ActionButton>
          {erro?.includes("Recarregue") && (
            <ActionButton
              variant="ghost"
              onClick={async () => {
                if (!sel) return;
                try {
                  const current = await obterAcao({ data: { organization_id: orgId, id: sel.id } });
                  setSel(current);
                  setTransitionBase(current);
                  setErro(null);
                  setRefreshed(
                    `Registro recarregado: ${estados[current.estado]}, versão ${current.version}. Confira a situação antes de confirmar; sua justificativa foi mantida.`,
                  );
                } catch (error) {
                  setErro(error instanceof Error ? error.message : "Registro indisponível.");
                }
              }}
            >
              Recarregar registro mantendo justificativa
            </ActionButton>
          )}
        </form>
      </OperationalDialog>
    </div>
  );
}

function AcaoForm({
  orgId,
  onSaved,
}: {
  orgId: string;
  onSaved: (a: AcaoOperacional) => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pagina, setPagina] = useState(0);
  const [chosen, setChosen] = useState<{ id: string; nome: string } | null>(null);
  const fieldPrefix = useId();
  const [erro, setErro] = useState<string | null>(null);
  const keyFor = useCommandKey();
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(busca);
      setPagina(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [busca]);
  const pessoas = useQuery({
    queryKey: ["pessoas", orgId, "seletor", debounced, pagina],
    queryFn: ({ signal }) =>
      listarPessoas({
        data: { organization_id: orgId, busca: debounced, pagina, arquivados: false },
        signal,
      }),
  });
  const f = useForm<z.input<typeof acaoDados>, unknown, z.output<typeof acaoDados>>({
    resolver: zodResolver(acaoDados),
    defaultValues: {
      titulo: "",
      descricao: "",
      responsavel_id: "",
      prazo: "",
      prioridade: "normal",
      exige_verificacao: true,
    },
  });
  const fieldLabels: Record<string, string> = {
    titulo: "Título",
    descricao: "Problema e resultado esperado",
    responsavel_id: "Responsável principal",
    prazo: "Prazo",
    prioridade: "Prioridade",
  };
  const fieldError = (name: keyof z.input<typeof acaoDados>) =>
    f.formState.errors[name] ? (
      <p id={`${fieldPrefix}-${name}-error`} className="text-sm text-destructive">
        {f.formState.errors[name]?.message}
      </p>
    ) : null;
  return (
    <form
      noValidate
      data-dirty={f.formState.isDirty}
      aria-busy={f.formState.isSubmitting}
      className="space-y-4"
      onSubmit={f.handleSubmit(async (dados) => {
        setErro(null);
        const payload = { organization_id: orgId, dados, id: null, expected_version: null };
        try {
          await onSaved(await salvarAcao({ data: { ...payload, chave: keyFor(payload) } }));
        } catch (e) {
          setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
        }
      })}
    >
      {Object.keys(f.formState.errors).length > 0 && (
        <div
          role="alert"
          className="rounded border border-destructive/40 p-3 text-sm text-destructive"
        >
          <p>Confira os campos indicados antes de criar a ação:</p>
          <ul>
            {Object.entries(f.formState.errors).map(([name, error]) => (
              <li key={name}>
                <a
                  href={`#${fieldPrefix}-${name}`}
                  onClick={(event) => {
                    event.preventDefault();
                    f.setFocus(name as keyof z.input<typeof acaoDados>);
                  }}
                >
                  {fieldLabels[name] || name}: {error?.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <fieldset disabled={f.formState.isSubmitting} className="space-y-4">
        <label className="block text-sm">
          Título *
          <input
            id={`${fieldPrefix}-titulo`}
            required
            maxLength={200}
            className={fieldClass}
            {...f.register("titulo")}
            aria-invalid={!!f.formState.errors.titulo}
            aria-describedby={f.formState.errors.titulo ? `${fieldPrefix}-titulo-error` : undefined}
          />
          {fieldError("titulo")}
        </label>
        <label className="block text-sm">
          Problema e resultado esperado
          <textarea
            id={`${fieldPrefix}-descricao`}
            maxLength={10000}
            className={`${fieldClass} min-h-24`}
            {...f.register("descricao")}
            aria-invalid={!!f.formState.errors.descricao}
            aria-describedby={
              f.formState.errors.descricao ? `${fieldPrefix}-descricao-error` : undefined
            }
          />
          {fieldError("descricao")}
        </label>
        <label className="block text-sm">
          Buscar pessoa
          <input
            type="search"
            maxLength={120}
            className={fieldClass}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Responsável principal *
          <select
            id={`${fieldPrefix}-responsavel_id`}
            required
            disabled={pessoas.isPending || pessoas.isError}
            className={fieldClass}
            {...f.register("responsavel_id", {
              onChange: (event) => {
                const selected = pessoas.data?.rows.find(
                  (person) => person.id === event.target.value,
                );
                if (selected) setChosen({ id: selected.id, nome: selected.nome });
                else setChosen(null);
              },
            })}
            aria-invalid={!!f.formState.errors.responsavel_id}
            aria-describedby={
              f.formState.errors.responsavel_id ? `${fieldPrefix}-responsavel_id-error` : undefined
            }
          >
            <option value="">Selecione uma pessoa</option>
            {chosen && !pessoas.data?.rows.some((person) => person.id === chosen.id) && (
              <option value={chosen.id}>{chosen.nome}</option>
            )}
            {pessoas.data?.rows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} · {p.funcao || p.vinculo}
              </option>
            ))}
          </select>
          {fieldError("responsavel_id")}
        </label>
        {pessoas.isError && <ErrorState error={pessoas.error} onRetry={() => pessoas.refetch()} />}
        {pessoas.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Consultando pessoas…
          </p>
        )}
        {pessoas.data && (
          <>
            <p className="text-xs text-muted-foreground">
              {pessoas.data.total} pessoa(s) neste recorte. Busque pelo nome para localizar o
              responsável.
            </p>
            <Pagination page={pagina} total={pessoas.data.total} onChange={setPagina} />
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Prazo
            <input
              id={`${fieldPrefix}-prazo`}
              type="date"
              className={fieldClass}
              {...f.register("prazo")}
              aria-invalid={!!f.formState.errors.prazo}
              aria-describedby={f.formState.errors.prazo ? `${fieldPrefix}-prazo-error` : undefined}
            />
            {fieldError("prazo")}
          </label>
          <label className="text-sm">
            Prioridade
            <select
              id={`${fieldPrefix}-prioridade`}
              className={fieldClass}
              {...f.register("prioridade")}
              aria-invalid={!!f.formState.errors.prioridade}
              aria-describedby={
                f.formState.errors.prioridade ? `${fieldPrefix}-prioridade-error` : undefined
              }
            >
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
            {fieldError("prioridade")}
          </label>
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        A conclusão exige evidência e verificação por outra pessoa autorizada. Ação sem horário
        permanece na fila de trabalho.
      </p>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <ActionButton
        disabled={pessoas.isError || pessoas.isPending}
        loading={f.formState.isSubmitting}
        type="submit"
      >
        Criar ação
      </ActionButton>
    </form>
  );
}
