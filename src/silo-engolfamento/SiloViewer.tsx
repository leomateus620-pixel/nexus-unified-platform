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
import { SiloSimulation, SILO, STAGES, type CameraMode, type Scenario } from "./simulation";
import { SiloScene, type SceneOptions, type SceneStatus, type Highlight } from "./SiloScene";
import { IncidentAnalysis, SourcesPanel } from "./IncidentAnalysis";
import { SiloSound } from "./Sound";
import "./silo.css";

const CAMERAS: { id: CameraMode; label: string; short: string }[] = [
  { id: "frontal", label: "Frontal do acidente", short: "Frontal" },
  { id: "top", label: "Vista superior", short: "Superior" },
  { id: "connected", label: "Técnico A — primeira pessoa", short: "Técnico A" },
  { id: "victim", label: "Vítima B — primeira pessoa", short: "Vítima B" },
];
const DETAIL: Record<Exclude<Highlight, null>, { title: string; text: string }> = {
  anchor: {
    title: "Suporte e dispositivo",
    text: "Estrutura independente apoiada nas fundações. Dispositivo de comprimento previamente limitado e meio de retirada preparado. Composição ilustrativa, sem carga ou certificação atribuída.",
  },
  line: {
    title: "Linha de retenção",
    text: "A folga se reduz até o limite geométrico. A conexão limita o deslocamento nesta configuração precoce; não interrompe o fluxo nem realiza resgate automático.",
  },
  harness: {
    title: "Cinturão de corpo inteiro",
    text: "Tiras de ombros, cintura e pernas; conector ligado ao ponto dorsal do corpo. A linha acompanha esse ponto durante a postura. Equipamento representado sem aprovação de uso.",
  },
  gate: {
    title: "Registro de descarga",
    text: "A abertura aciona a vazão, a redistribuição superficial e a perda de apoio. O corte é somente didático: não constitui saída física dos grãos.",
  },
};

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
  const [simulation] = useState(() => new SiloSimulation());
  const snap = useSyncExternalStore(
    simulation.subscribe,
    simulation.getSnapshot,
    simulation.getSnapshot,
  );
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<SiloScene | null>(null),
    sound = useRef<SiloSound | null>(null);
  const [status, setStatus] = useState<SceneStatus>("loading"),
    [message, setMessage] = useState("Preparando a geometria e os técnicos…"),
    [retry, setRetry] = useState(0),
    [fallback, setFallback] = useState(false);
  const [options, setOptions] = useState<SceneOptions>({
      quality: "auto",
      cut: true,
      highlight: null,
    }),
    [panel, setPanel] = useState<"analysis" | "sources" | null>(null),
    [settings, setSettings] = useState(false),
    [audio, setAudio] = useState(false);
  const f = snap.frame,
    internal = snap.camera === "connected" || snap.camera === "victim",
    occluded = internal && f.workers[snap.camera === "connected" ? "A" : "B"].occluded;
  useEffect(() => {
    if (fallback) {
      simulation.setReady(true, "Sequência educativa leve disponível");
      setStatus("ready");
      return;
    }
    simulation.setReady(false);
    setStatus("loading");
    let current: SiloScene | null = null;
    try {
      current = new SiloScene(host.current!, simulation, (state, detail) => {
        setStatus(state);
        setMessage(detail);
      });
      scene.current = current;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(`WebGL indisponível: ${text}`);
      setStatus("error");
      simulation.setReady("error", text);
    }
    return () => {
      current?.dispose();
      scene.current = null;
    };
  }, [simulation, retry, fallback]);
  useEffect(() => {
    scene.current?.setOptions(options);
  }, [options, retry, fallback]);
  useEffect(() => {
    if (!fallback) return;
    let raf = 0,
      last = 0;
    const frame = (now: number) => {
      const state = simulation.getSnapshot();
      if (state.status !== "running") {
        last = 0;
        raf = 0;
        return;
      }
      simulation.advance(last ? (now - last) / 1000 : 1 / 60);
      if (simulation.getSnapshot().status === "running") {
        last = now;
        raf = requestAnimationFrame(frame);
      } else last = raf = 0;
    };
    const unsubscribe = simulation.subscribe(() => {
      if (simulation.getSnapshot().status !== "running") {
        // A hidden tab may never execute its pending RAF. Clear the timestamp
        // at the command boundary so one explicit resume has no stale debt.
        cancelAnimationFrame(raf);
        raf = last = 0;
      } else if (!raf) raf = requestAnimationFrame(frame);
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [fallback, simulation]);
  useEffect(() => {
    const changed = () => {
      if (document.hidden) {
        simulation.pause("O tempo foi pausado porque a aba ficou oculta. Continue para retomar.");
        scene.current?.setVisible(false);
      } else scene.current?.setVisible(true);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && simulation.getSnapshot().camera !== "frontal")
        simulation.setCamera("frontal");
    };
    document.addEventListener("visibilitychange", changed);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("visibilitychange", changed);
      window.removeEventListener("keydown", key);
    };
  }, [simulation]);
  useEffect(() => {
    if (snap.status === "completed") setPanel("analysis");
  }, [snap.status]);
  useEffect(() => {
    sound.current?.update(snap);
  }, [snap]);
  useEffect(() => () => sound.current?.dispose(), []);
  const toggleSound = () => {
    if (sound.current) {
      sound.current.dispose();
      sound.current = null;
      setAudio(false);
    } else {
      try {
        sound.current = new SiloSound();
        sound.current.update(snap);
        setAudio(true);
      } catch {
        setMessage("Áudio indisponível neste navegador.");
      }
    }
  };
  const camera = (id: CameraMode) => {
    setOptions((o) => ({ ...o, highlight: null }));
    simulation.setCamera(id);
    scene.current?.reframeCamera();
  };
  const openPanel = (selected: "analysis" | "sources") => {
    simulation.pause("Leitura educativa: continue após fechar o painel.");
    setPanel(selected);
  };
  const replay = (scenario: Scenario) => {
    simulation.setScenario(scenario);
    simulation.setCamera("frontal");
    simulation.start();
    setPanel(null);
  };
  const play = () =>
    snap.status === "running"
      ? simulation.pause()
      : snap.status === "paused"
        ? simulation.resume()
        : simulation.start();
  const trapped = f.workers.B.depth,
    bodyLevel =
      trapped > 0.0
        ? trapped < 0.5
          ? "Pernas"
          : trapped < 1.1
            ? "Cintura"
            : trapped < 1.6
              ? "Tronco"
              : trapped < 1.8
                ? "Cabeça"
                : "Cobertura completa"
        : "Pés apoiados";
  return (
    <main className="silo-viewer">
      <header className="silo-header">
        <Link to="/mapas-3d/unidades" className="silo-back">
          <ArrowLeft size={17} />
          <span>Biblioteca 3D</span>
        </Link>
        <div className="silo-title">
          <span className="silo-eyebrow">NEXUS / TREINAMENTO DE SEGURANÇA</span>
          <h1>
            Silo de Grãos <span>— Engolfamento</span>
          </h1>
        </div>
        <CommandButton
          className="silo-icon-button"
          onCommand={() => openPanel("sources")}
          title="Fontes e critérios"
          aria-label="Fontes e critérios"
        >
          <BookOpen size={19} />
        </CommandButton>
        <CommandButton
          className="silo-mobile-options silo-icon-button"
          onCommand={() => setSettings((s) => !s)}
          aria-expanded={settings}
          aria-label="Opções da experiência"
        >
          <Settings2 size={19} />
        </CommandButton>
      </header>
      <div className="silo-workspace">
        <section className="silo-stage" aria-label="Simulação 3D de engolfamento">
          <div ref={host} className="silo-canvas-host" aria-busy={status === "loading"} />
          {fallback && (
            <div className="silo-fallback">
              <img
                src="/models/silo-engolfamento/thumbnail.svg"
                alt="Corte esquemático do silo elevado"
              />
              <span className="silo-eyebrow">SEQUÊNCIA EDUCATIVA LEVE · SEM WEBGL</span>
              <h2>{STAGES[f.stage]}</h2>
              <p>
                {snap.scenario === "prevention"
                  ? "Descarga bloqueada, avaliação e planejamento prévios. A entrada permanece impedida."
                  : f.incidentTime === 0
                    ? "Dois técnicos expostos sobre uma superfície aparentemente estável. Condição insegura reconstituída."
                    : `Descarga de ${f.flow.toFixed(2)} m³/s. Aprisionamento de B: ${trapped.toFixed(2)} m. ${f.connection.limited ? "Retenção de A atingiu seu limite. A emergência continua." : "O fluxo reorganiza a massa e retira o apoio dos pés."}`}
              </p>
            </div>
          )}
          {!fallback && status !== "ready" && (
            <div className="silo-load">
              <Box size={30} />
              <h2>
                {status === "loading"
                  ? "Preparando a experiência"
                  : status === "lost"
                    ? "Visualização pausada"
                    : "Recurso indisponível"}
              </h2>
              <p>{message}</p>
              <p className="silo-note">
                {status === "loading"
                  ? "Geometria local · dois técnicos articulados · controlador determinístico"
                  : "O relógio não avança enquanto os recursos essenciais estão indisponíveis."}
              </p>
              <div className="silo-actions">
                <CommandButton
                  onCommand={() => {
                    simulation.pause();
                    setOptions((o) => ({ ...o, quality: "economic" }));
                    setRetry((r) => r + 1);
                  }}
                >
                  Recarregar em qualidade leve
                </CommandButton>
                <CommandButton
                  onCommand={() => {
                    simulation.pause();
                    setFallback(true);
                  }}
                >
                  Sequência educativa leve
                </CommandButton>
              </div>
            </div>
          )}
          <div className="silo-stage-caption">
            <span className="silo-live-dot" />
            <span>
              {snap.scenario === "prevention"
                ? "PREVENÇÃO · ENTRADA IMPEDIDA"
                : "RECONSTITUIÇÃO DE CONDIÇÃO INSEGURA"}
            </span>
            <span>
              {fallback
                ? "SEQUÊNCIA"
                : internal
                  ? f.entryBlocked
                    ? "PRIMEIRA PESSOA · EXTERIOR"
                    : "AMBIENTE INTERNO FECHADO"
                  : options.cut
                    ? "CORTE DIDÁTICO"
                    : "SILO COMPLETO"}
            </span>
          </div>
          {occluded && !fallback && <div className="silo-occlusion" aria-hidden="true" />}
          {internal && (
            <CommandButton className="silo-exit-camera" onCommand={() => camera("frontal")}>
              <ExternalLink size={16} />
              Sair da primeira pessoa
            </CommandButton>
          )}
          <div className="silo-hud" aria-label="Indicadores simulados da vítima B">
            <span className="silo-eyebrow">TÉCNICO B · INDICADORES SIMULADOS</span>
            <div className="silo-hud-values">
              <div>
                <span>Desde a descarga</span>
                <strong>
                  {f.incidentTime.toFixed(1)}
                  <small> s</small>
                </strong>
              </div>
              <div>
                <span>FC ilustrativa</span>
                <strong>
                  {snap.vitals.heartRate ?? "—"}
                  <small> bpm</small>
                </strong>
              </div>
              <div>
                <span>SpO₂</span>
                <strong>
                  —<small> %</small>
                </strong>
              </div>
            </div>
            <p>
              {bodyLevel} <span>· {trapped.toFixed(2)} m</span>
            </p>
            <p className="silo-hud-ventilation">{snap.vitals.ventilation}</p>
            <small>Indicadores simulados — representação educativa</small>
          </div>
          <div className="silo-legend">
            <span>
              <i className="silo-a" />A · {f.connection.connected ? "Conectado" : "Sem conexão"}
            </span>
            <span>
              <i className="silo-b" />B · Sem conexão
            </span>
          </div>
          {options.highlight && (
            <div className="silo-annotation">
              <CommandButton
                onCommand={() => setOptions((o) => ({ ...o, highlight: null }))}
                aria-label="Fechar destaque técnico"
              >
                ×
              </CommandButton>
              <strong>{DETAIL[options.highlight].title}</strong>
              <p>{DETAIL[options.highlight].text}</p>
            </div>
          )}
          <div className="silo-camera-bar" aria-label="Perspectivas de câmera">
            {CAMERAS.map((c, index) => (
              <CommandButton
                key={c.id}
                title={c.label}
                aria-label={c.label}
                aria-pressed={snap.camera === c.id}
                onCommand={() => camera(c.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {c.short}
              </CommandButton>
            ))}
          </div>
        </section>
        <aside
          className={`silo-sidebar ${settings ? "is-open" : ""}`}
          aria-label="Opções e leitura técnica"
        >
          <div className="silo-panel-intro">
            <span className="silo-eyebrow">MECANISMO DO ACIDENTE</span>
            <h2>{STAGES[f.stage]}</h2>
            <p>
              {snap.scenario === "prevention"
                ? "A entrada só seria considerada após eliminar os riscos e cumprir os controles aplicáveis."
                : "A descarga retira o apoio. A massa granular aprisiona os membros e progride em relação ao corpo."}
            </p>
          </div>
          <div className="silo-event-readout" aria-live="polite">
            <span className="silo-eyebrow">REGISTRO DIDÁTICO</span>
            <p>{snap.events.at(-1)?.label}</p>
          </div>
          <label className="silo-field">
            Comparação controlada
            <select
              aria-label="Comparação controlada"
              value={snap.scenario}
              onChange={(e) => simulation.setScenario(e.target.value as Scenario)}
            >
              <option value="comparison">A com retenção · B sem conexão</option>
              <option value="no-connection">Mesma trajetória de A sem conexão</option>
              <option value="prevention">Replay preventivo · entrada impedida</option>
            </select>
          </label>
          <div className="silo-data-pair">
            <span>Descarga</span>
            <strong>{f.flow.toFixed(2)} m³/s</strong>
            <span>Volume restante</span>
            <strong>{f.volume.toFixed(1)} m³</strong>
            <span>Nível médio</span>
            <strong>{f.surfaceHeight.toFixed(2)} m</strong>
            <span>Conexão de A</span>
            <strong>
              {!f.connection.connected
                ? "Desconectada"
                : f.connection.limited
                  ? "Em retenção"
                  : "Folga disponível"}
            </strong>
          </div>
          <div className="silo-section-label">
            <Layers size={15} />
            <span>INSPEÇÃO TÉCNICA</span>
          </div>
          <div className="silo-inspect">
            {(["anchor", "line", "harness", "gate"] as const).map((id) => (
              <CommandButton
                key={id}
                aria-pressed={options.highlight === id}
                onCommand={() => {
                  camera("frontal");
                  setOptions((o) => ({ ...o, cut: true, highlight: id }));
                }}
              >
                {id === "anchor"
                  ? "Ancoragem"
                  : id === "line"
                    ? "Linha"
                    : id === "harness"
                      ? "Cinturão"
                      : "Registro"}
              </CommandButton>
            ))}
          </div>
          <label className="silo-check">
            <input
              type="checkbox"
              checked={options.cut}
              onChange={(e) => setOptions((o) => ({ ...o, cut: e.target.checked }))}
            />
            <span>Corte didático de 180°</span>
          </label>
          <label className="silo-field">
            Qualidade gráfica
            <select
              aria-label="Qualidade gráfica"
              value={options.quality}
              onChange={(e) =>
                setOptions((o) => ({ ...o, quality: e.target.value as SceneOptions["quality"] }))
              }
            >
              <option value="auto">Automática · por medição</option>
              <option value="economic">Econômica</option>
              <option value="balanced">Equilibrada</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <CommandButton className="silo-sound" onCommand={toggleSound} aria-pressed={audio}>
            {audio ? <Volume2 size={16} /> : <VolumeX size={16} />}Som de escoamento ·{" "}
            {audio ? "ligado" : "desligado"}
          </CommandButton>
          <div className="silo-safety">
            <ShieldCheck size={20} />
            <div>
              <strong>Retenção não elimina a emergência</strong>
              <p>
                Interromper o fluxo e planejar a retirada são indispensáveis. Nunca entrar para
                puxar a vítima.
              </p>
            </div>
          </div>
          <CommandButton className="silo-analysis-button" onCommand={() => openPanel("analysis")}>
            Análise, prevenção e dados <ArrowLeft className="silo-arrow" size={16} />
          </CommandButton>
          <p className="silo-note">
            Soja seca · dimensões e tempos ilustrativos. Sem validação física, médica ou de
            capacidade de ancoragem.
          </p>
        </aside>
      </div>
      <footer className="silo-transport">
        <div className="silo-transport-actions">
          <CommandButton className="silo-primary" onCommand={play} disabled={status !== "ready"}>
            {snap.status === "running" ? <Pause size={18} /> : <Play size={18} />}
            <span>
              {snap.status === "running"
                ? "Pausar"
                : snap.status === "paused"
                  ? "Continuar"
                  : snap.status === "completed"
                    ? "Repetir"
                    : "Iniciar"}
            </span>
          </CommandButton>
          <CommandButton onCommand={() => simulation.reset()} aria-label="Reiniciar simulação">
            <RotateCcw size={18} />
          </CommandButton>
        </div>
        <label className="silo-timeline">
          <span>
            <b>{f.time.toFixed(1)} s</b> / {SILO.duration} s <small>{STAGES[f.stage]}</small>
          </span>
          <input
            aria-label="Instante da simulação"
            type="range"
            min="0"
            max={SILO.duration}
            step=".1"
            value={f.time}
            onChange={(e) => simulation.seek(Number(e.target.value))}
          />
        </label>
        <label className="silo-rate">
          <span>Reprodução</span>
          <select
            aria-label="Velocidade de reprodução"
            value={snap.playbackRate}
            onChange={(e) => simulation.setPlaybackRate(Number(e.target.value))}
          >
            <option value="1">1× · normal</option>
            <option value=".5">0,5× · câmera lenta</option>
            <option value=".25">0,25× · câmera lenta</option>
          </select>
        </label>
      </footer>
      {snap.reason && snap.status === "paused" && (
        <div className="silo-reason" role="status">
          {snap.reason}
        </div>
      )}
      <div className="silo-training-note">
        <Eye size={14} />
        <span>
          {internal
            ? "Arraste a cena ou use as setas para olhar. Escape retorna à vista externa."
            : "Arraste para orbitar · role ou use dois dedos para aproximar · timeline restaura o estado completo."}{" "}
          {snap.vitals.note}
        </span>
      </div>
      {panel && (
        <Modal
          title={panel === "analysis" ? "Análise do incidente e prevenção" : "Fontes e critérios"}
          onClose={() => setPanel(null)}
        >
          {panel === "analysis" ? (
            <IncidentAnalysis onReplayPrevention={() => replay("prevention")} />
          ) : (
            <SourcesPanel />
          )}
        </Modal>
      )}
    </main>
  );
}
