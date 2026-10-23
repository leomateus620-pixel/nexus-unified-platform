import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as Dialog from "@radix-ui/react-dialog";
import { ActionButton, ErrorState } from "@/components/nexus/Page";
import { EntityPicker } from "@/components/nexus/EntityPicker";
import { OperationalDialog } from "@/features/operacao/components";
import { buscarOpcoesLevantamento } from "./levantamentos.functions";
import { comandoLevantamentoSchema, unidadesPorGrandeza } from "./schemas";
import type {
  ComandoLevantamento,
  LevantamentoDetalhe,
  LevantamentoMedicao,
  LevantamentoPonto,
} from "./types";

export type LevCommand = Omit<ComandoLevantamento, "organization_id" | "chave">;
export type LevEditor = {
  tipo: "criar" | "contexto" | "ponto" | "medicao" | "transicao";
  ponto?: LevantamentoPonto;
  medicao?: LevantamentoMedicao;
  comando?: LevCommand["comando"];
};
const titles: Record<string, string> = {
  criar: "Criar levantamento",
  contexto: "Editar contexto",
  ponto: "Salvar ponto",
  medicao: "Salvar medida",
  programar: "Programar visita",
  iniciar_coleta: "Iniciar coleta",
  submeter: "Enviar para revisão",
  devolver: "Devolver para coleta",
  aprovar: "Aprovar revisão",
  cancelar: "Cancelar revisão",
  nova_revisao: "Adicionar revisão",
  excluir_ponto: "Excluir ponto do rascunho",
  excluir_medicao: "Excluir medida do rascunho",
};
const labels: Record<string, string> = {
  cliente_id: "Cliente",
  unidade_id: "Unidade",
  responsavel_id: "Responsável",
  finalidade: "Finalidade",
  codigo: "Código local",
  nome: "Nome",
  chave_medicao: "Identificação da medida",
  valor: "Valor",
  precisao: "Precisão",
  unidade: "Unidade",
  grandeza: "Grandeza",
  natureza: "Natureza",
  motivo: "Motivo",
  fim_previsto: "Fim previsto",
  inicio_previsto: "Início previsto",
};
function localDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function iso(value: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : value;
}

