import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import { NrCard } from "@/features/nr/NrCards";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Save } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Badge, Fatos, legenda } from "./apresentacao";
import {
  inspecoesAtivoCriar,
  inspecoesCampoConsultar,
  inspecoesEnsaioCancelar,
  inspecoesEnsaioSalvar,
  type InspecoesCampoDados,
  type InspecoesDadosAtivo,
  type InspecoesDadosEnsaio,
  type InspecoesEnsaio,
} from "./inspecoes-campo.functions";
import { inspecoesListar } from "./inspecoes.functions";
import type {
  InspecoesAtribuicao,
  InspecoesEscopo,
  InspecoesLevantamento,
  InspecoesRegistro,
} from "./ui-contract";

type ContextProps = {
  escopo: InspecoesEscopo;
  queryKey: readonly string[];
  atribuicao?: InspecoesAtribuicao | null | undefined;
};

export function InspecoesCadastroAtivo({
  escopo,
  queryKey,
  atribuicao,
  onCreated,
}: ContextProps & { onCreated: (registro: InspecoesRegistro) => void }) {
  const [open, setOpen] = useState(false);
  const { organizationId, clienteId, unidadeId } = escopo;
  if (
    atribuicao?.perfil !== "EST" ||
    !clienteId ||
    !unidadeId ||
    (atribuicao.cliente_id && atribuicao.cliente_id !== clienteId) ||
    (atribuicao.unidade_id && atribuicao.unidade_id !== unidadeId)
  )
    return null;

  return open ? (
    <AtivoForm
      key={unidadeId}
      escopo={{ organizationId, clienteId, unidadeId }}
      queryKey={queryKey}
      onClose={() => setOpen(false)}
      onCreated={(registro) => {
        setOpen(false);
        onCreated(registro);
      }}
    />
  ) : (
    <div className="insp-actions">
      <ActionButton onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden="true" />
        Cadastrar ativo
      </ActionButton>
    </div>
  );
}

type AtivoContext = { organizationId: string; clienteId: string; unidadeId: string };
type Estrutura = { id: string; codigo: string; nome: string; componenteId?: string };

