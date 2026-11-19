import { useEffect, useRef, useState, Suspense, lazy, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileImage,
  FileText,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import type { CruzObject } from "./scene-types";
import { NR_ARQUIVO_MAX_BYTES } from "@/features/nr/files";
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
import {
  InspectionSection,
  InspectionSourcesReader,
  RdoPhotoFolders,
  RelatedInspections,
} from "./InspectionSheet";
import type { CaInspectionLine, CaInspectionSummary } from "./inspection-domain";
import {
  inspectionCatalog,
  objectInspection,
  technicalTag,
  technicalTitle,
} from "./inspection-display";

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
  readInspection: (evidence: string, page: number) => void;
  openInspection: (id: string) => void;
  inspections: CaInspectionSummary | undefined;
  inspectionsPending: boolean;
  refreshInspections: () => Promise<unknown>;
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
  const reading = !!(search.revisao || search.documento || search.evidencia);
  return (
    <>
      <div hidden={reading}>
        <SheetContent {...props} scope={scope} sheet={sheet.data} refresh={refresh} />
      </div>
      {search.evidencia ? (
        <InspectionSourcesReader
          key={search.evidencia + "/" + search.pagina}
          user={user}
          object={object.id}
          summary={props.inspections}
          pending={props.inspectionsPending}
          evidenceId={search.evidencia}
          page={search.pagina}
        />
      ) : (
        reading && (
          <Reader
            key={[object.id, search.documento].join("/")}
            onRevision={props.openReader}
            user={user}
            scope={scope}
            search={search}
            docs={sheet.data.documentos}
          />
        )
      )}
    </>
  );
}

