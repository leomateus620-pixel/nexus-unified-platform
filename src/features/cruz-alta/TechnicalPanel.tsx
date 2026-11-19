import { useRef, useState, Suspense, lazy } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Paperclip, Pencil, Plus } from "lucide-react";
import type { CruzObject } from "./scene-types";
import { objects } from "./manifest";
import { cruzAlta } from "./context";
import type { MapSearch, ChangeSearch } from "./CruzAltaWorkspace";
import {
  caEstado,
  caProvisionar,
  caFicha,
  caSalvarFicha,
  caDocumentosDisponiveis,
  caVincular,
  caDesvincular,
  caMetadados,
  caPreparar,
  caPublicar,
  caPrevia,
} from "./acervo.functions";
import { describeFile, operationId, transferFile } from "./upload";

const Pdf = lazy(() =>
  import("@/features/nr/NrOriginalPreview").then((m) => ({ default: m.NrOriginalPreview })),
);
const Import = lazy(() => import("./ImportInventory"));
const scopeLabels = {
  individual: "Do componente selecionado",
  estrutura: "Da estrutura",
  conjunto: "Do conjunto",
  unidade: "Da unidade",
} as const;
type Purpose = keyof typeof scopeLabels;
type Sheet = Awaited<ReturnType<typeof caFicha>>;
type DocumentRow = Sheet["documentos"][number];
type Scope = { organization_id: string; chave: string };
type Props = {
  object: CruzObject;
  user: string;
  search: MapSearch;
  change: ChangeSearch;
  openReader: (doc: string, rev: string) => void;
  archive: boolean;
};
const describeError = (e: unknown) =>
  e instanceof Error ? e.message : "Não foi possível confirmar a operação.";
function feedback(text: string) {
  return (
    <p role="alert" className="ca-feedback">
      {text}
    </p>
  );
}
export default function TechnicalPanel(props: Props) {
  const { object, user, search } = props;
  const getState = useServerFn(caEstado),
    provision = useServerFn(caProvisionar),
    getSheet = useServerFn(caFicha);
  const qc = useQueryClient();
  const [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const scope = { organization_id: cruzAlta.org, chave: object.id };
  const key = ["cruz-alta", user, scope.organization_id];
  const state = useQuery({
    queryKey: [...key, "estado"],
    queryFn: ({ signal }) => getState({ data: { organization_id: scope.organization_id }, signal }),
    retry: false,
  });
  const sheet = useQuery({
    queryKey: [...key, object.id, "ficha"],
    queryFn: ({ signal }) => getSheet({ data: scope, signal }),
    enabled: !!state.data?.provisionada,
    retry: false,
    refetchOnWindowFocus: "always",
  });
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({ queryKey: ["nr", scope.organization_id] }),
    ]);
  }
  if (state.isError || sheet.isError)
    return (
      <>
        {feedback(describeError(state.error || sheet.error))}
        <button className="ca-action" onClick={() => void refresh()}>
          Tentar novamente
        </button>
      </>
    );
  if (!state.data) return <p role="status">Conferindo a unidade…</p>;
  if (!state.data.provisionada)
    return (
      <>
        <p>As estruturas ainda aguardam cadastro no acervo.</p>
        {state.data.pode_provisionar && (
          <button
            className="ca-action"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              setError("");
              try {
                await provision({ data: { organization_id: scope.organization_id } });
                await refresh();
              } catch (e) {
                setError(describeError(e));
              } finally {
                setWorking(false);
              }
            }}
          >
            Cadastrar estruturas no acervo
          </button>
        )}
        {error && feedback(error)}
      </>
    );
  if (!sheet.data) return <p role="status">Carregando ficha…</p>;
  if (search.revisao || search.documento)
    return (
      <Reader
        key={[object.id, search.documento, search.revisao].join("/")}
        user={user}
        scope={scope}
        search={search}
        docs={sheet.data.documentos}
      />
    );
  return <SheetContent {...props} scope={scope} sheet={sheet.data} refresh={refresh} />;
}

