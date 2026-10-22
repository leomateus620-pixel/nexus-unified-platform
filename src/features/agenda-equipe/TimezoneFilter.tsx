import { useEffect, useId, useState } from "react";
import { ActionButton } from "@/components/nexus/Page";
import { fieldClass } from "@/features/operacao/components";
import { supportsTimezone } from "./calendar-domain";
export function TimezoneFilter({
  value,
  onApply,
}: {
  value: string;
  onApply: (timezone: string) => void;
}) {
  const [draft, setDraft] = useState(value),
    [error, setError] = useState("");
  const id = useId();
  useEffect(() => {
    setDraft(value);
    setError("");
  }, [value]);
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm">
        Fuso de exibição
        <input
          className={fieldClass}
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? id : undefined}
        />
      </label>
      {error && (
        <p id={id} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ActionButton
        variant="ghost"
        onClick={() => {
          const zone = draft.trim();
          if (!supportsTimezone(zone)) {
            setError(
              "Este navegador não oferece o fuso informado. Escolha um fuso IANA compatível, como America/Sao_Paulo.",
            );
            return;
          }
          setError("");
          onApply(zone);
        }}
      >
        Aplicar fuso de exibição
      </ActionButton>
      <p className="text-xs text-muted-foreground">
        A escolha muda a consulta e a exibição. O período original dos compromissos permanece
        preservado.
      </p>
    </div>
  );
}
