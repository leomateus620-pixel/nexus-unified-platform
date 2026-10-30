import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { OperationalDialog, useCommandKey } from "@/features/operacao/components";
import { useOrg } from "@/features/org/session";
import type { Norma, NrRecord } from "./domain";
import { nrSalvarCalculos } from "./calculos.functions";
import {
  calcularSnapshotNr,
  lerCalculosNr,
  nrCalculosEntradaSchema,
  type NrCalculosEntrada,
  type NrCalculosSnapshot,
} from "./calculos.schemas";

type Campo<U extends string> = {
  valor: number | null;
  unidade: U;
  estado: "nao_verificado" | "informado" | "proposto";
  fonte: string;
};
const vazio = <U extends string>(unidade: U): Campo<U> => ({
  valor: null,
  unidade,
  estado: "nao_verificado",
  fonte: "",
});
type Draft = {
  geometria: boolean;
  modelo: "" | "cilindro" | "cone" | "paralelepipedo";
  radialTipo: "diametro" | "raio";
  radial: Campo<"m" | "cm" | "mm">;
  altura: Campo<"m" | "cm" | "mm">;
  comprimento: Campo<"m" | "cm" | "mm">;
  largura: Campo<"m" | "cm" | "mm">;
  deducoesModo: "desconhecidas" | "nenhuma" | "lista";
  deducoes: Campo<"m3" | "L">[];
  ventilacao: boolean;
  volumeOrigem: "geometria" | "informado";
  volume: Campo<"m3" | "L">;
  vazao: Campo<"m3/h" | "m3/s" | "L/s">;
  fator: Campo<"fracao">;
  duracao: Campo<"min" | "h">;
  notas: string;
};
function rascunho(snapshot: NrCalculosSnapshot | null): Draft {
  const geo = snapshot?.entrada.geometria,
    modelo = geo?.modelo,
    vent = snapshot?.entrada.ventilacao;
  return {
    geometria: !!geo || !snapshot,
    modelo: modelo?.tipo ?? "",
    radialTipo: modelo && modelo.tipo !== "paralelepipedo" ? modelo.radial.tipo : "diametro",
    radial: modelo && modelo.tipo !== "paralelepipedo" ? modelo.radial.medida : vazio("m"),
    altura: modelo?.altura ?? vazio("m"),
    comprimento: modelo?.tipo === "paralelepipedo" ? modelo.comprimento : vazio("m"),
    largura: modelo?.tipo === "paralelepipedo" ? modelo.largura : vazio("m"),
    deducoesModo:
      geo?.deducoes === null || !geo ? "desconhecidas" : geo.deducoes.length ? "lista" : "nenhuma",
    deducoes: geo?.deducoes ?? [],
    ventilacao: !!vent,
    volumeOrigem: vent?.volume.origem ?? "geometria",
    volume: vent?.volume.origem === "informado" ? vent.volume.parametro : vazio("m3"),
    vazao: vent?.vazao_nominal ?? vazio("m3/h"),
    fator: vent?.fator_efetividade ?? vazio("fracao"),
    duracao: vent?.duracao ?? vazio("min"),
    notas: snapshot?.entrada.notas ?? "",
  };
}
function entrada(d: Draft): unknown {
  return {
    geometria: !d.geometria
      ? null
      : {
          modelo:
            d.modelo === "paralelepipedo"
              ? { tipo: d.modelo, comprimento: d.comprimento, largura: d.largura, altura: d.altura }
              : {
                  tipo: d.modelo,
                  radial: { tipo: d.radialTipo, medida: d.radial },
                  altura: d.altura,
                },
          deducoes:
            d.deducoesModo === "desconhecidas"
              ? null
              : d.deducoesModo === "nenhuma"
                ? []
                : d.deducoes,
        },
    ventilacao: !d.ventilacao
      ? null
      : {
          volume:
            d.volumeOrigem === "geometria"
              ? { origem: "geometria" }
              : { origem: "informado", parametro: d.volume },
          vazao_nominal: d.vazao,
          fator_efetividade: d.fator,
          duracao: d.duracao,
        },
    notas: d.notas,
  };
}
const estados = {
  nao_verificado: "Não verificado",
  informado: "Informado",
  proposto: "Proposto",
} as const;
const unidades: Record<string, string> = {
  m: "m",
  cm: "cm",
  mm: "mm",
  m3: "m³",
  L: "L",
  "m3/h": "m³/h",
  "m3/s": "m³/s",
  "L/s": "L/s",
  fracao: "Fração (0–1)",
  h: "h",
  min: "min",
};
function ParametroCampo<U extends string>({
  titulo,
  value,
  options,
  onChange,
  error,
  zero = false,
  max,
}: {
  titulo: string;
  value: Campo<U>;
  options: U[];
  onChange: (value: Campo<U>) => void;
  error?: string | undefined;
  zero?: boolean;
  max?: number;
}) {
  const id = useId();
  return (
    <fieldset className="rounded-md border border-border p-3">
      <legend className="px-1">{titulo}</legend>
      <div className="nr-field-grid">
        <label htmlFor={`${id}-valor`}>
          Valor (vazio = desconhecido)
          <input
            id={`${id}-valor`}
            type="number"
            step="any"
            min={zero ? 0 : undefined}
            max={max}
            value={value.valor ?? ""}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-erro` : undefined}
            onChange={(e) =>
              onChange({ ...value, valor: e.target.value === "" ? null : e.target.valueAsNumber })
            }
          />
        </label>
        <label htmlFor={`${id}-unidade`}>
          Unidade
          <select
            id={`${id}-unidade`}
            value={value.unidade}
            onChange={(e) => onChange({ ...value, unidade: e.target.value as U })}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {unidades[option]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-estado`}>
          Estado do parâmetro
          <select
            id={`${id}-estado`}
            value={value.estado}
            onChange={(e) => onChange({ ...value, estado: e.target.value as Campo<U>["estado"] })}
          >
            {Object.entries(estados).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-fonte`}>
          Fonte da medida ou parâmetro
          <input
            id={`${id}-fonte`}
            value={value.fonte}
            maxLength={2000}
            onChange={(e) => onChange({ ...value, fonte: e.target.value })}
          />
        </label>
      </div>
      {error && (
        <p id={`${id}-erro`} role="alert" className="nr-feedback">
          {error}
        </p>
      )}
    </fieldset>
  );
}
function Resultados({
  snapshot,
  preview = false,
}: {
  snapshot: NrCalculosSnapshot;
  preview?: boolean;
}) {
  const formato = (n: number | null) =>
    n === null
      ? "Não calculado"
      : new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 12 }).format(n);
  const mostrar = (
    titulo: string,
    r: NonNullable<NrCalculosSnapshot["geometria"]> | NonNullable<NrCalculosSnapshot["ventilacao"]>,
    valores: [string, number | null][],
  ) => (
    <section
      className="space-y-3 rounded-md border border-border p-4"
      aria-label={`${titulo}: ${preview ? "prévia" : "registro salvo"}`}
    >
      <h3 className="font-semibold">
        {titulo} · {r.estado.replaceAll("_", " ")}
      </h3>
      <dl className="nr-field-grid">
        {valores.map(([label, value]) => (
          <div key={label}>
            <dt className="nr-muted">{label}</dt>
            <dd className="font-medium">{formato(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="break-words text-sm">{r.formula}</p>
      {!!r.pendencias.length && (
        <div>
          <p className="font-medium">Para completar este cálculo</p>
          <ul className="list-disc space-y-1 pl-5">
            {r.pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <details>
        <summary className="cursor-pointer py-2">Premissas e precisão</summary>
        <ul className="list-disc space-y-1 pl-5">
          {r.premissas.map((p) => (
            <li key={p}>{p}</li>
          ))}
          <li>{r.precisao}</li>
        </ul>
      </details>
    </section>
  );
  return (
    <div className="space-y-3">
      <p className="nr-muted">
        {preview
          ? "Prévia — ainda não salva"
          : "Parâmetros persistidos, reproduzidos pelo motor registrado"}{" "}
        · {snapshot.motor_versao}
      </p>
      {snapshot.geometria &&
        mostrar("Geometria", snapshot.geometria, [
          ["Volume bruto (m³)", snapshot.geometria.volume_bruto_m3],
          ["Deduções (m³)", snapshot.geometria.deducoes_m3],
          ["Volume líquido (m³)", snapshot.geometria.volume_liquido_m3],
        ])}
      {snapshot.ventilacao &&
        mostrar("Ventilação", snapshot.ventilacao, [
          ["Vazão nominal (m³/h)", snapshot.ventilacao.vazao_nominal_m3_h],
          ["Vazão efetiva (m³/h)", snapshot.ventilacao.vazao_efetiva_m3_h],
          ["Taxa horária de renovação (h⁻¹)", snapshot.ventilacao.renovacoes_por_hora],
          ["Volumes acumulados no período", snapshot.ventilacao.volumes_acumulados],
          ["Duração (h)", snapshot.ventilacao.duracao_horas],
        ])}
      {snapshot.entrada.notas && (
        <p className="whitespace-pre-wrap break-words">
          Premissas declaradas: {snapshot.entrada.notas}
        </p>
      )}
    </div>
  );
}

export function NrCalculations({
  norma,
  registro,
  canEdit,
  onSaved,
}: {
  norma: Norma;
  registro: NrRecord;
  canEdit: boolean;
  onSaved: (registro: NrRecord) => void | Promise<void>;
}) {
  const save = useServerFn(nrSalvarCalculos),
    keyFor = useCommandKey(),
    org = useOrg();
  const saved = lerCalculosNr(registro.dados["calculos"]);
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(() => rascunho(saved));
  const [editingVersion, setEditingVersion] = useState(registro.version),
    [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({}),
    guard = useRef<string | null>(null),
    previewKey = useRef(crypto.randomUUID());
  const contextKey = `${registro.organization_id}:${norma}:${registro.id}`;
  const currentContext = useRef(contextKey),
    mounted = useRef(true);
  currentContext.current = contextKey;
  const [editingContext, setEditingContext] = useState(contextKey);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const valid = nrCalculosEntradaSchema.safeParse(entrada(draft));
  const preview =
    valid.success && org.data?.userId && org.data.orgId === registro.organization_id
      ? calcularSnapshotNr(valid.data, org.data.userId, editingVersion, previewKey.current)
      : null;
  const prefix = useId(),
    unknown =
      registro.dados["calculos"] !== undefined && registro.dados["calculos"] !== null && !saved;
  const change = <K extends keyof Draft>(field: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setDirty(true);
    setNotice("");
  };
  const issue = (path: string) =>
    Object.entries(errors).find(([key]) => key === path || key.startsWith(`${path}.`))?.[1];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (guard.current === contextKey) return;
    const parsed = nrCalculosEntradaSchema.safeParse(entrada(draft));
    const messages: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) messages[issue.path.join(".")] = issue.message;
    if (draft.geometria && draft.deducoesModo === "lista" && !draft.deducoes.length)
      messages["geometria.deducoes"] =
        "Adicione uma dedução ou declare explicitamente que não há deduções.";
    setErrors(messages);
    setError("");
    if (!parsed.success || Object.keys(messages).length) {
      setError("Confira os campos indicados. Valores desconhecidos podem permanecer vazios.");
      return;
    }
    guard.current = contextKey;
    setBusy(true);
    const commandContext = contextKey;
    try {
      const payload = {
        organization_id: registro.organization_id,
        norma,
        local_id: registro.id,
        expected_version: editingVersion,
        entrada: parsed.data,
      };
      const result = await save({ data: { ...payload, chave: keyFor(payload) } });
      if (!mounted.current || currentContext.current !== commandContext) return;
      setDirty(false);
      setOpen(false);
      setNotice(
        "Cálculo salvo e confirmado no banco. Parâmetros técnicos permanecem sem validação.",
      );
      try {
        await onSaved(result.registro as NrRecord);
      } catch {
        setNotice(
          "Cálculo salvo no banco. A atualização da tela falhou; recarregue para conferir o registro.",
        );
      }
    } catch (cause) {
      if (!mounted.current || currentContext.current !== commandContext) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar. Seu preenchimento foi preservado.",
      );
    } finally {
      if (guard.current === commandContext) guard.current = null;
      if (mounted.current && currentContext.current === commandContext) setBusy(false);
    }
  }
  const length = (
    field: "altura" | "radial" | "comprimento" | "largura",
    title: string,
    path: string,
  ) => (
    <ParametroCampo
      titulo={title}
      value={draft[field]}
      options={["m", "cm", "mm"]}
      onChange={(v) => change(field, v)}
      error={issue(path)}
    />
  );
  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-white p-4"
      aria-labelledby={`${prefix}-title`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${prefix}-title`} className="flex items-center gap-2 font-semibold">
          <Calculator size={18} aria-hidden /> Geometria e ventilação
        </h2>
        {canEdit && !registro.arquivado_em && !unknown && (
          <ActionButton
            variant="ghost"
            onClick={() => {
              setDraft(rascunho(saved));
              setEditingVersion(registro.version);
              setEditingContext(contextKey);
              setBusy(false);
              setDirty(false);
              setError("");
              setErrors({});
              setOpen(true);
            }}
          >
            {saved ? "Editar parâmetros" : "Registrar cálculo"}
          </ActionButton>
        )}
      </div>
      <p className="text-sm">
        Resultado matemático dos parâmetros deste local. Não emite PET, não libera entrada e não
        certifica segurança ou equipamento.
      </p>
      {saved ? (
        <>
          <Resultados snapshot={saved} />
          <p className="nr-muted">
            Base do local v{saved.base_version} · Autor do registro: {saved.autor}. Alterações e
            datas podem ser consultadas no histórico do local.
          </p>
        </>
      ) : (
        <p className="nr-muted">
          {unknown
            ? "Há um cálculo em formato não reconhecido. O conteúdo foi preservado; consulte o histórico antes de substituí-lo."
            : "Nenhum cálculo salvo neste local. Medidas, vazões e efetividade desconhecidas permanecem sem valor."}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <OperationalDialog
        title="Parâmetros de geometria e ventilação"
        open={open && editingContext === contextKey}
        onOpenChange={setOpen}
      >
        <form
          className="nr-dialog nr-form"
          onSubmit={(e) => void submit(e)}
          data-dirty={dirty}
          aria-busy={busy}
          noValidate
        >
          <p>
            Local: {registro.tag ? `${registro.tag} — ` : ""}
            {registro.titulo} · Base v{editingVersion}. O usuário autenticado será registrado como
            autor do preenchimento.
          </p>
          {registro.version !== editingVersion && (
            <p role="alert" className="nr-feedback">
              O local mudou durante a edição. Seu preenchimento foi preservado; salve para verificar
              o conflito ou feche e reabra após comparar o histórico.
            </p>
          )}
          {error && (
            <p role="alert" className="nr-feedback">
              {error}
            </p>
          )}
          <fieldset disabled={busy}>
            <legend>Geometria</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.geometria}
                onChange={(e) => change("geometria", e.target.checked)}
              />{" "}
              Registrar geometria deste local
            </label>
            {draft.geometria && (
              <>
                <label htmlFor={`${prefix}-modelo`}>
                  Modelo geométrico
                  <select
                    id={`${prefix}-modelo`}
                    value={draft.modelo}
                    aria-invalid={!!issue("geometria.modelo")}
                    onChange={(e) => change("modelo", e.target.value as Draft["modelo"])}
                  >
                    <option value="">Selecione o modelo aplicável</option>
                    <option value="cilindro">Cilindro</option>
                    <option value="cone">Cone</option>
                    <option value="paralelepipedo">Paralelepípedo</option>
                  </select>
                </label>
                {issue("geometria.modelo") && !draft.modelo && (
                  <p role="alert" className="nr-feedback">
                    Selecione o modelo geométrico deste local.
                  </p>
                )}
                {draft.modelo && (
                  <>
                    {length("altura", "Altura", "geometria.modelo.altura")}
                    {draft.modelo === "paralelepipedo" ? (
                      <>
                        {length("comprimento", "Comprimento", "geometria.modelo.comprimento")}
                        {length("largura", "Largura", "geometria.modelo.largura")}
                      </>
                    ) : (
                      <>
                        <label htmlFor={`${prefix}-radial`}>
                          Medida radial
                          <select
                            id={`${prefix}-radial`}
                            value={draft.radialTipo}
                            onChange={(e) =>
                              change("radialTipo", e.target.value as Draft["radialTipo"])
                            }
                          >
                            <option value="diametro">Diâmetro</option>
                            <option value="raio">Raio</option>
                          </select>
                        </label>
                        {length(
                          "radial",
                          draft.radialTipo === "raio" ? "Raio" : "Diâmetro",
                          "geometria.modelo.radial.medida",
                        )}
                      </>
                    )}
                  </>
                )}
                <label htmlFor={`${prefix}-deducoes`}>
                  Deduções do volume bruto
                  <select
                    id={`${prefix}-deducoes`}
                    value={draft.deducoesModo}
                    onChange={(e) =>
                      change("deducoesModo", e.target.value as Draft["deducoesModo"])
                    }
                  >
                    <option value="desconhecidas">Não verificadas</option>
                    <option value="nenhuma">Declaro que não há deduções</option>
                    <option value="lista">Informar volumes a deduzir</option>
                  </select>
                </label>
                {draft.deducoesModo === "lista" && (
                  <div className="space-y-3">
                    {draft.deducoes.map((p, index) => (
                      <div key={index} className="space-y-2">
                        <ParametroCampo
                          titulo={`Dedução ${index + 1}`}
                          value={p}
                          options={["m3", "L"]}
                          zero
                          onChange={(v) =>
                            change(
                              "deducoes",
                              draft.deducoes.map((current, i) => (i === index ? v : current)),
                            )
                          }
                          error={issue(`geometria.deducoes.${index}`)}
                        />
                        <ActionButton
                          variant="ghost"
                          aria-label={`Remover dedução ${index + 1}`}
                          onClick={() =>
                            change(
                              "deducoes",
                              draft.deducoes.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 size={16} aria-hidden /> Remover dedução
                        </ActionButton>
                      </div>
                    ))}
                    <ActionButton
                      variant="ghost"
                      disabled={draft.deducoes.length >= 50}
                      onClick={() => change("deducoes", [...draft.deducoes, vazio("m3")])}
                    >
                      <Plus size={16} aria-hidden /> Adicionar dedução
                    </ActionButton>
                  </div>
                )}
                {issue("geometria.deducoes") && (
                  <p role="alert" className="nr-feedback">
                    {issue("geometria.deducoes")}
                  </p>
                )}
              </>
            )}
            {issue("geometria") && !draft.geometria && (
              <p role="alert" className="nr-feedback">
                {issue("geometria")}
              </p>
            )}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Ventilação</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.ventilacao}
                onChange={(e) => change("ventilacao", e.target.checked)}
              />{" "}
              Registrar cálculo de ventilação
            </label>
            {draft.ventilacao && (
              <>
                <p className="nr-muted">
                  A vazão efetiva será calculada a partir da nominal e do fator informado. Nenhum
                  fator ou taxa mínima é presumido.
                </p>
                <label htmlFor={`${prefix}-volume`}>
                  Origem do volume líquido
                  <select
                    id={`${prefix}-volume`}
                    value={draft.volumeOrigem}
                    aria-invalid={!!issue("ventilacao.volume")}
                    onChange={(e) =>
                      change("volumeOrigem", e.target.value as Draft["volumeOrigem"])
                    }
                  >
                    <option value="geometria">Usar a geometria registrada neste formulário</option>
                    <option value="informado">Informar volume e fonte</option>
                  </select>
                </label>
                {draft.volumeOrigem === "informado" && (
                  <ParametroCampo
                    titulo="Volume líquido"
                    value={draft.volume}
                    options={["m3", "L"]}
                    onChange={(v) => change("volume", v)}
                    error={issue("ventilacao.volume.parametro")}
                  />
                )}
                {issue("ventilacao.volume") && (
                  <p role="alert" className="nr-feedback">
                    {issue("ventilacao.volume")}
                  </p>
                )}
                <ParametroCampo
                  titulo="Vazão nominal"
                  value={draft.vazao}
                  options={["m3/h", "m3/s", "L/s"]}
                  onChange={(v) => change("vazao", v)}
                  error={issue("ventilacao.vazao_nominal")}
                />
                <ParametroCampo
                  titulo="Fator de efetividade"
                  value={draft.fator}
                  options={["fracao"]}
                  max={1}
                  onChange={(v) => change("fator", v)}
                  error={issue("ventilacao.fator_efetividade")}
                />
                <ParametroCampo
                  titulo="Duração"
                  value={draft.duracao}
                  options={["min", "h"]}
                  zero
                  onChange={(v) => change("duracao", v)}
                  error={issue("ventilacao.duracao")}
                />
              </>
            )}
          </fieldset>
          <label htmlFor={`${prefix}-notas`}>
            Premissas ou observações adicionais
            <textarea
              id={`${prefix}-notas`}
              value={draft.notas}
              maxLength={4000}
              rows={3}
              disabled={busy}
              onChange={(e) => change("notas", e.target.value)}
            />
          </label>
          {preview && <Resultados snapshot={preview} preview />}
          <p className="nr-muted">
            Valores vazios e fontes não registradas geram pendências explícitas. Este formulário não
            valida parâmetros técnicos nem substitui análise de segurança.
          </p>
          <div className="nr-form-footer">
            <span role="status">
              {busy
                ? "Salvando e conferindo a versão…"
                : dirty
                  ? "Alterações ainda não salvas"
                  : "Sem alterações neste formulário"}
            </span>
            <ActionButton type="submit" loading={busy} disabled={!dirty || !canEdit}>
              Salvar cálculo
            </ActionButton>
          </div>
        </form>
      </OperationalDialog>
    </section>
  );
}
