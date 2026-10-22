import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  ActionButton,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { pessoaDados, type Pessoa, type salvarPessoaInput } from "./schemas";
import { listarPessoas, obterPessoa, salvarPessoa } from "./operacao.functions";
import { fieldClass, OperationalDialog, Pagination, useCommandKey } from "./components";
import { RecordFiles } from "./RecordFiles";
import { useOperationalAccess, type OperationalAccess } from "./access";
import { captureOperationalContinuation } from "./continuation";
import { acessoPessoaNegado, PESSOA_ACESSO_INDISPONIVEL } from "./pessoas-domain";

export type PessoasSearch = { busca: string; pagina: number; arquivadas: boolean; pessoa: string };
const personKey = (org: string, id: string) => ["pessoas", org, "ficha", id] as const;
const freshness = {
  staleTime: 30_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: "always" as const,
  retry: false,
};

export function PessoasWorkspace({
  search,
  onSearch,
}: {
  search: PessoasSearch;
  onSearch: (patch: Partial<PessoasSearch>) => void;
}) {
  const org = useOrg();
  const access = useOperationalAccess(org.data?.orgId ?? "", org.data?.userId ?? "");
  if (org.isPending || access.isPending)
    return <LoadingState label="Conferindo acesso operacional…" />;
  if (org.isError || access.isError || !org.data)
    return (
      <ErrorState
        error={org.error || access.error || new Error("Sessão indisponível.")}
        onRetry={async () => {
          const current = await org.refetch();
          if (!current.isError) await access.refetch();
        }}
      />
    );
  return (
    <PessoasContent
      key={`${org.data.userId}:${org.data.orgId}:${JSON.stringify(access.data)}`}
      orgId={org.data.orgId}
      userId={org.data.userId}
      access={access.data}
      search={search}
      onSearch={onSearch}
    />
  );
}

