import { useState } from "react";
import { ActionButton } from "@/components/nexus/Page";
import type { NrQrPlace } from "./qr-plates";

export function NrQrPlates({
  client,
  unit,
  places,
}: {
  client: string;
  unit: string;
  places: NrQrPlace[];
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const { nrQrPlates } = await import("./qr-plates");
      const bytes = await nrQrPlates(
        window.location.origin,
        client,
        unit,
        places.filter((p) => selected.includes(p.id)),
      );
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "nexus-identificacao-qr-a4.pdf";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar as placas.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="nx-pet-panel">
      <summary>Identificação QR · quatro placas por A4</summary>
      <p className="nx-pet-hint">
        Aponte para a ficha autenticada do local. Imprima a partir do endereço definitivo do Nexus.
        Estas etiquetas complementam a identificação e não substituem a sinalização de segurança.
      </p>
      <div className="max-h-64 overflow-auto grid gap-2 my-3">
        {places.map((p) => (
          <label key={p.id} className="flex items-center gap-2 min-h-11">
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={(e) =>
                setSelected((old) =>
                  e.target.checked ? [...old, p.id] : old.filter((id) => id !== p.id),
                )
              }
            />
            {p.tag} · {p.titulo}
          </label>
        ))}
      </div>
      <ActionButton disabled={busy || !selected.length} onClick={download}>
        {busy ? "Gerando…" : `Gerar PDF (${selected.length})`}
      </ActionButton>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
