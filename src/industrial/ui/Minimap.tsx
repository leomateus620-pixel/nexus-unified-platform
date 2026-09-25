import { site, elements } from "../data";
import type { Layers } from "../types";
import {
  accessFootprint,
  elementBounds,
  elementFootprint,
  groundY,
  highwayWidth,
  navigationBounds,
} from "../scene/spatial";
export function Minimap({
  camera,
  selected,
  onSelect,
  layers,
}: {
  camera: [number, number];
  selected: string | null;
  onSelect: (id: string) => void;
  layers: Layers;
}) {
  const minX = Math.min(navigationBounds.min[0], site.terrain.highwayX - 8);
  const minZ = navigationBounds.min[2];
  const maxX = Math.max(navigationBounds.max[0], site.terrain.highwayX + 8);
  const maxZ = navigationBounds.max[2];
  return (
    <div className="industrial-minimap industrial-overlay">
      <div>
        <span>IMPLANTAÇÃO</span>
        <span>+X → · +Z ↓</span>
      </div>
      <svg
        viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`}
        role="img"
        aria-label="Minimapa da implantação no sistema local Nexus"
      >
        <rect x={minX} y={minZ} width={maxX - minX} height={maxZ - minZ} fill="#c7c8aa" />
        <polygon points={site.terrain.site.map((p) => p.join(",")).join(" ")} fill="#71936a" />
        <polygon points={site.terrain.yard.map((p) => p.join(",")).join(" ")} fill="#bbb8a5" />
        {site.terrain.islands.map((p, i) => (
          <polygon key={i} points={p.map((v) => v.join(",")).join(" ")} fill="#71936a" />
        ))}
        {(site.terrain.localPatches ?? []).map((patch) => (
          <polygon
            key={patch.id}
            points={patch.points.map((point) => point.join(",")).join(" ")}
            fill="#c6c4b4"
          />
        ))}
        <polygon
          points={accessFootprint.map((point) => point.join(",")).join(" ")}
          fill="#bbb8a5"
        />
        <path
          d={`M ${site.terrain.highwayX} ${minZ} V${maxZ}`}
          stroke="#626761"
          strokeWidth={highwayWidth}
        />
        {elements
          .filter(
            (e) => ["silos", "buildings", "equipment"].includes(e.category) && layers[e.category],
          )
          // Projected tunnels/connections must not cover surface structures.
          .sort((a, b) => {
            const rank = (category: string) =>
              category === "equipment" ? 0 : category === "buildings" ? 1 : 2;
            return rank(a.category) - rank(b.category);
          })
          .map((e) => (
            <g
              key={e.id}
              onClick={() => onSelect(e.id)}
              tabIndex={0}
              role="button"
              aria-label={`Selecionar ${e.name} no minimapa`}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onSelect(e.id);
                }
              }}
              className="minimap-element"
            >
              <title>
                {e.name} · {e.id}
                {e.identification ? ` · ${e.identification.cadName}` : ""}
                {e.cad
                  ? " · Contorno projetado da geometria; não representa contato com o solo"
                  : ""}
              </title>
              <polygon
                points={elementFootprint(e)
                  .map((point) => point.join(","))
                  .join(" ")}
                fill={
                  selected === e.id
                    ? "#ffb367"
                    : e.category === "silos"
                      ? "#e4e7df"
                      : e.category === "equipment"
                        ? "#a9bbc0"
                        : "#ece7d8"
                }
                fillOpacity={e.category === "equipment" ? (selected === e.id ? 0.65 : 0.22) : 1}
                pointerEvents={
                  e.category === "equipment" && elementBounds(e).min[1] < groundY - 0.3
                    ? "visibleStroke"
                    : "visiblePainted"
                }
                stroke="#53665e"
                strokeWidth={selected === e.id ? 1.3 : 0.7}
                strokeDasharray={elementBounds(e).min[1] < groundY - 0.3 ? "2 1" : undefined}
              />
            </g>
          ))}
        <circle
          cx={Math.max(minX + 4, Math.min(maxX - 4, camera[0]))}
          cy={Math.max(minZ + 4, Math.min(maxZ - 4, camera[1]))}
          r="3.4"
          fill="#ef963d"
          stroke="#fff"
          strokeWidth="1.4"
        />
      </svg>
      <small>Coordenadas locais · CAD e base fotográfica</small>
    </div>
  );
}
