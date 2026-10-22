import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, ErrorState } from "@/components/nexus/Page";
import {
  fieldClass,
  OperationalDialog,
  Pagination,
  useCommandKey,
} from "@/features/operacao/components";
import { buscarPessoasEquipe } from "./functions";
import { acessoEquipeNegado, periodoMembro, validarFimMembro } from "./domain";
import { encerrarMembroInput, salvarEquipeInput, vincularMembroInput } from "./schemas";
import type {
  EncerrarMembroCommand,
  EquipeDetalhe,
  MembroEquipe,
  SalvarEquipeCommand,
  VincularMembroCommand,
} from "./types";

export type EquipeEditor =
  | { tipo: "equipe"; base: EquipeDetalhe | null }
  | { tipo: "incluir"; base: EquipeDetalhe }
  | { tipo: "encerrar"; base: EquipeDetalhe; membro: MembroEquipe };
export type EquipeFormCommand =
  | { tipo: "equipe"; data: SalvarEquipeCommand }
  | { tipo: "incluir"; data: VincularMembroCommand }
  | { tipo: "encerrar"; data: EncerrarMembroCommand };

function PessoaPicker({
  org,
  value,
  label,
  initialLabel,
  required,
  disabled,
  error,
  onChange,
  onDenied,
}: {
  org: string;
  value: string;
  label: string;
  initialLabel: string;
  required: boolean;
  disabled: boolean;
  error: string | undefined;
  onChange: (id: string, nome: string) => void;
  onDenied: (error: unknown) => void;
}) {
  const uid = useId(),
    load = useServerFn(buscarPessoasEquipe);
  const [search, setSearch] = useState(""),
    [term, setTerm] = useState(""),
    [pagina, setPagina] = useState(0);
  const [selection, setSelection] = useState({ id: value, nome: initialLabel });
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPagina(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const q = useQuery({
    queryKey: ["pessoas", org, "equipes", "opcoes", term, pagina],
    enabled: !disabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    retry: false,
    queryFn: ({ signal }) => load({ data: { organization_id: org, busca: term, pagina }, signal }),
  });
  useEffect(() => {
    if (acessoEquipeNegado(q.error)) onDenied(q.error);
  }, [q.error, onDenied]);
  const rows = q.isError ? [] : (q.data?.rows ?? []);
  const selected = selection.id === value ? selection : { id: value, nome: initialLabel };
  const choices =
    value && !rows.some((p) => p.id === value)
      ? [{ ...selected, contexto: "Seleção atual" }, ...rows]
      : rows;
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={`${uid}-search`} className="grid gap-1 text-sm">
        Buscar {label.toLocaleLowerCase("pt-BR")}
        <input
          id={`${uid}-search`}
          type="search"
          className={fieldClass}
          value={search}
          maxLength={120}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nome da pessoa"
        />
      </label>
      <label htmlFor={`${uid}-select`} className="grid gap-1 text-sm">
        {label}
        {required ? " *" : ""}
        <select
          id={`${uid}-select`}
          name={required ? "pessoa_id" : "lider_id"}
          className={fieldClass}
          value={value}
          disabled={disabled || q.isError}
          aria-required={required}
          aria-invalid={!!error}
          aria-describedby={`${uid}-hint${error ? ` ${uid}-error` : ""}`}
          onChange={(e) => {
            const next = choices.find((p) => p.id === e.target.value);
            const p = next ?? { id: "", nome: "" };
            setSelection(p);
            onChange(p.id, p.nome);
          }}
        >
          <option value="">{required ? "Selecione uma pessoa" : "Sem líder definido"}</option>
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome || "Pessoa selecionada"}
              {p.contexto ? ` · ${p.contexto}` : ""}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p id={`${uid}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p id={`${uid}-hint`} role="status" className="text-xs text-muted-foreground">
        {q.isPending
          ? "Consultando pessoas autorizadas…"
          : q.isError
            ? "Não foi possível atualizar as pessoas."
            : !rows.length
              ? "Nenhuma pessoa ativa neste recorte. Ajuste a busca."
              : "Somente pessoas ativas da organização."}
      </p>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        q.data && <Pagination page={pagina} total={q.data.total} onChange={setPagina} />
      )}
    </div>
  );
}

export function EquipesForm({
  orgId,
  editor,
  execute,
  compare,
  onClose,
  onDenied,
}: {
  orgId: string;
  editor: EquipeEditor;
  execute: (command: EquipeFormCommand) => Promise<boolean>;
  compare: (id: string, pagina: number) => Promise<EquipeDetalhe | undefined>;
  onClose: () => void;
  onDenied: (error: unknown) => void;
}) {
  const [initial] = useState(editor),
    [base, setBase] = useState(editor.base);
  const uid = useId(),
    form = useRef<HTMLFormElement>(null),
    keyFor = useCommandKey();
  const [nome, setNome] = useState(initial.base?.equipe.nome ?? "");
  const [lider, setLider] = useState(initial.base?.equipe.lider_id ?? "");
  const [liderNome, setLiderNome] = useState(initial.base?.lider?.nome ?? "");
  const [ativa, setAtiva] = useState(initial.base?.equipe.ativa ?? true);
  const [pessoa, setPessoa] = useState(""),
    [pessoaNome, setPessoaNome] = useState("");
  const [inicio, setInicio] = useState(""),
    [fim, setFim] = useState(""),
    [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [comparing, setComparing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [failure, setFailure] = useState("");
  const [latest, setLatest] = useState<EquipeDetalhe | null>(null);
  const tipo = initial.tipo;
  const title =
    tipo === "equipe"
      ? initial.base
        ? "Editar equipe e situação"
        : "Nova equipe"
      : tipo === "incluir"
        ? "Incluir pessoa na equipe"
        : "Encerrar participação na equipe";
  const idFor = (name: string) => `${uid}-${name}`;
  const feedback = (name: string) =>
    errors[name] ? (
      <p id={`${idFor(name)}-error`} className="text-sm text-destructive">
        {errors[name]}
      </p>
    ) : null;
  const inputProps = (name: string) => ({
    id: idFor(name),
    name,
    className: fieldClass,
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `${idFor(name)}-error` : undefined,
  });
  const focusError = (name?: string) =>
    requestAnimationFrame(() => {
      const target = name ? form.current?.querySelector<HTMLElement>(`[name="${name}"]`) : null;
      (target ?? form.current?.querySelector<HTMLElement>('[data-form-error="true"]'))?.focus();
    });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFailure("");
    const common = { organization_id: orgId };
    const payload =
      tipo === "equipe"
        ? {
            ...common,
            id: base?.equipe.id ?? null,
            expected_version: base?.equipe.version ?? null,
            dados: { nome, lider_id: lider || null, ativa },
          }
        : tipo === "incluir"
          ? {
              ...common,
              equipe_id: initial.base!.equipe.id,
              pessoa_id: pessoa,
              inicio,
              fim: fim || null,
            }
          : { ...common, id: initial.tipo === "encerrar" ? initial.membro.id : "", fim, motivo };
    const raw = { ...payload, chave: keyFor(payload) };
    const parsed =
      tipo === "equipe"
        ? salvarEquipeInput.safeParse(raw)
        : tipo === "incluir"
          ? vincularMembroInput.safeParse(raw)
          : encerrarMembroInput.safeParse(raw);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const name = String(issue.path.at(-1) ?? "form");
        fields[name] ??= issue.message;
      }
      setErrors(fields);
      focusError(Object.keys(fields)[0]);
      return;
    }
    if (initial.tipo === "encerrar" && !validarFimMembro(initial.membro.inicio, fim)) {
      setErrors({ fim: "O fim não pode ser anterior ao início da participação." });
      focusError("fim");
      return;
    }
    setBusy(true);
    try {
      const command =
        tipo === "equipe"
          ? { tipo, data: salvarEquipeInput.parse(raw) }
          : tipo === "incluir"
            ? { tipo, data: vincularMembroInput.parse(raw) }
            : { tipo, data: encerrarMembroInput.parse(raw) };
      // O workspace fecha somente o editor que originou a operação, antes de
      // atualizar consultas. Um retorno tardio não pode fechar outro formulário.
      await execute(command);
    } catch (error) {
      if (acessoEquipeNegado(error)) onDenied(error);
      else {
        setFailure(
          error instanceof Error
            ? error.message
            : "Não foi possível confirmar. Seu preenchimento foi mantido.",
        );
        focusError();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <OperationalDialog
      title={title}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        ref={form}
        noValidate
        data-dirty={dirty}
        aria-busy={busy || comparing}
        className="space-y-4"
        onSubmit={save}
        onChange={(event) => {
          const target = event.target;
          if (
            (target instanceof HTMLInputElement ||
              target instanceof HTMLSelectElement ||
              target instanceof HTMLTextAreaElement) &&
            target.name
          )
            setDirty(true);
        }}
      >
        {Object.keys(errors).length > 0 && (
          <div
            role="alert"
            data-form-error="true"
            tabIndex={-1}
            className="rounded border border-destructive p-3 text-sm"
          >
            <p>Confira os campos indicados antes de salvar.</p>
            <ul>
              {Object.entries(errors).map(([name, text]) => (
                <li key={name}>
                  <a
                    href={`#${idFor(name)}`}
                    className="underline"
                    onClick={(e) => {
                      e.preventDefault();
                      focusError(name);
                    }}
                  >
                    {text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {failure && (
          <div
            role="alert"
            data-form-error="true"
            tabIndex={-1}
            className="rounded border border-destructive p-3 text-sm"
          >
            <p>{failure}</p>
            <p className="mt-1">
              O preenchimento foi mantido. Repetir o mesmo conteúdo recupera a mesma operação.
            </p>
          </div>
        )}
        <fieldset disabled={busy || comparing} className="grid min-w-0 gap-4">
          {tipo === "equipe" ? (
            <>
              <div className="grid gap-1 text-sm">
                <label htmlFor={idFor("nome")}>Nome da equipe *</label>
                <input
                  {...inputProps("nome")}
                  required
                  maxLength={120}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
                {feedback("nome")}
              </div>
              <PessoaPicker
                org={orgId}
                label="Líder da equipe"
                value={lider}
                initialLabel={liderNome}
                required={false}
                disabled={busy || comparing}
                error={errors["lider_id"]}
                onDenied={onDenied}
                onChange={(id, label) => {
                  setLider(id);
                  setLiderNome(label);
                  setDirty(true);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Definir líder não cria participação. Inclua a pessoa com sua vigência quando ela
                também integrar a equipe.
              </p>
              {initial.base && (
                <div className="grid gap-1 text-sm">
                  <label htmlFor={idFor("ativa")}>Situação</label>
                  <select
                    {...inputProps("ativa")}
                    value={String(ativa)}
                    onChange={(e) => setAtiva(e.target.value === "true")}
                  >
                    <option value="true">Ativa</option>
                    <option value="false">Arquivada</option>
                  </select>
                  {feedback("ativa")}
                </div>
              )}
              {!ativa && (
                <p className="rounded border border-border p-3 text-sm">
                  Arquivar impede novas inclusões. Os membros e períodos anteriores continuam
                  preservados.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="rounded border border-border p-3 text-sm">
                <p className="font-medium">{initial.base!.equipe.nome}</p>
                {initial.tipo === "encerrar" && (
                  <>
                    <p>{initial.membro.pessoa_nome || "Pessoa autorizada no vínculo"}</p>
                    <p className="text-muted-foreground">
                      {periodoMembro(initial.membro.inicio, initial.membro.fim)}
                    </p>
                  </>
                )}
              </div>
              {tipo === "incluir" && (
                <>
                  <PessoaPicker
                    org={orgId}
                    label="Pessoa"
                    value={pessoa}
                    initialLabel={pessoaNome}
                    required
                    disabled={busy || comparing}
                    error={errors["pessoa_id"]}
                    onDenied={onDenied}
                    onChange={(id, label) => {
                      setPessoa(id);
                      setPessoaNome(label);
                      setDirty(true);
                    }}
                  />
                  <div className="grid gap-1 text-sm">
                    <label htmlFor={idFor("inicio")}>Primeiro dia da participação *</label>
                    <input
                      {...inputProps("inicio")}
                      type="date"
                      required
                      value={inicio}
                      onChange={(e) => setInicio(e.target.value)}
                    />
                    {feedback("inicio")}
                  </div>
                </>
              )}
              <div className="grid gap-1 text-sm">
                <label htmlFor={idFor("fim")}>
                  Último dia da participação{tipo === "encerrar" ? " *" : " (opcional)"}
                </label>
                <input
                  {...inputProps("fim")}
                  aria-describedby={`${idFor("fim")}-hint${errors["fim"] ? ` ${idFor("fim")}-error` : ""}`}
                  type="date"
                  required={tipo === "encerrar"}
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                />
                {feedback("fim")}
              </div>
              <p id={`${idFor("fim")}-hint`} className="text-xs text-muted-foreground">
                O último dia está incluído. Uma nova participação nesta equipe pode começar no dia
                seguinte.
                {tipo === "incluir"
                  ? " Deixe o fim vazio para um vínculo sem término definido."
                  : ""}
              </p>
              {tipo === "encerrar" && (
                <div className="grid gap-1 text-sm">
                  <label htmlFor={idFor("motivo")}>Motivo do encerramento *</label>
                  <textarea
                    {...inputProps("motivo")}
                    aria-describedby={`${idFor("motivo")}-hint${errors["motivo"] ? ` ${idFor("motivo")}-error` : ""}`}
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={3}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                  {feedback("motivo")}
                  <span id={`${idFor("motivo")}-hint`} className="text-xs text-muted-foreground">
                    O período encerrado permanece no histórico e não poderá ser reescrito.
                  </span>
                </div>
              )}
            </>
          )}
        </fieldset>
        {tipo === "equipe" && base && (
          <div className="space-y-3 border-t border-border pt-3 text-sm">
            <p>
              Versão aberta: {base.equipe.version}. A atualização da lista não altera a base deste
              formulário.
            </p>
            <ActionButton
              variant="ghost"
              disabled={busy || comparing}
              onClick={async () => {
                setComparing(true);
                try {
                  const data = await compare(base.equipe.id, base.membros.pagina);
                  if (data) setLatest(data);
                } catch (error) {
                  if (acessoEquipeNegado(error)) onDenied(error);
                  else
                    setFailure(
                      error instanceof Error
                        ? error.message
                        : "Não foi possível consultar a equipe atual.",
                    );
                } finally {
                  setComparing(false);
                }
              }}
            >
              Consultar versão atual
            </ActionButton>
            {latest && (
              <section
                aria-label="Comparação da equipe atual"
                className="space-y-2 rounded border border-border p-3"
              >
                <p className="font-medium">Versão salva {latest.equipe.version}</p>
                <p>
                  {latest.equipe.nome} · {latest.equipe.ativa ? "Ativa" : "Arquivada"}
                </p>
                <p>
                  Líder:{" "}
                  {latest.lider?.nome ||
                    (latest.equipe.lider_id
                      ? "Pessoa não disponível neste recorte"
                      : "Sem líder definido")}
                </p>
                <ActionButton
                  variant="ghost"
                  onClick={() => {
                    setBase(latest);
                    setLatest(null);
                    setFailure("");
                    setDirty(true);
                  }}
                >
                  Usar versão atual e manter preenchimento
                </ActionButton>
                <p className="text-xs text-muted-foreground">
                  Adotar a versão permite enviar os campos acima sobre essa base. Confira as
                  diferenças antes de salvar.
                </p>
              </section>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <ActionButton type="submit" loading={busy} disabled={comparing}>
            {tipo === "equipe"
              ? "Salvar equipe"
              : tipo === "incluir"
                ? "Confirmar participação"
                : "Confirmar encerramento"}
          </ActionButton>
          <Dialog.Close asChild>
            <ActionButton variant="ghost" disabled={busy || comparing}>
              Cancelar
            </ActionButton>
          </Dialog.Close>
        </div>
      </form>
    </OperationalDialog>
  );
}
