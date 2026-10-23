import { useId, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { OperationalDialog, useCommandKey } from "@/features/operacao/components";
import { publicarMetodoEstudo } from "./estudos.functions";
import { publicarMetodoEstudoSchema } from "./schemas";
import { tiposEstudo } from "./domain";
import type { EstudoMetodo, TipoEstudo } from "./types";

type Fonte = {
  localId: string;
  titulo: string;
  edicao: string;
  emissor: string;
  url: string;
  consultado_em: string;
};
type Requisitos = EstudoMetodo["requisitos"];
const requisitosLabels: Record<keyof Requisitos, string> = {
  exige_levantamento: "Exigir levantamento aprovado como fonte",
  exige_perigos: "Exigir identificação dos perigos",
  exige_medidas: "Exigir medidas de controle propostas",
  exige_art: "Exigir referência de responsabilidade técnica aplicável",
  revisao_independente: "Exigir revisor diferente do responsável técnico",
};
const novaFonte = (): Fonte => ({
  localId: crypto.randomUUID(),
  titulo: "",
  edicao: "",
  emissor: "",
  url: "",
  consultado_em: "",
});
export type MetodoEstudoFormProps = {
  org: string;
  metodo?: EstudoMetodo | null | undefined;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};
export function MetodoEstudoForm({ org, metodo, onClose, onSaved }: MetodoEstudoFormProps) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const save = useServerFn(publicarMetodoEstudo);
  const queryClient = useQueryClient();
  const commandKey = useCommandKey();
  const submitting = useRef(false);
  const [nome, setNome] = useState(metodo?.nome ?? "");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<TipoEstudo>(metodo?.tipo ?? "memorial");
  const [instrucoes, setInstrucoes] = useState(metodo?.instrucoes ?? "");
  const [fontes, setFontes] = useState<Fonte[]>(
    () =>
      metodo?.fontes.map((f) => ({
        localId: crypto.randomUUID(),
        titulo: f.titulo,
        edicao: f.edicao,
        emissor: f.emissor,
        url: f.url ?? "",
        consultado_em: f.consultado_em ?? "",
      })) ?? [novaFonte()],
  );
  const [requisitos, setRequisitos] = useState<Requisitos>(() =>
    metodo
      ? { ...metodo.requisitos }
      : {
          exige_levantamento: false,
          exige_perigos: false,
          exige_medidas: false,
          exige_art: false,
          revisao_independente: false,
        },
  );
  const [conferido, setConferido] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const idFor = (name: string) => `${uid}-${name}`;
  const focus = (name: string) => document.getElementById(idFor(name))?.focus();
  const labelFor = (name: string) => {
    const source = name.match(/^fontes\.\d+\.(\w+)$/)?.[1];
    const labels: Record<string, string> = {
      nome: "Nome do método *",
      descricao: "Descrição",
      tipo: "Tipo de estudo *",
      instrucoes: "Instruções e critérios validados *",
      titulo: "Título *",
      edicao: "Edição ou versão *",
      emissor: "Emissor *",
      url: "URL pública da referência (opcional)",
      consultado_em: "Data da consulta",
    };
    return labels[source || name] || name;
  };
  const field = (name: string) => ({
    id: idFor(name),
    name,
    className: "nx-est-input",
    "aria-label": labelFor(name),
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `${idFor(name)}-error` : undefined,
  });
  const feedback = (name: string) =>
    errors[name] ? (
      <span id={`${idFor(name)}-error`} className="text-xs text-destructive">
        {errors[name]}
      </span>
    ) : null;
  function changeFonte(index: number, patch: Partial<Fonte>) {
    setDirty(true);
    setFontes((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function errorLabel(name: string) {
    if (name.startsWith("fontes.")) {
      const [, index, key] = name.split(".");
      return `Fonte ${Number(index) + 1} · ${key}`;
    }
    return (
      (
        {
          nome: "Nome",
          tipo: "Tipo",
          instrucoes: "Instruções",
          fontes: "Fontes",
          conferido: "Conferência",
        } as Record<string, string>
      )[name] ?? name
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    const parsed = publicarMetodoEstudoSchema.safeParse({
      organization_id: org,
      chave: crypto.randomUUID(),
      metodo_id: metodo?.metodo_id ?? null,
      nome,
      descricao,
      tipo,
      instrucoes,
      requisitos,
      fontes: fontes.map(({ localId: _id, ...f }) => ({
        ...f,
        url: f.url.trim() || null,
        consultado_em: f.consultado_em || null,
      })),
    });
    const next: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
    if (!conferido) next["conferido"] = "Confirme a conferência das fontes e dos requisitos.";
    if (!parsed.success || Object.keys(next).length) {
      setErrors(next);
      requestAnimationFrame(() => focus(Object.keys(next)[0] ?? "nome"));
      return;
    }
    setErrors({});
    setBusy(true);
    submitting.current = true;
    try {
      const { chave: _key, ...payload } = parsed.data;
      await save({ data: { ...payload, chave: commandKey(payload) } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["estudos", org] }),
        queryClient.invalidateQueries({ queryKey: ["estudo-opcoes", org] }),
      ]);
      setDirty(false);
      await onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível publicar o método. Seu preenchimento foi preservado.",
      );
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[data-save-error="true"]')?.focus(),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <OperationalDialog
      open
      title={metodo ? "Publicar nova versão do método" : "Criar método técnico"}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <form
        ref={formRef}
        className="nx-est-form space-y-4"
        data-dirty={dirty}
        aria-busy={busy}
        noValidate
        onChange={() => setDirty(true)}
        onSubmit={submit}
      >
        <p className="text-sm text-muted-foreground">
          A publicação registra uma versão imutável e o profissional autorizado no servidor. Estudos
          existentes mantêm o método escolhido. Use fontes e critérios conferidos; o cadastro não
          comprova conformidade nem emite ART.
        </p>
        {!!Object.keys(errors).length && (
          <div role="alert" className="rounded border border-destructive p-3 text-sm">
            <p>Confira os campos antes de publicar:</p>
            <ul>
              {Object.entries(errors).map(([key, message]) => (
                <li key={key}>
                  <button
                    type="button"
                    className="min-h-11 text-left underline"
                    onClick={() => focus(key)}
                  >
                    {errorLabel(key)}: {message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <div
            data-save-error="true"
            role="alert"
            tabIndex={-1}
            className="rounded border border-destructive p-3 text-sm"
          >
            <p>{error}</p>
            <p className="mt-2">
              Seu preenchimento foi preservado. Repetir o mesmo conteúdo recupera uma publicação
              cuja resposta tenha falhado.
            </p>
          </div>
        )}
        <fieldset disabled={busy} className="space-y-4">
          <label htmlFor={idFor("nome")} className="nx-est-label grid gap-1 text-sm">
            Nome do método *
            <input
              {...field("nome")}
              required
              maxLength={160}
              value={nome}
              readOnly={!!metodo}
              onChange={(e) => setNome(e.target.value)}
            />
            {feedback("nome")}
          </label>
          {!metodo && (
            <label htmlFor={idFor("descricao")} className="nx-est-label grid gap-1 text-sm">
              Descrição
              <input
                {...field("descricao")}
                maxLength={2000}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
              {feedback("descricao")}
            </label>
          )}
          {metodo && (
            <p className="text-xs text-muted-foreground">
              Base consultada: {metodo.nome} · V{metodo.numero}. A publicação cria outra versão,
              preservando a anterior.
            </p>
          )}
          <label htmlFor={idFor("tipo")} className="nx-est-label grid gap-1 text-sm">
            Tipo de estudo *
            <select
              {...field("tipo")}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoEstudo)}
            >
              {Object.entries(tiposEstudo).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {feedback("tipo")}
          </label>
          <label htmlFor={idFor("instrucoes")} className="nx-est-label grid gap-1 text-sm">
            Instruções e critérios validados *
            <textarea
              {...field("instrucoes")}
              rows={5}
              required
              maxLength={20000}
              value={instrucoes}
              onChange={(e) => setInstrucoes(e.target.value)}
            />
            {feedback("instrucoes")}
          </label>
          <section className="space-y-3" aria-labelledby={idFor("fontes-title")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={idFor("fontes-title")} className="font-medium">
                Fontes versionadas
              </h3>
              <ActionButton
                variant="ghost"
                disabled={fontes.length >= 50}
                onClick={() => {
                  setDirty(true);
                  setFontes((rows) => [...rows, novaFonte()]);
                }}
              >
                <Plus size={16} aria-hidden /> Adicionar fonte
              </ActionButton>
            </div>
            <div tabIndex={-1} id={idFor("fontes")}>
              {feedback("fontes")}
            </div>
            {fontes.map((source, index) => (
              <fieldset
                key={source.localId}
                className="space-y-3 rounded-lg border border-border p-3"
              >
                <legend className="px-1 text-sm font-medium">Fonte {index + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["titulo", "Título *", 200],
                      ["edicao", "Edição ou versão *", 120],
                      ["emissor", "Emissor *", 200],
                      ["url", "URL pública da referência (opcional)", 2000],
                    ] as const
                  ).map(([key, label, max]) => (
                    <label
                      key={key}
                      htmlFor={idFor(`fontes.${index}.${key}`)}
                      className="nx-est-label grid gap-1 text-sm"
                    >
                      {label}
                      <input
                        {...field(`fontes.${index}.${key}`)}
                        type={key === "url" ? "url" : "text"}
                        maxLength={max}
                        value={source[key]}
                        onChange={(e) => changeFonte(index, { [key]: e.target.value })}
                      />
                      {feedback(`fontes.${index}.${key}`)}
                    </label>
                  ))}
                  <label
                    htmlFor={idFor(`fontes.${index}.consultado_em`)}
                    className="nx-est-label grid gap-1 text-sm"
                  >
                    Data da consulta
                    <input
                      {...field(`fontes.${index}.consultado_em`)}
                      type="date"
                      value={source.consultado_em}
                      onChange={(e) => changeFonte(index, { consultado_em: e.target.value })}
                    />
                    {feedback(`fontes.${index}.consultado_em`)}
                  </label>
                </div>
                <ActionButton
                  variant="ghost"
                  onClick={() => {
                    setDirty(true);
                    setFontes((rows) => rows.filter((_, i) => i !== index));
                  }}
                >
                  <Trash2 size={16} aria-hidden /> Remover fonte {index + 1}
                </ActionButton>
              </fieldset>
            ))}
          </section>
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">Requisitos desta versão</legend>
            <p className="text-xs text-muted-foreground">
              Ative somente requisitos definidos pelo procedimento técnico conferido.
            </p>
            {(Object.keys(requisitosLabels) as (keyof Requisitos)[]).map((key) => (
              <label key={key} className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={requisitos[key]}
                  onChange={(e) =>
                    setRequisitos((value) => ({ ...value, [key]: e.target.checked }))
                  }
                />
                <span>{requisitosLabels[key]}</span>
              </label>
            ))}
          </fieldset>
          <label htmlFor={idFor("conferido")} className="flex min-h-11 items-start gap-2 text-sm">
            <input
              id={idFor("conferido")}
              name="conferido"
              type="checkbox"
              className="mt-1"
              checked={conferido}
              aria-invalid={!!errors["conferido"]}
              aria-describedby={errors["conferido"] ? `${idFor("conferido")}-error` : undefined}
              onChange={(e) => setConferido(e.target.checked)}
            />
            <span>
              Conferi as fontes, suas versões e os requisitos. A publicação depende de profissional
              autorizado no servidor.
            </span>
          </label>
          {feedback("conferido")}
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <Dialog.Close asChild>
            <ActionButton variant="ghost" disabled={busy}>
              Voltar sem publicar
            </ActionButton>
          </Dialog.Close>
          <ActionButton type="submit" loading={busy}>
            Publicar versão
          </ActionButton>
        </div>
      </form>
    </OperationalDialog>
  );
}
