import { AlertCircle, Check, Info, LoaderCircle, LockKeyhole, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

import { useSave } from "../hooks";
import "./editors.css";

const inspectorQuery = "(min-width: 1600px)";
const subscribeWide = (notify: () => void) => {
  const query = window.matchMedia(inspectorQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/** Native dialog keeps one mounted editor when switching between inline and modal display. */
export function EditorInspector({
  open,
  title,
  description,
  onClose,
  returnFocus,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(inspectorQuery).matches,
    () => false,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const previousMode = useRef<boolean | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!open) {
      if (element.open) {
        element.close();
        returnFocus.current?.focus({ preventScroll: true });
      }
      previousMode.current = null;
      return;
    }
    const active = element.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null;
    const resizing = element.open;
    if (element.open && previousMode.current !== wide) {
      element.dataset["modeChanging"] = "true";
      element.close();
    }
    if (!element.open) {
      if (wide) element.show();
      else element.showModal();
      if (resizing && active) active.focus({ preventScroll: true });
      else heading.current?.focus({ preventScroll: true });
    }
    delete element.dataset["modeChanging"];
    previousMode.current = wide;
  }, [open, wide, returnFocus]);
  const close = () => {
    // Leaving an edited field must retain its existing onBlur save semantics, including Escape.
    if (dialog.current?.contains(document.activeElement))
      (document.activeElement as HTMLElement)?.blur();
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="nx-editor-inspector"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal={!wide && open ? true : undefined}
      onKeyDown={(event) => {
        if (wide && event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="nx-inspector-heading">
        <div>
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <button
          type="button"
          className="nx-editor-icon"
          aria-label={`Fechar ${title.toLowerCase()}`}
          onClick={close}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="nx-inspector-content">{children}</div>
    </dialog>
  );
}

/** Visual context for the shared live save status, avoiding duplicate screen-reader announcements. */
export function EditorSaveState({ editavel }: { editavel: boolean }) {
  const save = useSave();
  const state = save.status;
  const labels = {
    idle: "Campos salvos ao sair; seleções aplicadas ao alterar.",
    salvando: "Salvando / recalculando…",
    salvo: "Última gravação confirmada no servidor",
    erro: "Falha ao salvar",
    conflito: "Conflito de edição",
  };
  const Icon =
    state === "erro" || state === "conflito"
      ? AlertCircle
      : state === "salvando"
        ? LoaderCircle
        : state === "salvo"
          ? Check
          : Info;
  if (!editavel)
    return (
      <p className="nx-editor-save">
        <LockKeyhole size={15} aria-hidden="true" />
        Revisão somente leitura
      </p>
    );
  return (
    <p className="nx-editor-save" data-state={state}>
      <Icon size={15} aria-hidden="true" />
      <span>
        {labels[state]}
        {save.msg ? ` · ${save.msg}` : ""}
      </span>
    </p>
  );
}

/** Draft feedback is local to a field; every original blur callback remains unchanged. */
export function EditorInput({ onBlur, onInput, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [dirty, setDirty] = useState(false);
  return (
    <span className="nx-editor-draft" data-dirty={dirty}>
      <input
        {...props}
        onInput={(event) => {
          setDirty(event.currentTarget.value !== String(props.defaultValue ?? ""));
          onInput?.(event);
        }}
        onBlur={(event) => {
          if (event.currentTarget.closest("dialog")?.dataset["modeChanging"] === "true") return;
          setDirty(false);
          onBlur?.(event);
        }}
      />
      <span className="nx-editor-draft-state" aria-live="polite">
        {dirty ? "Edição local" : ""}
      </span>
    </span>
  );
}