export function LevantamentoEditor({
  org,
  editor,
  detail,
  busy,
  error,
  execute,
  onClose,
  onCompare,
}: {
  org: string;
  editor: LevEditor;
  detail?: LevantamentoDetalhe | undefined;
  busy: boolean;
  error: Error | null;
  execute: (data: LevCommand) => Promise<boolean>;
  onClose: () => void;
  onCompare: () => Promise<LevantamentoDetalhe | undefined>;
}) {
  const id = useId();
  // Polling must not advance the version beneath an unsaved form.
  const [baseDetail] = useState(detail);
  const initial = baseDetail?.levantamento;
  const [cliente, setCliente] = useState(
    editor.tipo === "contexto" ? (initial?.cliente_id ?? "") : "",
  );
  const [unidade, setUnidade] = useState(
    editor.tipo === "contexto" ? (initial?.unidade_id ?? "") : "",
  );
  const [responsavel, setResponsavel] = useState(
    editor.tipo === "contexto" ? (initial?.responsavel_id ?? "") : "",
  );
  const [proposta, setProposta] = useState(initial?.proposta_id ?? "");
  const [projeto, setProjeto] = useState(initial?.projeto_id ?? "");
  const [modelo, setModelo] = useState("");
  const [grandeza, setGrandeza] = useState<LevantamentoMedicao["grandeza"]>(
    editor.medicao?.grandeza ?? "comprimento",
  );
  const [origem, setOrigem] = useState<LevantamentoMedicao["origem"]>(
    editor.medicao?.origem ?? "campo",
  );
  const [natureza, setNatureza] = useState<LevantamentoMedicao["natureza"]>(
    editor.medicao?.natureza ?? "medida",
  );
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [comparison, setComparison] = useState<LevantamentoDetalhe | null>(null);
  const [compareError, setCompareError] = useState<Error | null>(null);
  const [comparing, setComparing] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  const loadOptions = useServerFn(buscarOpcoesLevantamento);
  const command =
    editor.tipo === "criar"
      ? "criar"
      : editor.tipo === "contexto"
        ? "contexto"
        : editor.tipo === "ponto"
          ? "salvar_ponto"
          : editor.tipo === "medicao"
            ? "salvar_medicao"
            : editor.comando!;
  const title = titles[editor.tipo === "transicao" ? command : editor.tipo] || "Salvar alteração";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const revision = baseDetail?.revisao;
  function field(name: string, label: string, control: ReactNode) {
    return (
      <label className="nx-lev-label" htmlFor={`${id}-${name}`}>
        {label}
        {control}
        {errors[name] && (
          <span id={`${id}-${name}-error`} className="text-xs text-destructive">
            {errors[name]}
          </span>
        )}
      </label>
    );
  }
  const props = (name: string) => ({
    id: `${id}-${name}`,
    name,
    className: "nx-lev-input",
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `${id}-${name}-error` : undefined,
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "");
    const body: LevCommand = { comando: command };
    if (baseDetail)
      Object.assign(body, {
        levantamento_id: initial!.id,
        revisao_id: revision!.id,
        expected_version: revision!.version,
      });
    if (["criar", "contexto"].includes(editor.tipo))
      Object.assign(body, {
        cliente_id: cliente,
        unidade_id: unidade,
        finalidade: text("finalidade"),
        responsavel_id: responsavel,
        proposta_id: proposta || null,
        projeto_id: projeto || null,
        ...(editor.tipo === "criar" ? { modelo_versao_id: modelo || null } : {}),
        ...(editor.tipo === "contexto" ? { expected_version: initial!.version } : {}),
      });
    if (editor.tipo === "ponto")
      Object.assign(body, {
        ponto_id: editor.ponto?.id ?? null,
        expected_version: editor.ponto?.version ?? null,
        codigo: text("codigo"),
        nome: text("nome"),
        area: text("area"),
        localizacao: text("localizacao"),
        tipo_sistema: text("tipo_sistema"),
        observacoes: text("observacoes"),
        exige_foto: data.has("exige_foto"),
      });
    if (editor.tipo === "medicao")
      Object.assign(body, {
        ponto_id: editor.ponto!.id,
        medicao_id: editor.medicao?.id ?? null,
        expected_version: editor.medicao?.version ?? null,
        chave_medicao: text("chave_medicao"),
        grandeza,
        valor: text("valor") || null,
        precisao: text("precisao") || null,
        unidade: text("unidade"),
        metodo: text("metodo"),
        origem,
        natureza,
        coletado_em: text("coletado_em") ? iso(text("coletado_em")) : null,
        observacoes: text("observacoes"),
      });
    if (command === "programar")
      Object.assign(body, {
        inicio_previsto: iso(text("inicio_previsto")),
        fim_previsto: iso(text("fim_previsto")),
      });
    if (editor.tipo === "transicao") {
      if (editor.medicao)
        Object.assign(body, {
          medicao_id: editor.medicao.id,
          expected_version: editor.medicao.version,
        });
      if (editor.ponto)
        Object.assign(body, {
          ponto_id: editor.ponto.id,
          ...(command === "excluir_ponto"
            ? {
                expected_version: editor.ponto.version,
                expected_revision_version: revision!.version,
              }
            : {}),
        });
      body.motivo = text("motivo");
      if (command === "devolver" && text("pendencia").trim())
        body.pendencias = [{ descricao: text("pendencia") }];
    }
    const checked = comandoLevantamentoSchema.safeParse({
      ...body,
      organization_id: org,
      chave: crypto.randomUUID(),
    });
    if (!checked.success) {
      const messages: Record<string, string> = {};
      for (const issue of checked.error.issues) messages[String(issue.path[0])] ??= issue.message;
      setErrors(messages);
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>(`[name="${Object.keys(messages)[0]}"]`)?.focus(),
      );
      return;
    }
    setErrors({});
    if (await execute(body)) {
      setDirty(false);
      onClose();
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
        className="nx-lev-forms"
        noValidate
        data-dirty={dirty}
        aria-busy={busy}
        onChange={(event) => {
          const target = event.nativeEvent.target;
          if (
            (target instanceof HTMLInputElement ||
              target instanceof HTMLSelectElement ||
              target instanceof HTMLTextAreaElement) &&
            target.name
          )
            setDirty(true);
        }}
        onSubmit={submit}
      >
        <fieldset className="nx-lev-forms min-w-0" disabled={busy}>
          {!!Object.keys(errors).length && (
            <div role="alert" className="rounded border border-destructive p-3 text-sm">
              <p>Confira os campos antes de salvar:</p>
              <ul className="list-inside list-disc">
                {Object.entries(errors).map(([key, message]) => (
                  <li key={key}>
                    {labels[key] || key}: {message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <div
              ref={feedback}
              role="alert"
              tabIndex={-1}
              className="space-y-2 rounded border border-destructive p-3 text-sm"
            >
              <p>{error.message}</p>
              <p>O servidor não confirmou esta alteração. Seu preenchimento está preservado.</p>
              {/alter|vers|conflit|recarreg/i.test(error.message) && (
                <ActionButton
                  variant="ghost"
                  loading={comparing}
                  onClick={async () => {
                    setComparing(true);
                    setCompareError(null);
                    try {
                      setComparison((await onCompare()) ?? null);
                    } catch (e) {
                      setCompareError(
                        e instanceof Error
                          ? e
                          : new Error("Não foi possível consultar a versão atual."),
                      );
                    } finally {
                      setComparing(false);
                    }
                  }}
                >
                  Consultar versão atual para comparar
                </ActionButton>
              )}
            </div>
          )}
          {comparison && (
            <div className="rounded border border-info p-3 text-sm" role="status">
              <p>
                Servidor: revisão V{comparison.revisao.numero}, versão {comparison.revisao.version},
                estado {comparison.revisao.estado.replaceAll("_", " ")}. Seu formulário usa versão{" "}
                {revision?.version ?? "nova"}.
              </p>
              <p>Finalidade atual: {comparison.levantamento.finalidade}</p>
              {editor.ponto && (
                <p>
                  Ponto atual:{" "}
                  {comparison.pontos.find((p) => p.id === editor.ponto!.id)?.nome ??
                    "Não está mais disponível nesta revisão"}
                </p>
              )}
              {editor.medicao && (
                <p>
                  Medida atual:{" "}
                  {comparison.medicoes.find((m) => m.id === editor.medicao!.id)?.valor ??
                    "Sem valor"}{" "}
                  {comparison.medicoes.find((m) => m.id === editor.medicao!.id)?.unidade}
                </p>
              )}
              <p>
                Compare e copie seu trabalho antes de descartar e reabrir a versão atual. Não haverá
                sobrescrita automática.
              </p>
            </div>
          )}
          {compareError && <ErrorState error={compareError} />}
          {["criar", "contexto"].includes(editor.tipo) && (
            <>
              {editor.tipo === "criar" && (
                <div className="nx-lev-form-grid">
                  <EntityPicker
                    label="Cliente"
                    name="cliente_id"
                    error={errors["cliente_id"]}
                    required
                    value={cliente}
                    queryKey={["levantamento-opcoes", org, "clientes"]}
                    load={(busca, signal) =>
                      loadOptions({
                        data: { organization_id: org, tipo: "clientes", busca },
                        signal,
                      })
                    }
                    onChange={(value) => {
                      setCliente(value?.id ?? "");
                      setUnidade("");
                      setProposta("");
                      setProjeto("");
                      setDirty(true);
                    }}
                  />
                  <EntityPicker
                    key={cliente}
                    label="Unidade"
                    name="unidade_id"
                    error={errors["unidade_id"]}
                    required
                    value={unidade}
                    disabled={!cliente}
                    queryKey={["levantamento-opcoes", org, "unidades", cliente]}
                    load={(busca, signal) =>
                      loadOptions({
                        data: {
                          organization_id: org,
                          tipo: "unidades",
                          busca,
                          cliente_id: cliente,
                        },
                        signal,
                      })
                    }
                    onChange={(value) => {
                      setUnidade(value?.id ?? "");
                      setDirty(true);
                    }}
                  />
                </div>
              )}
              {field(
                "finalidade",
                "Finalidade *",
                <textarea
                  {...props("finalidade")}
                  defaultValue={editor.tipo === "contexto" ? initial?.finalidade : ""}
                  maxLength={2000}
                />,
              )}
              <EntityPicker
                label="Responsável"
                name="responsavel_id"
                error={errors["responsavel_id"]}
                required
                value={responsavel}
                initialLabel={initial?.responsavel_nome ?? undefined}
                queryKey={["levantamento-opcoes", org, "pessoas"]}
                load={(busca, signal) =>
                  loadOptions({ data: { organization_id: org, tipo: "pessoas", busca }, signal })
                }
                onChange={(value) => {
                  setResponsavel(value?.id ?? "");
                  setDirty(true);
                }}
              />
              <details className="rounded border border-border p-3 text-sm">
                <summary className="min-h-11 cursor-pointer">
                  Origem e modelo de coleta (opcional)
                </summary>
                <div className="mt-3 nx-lev-form-grid">
                  <EntityPicker
                    key={`proposta:${cliente}`}
                    label="Proposta de origem"
                    value={proposta}
                    initialLabel={initial?.proposta_id ? "Proposta vinculada" : undefined}
                    disabled={!cliente}
                    queryKey={["levantamento-opcoes", org, "propostas", cliente]}
                    load={(busca, signal) =>
                      loadOptions({
                        data: {
                          organization_id: org,
                          tipo: "propostas",
                          busca,
                          cliente_id: cliente,
                        },
                        signal,
                      })
                    }
                    onChange={(value) => {
                      setProposta(value?.id ?? "");
                      setDirty(true);
                    }}
                  />
                  <EntityPicker
                    key={`projeto:${cliente}`}
                    label="Projeto operacional"
                    value={projeto}
                    initialLabel={initial?.projeto_id ? "Projeto vinculado" : undefined}
                    disabled={!cliente}
                    queryKey={["levantamento-opcoes", org, "projetos", cliente]}
                    load={(busca, signal) =>
                      loadOptions({
                        data: {
                          organization_id: org,
                          tipo: "projetos",
                          busca,
                          cliente_id: cliente,
                        },
                        signal,
                      })
                    }
                    onChange={(value) => {
                      setProjeto(value?.id ?? "");
                      setDirty(true);
                    }}
                  />
                  {editor.tipo === "criar" && (
                    <EntityPicker
                      label="Modelo de coleta"
                      value={modelo}
                      queryKey={["levantamento-opcoes", org, "modelos"]}
                      load={(busca, signal) =>
                        loadOptions({
                          data: { organization_id: org, tipo: "modelos", busca },
                          signal,
                        })
                      }
                      onChange={(value) => {
                        setModelo(value?.id ?? "");
                        setDirty(true);
                      }}
                    />
                  )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  O modelo fica fixado na revisão iniciada. Publicar outra versão não altera esta
                  coleta.
                </p>
              </details>
              <p className="text-xs text-muted-foreground">
                O código será gerado no banco. O responsável usa o cadastro de Pessoas; não é
                necessário ter login.
              </p>
            </>
          )}
          {editor.tipo === "ponto" && (
            <>
              <div className="nx-lev-form-grid">
                {field(
                  "codigo",
                  "Código local *",
                  <input {...props("codigo")} defaultValue={editor.ponto?.codigo} maxLength={40} />,
                )}
                {field(
                  "nome",
                  "Nome do ponto ou área *",
                  <input {...props("nome")} defaultValue={editor.ponto?.nome} maxLength={200} />,
                )}
                {field(
                  "area",
                  "Área",
                  <input {...props("area")} defaultValue={editor.ponto?.area} maxLength={200} />,
                )}
                {field(
                  "tipo_sistema",
                  "Tipo de sistema",
                  <input
                    {...props("tipo_sistema")}
                    defaultValue={editor.ponto?.tipo_sistema}
                    maxLength={120}
                  />,
                )}
              </div>
              {field(
                "localizacao",
                "Localização no local",
                <textarea
                  {...props("localizacao")}
                  defaultValue={editor.ponto?.localizacao}
                  maxLength={1000}
                />,
              )}
              {field(
                "observacoes",
                "Observações",
                <textarea
                  {...props("observacoes")}
                  defaultValue={editor.ponto?.observacoes}
                  maxLength={4000}
                />,
              )}
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  name="exige_foto"
                  type="checkbox"
                  defaultChecked={editor.ponto?.exige_foto}
                />{" "}
                Exigir foto antes de enviar à revisão
              </label>
              <p className="text-xs text-muted-foreground">
                Salve o ponto para adicionar medidas e fotos vinculadas. Alterar sua identificação
                preserva as medidas existentes.
              </p>
            </>
          )}
          {editor.tipo === "medicao" && (
            <>
              <p className="text-sm text-muted-foreground">
                Ponto: {editor.ponto?.codigo} · {editor.ponto?.nome}. Campos de coleta podem ficar
                pendentes no rascunho.
              </p>
              {field(
                "chave_medicao",
                "Identificação da medida *",
                <input
                  {...props("chave_medicao")}
                  defaultValue={editor.medicao?.chave}
                  maxLength={80}
                  placeholder="Ex.: extensão do acesso"
                />,
              )}
              <div className="nx-lev-form-grid">
                {field(
                  "grandeza",
                  "Grandeza *",
                  <select
                    {...props("grandeza")}
                    value={grandeza}
                    onChange={(event) => setGrandeza(event.target.value as typeof grandeza)}
                  >
                    {Object.keys(unidadesPorGrandeza).map((g) => (
                      <option key={g} value={g}>
                        {
                          {
                            comprimento: "Comprimento",
                            area: "Área",
                            contagem: "Contagem",
                            angulo: "Ângulo",
                            forca: "Força",
                          }[g]
                        }
                      </option>
                    ))}
                  </select>,
                )}
                {field(
                  "unidade",
                  "Unidade",
                  <select
                    key={grandeza}
                    {...props("unidade")}
                    defaultValue={
                      editor.medicao?.grandeza === grandeza ? editor.medicao.unidade : ""
                    }
                  >
                    <option value="">Ainda não definida</option>
                    {unidadesPorGrandeza[grandeza].map((u) => (
                      <option key={u} value={u}>
                        {u === "m2" ? "m²" : u === "grau" ? "graus" : u}
                      </option>
                    ))}
                  </select>,
                )}
                {field(
                  "valor",
                  "Valor",
                  <input
                    {...props("valor")}
                    inputMode="decimal"
                    defaultValue={editor.medicao?.valor ?? ""}
                    maxLength={32}
                    placeholder="Ainda não medido"
                  />,
                )}
                {field(
                  "precisao",
                  "Precisão declarada (mesma unidade)",
                  <input
                    {...props("precisao")}
                    inputMode="decimal"
                    defaultValue={editor.medicao?.precisao ?? ""}
                    maxLength={32}
                    placeholder="Ainda não informada"
                  />,
                )}
                {field(
                  "origem",
                  "Origem",
                  <select
                    {...props("origem")}
                    value={origem}
                    onChange={(event) => {
                      const next = event.target.value as typeof origem;
                      setOrigem(next);
                      if (next === "modelo_3d") setNatureza("estimativa");
                    }}
                  >
                    <option value="campo">Coleta em campo</option>
                    <option value="documento">Documento de referência</option>
                    <option value="modelo_3d">Modelo 3D estimado</option>
                  </select>,
                )}
                {field(
                  "natureza",
                  "Natureza",
                  <select
                    {...props("natureza")}
                    value={natureza}
                    onChange={(event) => setNatureza(event.target.value as typeof natureza)}
                  >
                    <option value="medida" disabled={origem === "modelo_3d"}>
                      Medida coletada
                    </option>
                    <option value="estimativa">Estimativa</option>
                  </select>,
                )}
              </div>
              {field(
                "metodo",
                "Método e referência da coleta",
                <textarea
                  {...props("metodo")}
                  defaultValue={editor.medicao?.metodo}
                  maxLength={1000}
                />,
              )}
              {field(
                "coletado_em",
                `Data e horário da coleta (${timezone})`,
                <input
                  {...props("coletado_em")}
                  type="datetime-local"
                  defaultValue={localDate(editor.medicao?.coletado_em)}
                />,
              )}
              {field(
                "observacoes",
                "Observações e pendências",
                <textarea
                  {...props("observacoes")}
                  defaultValue={editor.medicao?.observacoes}
                  maxLength={4000}
                />,
              )}
              <p className="text-xs text-muted-foreground">
                A precisão declarada não é certificação da medida. O servidor valida unidade,
                revisão e permissão antes de salvar.
              </p>
            </>
          )}
          {editor.tipo === "transicao" && (
            <>
              <p className="text-sm">
                {initial?.codigo} · revisão V{revision?.numero}
              </p>
              {command === "programar" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Horários de {timezone}. Programar não aprova o levantamento nem reserva recursos
                    automaticamente.
                  </p>
                  <div className="nx-lev-form-grid">
                    {field(
                      "inicio_previsto",
                      "Início previsto *",
                      <input
                        {...props("inicio_previsto")}
                        type="datetime-local"
                        defaultValue={localDate(revision?.inicio_previsto)}
                      />,
                    )}
                    {field(
                      "fim_previsto",
                      "Fim previsto *",
                      <input
                        {...props("fim_previsto")}
                        type="datetime-local"
                        defaultValue={localDate(revision?.fim_previsto)}
                      />,
                    )}
                  </div>
                </>
              )}
              {command === "aprovar" && (
                <p className="rounded border border-warning p-3 text-sm">
                  A aprovação preservará um snapshot imutável das medidas e evidências desta
                  revisão. Exige capacidade de revisão e pessoa ativa vinculada ao usuário com
                  registro profissional declarado. O cadastro não substitui responsabilidade técnica
                  aplicável.
                </p>
              )}
              {command === "submeter" && (
                <p className="text-sm text-muted-foreground">
                  O banco conferirá campos, unidades, fotos exigidas e uploads pendentes. A coleta
                  fica bloqueada enquanto a revisão estiver em análise.
                </p>
              )}
              {command.startsWith("excluir_") && (
                <p className="rounded border border-warning p-3 text-sm">
                  Excluir {editor.medicao?.chave || editor.ponto?.nome} desta revisão editável. O
                  servidor rejeita a remoção se houver evidência ou vínculo que precisa ser
                  preservado.
                </p>
              )}
              {command === "nova_revisao" && (
                <p className="text-sm text-muted-foreground">
                  A versão aprovada permanece preservada. A nova coleta exige conferência própria;
                  fotos e aprovação anteriores não representam evidência nova.
                </p>
              )}
              {field(
                "motivo",
                ["devolver", "cancelar"].includes(command) ? "Motivo *" : "Comentário da operação",
                <textarea {...props("motivo")} maxLength={4000} />,
              )}
              {command === "devolver" &&
                field(
                  "pendencia",
                  "Pendência para a coleta",
                  <textarea {...props("pendencia")} maxLength={2000} />,
                )}
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Dialog.Close asChild>
              <ActionButton variant="ghost" disabled={busy}>
                Voltar ao levantamento
              </ActionButton>
            </Dialog.Close>
            <ActionButton
              type="submit"
              loading={busy}
              variant={
                command === "cancelar" || command.startsWith("excluir_") ? "danger" : "primary"
              }
            >
              {title}
            </ActionButton>
          </div>
        </fieldset>
      </form>
    </OperationalDialog>
  );
}
