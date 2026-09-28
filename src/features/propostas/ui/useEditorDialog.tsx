import { useEffect, useId, useRef, useState } from "react";
import { ActionButton } from "@/components/nexus/Page";

type Question = {
  title: string;
  description?: string;
  label?: string;
  initial?: string;
  required?: boolean;
  reason?: boolean;
};
type Answer = { value: string; reason: string } | null;

/** Native dialog can be nested above the contextual sheet; cancellation never writes. */
export function useEditorDialog() {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState<Question | null>(null);
  const resolve = useRef<(answer: Answer) => void>(() => {});
  const origin = useRef<HTMLElement | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (question) ref.current?.showModal();
  }, [question]);
  function finish(answer: Answer) {
    ref.current?.close();
    setQuestion(null);
    resolve.current(answer);
    origin.current?.focus({ preventScroll: true });
  }
  function ask(options: Question): Promise<Answer> {
    origin.current = document.activeElement as HTMLElement;
    setQuestion(options);
    setInputValue(options.initial ?? "");
    setError("");
    return new Promise((done) => {
      resolve.current = done;
    });
  }
  const dialog = question && (
    <dialog
      ref={ref}
      className="nx-confirm-dialog"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        finish(null);
      }}
    >
      <h2 id={id}>{question.title}</h2>
      <p>{question.description}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (
            question.reason &&
            (!question.label || inputValue.trim()) &&
            String(data.get("reason") ?? "").trim().length < 3
          ) {
            setError("Informe uma justificativa com pelo menos 3 caracteres.");
            return;
          }
          finish({
            value: String(data.get("value") ?? ""),
            reason: String(data.get("reason") ?? "").trim(),
          });
        }}
      >
        {question.label && (
          <label>
            {question.label}
            <input
              autoFocus
              name="value"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              required={question.required}
            />
          </label>
        )}
        {question.reason && (
          <label>
            Justificativa
            <input
              name="reason"
              required={!question.label || !!inputValue.trim()}
              minLength={inputValue.trim() || !question.label ? 3 : undefined}
              maxLength={500}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="nx-editor-error">
            {error}
          </p>
        )}
        <div className="nx-object-actions">
          <ActionButton variant="ghost" onClick={() => finish(null)}>
            Cancelar
          </ActionButton>
          <ActionButton type="submit">Confirmar</ActionButton>
        </div>
      </form>
    </dialog>
  );
  return { ask, dialog };
}
