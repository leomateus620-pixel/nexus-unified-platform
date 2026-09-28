import { Component, lazy, Suspense, useCallback, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Box,
  ChevronRight,
  Focus,
  Layers3,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
  Route as RouteIcon,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  ELEMENTS,
  INITIAL_LAYERS,
  LAYERS,
  ROUTE_STEPS,
  VIEWS,
  type ElementId,
  type ViewId,
} from "./lc02-layout";
import type { CameraCommand } from "./EscadaScene";
import { LC02Simulation, type ScenarioCount } from "./lc02-simulation";
import { PeoplePanel } from "./PeoplePanel";
import "./escada.css";

const Scene = lazy(() => import("./EscadaScene"));
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <div className="lc-error">
        <strong>Não foi possível iniciar o 3D.</strong>
        <p>O navegador precisa de WebGL. As medidas e a fonte continuam disponíveis no painel.</p>
        <button onClick={() => window.location.reload()}>Tentar novamente</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function EscadaViewer() {
  const [simulation] = useState(() => new LC02Simulation());
  const [command, setCommand] = useState<CameraCommand>({ serial: 0, view: "iso" });
  const [isolated, setIsolated] = useState(false);
  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [labels, setLabels] = useState<"levels" | "all" | "none">("levels");
  const [path, setPath] = useState(false);
  const [dimensions, setDimensions] = useState(false);
  const [selected, setSelected] = useState<ElementId | null>(null);
  const [tab, setTab] = useState<"route" | "layers" | "source">("route");
  const [panel, setPanel] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "lost">("loading");
  const container = useRef<HTMLDivElement>(null);
  const labelContainer = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const onStatus = useCallback((s: "loading" | "ready" | "lost") => setStatus(s), []);
  const view = (id: ViewId) => {
    simulation.mode("wide");
    setCommand((c) => ({ serial: c.serial + 1, view: id }));
    setSelected(null);
    if (id === "opposite" || id === "top") setIsolated(true);
    if (id === "top") setPath(true);
  };
  const focus = (id: ElementId) => {
    simulation.mode("wide");
    const e = ELEMENTS.find((e) => e.id === id)!;
    setLayers((l) => ({ ...l, [e.layer]: true }));
    setSelected(id);
    setCommand((c) => ({ serial: c.serial + 1, view: c.view, focus: id }));
  };
  const reset = () => {
    simulation.stop();
    setIsolated(false);
    setLayers(INITIAL_LAYERS);
    setLabels("levels");
    setDimensions(false);
    setPath(false);
    view("iso");
  };
  const item = ELEMENTS.find((e) => e.id === selected);
  const startPeople = (count: ScenarioCount) => {
    setCommand((c) => ({ serial: c.serial + 1, view: "iso", wide: true }));
    setLayers(INITIAL_LAYERS);
    setSelected(null);
    setLabels("levels");
    simulation.start(count);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.current?.requestFullscreen?.().catch(() => {});
  };
  return (
    <div className="lc-app" ref={container}>
      <header className="lc-header">
        <Link to="/engenharia" className="lc-back" aria-label="Voltar à engenharia">
          <ArrowLeft size={17} />
          <span>NEXUS</span>
        </Link>
        <span className="lc-header-divider" />
        <div className="lc-project">
          <span>
            ESTUDO DE IMPLANTAÇÃO <i>/</i> LC-02
          </span>
          <h1>Escada de acesso externo</h1>
        </div>
        <span className="lc-phase">
          <i /> Layout preliminar
        </span>
        <button
          className="lc-icon-button lc-fullscreen"
          aria-label="Tela cheia"
          onClick={fullscreen}
        >
          <Maximize size={18} />
        </button>
      </header>
      <div className="lc-workspace">
        <main className="lc-main">
          <div className="lc-scene-heading">
            <div>
              <span className="lc-kicker">ARMAZÉM · ACESSO EXTERNO</span>
              <h2>Um percurso. Três níveis.</h2>
            </div>
            <span className="lc-scale">
              METROS <span> / </span> REFERÊNCIA LOCAL
            </span>
          </div>
          <nav className="lc-views" aria-label="Vistas do modelo">
            {VIEWS.map((v, i) => (
              <button
                key={v.id}
                aria-pressed={command.view === v.id && !command.focus}
                onClick={() => view(v.id)}
              >
                <span>0{i + 1}</span>
                {v.name}
              </button>
            ))}
          </nav>
          <div className="lc-viewport" ref={viewport}>
            <SceneBoundary>
              <Suspense fallback={<div className="lc-loading">Preparando visualização…</div>}>
                <Scene
                  simulation={simulation}
                  command={command}
                  isolated={isolated}
                  layers={layers}
                  labels={labels}
                  path={path}
                  dimensions={dimensions}
                  selected={selected}
                  labelContainer={labelContainer}
                  onStatus={onStatus}
                />
              </Suspense>
            </SceneBoundary>
            <div className="lc-labels" ref={labelContainer} aria-hidden="true" />
            <PeoplePanel simulation={simulation} onStart={startPeople} viewport={viewport} />
            {status === "loading" && (
              <div className="lc-status" role="status">
                Preparando modelo 3D…
              </div>
            )}
            {status === "lost" && (
              <div className="lc-error" role="status">
                <strong>Renderização interrompida</strong>
                <p>Aguardando o navegador recuperar o contexto gráfico.</p>
                <button onClick={() => window.location.reload()}>Recarregar visualização</button>
              </div>
            )}
            <div className="lc-compass" aria-hidden="true">
              <span>Y ↑</span>
              <b>
                LC<span>02</span>
              </b>
              <small>X ↗ &nbsp; Z ↘</small>
            </div>
            <div className="lc-tools">
              <button
                aria-label="Foco geral do acesso"
                title="Foco geral"
                onClick={() => view("iso")}
              >
                <Focus size={19} />
              </button>
              <button
                aria-label="Aproximar"
                onClick={() =>
                  setCommand((c) => ({ serial: c.serial + 1, view: c.view, zoom: 0.82 }))
                }
              >
                <Plus size={19} />
              </button>
              <button
                aria-label="Afastar"
                onClick={() =>
                  setCommand((c) => ({ serial: c.serial + 1, view: c.view, zoom: 1.22 }))
                }
              >
                <Minus size={19} />
              </button>
              <button
                aria-label="Restaurar apresentação"
                title="Restaurar apresentação"
                onClick={reset}
              >
                <RotateCcw size={17} />
              </button>
            </div>
            <div className="lc-context">
              <button aria-pressed={!isolated} onClick={() => setIsolated(false)}>
                Contexto completo
              </button>
              <button aria-pressed={isolated} onClick={() => setIsolated(true)}>
                Escada em destaque
              </button>
            </div>
            <button className="lc-mobile-explore" onClick={() => setPanel(true)}>
              <Layers3 size={16} />
              Explorar modelo
            </button>
          </div>
          <div className="lc-options">
            <label>
              <input type="checkbox" checked={path} onChange={(e) => setPath(e.target.checked)} />
              <RouteIcon size={15} />
              Percurso
            </label>
            <label>
              <input
                type="checkbox"
                checked={dimensions}
                onChange={(e) => setDimensions(e.target.checked)}
              />
              Cotas de referência
            </label>
            <label className="lc-label-select">
              Legendas
              <select
                value={labels}
                onChange={(e) => setLabels(e.target.value as typeof labels)}
                aria-label="Legendas"
              >
                <option value="levels">Níveis</option>
                <option value="all">Identificação</option>
                <option value="none">Ocultas</option>
              </select>
            </label>
            <span className="lc-mouse-hint">
              <MousePointer2 size={13} />
              Arraste para orbitar · botão direito para pan · rolagem para zoom
            </span>
          </div>
          <footer className="lc-footer">
            <span>
              <i /> Estudo comercial · 25.09.2026
            </span>
            <span>Representação de layout, sem finalidade de fabricação.</span>
          </footer>
        </main>
        {panel && (
          <button
            className="lc-panel-backdrop"
            aria-label="Fechar painel"
            onClick={() => setPanel(false)}
          />
        )}
        <aside className={`lc-panel ${panel ? "is-open" : ""}`} aria-label="Explorador da escada">
          <div className="lc-panel-title">
            <Box size={19} />
            <strong>Leitura do acesso</strong>
            <button
              className="lc-mobile-close lc-icon-button"
              aria-label="Fechar explorador"
              onClick={() => setPanel(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="lc-facts">
            <div>
              <strong>
                6,00<span> m</span>
              </strong>
              <small>DESNÍVEL TOTAL</small>
            </div>
            <div>
              <strong>
                1,20<span> m</span>
              </strong>
              <small>LARGURA ÚTIL</small>
            </div>
          </div>
          <div className="lc-tabs" role="tablist" aria-label="Explorador">
            {[
              ["route", "Percurso"],
              ["layers", "Camadas"],
              ["source", "Fonte & limites"],
            ].map(([id, name]) => (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-controls="lc-tabpanel"
                aria-selected={tab === id}
                onClick={() => setTab(id as typeof tab)}
              >
                {name}
              </button>
            ))}
          </div>
          <div
            id="lc-tabpanel"
            className="lc-panel-content"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "route" && (
              <>
                <div className="lc-section-intro">
                  <span>01 — PERCURSO DO ACESSO</span>
                  <p>Selecione uma etapa para aproximar.</p>
                </div>
                <ol className="lc-route-list">
                  {ROUTE_STEPS.map((id, i) => {
                    const e = ELEMENTS.find((e) => e.id === id)!;
                    return (
                      <li key={id}>
                        <button
                          className={selected === id ? "is-selected" : ""}
                          onClick={() => {
                            focus(id);
                            setPanel(false);
                          }}
                        >
                          <span className="lc-step">{String(i + 1).padStart(2, "0")}</span>
                          <span>
                            <strong>{e.label}</strong>
                            {e.level && <small>{e.level}</small>}
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <div className="lc-reference-title">02 — CONTEXTO E ESTRUTURA</div>
                <div className="lc-element-chips">
                  {ELEMENTS.filter((e) => !ROUTE_STEPS.includes(e.id)).map((e) => (
                    <button
                      key={e.id}
                      aria-pressed={selected === e.id}
                      onClick={() => {
                        focus(e.id);
                        setPanel(false);
                      }}
                    >
                      {e.label}
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
                </div>
                {item && (
                  <div className="lc-detail" aria-live="polite">
                    <span>ELEMENTO SELECIONADO</span>
                    <h3>{item.label}</h3>
                    <p>{item.detail}</p>
                  </div>
                )}
              </>
            )}
            {tab === "layers" && (
              <>
                <div className="lc-section-intro">
                  <span>VISIBILIDADE DO MODELO</span>
                  <p>Grupos independentes para ler a implantação.</p>
                </div>
                <div className="lc-layer-list">
                  {LAYERS.map((l) => (
                    <label key={l.id}>
                      <span>{l.name}</span>
                      <input
                        type="checkbox"
                        checked={layers[l.id]}
                        onChange={(e) => setLayers((s) => ({ ...s, [l.id]: e.target.checked }))}
                      />
                    </label>
                  ))}
                </div>
                <div className="lc-materials">
                  <span>LINGUAGEM DE MATERIAIS</span>
                  <p>
                    <i style={{ background: "#e9bc28" }} />
                    Guarda-corpos e corrimãos
                  </p>
                  <p>
                    <i style={{ background: "#76868f" }} />
                    Longarinas, degraus e patamares
                  </p>
                  <p>
                    <i style={{ background: "#9e603b" }} />
                    Pilares, bases e contraventamentos
                  </p>
                  <p>
                    <i style={{ background: "#b5bebf" }} />
                    Chapa corrugada existente
                  </p>
                </div>
                <p className="lc-note">
                  “Escada em destaque” deixa a envoltória da edificação semitransparente, mantendo a
                  porta, as referências e a vinculação visíveis.
                </p>
                <button className="lc-text-button" onClick={reset}>
                  <RotateCcw size={14} />
                  Restaurar apresentação
                </button>
              </>
            )}
            {tab === "source" && (
              <>
                <div className="lc-section-intro">
                  <span>REFERÊNCIA ÚNICA · PDF LC-02</span>
                  <p>Escada soldada EPC. Estudo comercial de layout, 4 páginas.</p>
                </div>
                <div className="lc-source-card">
                  <strong>Medidas informadas</strong>
                  <dl>
                    <div>
                      <dt>Saída</dt>
                      <dd>±0,00 m</dd>
                    </div>
                    <div>
                      <dt>Patamar intermediário</dt>
                      <dd>+3,00 m</dd>
                    </div>
                    <div>
                      <dt>Porta / patamar superior</dt>
                      <dd>+6,00 m</dd>
                    </div>
                    <div>
                      <dt>Largura útil</dt>
                      <dd>1,20 m</dd>
                    </div>
                    <div>
                      <dt>Lateral de saída → P1</dt>
                      <dd>3,00 m</dd>
                    </div>
                    <div>
                      <dt>Centros P1 → P2</dt>
                      <dd>5,00 m</dd>
                    </div>
                  </dl>
                </div>
                <p className="lc-note">
                  Planta da página 4 orienta o percurso em L. Isométricas das páginas 2 e 3 orientam
                  a estrutura visível e os materiais.
                </p>
                <div className="lc-source-card">
                  <strong>Interpretação visual</strong>
                  <p>
                    Pessoas, velocidades e espaçamentos representam circulação ilustrativa. A
                    abertura da porta para dentro e o pequeno piso de chegada são hipóteses visuais.
                    Não há cálculo de cargas, deformações ou capacidade estrutural.
                  </p>
                  <p>
                    Comprimentos não cotados, repetição dos degraus, alturas de proteção, seções,
                    conexões, terreno e volume da edificação são ilustrativos. Não são
                    especificações de fabricação.
                  </p>
                  <p>
                    O ±0,00 m é o piso de saída. O terreno abaixo reproduz apenas o contexto das
                    isométricas. Folgas e dimensões não informadas dependem de levantamento.
                  </p>
                </div>
                <a
                  className="lc-download"
                  href="/models/escada-lc02/referencia.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  Consultar PDF de referência
                  <ArrowUpRight size={15} />
                </a>
                <a className="lc-download" href="/models/escada-lc02/escada-lc02.glb" download>
                  Baixar modelo 3D (.glb)
                  <ArrowDownToLine size={15} />
                </a>
              </>
            )}
          </div>
          <div className="lc-panel-foot">
            <span className="lc-dot" />
            Dois lances iguais · patamar superior contínuo
          </div>
        </aside>
      </div>
    </div>
  );
}