function PessoasContent({
  orgId,
  userId,
  access,
  search,
  onSearch,
}: {
  orgId: string;
  userId: string;
  access: OperationalAccess;
  search: PessoasSearch;
  onSearch: (patch: Partial<PessoasSearch>) => void;
}) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState(search.busca);
  const [form, setForm] = useState<Pessoa | "nova" | null>(null);
  const [boundaryError, setBoundaryError] = useState<unknown>(null);
  const [saved, setSaved] = useState("");
  const feedback = useRef<HTMLDivElement>(null),
    ficha = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null),
    listTrigger = useRef<HTMLElement | null>(null);
  const currentForm = useRef(form);
  currentForm.current = form;
  const lifecycle = useRef({ active: false, generation: 0 });
  useEffect(() => {
    const scope = lifecycle.current;
    scope.active = true;
    scope.generation += 1;
    return () => {
      scope.active = false;
      scope.generation += 1;
    };
  }, []);
  const continuation = () => {
    const generation = lifecycle.current.generation;
    return captureOperationalContinuation(
      qc,
      ["operacao-acesso", orgId, userId],
      () => lifecycle.current.active && lifecycle.current.generation === generation,
    );
  };
  useEffect(() => {
    const timer = setTimeout(() => setBusca(search.busca), 300);
    return () => clearTimeout(timer);
  }, [search.busca]);
  const q = useQuery({
    queryKey: ["pessoas", orgId, "lista", busca, search.pagina, search.arquivadas],
    queryFn: ({ signal }) =>
      listarPessoas({
        data: {
          organization_id: orgId,
          busca,
          pagina: search.pagina,
          arquivados: search.arquivadas,
        },
        signal,
      }),
    ...freshness,
  });
  const detail = useQuery({
    queryKey: personKey(orgId, search.pessoa),
    enabled: !!search.pessoa,
    queryFn: ({ signal }) =>
      obterPessoa({ data: { organization_id: orgId, id: search.pessoa }, signal }),
    ...freshness,
  });
  const denied =
    acessoPessoaNegado(q.error) ||
    acessoPessoaNegado(detail.error) ||
    acessoPessoaNegado(boundaryError);
  const selected = !denied && !detail.isError ? detail.data : undefined;
  const canManage = access.gerirEquipe && !denied;
  useEffect(() => {
    if (denied) {
      setForm(null);
      requestAnimationFrame(() => {
        const alert = feedback.current?.querySelector<HTMLElement>('[role="alert"]');
        if (alert) {
          alert.tabIndex = -1;
          alert.focus();
        }
      });
    }
  }, [denied]);
  useEffect(() => {
    if (selected?.id && innerWidth < 1280)
      requestAnimationFrame(() => {
        ficha.current?.scrollIntoView({ block: "start", behavior: "auto" });
        ficha.current?.focus({ preventScroll: true });
      });
  }, [selected?.id]);
  const selectPessoa = (p: Pessoa) => {
    if (document.activeElement instanceof HTMLElement) listTrigger.current = document.activeElement;
    setBoundaryError(null);
    setSaved("");
    onSearch({ pessoa: p.id });
  };
  const back = () => {
    onSearch({ pessoa: "" });
    setBoundaryError(null);
    requestAnimationFrame(() => {
      (listTrigger.current?.isConnected ? listTrigger.current : list.current)?.focus();
    });
  };
  async function retryAccess() {
    const [a, b] = await Promise.all([
      q.refetch(),
      search.pessoa ? detail.refetch() : Promise.resolve(null),
    ]);
    if (!a.isError && !b?.isError) setBoundaryError(null);
  }
  async function save(command: z.output<typeof salvarPessoaInput>) {
    const current = continuation();
    try {
      const p = await salvarPessoa({ data: command });
      if (!current()) return false;
      qc.setQueryData(personKey(orgId, p.id), p);
      setForm(null);
      setBoundaryError(null);
      setSaved("Cadastro confirmado no servidor.");
      onSearch({ pessoa: p.id });
      await qc.invalidateQueries({ queryKey: ["pessoas", orgId] });
      return true;
    } catch (failure) {
      if (current() && acessoPessoaNegado(failure)) setBoundaryError(failure);
      throw failure;
    }
  }
  async function comparePerson(id: string) {
    const current = continuation(),
      editor = currentForm.current;
    try {
      const p = await obterPessoa({ data: { organization_id: orgId, id } });
      return current() && currentForm.current === editor ? p : undefined;
    } catch (failure) {
      if (current() && currentForm.current === editor && acessoPessoaNegado(failure))
        setBoundaryError(failure);
      throw failure;
    }
  }
  return (
    <div className="space-y-5 min-w-0">
      <PageHeader
        eyebrow="Recursos"
        title="Pessoas e competências"
        description="Identidade, vínculo profissional e evidências para o trabalho técnico."
        actions={
          !search.pessoa &&
          canManage && (
            <ActionButton
              onClick={() => {
                setBoundaryError(null);
                setForm("nova");
              }}
            >
              Nova pessoa
            </ActionButton>
          )
        }
      />
      {saved && !denied && (
        <p role="status" className="rounded border border-primary/40 p-3 text-sm">
          {saved}
        </p>
      )}
      <div ref={feedback} tabIndex={-1}>
        {denied ? (
          <ErrorState
            error={
              boundaryError || q.error || detail.error || new Error(PESSOA_ACESSO_INDISPONIVEL)
            }
            onRetry={retryAccess}
          />
        ) : (
          <>
            <div className={`flex-wrap gap-3 ${search.pessoa ? "hidden xl:flex" : "flex"}`}>
              <label className="min-w-0 flex-1 text-sm">
                Buscar pessoa
                <input
                  type="search"
                  maxLength={120}
                  className={fieldClass}
                  value={search.busca}
                  onChange={(event) => onSearch({ busca: event.target.value, pagina: 0 })}
                  placeholder="Nome"
                />
              </label>
              <label className="text-sm">
                Situação
                <select
                  className={fieldClass}
                  value={String(search.arquivadas)}
                  onChange={(event) =>
                    onSearch({ arquivadas: event.target.value === "true", pagina: 0 })
                  }
                >
                  <option value="false">Ativas</option>
                  <option value="true">Arquivadas</option>
                </select>
              </label>
            </div>
            <div
              className={`mt-4 grid min-w-0 gap-4 ${search.pessoa ? "xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]" : ""}`}
            >
              <div
                ref={list}
                tabIndex={-1}
                className={search.pessoa ? "hidden min-w-0 xl:block" : "min-w-0"}
              >
                <Section
                  title="Pessoas"
                  description="Cadastrar uma pessoa não concede acesso ao sistema."
                >
                  {q.isPending ? (
                    <LoadingState label="Consultando pessoas…" />
                  ) : q.isError ? (
                    <ErrorState error={q.error} onRetry={() => q.refetch()} />
                  ) : (
                    q.data && (
                      <>
                        {!q.data.rows.length ? (
                          <EmptyState
                            title={
                              search.busca
                                ? "Nenhuma pessoa encontrada"
                                : "Nenhuma pessoa neste recorte"
                            }
                            hint={
                              search.busca
                                ? "Ajuste a busca ou limpe os filtros."
                                : canManage
                                  ? "Cadastre a pessoa que será alocada ao trabalho."
                                  : "Seu perfil consulta apenas pessoas autorizadas."
                            }
                            action={
                              canManage && !search.busca ? (
                                <ActionButton onClick={() => setForm("nova")}>
                                  Nova pessoa
                                </ActionButton>
                              ) : undefined
                            }
                          />
                        ) : (
                          <>
                            <ul aria-label="Pessoas operacionais" className="grid gap-3 md:hidden">
                              {q.data.rows.map((p) => (
                                <li key={p.id} className="rounded border border-border p-3 text-sm">
                                  <button
                                    className="min-h-11 w-full break-words text-left font-semibold underline decoration-muted-foreground/40 underline-offset-4"
                                    onClick={() => selectPessoa(p)}
                                  >
                                    {p.nome}
                                  </button>
                                  <p className="mt-1 break-words">
                                    {p.funcao || "Função não informada"}
                                  </p>
                                  <p className="mt-2 text-muted-foreground">
                                    {p.vinculo === "prestador"
                                      ? "Prestador"
                                      : p.vinculo === "parceiro"
                                        ? "Parceiro"
                                        : "Colaborador"}{" "}
                                    · {p.user_id ? "Usuário vinculado" : "Sem login"}
                                  </p>
                                </li>
                              ))}
                            </ul>
                            <div className="hidden md:block">
                              <DataTable
                                rows={q.data.rows}
                                getRowId={(p) => p.id}
                                selectedId={search.pessoa || null}
                                onRowClick={selectPessoa}
                                label="Pessoas operacionais"
                                columns={[
                                  {
                                    key: "nome",
                                    label: "Pessoa",
                                    render: (p) => <span className="font-medium">{p.nome}</span>,
                                  },
                                  {
                                    key: "funcao",
                                    label: "Função",
                                    render: (p) => p.funcao || "Não informada",
                                  },
                                  { key: "vinculo", label: "Vínculo" },
                                  {
                                    key: "user_id",
                                    label: "Acesso",
                                    render: (p) => (p.user_id ? "Usuário vinculado" : "Sem login"),
                                  },
                                ]}
                              />
                            </div>
                          </>
                        )}
                        <Pagination
                          page={search.pagina}
                          total={q.data.total}
                          onChange={(pagina) => onSearch({ pagina })}
                        />
                      </>
                    )
                  )}
                </Section>
              </div>
              {search.pessoa && (
                <div
                  ref={ficha}
                  tabIndex={-1}
                  className="min-w-0 scroll-mt-20 outline-none"
                  role="region"
                  aria-label="Ficha da pessoa selecionada"
                >
                  <ActionButton variant="ghost" onClick={back} className="mb-3">
                    Voltar à lista de pessoas
                  </ActionButton>
                  {detail.isPending ? (
                    <LoadingState label="Consultando ficha e acesso atual…" />
                  ) : detail.isError ? (
                    <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
                  ) : (
                    selected && (
                      <Section title={selected.nome}>
                        <div className="space-y-4">
                          <dl className="grid gap-3 text-sm">
                            <div>
                              <dt className="text-muted-foreground">Função</dt>
                              <dd>{selected.funcao || "Não informada"}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Contato profissional</dt>
                              <dd className="break-all">
                                {selected.email_profissional || "E-mail não informado"}
                              </dd>
                              <dd>{selected.telefone_profissional || "Telefone não informado"}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Situação</dt>
                              <dd>
                                {selected.ativa ? "Ativa" : "Arquivada"} · versão {selected.version}
                              </dd>
                            </div>
                          </dl>
                          {canManage && (
                            <ActionButton variant="ghost" onClick={() => setForm(selected)}>
                              Editar cadastro e situação
                            </ActionButton>
                          )}
                          <RecordFiles
                            key={selected.id}
                            pai={{ organization_id: orgId, pessoa_id: selected.id }}
                          />
                        </div>
                      </Section>
                    )
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <OperationalDialog
        title={form === "nova" ? "Nova pessoa" : "Editar pessoa"}
        open={form !== null && !denied}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
      >
        {form && !denied && (
          <PessoaForm
            key={form === "nova" ? "nova" : form.id}
            pessoa={form === "nova" ? null : form}
            orgId={orgId}
            onSave={save}
            onCompare={comparePerson}
          />
        )}
      </OperationalDialog>
    </div>
  );
}

function PessoaForm({
  pessoa,
  orgId,
  onSave,
  onCompare,
}: {
  pessoa: Pessoa | null;
  orgId: string;
  onSave: (command: z.output<typeof salvarPessoaInput>) => Promise<boolean>;
  onCompare: (id: string) => Promise<Pessoa | undefined>;
}) {
  const keyFor = useCommandKey();
  const fieldPrefix = useId();
  const [erro, setErro] = useState<string | null>(null);
  const [latest, setLatest] = useState<Pessoa | null>(null);
  const [version, setVersion] = useState(pessoa?.version ?? null);
  const submitLock = useRef(false);
  const [comparing, setComparing] = useState(false);
  const f = useForm<z.input<typeof pessoaDados>, unknown, z.output<typeof pessoaDados>>({
    resolver: zodResolver(pessoaDados),
    defaultValues: pessoa
      ? {
          ...pessoa,
          funcao: pessoa.funcao ?? "",
          email_profissional: pessoa.email_profissional ?? "",
          telefone_profissional: pessoa.telefone_profissional ?? "",
          registro_profissional: pessoa.registro_profissional ?? "",
        }
      : {
          nome: "",
          vinculo: "colaborador",
          funcao: "",
          email_profissional: "",
          telefone_profissional: "",
          registro_profissional: "",
          user_id: null,
          ativa: true,
        },
  });
  return (
    <form
      noValidate
      data-dirty={f.formState.isDirty}
      aria-busy={f.formState.isSubmitting}
      className="space-y-4"
      onSubmit={f.handleSubmit(async (dados) => {
        if (submitLock.current) return;
        submitLock.current = true;
        setErro(null);
        try {
          const payload = {
            organization_id: orgId,
            dados,
            id: pessoa?.id ?? null,
            expected_version: version,
          };
          await onSave({ ...payload, chave: keyFor(payload) });
        } catch (e) {
          setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
        } finally {
          submitLock.current = false;
        }
      })}
    >
      {Object.keys(f.formState.errors).length > 0 && (
        <div
          role="alert"
          className="rounded border border-destructive/40 p-3 text-sm text-destructive"
        >
          <p>Confira os campos indicados antes de salvar.</p>
          <ul>
            {Object.entries(f.formState.errors).map(([name, error]) => (
              <li key={name}>
                <a
                  href={`#${fieldPrefix}-${name}`}
                  onClick={(event) => {
                    event.preventDefault();
                    f.setFocus(name as keyof z.input<typeof pessoaDados>);
                  }}
                >
                  {error?.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <fieldset disabled={f.formState.isSubmitting} className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["nome", "Nome completo"],
            ["funcao", "Função"],
            ["email_profissional", "E-mail profissional"],
            ["telefone_profissional", "Telefone profissional"],
            ["registro_profissional", "Registro profissional (quando aplicável)"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className={`text-sm ${name === "nome" ? "sm:col-span-2" : ""}`}>
            {label}
            {name === "nome" ? " *" : ""}
            <input
              id={`${fieldPrefix}-${name}`}
              className={fieldClass}
              {...f.register(name)}
              aria-label={label}
              aria-required={name === "nome"}
              aria-invalid={!!f.formState.errors[name]}
              aria-describedby={
                f.formState.errors[name] ? `${fieldPrefix}-${name}-error` : undefined
              }
            />
            {f.formState.errors[name] && (
              <span id={`${fieldPrefix}-${name}-error`} className="text-destructive">
                {f.formState.errors[name]?.message}
              </span>
            )}
          </label>
        ))}
        <label className="text-sm">
          Vínculo
          <select className={fieldClass} {...f.register("vinculo")}>
            <option value="colaborador">Colaborador</option>
            <option value="prestador">Prestador</option>
            <option value="parceiro">Parceiro</option>
          </select>
        </label>
        {pessoa && (
          <label className="text-sm">
            Situação
            <select
              className={fieldClass}
              {...f.register("ativa", { setValueAs: (v) => v === true || v === "true" })}
            >
              <option value="true">Ativa</option>
              <option value="false">Arquivada</option>
            </select>
          </label>
        )}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        O registro profissional informado não substitui conferência de habilitação ou
        responsabilidade técnica.
      </p>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {erro && pessoa && (
        <ActionButton
          variant="ghost"
          loading={comparing}
          onClick={async () => {
            setComparing(true);
            setLatest(null);
            try {
              const current = await onCompare(pessoa.id);
              if (current) setLatest(current);
            } catch (error) {
              setErro(error instanceof Error ? error.message : "Registro indisponível.");
            } finally {
              setComparing(false);
            }
          }}
        >
          Comparar com a versão salva
        </ActionButton>
      )}
      {latest && (
        <section
          className="space-y-2 rounded border border-border p-3 text-sm"
          aria-label="Versão atual da pessoa"
        >
          <h3 className="font-medium">Versão salva {latest.version}</h3>
          <p>
            {latest.nome} · {latest.funcao || "Função não informada"}
          </p>
          <p>
            {latest.email_profissional || "E-mail não informado"} ·{" "}
            {latest.telefone_profissional || "Telefone não informado"}
          </p>
          <p>{latest.ativa ? "Ativa" : "Arquivada"}</p>
          <p>Seu preenchimento permanece no formulário até você optar por recarregá-lo.</p>
          <ActionButton
            variant="ghost"
            onClick={() => {
              f.reset({
                ...latest,
                funcao: latest.funcao ?? "",
                email_profissional: latest.email_profissional ?? "",
                telefone_profissional: latest.telefone_profissional ?? "",
                registro_profissional: latest.registro_profissional ?? "",
              });
              setVersion(latest.version);
              setLatest(null);
              setErro(null);
            }}
          >
            Recarregar campos com a versão salva
          </ActionButton>
        </section>
      )}
      <ActionButton type="submit" loading={f.formState.isSubmitting}>
        Salvar pessoa
      </ActionButton>
    </form>
  );
}
