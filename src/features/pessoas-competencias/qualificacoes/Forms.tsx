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
import { buscarOpcoesQualificacao } from "./functions";
import { acessoQualificacaoNegado, estadoLabels, proximasDecisoes } from "./domain";
import { qualificacoesFreshness } from "./queries";
import {
  salvarCompetenciaInput,
  salvarQualificacaoInput,
  transicionarQualificacaoInput,
} from "./schemas";
import type {
  CompetenciaDetalhe,
  QualificacaoDetalhe,
  SalvarCompetencia,
  SalvarQualificacao,
  TransicionarQualificacao,
} from "./types";

export type QualificationEditor =
  | { tipo: "competencia"; base: CompetenciaDetalhe | null }
  | { tipo: "qualificacao"; base: QualificacaoDetalhe | null }
  | { tipo: "decisao"; base: QualificacaoDetalhe };
export type QualificationCommand =
  | { tipo: "competencia"; data: SalvarCompetencia }
  | { tipo: "qualificacao"; data: SalvarQualificacao }
  | { tipo: "decisao"; data: TransicionarQualificacao };

/** Busca paginada com revalidação; uma falha nunca mantém opções antigas selecionáveis. */
export function QualificationPicker({
  org,
  tipo,
  value,
  initialLabel = "",
  label,
  disabled = false,
  required = true,
  error,
  onChange,
  onDenied,
}: {
  org: string;
  tipo: "pessoas" | "competencias";
  value: string;
  initialLabel?: string;
  label: string;
  disabled?: boolean;
  required?: boolean;
  error?: string | undefined;
  onChange: (id: string, nome: string) => void;
  onDenied: (error: unknown) => void;
}) {
  const load = useServerFn(buscarOpcoesQualificacao),
    uid = useId();
  const [busca, setBusca] = useState(""),
    [term, setTerm] = useState(""),
    [pagina, setPagina] = useState(0);
  const [selection, setSelection] = useState({ id: value, nome: initialLabel });
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(busca);
      setPagina(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [busca]);
  const q = useQuery({
    queryKey: ["pessoas", org, "qualificacoes", "opcoes", tipo, term, pagina],
    enabled: !disabled,
    ...qualificacoesFreshness,
    queryFn: ({ signal }) =>
      load({ data: { organization_id: org, tipo, busca: term, pagina }, signal }),
  });
  useEffect(() => {
    if (acessoQualificacaoNegado(q.error)) onDenied(q.error);
  }, [q.error, onDenied]);
  const rows = q.isError ? [] : (q.data?.rows ?? []);
  const selected = selection.id === value ? selection : { id: value, nome: initialLabel };
  const choices =
    value && !rows.some((r) => r.id === value)
      ? [{ ...selected, contexto: "Seleção atual" }, ...rows]
      : rows;
  return (
    <div className="grid min-w-0 gap-2">
      <label className="grid gap-1 text-sm" htmlFor={uid + "-busca"}>
        Buscar {label.toLocaleLowerCase("pt-BR")}
        <input
          id={uid + "-busca"}
          className={fieldClass}
          type="search"
          maxLength={120}
          value={busca}
          disabled={disabled}
          onChange={(e) => setBusca(e.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm" htmlFor={uid + "-select"}>
        {label}
        {required ? " *" : ""}
        <select
          id={uid + "-select"}
          name={tipo === "pessoas" ? "pessoa_id" : "competencia_id"}
          className={fieldClass}
          value={value}
          disabled={disabled || q.isError}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? uid + "-error" : undefined}
          onChange={(e) => {
            const row = choices.find((r) => r.id === e.target.value) ?? { id: "", nome: "" };
            setSelection(row);
            onChange(row.id, row.nome);
          }}
        >
          <option value="">Selecione</option>
          {choices.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome || "Cadastro selecionado"}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p id={uid + "-error"} className="text-sm text-destructive">
          {error}
        </p>
      )}
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <p className="text-xs text-muted-foreground" role="status">
          Consultando cadastros autorizados…
        </p>
      ) : (
        q.data && <Pagination page={pagina} total={q.data.total} onChange={setPagina} />
      )}
    </div>
  );
}

