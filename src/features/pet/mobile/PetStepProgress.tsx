import { useEffect, useId, useRef, useState } from "react";
import { Check, ListChecks, X } from "lucide-react";

/** Compact "3 de 6 · Segurança" progress + full step list (Concluída / Atual / Pendente). */
export function PetStepProgress({
  steps,
  current,
  canEnter,
  onGo,
  disabled,
}: {
  steps: readonly string[];
  current: number;
  canEnter: (i: number) => boolean;
  onGo: (i: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>("[aria-current]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);
  return (
    <div className="pet-progress">
      <div className="pet-progress-line">
        <span className="pet-progress-text" aria-live="polite">
          <strong>
            {current + 1} de {steps.length}
          </strong>{" "}
          · {steps[current]}
        </span>
        <button
          ref={btn}
          type="button"
          className="pet-progress-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          <ListChecks size={16} aria-hidden /> Ver etapas
        </button>
      </div>
      <div className="pet-progress-bar" aria-hidden>
        <span style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
      </div>
      {open && (
        <div className="pet-progress-sheet" id={id} ref={list} role="dialog" aria-label="Etapas da PET">
          <div className="pet-progress-sheet-head">
            <strong>Etapas da PET</strong>
            <button
              type="button"
              aria-label="Fechar lista de etapas"
              onClick={() => {
                setOpen(false);
                btn.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          <ol>
            {steps.map((label, i) => {
              const state = i < current ? "Concluída" : i === current ? "Atual" : "Pendente";
              return (
                <li key={label}>
                  <button
                    type="button"
                    disabled={disabled || !canEnter(i)}
                    aria-current={i === current ? "step" : undefined}
                    data-state={state}
                    onClick={() => {
                      setOpen(false);
                      onGo(i);
                    }}
                  >
                    <span className="pet-progress-num">{i < current ? <Check size={14} /> : i + 1}</span>
                    <span>{label}</span>
                    <small>{state}</small>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
