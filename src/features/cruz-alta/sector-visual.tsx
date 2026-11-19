import { Factory } from "lucide-react";
import { objects } from "./manifest";

const sectors = new Set(objects.filter((object) => object.kind === "setor").map(({ id }) => id));
const parentOf = new Map(objects.map(({ id, parent }) => [id, parent]));

export function sectorFor(id: string) {
  let current: string | undefined = id;
  while (current && !sectors.has(current)) current = parentOf.get(current);
  return current;
}

export function SectorIcon({ id, size = 34 }: { id: string; size?: number }) {
  const sector = sectorFor(id);
  return sector ? (
    <img
      alt=""
      aria-hidden="true"
      className="ca-sector-pictogram"
      src={"/models/cruz-alta/icones/" + sector.slice("setor-".length) + ".webp"}
      width={size}
      height={size}
      decoding="async"
    />
  ) : (
    <Factory size={size} className="ca-sector-pictogram" aria-hidden="true" />
  );
}
