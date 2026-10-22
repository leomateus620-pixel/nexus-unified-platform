import { useId, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { OperationalDialog, useCommandKey } from "@/features/operacao/components";
import { publicarModeloLevantamento } from "./levantamentos.functions";
import { publicarModeloLevantamentoSchema, unidadesPorGrandeza } from "./schemas";
import { grandezasLevantamento } from "./domain";
import type { LevantamentoMedicao, LevantamentoModelo } from "./types";

type Requirement = {
  localId: string;
  chave: string;
  grandeza: LevantamentoMedicao["grandeza"];
  unidade: string;
  obrigatoria: boolean;
  exige_foto: boolean;
  minimo: string;
  maximo: string;
};
type Props = {
  org: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  modelo?: LevantamentoModelo | null | undefined;
};
export function ModelosLevantamento({ org, onClose, onSaved, modelo }: Props) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const save = useServerFn(publicarModeloLevantamento);
  const queryClient = useQueryClient();
  const keyFor = useCommandKey();
  const [nome, setNome] = useState(modelo?.nome ?? "");
  const [descricao, setDescricao] = useState("");
  const [fonte, setFonte] = useState(modelo?.fonte ?? "");
  const [requisitos, setRequisitos] = useState<Requirement[]>(() =>
    (modelo?.requisitos ?? []).map((r) => ({
      localId: crypto.randomUUID(),
      chave: r.chave,
      grandeza: r.grandeza,
      unidade: r.unidade,
      obrigatoria: r.obrigatoria !== false,
      exige_foto: r.exige_foto === true,
      minimo: r.minimo ?? "",
      maximo: r.maximo ?? "",
    })),
  );
  const [conferido, setConferido] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const title = modelo ? "Publicar nova versão do modelo" : "Criar modelo de coleta";
  const idFor = (name: string) => `${uid}-${name}`;
  const control = (name: string) => ({
    id: idFor(name),
    name,
    className: "nx-lev-input",
    "aria-invalid": !!erros[name],
    "aria-describedby": erros[name] ? `${idFor(name)}-error` : undefined,
  });
  const feedback = (name: string) =>
    erros[name] ? (
      <span id={`${idFor(name)}-error`} className="text-xs text-destructive">
        {erros[name]}
      </span>
    ) : null;
  const label = (name: string) => {
    if (name === "nome") return "Nome do modelo";
    if (name === "fonte") return "Fonte e política conferida";
    if (name === "conferido") return "Confirmação de conferência";
    if (name === "requisitos") return "Requisitos";
    const parts = name.split(".");
    const fields: Record<string, string> = {
      chave: "Identificação",
      grandeza: "Grandeza",
      unidade: "Unidade",
      minimo: "Mínimo",
      maximo: "Máximo",
    };
    return parts[0] === "requisitos" && parts[1]
      ? `Requisito ${Number(parts[1]) + 1} · ${fields[parts[2] ?? ""] ?? "Dados"}`
      : name;
  };
  function focus(name: string) {
    document.getElementById(idFor(name))?.focus();
  }
  function update(index: number, patch: Partial<Requirement>) {
    setDirty(true);
    setRequisitos((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    const body = {
      organization_id: org,
      chave: crypto.randomUUID(),
      modelo_id: modelo?.modelo_id ?? null,
      nome,
      descricao,
      fonte,
      requisitos: requisitos.map(({ localId: _localId, minimo, maximo, ...r }) => ({
        ...r,
        minimo: minimo.trim() || null,
        maximo: maximo.trim() || null,
      })),
    };
    const parsed = publicarModeloLevantamentoSchema.safeParse(body);
    const nextErrors: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) nextErrors[issue.path.join(".")] ??= issue.message;
    if (!conferido)
      nextErrors["conferido"] =
        "Confirme a conferência da fonte, unidades e critérios antes de publicar.";
    if (Object.keys(nextErrors).length || !parsed.success) {
      setErros(nextErrors);
      requestAnimationFrame(() => focus(Object.keys(nextErrors)[0] ?? "nome"));
      return;
    }
    setErros({});
    setBusy(true);
    submitting.current = true;
    try {
      const { chave: _key, ...payload } = parsed.data;
      await save({ data: { ...payload, chave: keyFor(payload) } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["levantamento-opcoes", org] }),
        queryClient.invalidateQueries({ queryKey: ["levantamentos", org] }),
      ]);
      setDirty(false);
      await onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível publicar. Confira os dados e tente novamente.",
      );
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[data-save-error="true"]')?.focus(),
      );
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  return (
    <OperationalDialog
      open
      title={title}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        ref={formRef}
        className="nx-lev-forms"
        data-dirty={dirty}
        aria-busy={busy}
        noValidate
        onChange={() => setDirty(true)}
        onSubmit={submit}
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            A publicação registra o profissional responsável e uma versão imutável. Levantamentos já
            iniciados continuam com o modelo que selecionaram.
          </p>
          <p>
            Use uma fonte autorizada e critérios conferidos pela engenharia. Limites configurados
            são internos; não representam prazo legal ou declaração automática de conformidade.
          </p>
        </div>
        {Object.keys(erros).length > 0 && (
          <div role="alert" className="rounded border border-destructive p-3 text-sm">
            <p>Confira os campos antes de publicar:</p>
            <ul className="mt-2 space-y-1">
              {Object.entries(erros).map(([name, message]) => (
                <li key={name}>
                  <button
                    type="button"
                    className="min-h-11 text-left underline underline-offset-4"
                    onClick={() => focus(name)}
                  >
                    {label(name)}: {message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <div
            data-save-error="true"
            tabIndex={-1}
            role="alert"
            className="rounded border border-destructive p-3 text-sm"
          >
            <p>{error}</p>
            <p className="mt-2">
              Seu preenchimento permanece disponível. Tente novamente com o mesmo conteúdo para
              recuperar uma publicação cuja resposta tenha falhado.
            </p>
          </div>
        )}
        <fieldset disabled={busy} className="space-y-4">
          <label htmlFor={idFor("nome")} className="nx-lev-label">
            Nome do modelo *
            <input
              {...control("nome")}
              value={nome}
              maxLength={160}
              readOnly={!!modelo}
              required
              onChange={(e) => setNome(e.target.value)}
            />
            {feedback("nome")}
          </label>
          {!modelo && (
            <label htmlFor={idFor("descricao")} className="nx-lev-label">
              Descrição
              <input
                {...control("descricao")}
                value={descricao}
                maxLength={2000}
                onChange={(e) => setDescricao(e.target.value)}
              />
              {feedback("descricao")}
            </label>
          )}
          {modelo && (
            <p className="text-xs text-muted-foreground">
              Modelo {modelo.nome} · última versão consultada V{modelo.numero}. Esta operação
              publica outra versão; o cadastro original permanece preservado.
            </p>
          )}
          <label htmlFor={idFor("fonte")} className="nx-lev-label">
            Fonte, versão e critérios conferidos *
            <textarea
              {...control("fonte")}
              rows={3}
              required
              maxLength={2000}
              value={fonte}
              onChange={(e) => setFonte(e.target.value)}
              placeholder="Identifique documento, versão, procedimento ou critério técnico autorizado."
            />
            {feedback("fonte")}
          </label>
          <section aria-labelledby={idFor("requisitos-title")} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={idFor("requisitos-title")} className="font-semibold">
                Requisitos por ponto
              </h3>
              <ActionButton
                variant="ghost"
                disabled={requisitos.length >= 100}
                onClick={() => {
                  setDirty(true);
                  setRequisitos((rows) => [
                    ...rows,
                    {
                      localId: crypto.randomUUID(),
                      chave: "",
                      grandeza: "comprimento",
                      unidade: "m",
                      obrigatoria: true,
                      exige_foto: false,
                      minimo: "",
                      maximo: "",
                    },
                  ]);
                }}
              >
                {" "}
                <Plus size={16} aria-hidden /> Adicionar requisito
              </ActionButton>
            </div>
            {feedback("requisitos")}
            {!requisitos.length && (
              <p className="text-sm text-muted-foreground">
                Sem requisitos adicionais. A coleta continua exigindo identificação, valor, unidade,
                método, data e precisão quando aplicável.
              </p>
            )}
            {requisitos.map((req, index) => {
              const path = `requisitos.${index}`;
              return (
                <fieldset
                  key={req.localId}
                  className="space-y-3 rounded-lg border border-border p-3"
                >
                  <legend className="px-1 text-sm font-medium">Requisito {index + 1}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label htmlFor={idFor(`${path}.chave`)} className="nx-lev-label">
                      Identificação da medida *
                      <input
                        {...control(`${path}.chave`)}
                        value={req.chave}
                        maxLength={80}
                        required
                        onChange={(e) => update(index, { chave: e.target.value })}
                      />
                      {feedback(`${path}.chave`)}
                    </label>
                    <label htmlFor={idFor(`${path}.grandeza`)} className="nx-lev-label">
                      Grandeza *
                      <select
                        {...control(`${path}.grandeza`)}
                        value={req.grandeza}
                        onChange={(e) => {
                          const grandeza = e.target.value as Requirement["grandeza"];
                          update(index, { grandeza, unidade: unidadesPorGrandeza[grandeza][0] });
                        }}
                      >
                        {Object.entries(grandezasLevantamento).map(([value, text]) => (
                          <option value={value} key={value}>
                            {text}
                          </option>
                        ))}
                      </select>
                      {feedback(`${path}.grandeza`)}
                    </label>
                    <label htmlFor={idFor(`${path}.unidade`)} className="nx-lev-label">
                      Unidade *
                      <select
                        {...control(`${path}.unidade`)}
                        value={req.unidade}
                        onChange={(e) => update(index, { unidade: e.target.value })}
                      >
                        {unidadesPorGrandeza[req.grandeza].map((unit) => (
                          <option value={unit} key={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      {feedback(`${path}.unidade`)}
                    </label>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={req.obrigatoria}
                          onChange={(e) => update(index, { obrigatoria: e.target.checked })}
                        />{" "}
                        Obrigatória
                      </label>
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={req.exige_foto}
                          onChange={(e) => update(index, { exige_foto: e.target.checked })}
                        />{" "}
                        Exige foto
                      </label>
                    </div>
                    <label htmlFor={idFor(`${path}.minimo`)} className="nx-lev-label">
                      Mínimo configurado ({req.unidade})
                      <input
                        {...control(`${path}.minimo`)}
                        inputMode="decimal"
                        value={req.minimo}
                        onChange={(e) => update(index, { minimo: e.target.value })}
                      />
                      {feedback(`${path}.minimo`)}
                    </label>
                    <label htmlFor={idFor(`${path}.maximo`)} className="nx-lev-label">
                      Máximo configurado ({req.unidade})
                      <input
                        {...control(`${path}.maximo`)}
                        inputMode="decimal"
                        value={req.maximo}
                        onChange={(e) => update(index, { maximo: e.target.value })}
                      />
                      {feedback(`${path}.maximo`)}
                    </label>
                  </div>
                  <ActionButton
                    variant="ghost"
                    onClick={() => {
                      setDirty(true);
                      setRequisitos((rows) => rows.filter((_, i) => i !== index));
                    }}
                  >
                    <Trash2 size={16} aria-hidden /> Remover requisito {index + 1}
                  </ActionButton>
                </fieldset>
              );
            })}
          </section>
          <label htmlFor={idFor("conferido")} className="flex min-h-11 items-start gap-2 text-sm">
            <input
              id={idFor("conferido")}
              name="conferido"
              type="checkbox"
              className="mt-1"
              checked={conferido}
              aria-invalid={!!erros["conferido"]}
              aria-describedby={erros["conferido"] ? `${idFor("conferido")}-error` : undefined}
              onChange={(e) => setConferido(e.target.checked)}
            />
            <span>
              Conferi a fonte, as unidades e os critérios desta versão. A publicação depende de
              profissional autorizado no servidor.
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
