import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { rotaDisponivel } from "@/lib/nexus-nav";
import { ActionButton, ErrorState } from "@/components/nexus/Page";
import { EntityPicker } from "@/components/nexus/EntityPicker";
import { OperationalDialog, fieldClass } from "@/features/operacao/components";
import { buscarOpcoesEstudo } from "./estudos.functions";
import { comandoEstudoSchema } from "./schemas";
import { tiposEstudo, prioridadesMedida } from "./domain";
import type { ComandoEstudo, EstudoDetalhe, EstudoMedida, EstudoPerigo } from "./types";

export type StudyCommand = Omit<ComandoEstudo, "organization_id" | "chave">;
export type StudyEditor = {
  comando: StudyCommand["comando"];
  perigo?: EstudoPerigo;
  medida?: EstudoMedida;
  fonteId?: string;
};
const titles: Record<StudyCommand["comando"], string> = {
  criar: "Criar estudo técnico",
  contexto: "Editar identificação",
  salvar_revisao: "Editar conteúdo e responsabilidade",
  salvar_perigo: "Salvar perigo identificado",
  salvar_medida: "Salvar medida proposta",
  excluir_perigo: "Excluir perigo do rascunho",
  excluir_medida: "Excluir medida do rascunho",
  vincular_fonte: "Vincular fonte autorizada",
  desativar_fonte: "Desativar fonte nesta revisão",
  submeter: "Enviar estudo para revisão",
  devolver: "Devolver para elaboração",
  aprovar: "Aprovar revisão técnica",
  cancelar: "Cancelar revisão",
  nova_revisao: "Adicionar revisão",
};
const labels: Record<string, string> = {
  titulo: "Título",
  tipo: "Tipo de estudo",
  cliente_id: "Cliente",
  unidade_id: "Unidade",
  responsavel_id: "Responsável pelo estudo",
  projeto_id: "Projeto operacional",
  metodo_versao_id: "Método e versão",
  responsavel_tecnico_id: "Responsável técnico",
  revisor_id: "Revisor técnico",
  medida_responsavel: "Responsável pela medida",
  escopo: "Escopo",
  premissas: "Premissas e limitações",
  analise: "Análise técnica",
  conclusao: "Conclusão profissional",
  responsabilidade_tecnica: "Responsabilidade técnica aplicável",
  art_referencia: "Referência de ART ou registro aplicável",
  codigo: "Código do perigo",
  descricao: "Descrição",
  local: "Local ou atividade",
  exposicao: "Exposição e pessoas envolvidas",
  avaliacao: "Avaliação conforme o método",
  fundamento: "Fundamento e evidência",
  prazo: "Prazo proposto",
  prioridade: "Prioridade",
  motivo: "Motivo e decisão",
  justificativa: "Aplicação da fonte neste estudo",
  tipo_fonte: "Tipo de fonte",
  levantamento_revisao_id: "Levantamento aprovado",
  pe_versao_id: "Versão congelada de Projeto de Engenharia",
  documento_id: "Documento emitido",
  visibilidade: "Visibilidade",
};

