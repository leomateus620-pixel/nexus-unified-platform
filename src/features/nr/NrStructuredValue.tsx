import { useState } from "react";
import { ActionButton } from "@/components/nexus/Page";

const label = (key: string) => key.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
/** Human-readable projection; unknown properties remain visible without editing or coercing them. */
export function NrStructuredValue({
  value,
  title,
  depth = 0,
}: {
  value: unknown;
  title?: string;
  depth?: number;
}) {
  const [limit, setLimit] = useState(25);
  if (value === null || value === undefined || value === "")
    return <p className="nr-muted">{title && `${title}: `}Não informado</p>;
  if (typeof value !== "object")
    return (
      <p className="nr-prewrap">
        {title && <strong>{title}: </strong>}
        {typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value)}
      </p>
    );
  const entries = Array.isArray(value)
    ? value.map((item, i) => [String(i + 1), item] as const)
    : Object.entries(value);
  const children = (
    <>
      {title && <h4 className="font-medium mb-2">{title}</h4>}
      {!entries.length ? (
        <p className="nr-muted">Nenhum item informado</p>
      ) : (
        <dl className="grid gap-2">
          {entries.slice(0, limit).map(([key, item]) => (
            <div key={key} className="border-b border-border pb-2 min-w-0">
              <dt className="text-sm nr-muted capitalize">{label(key)}</dt>
              <dd className="mt-1 break-words">
                <NrStructuredValue value={item} depth={depth + 1} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {entries.length > limit && (
        <ActionButton variant="ghost" onClick={() => setLimit(limit + 25)}>
          Mostrar mais {Math.min(25, entries.length - limit)} itens
        </ActionButton>
      )}
    </>
  );
  return depth > 1 ? (
    <details className="my-2">
      <summary className="cursor-pointer">
        {title || "Informações preservadas"} · {entries.length} itens
      </summary>
      <div className="pl-3 mt-2">{children}</div>
    </details>
  ) : (
    <div className="my-2">{children}</div>
  );
}
