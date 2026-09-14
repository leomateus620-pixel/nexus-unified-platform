import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Building2,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Eye,
  Focus,
  Footprints,
  Home,
  Image,
  Info,
  Layers3,
  Leaf,
  Maximize,
  Minus,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { byId, categoryNames, elements, references, site } from "../data";
import { diagnostics } from "../performance/metrics";
import type { CameraRequest, Category, Layers, PhotoId, Quality, ViewId } from "../types";
import type { Movement } from "../navigation/Navigation";
import { Minimap } from "../ui/Minimap";
import "./industrial.css";
const Scene = lazy(() => import("../scene/IndustrialScene"));
const initialLayers: Layers = {
  silos: true,
  equipment: true,
  buildings: true,
  terrain: true,
  vegetation: true,
  fences: true,
  information: true,
};
const icons: Record<Category, LucideIcon> = {
  silos: Box,
  equipment: Settings2,
  buildings: Building2,
  terrain: Layers3,
  vegetation: Leaf,
  fences: Minus,
};
const necessary = ["terrain", "silos-low", "buildings", "grain-handling", "fences", "vegetation"];
function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function IndustrialMap() {
  const [request, setRequest] = useState<CameraRequest>({ id: "overview", serial: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<"elements" | "layers" | "references" | "settings">("elements");
  const [sidebar, setSidebar] = useState(true);
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState<Quality>("balanced");
  const [neutral, setNeutral] = useState(false);
  const [blockout, setBlockout] = useState(false);
  const [wind, setWind] = useState(false);
  const [layers, setLayers] = useState(initialLayers);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  const [help, setHelp] = useState(false);
  const [compare, setCompare] = useState<PhotoId | null>(null);
  const [opacity, setOpacity] = useState(0.45);
  const [camera, setCamera] = useState<[number, number]>([133, 182]);
  const [stats, setStats] = useState({ fps: 0, calls: 0, triangles: 0 });
  const movement = useRef<Movement>({ forward: 0, side: 0, turn: 0 });
  const app = useRef<HTMLDivElement>(null);
  const element = selected ? byId.get(selected) : null;
  const isWalk = request.id === "walk";
  const view = useCallback((id: ViewId, elementId?: string) => {
    setCompare(null);
    setRequest((r) => ({ id, serial: r.serial + 1, ...(elementId ? { elementId } : {}) }));
  }, []);
  const exitWalk = useCallback(() => view("overview"), [view]);
  const select = useCallback((id: string) => {
    setSelected(id);
    setPanel("elements");
    setSidebar(true);
  }, []);
  const onPosition = useCallback((x: number, z: number) => setCamera([x, z]), []);
  const onReady = useCallback(
    (name: string) => setReady((r) => (r.includes(name) ? r : [...r, name])),
    [],
  );
  const onError = useCallback((message: string) => {
    setError(message);
    diagnostics.status = "error";
  }, []);
  const complete = necessary.every((n) => ready.includes(n));
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    if (innerWidth < 760) {
      setSidebar(false);
      setQuality("economy");
    }
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!help) return;
    const previous = document.activeElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setHelp(false);
        return;
      }
      if (e.key !== "Tab") return;
      const buttons = app.current?.querySelectorAll<HTMLButtonElement>(".industrial-help button");
      if (!buttons?.length) return;
      const first = buttons[0]!,
        last = buttons[buttons.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [help]);
  useEffect(() => {
    if (complete) {
      diagnostics.readyAt ??= performance.now();
      diagnostics.status = "ready";
    }
  }, [complete]);
  useEffect(() => {
    const timer = setInterval(() => {
      const a = diagnostics.samples
        .slice(-90)
        .map((s) => s.ms)
        .sort((a, b) => a - b);
      setStats({
        fps: a.length ? Math.round(1000 / (a[Math.floor(a.length / 2)] ?? 1000)) : 0,
        calls: diagnostics.calls,
        triangles: diagnostics.triangles,
      });
    }, 2000);
    return () => clearInterval(timer);
  }, []);
  const photo = compare ? references.find((r) => r.id === compare) : null;
  const filtered = elements.filter((e) =>
    `${e.name} ${e.id} ${categoryNames[e.category]}`
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <div className="industrial-app" ref={app}>
      <header className="industrial-header industrial-overlay">
        <Link to="/" className="industrial-brand" aria-label="Voltar ao Nexus">
          <span className="industrial-brand-symbol">
            <Box size={21} />
          </span>
          <b>NEXUS</b>
        </Link>
        <span className="industrial-header-divider" />
        <span className="industrial-breadcrumb">
          Mapas 3D <ChevronRight size={13} /> <strong>3 Tentos</strong>
        </span>
        <div className="industrial-header-end">
          <span className="industrial-referenced">
            <i /> Reconstrução visual
          </span>
          <button aria-label="Ajuda de navegação" onClick={() => setHelp(true)}>
            <CircleHelp size={19} />
          </button>
          <button
            aria-label="Tela cheia"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void app.current
                  ?.requestFullscreen()
                  .catch(() =>
                    setError(
                      "O navegador não permitiu abrir a tela cheia. O mapa continua disponível.",
                    ),
                  );
            }}
          >
            <Maximize size={18} />
          </button>
        </div>
      </header>
      <div className="industrial-stage">
        <div className="industrial-canvas" data-testid="industrial-canvas">
          <Suspense fallback={<div className="industrial-loading">Preparando o ambiente 3D…</div>}>
            <Scene
              key={generation}
              request={request}
              quality={quality}
              neutral={neutral}
              blockout={blockout}
              wind={wind}
              reducedMotion={reducedMotion}
              layers={layers}
              selected={selected}
              movement={movement}
              onSelect={select}
              onExitWalk={exitWalk}
              onPosition={onPosition}
              onReady={onReady}
              onError={onError}
            />
          </Suspense>
        </div>
        {photo && (
          <img
            className="industrial-photo-overlay"
            src={photo.url}
            alt={`Sobreposição da Foto ${photo.id}`}
            style={{ opacity }}
          />
        )}
        <aside
          inert={!sidebar}
          aria-hidden={!sidebar}
          className={`industrial-sidebar industrial-overlay ${sidebar ? "is-open" : ""}`}
        >
          <div className="industrial-unit-heading">
            <span className="industrial-eyebrow">UNIDADE AGROINDUSTRIAL</span>
            <div>
              <h1>3 Tentos</h1>
              <button aria-label="Recolher painel" onClick={() => setSidebar(false)}>
                <PanelLeftClose size={18} />
              </button>
            </div>
            <p>Uma nova perspectiva da unidade.</p>
            <span className="industrial-chip">
              <span /> 4 referências fotográficas
            </span>
          </div>
          <nav className="industrial-panel-tabs" aria-label="Painéis do mapa">
            {(
              [
                { id: "elements", icon: Box, label: "Elementos" },
                { id: "layers", icon: Layers3, label: "Camadas" },
                { id: "references", icon: Image, label: "Fotos" },
                { id: "settings", icon: Settings2, label: "Ajustes" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                aria-label={t.label}
                aria-pressed={panel === t.id}
                onClick={() => setPanel(t.id)}
              >
                <t.icon size={17} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="industrial-panel-content">
            {panel === "elements" &&
              (element ? (
                <>
                  <button className="industrial-back" onClick={() => setSelected(null)}>
                    <ChevronLeft size={14} /> Todos os elementos
                  </button>
                  <div className="industrial-detail-icon">
                    {(() => {
                      const Icon = icons[element.category];
                      return <Icon size={31} />;
                    })()}
                  </div>
                  <span className="industrial-eyebrow">{categoryNames[element.category]}</span>
                  <h2>{element.name}</h2>
                  <span className="industrial-code">{element.id} · identificação provisória</span>
                  <p className="industrial-description">{element.description}</p>
                  <button className="industrial-primary" onClick={() => view("focus", element.id)}>
                    <Focus size={16} /> Aproximar elemento
                  </button>
                  <dl className="industrial-confirmation">
                    <div>
                      <dt>Existência</dt>
                      <dd>
                        <Check size={13} /> Visível nas fotos
                      </dd>
                    </div>
                    <div>
                      <dt>Dimensões</dt>
                      <dd className="is-estimated">Estimadas</dd>
                    </div>
                    <div>
                      <dt>Função</dt>
                      <dd>
                        {element.functionStatus === "visible"
                          ? "Identificável"
                          : element.functionStatus === "probable"
                            ? "Interpretação provável"
                            : "Não confirmada"}
                      </dd>
                    </div>
                  </dl>
                  <h3>Referências do elemento</h3>
                  <div className="industrial-photo-chips">
                    {element.photos.map((id) => (
                      <button
                        key={id}
                        onClick={() => {
                          view(id);
                          setCompare(id);
                        }}
                      >
                        Foto {id} <Camera size={13} />
                      </button>
                    ))}
                  </div>
                  <h3>Hipóteses e pendências</h3>
                  <ul className="industrial-notes">
                    {[...element.assumptions, ...element.pending].map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <label className="industrial-search">
                    <Search size={16} />
                    <input
                      placeholder="Buscar na unidade…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Buscar elementos"
                    />
                    <kbd>/</kbd>
                  </label>
                  <div className="industrial-list-heading">
                    <span>EXPLORAR ELEMENTOS</span>
                    <span>{filtered.length.toString().padStart(2, "0")}</span>
                  </div>
                  <div className="industrial-element-list">
                    {filtered.map((e) => {
                      const Icon = icons[e.category];
                      return (
                        <button
                          key={e.id}
                          onClick={() => select(e.id)}
                          data-testid={`element-${e.id}`}
                        >
                          <span className={`industrial-element-icon ${e.category}`}>
                            <Icon size={19} />
                          </span>
                          <span>
                            <strong>{e.name}</strong>
                            <small>
                              {e.id} · {categoryNames[e.category]}
                            </small>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      );
                    })}
                    {!filtered.length && (
                      <p className="industrial-description">Nenhum elemento encontrado.</p>
                    )}
                  </div>
                </>
              ))}
            {panel === "layers" && (
              <>
                <span className="industrial-eyebrow">VISIBILIDADE</span>
                <h2>Camadas da unidade</h2>
                <p className="industrial-description">
                  Explore os conjuntos sem perder a implantação.
                </p>
                {Object.entries(categoryNames).map(([key, label]) => (
                  <label className="industrial-toggle" key={key}>
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={layers[key as keyof Layers]}
                      onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
                    />
                  </label>
                ))}
                <button className="industrial-secondary" onClick={() => setLayers(initialLayers)}>
                  <RotateCcw size={15} /> Restaurar camadas
                </button>
              </>
            )}
            {panel === "references" && (
              <>
                <span className="industrial-eyebrow">LEITURA FOTOGRÁFICA</span>
                <h2>Quatro vistas. Uma unidade.</h2>
                <p className="industrial-description">
                  Câmeras aproximadas observam a mesma implantação. Sobreponha a referência para
                  inspecionar diferenças.
                </p>
                {references.map((r) => (
                  <button
                    key={r.id}
                    className="industrial-reference-card"
                    onClick={() => {
                      view(r.id);
                      setCompare(r.id);
                    }}
                  >
                    <img src={r.url} loading="lazy" alt={`Foto ${r.id} original`} />
                    <span>
                      <b>Foto {r.id}</b>
                      <small>{site.cameras[r.id].label.split(" · ")[1]}</small>
                      <Eye size={16} />
                    </span>
                  </button>
                ))}
                <p className="industrial-fine-print">
                  Arquivos originais preservados. Enquadramentos aproximados; sem calibração
                  fotogramétrica ou orientação geográfica confirmada.
                </p>
              </>
            )}
            {panel === "settings" && (
              <>
                <span className="industrial-eyebrow">APRESENTAÇÃO</span>
                <h2>Seu modo de explorar</h2>
                <label className="industrial-field">
                  Perfil gráfico
                  <select
                    aria-label="Perfil gráfico"
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as Quality)}
                  >
                    <option value="balanced">Desktop equilibrado</option>
                    <option value="economy">Econômico</option>
                  </select>
                </label>
                <label className="industrial-toggle">
                  <span>Iluminação neutra</span>
                  <input
                    type="checkbox"
                    checked={neutral}
                    onChange={(e) => setNeutral(e.target.checked)}
                  />
                </label>
                <label className="industrial-toggle">
                  <span>Inspecionar blockout</span>
                  <input
                    type="checkbox"
                    checked={blockout}
                    onChange={(e) => setBlockout(e.target.checked)}
                  />
                </label>
                <label className="industrial-toggle">
                  <span>Vento suave nas folhas</span>
                  <input
                    type="checkbox"
                    checked={wind}
                    disabled={reducedMotion || quality === "economy"}
                    onChange={(e) => setWind(e.target.checked)}
                  />
                </label>
                <p className="industrial-fine-print">
                  {reducedMotion
                    ? "Movimento reduzido ativo. Transições diretas e vento suspenso."
                    : "A cena repousa quando a câmera e a vegetação estão paradas."}
                </p>
                <div className="industrial-metrics">
                  <span>Últimos quadros em movimento</span>
                  <strong>
                    {stats.fps || "—"} <small>FPS amostrados</small>
                  </strong>
                  <p>
                    {stats.calls} chamadas · {(stats.triangles / 1000).toFixed(0)} mil triângulos
                  </p>
                  <small>
                    Contagem inclui passes de sombra. Não é certificação de dispositivo.
                  </small>
                </div>
                <button
                  className="industrial-secondary"
                  onClick={() =>
                    downloadJson("3tentos-desempenho.json", {
                      ...diagnostics,
                      userAgent: navigator.userAgent,
                      resources: performance.getEntriesByType("resource").map((r) => r.toJSON()),
                    })
                  }
                >
                  <Download size={15} /> Exportar diagnóstico
                </button>
                <button
                  className="industrial-secondary"
                  onClick={() => downloadJson("3tentos-cadastro-calibracao.json", site)}
                >
                  <Download size={15} /> Exportar cadastro
                </button>
                <div className="industrial-scale-note">
                  <Info size={17} />
                  <p>
                    Escala estimada. Medição desativada até receber dimensões confiáveis. Dados
                    operacionais não disponíveis.
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="industrial-sidebar-footer">
            <Info size={14} />
            <span>Modelo referenciado · dimensões estimadas</span>
          </div>
        </aside>
        {!sidebar && (
          <button
            className="industrial-open-panel industrial-overlay"
            aria-label="Abrir painel"
            onClick={() => setSidebar(true)}
          >
            <PanelLeftOpen size={19} />
          </button>
        )}
        <div className="industrial-view-toolbar industrial-overlay">
          <button
            className={request.id === "overview" ? "active" : ""}
            onClick={() => view("overview")}
            aria-label="Voltar à visão geral"
          >
            <Home size={16} />
            <span>Visão geral</span>
          </button>
          <span className="industrial-toolbar-divider" />
          <button
            aria-label="Superior"
            className={request.id === "B" ? "active" : ""}
            onClick={() => view("B")}
          >
            <Layers3 size={16} />
            <span>Superior</span>
          </button>
          <button
            aria-label="Passeio"
            className={isWalk ? "active" : ""}
            onClick={() => {
              view("walk");
              setSidebar(false);
            }}
          >
            <Footprints size={16} />
            <span>Passeio</span>
          </button>
        </div>
        <div className="industrial-light-switch industrial-overlay">
          <button
            aria-label={neutral ? "Ativar luz diurna" : "Ativar luz neutra"}
            onClick={() => setNeutral((n) => !n)}
          >
            <Sun size={18} />
            <span>{neutral ? "Neutro" : "Diurno"}</span>
            <ChevronDown size={12} />
          </button>
        </div>
        <div className="industrial-reference-views industrial-overlay">
          <span>VISTAS DE REFERÊNCIA</span>
          <div>
            {(["A", "B", "C", "D"] as PhotoId[]).map((id) => (
              <button
                key={id}
                aria-label={`Vista da Foto ${id}`}
                aria-pressed={request.id === id}
                onClick={() => view(id)}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
        {!isWalk && <Minimap camera={camera} selected={selected} onSelect={select} />}
        <div className="industrial-bottom-bar industrial-overlay">
          <span>
            <MousePointer2 size={13} />
            <span>
              {isWalk
                ? "WASD / setas para mover · arraste para olhar · Esc para sair"
                : "Arraste para orbitar · botão direito para deslocar · role para aproximar"}
            </span>
          </span>
          <span>
            <i className={complete ? "ready" : ""} />
            {complete ? "Cena carregada" : "Carregando setores"}
          </span>
        </div>
        {isWalk && (
          <div className="industrial-walk-controls industrial-overlay">
            <p>Altura de observação estimada · colisões ativas</p>
            <div>
              <button
                aria-label="Girar para a esquerda"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  movement.current.turn = 1;
                  window.dispatchEvent(new Event("industrial-move"));
                }}
                onPointerUp={() => (movement.current.turn = 0)}
                onPointerCancel={() => (movement.current.turn = 0)}
              >
                <RotateCcw size={18} />
              </button>
              {[
                { icon: ArrowLeft, side: -1, forward: 0, label: "Mover para a esquerda" },
                { icon: ArrowUp, side: 0, forward: 1, label: "Avançar" },
                { icon: ArrowDown, side: 0, forward: -1, label: "Recuar" },
                { icon: ArrowRight, side: 1, forward: 0, label: "Mover para a direita" },
              ].map((d) => (
                <button
                  key={d.label}
                  aria-label={d.label}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    movement.current = { forward: d.forward, side: d.side, turn: 0 };
                    window.dispatchEvent(new Event("industrial-move"));
                  }}
                  onPointerUp={() => {
                    movement.current = { forward: 0, side: 0, turn: 0 };
                    window.dispatchEvent(new Event("industrial-move"));
                  }}
                  onPointerCancel={() => {
                    movement.current = { forward: 0, side: 0, turn: 0 };
                    window.dispatchEvent(new Event("industrial-move"));
                  }}
                >
                  <d.icon size={19} />
                </button>
              ))}
              <button aria-label="Sair do passeio" onClick={exitWalk}>
                <X size={18} />
              </button>
            </div>
            <button
              className="industrial-pointer-lock"
              onClick={() => void app.current?.querySelector("canvas")?.requestPointerLock()}
            >
              Ativar mouse livre · Esc libera o ponteiro
            </button>
          </div>
        )}
        {compare && (
          <div className="industrial-comparison industrial-overlay">
            <span>
              <Image size={16} /> Foto {compare} · sobreposição
            </span>
            <label>
              Opacidade
              <input
                aria-label="Opacidade da fotografia"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
            </label>
            <button aria-label="Fechar comparação" onClick={() => setCompare(null)}>
              <X size={17} />
            </button>
          </div>
        )}
        {!complete && !error && (
          <div className="industrial-load-progress industrial-overlay" role="status">
            <span>Reconstruindo a perspectiva…</span>
            <div>
              <i
                style={{
                  width: `${Math.max(6, (ready.filter((r) => necessary.includes(r)).length / necessary.length) * 100)}%`,
                }}
              />
            </div>
            <small>{ready.filter((r) => necessary.includes(r)).length} de 6 setores prontos</small>
          </div>
        )}
        {error && (
          <div className="industrial-error industrial-overlay" role="alert">
            <Info size={24} />
            <h2>Vamos recuperar a cena</h2>
            <p>{error}</p>
            <button
              className="industrial-primary"
              onClick={() => {
                setError("");
                setReady([]);
                setGeneration((g) => g + 1);
              }}
            >
              Recarregar cena
            </button>
          </div>
        )}
      </div>
      {help && (
        <div className="industrial-modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="industrial-help"
            role="dialog"
            aria-modal="true"
            aria-label="Como explorar a unidade"
            onClick={(e) => e.stopPropagation()}
          >
            <button autoFocus aria-label="Fechar ajuda" onClick={() => setHelp(false)}>
              <X />
            </button>
            <span className="industrial-eyebrow">BEM-VINDO À UNIDADE</span>
            <h2>Explore de todos os ângulos.</h2>
            <p>
              Arraste com um dedo ou com o botão esquerdo para orbitar. Use dois dedos ou o botão
              direito para deslocar. Aproxime com pinça ou com a roda do mouse.
            </p>
            <p>
              No passeio, use WASD, setas ou os controles na tela. Arraste para olhar; a captura do
              ponteiro é opcional. Pressione Esc para sair.
            </p>
            <p>
              Selecione estruturas na cena, no minimapa ou na lista. A vista superior preserva os
              eixos da Foto B. O botão Visão geral permanece disponível.
            </p>
            <div className="industrial-scale-note">
              <Info size={18} />
              <p>
                Reconstrução visual com escala estimada. Não é levantamento cadastral, as built
                validado ou modelo conectado à operação.
              </p>
            </div>
            <button className="industrial-primary" onClick={() => setHelp(false)}>
              Começar a explorar <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
