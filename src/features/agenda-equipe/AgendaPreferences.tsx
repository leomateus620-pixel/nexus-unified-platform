import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ActionButton } from "@/components/nexus/Page";
import { OperationalDialog, fieldClass } from "@/features/operacao/components";
import type { ConfiguracaoAgenda, ComandoBody } from "./types";
export function AgendaPreferences({
  initial,
  busy,
  onClose,
  onCommand,
}: {
  initial: ConfiguracaoAgenda["preferencias"];
  busy: boolean;
  onClose: () => void;
  onCommand: (body: ComandoBody) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initial),
    [error, setError] = useState("");
  const active = useRef(true);
  const initialValue = useRef(initial);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <OperationalDialog
      title="Notificações da agenda"
      open
      onOpenChange={(open) => {
        if (!open) {
          active.current = false;
          onClose();
        }
      }}
    >
      <form
        className="grid gap-4"
        aria-busy={busy}
        data-dirty={
          JSON.stringify(value) !== JSON.stringify(initialValue.current) ? "true" : "false"
        }
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (
            !Number.isInteger(value.antecedencia_minutos) ||
            value.antecedencia_minutos < 0 ||
            value.antecedencia_minutos > 10080
          ) {
            setError("Informe uma antecedência entre 0 e 10.080 minutos.");
            return;
          }
          const ok = await onCommand({ comando: "preferencias", dados: value });
          if (ok && active.current) onClose();
          else if (active.current)
            setError("As preferências não foram confirmadas. Seu preenchimento foi preservado.");
        }}
      >
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.notificar}
            onChange={(e) => setValue({ ...value, notificar: e.target.checked })}
          />
          Receber notificações internas
        </label>
        <label className="grid gap-1 text-sm">
          Antecedência do lembrete (minutos)
          <input
            className={fieldClass}
            type="number"
            min={0}
            max={10080}
            value={value.antecedencia_minutos}
            onChange={(e) =>
              setValue({
                ...value,
                antecedencia_minutos: e.target.valueAsNumber,
              })
            }
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.notificar_atrasos}
            onChange={(e) => setValue({ ...value, notificar_atrasos: e.target.checked })}
          />
          Avisar sobre atividades atrasadas
        </label>
        <p className="text-sm text-muted-foreground">
          Os lembretes são processados no servidor e ficam disponíveis nesta aplicação, inclusive
          quando o navegador está fechado.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Dialog.Close asChild>
            <ActionButton variant="ghost" disabled={busy}>
              Voltar
            </ActionButton>
          </Dialog.Close>
          <ActionButton type="submit" loading={busy}>
            Salvar preferências
          </ActionButton>
        </div>
      </form>
    </OperationalDialog>
  );
}
