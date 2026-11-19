import { ChevronRight, FileCheck2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatInspectionDate, inspectDueStatus, type CaInspectionLine } from "./inspection-domain";
import type { CruzScene } from "./navigation";
import { objects } from "./manifest";
import { hasInspectionEvidence, technicalTitle } from "./inspection-display";

const objectById = new Map(objects.map((object) => [object.id, object]));

const documentation = {
  verified: "Registro conferido",
  layout: "Identificação no layout",
  review: "Em revisão",
  stale: "Atualização pendente",
  restriction: "Restrição registrada",
  soon: "Vence em até 30 dias",
  overdue: "Prazo vencido",
};
function markerState(line: CaInspectionLine): keyof typeof documentation {
  const due = inspectDueStatus(line.fields.due?.value ?? null);
  if (!hasInspectionEvidence(line) && (line.description || line.seal)) return "layout";
  if (due === "overdue") return "overdue";
  if (line.restriction) return "restriction";
  if (line.status !== "verified") return line.status;
  if (due === "soon") return "soon";
  return "verified";
}
const paintOrder = [
  "overdue",
  "restriction",
  "review",
  "stale",
  "soon",
  "layout",
  "verified",
] as const;

export function InspectionMarkers({
  lines,
  scene,
  ready,
  openSheet,
}: {
  lines: CaInspectionLine[];
  scene: CruzScene | null;
  ready: boolean;
  openSheet: (key: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState("");
  const groups = useMemo(() => {
    const byCover = new Map<string, CaInspectionLine[]>();
    for (const line of lines) {
      const object = objectById.get(line.key);
      if (!object?.parent || object.kind !== "lvhf") continue;
      const group = byCover.get(object.parent) ?? [];
      group.push(line);
      byCover.set(object.parent, group);
    }
    return [...byCover.entries()].map(([cover, lines]) => ({
      cover,
      lines: lines.sort((a, b) => a.key.localeCompare(b.key, "pt-BR", { numeric: true })),
    }));
  }, [lines]);
  useEffect(() => {
    if (!scene || !ready || !host.current) return;
    const nodes = host.current.querySelectorAll<HTMLElement>("[data-ca-inspection]");
    scene.inspectionMarkers(
      groups.flatMap(({ cover, lines }, i) => {
        const node = nodes[i];
        return node ? [{ node, cover, keys: lines.map(({ key }) => key) }] : [];
      }),
    );
    return () => scene.inspectionMarkers([]);
  }, [groups, scene, ready]);
  return (
    <div className="ca-inspection-markers" ref={host}>
      {groups.map(({ cover, lines }) => {
        const single = objectById.get(lines[0]!.key);
        const code = single?.code;
        const multiple = lines.length > 1;
        const status =
          paintOrder.find((state) => lines.some((line) => markerState(line) === state)) ??
          "verified";
        const coverage = objectById.get(cover);
        const title = multiple
          ? coverage
            ? technicalTitle(coverage)
            : "Linhas da cobertura"
          : single
            ? technicalTitle(single, lines[0])
            : "Linha de vida";
        const firstDue = lines
          .flatMap((line) => (line.fields.due ? [line.fields.due.value] : []))
          .sort()[0];
        const dueText =
          (multiple ? "Primeiro prazo · " : "Próxima inspeção · ") + formatInspectionDate(firstDue);
        const groupLabel = multiple ? lines.length + " linhas nesta cobertura. " : "";
        return (
          <div
            key={cover}
            hidden
            data-ca-inspection={cover}
            className="ca-inspection-marker"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setOpen((prev) => (prev === cover ? "" : prev));
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || open !== cover) return;
              event.preventDefault();
              event.stopPropagation();
              setOpen("");
              event.currentTarget.querySelector<HTMLButtonElement>("[data-pin-control]")?.focus();
            }}
          >
            <button
              type="button"
              className="ca-inspection-pin"
              data-pin-control
              data-state={status}
              aria-label={
                title +
                ". " +
                groupLabel +
                dueText +
                ". " +
                documentation[status] +
                ". Laudos e inspeções."
              }
              aria-expanded={multiple ? open === cover : undefined}
              aria-controls={multiple && open === cover ? "ca-inspection-pop-" + cover : undefined}
              title={title + " · " + dueText + " · " + documentation[status]}
              onClick={() => {
                if (multiple) setOpen((prev) => (prev === cover ? "" : cover));
                else openSheet(lines[0]!.key);
              }}
            >
              <FileCheck2 size={17} aria-hidden="true" />
              <span className="ca-inspection-simple">{multiple ? lines.length : code}</span>
              <span className="ca-inspection-pin-copy" aria-hidden="true">
                <strong>{title}</strong>
                <small>{dueText}</small>
              </span>
            </button>
            {multiple && open === cover && (
              <div
                id={"ca-inspection-pop-" + cover}
                className="ca-inspection-pop"
                role="group"
                aria-label="Laudos por linha"
              >
                <header>
                  <strong>Laudos e inspeções</strong>
                  <button
                    type="button"
                    aria-label="Fechar laudos da cobertura"
                    onClick={(event) => {
                      setOpen("");
                      event.currentTarget
                        .closest(".ca-inspection-marker")
                        ?.querySelector<HTMLButtonElement>("[data-pin-control]")
                        ?.focus();
                    }}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </header>
                <ul>
                  {lines.map((line) => (
                    <li key={line.key}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen("");
                          openSheet(line.key);
                        }}
                      >
                        <span>
                          <strong>{technicalTitle(objectById.get(line.key)!, line)}</strong>
                          <small>
                            Próxima inspeção · {formatInspectionDate(line.fields.due?.value)}
                          </small>
                          <small>{documentation[markerState(line)]}</small>
                        </span>
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