function Reader({
  user,
  scope,
  search,
  docs,
  onRevision,
}: {
  user: string;
  scope: Scope;
  search: MapSearch;
  docs: DocumentRow[];
  onRevision: Props["openReader"];
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
      <header className="ca-reader-title">
        <h3>{doc.titulo}</h3>
        <p>
          {formatDate(rev.data)}{" "}
          <span className="ca-version" data-current={rev.id === doc.vigente_id}>
            {rev.id === doc.vigente_id ? "Vigente" : "Histórica"}
          </span>
        </p>
        <label>
          Revisão aberta
          <select value={rev.id} onChange={(event) => onRevision(doc.id, event.target.value)}>
            {doc.revisoes.map((r) => (
              <option key={r.id} value={r.id}>
                {revisionLabel(r.rotulo)} · {r.id === doc.vigente_id ? "Vigente" : "Histórica"}
              </option>
            ))}
          </select>
        </label>
        {rev.nota && <p>{rev.nota}</p>}
      </header>
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
          className="ca-reader-image"
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
function revisionLabel(label: string) {
  return label === "Original" ? label : "Revisão " + label;
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
  readInspection,
  openInspection,
  inspections,
  inspectionsPending,
  refreshInspections,
  archive,
}: Props & { scope: Scope; sheet: Sheet; refresh: () => Promise<void> }) {
  const [form, setForm] = useState<"anexar" | "vincular" | "editar" | "importar" | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<DocumentRow | null>(null);
  const [correction, setCorrection] = useState<DocumentRow | null>(null);
  const [unlink, setUnlink] = useState<DocumentRow | null>(null);
  const [note, setNote] = useState("");
  const [unlinkError, setUnlinkError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
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
  const catalog = inspectionCatalog(inspections?.lines);
  const objectTitle = technicalTag(object)
    ? technicalTitle(object, objectInspection(object, catalog))
    : sheet.titulo;
  const confirmUnlink =
    editing && unlink ? (
      <div className="ca-feedback ca-unlink" role="group" aria-label="Confirmar desvinculação">
        <p>
          Desvincular “{unlink.titulo}” de {sheet.titulo}?
        </p>
        {unlinkError && feedback(unlinkError)}
        <div className="ca-actions">
          <button
            className="ca-action ca-danger"
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
                setUnlinkError(describeError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar desvinculação
          </button>
          <button className="ca-action" disabled={busy} onClick={() => setUnlink(null)}>
            Cancelar
          </button>
        </div>
      </div>
    ) : null;
  const docsTab = search.aba !== "ficha";
  const editedTitle = !technicalTag(object) && sheet.titulo !== object.name ? sheet.titulo : null;
  const isForm = !!(form || correction);
  const canEdit =
    sheet.pode_editar || sheet.pode_publicar || sheet.documentos.some((d) => d.pode_corrigir);
  return (
    <section className="ca-technical">
      {!isForm && (
        <>
          {editedTitle && <h3>{editedTitle}</h3>}
          <div className="ca-tabs" role="group" aria-label="Conteúdo da ficha">
            <button
              aria-pressed={docsTab}
              onClick={() => change({ ...search, aba: "documentos" }, true)}
            >
              <FileText size={16} aria-hidden="true" />
              Documentos
            </button>
            <button
              aria-pressed={!docsTab}
              onClick={() => change({ ...search, aba: "ficha" }, true)}
            >
              Ficha técnica
            </button>
          </div>
          {canEdit && (
            <div className="ca-work-mode" role="group" aria-label="Modo da ficha">
              <button
                type="button"
                aria-pressed={!editing}
                onClick={() => {
                  setEditing(false);
                  setUnlink(null);
                }}
              >
                Consulta
              </button>
              <button type="button" aria-pressed={editing} onClick={() => setEditing(true)}>
                <Pencil size={14} aria-hidden="true" /> Editar
              </button>
            </div>
          )}
        </>
      )}
      {note && !isForm && (
        <p className="ca-feedback" role="status">
          {note}
        </p>
      )}
      {!isForm && inspections?.rdoFolders && (
        <RdoPhotoFolders object={object} folders={inspections.rdoFolders} inspections={catalog} />
      )}
      {!isForm && inspections && (object.kind === "estrutura" || object.kind === "componente") && (
        <RelatedInspections object={object.id} lines={inspections.lines} onOpen={openInspection} />
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
          title={objectTitle}
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
          {editing && sheet.pode_publicar && (
            <div className="ca-actions ca-document-tools">
              <button className="ca-action ca-primary" onClick={() => setForm("anexar")}>
                <Upload size={16} aria-hidden="true" />
                Enviar documento
              </button>
              <button className="ca-action" onClick={() => setForm("vincular")}>
                <Link2 size={16} aria-hidden="true" />
                Vincular existente
              </button>
            </div>
          )}
          <DocumentShelf
            docs={sheet.documentos}
            inspections={catalog}
            owner={object.id}
            editing={editing}
            canPublish={sheet.pode_publicar}
            canUnlink={sheet.pode_editar}
            confirm={(doc) =>
              doc.id === unlink?.id && doc.escopo === unlink.escopo ? confirmUnlink : null
            }
            open={openReader}
            correct={setCorrection}
            revise={(doc) => {
              setRevisionTarget(doc);
              setForm("anexar");
            }}
            unlink={(doc) => {
              setUnlink(doc);
              setUnlinkError("");
            }}
          />
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
          )}
          {editing && sheet.pode_publicar && object.id === "unidade" && (
            <button className="ca-action" onClick={() => setForm("importar")}>
              Conciliar inventário técnico
            </button>
          )}
        </>
      ) : (
        <>
          {(object.kind === "lvhf" || object.id === "unidade") && (
            <InspectionSection
              key={object.id}
              object={object.id}
              summary={inspections}
              pending={inspectionsPending}
              onOpen={readInspection}
              refresh={refreshInspections}
            />
          )}
          <div className="ca-detail-section">
            <h3>Descrição</h3>
            <p>{sheet.descricao || "Descrição ainda não informada."}</p>
            {(object.code || object.status) && (
              <dl className="ca-metadata">
                {object.code && (
                  <div>
                    <dt>Código técnico</dt>
                    <dd>{object.code}</dd>
                  </div>
                )}
                {object.status && (
                  <div>
                    <dt>Situação na revisão 56</dt>
                    <dd>{object.status}</dd>
                  </div>
                )}
              </dl>
            )}
            <h3>Observações</h3>
            <p>{sheet.observacoes || "Nenhuma observação registrada."}</p>
          </div>
          {Object.entries(sheet.atributos ?? {}).length > 0 && (
            <section className="ca-detail-section">
              <h3>Dimensões e fontes</h3>
              <dl className="ca-metadata">
                {Object.entries(sheet.atributos).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {value.valor === null
                        ? "Pendente"
                        : value.valor.toLocaleString("pt-BR") + " " + value.unidade}
                    </dd>
                    <dd className="ca-hint">
                      {value.fonte} · {value.confirmacao}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {editing && sheet.pode_editar && (
            <button className="ca-action ca-primary" onClick={() => setForm("editar")}>
              <Pencil size={14} aria-hidden="true" />
              Editar ficha
            </button>
          )}
          <details>
            <summary>Histórico da ficha</summary>
            <p>
              Versão {sheet.version} · {formatDate(sheet.atualizado_em)}
            </p>
            {sheet.historico.map((h, i) => (
              <p key={i}>
                {formatDate(h.em)} · {h.comando.replaceAll("_", " ")}
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
function DocumentShelf({
  docs,
  inspections,
  owner,
  editing,
  canPublish,
  canUnlink,
  open,
  correct,
  revise,
  unlink,
  confirm,
}: {
  docs: DocumentRow[];
  inspections: ReadonlyMap<string, CaInspectionLine>;
  owner: string;
  editing: boolean;
  canPublish: boolean;
  canUnlink: boolean;
  open: Props["openReader"];
  correct: (doc: DocumentRow) => void;
  revise: (doc: DocumentRow) => void;
  unlink: (doc: DocumentRow) => void;
  confirm: (doc: DocumentRow) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const words = normalize(query.trim()).split(/\s+/);
  const names = (doc: DocumentRow) =>
    (doc.origens ?? [doc.objeto]).map((id) => {
      const source = objects.find((object) => object.id === id);
      return source ? technicalTitle(source, objectInspection(source, inspections)) : id;
    });
  const filtered = docs.filter((doc) => {
    const text = normalize(
      [
        doc.titulo,
        doc.descricao,
        ...names(doc),
        ...doc.revisoes.map((r) => revisionLabel(r.rotulo)),
      ].join(" "),
    );
    return words.every((word) => text.includes(word));
  });
  if (!docs.length)
    return (
      <div className="ca-empty">
        <FileText size={20} aria-hidden="true" />
        <strong>Nenhum documento vinculado</strong>
        <p>Os documentos deste objeto aparecem aqui quando são vinculados ao acervo.</p>
      </div>
    );
  return (
    <div className="ca-document-shelf">
      {docs.length > 3 && (
        <label className="ca-doc-search">
          <span>Buscar no acervo do objeto</span>
          <span>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Título, objeto ou revisão"
            />
          </span>
        </label>
      )}
      {!filtered.length && <p role="status">Nenhum documento corresponde à busca.</p>}
      {(Object.keys(scopeLabels) as Purpose[]).map((scope) => {
        const group = filtered.filter((doc) => doc.escopo === scope);
        if (!group.length) return null;
        return (
          <section className="ca-doc-group" key={scope}>
            <h3>
              {scopeLabels[scope]} <span>{group.length}</span>
            </h3>
            {group.map((doc) => {
              const current = doc.revisoes.find((r) => r.id === doc.vigente_id);
              const history = doc.revisoes.filter((r) => r.id !== doc.vigente_id);
              const icon = current?.mime?.startsWith("image/") ? (
                <FileImage size={18} />
              ) : (
                <FileText size={18} />
              );
              const canEditDoc =
                editing &&
                (doc.pode_corrigir ||
                  canPublish ||
                  (canUnlink && (doc.origens ?? [doc.objeto]).includes(owner)));
              return (
                <article className="ca-doc" key={doc.id + doc.objeto}>
                  <div className="ca-doc-heading">
                    <span className="ca-doc-icon" aria-hidden="true">
                      {icon}
                    </span>
                    <div>
                      <h4>{doc.titulo}</h4>
                      <p className="ca-hint">{names(doc).join(" · ")}</p>
                    </div>
                  </div>
                  {doc.descricao && <p className="ca-doc-description">{doc.descricao}</p>}
                  {current ? (
                    <button
                      className="ca-open-revision"
                      onClick={() => open(doc.id, current.id)}
                      aria-label={`Abrir ${doc.titulo}, ${revisionLabel(current.rotulo)} vigente`}
                    >
                      <span>
                        <strong>{revisionLabel(current.rotulo)}</strong>
                        <small>{formatDate(current.data)}</small>
                      </span>
                      <span className="ca-version" data-current="true">
                        Vigente
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  ) : (
                    <p className="ca-hint">Nenhuma revisão vigente.</p>
                  )}
                  {!!history.length && (
                    <details className="ca-revisions">
                      <summary>
                        Revisões anteriores <span>({history.length})</span>
                      </summary>
                      <ul>
                        {history.map((r) => (
                          <li key={r.id}>
                            <button className="ca-open-revision" onClick={() => open(doc.id, r.id)}>
                              <span>
                                <strong>{revisionLabel(r.rotulo)}</strong>
                                <small>{formatDate(r.data)}</small>
                              </span>
                              <ChevronRight size={16} aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {canEditDoc && (
                    <div className="ca-actions ca-doc-edit">
                      {canPublish && (
                        <button className="ca-action" onClick={() => revise(doc)}>
                          <Plus size={15} aria-hidden="true" /> Adicionar revisão
                        </button>
                      )}
                      {doc.pode_corrigir && (
                        <button className="ca-action" onClick={() => correct(doc)}>
                          Corrigir metadados
                        </button>
                      )}
                      {canUnlink && (doc.origens ?? [doc.objeto]).includes(owner) && (
                        <button className="ca-action ca-danger" onClick={() => unlink(doc)}>
                          Desvincular
                        </button>
                      )}
                    </div>
                  )}
                  {confirm(doc)}
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
function FormHeading({ title, destination }: { title: string; destination?: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <header className="ca-form-heading">
      <h3 ref={heading} tabIndex={-1}>
        {title}
      </h3>
      {destination && <p>{destination}</p>}
    </header>
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
      <FormHeading title="Corrigir metadados" destination={doc.titulo} />
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
        <button className="ca-action ca-primary" disabled={busy}>
          {busy ? "Registrando…" : "Registrar correção"}
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
  const save = useServerFn(caSalvarFicha);
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
          if (Object.keys(alteracoes).length || changedDims) {
            const result = await save({
              data: {
                ...scope,
                version: base.version,
                alteracoes: { ...alteracoes, ...(changedDims ? { atributos: dimensions } : {}) },
              },
            });
            if (result.conflito) {
              setConflict(result.ficha);
              setError("Outra edição foi salva. Compare as duas versões antes de conciliar.");
              return;
            }
          }
          await onSuccess("Ficha salva.");
        } catch (c) {
          setError(describeError(c));
        } finally {
          setBusy(false);
        }
      }}
    >
      <FormHeading title="Editar ficha técnica" destination={sheet.titulo} />
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
        <button className="ca-action ca-primary" disabled={busy || !!conflict}>
          {busy ? "Salvando…" : "Salvar ficha"}
        </button>
        <button className="ca-action" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
const acceptedFiles = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const uploadSteps = ["Arquivo", "Identificação", "Conferência"] as const;

function fileSize(bytes: number) {
  const mib = bytes / 1024 / 1024;
  return mib >= 1
    ? mib.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MiB"
    : Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR") + " KiB";
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
    [editedName, setEditedName] = useState(false),
    [rev, setRev] = useState(""),
    [date, setDate] = useState("");
  const [existing, setExisting] = useState(""),
    [phase, setPhase] = useState(""),
    [error, setError] = useState(""),
    [step, setStep] = useState(0),
    [dragging, setDragging] = useState(false);
  const guard = useRef(false);
  const stages = useRef<HTMLOListElement>(null);
  const goToStep = (next: number) => {
    setStep(next);
    requestAnimationFrame(() => stages.current?.focus());
  };
  const linking = mode === "vincular";
  const destination = target ? (objects.find((o) => o.id === target.objeto)?.name ?? title) : title;
  const owner = target?.objeto ?? scope.chave;
  const available = useQuery({
    queryKey: ["cruz-alta", user, scope.organization_id, "disponiveis", scope.chave],
    queryFn: ({ signal }) => list({ data: scope, signal }),
    enabled: linking,
    retry: false,
  });
  const inputTitle = linking
    ? "Vincular documento existente"
    : target
      ? "Adicionar revisão"
      : "Enviar documento";
  const selectFile = (files: FileList | null) => {
    if (!files?.length) return;
    if (files.length !== 1) {
      setFile(null);
      setError("Escolha um arquivo por envio.");
      return;
    }
    const next = files[0]!;
    const ext = next.name.slice(next.name.lastIndexOf(".")).toLowerCase();
    if (!acceptedFiles.includes(ext)) {
      setFile(null);
      setError("Escolha um original PDF, PNG, JPG ou WebP.");
      return;
    }
    if (!next.size || next.size > NR_ARQUIVO_MAX_BYTES) {
      setFile(null);
      setError(next.size ? "O arquivo excede o limite de 50 MiB." : "O arquivo está vazio.");
      return;
    }
    const stem = (value: File) => value.name.replace(/\.[^.]*$/, "").slice(0, 240);
    if (!target && !editedName) setName(stem(next));
    setFile(next);
    setError("");
  };
  const finalStep = linking || step === 2;
  return (
    <form
      className="ca-acervo-form"
      aria-busy={!!phase}
      onSubmit={async (e) => {
        e.preventDefault();
        if (guard.current) return;
        setError("");
        if (!linking && !file) {
          setError("Selecione o arquivo original para continuar.");
          goToStep(0);
          return;
        }
        if (!finalStep) {
          if (step === 1 && (name.trim().length < 2 || !rev.trim() || !date)) {
            setError("Preencha o título, a revisão técnica e a data.");
            return;
          }
          goToStep(step + 1);
          return;
        }
        guard.current = true;
        try {
          if (linking) {
            setPhase("Confirmando vínculo…");
            await link({ data: { ...scope, documento_id: existing, escopo: purpose } });
          } else if (file) {
            setPhase("Identificando arquivo…");
            const destino = { ...scope, chave: owner };
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
            setPhase("Enviando ao acervo privado…");
            const ticket = await prepare({ data: { ...destino, ...meta, operacao } });
            await transferFile(ticket, file, meta.mime);
            setPhase("Verificando o original e publicando a revisão…");
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
          }
          await onSuccess(linking ? "Vínculo confirmado." : "Revisão publicada e vinculada.");
        } catch (error) {
          setError(describeError(error));
        } finally {
          guard.current = false;
          setPhase("");
        }
      }}
    >
      <FormHeading title={inputTitle} destination={destination} />
      {!linking && (
        <ol
          className="ca-stepper"
          aria-label={`Etapa ${step + 1} de 3. ${uploadSteps[step]}`}
          ref={stages}
          tabIndex={-1}
        >
          {uploadSteps.map((name, i) => (
            <li key={name} aria-current={step === i ? "step" : undefined} data-done={step > i}>
              <span aria-hidden="true">{step > i ? <Check size={13} /> : i + 1}</span>
              {name}
            </li>
          ))}
        </ol>
      )}

      {!linking && step === 0 && (
        <>
          <label
            className="ca-dropzone"
            data-dragging={dragging}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (
                !(event.relatedTarget instanceof Node) ||
                !event.currentTarget.contains(event.relatedTarget)
              )
                setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              selectFile(event.dataTransfer.files);
            }}
          >
            <Upload size={22} aria-hidden="true" />
            <strong>{file ? "Escolher outro original" : "Escolher arquivo original"}</strong>
            <small>Ou solte o arquivo aqui · PDF, PNG, JPG ou WebP · até 50 MiB</small>
            <input
              type="file"
              accept={acceptedFiles.join(",")}
              onChange={(event) => {
                selectFile(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {file && (
            <div className="ca-file-selection">
              <Paperclip size={17} aria-hidden="true" />
              <div>
                <strong>{file.name}</strong>
                <small>{fileSize(file.size)}</small>
              </div>
              <button
                type="button"
                className="ca-action"
                aria-label="Remover arquivo selecionado"
                onClick={() => {
                  setFile(null);
                  setError("");
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}

      {(linking || step === 1) && (
        <>
          {linking ? (
            <label>
              Documento da unidade
              <select
                required
                value={existing}
                disabled={!!phase || !available.data?.length}
                onChange={(e) => setExisting(e.target.value)}
              >
                <option value="">Escolher documento</option>
                {available.data?.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.titulo}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Título do documento
                <input
                  required
                  minLength={2}
                  maxLength={240}
                  value={name}
                  disabled={!!target}
                  onChange={(e) => {
                    setName(e.target.value);
                    setEditedName(true);
                  }}
                />
              </label>
              <div className="ca-form-row">
                <label>
                  Revisão técnica
                  <input
                    required
                    maxLength={60}
                    value={rev}
                    onChange={(e) => setRev(e.target.value)}
                  />
                </label>
                <label>
                  Data da revisão
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </div>
              <p className="ca-hint">Use o identificador e a data que constam no original.</p>
            </>
          )}
          <label>
            Finalidade do vínculo
            <select
              disabled={!!target || !!phase}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as Purpose)}
            >
              {(Object.keys(scopeLabels) as Purpose[])
                .filter((p) => (owner === "unidade" ? p === "unidade" : p !== "unidade"))
                .map((s) => (
                  <option key={s} value={s}>
                    {scopeLabels[s]}
                  </option>
                ))}
            </select>
          </label>
          {linking && available.isPending && <p role="status">Buscando documentos disponíveis…</p>}
          {linking && available.isSuccess && !available.data.length && (
            <p role="status">Não há documentos disponíveis para este vínculo.</p>
          )}
          {linking && available.isError && (
            <>
              {feedback(describeError(available.error))}
              <button type="button" className="ca-action" onClick={() => void available.refetch()}>
                Tentar novamente
              </button>
            </>
          )}
        </>
      )}

      {!linking && step === 2 && file && (
        <div className="ca-upload-review">
          <h4>Confira os dados antes de publicar</h4>
          <dl className="ca-metadata">
            <div>
              <dt>Arquivo original</dt>
              <dd>
                {file.name} · {fileSize(file.size)}
              </dd>
            </div>
            <div>
              <dt>Documento</dt>
              <dd>{name}</dd>
            </div>
            <div>
              <dt>Revisão</dt>
              <dd>
                {revisionLabel(rev)} · {formatDate(date)}
              </dd>
            </div>
            <div>
              <dt>Vínculo</dt>
              <dd>
                {destination} · {scopeLabels[purpose]}
              </dd>
            </div>
          </dl>
          {target && (
            <p>
              Ao publicar, esta revisão passa a ser vigente. As versões anteriores continuam no
              histórico.
            </p>
          )}
        </div>
      )}
      {phase && (
        <p className="ca-progress" role="status">
          {phase}
        </p>
      )}
      {error && feedback(error)}
      <div className="ca-actions ca-form-actions">
        <button
          className="ca-action ca-primary"
          disabled={!!phase || (linking ? !existing : !file)}
        >
          {phase
            ? "Aguarde…"
            : linking
              ? "Confirmar vínculo"
              : finalStep
                ? "Publicar revisão"
                : "Continuar"}
          {!finalStep && <ChevronRight size={15} aria-hidden="true" />}
        </button>
        {!linking && step > 0 && (
          <button
            type="button"
            className="ca-action"
            disabled={!!phase}
            onClick={() => {
              goToStep(step - 1);
              setError("");
            }}
          >
            <ArrowLeft size={15} aria-hidden="true" /> Voltar
          </button>
        )}
        <button
          type="button"
          className="ca-action ca-quiet-action"
          disabled={!!phase}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
