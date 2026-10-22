import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { ActionButton } from "@/components/nexus/Page";
import { useBlocker } from "@tanstack/react-router";

export const fieldClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";
export function useCommandKey() {
  const last = useRef({ payload: "", key: "" });
  return (payload: unknown) => {
    const next = JSON.stringify(payload);
    if (last.current.payload !== next || !last.current.key)
      last.current = { payload: next, key: crypto.randomUUID() };
    return last.current.key;
  };
}
export function OperationalDialog({
  title,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [discard, setDiscard] = useState(false);
  const pending = () =>
    !!content.current?.querySelector('form[data-dirty="true"], form[aria-busy="true"]');
  const blocker = useBlocker({
    withResolver: true,
    shouldBlockFn: () => open && pending(),
    enableBeforeUnload: () => open && pending(),
  });
  const requestChange = (value: boolean) => {
    if (!value && content.current?.querySelector('form[aria-busy="true"]')) return;
    if (!value && content.current?.querySelector('form[data-dirty="true"]')) {
      setDiscard(true);
      return;
    }
    setDiscard(false);
    onOpenChange(value);
  };
  return (
    <Dialog.Root open={open} onOpenChange={requestChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          ref={content}
          onOpenAutoFocus={(event) => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const firstField = content.current?.querySelector<HTMLElement>(
              'input:not([type="hidden"]),select,textarea',
            );
            if (firstField) {
              event.preventDefault();
              firstField.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
          }}
          aria-describedby={undefined}
          className="nexus-operational nx-operational-dialog fixed inset-x-3 top-[5dvh] z-50 mx-auto max-h-[90dvh] w-auto max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-5 text-foreground shadow-xl sm:inset-x-6"
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Fechar formulário"
              className="flex min-h-11 min-w-11 items-center justify-center rounded border border-border"
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          {(discard || blocker.status === "blocked") && (
            <div role="alert" className="mb-4 space-y-3 rounded border border-warning p-3 text-sm">
              <p>Há alterações não salvas em “{title}”. Fechar descarta este preenchimento.</p>
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  variant="ghost"
                  onClick={() => {
                    setDiscard(false);
                    blocker.reset?.();
                  }}
                >
                  Continuar editando
                </ActionButton>
                <ActionButton
                  variant="danger"
                  onClick={() => {
                    setDiscard(false);
                    if (blocker.status === "blocked") blocker.proceed?.();
                    else onOpenChange(false);
                  }}
                >
                  Descartar alterações
                </ActionButton>
              </div>
            </div>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-4 text-sm">
      <span role="status">
        {total} {total === 1 ? "registro" : "registros"} · página {page + 1}
      </span>
      <div className="flex gap-2">
        <ActionButton variant="ghost" disabled={page === 0} onClick={() => onChange(page - 1)}>
          Anterior
        </ActionButton>
        <ActionButton
          variant="ghost"
          disabled={(page + 1) * 25 >= total}
          onClick={() => onChange(page + 1)}
        >
          Próxima
        </ActionButton>
      </div>
    </div>
  );
}
