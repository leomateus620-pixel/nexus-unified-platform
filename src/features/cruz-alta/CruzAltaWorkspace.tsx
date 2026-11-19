import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, ChevronUp, LockKeyhole, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { caInspectionSummary } from "./inspection.functions";
import { useOrg, useSessionUser } from "@/features/org/session";
import CruzAltaViewer from "./CruzAltaViewer";
import { geometry, objects as elements } from "./manifest";
import type { CruzObject } from "./scene-types";
import { cruzAlta } from "./context";
import { SectorIcon } from "./sector-visual";
import { lvhfAppearance, lvhfState, lvhfSwatch } from "./lvhf-appearance";
import "./workspace.css";
const objects: CruzObject[] = elements.some((e) => e.id === "unidade")
  ? elements
  : [{ id: "unidade", kind: "setor", name: "Três Tentos — Cruz Alta/RS" }, ...elements];

function label(object: CruzObject) {
  return object.id.startsWith("cobertura-")
    ? object.id.slice(10) + " · " + object.name
    : object.name;
}

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

const Panel = lazy(() => import("./TechnicalPanel"));
export type MapSearch = {
  objeto?: string | undefined;
  aba?: "documentos" | "ficha" | undefined;
  documento?: string | undefined;
  revisao?: string | undefined;
  evidencia?: string | undefined;
  pagina?: number | undefined;
};
export type ChangeSearch = (next: MapSearch, replace?: boolean) => void;
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
  const [compact, setCompact] = useState(false);

  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const panelBody = useRef<HTMLDivElement>(null);
  const scrollPos = useRef(0);
  const inspectionSelection = useRef<string | null>(null);
  const selected = objects.find((o) => o.id === search.objeto);
  const selectedState = lvhfState(selected?.status);
  const trail = ancestors(selected);
  const reader = !!(search.revisao || search.documento || search.evidencia);
  const select = (id: string) => {
    if (!search.objeto) opener.current = document.activeElement as HTMLElement;
    scrollPos.current = 0;
    setCompact(false);
    onChange({ objeto: id, aba: "documentos" }, !!search.objeto);
  };
  const close = useCallback(() => {
    if (reader)
      onChange({ objeto: search.objeto, aba: search.evidencia ? "ficha" : "documentos" }, true);
    else {
      onChange({}, true);

      requestAnimationFrame(() =>
        (opener.current?.isConnected
          ? opener.current
          : document.querySelector<HTMLElement>(".ca-workspace button")
        )?.focus(),
      );
    }
  }, [onChange, reader, search.evidencia, search.objeto]);
  useEffect(() => {
    if (!search.objeto) return;
    closeButton.current?.focus({ preventScroll: true });
    if (panelBody.current) panelBody.current.scrollTop = reader ? 0 : scrollPos.current;
  }, [search.objeto, reader]); // Camera and layers stay mounted across panel and reader navigation.
  useEffect(() => {
    if (!search.objeto) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [close, search.objeto]);
  const openReader = (doc: string, rev: string) => {
    if (!reader) scrollPos.current = panelBody.current?.scrollTop ?? 0;
    onChange({
      ...search,
      aba: "documentos",
      documento: doc,
      revisao: rev,
      evidencia: undefined,
      pagina: undefined,
    });
  };
  const openInspection = (id: string) => {
    if (search.objeto !== id) inspectionSelection.current = id;
    if (!search.objeto) opener.current = document.activeElement as HTMLElement;
    if (search.objeto !== id || search.aba !== "ficha") scrollPos.current = 0;
    setCompact(false);
    onChange({ objeto: id, aba: "ficha" }, !!search.objeto);
  };
  const readInspection = (evidence: string, page: number) => {
    if (!reader) scrollPos.current = panelBody.current?.scrollTop ?? 0;
    onChange({ objeto: search.objeto, aba: "ficha", evidencia: evidence, pagina: page });
  };
  return (
    <div
      className={[
        "ca-workspace",
        (!!search.objeto || reader) && "ca-has-panel",
        reader && "ca-expanded",
        compact && !reader && "ca-compact",
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
        <div className="ca-viewport-wrap">
          <CruzAltaViewer
            selectedId={selected?.id ?? null}
            onSelect={select}
            inspections={inspections}
            onOpenInspection={openInspection}
            inspectionSelection={inspectionSelection}
          />
        </div>
      )}
      {(search.objeto || reader) && (
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
              <h2>{selected ? label(selected) : "Objeto indisponível"}</h2>
            </div>
            {!reader && (
              <button
                className="ca-mobile-size"
                onClick={() => {
                  setCompact(!compact);
                }}
                aria-label={compact ? "Abrir meia ficha" : "Recolher ao resumo"}
              >
                {compact ? <ChevronUp /> : <ChevronDown />}
              </button>
            )}
            <button
              ref={closeButton}
              onClick={close}
              aria-label={reader ? "Fechar leitor" : "Fechar ficha"}
            >
              <X size={20} />
            </button>
          </header>
          <div className="ca-drawer-body" ref={panelBody}>
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
                  <Suspense fallback={<p role="status">Carregando ficha…</p>}>
                    <Panel
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
                  </Suspense>
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
