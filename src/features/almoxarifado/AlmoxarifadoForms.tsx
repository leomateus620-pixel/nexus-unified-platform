import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton } from "@/components/nexus/Page";
import { EntityPicker } from "@/components/nexus/EntityPicker";
import { OperationalDialog, fieldClass, useCommandKey } from "@/features/operacao/components";
import { buscarOpcoesAlmoxarifado } from "./almoxarifado.functions";
import { comandoAlmoxarifadoSchema } from "./schemas";
import { condicoesFerramenta } from "./domain";
import type {
  AlmoxarifadoDetalhe,
  CalibracaoFerramenta,
  ComandoAlmoxarifado,
  CustodiaFerramenta,
  OpcaoAlmoxarifado,
  TipoOpcaoAlmoxarifado,
} from "./types";

export type StockEditor = {
  comando: ComandoAlmoxarifado["comando"];
  base?: AlmoxarifadoDetalhe | undefined;
  target?: CustodiaFerramenta | CalibracaoFerramenta | undefined;
};
// eslint-disable-next-line react-refresh/only-export-components -- Workspace and form intentionally share these command labels.
export const stockCommandTitles: Record<StockEditor["comando"], string> = {
  salvar_local: "Salvar local de estoque",
  configurar_produto: "Configurar rastreabilidade do material",
  conferir_evento: "Conferir material recebido ou produzido",
  reclassificar_quarentena: "Conferir material em quarentena",
  transferir: "Transferir material entre locais",
  reservar: "Reservar material para execução",
  retirar: "Registrar retirada de material",
  consumir: "Registrar material consumido",
  devolver: "Devolver sobra de material",
  cancelar_reserva: "Cancelar saldo da reserva",
  estornar_evento: "Estornar recebimento ou produção",
  salvar_ferramenta: "Salvar ferramenta individual",
  alterar_condicao: "Alterar condição da ferramenta",
  reservar_ferramenta: "Reservar ferramenta para uma pessoa",
  retirar_ferramenta: "Retirar ferramenta reservada",
  devolver_ferramenta: "Conferir devolução da ferramenta",
  cancelar_custodia: "Cancelar reserva da ferramenta",
  publicar_politica_calibracao: "Publicar política de calibração",
  registrar_calibracao: "Registrar evidência de calibração",
  conferir_calibracao: "Conferir evidência de calibração",
  criar_inventario: "Registrar contagem de inventário",
  aprovar_inventario: "Aprovar ajuste da contagem",
  cancelar_inventario: "Cancelar contagem de inventário",
};
const labels: Record<string, string> = {
  nome: "Nome",
  descricao: "Descrição",
  produto_id: "Produto do catálogo",
  local_id: "Local de estoque",
  origem_local_id: "Local de origem",
  destino_local_id: "Local de destino",
  pessoa_id: "Pessoa responsável",
  projeto_id: "Projeto operacional",
  op_id: "Ordem de produção",
  recebimento_id: "Recebimento de OC",
  apontamento_id: "Apontamento de produção",
  quantidade: "Quantidade",
  aceita: "Quantidade aceita",
  quarentena: "Quantidade em quarentena",
  rejeitada: "Quantidade rejeitada",
  estoque_minimo: "Estoque mínimo configurado",
  lote: "Lote",
  serie: "Série",
  motivo: "Motivo e conferência",
  reconciliacao: "Conciliação da origem",
  validade: "Validade",
  inicio: "Início previsto",
  fim: "Fim previsto",
  patrimonio: "Patrimônio",
  proprietario: "Propriedade",
  proprietario_nome: "Nome do proprietário",
  politica_calibracao_id: "Política de calibração",
  politica_id: "Política utilizada na calibração",
  condicao: "Condição conferida",
  metodo: "Método e procedimento conferidos",
  fonte: "Fonte, edição e responsável pela referência",
  emissor: "Emissor da evidência",
  execucao: "Data da execução",
  referencia: "Referência do certificado",
  estado: "Decisão da conferência",
  contada: "Quantidade contada",
  destino: "Resultado da conferência",
  expected_version: "Versão aberta",
};
function localDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const d = new Date(value);
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0") +
    "T" +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}
function iso(value: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : value;
}
function openedVersion(detail: AlmoxarifadoDetalhe) {
  if (detail.tipo === "materiais") return detail.registro.politica.version;
  return "version" in detail.registro ? detail.registro.version : null;
}
function calibrationDecisions(
  state: CalibracaoFerramenta["estado"] | undefined,
): Record<string, string> {
  if (state === "enviada") return { em_conferencia: "Iniciar conferência" };
  if (state === "em_conferencia")
    return { validada: "Validar evidência", revogada: "Revogar evidência" };
  if (state === "validada") return { revogada: "Revogar validação" };
  return {};
}