export function EstudoEditor({
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
  editor: StudyEditor;
  detail?: EstudoDetalhe | undefined;
  busy: boolean;
  error: Error | null;
  execute: (command: StudyCommand) => Promise<boolean>;
  onClose: () => void;
  onCompare: () => Promise<EstudoDetalhe | undefined>;
}) {
  const uid = useId();
  // Freeze the editing base. A focus/polling refetch must not advance expected_version.
  const [base] = useState(detail);
  const l = base?.estudo,
    r = base?.revisao;
  const [cliente, setCliente] = useState(l?.cliente_id ?? "");
  const [unidade, setUnidade] = useState(l?.unidade_id ?? "");
  const [selected, setSelected] = useState<Record<string, string>>({
    responsavel_id: l?.responsavel_id ?? "",
    projeto_id: l?.projeto_id ?? "",
    metodo_versao_id: r?.metodo_versao_id ?? "",
    responsavel_tecnico_id: r?.responsavel_tecnico_id ?? "",
    revisor_id: r?.revisor_id ?? "",
    medida_responsavel: editor.medida?.responsavel_id ?? "",
  });
  const [fonteTipo, setFonteTipo] = useState<"levantamento" | "projeto_engenharia" | "documento">(
    "levantamento",
  );
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [comparison, setComparison] = useState<EstudoDetalhe | null>(null);
  const [compareError, setCompareError] = useState<Error | null>(null);
  const [comparing, setComparing] = useState(false);
  const form = useRef<HTMLFormElement>(null),
    feedback = useRef<HTMLDivElement>(null);
  const load = useServerFn(buscarOpcoesEstudo);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  const cmd = editor.comando,
    title = titles[cmd];
  const stateText = (name: string) =>
    errors[name] ? (
      <span id={`${uid}-${name}-error`} className="text-xs text-destructive">
        {errors[name]}
      </span>
    ) : null;
  const props = (name: string) => ({
    id: `${uid}-${name}`,
    name,
    className: fieldClass,
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `${uid}-${name}-error` : undefined,
  });
  const field = (name: string, initial: string = "", multiline = false, hint?: string) => (
    <div className="grid gap-1 text-sm">
      <label htmlFor={`${uid}-${name}`}>{labels[name] || name}</label>
      {multiline ? (
        <textarea
          {...props(name)}
          aria-describedby={
            [hint ? `${uid}-${name}-hint` : "", errors[name] ? `${uid}-${name}-error` : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          defaultValue={initial}
          rows={name === "analise" ? 8 : 4}
        />
      ) : (
        <input
          {...props(name)}
          aria-describedby={
            [hint ? `${uid}-${name}-hint` : "", errors[name] ? `${uid}-${name}-error` : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          defaultValue={initial}
          type={name === "prazo" ? "date" : "text"}
        />
      )}
      {hint && (
        <small id={`${uid}-${name}-hint`} className="text-muted-foreground">
          {hint}
        </small>
      )}
      {stateText(name)}
    </div>
  );
  const picker = (
    name: string,
    tipo: Parameters<typeof load>[0]["data"]["tipo"],
    initialLabel?: string,
  ) => (
    <EntityPicker
      label={labels[name] || name}
      name={name}
      value={
        name === "cliente_id" ? cliente : name === "unidade_id" ? unidade : selected[name] || ""
      }
      initialLabel={initialLabel}
      error={errors[name]}
      required={["cliente_id", "unidade_id", "responsavel_id", "responsavel_tecnico_id"].includes(
        name,
      )}
      disabled={tipo === "unidades" && !cliente}
      queryKey={["estudo-opcoes", org, tipo, cliente, unidade]}
      load={async (busca, signal) =>
        (
          await load({
            data: {
              organization_id: org,
              tipo,
              busca,
              cliente_id: cliente || null,
              unidade_id: unidade || null,
            },
            signal,
          })
        ).rows
      }
      onChange={(option) => {
        setDirty(true);
        const value = option?.id || "";
        if (name === "cliente_id") {
          setCliente(value);
          setUnidade("");
          setSelected((s) => ({ ...s, projeto_id: "" }));
        } else if (name === "unidade_id") {
          setUnidade(value);
          setSelected((s) => ({ ...s, projeto_id: "" }));
        } else setSelected((s) => ({ ...s, [name]: value }));
      }}
    />
  );
  const select = (name: string, options: Record<string, string>, initial: string) => (
    <div className="grid gap-1 text-sm">
      <label htmlFor={`${uid}-${name}`}>{labels[name] || name}</label>
      <select {...props(name)} defaultValue={initial}>
        {Object.entries(options).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      {stateText(name)}
    </div>
  );
  const reasonCommands = ["desativar_fonte", "devolver", "aprovar", "cancelar", "nova_revisao"];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const common = {
      comando: cmd,
      ...(l && r
        ? {
            estudo_id: l.id,
            revisao_id: r.id,
            expected_version: cmd === "contexto" ? l.version : r.version,
          }
        : {}),
    };
    let payload: StudyCommand = common;
    if (cmd === "criar" || cmd === "contexto")
      payload = {
        ...common,
        titulo: text("titulo"),
        responsavel_id: selected["responsavel_id"] || null,
        projeto_id: selected["projeto_id"] || null,
        visibilidade: text("visibilidade") as "organizacao" | "restrito",
        ...(cmd === "criar"
          ? {
              cliente_id: cliente,
              unidade_id: unidade,
              tipo: text("tipo") as ComandoEstudo["tipo"],
              metodo_versao_id: selected["metodo_versao_id"] || null,
              escopo: text("escopo"),
            }
          : {}),
      };
    if (cmd === "salvar_revisao")
      payload = {
        ...common,
        metodo_versao_id: selected["metodo_versao_id"] || null,
        responsavel_tecnico_id: selected["responsavel_tecnico_id"] || "",
        revisor_id: selected["revisor_id"] || null,
        escopo: text("escopo"),
        premissas: text("premissas"),
        analise: text("analise"),
        conclusao: text("conclusao"),
        responsabilidade_tecnica: text("responsabilidade_tecnica"),
        art_referencia: text("art_referencia"),
      };
    if (cmd === "salvar_perigo")
      payload = {
        ...common,
        perigo_id: editor.perigo?.id ?? null,
        expected_version: editor.perigo?.version ?? null,
        codigo: text("codigo"),
        descricao: text("descricao"),
        local: text("local"),
        exposicao: text("exposicao"),
        avaliacao: text("avaliacao"),
        critico: data.get("critico") === "on",
      };
    if (cmd === "salvar_medida")
      payload = {
        ...common,
        perigo_id: editor.perigo?.id ?? editor.medida?.perigo_id,
        medida_id: editor.medida?.id ?? null,
        expected_version: editor.medida?.version ?? null,
        descricao: text("descricao"),
        fundamento: text("fundamento"),
        prioridade: text("prioridade") as ComandoEstudo["prioridade"],
        responsavel_id: selected["medida_responsavel"] || null,
        prazo: text("prazo") || null,
        exige_acao: data.get("exige_acao") === "on",
      };
    if (cmd === "excluir_perigo")
      payload = {
        ...common,
        perigo_id: editor.perigo?.id,
        expected_version: editor.perigo?.version ?? null,
        expected_revision_version: r?.version,
      };
    if (cmd === "excluir_medida")
      payload = {
        ...common,
        medida_id: editor.medida?.id,
        expected_version: editor.medida?.version ?? null,
      };
    if (cmd === "vincular_fonte")
      payload = {
        ...common,
        tipo_fonte: fonteTipo,
        justificativa: text("justificativa"),
        ...(fonteTipo === "levantamento"
          ? { levantamento_revisao_id: selected["levantamento_revisao_id"] || null }
          : fonteTipo === "projeto_engenharia"
            ? { pe_versao_id: selected["pe_versao_id"] || null }
            : { documento_id: selected["documento_id"] || null }),
      };
    if (cmd === "desativar_fonte") payload = { ...common, fonte_id: editor.fonteId };
    if (reasonCommands.includes(cmd)) payload = { ...payload, motivo: text("motivo") };
    const parsed = comandoEstudoSchema.safeParse({
      ...payload,
      organization_id: org,
      chave: crypto.randomUUID(),
    });
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        found[key] ??= issue.message;
      }
      setErrors(found);
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setErrors({});
    if (await execute(payload)) {
      setDirty(false);
      onClose();
    }
  }
  let content: ReactNode;
  if (cmd === "criar" || cmd === "contexto")
    content = (
      <>
        {field("titulo", l?.titulo)}
        {cmd === "criar" && (
          <>
            {select("tipo", tiposEstudo, "apreciacao_riscos")}
            <div className="nx-est-form-grid">
              {picker("cliente_id", "clientes", l?.cliente_nome || undefined)}
              {picker("unidade_id", "unidades", l?.unidade_nome || undefined)}
            </div>
          </>
        )}
        {picker("responsavel_id", "pessoas", l?.responsavel_nome || undefined)}
        {select(
          "visibilidade",
          {
            organizacao: "Engenharia da organização, respeitando as fontes",
            restrito: "Responsáveis, revisor e administradores autorizados",
          },
          l?.visibilidade || "organizacao",
        )}
        <details className="nx-est-details">
          <summary>Contexto e método</summary>
          <div className="mt-4 grid gap-4">
            {picker("projeto_id", "projetos")}
            {cmd === "criar" && (
              <>
                {picker("metodo_versao_id", "metodos")}
                {field("escopo", "", true)}
              </>
            )}
          </div>
        </details>
      </>
    );
  else if (cmd === "salvar_revisao")
    content = (
      <>
        <p className="text-sm text-muted-foreground">
          O método e as fontes devem ser conferidos pelo profissional responsável. O cadastro não
          substitui ART ou autorização profissional.
        </p>
        {picker(
          "metodo_versao_id",
          "metodos",
          base?.metodo ? `${base.metodo.nome} · V${base.metodo.numero}` : undefined,
        )}
        <div className="nx-est-form-grid">
          {picker("responsavel_tecnico_id", "pessoas", r?.responsavel_tecnico_nome || undefined)}
          {picker("revisor_id", "pessoas", r?.revisor_nome || undefined)}
        </div>
        {field("escopo", r?.escopo, true)}
        {field("premissas", r?.premissas, true)}
        {field("analise", r?.analise, true)}
        {field("conclusao", r?.conclusao, true)}
        {field("responsabilidade_tecnica", r?.responsabilidade_tecnica, true)}
        {field(
          "art_referencia",
          r?.art_referencia,
          false,
          "Somente uma referência real quando aplicável. Nenhum registro oficial é gerado pelo sistema.",
        )}
      </>
    );
  else if (cmd === "salvar_perigo")
    content = (
      <>
        {field("codigo", editor.perigo?.codigo)}
        {field("descricao", editor.perigo?.descricao, true)}
        {field("local", editor.perigo?.local)}
        {field("exposicao", editor.perigo?.exposicao, true)}
        {field(
          "avaliacao",
          editor.perigo?.avaliacao,
          true,
          "Registre a avaliação pelo método conferido; o sistema não atribui um score automático.",
        )}
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="critico" defaultChecked={editor.perigo?.critico} />
          Condição crítica identificada pelo responsável
        </label>
        <p className="text-sm text-muted-foreground">
          As medidas são registradas dentro deste perigo após salvar. A criticidade não cria
          interdição automática de um ativo.
        </p>
      </>
    );
  else if (cmd === "salvar_medida")
    content = (
      <>
        <p className="text-sm">
          Perigo: <strong>{editor.perigo?.codigo || "Identificado nesta revisão"}</strong>
        </p>
        {field("descricao", editor.medida?.descricao, true)}
        {field("fundamento", editor.medida?.fundamento, true)}
        {select("prioridade", prioridadesMedida, editor.medida?.prioridade || "normal")}
        {picker("medida_responsavel", "pessoas", editor.medida?.responsavel_nome || undefined)}
        {field("prazo", editor.medida?.prazo || "")}
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="exige_acao"
            defaultChecked={editor.medida?.exige_acao ?? true}
          />
          Esta medida exige uma ação operacional
        </label>
        <p className="text-sm text-muted-foreground">
          A ação é liberada separadamente com instruções próprias. Conteúdo técnico privado não é
          copiado automaticamente à equipe.
        </p>
      </>
    );
  else if (cmd === "vincular_fonte")
    content = (
      <>
        <div className="grid gap-1 text-sm">
          <label htmlFor={`${uid}-tipo_fonte`}>Tipo de fonte</label>
          <select
            {...props("tipo_fonte")}
            value={fonteTipo}
            onChange={(e) => {
              setFonteTipo(e.target.value as typeof fonteTipo);
              setSelected((s) => ({
                ...s,
                levantamento_revisao_id: "",
                pe_versao_id: "",
                documento_id: "",
              }));
            }}
          >
            <option value="levantamento">Levantamento aprovado</option>
            <option value="projeto_engenharia">Projeto de Engenharia · versão congelada</option>
            <option value="documento">Documento emitido</option>
          </select>
          {stateText("tipo_fonte")}
        </div>
        {fonteTipo === "levantamento"
          ? picker("levantamento_revisao_id", "levantamentos")
          : fonteTipo === "projeto_engenharia"
            ? picker("pe_versao_id", "projetos_engenharia")
            : picker("documento_id", "documentos")}
        {fonteTipo === "projeto_engenharia" && (
          <p className="text-sm text-muted-foreground">
            Versões antigas sem empresa e unidade identificadas no snapshot não aparecem como fonte.{" "}
            {rotaDisponivel("/projetos-engenharia") ? (
              <>
                <Link to="/projetos-engenharia" className="text-primary underline">
                  Abra o acervo
                </Link>
                , confira o contexto e prepare uma nova revisão congelada; a anterior permanece
                preservada.
              </>
            ) : (
              "Projetos de Engenharia está temporariamente desativado. As fontes já vinculadas e as versões congeladas disponíveis permanecem preservadas."
            )}
          </p>
        )}
        {fonteTipo === "documento" && (
          <p className="text-sm text-muted-foreground">
            O documento emitido precisa identificar empresa e unidade por IDs no snapshot.
            Documentos comerciais antigos sem esse contexto permanecem na biblioteca; seu uso como
            fonte operacional depende de nova emissão contextual pelo fluxo documental.
          </p>
        )}
        {field("justificativa", "", true)}
        <p className="text-sm text-muted-foreground">
          Acesso ao estudo depende das permissões atuais de todas as fontes, inclusive as
          históricas. O vínculo preserva identidade, versão e hash.
        </p>
      </>
    );
  else
    content = (
      <>
        {cmd.startsWith("excluir_") && (
          <p className="text-sm">
            Excluir “{editor.perigo?.codigo || editor.medida?.descricao}” remove o conteúdo do
            rascunho atual. Submissões e revisões anteriores continuam preservadas.
          </p>
        )}
        {cmd === "desativar_fonte" && (
          <p className="text-sm">
            A fonte deixa de fundamentar a revisão atual. Sua referência e a proteção de acesso das
            submissões anteriores permanecem no histórico.
          </p>
        )}
        {cmd === "submeter" && (
          <p className="text-sm">
            O servidor valida método, responsáveis, conteúdo e requisitos. A submissão recebe
            snapshot e hash; editar novamente exige devolução pelo revisor.
          </p>
        )}
        {cmd === "aprovar" && (
          <p className="text-sm">
            A decisão fica atribuída ao revisor profissional designado. A revisão aprovada e as
            evidências são preservadas; a emissão documental tem fluxo próprio.
          </p>
        )}
        {cmd === "nova_revisao" && (
          <p className="text-sm">
            Abre um novo rascunho a partir desta revisão. A revisão aprovada e suas decisões
            permanecem imutáveis.
          </p>
        )}
      </>
    );
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
        onChange={() => setDirty(true)}
        data-dirty={dirty}
        aria-busy={busy}
      >
        <fieldset disabled={busy} className="grid min-w-0 gap-5">
          {!!Object.keys(errors).length && (
            <div role="alert" className="rounded border border-destructive p-3 text-sm">
              <p className="font-semibold">Confira os campos antes de continuar.</p>
              <ul className="mt-2 list-disc pl-5">
                {Object.entries(errors).map(([key, message]) => (
                  <li key={key}>
                    {labels[key] || key}: {message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {content}
          {reasonCommands.includes(cmd) && field("motivo", "", true)}
        </fieldset>
        <div ref={feedback} tabIndex={-1} className="mt-4" aria-live="polite">
          {error && (
            <>
              <ErrorState error={error} />
              <p className="mt-2 text-sm">
                O servidor não confirmou esta operação. Seu preenchimento foi mantido.
              </p>
              <ActionButton
                variant="ghost"
                disabled={comparing}
                onClick={async () => {
                  setComparing(true);
                  setCompareError(null);
                  try {
                    const current = await onCompare();
                    setComparison(current || null);
                  } catch (e) {
                    setCompareError(
                      e instanceof Error
                        ? e
                        : new Error("Não foi possível consultar a revisão atual."),
                    );
                  } finally {
                    setComparing(false);
                  }
                }}
              >
                {comparing ? "Consultando…" : "Comparar com a versão atual"}
              </ActionButton>
              {compareError && <ErrorState error={compareError} />}
              {comparison && (
                <div className="mt-3 rounded border border-border p-3 text-sm">
                  <p>
                    Servidor: V{comparison.revisao.numero} · versão de concorrência{" "}
                    {comparison.revisao.version}. Formulário: {r?.version ?? "novo"}.
                  </p>
                  <p className="mt-2 whitespace-pre-wrap">
                    {comparison.revisao.escopo || comparison.estudo.titulo}
                  </p>
                  <p className="mt-2 text-muted-foreground">
                    Copie o que precisar antes de fechar e recarregar. Esta comparação não
                    sobrescreve seu preenchimento.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <ActionButton type="submit" disabled={busy}>
            {busy ? "Aguardando confirmação…" : title}
          </ActionButton>
          <Dialog.Close asChild>
            <ActionButton variant="ghost" disabled={busy}>
              Voltar sem salvar
            </ActionButton>
          </Dialog.Close>
        </div>
      </form>
    </OperationalDialog>
  );
}