export function QualificationForm({
  orgId,
  editor,
  pessoaId,
  execute,
  compare,
  onClose,
  onDenied,
}: {
  orgId: string;
  editor: QualificationEditor;
  pessoaId: string | null;
  execute: (command: QualificationCommand) => Promise<boolean>;
  compare: (
    editor: QualificationEditor,
  ) => Promise<CompetenciaDetalhe | QualificacaoDetalhe | undefined>;
  onClose: () => void;
  onDenied: (error: unknown) => void;
}) {
  const [initial] = useState(editor),
    [base, setBase] = useState(editor.base);
  const c = initial.tipo === "competencia" ? initial.base?.registro : undefined;
  const q = initial.tipo !== "competencia" ? initial.base?.registro : undefined;
  const [nome, setNome] = useState(c?.nome ?? ""),
    [descricao, setDescricao] = useState(c?.descricao ?? "");
  const [evidencia, setEvidencia] = useState(c ? String(c.exige_evidencia) : ""),
    [validity, setValidity] = useState(c ? String(c.exige_validade) : "");
  const [ativa, setAtiva] = useState(c?.ativa ?? true);
  const [pessoa, setPessoa] = useState(q?.pessoa_id ?? pessoaId ?? ""),
    [competencia, setCompetencia] = useState(q?.competencia_id ?? "");
  const [pessoaNome, setPessoaNome] = useState(q?.pessoa?.nome ?? ""),
    [competenciaNome, setCompetenciaNome] = useState(q?.competencia?.nome ?? "");
  const [emissor, setEmissor] = useState(q?.emissor ?? ""),
    [conclusao, setConclusao] = useState(q?.conclusao ?? ""),
    [validade, setValidade] = useState(q?.validade ?? "");
  const [estado, setEstado] = useState(""),
    [motivo, setMotivo] = useState("");
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [comparing, setComparing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [failure, setFailure] = useState("");
  const [latest, setLatest] = useState<CompetenciaDetalhe | QualificacaoDetalhe | null>(null);
  const uid = useId(),
    form = useRef<HTMLFormElement>(null),
    keyFor = useCommandKey();
  const lock = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const title =
    initial.tipo === "competencia"
      ? base
        ? "Editar política da competência"
        : "Nova competência"
      : initial.tipo === "decisao"
        ? "Conferir qualificação"
        : base
          ? "Editar qualificação enviada"
          : "Registrar qualificação";
  const currentQ = base && "conferir" in base.permissoes ? (base as QualificacaoDetalhe) : null;
  const choices = currentQ
    ? proximasDecisoes(currentQ.registro.estado, currentQ.permissoes.validar)
    : {};
  const immutablePolicy = initial.tipo === "competencia" && base && "usada" in base && base.usada;
  const props = (name: string) => ({
    id: uid + name,
    name,
    className: fieldClass,
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? uid + name + "-error" : undefined,
  });
  const fieldError = (name: string) =>
    errors[name] && (
      <span id={uid + name + "-error"} className="text-sm text-destructive">
        {errors[name]}
      </span>
    );
  const focusErrors = () =>
    requestAnimationFrame(() => {
      const target = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (target) target.focus();
      else form.current?.querySelector<HTMLElement>("[data-summary]")?.focus();
    });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || comparing) return;
    setErrors({});
    setFailure("");
    const common = {
      organization_id: orgId,
      id: base?.registro.id ?? null,
      expected_version: base?.registro.version ?? null,
    };
    let command: QualificationCommand;
    if (initial.tipo === "competencia") {
      if (!evidencia || !validity) {
        setErrors({
          ...(!evidencia ? { exige_evidencia: "Defina se a política exige comprovante." } : {}),
          ...(!validity ? { exige_validade: "Defina se a política exige validade." } : {}),
        });
        focusErrors();
        return;
      }
      const payload = {
        ...common,
        dados: {
          nome,
          descricao,
          exige_evidencia: evidencia === "true",
          exige_validade: validity === "true",
          ativa,
        },
      };
      const parsed = salvarCompetenciaInput.safeParse({ ...payload, chave: keyFor(payload) });
      if (!parsed.success) {
        setErrors(
          Object.fromEntries(parsed.error.issues.map((i) => [String(i.path.at(-1)), i.message])),
        );
        focusErrors();
        return;
      }
      command = { tipo: "competencia", data: parsed.data };
    } else if (initial.tipo === "qualificacao") {
      const payload = {
        ...common,
        dados: {
          pessoa_id: pessoa,
          competencia_id: competencia,
          emissor,
          conclusao,
          validade: validade || null,
        },
      };
      const parsed = salvarQualificacaoInput.safeParse({ ...payload, chave: keyFor(payload) });
      if (!parsed.success) {
        setErrors(
          Object.fromEntries(parsed.error.issues.map((i) => [String(i.path.at(-1)), i.message])),
        );
        focusErrors();
        return;
      }
      command = { tipo: "qualificacao", data: parsed.data };
    } else {
      if (!Object.hasOwn(choices, estado)) {
        setErrors({ estado: "Selecione uma decisão disponível para esta versão." });
        focusErrors();
        return;
      }
      const payload = { ...common, estado, motivo: motivo || null };
      const parsed = transicionarQualificacaoInput.safeParse({
        ...payload,
        chave: keyFor(payload),
      });
      if (!parsed.success) {
        setErrors(
          Object.fromEntries(parsed.error.issues.map((i) => [String(i.path.at(-1)), i.message])),
        );
        focusErrors();
        return;
      }
      command = { tipo: "decisao", data: parsed.data };
    }
    lock.current = true;
    setBusy(true);
    try {
      const saved = await execute(command);
      if (alive.current && !saved)
        setFailure("O servidor não confirmou a alteração. Seu preenchimento foi preservado.");
    } catch (error) {
      if (!alive.current) return;
      if (acessoQualificacaoNegado(error)) onDenied(error);
      else
        setFailure(
          error instanceof Error
            ? error.message
            : "Não foi possível confirmar. Seu preenchimento foi preservado.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
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
        onSubmit={submit}
        noValidate
        data-dirty={dirty ? "true" : "false"}
        aria-busy={busy}
        className="space-y-4"
        onChange={() => setDirty(true)}
      >
        {!!Object.keys(errors).length && (
          <div
            data-summary
            tabIndex={-1}
            role="alert"
            className="rounded border border-destructive p-3 text-sm"
          >
            <p>Confira os campos indicados.</p>
            {Object.entries(errors).map(([key, message]) => (
              <p key={key}>{message}</p>
            ))}
          </div>
        )}
        <fieldset disabled={busy || comparing} className="grid min-w-0 gap-4">
          {initial.tipo === "competencia" ? (
            <>
              <div className="grid gap-1">
                <label className="grid gap-1 text-sm" htmlFor={uid + "nome"}>
                  Nome da competência *
                  <input
                    {...props("nome")}
                    maxLength={160}
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </label>
                {fieldError("nome")}
              </div>
              <div className="grid gap-1">
                <label className="grid gap-1 text-sm" htmlFor={uid + "descricao"}>
                  Descrição da política
                  <textarea
                    {...props("descricao")}
                    rows={3}
                    maxLength={4000}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                  />
                </label>
                {fieldError("descricao")}
              </div>
              {(
                [
                  ["exige_evidencia", "Exige comprovante para validar", evidencia, setEvidencia],
                  ["exige_validade", "Exige data de validade para validar", validity, setValidity],
                ] as const
              ).map(([name, label, value, update]) => (
                <div key={name} className="grid gap-1">
                  <label className="grid gap-1 text-sm" htmlFor={uid + name}>
                    {label} *
                    <select
                      {...props(name)}
                      value={value}
                      disabled={!!immutablePolicy}
                      onChange={(e) => update(e.target.value)}
                    >
                      <option value="">Defina a política</option>
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </label>
                  {fieldError(name)}
                </div>
              ))}
              {immutablePolicy && (
                <p className="text-sm text-muted-foreground">
                  Política já utilizada. Uma política com requisitos diferentes exige novo cadastro
                  de competência; os registros anteriores permanecem preservados.
                </p>
              )}
              {!!base && (
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ativa}
                    onChange={(e) => setAtiva(e.target.checked)}
                  />
                  Competência ativa para novos registros
                </label>
              )}
            </>
          ) : initial.tipo === "qualificacao" ? (
            <>
              {base ? (
                <p className="rounded border border-border p-3 text-sm">
                  {pessoaNome || "Pessoa não disponível"} ·{" "}
                  {competenciaNome || "Competência não disponível"}
                  <br />
                  Pessoa e competência permanecem vinculadas ao registro original.
                </p>
              ) : (
                <>
                  <QualificationPicker
                    org={orgId}
                    tipo="pessoas"
                    label="Pessoa"
                    value={pessoa}
                    initialLabel={pessoaNome}
                    error={errors["pessoa_id"]}
                    onDenied={onDenied}
                    onChange={(id, label) => {
                      setPessoa(id);
                      setPessoaNome(label);
                      setDirty(true);
                    }}
                  />
                  <QualificationPicker
                    org={orgId}
                    tipo="competencias"
                    label="Competência"
                    value={competencia}
                    initialLabel={competenciaNome}
                    error={errors["competencia_id"]}
                    onDenied={onDenied}
                    onChange={(id, label) => {
                      setCompetencia(id);
                      setCompetenciaNome(label);
                      setDirty(true);
                    }}
                  />
                </>
              )}
              <div className="grid gap-1">
                <label className="grid gap-1 text-sm" htmlFor={uid + "emissor"}>
                  Emissor *
                  <input
                    {...props("emissor")}
                    maxLength={200}
                    value={emissor}
                    onChange={(e) => setEmissor(e.target.value)}
                  />
                </label>
                {fieldError("emissor")}
              </div>
              <div className="grid gap-1">
                <label className="grid gap-1 text-sm" htmlFor={uid + "conclusao"}>
                  Data de conclusão *
                  <input
                    {...props("conclusao")}
                    type="date"
                    value={conclusao}
                    onChange={(e) => setConclusao(e.target.value)}
                  />
                </label>
                {fieldError("conclusao")}
              </div>
              <div className="grid gap-1">
                <label className="grid gap-1 text-sm" htmlFor={uid + "validade"}>
                  Validade, quando aplicável
                  <input
                    {...props("validade")}
                    type="date"
                    value={validade}
                    onChange={(e) => setValidade(e.target.value)}
                  />
                </label>
                {fieldError("validade")}
              </div>
              <p className="text-xs text-muted-foreground">
                As datas são civis. Registre a validade definida pela fonte e pela política
                cadastrada. O comprovante pode ser anexado após salvar; anexar não valida nem renova
                o registro.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm">
                {q?.pessoa?.nome || "Pessoa não disponível"} ·{" "}
                {q?.competencia?.nome || "Competência não disponível"}
              </p>
              <div className="grid gap-1">
                <label className="grid gap-1 text-sm" htmlFor={uid + "estado"}>
                  Decisão *
                  <select
                    {...props("estado")}
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {Object.entries(choices).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {fieldError("estado")}
              </div>
              <div className="grid gap-1">
                <label className="grid gap-1 text-sm" htmlFor={uid + "motivo"}>
                  Motivo{["enviada", "revogada"].includes(estado) ? " *" : " (opcional)"}
                  <textarea
                    {...props("motivo")}
                    rows={3}
                    maxLength={2000}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </label>
                {fieldError("motivo")}
              </div>
              <p className="text-xs text-muted-foreground">
                A validação confere os requisitos cadastrados, o comprovante e a validade exigidos
                pela política. O responsável não pode validar a própria qualificação.
              </p>
            </>
          )}
        </fieldset>
        {base && (
          <div className="space-y-3 border-t border-border pt-3 text-sm">
            <p>
              Versão aberta: {base.registro.version}. Atualizações da lista não alteram esta base.
            </p>
            <ActionButton
              variant="ghost"
              disabled={busy || comparing}
              onClick={async () => {
                setComparing(true);
                try {
                  const data = await compare({ ...initial, base } as QualificationEditor);
                  if (alive.current && data) setLatest(data);
                } catch (error) {
                  if (alive.current) {
                    if (acessoQualificacaoNegado(error)) onDenied(error);
                    else
                      setFailure(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível consultar a versão atual.",
                      );
                  }
                } finally {
                  if (alive.current) setComparing(false);
                }
              }}
            >
              Consultar versão atual
            </ActionButton>
            {latest && (
              <section
                aria-label="Comparação do registro atual"
                className="space-y-2 rounded border border-border p-3"
              >
                <p>Versão salva: {latest.registro.version}</p>
                {"usada" in latest ? (
                  <p>
                    {latest.registro.nome} · {latest.registro.ativa ? "Ativa" : "Arquivada"} ·
                    comprovante {latest.registro.exige_evidencia ? "obrigatório" : "opcional"} ·
                    validade {latest.registro.exige_validade ? "obrigatória" : "opcional"}
                  </p>
                ) : (
                  <p>
                    {estadoLabels[latest.registro.estado]} · {latest.registro.emissor} · conclusão{" "}
                    {latest.registro.conclusao} · validade{" "}
                    {latest.registro.validade || "não declarada"}
                  </p>
                )}
                <ActionButton
                  variant="ghost"
                  disabled={busy || comparing}
                  onClick={() => {
                    setBase(latest);
                    if ("usada" in latest && latest.usada) {
                      setEvidencia(String(latest.registro.exige_evidencia));
                      setValidity(String(latest.registro.exige_validade));
                    }
                    setLatest(null);
                    setFailure("");
                    setDirty(true);
                  }}
                >
                  Usar versão atual e manter preenchimento
                </ActionButton>
                <p className="text-xs text-muted-foreground">
                  Confira as diferenças antes de enviar. Requisitos de política já utilizada
                  acompanham a base atual.
                </p>
              </section>
            )}
          </div>
        )}
        {failure && (
          <p role="alert" className="rounded border border-destructive p-3 text-sm">
            {failure}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <ActionButton
            type="submit"
            loading={busy}
            disabled={
              comparing ||
              (!!base &&
                (initial.tipo === "competencia"
                  ? !base.permissoes.editar
                  : initial.tipo === "qualificacao"
                    ? !base.permissoes.editar
                    : !currentQ?.permissoes.conferir))
            }
          >
            {initial.tipo === "competencia"
              ? "Salvar competência"
              : initial.tipo === "qualificacao"
                ? "Salvar qualificação"
                : "Confirmar decisão"}
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
