import { Component, Suspense, lazy, useCallback, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Eye,
  FileText,
  Focus,
  Info,
  Layers3,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import {
  DIM,
  EVIDENCE,
  GROUPS,
  ISSUES,
  LAYERS,
  SECTORS,
  SOURCE,
  VIEWS,
  type GroupId,
  type LayerId,
  type View,
} from "./data";
import type { CameraCommand } from "./TrevisanScene";
import "./trevisan.css";

const Scene = lazy(() => import("./TrevisanScene"));
class SceneBoundary extends Component<
  { children: ReactNode; retry: () => void },
  { error: boolean }
> {
  override state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  override render() {
    return this.state.error ? (
      <div className="tr-fallback">
        <h2>Não foi possível iniciar a cena.</h2>
        <p>A ficha técnica e o PDF continuam disponíveis.</p>
        <button onClick={this.props.retry}>Tentar novamente</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const initialGroups = Object.fromEntries(GROUPS.map((g) => [g.id, true])) as Record<
  GroupId,
  boolean
>;
const initialLayers = Object.fromEntries(LAYERS.map((g) => [g.id, true])) as Record<
  LayerId,
  boolean
>;

export default function TrevisanViewer() {
  const [selectedId, setSelectedId] = useState("moega");
  const selected = SECTORS.find((s) => s.id === selectedId)!;
  const [groups, setGroups] = useState(initialGroups),
    [layers, setLayers] = useState(initialLayers);
  const [isolated, setIsolated] = useState(false),
    [labels, setLabels] = useState(true);
  const [quality, setQuality] = useState<"standard" | "economy">("standard");
  const [activeView, setActiveView] = useState("geral");
  const [command, setCommand] = useState<CameraCommand>({ serial: 0, view: VIEWS[0]! });
  const [tab, setTab] = useState<"setores" | "camadas" | "fonte">("setores");
  const [panel, setPanel] = useState(false),
    [ready, setReady] = useState(false),
    [lost, setLost] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const onReady = useCallback(() => setReady(true), []);
  const onContext = useCallback((value: boolean) => {
    setLost(value);
    if (value) setReady(false);
  }, []);
  const view = (v: View) => {
    setCommand((c) => ({ serial: c.serial + 1, view: v }));
    setActiveView(v.id);
  };
  const focusSector = useCallback((id: string) => {
    const s = SECTORS.find((s) => s.id === id);
    if (!s) return;
    setSelectedId(id);
    setGroups((g) => ({ ...g, [s.group]: true }));
    if (s.evidence === "sem-cota") setLayers((l) => ({ ...l, referencias: true }));
    const r = s.radius;
    setCommand((c) => ({
      serial: c.serial + 1,
      view: {
        id: s.id,
        name: s.name,
        eye: [s.point[0] - r * 1.45, s.point[1] + r * 1.05, s.point[2] - r * 1.25],
        target: s.point,
      },
    }));
    setActiveView("");
  }, []);
  const inspect = () => {
    setLayers((l) => ({ ...l, coberturas: false, fechamentos: false }));
    focusSector(selectedId);
  };
  const reset = () => {
    setGroups(initialGroups);
    setLayers(initialLayers);
    setIsolated(false);
    setLabels(true);
    setSelectedId("moega");
    view(VIEWS[0]!);
  };
  const retry = () => {
    setReady(false);
    setLost(false);
    setAttempt((a) => a + 1);
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapper.current?.requestFullscreen();
    } catch {
      setNotice("Tela cheia indisponível neste navegador. A navegação permanece disponível.");
    }
  };
  return (
    <div className="tr-app" ref={wrapper}>
      <header className="tr-header">
        <Link to="/mapas-3d" className="tr-back" aria-label="Voltar aos mapas 3D">
          <ArrowLeft size={18} />
        </Link>
        <div className="tr-title">
          <div className="tr-eyebrow">
            NEXUS <span>/</span> MAPAS 3D <span>/</span> TREVISAN
          </div>
          <h1>
            Moega 3 <span>& complexo industrial</span>
          </h1>
        </div>
        <span className="tr-preliminary">
          <span />
          LEVANTAMENTO PRELIMINAR
        </span>
        <a className="tr-source-link" href={SOURCE.url} target="_blank" rel="noreferrer">
          <FileText size={15} />
          <span>Pranchas de origem</span>
          <ArrowUpRight size={14} />
        </a>
      </header>
      <div className="tr-workspace">
        <section className="tr-stage" aria-label="Visualização 3D do complexo Trevisan">
          <div className="tr-stage-top">
            <span className="tr-stage-caption">
              TREVISAN / ARROZ <small>Modelo técnico de interpretação</small>
            </span>
            <button
              className="tr-mobile-panel"
              aria-expanded={panel}
              onClick={() => setPanel(!panel)}
            >
              <Layers3 size={16} />
              Explorar
            </button>
          </div>
          <SceneBoundary key={attempt} retry={retry}>
            <Suspense
              fallback={<div className="tr-loading">Preparando geometria do levantamento…</div>}
            >
              <Scene
                groups={groups}
                layers={layers}
                selected={selected}
                isolated={isolated}
                labels={labels}
                quality={quality}
                command={command}
                onSelect={focusSector}
                onReady={onReady}
                onContext={onContext}
              />
            </Suspense>
          </SceneBoundary>
          {!ready && !lost && (
            <div className="tr-loading-indicator" role="status">
              Preparando visualização…
            </div>
          )}
          {lost && (
            <div className="tr-recovery" role="alert">
              <h2>Renderização interrompida</h2>
              <p>Aguardando a recuperação do WebGL.</p>
              <button onClick={retry}>Reiniciar visualização</button>
            </div>
          )}
          <nav className="tr-views" aria-label="Vistas pré-definidas">
            {VIEWS.map((v, i) => (
              <button
                key={v.id}
                aria-pressed={activeView === v.id}
                onClick={() => {
                  setIsolated(false);
                  setGroups(initialGroups);
                  view(v);
                }}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                {v.name}
              </button>
            ))}
          </nav>
          <div className="tr-tools">
            <button
              title="Enquadrar conjunto"
              aria-label="Enquadrar conjunto"
              onClick={() => {
                setIsolated(false);
                setGroups(initialGroups);
                view(VIEWS[0]!);
              }}
            >
              <Focus size={18} />
            </button>
            <button
              title="Aproximar"
              aria-label="Aproximar"
              onClick={() => setCommand((c) => ({ serial: c.serial + 1, zoom: 0.8 }))}
            >
              <Plus size={18} />
            </button>
            <button
              title="Afastar"
              aria-label="Afastar"
              onClick={() => setCommand((c) => ({ serial: c.serial + 1, zoom: 1.25 }))}
            >
              <Minus size={18} />
            </button>
            <button
              title="Legendas"
              aria-label="Exibir legendas"
              aria-pressed={labels}
              onClick={() => setLabels(!labels)}
            >
              <Eye size={18} />
            </button>
            <button title="Tela cheia" aria-label="Tela cheia" onClick={fullscreen}>
              <Maximize2 size={18} />
            </button>
          </div>
          <div className="tr-stage-bottom">
            <span>
              Arraste para orbitar <b>·</b> Botão direito para mover <b>·</b> Rolagem para zoom
            </span>
            <span className="tr-touch-help">1 dedo: órbita · 2 dedos: mover e zoom</span>
            <div className="tr-scale">
              <i />
              <span>Grade 5 × 5 m</span>
            </div>
          </div>
          <div className="tr-reference-note">
            <span />
            Tracejado âmbar: sem cota vertical
          </div>
        </section>
        <aside className={`tr-panel ${panel ? "is-open" : ""}`} aria-label="Explorador técnico">
          <div className="tr-panel-head">
            <span>EXPLORADOR TÉCNICO</span>
            <button
              className="tr-panel-close"
              aria-label="Fechar explorador"
              onClick={() => setPanel(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="tr-tabs" role="tablist" aria-label="Conteúdo do explorador">
            {(["setores", "camadas", "fonte"] as const).map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                role="tab"
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                onClick={() => setTab(t)}
              >
                {t === "fonte" ? "Fonte & limites" : t === "setores" ? "Setores" : "Camadas"}
              </button>
            ))}
          </div>
          <div
            className="tr-panel-scroll"
            id={`panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "setores" && (
              <>
                <div className="tr-current">
                  <span className={`tr-evidence ${selected.evidence}`}>
                    {EVIDENCE[selected.evidence]}
                  </span>
                  <h2>{selected.name}</h2>
                  <p className="tr-dimensions">{selected.dimensions}</p>
                  <p>{selected.description}</p>
                  <a
                    href={`${SOURCE.url}#page=${Number(selected.sheets.slice(0, 2))}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Folhas {selected.sheets} <ArrowUpRight size={12} />
                  </a>
                  <div className="tr-current-actions">
                    <button onClick={inspect}>
                      <Layers3 size={14} />
                      Ver estrutura
                    </button>
                    <button aria-pressed={isolated} onClick={() => setIsolated(!isolated)}>
                      <Focus size={14} />
                      {isolated ? "Mostrar conjunto" : "Isolar grupo"}
                    </button>
                  </div>
                </div>
                <p className="tr-list-title">
                  FOCAR POR ESTRUTURA <span>{SECTORS.length}</span>
                </p>
                {GROUPS.map((g) => (
                  <details key={g.id} open={g.id === selected.group} className="tr-sector-group">
                    <summary>
                      {g.name}
                      <ChevronDown size={13} />
                    </summary>
                    <div>
                      {SECTORS.filter((s) => s.group === g.id).map((s) => (
                        <button
                          key={s.id}
                          className={`tr-sector ${s.id === selectedId ? "active" : ""}`}
                          onClick={() => focusSector(s.id)}
                        >
                          <span className={`tr-dot ${s.evidence}`} />
                          <span>{s.name}</span>
                          {s.id === selectedId ? <Check size={13} /> : <ArrowUpRight size={12} />}
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
              </>
            )}
            {tab === "camadas" && (
              <>
                <h2 className="tr-section-title">Leia o conjunto por partes.</h2>
                <p className="tr-muted">
                  Desligue a cobertura e os fechamentos para inspecionar a estrutura interna.
                </p>
                <p className="tr-list-title">CONJUNTOS</p>
                {GROUPS.map((g) => (
                  <label className="tr-switch" key={g.id}>
                    <span>{g.name}</span>
                    <input
                      type="checkbox"
                      checked={groups[g.id]}
                      onChange={(e) => setGroups((v) => ({ ...v, [g.id]: e.target.checked }))}
                    />
                  </label>
                ))}
                <p className="tr-list-title">COMPONENTES</p>
                {LAYERS.map((l) => (
                  <label className="tr-switch" key={l.id}>
                    <span>{l.name}</span>
                    <input
                      type="checkbox"
                      checked={layers[l.id]}
                      onChange={(e) => setLayers((v) => ({ ...v, [l.id]: e.target.checked }))}
                    />
                  </label>
                ))}
                <label className="tr-quality">
                  Qualidade de visualização
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as "standard" | "economy")}
                  >
                    <option value="standard">Padrão · com sombras</option>
                    <option value="economy">Econômica · sem sombras</option>
                  </select>
                </label>
                <button className="tr-reset" onClick={reset}>
                  <RotateCcw size={14} />
                  Restaurar apresentação
                </button>
              </>
            )}
            {tab === "fonte" && (
              <>
                <span className="tr-evidence estimado">Não é um as built</span>
                <h2 className="tr-section-title">Uma fonte. Oito pranchas.</h2>
                <p className="tr-muted">
                  {SOURCE.title}. Levantamento de {SOURCE.date}, elaborado a partir de croqui de
                  campo e registros fotográficos. Apenas a Moega 3 possui medidas de campo.
                </p>
                <a className="tr-pdf-button" href={SOURCE.url} target="_blank" rel="noreferrer">
                  <FileText size={16} />
                  Abrir levantamento completo
                  <ArrowUpRight size={14} />
                </a>
                <p className="tr-list-title">CONFIANÇA DAS INFORMAÇÕES</p>
                <p className="tr-source-entry">
                  <span className="tr-dot croqui" />
                  <b>Croqui:</b> cota transcrita, ainda preliminar.
                </p>
                <p className="tr-source-entry">
                  <span className="tr-dot estimado" />
                  <b>Estimado:</b> imagem, proporção ou valor adotado no PDF.
                </p>
                <p className="tr-source-entry">
                  <span className="tr-dot sem-cota" />
                  <b>Sem cota:</b> contorno ou símbolo; altura não inventada.
                </p>
                <p className="tr-list-title">DECISÕES & PENDÊNCIAS</p>
                <ol className="tr-issues">
                  {ISSUES.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ol>
                <p className="tr-muted">
                  Origem local: G1 da folha 05. Implantação no sistema de eixos da prancha; não se
                  trata de topografia executiva. As coordenadas WGS-84 da fonte foram preservadas na
                  documentação.
                </p>
              </>
            )}
          </div>
          <div className="tr-panel-footer">
            <Info size={14} />
            <span>Geometria preliminar. Conferir em campo.</span>
          </div>
        </aside>
      </div>
      <footer className="tr-footer">
        <span className="tr-status">
          <i className={ready ? "ready" : ""} />
          {lost ? "WebGL interrompido" : ready ? "Visualização ativa" : "Carregando"}
        </span>
        <span>
          MOEGA 3 <b>{DIM.moega.length.toFixed(3).replace(".", ",")} × 17,00 m</b>
        </span>
        <span>
          UNIDADES <b>Metros</b>
        </span>
        <span className="tr-footer-date">
          FONTE <b>25 SET 2026</b>
        </span>
        <span className="tr-footer-right">TREVISAN / 01</span>
      </footer>
      {notice && (
        <div className="tr-notice" role="status">
          {notice}
          <button aria-label="Dispensar aviso" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
