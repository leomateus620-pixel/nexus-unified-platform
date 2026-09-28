import { LockKeyhole, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

import "./editors.css";

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
  const [wide, setWide] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const workspace = dialog.current?.closest<HTMLElement>(".nx-editor-workspace");
    if (!workspace) return;
    const observer = new ResizeObserver(([entry]) => {
      const side = (entry?.contentRect.width ?? 0) >= 920;
      workspace.dataset["sideEditor"] = String(side && open);
      setWide(side);
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [open]);
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
      const scrollY = window.scrollY;
      if (wide) element.show();
      else element.showModal();
      if (resizing && active) active.focus({ preventScroll: true });
      else heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollY, behavior: "instant" });
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
      data-inline={wide}
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

/** Global synchronization is announced once by the proposal header. */
export function EditorSaveState({ editavel }: { editavel: boolean }) {
  if (editavel) return null;
  return (
    <p className="nx-editor-save">
      <LockKeyhole size={15} aria-hidden="true" />
      Revisão somente leitura
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
