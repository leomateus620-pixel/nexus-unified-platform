import { useId, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as Dialog from "@radix-ui/react-dialog";
import { ActionButton } from "@/components/nexus/Page";
import { EntityPicker } from "@/components/nexus/EntityPicker";
import { OperationalDialog, useCommandKey } from "@/features/operacao/components";
import { buscarOpcoesEstudo, vincularAcaoEstudo } from "./estudos.functions";
import { vincularAcaoEstudoSchema } from "./schemas";
import { invalidarEstudos } from "./queries";
import { prioridadesMedida } from "./domain";
import type { EstudoMedida } from "./types";

export type AcaoEstudoFormProps = {
  org: string;
  medida: EstudoMedida;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};
export function AcaoEstudoForm({ org, medida, onClose, onSaved }: AcaoEstudoFormProps) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const submitLock = useRef(false);
  const save = useServerFn(vincularAcaoEstudo);
  const options = useServerFn(buscarOpcoesEstudo);
  const queryClient = useQueryClient();
  const commandKey = useCommandKey();
  const [modo, setModo] = useState<"criar" | "existente">("criar");
  const [acaoId, setAcaoId] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prazo, setPrazo] = useState("");
  const [prioridade, setPrioridade] = useState<EstudoMedida["prioridade"]>("normal");
  const [exigeVerificacao, setExigeVerificacao] = useState(true);
  const [liberado, setLiberado] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const idFor = (key: string) => `${uid}-${key}`;
  const fieldLabels: Record<string, string> = {
    titulo: "Instrução para a equipe *",
    descricao: "Descrição liberada",
    prazo: "Prazo",
    prioridade: "Prioridade",
  };
  const field = (key: string) => ({
    id: idFor(key),
    name: key,
    className: "nx-est-input",
    "aria-label": fieldLabels[key] || key,
    "aria-invalid": !!errors[key],
    "aria-describedby": errors[key] ? `${idFor(key)}-error` : undefined,
  });
  const feedback = (key: string) =>
    errors[key] ? (
      <span id={`${idFor(key)}-error`} className="text-xs text-destructive">
        {errors[key]}
      </span>
    ) : null;
  const focus = (key: string) => {
    const current = document.getElementById(idFor(key));
    if (current?.tagName === "DIV") current.querySelector<HTMLElement>("select,input")?.focus();
    else current?.focus();
  };
  const labels: Record<string, string> = {
    titulo: "Instrução",
    descricao: "Descrição liberada",
    responsavel_id: "Responsável",
    acao_id: "Ação existente",
    prazo: "Prazo",
    liberado: "Liberação do conteúdo",
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || medida.acao_id) return;
    setError(null);
    const parsed = vincularAcaoEstudoSchema.safeParse({
      organization_id: org,
      chave: crypto.randomUUID(),
      medida_id: medida.id,
      ...(modo === "existente"
        ? { acao_id: acaoId || null }
        : {
            titulo,
            descricao,
            responsavel_id: responsavelId || undefined,
            prazo: prazo || null,
            prioridade,
            exige_verificacao: exigeVerificacao,
          }),
    });
    const next: Record<string, string> = {};
    if (modo === "existente" && !acaoId)
      next["acao_id"] = "Selecione uma ação existente autorizada.";
    if (!parsed.success && (modo === "criar" || acaoId))
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
    if (modo === "criar" && !liberado)
      next["liberado"] = "Confirme a liberação das instruções para os responsáveis pela ação.";
    if (Object.keys(next).length || !parsed.success) {
      setErrors(next);
      requestAnimationFrame(() => focus(Object.keys(next)[0] ?? "titulo"));
      return;
    }
    setErrors({});
    setBusy(true);
    submitLock.current = true;
    try {
      const { chave: _key, ...payload } = parsed.data;
      await save({ data: { ...payload, chave: commandKey(payload) } });
      await invalidarEstudos(queryClient, org);
      setDirty(false);
      await onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível vincular a ação. Seu preenchimento foi preservado.",
      );
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[data-save-error="true"]')?.focus(),
      );
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }
  return (
    <OperationalDialog
      open
      title="Vincular ação operacional"
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
          A ação usa o cadastro operacional existente. O vínculo acompanha a mesma medida nas
          próximas revisões. A análise técnica permanece no estudo; descreva somente instruções
          liberadas à equipe.
        </p>
        {medida.acao_id && (
          <p role="status" className="rounded border border-border p-3 text-sm">
            Esta medida já possui uma ação vinculada. Consulte a ação na ficha do estudo.
          </p>
        )}
        {!!Object.keys(errors).length && (
          <div role="alert" className="rounded border border-destructive p-3 text-sm">
            <p>Confira os campos:</p>
            <ul>
              {Object.entries(errors).map(([key, message]) => (
                <li key={key}>
                  <button
                    type="button"
                    className="min-h-11 text-left underline"
                    onClick={() => focus(key)}
                  >
                    {labels[key] ?? key}: {message}
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
              O formulário foi mantido. Repetir o mesmo conteúdo recupera o vínculo sem criar outra
              ação.
            </p>
          </div>
        )}
        <fieldset disabled={busy || !!medida.acao_id} className="space-y-4">
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="mb-1 font-medium">Como deseja atender esta medida?</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={`${uid}-modo`}
                value="criar"
                checked={modo === "criar"}
                onChange={() => {
                  setModo("criar");
                  setErrors({});
                }}
              />{" "}
              Criar ação
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={`${uid}-modo`}
                value="existente"
                checked={modo === "existente"}
                onChange={() => {
                  setModo("existente");
                  setErrors({});
                }}
              />{" "}
              Vincular ação existente
            </label>
          </fieldset>
          {modo === "existente" ? (
            <div id={idFor("acao_id")}>
              <EntityPicker
                label="Ação existente"
                value={acaoId}
                required
                name="acao_id"
                error={errors["acao_id"]}
                queryKey={["estudo-opcoes", org, "acoes"]}
                load={async (busca, signal) =>
                  (await options({ data: { organization_id: org, tipo: "acoes", busca }, signal }))
                    .rows
                }
                onChange={(option) => {
                  setDirty(true);
                  setAcaoId(option?.id ?? "");
                }}
              />
            </div>
          ) : (
            <>
              <label htmlFor={idFor("titulo")} className="nx-est-label grid gap-1 text-sm">
                Instrução para a equipe *
                <input
                  {...field("titulo")}
                  required
                  maxLength={200}
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
                {feedback("titulo")}
              </label>
              <label htmlFor={idFor("descricao")} className="nx-est-label grid gap-1 text-sm">
                Descrição liberada
                <textarea
                  {...field("descricao")}
                  rows={4}
                  maxLength={4000}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
                {feedback("descricao")}
              </label>
              <div id={idFor("responsavel_id")}>
                <EntityPicker
                  label="Responsável pela ação"
                  value={responsavelId}
                  required
                  name="responsavel_id"
                  error={errors["responsavel_id"]}
                  queryKey={["estudo-opcoes", org, "pessoas"]}
                  load={async (busca, signal) =>
                    (
                      await options({
                        data: { organization_id: org, tipo: "pessoas", busca },
                        signal,
                      })
                    ).rows
                  }
                  onChange={(option) => {
                    setDirty(true);
                    setResponsavelId(option?.id ?? "");
                  }}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label htmlFor={idFor("prazo")} className="nx-est-label grid gap-1 text-sm">
                  Prazo
                  <input
                    {...field("prazo")}
                    type="date"
                    value={prazo}
                    onChange={(e) => setPrazo(e.target.value)}
                  />
                  {feedback("prazo")}
                </label>
                <label htmlFor={idFor("prioridade")} className="nx-est-label grid gap-1 text-sm">
                  Prioridade
                  <select
                    {...field("prioridade")}
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value as EstudoMedida["prioridade"])}
                  >
                    {Object.entries(prioridadesMedida).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {feedback("prioridade")}
                </label>
              </div>
              <label className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={exigeVerificacao}
                  onChange={(e) => setExigeVerificacao(e.target.checked)}
                />
                <span>Exigir verificação por outro responsável autorizado</span>
              </label>
              <label
                htmlFor={idFor("liberado")}
                className="flex min-h-11 items-start gap-2 text-sm"
              >
                <input
                  id={idFor("liberado")}
                  name="liberado"
                  type="checkbox"
                  className="mt-1"
                  checked={liberado}
                  aria-invalid={!!errors["liberado"]}
                  aria-describedby={errors["liberado"] ? `${idFor("liberado")}-error` : undefined}
                  onChange={(e) => setLiberado(e.target.checked)}
                />
                <span>
                  Conferi as instruções e autorizo seu acesso pelos responsáveis da ação, sem
                  incluir a análise privada.
                </span>
              </label>
              {feedback("liberado")}
            </>
          )}
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <Dialog.Close asChild>
            <ActionButton variant="ghost" disabled={busy}>
              Voltar sem vincular
            </ActionButton>
          </Dialog.Close>
          <ActionButton type="submit" loading={busy} disabled={!!medida.acao_id}>
            {modo === "existente" ? "Vincular ação" : "Criar e vincular ação"}
          </ActionButton>
        </div>
      </form>
    </OperationalDialog>
  );
}
