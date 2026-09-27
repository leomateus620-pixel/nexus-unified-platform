import * as Dialog from "@radix-ui/react-dialog";
import { useId, useState, type ReactNode } from "react";

import { ActionButton } from "./Page";
import "./stages.css";

/** A presentation-only band: callers supply already formatted, existing results. */
export function ValuesBand({
  items,
  total,
  pending = false,
  children,
}: {
  items: { label: string; value: string; hint?: string }[];
  total: string;
  pending?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="nx-values-band" aria-label="Investimento da revisão">
      <div className="nx-values-main">
        <dl className="nx-values-parts">
          {items.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>
                {item.value}
                {item.hint && <span className="nx-value-hint">{item.hint}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <dl className="nx-values-total">
          <dt>{pending ? "Último total calculado" : "Total final"}</dt>
          <dd>
            {total}
            <span className="nx-value-hint">
              {pending ? "Cálculo pendente de atualização" : "Resultado registrado no servidor"}
            </span>
          </dd>
        </dl>
      </div>
      {children && <div className="nx-values-internal">{children}</div>}
    </section>
  );
}

export function RecordIdentity({
  primary,
  secondary,
  code,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  code?: boolean;
}) {
  return (
    <div className="nx-record-identity">
      <span className={code ? "nx-record-code" : "nx-record-primary"}>{primary}</span>
      {secondary && <span className="nx-record-secondary">{secondary}</span>}
    </div>
  );
}

/** Same string/null handoff as prompt; validation and persistence remain with the caller. */
export function PromptAction({
  children,
  title,
  description,
  label,
  onAnswer,
  loading = false,
  inputMode,
}: {
  children: ReactNode;
  title: string;
  description: string;
  label: string;
  onAnswer: (value: string | null) => void;
  loading?: boolean;
  inputMode?: "decimal";
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputId = useId();

  function close() {
    setOpen(false);
    onAnswer(null);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue("");
          setOpen(true);
        } else close();
      }}
    >
      <Dialog.Trigger asChild>
        <ActionButton variant="ghost" loading={loading}>
          {children}
        </ActionButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="nx-prompt-overlay" />
        <Dialog.Content className="nexus-operational nx-prompt-dialog">
          <Dialog.Title className="nx-prompt-title">{title}</Dialog.Title>
          <Dialog.Description className="nx-prompt-description">{description}</Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setOpen(false);
              onAnswer(value);
            }}
          >
            <label htmlFor={inputId}>{label}</label>
            <input
              id={inputId}
              inputMode={inputMode}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            <div className="nx-prompt-actions">
              <ActionButton variant="ghost" onClick={close}>
                Cancelar
              </ActionButton>
              <ActionButton type="submit">Confirmar</ActionButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
