import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  ShieldCheck,
  Box,
  Eye,
  Layers,
  Volume2,
  VolumeX,
  Settings2,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { SiloSimulation, STAGES, type CameraMode, type Scenario } from "./simulation";
import { SiloScene, type SceneOptions, type SceneStatus, type InspectionPreset } from "./SiloScene";
import { IncidentAnalysis, SourcesPanel } from "./IncidentAnalysis";
import { SiloSound } from "./Sound";
import { COMPONENTS, getComponent, COMPONENT_CATEGORIES } from "./ComponentRegistry";
import { NexusLogo } from "@/components/nexus/NexusLogo";
import "./silo.css";

const CAMERAS: { id: CameraMode; label: string; short: string }[] = [
  { id: "frontal", label: "Frontal do acidente", short: "Frontal" },
  { id: "top", label: "Vista superior", short: "Superior" },
  { id: "connected", label: "Técnico A — primeira pessoa", short: "Técnico A" },
  { id: "victim", label: "Vítima B — primeira pessoa", short: "Vítima B" },
];
/** One presentation policy for catalogue and model selection. In particular a
 * roof revealed by the LVHF view must be restored before inspecting its parts. */
function selectedPresentation(options: SceneOptions, id: string): SceneOptions {
  if (id.startsWith("lvhf."))
    return { ...options, highlight: id, cut: true, roof: "revealed", grains: true };
  if (id === "structure.grain")
    return { ...options, highlight: id, cut: true, roof: "revealed", grains: true };
  if (id === "structure.floor" || id === "structure.extraction")
    return { ...options, highlight: id, cut: true, roof: "revealed", grains: false };
  if (id === "structure.roof" || id === "structure.manhole")
    return {
      ...options,
      highlight: id,
      cut: false,
      roof: "closed",
      hatchOpen: id === "structure.manhole",
    };
  return { ...options, highlight: id };
}
/** Short touch taps remain usable after a canvas drag cancels a compatibility
 * click. Native keyboard/mouse activation is retained and never doubled. */
