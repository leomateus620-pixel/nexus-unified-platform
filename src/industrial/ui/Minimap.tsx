import { site, elements } from "../data";
export function Minimap({
  camera,
  selected,
  onSelect,
}: {
  camera: [number, number];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="industrial-minimap industrial-overlay">
      <div>
        <span>IMPLANTAÇÃO</span>
        <span>+X → · +Z ↓</span>
      </div>
      <svg
        viewBox="-80 -78 200 162"
        role="img"
        aria-label="Minimapa da implantação, orientação da Foto B"
      >
        <rect x="-80" y="-78" width="200" height="162" fill="#c7c8aa" />
        <polygon points={site.terrain.site.map((p) => p.join(",")).join(" ")} fill="#71936a" />
        <polygon points={site.terrain.yard.map((p) => p.join(",")).join(" ")} fill="#bbb8a5" />
        {site.terrain.islands.map((p, i) => (
          <polygon key={i} points={p.map((v) => v.join(",")).join(" ")} fill="#71936a" />
        ))}
        <path
          d={`M ${site.terrain.access.map((p) => p.join(",")).join(" L ")}`}
          fill="none"
          stroke="#bbb8a5"
          strokeWidth="8"
        />
        <path d={`M ${site.terrain.highwayX} -78 V84`} stroke="#626761" strokeWidth="8" />
        {elements
          .filter((e) => ["silos", "buildings"].includes(e.category))
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
              {e.category === "silos" ? (
                <circle
                  cx={e.position[0]}
                  cy={e.position[2]}
                  r={Number(e.geometry["radius"])}
                  fill={selected === e.id ? "#ffb367" : "#e4e7df"}
                  stroke="#53665e"
                  strokeWidth=".9"
                />
              ) : (
                <rect
                  x={e.position[0] - Number(e.geometry["width"]) / 2}
                  y={e.position[2] - Number(e.geometry["depth"]) / 2}
                  width={Number(e.geometry["width"])}
                  height={Number(e.geometry["depth"])}
                  fill={selected === e.id ? "#ffb367" : "#ece7d8"}
                  stroke="#677367"
                  strokeWidth=".7"
                />
              )}
            </g>
          ))}
        <circle
          cx={Math.max(-74, Math.min(115, camera[0]))}
          cy={Math.max(-73, Math.min(78, camera[1]))}
          r="3.4"
          fill="#ef963d"
          stroke="#fff"
          strokeWidth="1.4"
        />
      </svg>
      <small>Coordenadas locais · escala estimada</small>
    </div>
  );
}