function Reader({
  user,
  scope,
  search,
  docs,
}: {
  user: string;
  scope: Scope;
  search: MapSearch;
  docs: DocumentRow[];
}) {
  const preview = useServerFn(caPrevia);
  const doc = docs.find((d) => d.id === search.documento),
    rev = doc?.revisoes.find((r) => r.id === search.revisao);
  const renew = () => preview({ data: { ...scope, documento_id: doc!.id, revisao_id: rev!.id } });
  const q = useQuery({
    queryKey: ["cruz-alta-preview", user, scope, doc?.id, rev?.id],
    queryFn: renew,
    enabled: !!rev,
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
  });
  if (!doc || !rev) return feedback("Documento ou revisão indisponível para este objeto.");
  return (
    <>
      <h3>{doc.titulo}</h3>
      <p>
        {rev.rotulo === "Original" ? "Original" : "Revisão " + rev.rotulo} · {formatDate(rev.data)}
      </p>
      {rev.nota && <p>{rev.nota}</p>}
      {q.isError ? (
        <>
          {feedback("Prévia indisponível. " + describeError(q.error))}
          <button className="ca-action" onClick={() => void q.refetch()}>
            Tentar novamente
          </button>
        </>
      ) : !q.data ? (
        <p role="status">Preparando prévia privada…</p>
      ) : q.data.mime === "application/pdf" ? (
        <Suspense fallback={<p>Preparando leitor…</p>}>
          <Pdf
            org={scope.organization_id}
            url={q.data.url}
            file={{
              id: q.data.arquivo_id,
              nome: doc.titulo,
              mime: q.data.mime,
              tamanho: q.data.tamanho,
              sha256: q.data.sha256,
            }}
            authorizePreview={renew}
            showOriginalLink={false}
          />
        </Suspense>
      ) : q.data.mime.startsWith("image/") ? (
        <img
          src={q.data.url}
          alt={doc.titulo}
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.alt = "Prévia de imagem indisponível. Feche e reabra o leitor.";
          }}
        />
      ) : (
        <p>Prévia indisponível para este formato.</p>
      )}
    </>
  );
}
function formatDate(value: string | null) {
  return value ? value.split("T")[0]?.split("-").reverse().join("/") : "Data não informada";
}
function SheetContent({
  scope,
  sheet,
  refresh,
  object,
  user,
  search,
  change,
  openReader,
  archive,
}: Props & { scope: Scope; sheet: Sheet; refresh: () => Promise<void> }) {
  const [form, setForm] = useState<"anexar" | "vincular" | "editar" | "importar" | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<DocumentRow | null>(null);
  const [correction, setCorrection] = useState<DocumentRow | null>(null);
  const [unlink, setUnlink] = useState<DocumentRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const remove = useServerFn(caDesvincular);
  const closeForm = () => {
    setForm(null);
    setRevisionTarget(null);
  };
  const success = async (text: string) => {
    await refresh();
    setNote(text);
    closeForm();
    setCorrection(null);
  };
  const docsTab = search.aba !== "ficha";
  return (
    <>
      <h3>{sheet.titulo}</h3>
      <div className="ca-tabs">
        <button
          aria-pressed={docsTab}
          onClick={() => change({ ...search, aba: "documentos" }, true)}
        >
          Documentos
        </button>
        <button aria-pressed={!docsTab} onClick={() => change({ ...search, aba: "ficha" }, true)}>
          Ficha técnica
        </button>
      </div>
      {note && (
        <p className="ca-feedback" role="status">
          {note}
        </p>
      )}
      {correction ? (
        <CorrectDocument
          scope={scope}
          doc={correction}
          onCancel={() => setCorrection(null)}
          onSuccess={success}
        />
      ) : form === "editar" ? (
        <EditSheet sheet={sheet} scope={scope} onCancel={closeForm} onSuccess={success} />
      ) : form === "anexar" || form === "vincular" ? (
        <Attach
          key={form + revisionTarget?.id}
          mode={form}
          target={revisionTarget}
          scope={scope}
          user={user}
          title={sheet.titulo}
          onCancel={closeForm}
          onSuccess={success}
        />
      ) : form === "importar" ? (
        <Suspense fallback={<p>Carregando inventário…</p>}>
          <Import
            user={user}
            onClose={() => {
              closeForm();
              void refresh();
            }}
          />
        </Suspense>
      ) : docsTab ? (
        <>
          {sheet.pode_publicar && (
            <div className="ca-actions">
              <button className="ca-action" onClick={() => setForm("anexar")}>
                <Paperclip size={15} />
                Anexar prancha
              </button>
              <button className="ca-action" onClick={() => setForm("vincular")}>
                Vincular documento existente
              </button>
            </div>
          )}
          {!sheet.documentos.length && <p>Nenhum documento vinculado a este objeto.</p>}
          {(Object.keys(scopeLabels) as Purpose[]).map((p) => {
            const docs = sheet.documentos.filter((d) => d.escopo === p);
            if (!docs.length) return null;
            return (
              <section key={p}>
                <h3>{scopeLabels[p]}</h3>
                {docs.map((d) => {
                  const current = d.revisoes.find((r) => r.id === d.vigente_id);
                  return (
                    <article className="ca-doc" key={d.id + d.objeto}>
                      <strong>{d.titulo}</strong>
                      <p className="ca-hint">
                        Vínculo · {objects.find((o) => o.id === d.objeto)?.name ?? d.objeto}
                      </p>
                      {current ? (
                        <button onClick={() => openReader(d.id, current.id)}>
                          <FileText size={16} />
                          Abrir revisão {current.rotulo}
                        </button>
                      ) : (
                        <p>Nenhuma revisão vigente.</p>
                      )}
                      <details>
                        <summary>Revisões e vínculo</summary>
                        {d.revisoes.map((r) => (
                          <p key={r.id}>
                            <button onClick={() => openReader(d.id, r.id)}>
                              Rev. {r.rotulo} · {formatDate(r.data)}{" "}
                              {r.id === d.vigente_id ? "· Vigente" : "· Histórica"}
                            </button>
                          </p>
                        ))}
                        {d.pode_corrigir && (
                          <button onClick={() => setCorrection(d)}>Corrigir metadados</button>
                        )}
                        {sheet.pode_publicar && (
                          <button
                            onClick={() => {
                              setForm("anexar");
                              setRevisionTarget(d);
                            }}
                          >
                            <Plus size={14} />
                            Adicionar revisão
                          </button>
                        )}
                        {sheet.pode_editar && d.objeto === object.id && (
                          <button onClick={() => setUnlink(d)}>Desvincular deste objeto</button>
                        )}
                      </details>
                    </article>
                  );
                })}
              </section>
            );
          })}
          {unlink && (
            <div className="ca-feedback">
              <p>
                Desvincular “{unlink.titulo}” de {sheet.titulo}?
              </p>
              <div className="ca-actions">
                <button
                  className="ca-action"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await remove({
                        data: { ...scope, documento_id: unlink.id, escopo: unlink.escopo },
                      });
                      setUnlink(null);
                      await success("Vínculo removido.");
                    } catch (e) {
                      setNote(describeError(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Confirmar desvinculação
                </button>
                <button className="ca-action" onClick={() => setUnlink(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {!archive && (
            <div className="ca-actions">
              <Link
                className="ca-parent"
                to={cruzAlta.rota}
                search={{ vista: "acervo", objeto: object.id, aba: "documentos" }}
              >
                Consultar no acervo
              </Link>
              {sheet.pode_editar && (
                <Link
                  className="ca-parent"
                  to="/nr-35/$"
                  params={{ _splat: "documentos" }}
                  search={{
                    cliente: cruzAlta.cliente,
                    unidade: cruzAlta.unidade,
                    escopo: "unidade",
                    objeto: object.id,
                    painel: "acervo",
                  }}
                >
                  Acervo NR-35
                </Link>
              )}
            </div>
          )}{" "}
          {sheet.pode_publicar && object.id === "unidade" && (
            <button className="ca-action" onClick={() => setForm("importar")}>
              Conciliar inventário técnico
            </button>
          )}
        </>
      ) : (
        <>
          <p>{sheet.descricao || "Descrição ainda não informada."}</p>
          {object.code && <p>Código técnico · {object.code}</p>}
          {object.status && <p>Situação na revisão 56 · {object.status}</p>}
          <h3>Observações</h3>
          <p>{sheet.observacoes || "Nenhuma observação registrada."}</p>
          {sheet.pode_editar && (
            <button className="ca-action" onClick={() => setForm("editar")}>
              <Pencil size={14} />
              Editar ficha
            </button>
          )}
          <details>
            <summary>Metadados e histórico</summary>
            <p>
              Versão {sheet.version} · {formatDate(sheet.atualizado_em)}
            </p>
            {sheet.atualizado_por && <p>Autor da atualização · {sheet.atualizado_por}</p>}
            {Object.entries(sheet.atributos ?? {}).map(([k, v]) => (
              <p key={k}>
                <strong>{k}</strong> · {displayValue(v)}
              </p>
            ))}
            {(sheet.historico ?? []).map((h, i) => (
              <p key={i}>{displayValue(h)}</p>
            ))}
          </details>
        </>
      )}
    </>
  );
}
function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "Pendente";
  if (Array.isArray(v)) return v.map(displayValue).join(" · ");
  if (typeof v === "object")
    return Object.entries(v)
      .map(([k, x]) => k.replace(/_/g, " ") + " " + displayValue(x))
      .join(" · ");
  return String(v);
}
type FormActions = { onCancel: () => void; onSuccess: (msg: string) => Promise<void> };
function CorrectDocument({
  scope,
  doc,
  onCancel,
  onSuccess,
}: FormActions & { scope: Scope; doc: DocumentRow }) {
  const correct = useServerFn(caMetadados);
  const [title, setTitle] = useState(doc.titulo),
    [description, setDescription] = useState(doc.descricao ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await correct({
            data: {
              ...scope,
              documento_id: doc.id,
              version: doc.version,
              titulo: title,
              descricao: description,
            },
          });
          await onSuccess("Correção registrada no histórico.");
        } catch (e) {
          setError(describeError(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Corrigir metadados do documento</h3>
      <label>
        Título de exibição
        <input
          required
          minLength={2}
          maxLength={240}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Descrição
        <textarea
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {error && feedback(error)}
      <div className="ca-actions">
        <button className="ca-action" disabled={busy}>
          Registrar correção
        </button>
        <button className="ca-action" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
function EditSheet({
  scope,
  sheet,
  onCancel,
  onSuccess,
}: FormActions & { scope: Scope; sheet: Sheet }) {
  const save = useServerFn(caSalvarFicha),
    get = useServerFn(caFicha);
  const [base, setBase] = useState(sheet);
  const [draft, setDraft] = useState({
    titulo: sheet.titulo,
    descricao: sheet.descricao ?? "",
    observacoes: sheet.observacoes ?? "",
  });
  const [dimensions, setDimensions] = useState(sheet.atributos);
  const [attribute, setAttribute] = useState("");
  const [conflict, setConflict] = useState<Sheet | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        const alteracoes = Object.fromEntries(
          Object.entries(draft).filter(([k, v]) => v !== (base[k as keyof typeof draft] ?? "")),
        );
        try {
          const changedDims = JSON.stringify(dimensions) !== JSON.stringify(base.atributos);
          if (Object.keys(alteracoes).length || changedDims)
            await save({
              data: {
                ...scope,
                version: base.version,
                alteracoes: { ...alteracoes, ...(changedDims ? { atributos: dimensions } : {}) },
              },
            });
          await onSuccess("Ficha salva.");
        } catch (c) {
          setError(describeError(c));
          if (/conflito|concorr|versão|version/i.test(describeError(c)))
            try {
              setConflict(await get({ data: scope }));
            } catch {
              /* draft stays visible */
            }
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Editar ficha técnica</h3>
      <label>
        Nome de exibição
        <input
          required
          maxLength={200}
          value={draft.titulo}
          onChange={(e) => setDraft({ ...draft, titulo: e.target.value })}
        />
      </label>
      <label>
        Descrição
        <textarea
          maxLength={4000}
          value={draft.descricao}
          onChange={(e) => setDraft({ ...draft, descricao: e.target.value })}
        />
      </label>
      <label>
        Observações
        <textarea
          maxLength={4000}
          value={draft.observacoes}
          onChange={(e) => setDraft({ ...draft, observacoes: e.target.value })}
        />
      </label>
      <details>
        <summary>Dimensões e fontes</summary>
        {Object.entries(dimensions).map(([key, d]) => (
          <fieldset key={key}>
            <legend>{key}</legend>
            <label>
              Valor
              <input
                type="number"
                step="any"
                value={d.valor ?? ""}
                placeholder="Desconhecido"
                onChange={(e) =>
                  setDimensions({
                    ...dimensions,
                    [key]: { ...d, valor: e.target.value === "" ? null : e.target.valueAsNumber },
                  })
                }
              />
            </label>
            <label>
              Unidade de medida
              <input
                required
                value={d.unidade}
                maxLength={32}
                onChange={(e) =>
                  setDimensions({ ...dimensions, [key]: { ...d, unidade: e.target.value } })
                }
              />
            </label>
            <label>
              Fonte da medida
              <input
                required
                value={d.fonte}
                maxLength={2000}
                onChange={(e) =>
                  setDimensions({ ...dimensions, [key]: { ...d, fonte: e.target.value } })
                }
              />
            </label>
            <label>
              Confirmação
              <select
                value={d.confirmacao}
                onChange={(e) =>
                  setDimensions({
                    ...dimensions,
                    [key]: { ...d, confirmacao: e.target.value as typeof d.confirmacao },
                  })
                }
              >
                {["medido", "cotado", "interpretado", "estimado", "pendente"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </fieldset>
        ))}
        <label>
          Nova dimensão
          <input maxLength={100} value={attribute} onChange={(e) => setAttribute(e.target.value)} />
        </label>
        <button
          className="ca-action"
          type="button"
          disabled={!attribute.trim() || attribute.trim() in dimensions}
          onClick={() => {
            setDimensions({
              ...dimensions,
              [attribute.trim()]: { valor: null, unidade: "m", fonte: "", confirmacao: "pendente" },
            });
            setAttribute("");
          }}
        >
          Adicionar dimensão
        </button>
      </details>
      {error && feedback(error)}
      {conflict && (
        <div className="ca-feedback">
          <h3>Versão {conflict.version} no servidor</h3>
          <p>{conflict.titulo}</p>
          <p>{conflict.descricao}</p>
          <p>{conflict.observacoes}</p>
          <p>{displayValue(conflict.atributos)}</p>
          <button
            className="ca-action"
            type="button"
            onClick={() => {
              setDraft((prev) => ({
                ...prev,
                ...Object.fromEntries(
                  Object.keys(prev)
                    .filter(
                      (k) => prev[k as keyof typeof prev] === (base[k as keyof typeof prev] ?? ""),
                    )
                    .map((k) => [k, conflict[k as keyof typeof prev] ?? ""]),
                ),
              }));
              setDimensions((prev) => ({
                ...conflict.atributos,
                ...Object.fromEntries(
                  Object.entries(prev).filter(
                    ([k, v]) => JSON.stringify(v) !== JSON.stringify(base.atributos[k]),
                  ),
                ),
              }));
              setBase(conflict);
              setConflict(null);
              setError("");
            }}
          >
            Conciliar com esta versão
          </button>
        </div>
      )}
      <div className="ca-actions">
        <button className="ca-action" disabled={busy || !!conflict}>
          Salvar ficha
        </button>
        <button className="ca-action" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
function Attach({
  scope,
  user,
  mode,
  target,
  title,
  onCancel,
  onSuccess,
}: FormActions & {
  scope: Scope;
  user: string;
  mode: "anexar" | "vincular";
  target: DocumentRow | null;
  title: string;
}) {
  const prepare = useServerFn(caPreparar),
    publish = useServerFn(caPublicar),
    link = useServerFn(caVincular),
    list = useServerFn(caDocumentosDisponiveis);
  const [purpose, setPurpose] = useState<Purpose>(
    target?.escopo ?? (scope.chave === "unidade" ? "unidade" : "individual"),
  );
  const [file, setFile] = useState<File | null>(null),
    [name, setName] = useState(target?.titulo ?? ""),
    [rev, setRev] = useState(""),
    [date, setDate] = useState("");
  const [existing, setExisting] = useState(""),
    [phase, setPhase] = useState(""),
    [error, setError] = useState("");
  const guard = useRef(false);
  const available = useQuery({
    queryKey: ["cruz-alta", user, scope.organization_id, "disponiveis", scope.chave],
    queryFn: ({ signal }) => list({ data: scope, signal }),
    enabled: mode === "vincular",
    retry: false,
  });
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (guard.current) return;
        guard.current = true;
        setError("");
        try {
          if (mode === "vincular") {
            setPhase("Confirmando vínculo…");
            await link({ data: { ...scope, documento_id: existing, escopo: purpose } });
          } else if (file) {
            setPhase("Identificando arquivo…");
            const destino = target ? { ...scope, chave: target.objeto } : scope;
            const meta = await describeFile(file);
            const operacao = await operationId([
              user,
              scope,
              purpose,
              target?.id ?? null,
              name.trim(),
              rev.trim(),
              date,
              meta.sha256,
            ]);
            setPhase("Enviando ao acervo…");
            const ticket = await prepare({ data: { ...destino, ...meta, operacao } });
            await transferFile(ticket, file, meta.mime);
            setPhase("Verificando arquivo e publicando revisão…");
            await publish({
              data: {
                ...destino,
                operacao,
                arquivo_id: ticket.arquivo_id,
                titulo: name,
                rotulo: rev,
                data: date,
                escopo: purpose,
                ...(target
                  ? {
                      documento_id: target.id,
                      ...(target.vigente_id ? { anterior_id: target.vigente_id } : {}),
                    }
                  : {}),
              },
            });
          } else throw new Error("Escolha o arquivo.");
          await onSuccess(
            mode === "vincular" ? "Vínculo confirmado." : "Revisão publicada e vinculada.",
          );
        } catch (c) {
          setError(describeError(c));
        } finally {
          guard.current = false;
          setPhase("");
        }
      }}
    >
      <h3>
        {mode === "vincular"
          ? "Vincular documento existente"
          : target
            ? "Adicionar revisão"
            : "Enviar novo documento"}
      </h3>
      <p>
        Destino · {target ? (objects.find((o) => o.id === target.objeto)?.name ?? title) : title}
      </p>
      <label>
        Finalidade do vínculo
        <select
          disabled={!!target}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as Purpose)}
        >
          {(Object.keys(scopeLabels) as Purpose[])
            .filter((p) => (scope.chave === "unidade" ? p === "unidade" : p !== "unidade"))
            .map((s) => (
              <option key={s} value={s}>
                {scopeLabels[s]}
              </option>
            ))}
        </select>
      </label>
      {mode === "vincular" ? (
        <>
          <label>
            Documento da unidade
            <select required value={existing} onChange={(e) => setExisting(e.target.value)}>
              <option value="">Escolher documento</option>
              {available.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.titulo}
                </option>
              ))}
            </select>
          </label>
          {available.isError && feedback(describeError(available.error))}
        </>
      ) : (
        <>
          <label>
            Arquivo original
            <input
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !name) setName(f.name.replace(/\.[^.]*$/, ""));
              }}
            />
          </label>
          <label>
            Título
            <input
              required
              maxLength={200}
              value={name}
              disabled={!!target}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Revisão técnica
            <input required maxLength={60} value={rev} onChange={(e) => setRev(e.target.value)} />
          </label>
          <label>
            Data da revisão
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </>
      )}
      {phase && <p role="status">{phase}</p>}
      {error && feedback(error)}
      <div className="ca-actions">
        <button className="ca-action" disabled={!!phase}>
          {mode === "vincular" ? "Confirmar vínculo" : "Enviar e publicar"}
        </button>
        <button type="button" className="ca-action" disabled={!!phase} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