function CommandButton({
  onCommand,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & { onCommand: () => void }) {
  const touch = useRef<{ id: number; x: number; y: number } | null>(null),
    lastTouch = useRef(-Infinity);
  return (
    <button
      {...props}
      onPointerDown={(event) => {
        touch.current =
          event.pointerType === "touch"
            ? { id: event.pointerId, x: event.clientX, y: event.clientY }
            : null;
      }}
      onPointerCancel={() => {
        touch.current = null;
      }}
      onPointerUp={(event) => {
        const start = touch.current;
        touch.current = null;
        if (
          props.disabled ||
          event.pointerType !== "touch" ||
          !start ||
          start.id !== event.pointerId ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
        )
          return;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        if (!target || !event.currentTarget.contains(target)) return;
        lastTouch.current = performance.now();
        event.preventDefault();
        onCommand();
      }}
      onClick={(event) => {
        if (event.detail > 0 && performance.now() - lastTouch.current < 600) return;
        onCommand();
      }}
    />
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog ref={ref} className="silo-dialog" onCancel={onClose} aria-label={title}>
      <header>
        <div>
          <span className="silo-eyebrow">NEXUS · SEGURANÇA</span>
          <h2>{title}</h2>
        </div>
        <CommandButton aria-label="Fechar painel" onCommand={onClose}>
          Fechar ×
        </CommandButton>
      </header>
      <div className="silo-dialog-body">{children}</div>
    </dialog>
  );
}

export default function SiloViewer() {
  const [simulation] = useState(() => {
    const engine = new SiloSimulation();
    engine.setExperience("explore");
    return engine;
  });
  const snap = useSyncExternalStore(
    simulation.subscribe,
    simulation.getSnapshot,
    simulation.getSnapshot,
  );
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<SiloScene | null>(null),
    sound = useRef<SiloSound | null>(null);
  const [status, setStatus] = useState<SceneStatus>("loading"),
    [message, setMessage] = useState("Preparando a geometria…");
  const [retry, setRetry] = useState(0),
    [fallback, setFallback] = useState(false);
  const [options, setOptions] = useState<SceneOptions>({
    quality: "auto",
    cut: false,
    highlight: null,
    roof: "closed",
    transparent: false,
    technical: false,
    grains: true,
  });
  const [panel, setPanel] = useState<
    "components" | "settings" | "views" | "analysis" | "sources" | "indicators" | null
  >(null);
  const [compact, setCompact] = useState(
    () =>
      window.matchMedia("(max-width: 800px), (max-height: 500px) and (orientation: landscape)")
        .matches,
  );
  const [category, setCategory] = useState<"system" | "structure">("system"),
    [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [isolated, setIsolated] = useState(false),
    [audio, setAudio] = useState(false),
    [expanded, setExpanded] = useState(false);
  const exploration = useRef<{ options: SceneOptions; selected: string | null } | null>(null);
  const f = snap.frame,
    mode = snap.experience,
    incident = mode === "incident" || mode === "prevention",
    animated = mode !== "explore";
  const internal = snap.camera === "connected" || snap.camera === "victim",
    occluded = internal && f.workers[snap.camera === "connected" ? "A" : "B"].occluded;
  const record = getComponent(selected);
  const transportLabel =
    snap.status === "running"
      ? "Pausar"
      : snap.status === "paused"
        ? "Continuar"
        : snap.status === "completed"
          ? "Repetir"
          : "Iniciar";
  useEffect(() => {
    const media = window.matchMedia(
      "(max-width: 800px), (max-height: 500px) and (orientation: landscape)",
    );
    const changed = () => setCompact(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const select = (id: string) => {
    // A new catalogue or model selection must not inherit the previous
    // component's visibility filter. Restore before focusing the new bounds.
    scene.current?.isolate(null);
    setIsolated(false);
    setSelected(id);
    setCategory(getComponent(id)?.category ?? "system");
    setPanel("components");
    setOptions((o) => selectedPresentation(o, id));
  };
  useEffect(() => {
    if (fallback) {
      simulation.setReady(true, "Sequência educativa leve");
      setStatus("ready");
      return;
    }
    simulation.setReady(false);
    setStatus("loading");
    let current: SiloScene | null = null;
    try {
      current = new SiloScene(
        host.current!,
        simulation,
        (state, detail) => {
          setStatus(state);
          setMessage(detail);
        },
        select,
      );
      scene.current = current;
      current.setOptions(options);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage("WebGL indisponível: " + text);
      setStatus("error");
      simulation.setReady("error", text);
    }
    return () => {
      current?.dispose();
      scene.current = null;
    };
    // Options are applied to the existing owner below, never a new renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulation, retry, fallback]);
  useEffect(() => {
    scene.current?.setOptions(options);
  }, [options, retry, fallback]);
  useEffect(() => {
    scene.current?.setInspectorOpen(
      panel !== null && panel !== "analysis" && panel !== "sources",
      expanded,
    );
    if (expanded) simulation.pause("Leitura expandida; retome pelo comando Continuar.");
  }, [panel, expanded, simulation]);
  useEffect(() => {
    if (selected && panel === "components") {
      const raf = requestAnimationFrame(() => {
        const camera = simulation.getSnapshot().camera;
        // A user may inspect from their current eyes until explicitly choosing
        // Localizar. That command's camera publication must not focus twice and
        // replace the saved first-person view with the first external frame.
        if (camera !== "connected" && camera !== "victim") scene.current?.focusComponent(selected);
      });
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [selected, panel, simulation]);
  useEffect(() => {
    if (!fallback) return;
    let raf = 0,
      last = 0;
    const tick = (now: number) => {
      if (simulation.getSnapshot().status !== "running") {
        raf = last = 0;
        return;
      }
      simulation.advance(last ? (now - last) / 1000 : 1 / 60);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    const unsub = simulation.subscribe(() => {
      if (simulation.getSnapshot().status !== "running") {
        cancelAnimationFrame(raf);
        raf = last = 0;
      } else if (!raf) raf = requestAnimationFrame(tick);
    });
    return () => {
      unsub();
      cancelAnimationFrame(raf);
    };
  }, [fallback, simulation]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) simulation.pause("Aba oculta; reprodução pausada.");
      scene.current?.setVisible(!document.hidden);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (panel) {
          setPanel(null);
          setExpanded(false);
          scene.current?.isolate(null);
          setIsolated(false);
        } else if (internal) simulation.setCamera("frontal");
        else scene.current?.restoreView();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", key);
    };
  }, [simulation, internal, panel]);
  useEffect(() => {
    sound.current?.update(snap);
  }, [snap]);
  useEffect(() => () => sound.current?.dispose(), []);
  const switchMode = (next: typeof mode) => {
    if (next === mode) return;
    if (mode === "explore") {
      exploration.current = { options: { ...options }, selected };
      scene.current?.saveExplorationView();
    }
    simulation.setExperience(next);
    setPanel(null);
    setIsolated(false);
    scene.current?.isolate(null);
    setExpanded(false);
    setSelected(null);
    if (next === "incident" || next === "prevention") {
      simulation.setCamera("frontal");
      setOptions((o) => ({ ...o, cut: true, roof: "closed", highlight: null, grains: true }));
      scene.current?.preset("incident");
    } else if (next === "lvhf") {
      setOptions((o) => ({ ...o, cut: false, roof: "revealed", highlight: null, grains: true }));
      scene.current?.preset("ring");
    } else {
      simulation.setCamera("frontal");
      const saved = exploration.current;
      setOptions((o) => ({
        ...o,
        ...(saved?.options ?? { cut: false, roof: "closed" as const, highlight: null }),
        quality: o.quality,
      }));
      setSelected(saved?.selected ?? null);
      scene.current?.restoreExplorationView();
    }
  };
  const camera = (id: CameraMode) => {
    simulation.setCamera(id);
    scene.current?.reframeCamera();
  };
  const togglePanel = (next: typeof panel) => {
    setExpanded(false);
    if (panel === "components") {
      scene.current?.isolate(null);
      setIsolated(false);
    }
    setPanel((p) => (p === next ? null : next));
  };
  const openReading = (next: "analysis" | "sources") => {
    simulation.pause("Leitura técnica; retome pelo comando Continuar.");
    setPanel(next);
  };
  const play = () =>
    snap.status === "running"
      ? simulation.pause()
      : snap.status === "paused"
        ? simulation.resume()
        : simulation.start();
  const restore = () => {
    scene.current?.isolate(null);
    setIsolated(false);
    setSelected(null);
    setOptions((o) => ({ ...o, highlight: null, grains: true }));
    scene.current?.restoreView();
  };
  const focus = () => {
    if (selected) scene.current?.focusComponent(selected);
  };
  const choosePreset = (id: InspectionPreset) => {
    setOptions((o) => ({
      ...o,
      cut: id !== "general" && id !== "manhole",
      roof: ["ring", "trolley", "anchor", "dorsal"].includes(id) ? "revealed" : "closed",
      hatchOpen: id === "manhole",
    }));
    scene.current?.preset(id);
  };
  const operate = () => {
    if (selected) {
      switchMode("lvhf");
      select(selected);
      scene.current?.focusComponent(selected);
      scene.current?.followTrolley(true);
      simulation.start();
    }
  };
  const viewControls = (
    <>
      {incident ? (
        <select
          aria-label="Perspectiva de câmera"
          value={snap.camera}
          onChange={(e) => camera(e.target.value as CameraMode)}
        >
          {CAMERAS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      ) : (
        <select
          aria-label="Vista de inspeção"
          defaultValue="general"
          key={mode}
          onChange={(e) => choosePreset(e.target.value as InspectionPreset)}
        >
          <option value="general">Geral externa</option>
          <option value="internal">Corte interno</option>
          <option value="ring">Anel completo</option>
          <option value="trolley">Trole e passagem</option>
          <option value="anchor">Ancoragem e esticador</option>
          <option value="dorsal">Conexão dorsal</option>
          <option value="manhole">Boca de visita</option>
        </select>
      )}
      <CommandButton
        aria-label="Corte"
        aria-pressed={options.cut}
        onCommand={() => setOptions((o) => ({ ...o, cut: !o.cut }))}
      >
        <Layers size={16} />
        <span>Corte</span>
      </CommandButton>
      <CommandButton
        aria-label="Cobertura"
        aria-pressed={options.roof === "revealed"}
        disabled={incident && snap.status === "running"}
        onCommand={() =>
          setOptions((o) => ({ ...o, roof: o.roof === "closed" ? "revealed" : "closed" }))
        }
      >
        <Eye size={16} />
        <span>Revelar cobertura</span>
      </CommandButton>
    </>
  );
  return (
    <main className="silo-viewer" data-mode={mode} data-panel={panel ?? "none"}>
      <header className="silo-header">
        <Link to="/mapas-3d/unidades" className="silo-back" aria-label="Voltar à biblioteca">
          <ArrowLeft size={19} />
        </Link>
        <NexusLogo className="silo-brand" />
        <div className="silo-title">
          <span className="silo-eyebrow">ENGENHARIA / EXPLORAÇÃO TÉCNICA</span>
          <h1>
            Silo metálico <span>· LVHF interna</span>
          </h1>
        </div>
        <span className="silo-header-scale">
          Ø22 m <i /> 30,403 m
        </span>
        <CommandButton
          onCommand={() => openReading("sources")}
          aria-label="Fontes e critérios"
          title="Fontes e critérios"
        >
          <BookOpen size={18} />
        </CommandButton>
      </header>
      <div className="silo-workspace">
        <section className="silo-stage" aria-label="Silo e sistema LVHF em 3D">
          <div ref={host} className="silo-canvas-host" aria-busy={status === "loading"} />
          <nav className="silo-mode-bar" aria-label="Modo da experiência">
            {(
              [
                ["explore", "Explorar"],
                ["lvhf", "Sistema LVHF"],
                ["incident", "Simulação"],
              ] as const
            ).map(([id, label]) => (
              <CommandButton
                key={id}
                aria-pressed={mode === id || (id === "incident" && mode === "prevention")}
                onCommand={() => switchMode(id)}
              >
                {label}
              </CommandButton>
            ))}
          </nav>
          <div className="silo-tools">
            <CommandButton
              onCommand={() => {
                simulation.setCamera("frontal");
                scene.current?.preset("general");
              }}
              title="Enquadrar silo"
              aria-label="Enquadrar silo"
            >
              <Box size={18} />
            </CommandButton>
            <CommandButton
              onCommand={() => togglePanel("components")}
              aria-label="Componentes e estrutura"
              aria-expanded={panel === "components"}
              title="Componentes e estrutura"
            >
              <Layers size={18} />
            </CommandButton>
            <CommandButton
              onCommand={() => togglePanel("settings")}
              aria-label="Exibição e qualidade"
              aria-expanded={panel === "settings"}
              title="Exibição e qualidade"
            >
              <Settings2 size={18} />
            </CommandButton>
            <CommandButton
              onCommand={() => scene.current?.restoreView()}
              aria-label="Voltar à vista anterior"
              title="Voltar à vista anterior"
            >
              <RotateCcw size={18} />
            </CommandButton>
          </div>
          {fallback && (
            <div className="silo-fallback">
              <img src="/models/silo-engolfamento/thumbnail.svg" alt="Esquema do silo no chão" />
              <span className="silo-eyebrow">SEQUÊNCIA EDUCATIVA LEVE · SEM WEBGL</span>
              <h2>{STAGES[f.stage]}</h2>
              <p>
                {f.entryBlocked
                  ? "Entrada impedida; movimentação bloqueada."
                  : "Colapso localizado ilustrativo. Profundidade de B: " +
                    f.workers.B.depth.toFixed(2) +
                    " m. A sequência não substitui a navegação 3D."}
              </p>
            </div>
          )}
          {!fallback &&
            (status === "error" ||
              status === "lost" ||
              (status === "loading" && !scene.current)) && (
              <div className="silo-load">
                <Box size={28} />
                <h2>
                  {status === "loading"
                    ? "Preparando a experiência"
                    : status === "lost"
                      ? "Visualização pausada"
                      : "Visualização indisponível"}
                </h2>
                <p>{message}</p>
                <div className="silo-actions">
                  <CommandButton
                    onCommand={() => {
                      simulation.pause();
                      setOptions((o) => ({ ...o, quality: "economic" }));
                      setRetry((r) => r + 1);
                    }}
                  >
                    Tentar novamente em qualidade leve
                  </CommandButton>
                  <CommandButton onCommand={() => setFallback(true)}>
                    Sequência educativa leve
                  </CommandButton>
                </div>
              </div>
            )}
          {status === "loading" && scene.current && (
            <div className="silo-resource-state" role="status">
              {message}
            </div>
          )}
          {occluded && !fallback && <div className="silo-occlusion" aria-hidden="true" />}
          {internal && (
            <CommandButton
              className="silo-exit-camera"
              aria-label="Sair da primeira pessoa"
              onCommand={() => camera("frontal")}
            >
              <ExternalLink size={16} />
              <span>Sair da primeira pessoa</span>
            </CommandButton>
          )}
          <div className="silo-stage-caption">
            <span className="silo-live-dot" />
            <span>
              {mode === "explore"
                ? "MODELO PARAMÉTRICO · METROS"
                : mode === "lvhf"
                  ? "CINEMÁTICA ILUSTRATIVA · SEM VALIDAÇÃO MECÂNICA"
                  : mode === "prevention"
                    ? "PREVENÇÃO · ENTRADA IMPEDIDA"
                    : "RECONSTITUIÇÃO EDUCATIVA · CONDIÇÃO INSEGURA"}
            </span>
          </div>
          {animated && (
            <div className="silo-context-readout">
              <strong>{mode === "lvhf" ? "Percurso LVHF" : STAGES[f.stage]}</strong>
              <span>
                {mode === "lvhf"
                  ? f.trolley.travelledDistance.toFixed(1) +
                    " m · ponto " +
                    (f.trolley.supportIndex + 1) +
                    "/11"
                  : "A " +
                    f.workers.A.depth.toFixed(2) +
                    " m · B " +
                    f.workers.B.depth.toFixed(2) +
                    " m"}
              </span>
              {incident && (
                <CommandButton
                  aria-label="Indicadores dos técnicos"
                  onCommand={() => togglePanel("indicators")}
                >
                  <Eye size={17} />
                </CommandButton>
              )}
            </div>
          )}
          {snap.status === "completed" && incident && (
            <div className="silo-completion">
              <strong>Comparação concluída</strong>
              <span>
                A: {f.connection.limited ? "limite geométrico" : "sem retenção"} · B: encobrimento
              </span>
              <CommandButton onCommand={() => openReading("analysis")}>
                Análise e prevenção
              </CommandButton>
              <CommandButton onCommand={() => simulation.seek(12)}>
                Voltar ao incidente
              </CommandButton>
            </div>
          )}
          <div className="silo-view-bar">
            {compact ? (
              <>
                <CommandButton
                  aria-label="Câmeras e corte"
                  aria-expanded={panel === "views"}
                  onCommand={() => togglePanel("views")}
                >
                  <Eye size={18} />
                </CommandButton>
                {incident && (
                  <CommandButton
                    aria-label="Indicadores dos técnicos"
                    onCommand={() => togglePanel("indicators")}
                  >
                    <ShieldCheck size={18} />
                  </CommandButton>
                )}
              </>
            ) : (
              viewControls
            )}
          </div>
        </section>
        {panel && panel !== "analysis" && panel !== "sources" && (
          <aside
            className={"silo-inspector" + (expanded ? " is-expanded" : "")}
            aria-label="Inspetor técnico"
          >
            <header>
              <div>
                <span className="silo-eyebrow">INSPEÇÃO NEXUS</span>
                <h2>
                  {panel === "components"
                    ? "Índice técnico"
                    : panel === "settings"
                      ? "Exibição e navegação"
                      : panel === "views"
                        ? "Câmeras e exibição"
                        : "Estado dos técnicos"}
                </h2>
              </div>
              <CommandButton
                onCommand={() => {
                  setPanel(null);
                  setExpanded(false);
                  scene.current?.isolate(null);
                  setIsolated(false);
                }}
                aria-label="Fechar inspetor"
              >
                ×
              </CommandButton>
            </header>
            <CommandButton className="silo-sheet-expand" onCommand={() => setExpanded((v) => !v)}>
              {expanded ? "Recolher detalhes" : "Expandir detalhes"}
            </CommandButton>
            <div className="silo-inspector-body">
              {expanded && snap.status === "paused" && (
                <p role="status">Reprodução pausada para leitura. Retome com Continuar.</p>
              )}
              {panel === "views" && (
                <div className="silo-view-options">
                  {viewControls}
                  <CommandButton
                    onCommand={() => {
                      choosePreset("general");
                      setPanel(null);
                    }}
                  >
                    Enquadrar silo
                  </CommandButton>
                  <CommandButton
                    onCommand={() => {
                      scene.current?.restoreView();
                      setPanel(null);
                    }}
                  >
                    Voltar à vista anterior
                  </CommandButton>
                </div>
              )}
              {panel === "components" && (
                <>
                  <div className="silo-tabs">
                    {COMPONENT_CATEGORIES.map((c) => (
                      <CommandButton
                        key={c.id}
                        aria-pressed={category === c.id}
                        onCommand={() => setCategory(c.id)}
                      >
                        {c.name}
                      </CommandButton>
                    ))}
                  </div>
                  <input
                    type="search"
                    placeholder="Buscar componente"
                    aria-label="Buscar componente"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {record && (
                    <article className="silo-component-detail" data-component={record.id}>
                      <span className="silo-eyebrow">{record.fidelity}</span>
                      <h3>{record.name}</h3>
                      <p>{record.function}</p>
                      <div className="silo-actions">
                        <CommandButton onCommand={focus}>Localizar</CommandButton>
                        <CommandButton
                          aria-pressed={isolated}
                          onCommand={() => {
                            scene.current?.isolate(isolated ? null : record.id);
                            setIsolated(!isolated);
                          }}
                        >
                          Isolar
                        </CommandButton>
                        {record.operation && (
                          <CommandButton onCommand={operate}>Ver funcionamento</CommandButton>
                        )}
                      </div>
                      <dl className="silo-data-pair">
                        <dt>Quantidade</dt>
                        <dd>{record.quantity ?? "não especificada"}</dd>
                        {record.dimensions.map((d) => (
                          <div key={d.label}>
                            <dt>{d.label}</dt>
                            <dd>
                              {d.value} {d.unit}
                              <small>
                                {d.source === "presentation"
                                  ? "hipótese visual"
                                  : d.source === "mesh-measured"
                                    ? "malha medida"
                                    : "publicado"}
                              </small>
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {record.operation && <p>{record.operation}</p>}
                      <p className="silo-note">{record.limitation}</p>
                      <a href={record.source} target="_blank" rel="noreferrer">
                        Fonte dimensional ↗
                      </a>
                    </article>
                  )}
                  <div className="silo-component-list">
                    {COMPONENTS.filter(
                      (c) =>
                        c.category === category &&
                        c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
                    ).map((c) => (
                      <CommandButton
                        key={c.id}
                        aria-pressed={selected === c.id}
                        onCommand={() => select(c.id)}
                      >
                        <span>{c.name}</span>
                        <small>
                          {c.quantity ?? "—"} {c.quantity ? "un" : ""}
                        </small>
                      </CommandButton>
                    ))}
                  </div>
                  <CommandButton onCommand={restore}>Restaurar conjunto</CommandButton>
                </>
              )}
              {panel === "settings" && (
                <>
                  <label className="silo-field">
                    Apresentação
                    <select
                      value={options.technical ? "technical" : "environment"}
                      onChange={(e) =>
                        setOptions((o) => ({ ...o, technical: e.target.value === "technical" }))
                      }
                    >
                      <option value="environment">Ambientado · luz diurna</option>
                      <option value="technical">Inspeção técnica · luz auxiliar</option>
                    </select>
                  </label>
                  <label className="silo-field">
                    Qualidade gráfica
                    <select
                      aria-label="Qualidade gráfica"
                      value={options.quality}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          quality: e.target.value as SceneOptions["quality"],
                        }))
                      }
                    >
                      <option value="auto">Automática · com histerese</option>
                      <option value="economic">Econômica</option>
                      <option value="balanced">Equilibrada</option>
                      <option value="high">Alta</option>
                    </select>
                  </label>
                  <label className="silo-check">
                    <input
                      type="checkbox"
                      checked={options.transparent}
                      onChange={(e) => setOptions((o) => ({ ...o, transparent: e.target.checked }))}
                    />
                    Costado semitransparente
                  </label>
                  <label className="silo-check">
                    <input
                      type="checkbox"
                      checked={options.grains}
                      onChange={(e) => setOptions((o) => ({ ...o, grains: e.target.checked }))}
                    />
                    Massa de soja visível
                  </label>
                  <label className="silo-check">
                    <input
                      type="checkbox"
                      checked={options.hatchOpen ?? false}
                      disabled={incident && snap.status === "running"}
                      onChange={(e) => setOptions((o) => ({ ...o, hatchOpen: e.target.checked }))}
                    />
                    Abrir tampa de visita · inspeção
                  </label>
                  <label className="silo-field">
                    Nível de exploração · {f.surfaceHeight.toFixed(2)} m
                    <input
                      aria-label="Nível da massa de grãos"
                      type="range"
                      min=".18"
                      max="22.6"
                      step=".1"
                      value={f.surfaceHeight}
                      disabled={mode !== "explore"}
                      onChange={(e) => simulation.setExplorationLevel(Number(e.target.value))}
                    />
                    <small>
                      {mode !== "explore"
                        ? "Configuração congelada durante a demonstração."
                        : "Níveis fora do alcance retiram os técnicos da massa; a conexão não é alongada."}
                    </small>
                  </label>
                  <CommandButton onCommand={() => scene.current?.followTrolley(true)}>
                    Acompanhar trole
                  </CommandButton>
                  <CommandButton onCommand={() => scene.current?.followTrolley(false)}>
                    Parar acompanhamento
                  </CommandButton>
                  <CommandButton
                    aria-pressed={audio}
                    onCommand={() => {
                      if (sound.current) {
                        sound.current.dispose();
                        sound.current = null;
                        setAudio(false);
                      } else {
                        try {
                          sound.current = new SiloSound();
                          setAudio(true);
                        } catch {
                          setMessage("Áudio indisponível.");
                        }
                      }
                    }}
                  >
                    {audio ? <Volume2 size={16} /> : <VolumeX size={16} />}Som ilustrativo
                  </CommandButton>
                  <CommandButton onCommand={() => openReading("sources")}>
                    Fontes, limites e parâmetros
                  </CommandButton>
                </>
              )}
              {panel === "indicators" && (
                <>
                  <h3>Colapso localizado ilustrativo</h3>
                  <p>
                    Duas regiões espelhadas, mesma seed e roteiro livre. A conexão é a variável do
                    replay de A.
                  </p>
                  <dl className="silo-data-pair">
                    <dt>Tempo do incidente</dt>
                    <dd>{f.incidentTime.toFixed(1)} s</dd>
                    <dt>Nível da massa</dt>
                    <dd>{f.surfaceHeight.toFixed(3)} m</dd>
                    <dt>Volume</dt>
                    <dd>{f.volume.toFixed(1)} m³</dd>
                    <dt>Conexão de A</dt>
                    <dd>
                      {f.connection.connected
                        ? f.connection.limited
                          ? "Limite geométrico"
                          : "Conectada"
                        : "Sem conexão"}
                    </dd>
                    <dt>Comprimento total configurado</dt>
                    <dd>{f.connection.maxLength.toFixed(3)} m</dd>
                    <dt>Distância entre extremos</dt>
                    <dd>{f.connection.distance.toFixed(3)} m</dd>
                    <dt>Conector vertical</dt>
                    <dd>{f.connection.connectorReach.toFixed(3)} m</dd>
                    <dt>Corda entre conexões</dt>
                    <dd>{f.connection.ropeDistance.toFixed(3)} m</dd>
                    <dt>Trajeto conector + corda</dt>
                    <dd>{f.connection.totalDistance.toFixed(3)} m</dd>
                    <dt>Distância percorrida pelo trole</dt>
                    <dd>{f.trolley.travelledDistance.toFixed(2)} m</dd>
                    <dt>Profundidade A / B</dt>
                    <dd>
                      {f.workers.A.depth.toFixed(2)} / {f.workers.B.depth.toFixed(2)} m
                    </dd>
                    <dt>FC ilustrativa B</dt>
                    <dd>{snap.vitals.heartRate ?? "—"} bpm</dd>
                    <dt>SpO₂</dt>
                    <dd>Indisponível</dd>
                  </dl>
                  <label className="silo-field">
                    Comparação controlada
                    <select
                      aria-label="Comparação controlada"
                      value={snap.scenario}
                      onChange={(e) => simulation.setScenario(e.target.value as Scenario)}
                    >
                      <option value="comparison">A conectado · B sem conexão</option>
                      <option value="no-connection">Replay de A sem conexão</option>
                      <option value="prevention">Prevenção · entrada impedida</option>
                    </select>
                  </label>
                  <p className="silo-note">
                    Retenção geométrica não comprova salvamento. Movimentação bloqueada e resgate
                    planejado continuam necessários.
                  </p>
                  <CommandButton onCommand={() => switchMode("prevention")}>
                    <ShieldCheck size={17} />
                    Ver prevenção
                  </CommandButton>
                  <CommandButton onCommand={() => openReading("analysis")}>
                    Análise, prevenção e dados
                  </CommandButton>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      {animated && (
        <footer className="silo-transport">
          <CommandButton
            className="silo-primary"
            aria-label={transportLabel}
            onCommand={play}
            disabled={status !== "ready"}
          >
            {snap.status === "running" ? <Pause size={18} /> : <Play size={18} />}
            <span>{transportLabel}</span>
          </CommandButton>
          <CommandButton onCommand={() => simulation.reset()} aria-label="Reiniciar simulação">
            <RotateCcw size={18} />
          </CommandButton>
          <label className="silo-timeline">
            <span>
              <b>{f.time.toFixed(1)} s</b> / {simulation.getDuration()} s{" "}
              <small>
                {mode === "lvhf" ? "Volta completa · cinemática ilustrativa" : STAGES[f.stage]}
              </small>
            </span>
            <input
              aria-label="Instante da simulação"
              type="range"
              min="0"
              max={simulation.getDuration()}
              step=".1"
              value={f.time}
              onChange={(e) => simulation.seek(Number(e.target.value))}
            />
          </label>
          <select
            aria-label="Velocidade de reprodução"
            value={snap.playbackRate}
            onChange={(e) => simulation.setPlaybackRate(Number(e.target.value))}
          >
            <option value="1">1×</option>
            <option value=".5">0,5×</option>
            <option value=".25">0,25×</option>
          </select>
        </footer>
      )}
      {panel && (panel === "analysis" || panel === "sources") && (
        <Modal
          title={panel === "analysis" ? "Análise e prevenção" : "Fontes e critérios"}
          onClose={() => setPanel(null)}
        >
          {panel === "analysis" ? (
            <>
              <div className="silo-comparison-summary">
                <h3>A e B · mesmo roteiro livre</h3>
                <p>
                  A: limite de deslocamento condicionado à geometria. B: aprisionamento e
                  encobrimento. Nenhum dos estados certifica salvamento ou tempo de sobrevivência.
                </p>
              </div>
              <IncidentAnalysis
                onReplayPrevention={() => {
                  switchMode("prevention");
                  simulation.start();
                }}
              />
            </>
          ) : (
            <>
              <h3>LVHF circular interna · revisão paramétrica</h3>
              <p>
                Raio interno 11 m, costado 24,88 m, topo 30,403 m. Anel R10,926 m na cota 24,375 m.
                Origem no centro da fundação, Y vertical, θ=0 em +Z, sentido +X. CAD original e
                desenhos de transposição não obtidos; passagem mecânica exata pendente.
              </p>
              <p>
                Pré-tensão, cargas, fixações resistentes e capacidade: não especificadas. O nível
                até o cabo não é zona livre de queda. O colapso local conserva volume e não é
                previsão física calibrada.
              </p>
              <SourcesPanel />
            </>
          )}
        </Modal>
      )}
    </main>
  );
}
