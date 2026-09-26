import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Pause,
  Play,
  RotateCcw,
  Square,
  Users,
  PersonStanding,
} from "lucide-react";
import { LC02Simulation, type ScenarioCount } from "./lc02-simulation";

export function PeoplePanel({
  simulation,
  onStart,
  viewport,
}: {
  simulation: LC02Simulation;
  onStart: (count: ScenarioCount) => void;
  viewport: RefObject<HTMLDivElement | null>;
}) {
  const [options, setOptions] = useState(false);
  const state = useSyncExternalStore(
    simulation.subscribe,
    simulation.getSnapshot,
    simulation.getSnapshot,
  );
  useEffect(() => {
    const keys = new Set<string>();
    const clear = () => {
      keys.clear();
      simulation.drive = 0;
    };
    const key = (event: KeyboardEvent) => {
      if (event.type === "keyup") keys.delete(event.code);
      const target = event.target as HTMLElement;
      const usable =
        simulation.getSnapshot().mode === "manual" &&
        simulation.getSnapshot().status === "running" &&
        !target.closest("input,select,textarea,[contenteditable=true]");
      if (!usable) {
        clear();
        return;
      }
      if (!["KeyW", "ArrowUp", "KeyS", "ArrowDown"].includes(event.code)) return;
      event.preventDefault();
      if (event.type === "keydown") keys.add(event.code);
      simulation.drive =
        (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
        (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    };
    const visibility = () => {
      if (document.hidden) {
        clear();
        simulation.pause("Aba ocultada. Continue quando estiver pronto.");
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clear();
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [simulation]);
  const active = state.count > 0;
  return (
    <section
      className={`lc-people${active ? " is-active" : ""}${state.mode === "manual" ? " is-manual" : ""}${options ? " is-options" : ""}`}
      aria-label="Simulação de pessoas"
    >
      <div className="lc-people-top">
        <div className="lc-people-title">
          <Users size={16} />
          <span>
            TESTAR CIRCULAÇÃO<small>Entrada em fila</small>
          </span>
        </div>
        <div className="lc-people-counts" role="group" aria-label="Quantidade de pessoas">
          {([1, 5, 10] as const).map((count) => (
            <button
              key={count}
              aria-label={`Iniciar teste com ${count} ${count === 1 ? "pessoa" : "pessoas"}`}
              aria-pressed={state.count === count}
              onClick={() => onStart(count)}
            >
              {count}
            </button>
          ))}
        </div>
        {active && (
          <button
            className="lc-people-more"
            aria-label="Opções das pessoas"
            aria-expanded={options}
            onClick={() => setOptions(!options)}
          >
            ···
          </button>
        )}
      </div>
      {active && (
        <>
          <div className="lc-people-progress" aria-label="Progresso da circulação">
            <span>
              <b>{state.waiting}</b> em espera
            </span>
            <span>
              <b>{state.walking}</b> no percurso
            </span>
            <span>
              <b>{state.entered}</b> entraram
            </span>
          </div>
          <div className="lc-people-actions">
            {state.status !== "completed" && (
              <button
                disabled={state.asset !== "ready"}
                onClick={() =>
                  state.status === "paused" ? simulation.resume() : simulation.pause()
                }
              >
                {state.status === "paused" ? <Play size={13} /> : <Pause size={13} />}
                {state.status === "paused" ? "Continuar" : "Pausar"}
              </button>
            )}
            <button onClick={() => onStart(state.count as ScenarioCount)}>
              <RotateCcw size={13} />
              Reiniciar
            </button>
            <button onClick={() => simulation.stop()}>
              <Square size={12} />
              Encerrar
            </button>
          </div>
          <div className="lc-people-camera" role="group" aria-label="Câmera das pessoas">
            <button aria-pressed={state.mode === "wide"} onClick={() => simulation.mode("wide")}>
              <Eye size={13} />
              Visão geral
            </button>
            <button
              aria-pressed={state.mode === "follow"}
              disabled={!state.activeIds.includes(state.selected)}
              onClick={() => simulation.mode("follow")}
            >
              Acompanhar
            </button>
            <button
              aria-pressed={state.mode === "manual"}
              disabled={!state.activeIds.includes(state.selected)}
              onClick={() => simulation.mode("manual")}
            >
              <PersonStanding size={13} />
              Controlar
            </button>
          </div>
          {state.walking > 0 && (
            <label className="lc-person-select">
              Pessoa em destaque
              <select
                aria-label="Pessoa em destaque"
                value={state.activeIds.includes(state.selected) ? state.selected : ""}
                onChange={(e) => simulation.select(Number(e.target.value))}
              >
                {!state.activeIds.includes(state.selected) && (
                  <option value="" disabled>
                    Selecione uma pessoa
                  </option>
                )}
                {state.activeIds.map((id) => (
                  <option key={id} value={id}>
                    Trabalhador {String(id + 1).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {state.mode === "manual" &&
            viewport.current &&
            createPortal(
              <div className="lc-person-drive">
                <p>
                  <b>Você conduz a subida</b>
                  <span>W / ↑ avança · S / ↓ recua · solte para parar</span>
                </p>
                {([-1, 1] as const).map((direction) => (
                  <button
                    key={direction}
                    aria-label={direction === 1 ? "Avançar personagem" : "Recuar personagem"}
                    disabled={state.status !== "running"}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      simulation.drive = direction;
                    }}
                    onPointerUp={() => {
                      simulation.drive = 0;
                    }}
                    onPointerCancel={() => {
                      simulation.drive = 0;
                    }}
                    onLostPointerCapture={() => {
                      simulation.drive = 0;
                    }}
                  >
                    {direction === 1 ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
                  </button>
                ))}
              </div>,
              viewport.current,
            )}
          <div className="lc-people-message" role="status">
            {state.asset === "error" ? (
              <>
                <span>Não foi possível carregar as pessoas.</span>
                <button onClick={() => simulation.retry()}>Tentar novamente</button>
              </>
            ) : state.asset === "loading" ? (
              "Preparando personagens…"
            ) : state.status === "completed" ? (
              `${state.entered} ${state.entered === 1 ? "pessoa entrou" : "pessoas entraram"} pela porta.`
            ) : (
              state.reason ||
              (state.status === "paused" ? "Simulação pausada." : "Percurso até a porta +6,00 m")
            )}
          </div>
        </>
      )}
      <div className="lc-people-note">Simulação visual · parâmetros ilustrativos</div>
    </section>
  );
}
