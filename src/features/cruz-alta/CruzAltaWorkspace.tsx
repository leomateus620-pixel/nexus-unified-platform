import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LockKeyhole,
  Maximize,
  Minimize,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { caInspectionSummary } from "./inspection.functions";
import { useOrg, useSessionUser } from "@/features/org/session";
import CruzAltaViewer from "./CruzAltaViewer";
import { geometry, objects as elements } from "./manifest";
import type { CruzObject } from "./scene-types";
import { cruzAlta } from "./context";
import {
  inspectionCatalog,
  objectInspection,
  technicalTag,
  technicalTitle,
} from "./inspection-display";
import { SectorIcon } from "./sector-visual";
import { lvhfAppearance, lvhfState, lvhfSwatch } from "./lvhf-appearance";
import { useRdoPhotos } from "./use-rdo-photos";
import "./workspace.css";
const objects: CruzObject[] = elements.some((e) => e.id === "unidade")
  ? elements
  : [{ id: "unidade", kind: "setor", name: "Três Tentos — Cruz Alta/RS" }, ...elements];

const objectKinds: Record<CruzObject["kind"], string> = {
  setor: "Setor",
  estrutura: "Estrutura",
  componente: "Componente",
  lvhf: "Linha de vida (LVHF)",
};

function ancestors(object: CruzObject | undefined) {
  const trail: CruzObject[] = [];
  let parent = object?.parent;
  while (parent) {
    const entry = objects.find((o) => o.id === parent);
    if (!entry || trail.includes(entry)) break;
    trail.unshift(entry);
    parent = entry.parent;
  }
  return trail;
}

const loadPanel = () => import("./TechnicalPanel");
const Panel = lazy(loadPanel);
function preparePanel() {
  void loadPanel().catch(() => undefined);
}
function AuthorizedPanel(props: Omit<ComponentProps<typeof Panel>, "photos">) {
  const { documento, revisao, evidencia } = props.search;
  const photos = useRdoPhotos(props.user, props.object, !(documento || revisao || evidencia));
  return (
    <Suspense fallback={<p role="status">Carregando ficha…</p>}>
      <Panel {...props} photos={photos} />
    </Suspense>
  );
}
export type MapSearch = {
  objeto?: string | undefined;
  aba?: "documentos" | "ficha" | undefined;
  documento?: string | undefined;
  revisao?: string | undefined;
  evidencia?: string | undefined;
  pagina?: number | undefined;
};
export type ChangeSearch = (next: MapSearch, replace?: boolean) => void;
type PanelSize = "summary" | "standard" | "wide";

