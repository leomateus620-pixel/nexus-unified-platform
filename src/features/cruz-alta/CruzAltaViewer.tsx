import { createClientOnlyFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  Focus,
  Layers,
  ListTree,
  Maximize,
  Minus,
  Mountain,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { objects, geometry, lifelines, context, photoCorners } from "./manifest";
import { spatialIndex, type Extent } from "./spatial";
import type { CruzScene, CameraState } from "./navigation";
import { DAYLIGHT_EXPOSURE } from "./scene-types";
import type { CameraMode, CruzObject, SceneLayer, SceneLayers } from "./scene-types";
import "./viewer.css";
import { StructureBrowser, type StructureFilter } from "./StructureBrowser";
import { activeLegend, lvhfAppearance, lvhfSwatch } from "./lvhf-appearance";

const loadReference = createClientOnlyFn(() => import("./reference.client"));
const index = spatialIndex(objects, geometry, lifelines);
const defaultLayers: SceneLayers = {
  edificacoes: true,
  equipamentos: true,
  entorno: true,
  nomes: true,
  lvhf: false,
};
const layerNames: Record<SceneLayer, string> = {
  edificacoes: "Edificações",
  equipamentos: "Equipamentos",
  entorno: "Vias e entorno",
  nomes: "Nomes",
  lvhf: "Linhas de vida",
};
const normalLayers = ["edificacoes", "equipamentos", "entorno", "nomes", "lvhf"] as const;
const modes = [
  { key: "angular", name: "Órbita", artwork: "orbita" },
  { key: "planta", name: "Planta", artwork: "planta" },
  { key: "patio", name: "Pátio", artwork: "patio" },
] as const;
const unit = index.unit;
const displayCode = (o: CruzObject) =>
  o.code ??
  (o.kind === "componente" ? o.aliases?.find((a) => /^\d+(?:\.\d+)?$/.test(a)) : undefined);
function mapBox(e: Extent) {
  const margin = Math.max(e.east - e.west, e.south - e.north) * 0.06;
  return [
    e.west - margin,
    e.north - margin,
    e.east - e.west + 2 * margin,
    e.south - e.north + 2 * margin,
  ].join(" ");
}
function DimensionalMap({
  mini = false,
  onSelect,
}: {
  mini?: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <>
      {context.map((a, i) => (
        <polygon
          key={"a" + i}
          className={"ca-area ca-" + a.kind}
          points={a.footprint.map((v) => v.join(",")).join(" ")}
        />
      ))}
      {geometry.map((p, i) => (
        <polygon
          key={i}
          className={"ca-footprint ca-" + p.roof}
          points={p.footprint.map((v) => v.join(",")).join(" ")}
          onClick={onSelect ? () => onSelect(p.id) : undefined}
        >
          {!mini && <title>{index.byId.get(p.id)?.name}</title>}
        </polygon>
      ))}
    </>
  );
}
export default function CruzAltaViewer({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const stage = useRef<HTMLDivElement>(null),
    labelBox = useRef<HTMLDivElement>(null),
    scene = useRef<CruzScene | null>(null),
    search = useRef<HTMLInputElement>(null);
  const onPick = useRef(onSelect);
  const pickedFromYard = useRef<string | null>(null);
  const currentId = useRef(selectedId);
  currentId.current = selectedId;
  const [failure, setFailure] = useState(""),
    [retry, setRetry] = useState(0),
    [mode, setMode] = useState<CameraMode>("angular"),
    [query, setQuery] = useState("");
  const [open, setOpen] = useState<"busca" | "camadas" | null>(null),
    [layers, setLayers] = useState<SceneLayers>(defaultLayers),
    [exposure, setExposure] = useState(DAYLIGHT_EXPOSURE),
    [filter, setFilter] = useState<StructureFilter>("todos");
  const resultsList = useRef<HTMLDivElement>(null);
  onPick.current = (id) => {
    if (mode === "patio" && selectedId !== id) pickedFromYard.current = id;
    onSelect(id);
  };
  const [quality, setQuality] = useState<"auto" | "economico" | "detalhado">(() => {
      try {
        const saved = localStorage.getItem("nexus:cruz-alta:qualidade");
        return saved === "economico" || saved === "detalhado" ? saved : "auto";
      } catch {
        return "auto";
      }
    }),
    [matte, setMatte] = useState(false);
  const retained = useRef({ layers, exposure, quality, matte });
  retained.current = { layers, exposure, quality, matte };
  const hud = useRef<HTMLDivElement>(null),
    compass = useRef<SVGSVGElement>(null),
    miniArrow = useRef<SVGGElement>(null),
    sight = useRef<SVGLineElement>(null);
  const [ready, setReady] = useState(false);
  const [horizon, setHorizon] = useState(true),
    [horizonInfo, setHorizonInfo] = useState<import("./regional-types").HorizonInfo | null>(null);
  useEffect(() => {
    scene.current?.horizon(horizon);
  }, [horizon, ready]);
  const photo = useRef<HTMLImageElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  useEffect(() => {
    if (!photo.current || !photoFile) return;
    const url = URL.createObjectURL(photoFile);
    photo.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);
  const overlaySource = useRef<AbortController | null>(null);
  const [overlayStatus, setOverlayStatus] = useState(""),
    [overlayRev, setOverlayRev] = useState(""),
    [overlayOpacity, setOverlayOpacity] = useState(0.42);
  const releaseOverlay = () => {
    overlaySource.current?.abort();
    scene.current?.removeOverlay();
    setOverlayStatus("");
    setOverlayRev("");
    setPhotoFile(null);
  };
  async function compare(file: File) {
    releaseOverlay();
    const controller = new AbortController();
    overlaySource.current = controller;
    setOverlayStatus("Conferindo a referência…");
    try {
      const { readComparison } = await loadReference();
      const result = await readComparison(file, controller.signal);
      if (controller.signal.aborted || !scene.current) return;
      if (result.kind === "drone") {
        setPhotoFile(result.file);
        scene.current.moveTo({ mode: "angular", reference: "dji44" });
        setMode("angular");
        setOverlayRev("DJI 0044");
      } else {
        scene.current.compare(result.crop, photoCorners, overlayOpacity);
        scene.current.moveTo({ mode: "planta" });
        setMode("planta");
        setOverlayRev("Rev. " + result.revision);
      }
      setOverlayStatus("");
    } catch (error) {
      if (!controller.signal.aborted)
        setOverlayStatus(error instanceof Error ? error.message : "A prévia está indisponível.");
    }
  }
  useEffect(() => () => overlaySource.current?.abort(), []);

  const applyCamera = useCallback((s: CameraState) => {
    if (!hud.current) return;
    if (photo.current) photo.current.hidden = !s.drone;
    const rule = hud.current.querySelector<HTMLSpanElement>(".ca-rule");
    if (rule) {
      rule.style.width = s.bar + "px";
      rule.textContent = s.metres.toLocaleString("pt-BR") + " m";
      rule.hidden = !s.metres;
    }
    if (compass.current) compass.current.style.transform = "rotate(" + -s.heading + "deg)";
    const x = Math.max(unit.west, Math.min(unit.east, s.x)),
      z = Math.max(unit.north, Math.min(unit.south, s.z));
    miniArrow.current?.setAttribute("transform", `translate(${x} ${z}) rotate(${s.heading})`);
    if (sight.current) {
      sight.current.setAttribute("x1", String(x));
      sight.current.setAttribute("y1", String(z));
      sight.current.setAttribute("x2", String(s.targetX));
      sight.current.setAttribute("y2", String(s.targetZ));
    }
  }, []);
  useEffect(() => {
    let alive = true,
      active: CruzScene | null = null;
    setReady(false);
    setFailure("");
    import("./navigation")
      .then(({ openScene }) => {
        if (!alive || !stage.current || !labelBox.current) return;
        active = openScene({
          host: stage.current,
          labels: labelBox.current,
          index,
          parts: geometry,
          lines: lifelines,
          areas: context,
          layers: retained.current.layers,
          selected: currentId.current,
          quality: retained.current.quality,
          onPick: (id) => onPick.current(id),
          onCamera: applyCamera,
          onHorizon: setHorizonInfo,
          onLost: () => {
            if (!alive) return;
            active?.dispose();
            scene.current = null;
            active = null;
            setReady(false);
            setFailure("A conexão com a placa gráfica foi interrompida.");
          },
        });
        active.quality(retained.current.quality);
        active.matte(retained.current.matte);
        active.exposure(retained.current.exposure);
        setOverlayRev("");
        setOverlayStatus("");
        scene.current = active;
        setReady(true);
        setMode("angular");
      })
      .catch(() => {
        if (alive) setFailure("A visualização 3D está indisponível neste navegador.");
      });
    return () => {
      alive = false;
      scene.current = null;
      active?.dispose();
    };
  }, [retry, applyCamera]);
  useEffect(() => {
    scene.current?.select(selectedId);
    const keepPosition = pickedFromYard.current === selectedId;
    pickedFromYard.current = null;
    if (!keepPosition && selectedId && index.focus(selectedId)) {
      scene.current?.moveTo({ mode: "angular", id: selectedId });
      setMode("angular");
    }
  }, [selectedId]);
  useEffect(() => {
    scene.current?.layers(layers);
  }, [layers]);
  useEffect(() => {
    scene.current?.exposure(exposure);
  }, [exposure]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        setOpen(null);
        if (open === "busca") search.current?.focus();
      }
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [open]);
  useEffect(() => {
    try {
      localStorage.setItem("nexus:cruz-alta:qualidade", quality);
    } catch {
      /* Storage unavailable. */
    }
    scene.current?.quality(quality);
  }, [quality]);
  useEffect(() => {
    scene.current?.matte(matte);
  }, [matte]);
  const matches = useMemo(
    () => index.search(query).filter((o) => filter === "todos" || o.kind === filter),
    [query, filter],
  );
  const focusResult = (offset: number) => {
    const buttons = resultsList.current?.querySelectorAll<HTMLButtonElement>("[data-ca-select]");
    if (!buttons?.length) return;
    const current = [...buttons].indexOf(document.activeElement as HTMLButtonElement);
    buttons[Math.max(0, Math.min(buttons.length - 1, current + offset))]?.focus();
  };
  const choose = (object: CruzObject) => {
    setOpen(null);
    if (object.kind === "setor") {
      scene.current?.moveTo({ mode: "angular", id: object.id });
      setMode("angular");
      if (!ready) onSelect(object.id);
    } else {
      if (object.id === selectedId) scene.current?.moveTo({ mode: "angular", id: object.id });
      onSelect(object.id);
    }
  };
  function openMode(next: CameraMode) {
    setMode(next);
    setOpen(null);
    scene.current?.moveTo(
      selectedId && index.focus(selectedId) ? { mode: next, id: selectedId } : { mode: next },
    );
  }
  return (
    <section className="ca-view" aria-label="Mapa da unidade Cruz Alta">
      <header className="ca-header">
        <a
          href="/mapas-3d/unidades"
          aria-label="Voltar à biblioteca de mapas"
          title="Biblioteca de mapas"
        >
          <ChevronLeft size={20} />
        </a>
        <div>
          <span className="ca-company">Três Tentos</span>
          <h1>
            Unidade Cruz Alta <small>/ RS</small>
          </h1>
        </div>
        <button
          className="ca-overview"
          aria-label="Ver toda a unidade"
          onClick={() => {
            setMode("angular");
            setOpen(null);
            scene.current?.moveTo({ mode: "angular" });
          }}
          disabled={!ready}
        >
          <Maximize size={16} />
          <span>Ver toda a unidade</span>
        </button>
      </header>
      <div
        className="ca-stage"
        ref={stage}
        onPointerDown={(event) => {
          if (open && event.target instanceof Element && !event.target.closest(".ca-top, .ca-pop"))
            setOpen(null);
        }}
      >
        {photoFile && (
          <img
            ref={photo}
            className="ca-drone-overlay"
            alt="Comparação local com a fotografia DJI 0044"
            style={{ opacity: overlayOpacity }}
          />
        )}
        <div className="ca-labels" ref={labelBox} aria-hidden="true">
          {objects
            .filter((o) => index.focus(o.id))
            .map((o) => (
              <span hidden key={o.id} data-label={o.id}>
                {displayCode(o) ? displayCode(o) + " · " : ""}
                {o.name}
              </span>
            ))}
        </div>
        {failure && (
          <div className="ca-fallback">
            <svg viewBox={mapBox(unit)} role="img" aria-label="Planta navegável da unidade">
              <DimensionalMap onSelect={onSelect} />
            </svg>
            <div role="status">
              {failure} <button onClick={() => setRetry((v) => v + 1)}>Reabrir 3D</button>
            </div>
          </div>
        )}
        {!failure && !ready && (
          <div className="ca-loading" role="status">
            Preparando a implantação…
          </div>
        )}
        <div className="ca-top">
          <div className="ca-search">
            <label>
              <Search size={17} />
              <input
                ref={search}
                type="search"
                placeholder="Buscar no mapa"
                aria-label="Buscar setor, estrutura ou LVHF"
                aria-controls={open === "busca" ? "ca-search-results" : undefined}
                value={query}
                onClick={() => setOpen("busca")}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen("busca");
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setOpen("busca");
                    requestAnimationFrame(() => focusResult(1));
                    return;
                  }
                  if (e.key === "Enter" && matches[0]) {
                    e.preventDefault();
                    e.stopPropagation();
                    choose(matches[0]);
                    e.currentTarget.blur();
                  }
                }}
              />
            </label>
            {query && (
              <button
                type="button"
                className="ca-clear-search"
                aria-label="Limpar busca"
                onClick={() => {
                  setQuery("");
                  setFilter("todos");
                  setOpen("busca");
                  search.current?.focus();
                }}
              >
                <X size={15} />
              </button>
            )}
            <button
              title="Lista de estruturas"
              aria-label="Lista de estruturas"
              aria-expanded={open === "busca"}
              onClick={() => {
                setOpen(open === "busca" ? null : "busca");
              }}
            >
              <ListTree size={19} />
            </button>
          </div>
          <button
            className="ca-layer-button"
            title="Camadas"
            aria-label="Camadas"
            aria-expanded={open === "camadas"}
            onClick={() => setOpen(open === "camadas" ? null : "camadas")}
          >
            <Layers size={18} />
            <span>Camadas</span>
          </button>
        </div>
        {open === "busca" && (
          <StructureBrowser
            objects={objects}
            matches={matches}
            query={query}
            filter={filter}
            onFilter={setFilter}
            selectedId={selectedId}
            onChoose={choose}
            onUnit={() => {
              setOpen(null);
              onSelect("unidade");
            }}
            onClose={() => {
              setOpen(null);
              search.current?.focus();
            }}
            resultsRef={resultsList}
          />
        )}
        {open === "camadas" && (
          <div className="ca-pop ca-options">
            <div className="ca-pop-title">
              <h2>Camadas</h2>
              <button aria-label="Fechar camadas" onClick={() => setOpen(null)}>
                <X size={17} />
              </button>
            </div>
            <fieldset className="ca-layer-group">
              <legend>
                <Layers size={14} /> Implantação
              </legend>
              {normalLayers.map((key) => (
                <label className="ca-layer-toggle" key={key}>
                  {layerNames[key]}
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={(e) =>
                      setLayers((previous) => ({ ...previous, [key]: e.target.checked }))
                    }
                  />
                </label>
              ))}
              <label className="ca-layer-toggle">
                Paisagem de Cruz Alta
                <input
                  type="checkbox"
                  checked={horizon}
                  onChange={(e) => setHorizon(e.target.checked)}
                />
              </label>
            </fieldset>
            <fieldset className="ca-layer-group">
              <legend>
                <SlidersHorizontal size={14} /> Renderização
              </legend>
              <label className="ca-layer-toggle">
                Estudo de volumes
                <input
                  type="checkbox"
                  checked={matte}
                  onChange={(e) => setMatte(e.target.checked)}
                />
              </label>
              <label>
                Qualidade gráfica
                <select
                  aria-label="Qualidade gráfica"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as typeof quality)}
                >
                  <option value="auto">Automática</option>
                  <option value="economico">Econômica</option>
                  <option value="detalhado">Detalhada</option>
                </select>
              </label>
              <label className="ca-exposure">
                Exposição
                <input
                  type="range"
                  min={0.65}
                  max={1.55}
                  step={0.05}
                  value={exposure}
                  onChange={(e) => setExposure(Number(e.target.value))}
                />
                <output aria-hidden="true">{Math.round(exposure * 100)}%</output>
              </label>
            </fieldset>
            <details className="ca-comparison">
              <summary>Comparar enquadramentos</summary>
              <button
                disabled={!ready}
                onClick={() => {
                  scene.current?.moveTo({ mode: "angular", reference: "dji44" });
                  setOpen(null);
                  setMode("angular");
                }}
              >
                Vista DJI 0044 · interpretada
              </button>
              <button
                disabled={!ready}
                onClick={() => {
                  scene.current?.moveTo({ mode: "angular", reference: "encontro" });
                  setOpen(null);
                  setMode("angular");
                }}
              >
                Encontro de coberturas · 11/56
              </button>
              <button
                disabled={!ready}
                onClick={() => {
                  scene.current?.moveTo({ mode: "patio", reference: "ferrovia" });
                  setOpen(null);
                  setMode("patio");
                }}
              >
                Pátio ferroviário · 11/56
              </button>
              <label className="ca-reference-file">
                <strong>Comparar com arquivo local</strong>
                <span>Layout A1 rev. 43/56 ou fotografia DJI 0044.</span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg"
                  disabled={!ready}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void compare(file);
                  }}
                />
              </label>
              {overlayRev && (
                <>
                  <label>
                    Opacidade · {overlayRev}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.025}
                      value={overlayOpacity}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setOverlayOpacity(n);
                        scene.current?.compareOpacity(n);
                      }}
                    />
                  </label>
                  <button onClick={releaseOverlay}>Remover comparação</button>
                </>
              )}
              {overlayStatus && <p role="status">{overlayStatus}</p>}
            </details>
            {horizon &&
              (horizonInfo?.state === "ready" ? (
                <details className="ca-layer-sources">
                  <summary>
                    <Mountain size={14} /> Fontes da paisagem
                  </summary>
                  <p className="ca-horizon-source">{horizonInfo.attribution}</p>
                </details>
              ) : (
                <p role="status" className="ca-horizon-source">
                  {horizonInfo?.state === "failed"
                    ? "Paisagem regional indisponível."
                    : "Carregando relevo e paisagem regional…"}
                </p>
              ))}
          </div>
        )}
        {layers.lvhf && open !== "busca" && (
          <div className="ca-legend" aria-label="Situação registrada na revisão 56">
            <strong>LVHF · Rev. 56</strong>
            {activeLegend.map((state) => (
              <span key={state}>
                <i aria-hidden="true" style={{ background: lvhfSwatch(state) }} />
                {lvhfAppearance[state].label}
              </span>
            ))}
          </div>
        )}
        <div className="ca-tools" aria-label="Controles da câmera">
          <button
            disabled={!ready || mode === "patio"}
            title="Aproximar"
            aria-label="Aproximar"
            onClick={() => scene.current?.zoom(0.8)}
          >
            <Plus size={18} />
          </button>
          <button
            disabled={!ready || mode === "patio"}
            title="Afastar"
            aria-label="Afastar"
            onClick={() => scene.current?.zoom(1.25)}
          >
            <Minus size={18} />
          </button>
          <button
            disabled={!ready || !selectedId || !index.focus(selectedId)}
            title="Focar seleção"
            aria-label="Focar seleção"
            onClick={() => selectedId && scene.current?.moveTo({ mode, id: selectedId })}
          >
            <Focus size={18} />
          </button>
        </div>
        <div className="ca-bottom" ref={hud}>
          <div className="ca-minimap" title="Posição e rumo da câmera">
            <svg viewBox={mapBox(unit)} role="img" aria-label="Minimapa com norte para cima">
              <DimensionalMap mini />
              <line ref={sight} stroke="#154741" strokeDasharray="6 6" strokeWidth="3" />
              <g ref={miniArrow}>
                <path d="M0 -15L8 10 0 6 -8 10Z" fill="#193c39" stroke="white" strokeWidth="2" />
              </g>
            </svg>
            <span>N ↑</span>
          </div>
          <div className="ca-modes" aria-label="Modo de navegação">
            {modes.map(({ key, name, artwork }) => (
              <button
                key={key}
                disabled={!ready}
                aria-pressed={mode === key}
                onClick={() => openMode(key)}
              >
                <span className="ca-mode-icon" aria-hidden="true">
                  <img
                    src={"/models/cruz-alta/icones/" + artwork + ".webp"}
                    alt=""
                    width={25}
                    height={25}
                    decoding="async"
                  />
                </span>
                {name}
              </button>
            ))}
          </div>
          <div className="ca-orientation">
            {horizon && horizonInfo?.state === "ready" && (
              <a
                className="ca-osm-credit"
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
              >
                © OpenStreetMap
              </a>
            )}
            <span className="ca-north">
              <svg ref={compass} width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
                <path d="M8 1L14.5 16 8 12 1.5 16Z" fill="currentColor" />
              </svg>{" "}
              N
            </span>
            <span className="ca-rule"></span>
          </div>
        </div>
        {mode === "patio" && ready && (
          <div className="ca-walk" aria-label="Deslocamento no pátio">
            {(
              [
                ["left", ArrowLeft, "Esquerda"],
                ["forward", ArrowUp, "Avançar"],
                ["back", ArrowDown, "Recuar"],
                ["right", ArrowRight, "Direita"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                title={label}
                aria-label={label}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  scene.current?.walk(key);
                }}
                onPointerUp={() => scene.current?.walk(null)}
                onPointerCancel={() => scene.current?.walk(null)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    scene.current?.walk(key);
                  }
                }}
                onKeyUp={() => scene.current?.walk(null)}
                onBlur={() => scene.current?.walk(null)}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
