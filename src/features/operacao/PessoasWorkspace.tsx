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
import { useOrg, useOrgId } from "@/features/org/session";
import { pessoaDados, type Pessoa } from "./schemas";
import { listarPessoas, obterPessoa, salvarPessoa } from "./operacao.functions";
import { fieldClass, OperationalDialog, Pagination, useCommandKey } from "./components";
import { RecordFiles } from "./RecordFiles";
import { useOperationalAccess, type OperationalAccess } from "./access";

export function PessoasWorkspace() {
  const org = useOrg();
  const access = useOperationalAccess(org.data?.orgId ?? "", org.data?.userId ?? "");
  if (access.isPending) return <LoadingState label="Conferindo acesso operacional…" />;
  if (access.isError) return <ErrorState error={access.error} onRetry={() => access.refetch()} />;
  return (
    <PessoasContent
      key={`${org.data?.userId}:${org.data?.orgId}:${org.data?.roles.slice().sort().join(",")}:${JSON.stringify(access.data)}`}
      access={access.data}
    />
  );
}

function PessoasContent({ access }: { access: OperationalAccess }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [arquivados, setArquivados] = useState(false);
  const [selected, setSelected] = useState<Pessoa | null>(null);
  const [form, setForm] = useState<Pessoa | "nova" | null>(null);
  const canManage = access.gerirEquipe;
  const ficha = useRef<HTMLDivElement>(null);
  const listTrigger = useRef<HTMLElement | null>(null);
  const selectPessoa = (p: Pessoa) => {
    if (document.activeElement instanceof HTMLElement) listTrigger.current = document.activeElement;
    setSelected(p);
    requestAnimationFrame(() => {
      if (window.innerWidth < 1280) {
        ficha.current?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
        ficha.current?.focus({ preventScroll: true });
      }
    });
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setBusca(search);
      setPagina(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const q = useQuery({
    queryKey: ["pessoas", orgId, busca, pagina, arquivados],
    enabled: !!orgId,
    queryFn: ({ signal }) =>
      listarPessoas({ data: { organization_id: orgId, busca, pagina, arquivados }, signal }),
  });
  async function saved(p: Pessoa) {
    setForm(null);
    selectPessoa(p);
    await qc.invalidateQueries({ queryKey: ["pessoas", orgId] });
  }
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Recursos"
        title="Pessoas e competências"
        description="Identidade operacional, vínculo profissional e evidências privadas. Cadastrar uma pessoa não concede acesso ao sistema."
        actions={
          canManage && <ActionButton onClick={() => setForm("nova")}>Nova pessoa</ActionButton>
        }
      />
      <div className="flex flex-wrap gap-3">
        <label className="min-w-0 flex-1 text-sm">
          Buscar pessoa
          <input
            className={fieldClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome"
          />
        </label>
        <label className="text-sm">
          Situação
          <select
            className={fieldClass}
            value={String(arquivados)}
            onChange={(e) => {
              setArquivados(e.target.value === "true");
              setPagina(0);
            }}
          >
            <option value="false">Ativas</option>
            <option value="true">Arquivadas</option>
          </select>
        </label>
      </div>
      <div
        className={`grid min-w-0 gap-4 ${selected ? "xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]" : ""}`}
      >
        <Section title="Pessoas">
          {q.isPending && <p role="status">Consultando pessoas…</p>}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
          {q.data && !q.data.rows.length && (
            <EmptyState
              title="Nenhuma pessoa neste recorte"
              hint={
                canManage
                  ? "Cadastre uma pessoa ou ajuste a busca."
                  : "Seu perfil consulta apenas as pessoas autorizadas."
              }
            />
          )}
          {q.data && q.data.rows.length > 0 && (
            <DataTable
              rows={q.data.rows}
              getRowId={(p) => p.id}
              selectedId={selected?.id ?? null}
              onRowClick={selectPessoa}
              label="Pessoas operacionais"
              columns={[
                {
                  key: "nome",
                  label: "Pessoa",
                  render: (p) => <span className="font-medium">{p.nome}</span>,
                },
                { key: "funcao", label: "Função", render: (p) => p.funcao || "Não informada" },
                { key: "vinculo", label: "Vínculo" },
                {
                  key: "user_id",
                  label: "Acesso",
                  render: (p) => (p.user_id ? "Usuário vinculado" : "Sem login"),
                },
              ]}
            />
          )}
          {q.data && <Pagination page={pagina} total={q.data.total} onChange={setPagina} />}
        </Section>
        {selected && (
          <div
            ref={ficha}
            tabIndex={-1}
            className="scroll-mt-20 outline-none"
            role="region"
            aria-label="Ficha da pessoa selecionada"
          >
            <Section title={selected.nome}>
              <div className="space-y-4">
                <ActionButton
                  variant="ghost"
                  onClick={() => {
                    setSelected(null);
                    requestAnimationFrame(() => listTrigger.current?.focus());
                  }}
                >
                  Voltar à lista de pessoas
                </ActionButton>
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Função</dt>
                    <dd>{selected.funcao || "Não informada"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Contato profissional</dt>
                    <dd className="break-all">
                      {selected.email_profissional ||
                        selected.telefone_profissional ||
                        "Não informado"}
                    </dd>
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
          </div>
        )}
      </div>
      <OperationalDialog
        title={form === "nova" ? "Nova pessoa" : "Editar pessoa"}
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
      >
        {form && (
          <PessoaForm
            key={form === "nova" ? "nova" : form.id}
            pessoa={form === "nova" ? null : form}
            orgId={orgId}
            onSaved={saved}
          />
        )}
      </OperationalDialog>
    </div>
  );
}

function PessoaForm({
  pessoa,
  orgId,
  onSaved,
}: {
  pessoa: Pessoa | null;
  orgId: string;
  onSaved: (p: Pessoa) => Promise<void>;
}) {
  const keyFor = useCommandKey();
  const fieldPrefix = useId();
  const [erro, setErro] = useState<string | null>(null);
  const [latest, setLatest] = useState<Pessoa | null>(null);
  const [version, setVersion] = useState(pessoa?.version ?? null);
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
        setErro(null);
        try {
          const payload = {
            organization_id: orgId,
            dados,
            id: pessoa?.id ?? null,
            expected_version: version,
          };
          await onSaved(await salvarPessoa({ data: { ...payload, chave: keyFor(payload) } }));
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
          onClick={async () => {
            try {
              setLatest(await obterPessoa({ data: { organization_id: orgId, id: pessoa.id } }));
            } catch (error) {
              setErro(error instanceof Error ? error.message : "Registro indisponível.");
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