export default function CruzAltaWorkspace({
  search,
  onChange,
  archive = false,
}: {
  search: MapSearch;
  onChange: ChangeSearch;
  archive?: boolean;
}) {
  const user = useSessionUser();
  const org = useOrg();
  const getInspections = useServerFn(caInspectionSummary);
  const authorized = !!user && org.data?.userId === user.id && org.data?.orgId === cruzAlta.org;
  const inspectionQuery = useQuery({
    queryKey: ["cruz-alta", user?.id, cruzAlta.org, "inspecoes"],
    queryFn: ({ signal }) => getInspections({ data: { organization_id: cruzAlta.org }, signal }),
    enabled: authorized,
    retry: false,
    gcTime: 0,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 8_000 : 60_000),
  });
  const inspections = authorized && !inspectionQuery.isError ? inspectionQuery.data : undefined;
  const catalog = useMemo(() => inspectionCatalog(inspections?.lines), [inspections?.lines]);
  const label = (object: CruzObject) => technicalTitle(object, objectInspection(object, catalog));
  const [panelSize, setPanelSize] = useState<PanelSize>("standard");
  const [panelFullscreen, setPanelFullscreen] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [fillViewport, setFillViewport] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const readerOpener = useRef<HTMLElement | null>(null);
  const panelBody = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const scrollPos = useRef(0);
  const inspectionSelection = useRef<string | null>(null);
  const selected = objects.find((o) => o.id === search.objeto);
  const selectedState = lvhfState(selected?.status);
  const trail = ancestors(selected);
  const reader = !!(search.revisao || search.documento || search.evidencia);
  const hasPanel = !!search.objeto || reader;
  const fullPanel = hasPanel && !archive && panelFullscreen;
  const wide = reader || panelSize === "wide";
  const summary = panelSize === "summary" && !reader && !fullPanel;
  const hadPanel = useRef(hasPanel);

  useEffect(() => {
    const updateFullscreen = () => {
      setNativeFullscreen(document.fullscreenElement === workspace.current);
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  async function toggleUnitFullscreen() {
    const root = workspace.current;
    if (!root) return;
    if (fillViewport) {
      setFillViewport(false);
    } else if (document.fullscreenElement === root) {
      await document.exitFullscreen();
    } else {
      try {
        if (document.fullscreenEnabled && root.requestFullscreen) {
          await root.requestFullscreen();
          return;
        }
      } catch {
        // The embedded browser can refuse fullscreen even when it exposes the API.
      }
      setFillViewport(true);
    }
  }

  const select = (id: string) => {
    if (!hasPanel) {
      opener.current = document.activeElement as HTMLElement;
      setPanelFullscreen(false);
    }
    scrollPos.current = 0;
    setPanelSize((size) => (hasPanel && size === "wide" ? size : "standard"));
    onChange({ objeto: id, aba: "documentos" }, !!search.objeto);
  };
  const close = useCallback(() => {
    if (reader)
      onChange({ objeto: search.objeto, aba: search.evidencia ? "ficha" : "documentos" }, true);
    else {
      setPanelFullscreen(false);
      setPanelSize("standard");
      onChange({}, true);
    }
  }, [onChange, reader, search.evidencia, search.objeto]);
  useEffect(() => {
    if (!hasPanel) {
      if (!hadPanel.current) return undefined;
      hadPanel.current = false;
      const target = opener.current;
      opener.current = null;
      let projectionFrame = 0;
      const layoutFrame = requestAnimationFrame(() => {
        projectionFrame = requestAnimationFrame(() => {
          const fallback = workspace.current?.querySelector<HTMLElement>(
            ".ca-search input, select",
          );
          if (target?.isConnected && target.getClientRects().length)
            target.focus({ preventScroll: true });
          if (!target || document.activeElement !== target)
            fallback?.focus({ preventScroll: true });
        });
      });
      return () => {
        cancelAnimationFrame(layoutFrame);
        cancelAnimationFrame(projectionFrame);
      };
    }
    hadPanel.current = true;
    if (panelBody.current) panelBody.current.scrollTop = reader ? 0 : scrollPos.current;
    const fromReader = !reader && readerOpener.current?.isConnected ? readerOpener.current : null;
    if (!reader) readerOpener.current = null;
    (fromReader ?? closeButton.current)?.focus({ preventScroll: true });
    return undefined;
  }, [hasPanel, search.objeto, reader]);
  useEffect(() => {
    if (!hasPanel && !fillViewport) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      if (reader) close();
      else if (fullPanel) setPanelFullscreen(false);
      else if (hasPanel) close();
      else setFillViewport(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [close, fillViewport, fullPanel, hasPanel, reader]);
  const rememberReaderOpener = () => {
    if (reader) return;
    readerOpener.current = document.activeElement as HTMLElement;
    scrollPos.current = panelBody.current?.scrollTop ?? 0;
  };
  const openReader = (doc: string, rev: string) => {
    rememberReaderOpener();
    onChange(
      {
        ...search,
        aba: "documentos",
        documento: doc,
        revisao: rev,
        evidencia: undefined,
        pagina: undefined,
      },
      reader,
    );
  };
  const openInspection = (id: string) => {
    if (search.objeto !== id) inspectionSelection.current = id;
    if (!hasPanel) {
      opener.current = document.activeElement as HTMLElement;
      setPanelFullscreen(false);
    }
    if (search.objeto !== id || search.aba !== "ficha") scrollPos.current = 0;
    setPanelSize((size) => (hasPanel && size === "wide" ? size : "standard"));
    onChange({ objeto: id, aba: "ficha" }, !!search.objeto);
  };
  const readInspection = (evidence: string, page: number) => {
    rememberReaderOpener();
    onChange({ objeto: search.objeto, aba: "ficha", evidencia: evidence, pagina: page });
  };
  return (
    <div
      ref={workspace}
      className={[
        "ca-workspace",
        hasPanel && "ca-has-panel",
        wide && "ca-expanded",
        summary && "ca-compact",
        fullPanel && "ca-panel-fullscreen",
        fillViewport && "ca-window-fullscreen",
        archive && "ca-archive",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {archive ? (
        <div className="ca-archive-index">
          <h2>Acervo de Cruz Alta</h2>
          <label>
            Estrutura ou componente
            <select value={search.objeto ?? ""} onChange={(e) => select(e.target.value)}>
              <option value="">Selecione um objeto</option>
              {objects.map((o) => (
                <option value={o.id} key={o.id}>
                  {label(o)}
                </option>
              ))}
            </select>
          </label>
          <Link to={cruzAlta.rota} search={{ ...search, vista: undefined }}>
            Ver no mapa 3D
          </Link>
        </div>
      ) : (
        <div className="ca-viewport-wrap" inert={fullPanel}>
          <CruzAltaViewer
            selectedId={selected?.id ?? null}
            onSelect={select}
            onPrepareSelection={authorized ? preparePanel : undefined}
            inspections={inspections}
            onOpenInspection={openInspection}
            inspectionSelection={inspectionSelection}
            fullscreen={nativeFullscreen || fillViewport}
            onToggleFullscreen={() => void toggleUnitFullscreen()}
          />
        </div>
      )}
      {hasPanel && (
        <aside
          className="ca-drawer"
          aria-label={reader ? "Leitor de documentos" : "Ficha do objeto"}
        >
          <header className="ca-drawer-head">
            {selected && (
              <span className="ca-drawer-sector-mark" aria-hidden="true">
                <SectorIcon id={selected.id} size={23} />
              </span>
            )}
            <div className="ca-drawer-identity">
              <div className="ca-drawer-overline">
                <span className="ca-drawer-kind">
                  {reader
                    ? "Leitor de documentos"
                    : selected?.id === "unidade"
                      ? "Unidade industrial"
                      : selected
                        ? objectKinds[selected.kind]
                        : "Ficha técnica"}
                </span>
                {!reader && selectedState && (
                  <span className="ca-drawer-state">
                    <i aria-hidden="true" style={{ background: lvhfSwatch(selectedState) }} />
                    {lvhfAppearance[selectedState].label}
                  </span>
                )}
              </div>
              <h2 data-technical={selected && !!technicalTag(selected) ? true : undefined}>
                {selected ? label(selected) : "Objeto indisponível"}
              </h2>
            </div>
            <div className="ca-drawer-actions">
              {!archive && !reader && !fullPanel && (
                <>
                  <button
                    type="button"
                    className="ca-mobile-size"
                    onClick={() => setPanelSize(summary ? "standard" : "summary")}
                    aria-label={summary ? "Abrir meia ficha" : "Recolher ao resumo"}
                    aria-controls={panelId}
                    aria-expanded={!summary}
                    title={summary ? "Abrir meia ficha" : "Recolher ao resumo"}
                  >
                    {summary ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanelSize(wide ? "standard" : "wide")}
                    aria-label={wide ? "Reduzir ficha" : "Expandir ficha"}
                    aria-controls={panelId}
                    title={wide ? "Reduzir ficha" : "Expandir ficha"}
                  >
                    {wide ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                  </button>
                </>
              )}
              {!archive && (
                <button
                  type="button"
                  onClick={() => setPanelFullscreen(!fullPanel)}
                  aria-label={fullPanel ? "Sair da tela cheia da ficha" : "Tela cheia da ficha"}
                  aria-controls={panelId}
                  title={fullPanel ? "Sair da tela cheia da ficha" : "Tela cheia da ficha"}
                >
                  {fullPanel ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
              )}
              <button
                type="button"
                ref={closeButton}
                onClick={close}
                aria-label={reader ? "Fechar leitor" : "Fechar ficha"}
                title={reader ? "Fechar leitor" : "Fechar ficha"}
              >
                <X size={20} />
              </button>
            </div>
          </header>
          <div className="ca-drawer-body" id={panelId} ref={panelBody}>
            {!selected ? (
              <p role="alert">O endereço não corresponde a um objeto desta unidade.</p>
            ) : (
              <>
                {!reader && trail.length > 0 && (
                  <nav className="ca-selection-trail" aria-label="Hierarquia do objeto">
                    <ol>
                      {trail.map((entry) => (
                        <li key={entry.id}>
                          <button type="button" onClick={() => select(entry.id)}>
                            {label(entry)}
                          </button>
                          <ChevronRight size={12} aria-hidden="true" />
                        </li>
                      ))}
                      <li className="sr-only" aria-current="page">
                        {label(selected)}
                      </li>
                    </ol>
                  </nav>
                )}
                {user === undefined || (user && org.isPending) ? (
                  <p className="ca-access-status" role="status">
                    Conferindo acesso…
                  </p>
                ) : !user ? (
                  <div className="ca-access-status">
                    <div className="ca-access-heading">
                      <LockKeyhole size={16} aria-hidden="true" />
                      <strong>Acervo técnico privado</strong>
                    </div>
                    <p>Entre no Nexus para consultar a ficha e as pranchas desta unidade.</p>
                    <Link
                      className="ca-action"
                      to="/auth"
                      search={{ next: window.location.pathname + window.location.search }}
                    >
                      Entrar no Nexus <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                ) : org.data?.userId !== user.id || org.data?.orgId !== cruzAlta.org ? (
                  <p className="ca-access-status" role="alert">
                    A sessão atual não tem acesso a este acervo.
                  </p>
                ) : (
                  <AuthorizedPanel
                    key={user.id + selected.id}
                    user={user.id}
                    object={selected}
                    search={search}
                    change={onChange}
                    openReader={openReader}
                    readInspection={readInspection}
                    openInspection={openInspection}
                    inspections={inspections}
                    inspectionsPending={inspectionQuery.isPending}
                    refreshInspections={inspectionQuery.refetch}
                    archive={archive}
                  />
                )}
                {!reader && geometry.some((p) => p.id === selected.id) && (
                  <details>
                    <summary>Geometria do modelo</summary>
                    <p>
                      Contorno interpretado na implantação. Níveis estimados a partir da silhueta,
                      em metros acima do piso local.
                    </p>
                    {geometry
                      .filter((p) => p.id === selected.id)
                      .map((part, i) => (
                        <p key={i}>
                          Beiral {part.eave.toLocaleString("pt-BR")} m · Elevação até o topo{" "}
                          {(part.eave + part.rise).toLocaleString("pt-BR")} m
                        </p>
                      ))}
                    <p>
                      Para confirmar a altura, conferir um corte cotado que identifique piso, beiral
                      e topo deste corpo.
                    </p>
                  </details>
                )}
                {!reader && selected.note && (
                  <details>
                    <summary>Fontes e pendências</summary>
                    <p>{selected.note}</p>
                  </details>
                )}
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