function AtivoForm({
  escopo,
  queryKey,
  onClose,
  onCreated,
}: {
  escopo: AtivoContext;
  queryKey: readonly string[];
  onClose: () => void;
  onCreated: (registro: InspecoesRegistro) => void;
}) {
  const listar = useServerFn(inspecoesListar);
  const criar = useServerFn(inspecoesAtivoCriar);
  const client = useQueryClient();
  const [campos, setCampos] = useState({ tag: "", nome: "", familia: "", local: "", setor: "" });
  const [componentes, setComponentes] = useState<Estrutura[]>([]);
  const [pontos, setPontos] = useState<Estrutura[]>([]);
  const intent = useRef<{ payload: string; key: string } | null>(null);
  const familias = useQuery({
    queryKey: [...queryKey, "cadastro-ativo-familias"],
    queryFn: ({ signal }) =>
      listar({
        data: {
          organizationId: escopo.organizationId,
          recurso: "familias",
          busca: "",
          estado: "",
          pagina: 0,
          ordem: "nome",
        },
        signal,
      }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (dados: InspecoesDadosAtivo) => {
      const payload = JSON.stringify(dados);
      if (intent.current?.payload !== payload) {
        intent.current = { payload, key: crypto.randomUUID() };
      }
      return criar({ data: { ...escopo, chave: intent.current.key, dados } });
    },
    onSuccess: (registro) => {
      void client.invalidateQueries({ queryKey });
      onCreated(registro);
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({
      ...campos,
      componentes: componentes.map(({ codigo, nome }) => ({ codigo, nome })),
      pontos: pontos.map(({ codigo, nome, componenteId }) => ({
        codigo,
        nome,
        componente_codigo: componentes.find(({ id }) => id === componenteId)?.codigo,
      })),
    });
  }

  return (
    <NrCard className="insp-record">
      <h3>Cadastrar ativo da unidade</h3>
      <form className="insp-stack" onSubmit={submit}>
        <fieldset className="insp-work-grid" disabled={mutation.isPending}>
          <legend>Identificação e localização</legend>
          {(
            [
              ["tag", "TAG", 80],
              ["nome", "Nome do ativo", 240],
              ["local", "Local informado", 500],
              ["setor", "Setor informado", 500],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key} className="insp-field">
              {label}
              <input
                required={key === "tag" || key === "nome"}
                minLength={key === "nome" ? 2 : undefined}
                maxLength={max}
                value={campos[key]}
                onChange={(event) => setCampos({ ...campos, [key]: event.target.value })}
              />
            </label>
          ))}
          <label className="insp-field">
            Família
            <select
              required
              disabled={!familias.data}
              value={campos.familia}
              onChange={(event) => setCampos({ ...campos, familia: event.target.value })}
            >
              <option value="">{familias.isPending ? "Carregando famílias…" : "Selecione"}</option>
              {familias.data?.items
                .filter((item) => item.codigo)
                .map((item) => (
                  <option key={item.id} value={item.codigo ?? ""}>
                    {item.codigo} · {item.titulo}
                  </option>
                ))}
            </select>
          </label>
        </fieldset>
        {familias.isError && (
          <ErrorState error={familias.error} onRetry={() => void familias.refetch()} />
        )}
        <details>
          <summary>Componentes e pontos</summary>
          <EstruturaCampos
            titulo="Componentes"
            singular="componente"
            items={componentes}
            onChange={setComponentes}
            disabled={mutation.isPending}
          />
          <EstruturaCampos
            titulo="Pontos"
            singular="ponto"
            items={pontos}
            onChange={setPontos}
            componentes={componentes}
            disabled={mutation.isPending}
          />
        </details>
        {mutation.error && (
          <p role="alert" className="insp-feedback">
            {mutation.error.message}
          </p>
        )}
        <div className="insp-actions">
          <ActionButton type="submit" loading={mutation.isPending} disabled={!campos.familia}>
            <Save size={16} aria-hidden="true" />
            Salvar ativo
          </ActionButton>
          <ActionButton variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Fechar cadastro
          </ActionButton>
        </div>
      </form>
    </NrCard>
  );
}

function EstruturaCampos({
  titulo,
  singular,
  items,
  onChange,
  componentes,
  disabled,
}: {
  titulo: string;
  singular: string;
  items: Estrutura[];
  onChange: (items: Estrutura[]) => void;
  componentes?: Estrutura[] | undefined;
  disabled: boolean;
}) {
  function update(id: string, values: Partial<Estrutura>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...values } : item)));
  }
  return (
    <fieldset className="insp-stack" disabled={disabled}>
      <legend>{titulo}</legend>
      {items.map((item, index) => (
        <div key={item.id} className="insp-work-grid">
          <label className="insp-field">
            Código {index + 1}
            <input
              required
              maxLength={80}
              value={item.codigo}
              onChange={(event) => update(item.id, { codigo: event.target.value })}
            />
          </label>
          <label className="insp-field">
            Nome {index + 1}
            <input
              required={!componentes}
              minLength={componentes ? undefined : 2}
              maxLength={200}
              value={item.nome}
              onChange={(event) => update(item.id, { nome: event.target.value })}
            />
          </label>
          {componentes && (
            <label className="insp-field">
              Componente do ponto
              <select
                value={
                  componentes.some(({ id }) => id === item.componenteId) ? item.componenteId : ""
                }
                onChange={(event) => update(item.id, { componenteId: event.target.value })}
              >
                <option value="">Sem componente associado</option>
                {componentes.map((component, position) => (
                  <option key={component.id} value={component.id}>
                    {component.nome || component.codigo || `Componente ${position + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="insp-actions">
            <ActionButton
              variant="ghost"
              onClick={() => onChange(items.filter(({ id }) => id !== item.id))}
            >
              Remover {singular} {index + 1}
            </ActionButton>
          </div>
        </div>
      ))}
      <div className="insp-actions">
        <ActionButton
          variant="ghost"
          disabled={items.length >= (componentes ? 300 : 100)}
          onClick={() => onChange([...items, { id: crypto.randomUUID(), codigo: "", nome: "" }])}
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar {singular}
        </ActionButton>
      </div>
    </fieldset>
  );
}

type EnsaioProps = ContextProps & {
  row: InspecoesLevantamento;
  tag: string;
  canEdit: boolean;
  userId: string;
};

export function InspecoesEnsaios(props: EnsaioProps) {
  const [opened, setOpened] = useState(false);
  return (
    <details onToggle={(event) => event.currentTarget.open && setOpened(true)}>
      <summary>Ensaios deste levantamento</summary>
      {opened && <EnsaiosConteudo {...props} />}
    </details>
  );
}

const measurementFields = [
  ["area_pistao_cm2", "Área do pistão (cm²)"],
  ["capacidade_kn", "Capacidade do perfil (kN)"],
  ["carga_alvo_kn", "Carga alvo (kN)"],
  ["carga_pico", "Carga de pico registrada"],
  ["sustentacao_s", "Sustentação (s)"],
  ["deslocamento_valor", "Deslocamento medido"],
] as const;

const contextFields = [
  ["relatorio_numero", "Número do relatório"],
  ["lat", "Latitude"],
  ["lon", "Longitude"],
  ["croqui", "Identificação no croqui"],
  ["lacre", "Número do lacre"],
  ["temperatura_c", "Temperatura de campo (°C)"],
] as const;

function EnsaioEditor({
  id,
  row,
  params,
  atribuicao,
  tag,
  dados,
  canSave,
  canCancel,
  onClose,
  onChange,
  onRefresh,
}: {
  id: string;
  row: InspecoesEnsaio | null;
  params: { organizationId: string; levantamentoId: string };
  atribuicao: EnsaioProps["atribuicao"];
  tag: string;
  dados: InspecoesCampoDados;
  canSave: boolean;
  canCancel: boolean;
  onClose: () => void;
  onChange: (item: InspecoesEnsaio) => void;
  onRefresh: () => void;
}) {
  const salvar = useServerFn(inspecoesEnsaioSalvar);
  const cancelar = useServerFn(inspecoesEnsaioCancelar);
  const [draft, setDraft] = useState<{ dados: InspecoesDadosEnsaio; version: number } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [feedback, setFeedback] = useState("");
  const version = row?.version ?? 0;
  const fields = draft?.dados ?? row?.conteudo ?? {};
  const stale = !!draft && draft.version !== version;
  const pontos = dados.pontos.some((item) => item.codigo === tag)
    ? dados.pontos
    : [{ codigo: tag, nome: null }, ...dados.pontos];
  const photos = dados.evidencias.filter((item) => item.mime?.startsWith("image/"));
  const reports = dados.evidencias.filter((item) => item.mime === "application/pdf");
  const videos = dados.evidencias.filter((item) => item.mime?.startsWith("video/"));
  const save = useMutation({
    mutationFn: (command: NonNullable<typeof draft>) =>
      salvar({ data: { ...params, id, atribuicaoId: atribuicao!.id, ...command } }),
    onSuccess: (item) => {
      setDraft(null);
      setFeedback("Rascunho do ensaio salvo.");
      onChange(item);
    },
    onError: onRefresh,
  });
  const cancel = useMutation({
    mutationFn: () =>
      cancelar({
        data: {
          organizationId: params.organizationId,
          id,
          version,
          atribuicaoId: atribuicao!.id,
          motivo,
        },
      }),
    onSuccess: (item) => {
      setDraft(null);
      setCancelOpen(false);
      setMotivo("");
      setFeedback("Rascunho do ensaio cancelado.");
      onChange(item);
    },
    onError: onRefresh,
  });
  const busy = save.isPending || cancel.isPending;
  const error = save.error ?? cancel.error;

  function change<K extends keyof InspecoesDadosEnsaio>(key: K, value: InspecoesDadosEnsaio[K]) {
    setDraft({ dados: { ...fields, [key]: value }, version: draft?.version ?? version });
    setFeedback("");
  }

  function decimalText(value: string) {
    return value.trim().replace(",", ".") || undefined;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSave && draft && !stale) save.mutate(draft);
  }

  return (
    <NrCard className="insp-record">
      <h5>{row ? `Ensaio · versão ${row.version}` : "Novo ensaio"}</h5>
      {row && (
        <Fatos
          items={[
            ["Estado", <Badge value={row.estado} />],
            ["Versão do cálculo", row.calculo_versao],
            [
              "Pico convertido · kN",
              row.carga_pico_kn?.toLocaleString("pt-BR", { maximumFractionDigits: 9 }),
            ],
            [
              "Pico convertido · kgf",
              row.carga_pico_kgf?.toLocaleString("pt-BR", { maximumFractionDigits: 9 }),
            ],
          ]}
        />
      )}
      {row &&
        row.estado !== "cancelado" &&
        (row.bloqueios.length > 0 || row.alertas.length > 0) && (
          <div className="insp-feedback" role="status">
            <strong>Itens para conferência do EST</strong>
            <ul>
              {[...row.bloqueios, ...row.alertas].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      {stale && (
        <div className="insp-feedback" role="alert">
          <p>O ensaio mudou para a versão {version}. Seu preenchimento foi preservado.</p>
          <details>
            <summary>Consultar os valores da versão atual</summary>
            <Fatos
              items={[
                ["Ponto", row?.conteudo.ponto_codigo],
                ["Equipamento", row?.conteudo.equipamento_codigo],
                ["Pico registrado", row?.conteudo.carga_pico],
                [
                  "Resultado registrado",
                  row?.conteudo.resultado_app && legenda(row.conteudo.resultado_app),
                ],
              ]}
            />
          </details>
          <ActionButton variant="ghost" onClick={() => draft && setDraft({ ...draft, version })}>
            Usar meu preenchimento na versão atual
          </ActionButton>
        </div>
      )}
      <form className="insp-stack" onSubmit={submit}>
        <fieldset className="insp-work-grid" disabled={!canSave || busy}>
          <legend>Identificação e equipamento</legend>
          <label className="insp-field">
            Ponto
            <select
              value={fields.ponto_codigo ?? ""}
              onChange={(e) => change("ponto_codigo", e.target.value || undefined)}
            >
              <option value="">A identificar</option>
              {pontos.map((ponto) => (
                <option key={ponto.codigo} value={ponto.codigo}>
                  {[ponto.codigo, ponto.nome].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </label>
          <label className="insp-field">
            Data e hora com fuso da origem
            <input
              value={fields.data_hora ?? ""}
              placeholder="AAAA-MM-DDThh:mm:ss-03:00"
              maxLength={32}
              onChange={(e) => change("data_hora", e.target.value || undefined)}
            />
          </label>
          <label className="insp-field">
            Equipamento
            <select
              value={fields.equipamento_codigo ?? ""}
              onChange={(e) =>
                change(
                  "equipamento_codigo",
                  (e.target.value || undefined) as InspecoesDadosEnsaio["equipamento_codigo"],
                )
              }
            >
              <option value="">A identificar</option>
              <option value="EQ-01">EQ-01 · analógico de reserva</option>
              <option value="EQ-02">EQ-02 · perfil e certificado pendentes</option>
            </select>
          </label>
          <label className="insp-field">
            Número do certificado
            <input
              value={fields.certificado_numero ?? ""}
              maxLength={120}
              onChange={(e) => change("certificado_numero", e.target.value || undefined)}
            />
          </label>
        </fieldset>
        <fieldset className="insp-work-grid" disabled={!canSave || busy}>
          <legend>Medições e resultado do ensaio</legend>
          {measurementFields.map(([key, label]) => (
            <label key={key} className="insp-field">
              {label}
              <input
                inputMode={key === "sustentacao_s" ? "numeric" : "decimal"}
                value={fields[key] ?? ""}
                maxLength={key === "sustentacao_s" ? 6 : 20}
                onChange={(e) => change(key, decimalText(e.target.value))}
              />
            </label>
          ))}
          <label className="insp-field">
            Unidade da carga de pico
            <select
              value={fields.unidade_carga ?? ""}
              onChange={(e) =>
                change(
                  "unidade_carga",
                  (e.target.value || undefined) as InspecoesDadosEnsaio["unidade_carga"],
                )
              }
            >
              <option value="">Selecione</option>
              <option>kN</option>
              <option>kgf</option>
              <option>lbf</option>
            </select>
          </label>
          <label className="insp-field">
            Unidade do deslocamento
            <input
              value={fields.deslocamento_unidade ?? ""}
              maxLength={30}
              onChange={(e) => change("deslocamento_unidade", e.target.value || undefined)}
            />
          </label>
          <label className="insp-field">
            Resultado registrado no ensaio
            <select
              value={fields.resultado_app ?? ""}
              onChange={(e) =>
                change(
                  "resultado_app",
                  (e.target.value || undefined) as InspecoesDadosEnsaio["resultado_app"],
                )
              }
            >
              <option value="">A registrar</option>
              <option value="aprovado">Aprovado</option>
              <option value="reprovado">Reprovado</option>
              <option value="sem_resultado">Sem resultado na origem</option>
            </select>
          </label>
          <label className="insp-field">
            Observação do deslocamento
            <input
              value={fields.deslocamento_obs ?? ""}
              maxLength={2000}
              onChange={(e) => change("deslocamento_obs", e.target.value || undefined)}
            />
          </label>
        </fieldset>
        <fieldset className="insp-work-grid" disabled={!canSave || busy}>
          <legend>Evidências e condições de campo</legend>
          {contextFields.map(([key, label]) => (
            <label key={key} className="insp-field">
              {label}
              <input
                inputMode={["lat", "lon", "temperatura_c"].includes(key) ? "decimal" : "text"}
                value={fields[key] ?? ""}
                maxLength={120}
                onChange={(e) =>
                  change(
                    key,
                    ["lat", "lon", "temperatura_c"].includes(key)
                      ? decimalText(e.target.value)
                      : e.target.value || undefined,
                  )
                }
              />
            </label>
          ))}
          <EvidenciaSelect
            label="Relatório do aplicativo"
            items={reports}
            value={fields.relatorio_id}
            onChange={(value) => change("relatorio_id", value)}
          />
          <EvidenciaSelect
            label="Vídeo do ensaio"
            items={videos}
            value={fields.video_id}
            onChange={(value) => change("video_id", value)}
          />
          <label className="insp-field">
            Chuva durante o ensaio
            <select
              value={fields.chuva === undefined ? "" : String(fields.chuva)}
              onChange={(e) =>
                change("chuva", e.target.value === "" ? undefined : e.target.value === "true")
              }
            >
              <option value="">Não registrada</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </label>
          <label className="insp-field">
            Motivo do uso da reserva analógica
            <textarea
              value={fields.motivo_reserva ?? ""}
              rows={2}
              maxLength={2000}
              onChange={(e) => change("motivo_reserva", e.target.value || undefined)}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={fields.horario_visivel ?? false}
              onChange={(e) => change("horario_visivel", e.target.checked)}
            />
            Horário visível no vídeo
          </label>
        </fieldset>
        <fieldset className="insp-stack" disabled={!canSave || busy}>
          <legend>Fotos verificadas do ensaio</legend>
          {photos.length ? (
            photos.map((file) => {
              const selected = fields.fotos_ids?.includes(file.id) ?? false;
              return (
                <label className="flex items-center gap-2" key={file.id}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && (fields.fotos_ids?.length ?? 0) >= 20}
                    onChange={(e) =>
                      change(
                        "fotos_ids",
                        e.target.checked
                          ? [...(fields.fotos_ids ?? []), file.id]
                          : fields.fotos_ids?.filter((photo) => photo !== file.id),
                      )
                    }
                  />
                  {file.nome}
                </label>
              );
            })
          ) : (
            <p className="nr-muted">
              Anexe e verifique as fotos no levantamento antes de vinculá-las.
            </p>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="insp-feedback">
            {error.message}
          </p>
        )}
        {feedback && <p role="status">{feedback}</p>}
        <div className="insp-actions">
          {canSave && (
            <ActionButton type="submit" disabled={!draft || stale || busy} loading={save.isPending}>
              <Save size={16} aria-hidden="true" />
              Salvar ensaio em rascunho
            </ActionButton>
          )}
          {canCancel && (
            <ActionButton
              variant="ghost"
              disabled={busy}
              onClick={() => setCancelOpen(!cancelOpen)}
            >
              Cancelar ensaio
            </ActionButton>
          )}
          <ActionButton variant="ghost" disabled={busy} onClick={onClose}>
            Fechar ficha do ensaio
          </ActionButton>
        </div>
      </form>
      {cancelOpen && canCancel && (
        <div className="insp-stack">
          <label className="insp-field">
            Motivo do cancelamento do ensaio
            <textarea maxLength={2000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <div className="insp-actions">
            <ActionButton
              disabled={motivo.trim().length < 5 || busy}
              onClick={() => cancel.mutate()}
            >
              Confirmar cancelamento
            </ActionButton>
          </div>
        </div>
      )}
    </NrCard>
  );
}

function EvidenciaSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: InspecoesCampoDados["evidencias"];
  value?: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <label className="insp-field">
      {label}
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{items.length ? "Selecione um anexo" : "Sem anexo verificado"}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

function EnsaiosConteudo({ escopo, queryKey, row, tag, atribuicao, canEdit, userId }: EnsaioProps) {
  const carregar = useServerFn(inspecoesCampoConsultar);
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<InspecoesEnsaio | null>(null);
  const [newId, setNewId] = useState<string>();
  const params = { organizationId: escopo.organizationId, levantamentoId: row.id };
  const key = [...queryKey, "ensaios-levantamento", row.id, page];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => carregar({ data: { ...params, pagina: page }, signal }),
    retry: false,
  });
  const allowed = canEdit && row.estado === "rascunho" && !!atribuicao;
  const canCollect = allowed && !!atribuicao.ensaios;
  if (query.isPending) return <LoadingState label="Carregando ensaios…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const { ensaios, total, pageSize } = query.data;
  const current = ensaios.find((item) => item.id === selected?.id) ?? selected;

  function closeEditor() {
    setNewId(undefined);
    setSelected(null);
  }

  return (
    <section className="insp-stack" aria-label="Ensaios por ponto">
      {canCollect && (
        <div className="insp-actions">
          <ActionButton
            variant="ghost"
            onClick={() => {
              setSelected(null);
              setNewId(crypto.randomUUID());
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Novo ensaio
          </ActionButton>
        </div>
      )}
      {ensaios.length ? (
        <ul className="insp-stack">
          {ensaios.map((item) => (
            <li key={item.id}>
              <ActionButton
                variant="ghost"
                aria-pressed={current?.id === item.id}
                onClick={() => {
                  setNewId(undefined);
                  setSelected(item);
                }}
              >
                {item.conteudo.ponto_codigo || "Ponto a identificar"} · {legenda(item.estado)} · v
                {item.version}
              </ActionButton>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nenhum ensaio neste levantamento" />
      )}
      {(page > 0 || (page + 1) * pageSize < total) && (
        <nav className="insp-pagination" aria-label="Páginas de ensaios">
          <ActionButton variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Anterior
          </ActionButton>
          <span>Página {page + 1}</span>
          <ActionButton
            variant="ghost"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </ActionButton>
        </nav>
      )}
      {(current || (newId && canCollect)) && (
        <EnsaioEditor
          key={current?.id ?? newId}
          id={current?.id ?? newId!}
          row={current}
          params={params}
          atribuicao={atribuicao}
          tag={tag}
          dados={query.data}
          canSave={
            canCollect &&
            (!current ||
              (current.estado === "rascunho" &&
                (atribuicao.perfil === "EST" || current.created_by === userId)))
          }
          canCancel={allowed && atribuicao.perfil === "EST" && current?.estado === "rascunho"}
          onClose={closeEditor}
          onChange={(result) => {
            setNewId(undefined);
            setSelected(result);
            client.setQueryData<InspecoesCampoDados>(key, (before) =>
              before
                ? {
                    ...before,
                    ensaios: before.ensaios.map((item) => (item.id === result.id ? result : item)),
                  }
                : before,
            );
            void query.refetch();
          }}
          onRefresh={() => void query.refetch()}
        />
      )}
    </section>
  );
}
