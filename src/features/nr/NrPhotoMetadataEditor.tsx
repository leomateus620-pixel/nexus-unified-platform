import { useRef } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { editPhotoMetadata, photoEntries, readPhotoEdit } from "./photo-metadata";
import { photoOccurrences } from "./technical-evidence";

/** Controlled by the existing record/survey editor: its save, discard and audit remain canonical. */
export function NrPhotoMetadataEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const identities = useRef(new Map<string, string>());
  const entries = photoEntries(value);
  const photos = photoOccurrences(value);
  const ordered = entries
    .map(([key, entry], index) => {
      const edit = readPhotoEdit(entry);
      let id = edit?.ocorrencia_id ?? identities.current.get(key);
      if (!id) {
        id = crypto.randomUUID();
        identities.current.set(key, id);
      }
      return { key, id, order: edit?.ordem ?? index };
    })
    .sort((a, b) => a.order - b.order);
  const move = (button: HTMLButtonElement, key: string, step: -1 | 1) => {
    onChange(editPhotoMetadata(value, key, { move: step }, identities.current));
    requestAnimationFrame(() => {
      if (!button.isConnected) return;
      const next = button.disabled
        ? button.closest("section")?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        : button;
      next?.focus({ preventScroll: true });
    });
  };
  if (!ordered.length) return null;
  return (
    <fieldset className="nr-wide nr-survey-field" disabled={disabled}>
      <legend>Legendas e ordem das fotos</legend>
      <p className="nr-muted">
        As alterações serão gravadas ao salvar este registro. A autoria histórica e as referências
        da origem são preservadas.
      </p>
      {ordered.map((entry, position) => {
        const photo = photos[position]!;
        return (
          <section className="nr-survey-row" key={entry.id} data-photo-occurrence={entry.id}>
            <div className="nr-panel-header">
              <strong>Foto {position + 1}</strong>
              <div className="nr-actions">
                <ActionButton
                  variant="ghost"
                  disabled={disabled || position === 0}
                  aria-label={`Mover foto ${position + 1} para cima`}
                  onClick={(event) => move(event.currentTarget, entry.key, -1)}
                >
                  <ArrowUp size={15} aria-hidden /> Subir
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  disabled={disabled || position === ordered.length - 1}
                  aria-label={`Mover foto ${position + 1} para baixo`}
                  onClick={(event) => move(event.currentTarget, entry.key, 1)}
                >
                  <ArrowDown size={15} aria-hidden /> Descer
                </ActionButton>
              </div>
            </div>
            <div className="nr-field-grid">
              <label>
                Legenda da foto {position + 1}
                <textarea
                  aria-label={`Legenda da foto ${position + 1}`}
                  rows={3}
                  value={photo.caption}
                  onChange={(event) =>
                    onChange(
                      editPhotoMetadata(
                        value,
                        entry.key,
                        { legenda: event.target.value },
                        identities.current,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Categoria da foto {position + 1}
                <input
                  aria-label={`Categoria da foto ${position + 1}`}
                  aria-describedby={`photo-category-help-${entry.id}`}
                  value={photo.category}
                  onChange={(event) =>
                    onChange(
                      editPhotoMetadata(
                        value,
                        entry.key,
                        { categoria: event.target.value },
                        identities.current,
                      ),
                    )
                  }
                />
                <small className="nr-muted" id={`photo-category-help-${entry.id}`}>
                  Opcional. Não altera o arquivo nem sua associação.
                </small>
              </label>
            </div>
          </section>
        );
      })}
    </fieldset>
  );
}