export function StockCommandForm({
  org,
  editor,
  busy,
  error,
  execute,
  onClose,
  onCompare,
}: {
  org: string;
  editor: StockEditor;
  busy: boolean;
  error: Error | null;
  execute: (command: ComandoAlmoxarifado) => Promise<boolean>;
  onClose: () => void;
  onCompare: (material?: {
    tipo: "materiais";
    id: string;
  }) => Promise<AlmoxarifadoDetalhe | undefined>;
}) {
  const uid = useId();
  // Polling does not advance an unsaved form's base or its child target.
  const [initial] = useState(editor);
  const [base, setBase] = useState(initial.base);
  const [target, setTarget] = useState(initial.target);
  const cmd = initial.comando;
  const material = base?.tipo === "materiais" ? base.registro : null;
  const local = base?.tipo === "locais" ? base.registro : null;
  const conference = base?.tipo === "conferencias" ? base.registro : null;
  const reservation = base?.tipo === "reservas" ? base.registro : null;
  const tool = base?.tipo === "ferramentas" ? base.registro : null;
  const inventory = base?.tipo === "inventarios" ? base.registro : null;
  const policy = base?.tipo === "politicas_calibracao" ? base.registro : null;
  const custody = target && "pessoa_id" in target ? target : null;
  const calibration = target && "politica_id" in target ? target : null;
  const onlyLot =
    initial.base?.tipo === "materiais" && initial.base.lotes.length === 1
      ? initial.base.lotes[0]
      : null;
  const initialLocal =
    local?.id ||
    tool?.local_id ||
    conference?.local_id ||
    reservation?.local_id ||
    inventory?.local_id ||
    onlyLot?.local_id ||
    "";
  const [selected, setSelected] = useState<Record<string, string>>({
    produto_id:
      material?.id ||
      tool?.produto_id ||
      conference?.produto_id ||
      reservation?.produto_id ||
      inventory?.produto_id ||
      "",
    local_id: initialLocal,
    origem_local_id: initialLocal,
    destino_local_id: "",
    pessoa_id: custody?.pessoa_id || reservation?.pessoa_id || "",
    projeto_id: reservation?.projeto_id || "",
    op_id: reservation?.op_id || "",
    recebimento_id: conference?.recebimento_id || "",
    apontamento_id: conference?.apontamento_id || "",
    politica_calibracao_id: tool?.politica_calibracao_id || "",
    politica_id: calibration?.politica_id || tool?.politica_calibracao_id || "",
  });
  const [values, setValues] = useState<Record<string, string>>({
    nome: local?.nome || policy?.nome || "",
    descricao: local?.descricao || tool?.descricao || "",
    quantidade: "",
    aceita: "0",
    quarentena: "0",
    rejeitada: "0",
    estoque_minimo: material?.politica.estoque_minimo || "0",
    lote: conference?.lote || reservation?.lote || inventory?.lote || "",
    serie: conference?.serie || "",
    motivo: "",
    reconciliacao: "",
    validade: cmd === "registrar_calibracao" ? "" : localDate(reservation?.validade),
    inicio: "",
    fim: "",
    patrimonio: tool?.patrimonio || "",
    proprietario: tool?.proprietario || "nexus",
    proprietario_nome: tool?.proprietario_nome || "",
    condicao: tool?.condicao || "disponivel",
    metodo: policy?.metodo || "",
    fonte: policy?.fonte || "",
    emissor: "",
    execucao: "",
    referencia: "",
    estado: Object.keys(calibrationDecisions(calibration?.estado))[0] || "",
    contada: "",
    destino: "aceito",
  });
  const [checks, setChecks] = useState({
    ativo: local?.ativo ?? true,
    exige_lote: material?.politica.exige_lote ?? false,
    exige_serie: material?.politica.exige_serie ?? false,
    exige_calibracao: tool?.exige_calibracao ?? false,
    exige_validade: policy?.exige_validade ?? false,
  });
  const [sourceType, setSourceType] = useState<"recebimento" | "apontamento">(
    conference?.apontamento_id ? "apontamento" : "recebimento",
  );
  const [destinationType, setDestinationType] = useState<"projeto" | "op">(
    reservation?.op_id ? "op" : "projeto",
  );
  const [dirty, setDirty] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<AlmoxarifadoDetalhe | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [compareError, setCompareError] = useState<string | null>(null),
    [comparing, setComparing] = useState(false);
  const [timezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "fuso local do navegador",
  );
  const form = useRef<HTMLFormElement>(null),
    feedback = useRef<HTMLDivElement>(null),
    submitLock = useRef(false);
  const validationSummary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  const optionMetadata = useRef(new Map<string, OpcaoAlmoxarifado>());
  const loadOptions = useServerFn(buscarOpcoesAlmoxarifado);
  const keyFor = useCommandKey(),
    locked = busy || submitting,
    title = stockCommandTitles[cmd];
  const text = (name: string) => (values[name] || "").trim();
  const chosen = (name: string) => selected[name] || "";
  const contextProduct =
    material?.produto ||
    conference?.produto ||
    reservation?.produto ||
    tool?.produto ||
    inventory?.produto;
  const unit =
    optionMetadata.current.get("produto_id:" + chosen("produto_id"))?.unidade ||
    (contextProduct && (!chosen("produto_id") || chosen("produto_id") === contextProduct.id)
      ? contextProduct.unidade
      : "") ||
    "unidade de uso do catálogo";
  const sourceOption = optionMetadata.current.get(
    (sourceType === "recebimento" ? "recebimento_id:" : "apontamento_id:") +
      chosen(sourceType === "recebimento" ? "recebimento_id" : "apontamento_id"),
  );
  const originUnit =
    sourceOption?.unidade || conference?.unidade_origem || "unidade informada na origem";
  const change = (name: string, value: string) => {
    setDirty(true);
    setValues((current) => ({ ...current, [name]: value }));
  };
  const focus = (name: string) => {
    const element = form.current?.querySelector<HTMLElement>('[name="' + name + '"]');
    if (element) element.focus();
    else validationSummary.current?.focus();
  };
  const fieldError = (name: string) =>
    errors[name] ? (
      <p id={uid + "-" + name + "-error"} className="text-xs text-destructive">
        {errors[name]}
      </p>
    ) : null;
  function field(
    name: string,
    options: {
      label?: string;
      required?: boolean;
      multiline?: boolean;
      type?: "date" | "datetime-local";
      quantity?: boolean;
      hint?: string;
      max?: number;
    } = {},
  ) {
    const common = {
      id: uid + "-" + name,
      name,
      className: fieldClass,
      value: values[name] || "",
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        change(name, event.target.value),
      "aria-invalid": !!errors[name],
      "aria-describedby":
        [
          options.hint ? uid + "-" + name + "-hint" : "",
          errors[name] ? uid + "-" + name + "-error" : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined,
    };
    return (
      <div className="grid min-w-0 gap-1 text-sm">
        <label htmlFor={common.id}>
          {options.label || labels[name] || name}
          {options.required ? " *" : ""}
        </label>
        {options.multiline ? (
          <textarea {...common} rows={3} maxLength={options.max || 2000} />
        ) : (
          <input
            {...common}
            type={options.type || "text"}
            inputMode={options.quantity ? "decimal" : undefined}
            maxLength={options.max || (options.quantity ? 40 : 240)}
          />
        )}
        {options.hint && (
          <small id={uid + "-" + name + "-hint"} className="text-muted-foreground">
            {options.hint}
          </small>
        )}
        {fieldError(name)}
      </div>
    );
  }
  function select(name: string, choices: Record<string, string>) {
    return (
      <div className="grid gap-1 text-sm">
        <label htmlFor={uid + "-" + name}>{labels[name]}</label>
        <select
          id={uid + "-" + name}
          name={name}
          className={fieldClass}
          value={values[name] || ""}
          onChange={(event) => change(name, event.target.value)}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? uid + "-" + name + "-error" : undefined}
        >
          {Object.entries(choices).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {fieldError(name)}
      </div>
    );
  }
  function checkbox(name: keyof typeof checks, label: string) {
    return (
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          name={name}
          checked={checks[name]}
          onChange={(event) => {
            setDirty(true);
            setChecks((current) => ({ ...current, [name]: event.target.checked }));
          }}
        />
        {label}
      </label>
    );
  }
  function initialLabel(name: string) {
    if (name === "produto_id")
      return contextProduct?.id === chosen(name)
        ? contextProduct.descricao
        : chosen(name)
          ? "Produto vinculado à origem selecionada; confira o cadastro"
          : undefined;
    if (["local_id", "origem_local_id"].includes(name))
      return (
        local?.nome ||
        conference?.local_nome ||
        reservation?.local_nome ||
        tool?.local_nome ||
        inventory?.local_nome ||
        onlyLot?.local_nome
      );
    if (name === "pessoa_id") return custody?.pessoa_nome || reservation?.pessoa_nome;
    if (name === "projeto_id") return reservation?.projeto_nome || undefined;
    if (name === "op_id") return reservation?.op_numero || undefined;
    if (name === "recebimento_id" && conference?.recebimento_id)
      return "Recebimento vinculado à conferência";
    if (name === "apontamento_id" && conference?.apontamento_id)
      return "Apontamento vinculado à conferência";
    if (["politica_id", "politica_calibracao_id"].includes(name) && base?.tipo === "ferramentas") {
      const row = base.politicas.find((row) => row.id === chosen(name));
      return row ? row.nome + " · V" + row.numero : undefined;
    }
    return undefined;
  }
  function picker(name: string, tipo: TipoOpcaoAlmoxarifado, required = true, disabled = false) {
    if (disabled && chosen(name))
      return (
        <div className="grid min-w-0 gap-1 text-sm" role="group" aria-label={labels[name] || name}>
          <span className="text-muted-foreground">{labels[name] || name}</span>
          <p className="break-words font-medium">{initialLabel(name) || "Registro vinculado"}</p>
          {fieldError(name)}
        </div>
      );
    const filterLocal = tipo === "locais" ? null : chosen("local_id") || null;
    return (
      <EntityPicker
        label={labels[name] || name}
        name={name}
        value={chosen(name)}
        initialLabel={initialLabel(name)}
        required={required}
        disabled={disabled || locked || loadingPolicy}
        error={errors[name]}
        queryKey={["almoxarifado-opcoes", org, tipo, filterLocal]}
        load={async (busca, signal) => {
          const result = await loadOptions({
            data: { organization_id: org, tipo, busca, local_id: filterLocal },
            signal,
          });
          return result.rows.map((row) => {
            optionMetadata.current.set(name + ":" + row.id, row);
            return { ...row, nome: row.contexto ? row.nome + " · " + row.contexto : row.nome };
          });
        }}
        onChange={(option) => {
          setDirty(true);
          const row = option ? optionMetadata.current.get(name + ":" + option.id) : undefined;
          setSelected((current) => ({
            ...current,
            [name]: option?.id || "",
            ...(["recebimento_id", "apontamento_id"].includes(name) && row?.produto_id
              ? { produto_id: row.produto_id }
              : {}),
          }));
          if (name === "produto_id" && cmd === "configurar_produto" && !initial.base) {
            setBase(undefined);
            setPolicyError(null);
            if (option) void loadPolicy(option.id);
          }
        }}
      />
    );
  }
  async function loadPolicy(id: string) {
    setLoadingPolicy(true);
    setPolicyError(null);
    try {
      const current = await onCompare({ tipo: "materiais", id });
      if (!mounted.current) return;
      if (!current || current.tipo !== "materiais" || current.id !== id)
        throw new Error(
          "Não foi possível recuperar a política deste material. Sua seleção foi preservada.",
        );
      setBase(current);
      setValues((before) => ({
        ...before,
        estoque_minimo: current.registro.politica.estoque_minimo,
      }));
      setChecks((before) => ({
        ...before,
        exige_lote: current.registro.politica.exige_lote,
        exige_serie: current.registro.politica.exige_serie,
      }));
      setDirty(false);
      setErrors({});
    } catch (failure) {
      if (mounted.current)
        setPolicyError(
          failure instanceof Error
            ? failure.message
            : "A consulta falhou. Tente novamente com o material selecionado.",
        );
    } finally {
      if (mounted.current) setLoadingPolicy(false);
    }
  }
  const quantity = (name = "quantidade", label?: string) =>
    field(name, {
      quantity: true,
      required: true,
      label: label || (labels[name] || "Quantidade") + " (" + unit + ")",
      hint: "Use a unidade indicada, sem separador de milhar.",
    });
  const reason = (required = true) => field("motivo", { required, multiline: true, max: 2000 });
  const grid = (children: ReactNode) => (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</div>
  );
  const sourceSwitch = () => (
    <div className="grid gap-1 text-sm">
      <label htmlFor={uid + "-sourceType"}>Origem física</label>
      <select
        id={uid + "-sourceType"}
        className={fieldClass}
        value={sourceType}
        onChange={(event) => {
          setSourceType(event.target.value as typeof sourceType);
          setSelected((current) => ({ ...current, recebimento_id: "", apontamento_id: "" }));
          setDirty(true);
        }}
      >
        <option value="recebimento">Recebimento de ordem de compra</option>
        <option value="apontamento">Apontamento de produção</option>
      </select>
    </div>
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || submitLock.current) return;
    setSaveError(null);
    const body: Record<string, unknown> = {
      organization_id: org,
      chave: crypto.randomUUID(),
      comando: cmd,
    };
    const need = (condition: unknown, message: string) => {
      if (!condition) throw new Error(message);
    };
    try {
      switch (cmd) {
        case "salvar_local":
          Object.assign(body, {
            local_id: local?.id || null,
            expected_version: local?.version || null,
            nome: text("nome"),
            descricao: text("descricao"),
            ativo: checks.ativo,
          });
          break;
        case "configurar_produto":
          need(material, "Consulte a política atual do material antes de confirmar.");
          Object.assign(body, {
            produto_id: material?.id || chosen("produto_id"),
            expected_version: material?.politica.version || null,
            exige_lote: checks.exige_lote,
            exige_serie: checks.exige_serie,
            estoque_minimo: text("estoque_minimo"),
          });
          break;
        case "conferir_evento":
          Object.assign(body, {
            recebimento_id: sourceType === "recebimento" ? chosen("recebimento_id") || null : null,
            apontamento_id: sourceType === "apontamento" ? chosen("apontamento_id") || null : null,
            produto_id: chosen("produto_id"),
            local_id: chosen("local_id"),
            quantidade: text("quantidade"),
            aceita: text("aceita"),
            quarentena: text("quarentena"),
            rejeitada: text("rejeitada"),
            lote: text("lote"),
            serie: text("serie"),
            motivo: text("motivo"),
            reconciliacao: text("reconciliacao"),
          });
          break;
        case "reclassificar_quarentena":
          need(conference, "Abra a conferência do lote para revisar sua quarentena.");
          Object.assign(body, {
            conferencia_id: conference!.id,
            local_id: chosen("local_id"),
            quantidade: text("quantidade"),
            destino: text("destino"),
            motivo: text("motivo"),
          });
          break;
        case "transferir":
          Object.assign(body, {
            produto_id: chosen("produto_id"),
            origem_local_id: chosen("origem_local_id"),
            destino_local_id: chosen("destino_local_id"),
            quantidade: text("quantidade"),
            lote: text("lote"),
            motivo: text("motivo"),
          });
          break;
        case "reservar":
          Object.assign(body, {
            produto_id: chosen("produto_id"),
            local_id: chosen("local_id"),
            projeto_id: destinationType === "projeto" ? chosen("projeto_id") || null : null,
            op_id: destinationType === "op" ? chosen("op_id") || null : null,
            pessoa_id: chosen("pessoa_id"),
            quantidade: text("quantidade"),
            validade: iso(text("validade")),
            lote: text("lote"),
          });
          break;
        case "retirar":
        case "consumir":
        case "devolver":
          need(reservation, "Abra a reserva para registrar sua movimentação.");
          Object.assign(body, {
            reserva_id: reservation!.id,
            expected_version: reservation!.version,
            quantidade: text("quantidade"),
            motivo: text("motivo"),
          });
          break;
        case "cancelar_reserva":
          need(reservation, "Abra a reserva que deseja cancelar.");
          Object.assign(body, {
            reserva_id: reservation!.id,
            expected_version: reservation!.version,
            motivo: text("motivo"),
          });
          break;
        case "estornar_evento":
          need(
            conference?.recebimento_id || conference?.apontamento_id,
            "Abra a conferência de um recebimento ou apontamento para estornar sua origem.",
          );
          Object.assign(body, {
            tipo: conference!.recebimento_id ? "recebimento" : "apontamento",
            evento_id: conference!.recebimento_id || conference!.apontamento_id,
            quantidade: text("quantidade"),
            motivo: text("motivo"),
          });
          break;
        case "salvar_ferramenta":
          Object.assign(body, {
            ferramenta_id: tool?.id || null,
            expected_version: tool?.version || null,
            patrimonio: text("patrimonio"),
            descricao: text("descricao"),
            produto_id: chosen("produto_id") || null,
            local_id: chosen("local_id"),
            proprietario: text("proprietario"),
            proprietario_nome: text("proprietario_nome") || null,
            exige_calibracao: checks.exige_calibracao,
            politica_calibracao_id: chosen("politica_calibracao_id") || null,
          });
          break;
        case "alterar_condicao":
          need(tool, "Abra a ferramenta para conferir sua condição.");
          Object.assign(body, {
            ferramenta_id: tool!.id,
            expected_version: tool!.version,
            condicao: text("condicao"),
            motivo: text("motivo"),
          });
          break;
        case "reservar_ferramenta":
          need(tool, "Abra a ferramenta para reservar seu período.");
          Object.assign(body, {
            ferramenta_id: tool!.id,
            expected_version: tool!.version,
            pessoa_id: chosen("pessoa_id"),
            inicio: iso(text("inicio")),
            fim: iso(text("fim")),
            timezone,
            agenda_evento_id: null,
          });
          break;
        case "retirar_ferramenta":
          need(custody, "Selecione a reserva da ferramenta que será retirada.");
          Object.assign(body, { custodia_id: custody!.id, expected_version: custody!.version });
          break;
        case "devolver_ferramenta":
          need(custody, "Selecione a custódia que será devolvida.");
          Object.assign(body, {
            custodia_id: custody!.id,
            expected_version: custody!.version,
            condicao: text("condicao"),
            motivo: text("motivo"),
          });
          break;
        case "cancelar_custodia":
          need(custody, "Selecione a reserva da ferramenta que será cancelada.");
          Object.assign(body, {
            custodia_id: custody!.id,
            expected_version: custody!.version,
            motivo: text("motivo"),
          });
          break;
        case "publicar_politica_calibracao":
          Object.assign(body, {
            nome: text("nome"),
            metodo: text("metodo"),
            fonte: text("fonte"),
            exige_validade: checks.exige_validade,
          });
          break;
        case "registrar_calibracao":
          need(tool, "Abra a ferramenta para registrar sua calibração.");
          Object.assign(body, {
            ferramenta_id: tool!.id,
            politica_id: chosen("politica_id"),
            emissor: text("emissor"),
            execucao: text("execucao"),
            validade: text("validade") || null,
            referencia: text("referencia") || null,
          });
          break;
        case "conferir_calibracao":
          need(calibration, "Selecione a evidência de calibração que será conferida.");
          need(
            calibrationDecisions(calibration!.estado)[text("estado")],
            "Esta evidência não permite a decisão selecionada. Confira o estado atual antes de confirmar.",
          );
          Object.assign(body, {
            calibracao_id: calibration!.id,
            expected_version: calibration!.version,
            estado: text("estado"),
            motivo: text("motivo"),
          });
          break;
        case "criar_inventario":
          Object.assign(body, {
            produto_id: chosen("produto_id"),
            local_id: chosen("local_id"),
            lote: text("lote"),
            contada: text("contada"),
            motivo: text("motivo"),
          });
          break;
        case "aprovar_inventario":
        case "cancelar_inventario":
          need(inventory, "Abra a contagem de inventário antes de decidir.");
          Object.assign(body, {
            inventario_id: inventory!.id,
            expected_version: inventory!.version,
            motivo: text("motivo"),
          });
          break;
      }
      const parsed = comandoAlmoxarifadoSchema.safeParse(body);
      if (!parsed.success) {
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
        setErrors(next);
        requestAnimationFrame(() => focus(Object.keys(next)[0] || "motivo"));
        return;
      }
      setErrors({});
      submitLock.current = true;
      setSubmitting(true);
      const { chave: _key, ...payload } = parsed.data;
      const saved = await execute({ ...payload, chave: keyFor(payload) });
      if (saved) {
        setDirty(false);
        onClose();
      } else {
        setSaveError(
          "O servidor não confirmou a operação. Seu preenchimento foi preservado; confira o erro e tente novamente.",
        );
        requestAnimationFrame(() => feedback.current?.focus());
      }
    } catch (failure) {
      setSaveError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível confirmar a operação. Seu preenchimento foi preservado.",
      );
      requestAnimationFrame(() => feedback.current?.focus());
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  async function compare() {
    setComparing(true);
    setCompareError(null);
    try {
      const current = await onCompare(
        !initial.base && base?.tipo === "materiais"
          ? { tipo: "materiais", id: base.id }
          : undefined,
      );
      if (!current || !base || current.tipo !== base.tipo || current.id !== base.id)
        throw new Error(
          "Não foi possível reencontrar esta ficha para comparar. Seu preenchimento foi preservado.",
        );
      setComparison(current);
    } catch (failure) {
      setCompareError(
        failure instanceof Error
          ? failure.message
          : "A consulta falhou. Seu preenchimento foi preservado.",
      );
    } finally {
      setComparing(false);
    }
  }
  function adoptComparison() {
    if (!comparison) return;
    if (target && comparison.tipo === "ferramentas") {
      const current =
        "pessoa_id" in target
          ? comparison.custodias.find((row) => row.id === target.id)
          : comparison.calibracoes.find((row) => row.id === target.id);
      if (!current) {
        setCompareError(
          "O vínculo não está mais disponível nesta ficha. O preenchimento permanece preservado.",
        );
        return;
      }
      setTarget(current);
      if ("politica_id" in current) {
        const decisions = calibrationDecisions(current.estado);
        setValues((before) => ({
          ...before,
          estado: decisions[before["estado"] || ""]
            ? before["estado"] || ""
            : Object.keys(decisions)[0] || "",
        }));
      }
    }
    setBase(comparison);
    setComparison(null);
    setCompareError(null);
    setDirty(true);
    setSaveError(null);
  }
  let content: ReactNode = null;
  switch (cmd) {
    case "salvar_local":
      content = (
        <>
          {field("nome", { required: true, max: 120 })}
          {field("descricao", { multiline: true, max: 1000 })}
          {checkbox("ativo", "Local ativo para novas movimentações")}
        </>
      );
      break;
    case "configurar_produto":
      content = (
        <>
          {picker("produto_id", "produtos", true, !!material)}
          {loadingPolicy && (
            <p role="status" className="text-sm">
              Consultando política e versão do material…
            </p>
          )}
          {policyError && (
            <p role="alert" className="text-sm text-destructive">
              {policyError}
            </p>
          )}
          {!material && !loadingPolicy && chosen("produto_id") && (
            <ActionButton variant="ghost" onClick={() => loadPolicy(chosen("produto_id"))}>
              Consultar política do material
            </ActionButton>
          )}
          {material ? (
            <>
              <p className="text-sm text-muted-foreground">
                {material.politica.version > 0
                  ? "Política atual · versão " + material.politica.version
                  : "Rastreabilidade ainda não configurada"}
              </p>
              {quantity("estoque_minimo", "Estoque mínimo (" + unit + ")")}
              {checkbox("exige_lote", "Exigir lote na conferência de entrada")}
              {checkbox("exige_serie", "Exigir série para rastrear o item")}
            </>
          ) : (
            !loadingPolicy && (
              <p className="text-sm text-muted-foreground">
                Selecione e consulte o material para conferir sua política antes de editar.
              </p>
            )
          )}
        </>
      );
      break;
    case "conferir_evento":
      content = (
        <>
          {sourceSwitch()}
          {sourceType === "recebimento"
            ? picker("recebimento_id", "recebimentos")
            : picker("apontamento_id", "apontamentos")}
          {grid(
            <>
              {picker("produto_id", "produtos")}
              {picker("local_id", "locais")}
            </>,
          )}
          {field("quantidade", {
            quantity: true,
            required: true,
            label: "Quantidade conferida (" + originUnit + ")",
            hint: sourceOption?.quantidade
              ? "Ainda não conferido na origem: " + sourceOption.quantidade + " " + originUnit + "."
              : "Confira a unidade no recebimento ou apontamento selecionado.",
          })}
          <fieldset className="grid gap-4 rounded border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              Resultado na unidade de uso do produto
            </legend>
            {grid(
              <>
                {quantity("aceita")}
                {quantity("quarentena")}
                {quantity("rejeitada")}
              </>,
            )}
            <p className="text-sm text-muted-foreground">
              A conversão confirmada é aplicada pelo servidor, que confere a soma exata sem
              arredondamento. Somente a parte aceita fica disponível para reserva.
            </p>
          </fieldset>
          {grid(
            <>
              {field("lote", { max: 120 })}
              {field("serie", { max: 120 })}
            </>,
          )}
          {reason(false)}
          <details>
            <summary className="cursor-pointer text-sm">
              Conciliação de recebimento histórico
            </summary>
            <div className="mt-3">
              {field("reconciliacao", {
                multiline: true,
                max: 4000,
                hint: "Registre como a contagem foi conciliada com o evento de origem, quando necessário.",
              })}
            </div>
          </details>
        </>
      );
      break;
    case "reclassificar_quarentena":
      content = (
        <>
          <p className="text-sm">Confira o lote segregado antes de liberar ou rejeitar material.</p>
          {picker("local_id", "locais")}
          {quantity()}
          {select("destino", { aceito: "Liberar como aceito", rejeitado: "Rejeitar material" })}
          {reason()}
        </>
      );
      break;
    case "transferir":
      content = (
        <>
          {picker("produto_id", "produtos", true, !!material)}
          {grid(
            <>
              {picker("origem_local_id", "locais")}
              {picker("destino_local_id", "locais")}
            </>,
          )}
          {quantity()}
          {field("lote", { max: 120 })}
          {reason()}
          <p className="text-sm text-muted-foreground">
            Saída e entrada são confirmadas juntas. A transferência preserva a origem do material.
          </p>
        </>
      );
      break;
    case "reservar":
      content = (
        <>
          {grid(
            <>
              {picker("produto_id", "produtos", true, !!material)}
              {picker("local_id", "locais")}
            </>,
          )}
          <div className="grid gap-1 text-sm">
            <label htmlFor={uid + "-destinationType"}>Destino da reserva</label>
            <select
              id={uid + "-destinationType"}
              className={fieldClass}
              value={destinationType}
              onChange={(event) => {
                setDestinationType(event.target.value as typeof destinationType);
                setSelected((current) => ({ ...current, projeto_id: "", op_id: "" }));
                setDirty(true);
              }}
            >
              <option value="projeto">Projeto operacional</option>
              <option value="op">Ordem de produção</option>
            </select>
          </div>
          {destinationType === "projeto"
            ? picker("projeto_id", "projetos")
            : picker("op_id", "ordens_producao")}
          {picker("pessoa_id", "pessoas")}
          {grid(
            <>
              {quantity()}
              {field("lote", { max: 120 })}
            </>,
          )}
          {field("validade", {
            type: "datetime-local",
            required: true,
            label: "Validade da reserva",
            hint: "Horário no navegador: " + timezone + ".",
          })}
          <p className="text-sm text-muted-foreground">
            A confirmação depende do saldo disponível no momento do envio.
          </p>
        </>
      );
      break;
    case "retirar":
    case "consumir":
    case "devolver":
      content = (
        <>
          <p className="text-sm">
            {cmd === "retirar"
              ? "A retirada transfere material reservado para a pessoa responsável. O consumo é registrado separadamente."
              : cmd === "consumir"
                ? "Registre apenas o material efetivamente usado, entre as quantidades já retiradas."
                : "Registre a sobra que retornou para conferência. A devolução não cria uma nova compra."}
          </p>
          {reservation && (
            <p className="text-sm">
              {reservation.pessoa_nome} · {reservation.produto.descricao}
              <br />
              Pendente de retirada: {reservation.quantidades.pendente_retirada} {unit} · Em poder:{" "}
              {reservation.quantidades.em_poder} {unit}
            </p>
          )}
          {quantity()}
          {reason(false)}
        </>
      );
      break;
    case "cancelar_reserva":
      content = (
        <>
          <p className="text-sm">
            Será cancelado o saldo ainda não retirado. Material em poder da equipe precisa ser
            consumido ou devolvido primeiro.
          </p>
          {reason()}
        </>
      );
      break;
    case "estornar_evento":
      content = (
        <>
          <p className="text-sm">
            {conference?.recebimento_id
              ? "Origem: recebimento de OC."
              : "Origem: apontamento de produção."}{" "}
            O estorno preserva o evento original e confere as reservas e o material já movimentado.
          </p>
          {field("quantidade", {
            quantity: true,
            required: true,
            label: "Quantidade a estornar na unidade da origem",
            hint: conference
              ? "Unidade da origem: " + conference.unidade_origem + "."
              : "Abra a conferência da origem que será corrigida.",
          })}
          {reason()}
        </>
      );
      break;
    case "salvar_ferramenta":
      content = (
        <>
          {grid(
            <>
              {field("patrimonio", { required: true, max: 80 })}
              {picker("local_id", "locais")}
            </>,
          )}
          {field("descricao", { required: true, max: 240 })}
          {picker("produto_id", "produtos", false)}
          {select("proprietario", { nexus: "Própria Nexus", terceiro: "Pertencente a terceiro" })}
          {text("proprietario") === "terceiro" &&
            field("proprietario_nome", { required: true, max: 200 })}
          {checkbox(
            "exige_calibracao",
            "Esta ferramenta exige calibração conforme política conferida",
          )}
          {checks.exige_calibracao && picker("politica_calibracao_id", "politicas_calibracao")}
        </>
      );
      break;
    case "alterar_condicao":
      content = (
        <>
          {select("condicao", condicoesFerramenta)}
          {reason()}
          <p className="text-sm text-muted-foreground">
            A condição altera a disponibilidade. Reservas e custódias anteriores permanecem no
            histórico.
          </p>
        </>
      );
      break;
    case "reservar_ferramenta":
      content = (
        <>
          {picker("pessoa_id", "pessoas")}
          {grid(
            <>
              {field("inicio", { type: "datetime-local", required: true })}
              {field("fim", { type: "datetime-local", required: true })}
            </>,
          )}
          <p className="text-sm text-muted-foreground">
            Horários no navegador: {timezone}. Conflitos, condição e calibração são conferidos no
            servidor.
          </p>
        </>
      );
      break;
    case "retirar_ferramenta":
      content = (
        <p className="text-sm">
          Confirme a entrega de {tool?.patrimonio || "esta ferramenta"} para{" "}
          <strong>{custody?.pessoa_nome || "a pessoa da reserva"}</strong>. A retirada inicia a
          custódia.
        </p>
      );
      break;
    case "devolver_ferramenta":
      content = (
        <>
          <p className="text-sm">
            Confira a ferramenta devolvida por {custody?.pessoa_nome || "seu custodiante"} antes de
            liberar outra retirada.
          </p>
          {select("condicao", condicoesFerramenta)}
          {reason(text("condicao") !== "disponivel")}
        </>
      );
      break;
    case "cancelar_custodia":
      content = (
        <>
          <p className="text-sm">
            A reserva futura será cancelada, mantendo o histórico. Uma ferramenta retirada precisa
            ser devolvida.
          </p>
          {reason()}
        </>
      );
      break;
    case "publicar_politica_calibracao":
      content = (
        <>
          {field("nome", { required: true, max: 120 })}
          {field("metodo", { multiline: true, required: true, max: 4000 })}
          {field("fonte", { multiline: true, required: true, max: 2000 })}
          {checkbox("exige_validade", "A política exige data de validade no certificado")}
          <p className="text-sm text-muted-foreground">
            A publicação registra uma nova versão por profissional autorizado. Use o método e a
            fonte efetivamente conferidos.
          </p>
        </>
      );
      break;
    case "registrar_calibracao":
      content = (
        <>
          {picker("politica_id", "politicas_calibracao")}
          {field("emissor", { required: true, max: 200 })}
          {grid(
            <>
              {field("execucao", { type: "date", required: true })}
              {field("validade", {
                type: "date",
                label: "Validade do certificado, quando aplicável",
              })}
            </>,
          )}
          {field("referencia", { max: 1000 })}
          <p className="text-sm text-muted-foreground">
            Depois de registrar, anexe o certificado privado nesta ferramenta antes de solicitar a
            validação. A referência textual não substitui o arquivo.
          </p>
        </>
      );
      break;
    case "conferir_calibracao":
      content = (
        <>
          <p className="text-sm">
            {calibration?.emissor || "Evidência selecionada"} · execução{" "}
            {calibration?.execucao || "não informada"}. A validação exige certificado confirmado e
            conferência profissional.
          </p>
          {Object.keys(calibrationDecisions(calibration?.estado)).length ? (
            select("estado", calibrationDecisions(calibration?.estado))
          ) : (
            <p className="text-sm">Evidência revogada; o histórico permanece preservado.</p>
          )}
          {reason(text("estado") === "revogada")}
        </>
      );
      break;
    case "criar_inventario":
      content = (
        <>
          {grid(
            <>
              {picker("produto_id", "produtos", true, !!material)}
              {picker("local_id", "locais")}
            </>,
          )}
          {field("lote", { max: 120 })}
          {quantity("contada")}
          {reason()}
          <p className="text-sm text-muted-foreground">
            Conte somente material aceito neste local. Quarentena e rejeitados permanecem separados.
            O ajuste depende de aprovação.
          </p>
        </>
      );
      break;
    case "aprovar_inventario":
    case "cancelar_inventario":
      content = (
        <>
          {inventory && (
            <dl className="grid grid-cols-2 gap-2 rounded border border-border p-3 text-sm">
              <dt>Base na contagem</dt>
              <dd>
                {inventory.baseline} {unit}
              </dd>
              <dt>Quantidade contada</dt>
              <dd>
                {inventory.contada} {unit}
              </dd>
              <dt>Diferença registrada</dt>
              <dd>
                {inventory.diferenca} {unit}
              </dd>
            </dl>
          )}
          {reason()}
          {cmd === "aprovar_inventario" && (
            <p className="text-sm text-muted-foreground">
              Se o estoque mudou desde a captura, faça uma nova contagem. A aprovação não substitui
              silenciosamente o saldo atual.
            </p>
          )}
        </>
      );
      break;
  }
  return (
    <OperationalDialog
      title={title}
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <form
        ref={form}
        noValidate
        onSubmit={submit}
        onChangeCapture={() => setDirty(true)}
        data-dirty={dirty}
        aria-busy={locked}
        className="grid min-w-0 gap-4"
      >
        {base && (
          <p className="text-sm text-muted-foreground">
            {tool
              ? tool.patrimonio + " · " + tool.descricao
              : reservation
                ? reservation.produto.codigo + " · " + reservation.pessoa_nome
                : material
                  ? material.produto.codigo + " · " + material.produto.descricao
                  : local
                    ? local.nome
                    : "Registro selecionado"}
            {openedVersion(base) !== null ? " · versão aberta " + openedVersion(base) : ""}
            {target ? " · vínculo V" + target.version : ""}
          </p>
        )}
        {Object.keys(errors).length > 0 && (
          <div
            ref={validationSummary}
            role="alert"
            tabIndex={-1}
            className="rounded border border-destructive p-3 text-sm"
          >
            <p className="font-medium">Confira os campos antes de confirmar.</p>
            <ul className="mt-2 grid gap-1">
              {Object.entries(errors).map(([name, message]) => (
                <li key={name}>
                  <button type="button" className="text-left underline" onClick={() => focus(name)}>
                    {labels[name] || name}: {message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <fieldset disabled={locked} className="grid min-w-0 gap-4">
          {content}
        </fieldset>
        {base && (
          <details className="rounded border border-border p-3 text-sm">
            <summary className="cursor-pointer">Comparar com a ficha atual</summary>
            <div className="mt-3 grid gap-3">
              <p>
                Consultar a versão atual preserva o preenchimento e a versão aberta. Confira as
                diferenças antes de adotar outra base.
              </p>
              <ActionButton
                variant="ghost"
                disabled={locked || comparing}
                loading={comparing}
                onClick={compare}
              >
                Consultar versão atual
              </ActionButton>
              {compareError && (
                <p role="alert" className="text-destructive">
                  {compareError}
                </p>
              )}
              {comparison && (
                <div className="grid gap-3">
                  <p>
                    Versão aberta: {openedVersion(base) ?? "evento preservado"}. Versão atual:{" "}
                    {openedVersion(comparison) ?? "evento preservado"}.
                  </p>
                  {comparison.tipo === "materiais" && (
                    <p>
                      Disponível atual: {comparison.registro.saldo.disponivel}{" "}
                      {comparison.registro.produto.unidade} · Reservado:{" "}
                      {comparison.registro.saldo.reservado}.
                    </p>
                  )}
                  {comparison.tipo === "reservas" && (
                    <p>
                      Retirada pendente atual: {comparison.registro.quantidades.pendente_retirada}.
                      Em poder: {comparison.registro.quantidades.em_poder}. Estado:{" "}
                      {comparison.registro.estado}.
                    </p>
                  )}
                  {comparison.tipo === "ferramentas" && (
                    <p>
                      Condição atual: {condicoesFerramenta[comparison.registro.condicao]}.
                      Disponibilidade: {comparison.registro.disponibilidade}.
                    </p>
                  )}
                  <ActionButton variant="ghost" disabled={locked} onClick={adoptComparison}>
                    Usar versão atual e manter preenchimento
                  </ActionButton>
                </div>
              )}
            </div>
          </details>
        )}
        {(error || saveError) && (
          <div
            ref={feedback}
            role="alert"
            tabIndex={-1}
            className="rounded border border-destructive p-3 text-sm text-destructive"
          >
            {error?.message || saveError}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <ActionButton
            type="submit"
            loading={locked || loadingPolicy}
            disabled={locked || loadingPolicy || (cmd === "configurar_produto" && !material)}
          >
            {title}
          </ActionButton>
          <Dialog.Close asChild>
            <ActionButton variant="ghost" disabled={locked}>
              Cancelar
            </ActionButton>
          </Dialog.Close>
        </div>
      </form>
    </OperationalDialog>
  );
}
