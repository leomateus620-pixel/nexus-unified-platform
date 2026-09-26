import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Box, FileText, Layers3 } from "lucide-react";
import { PageHeader } from "@/components/nexus/Page";

export const Route = createFileRoute("/mapas-3d")({
  head: () => ({ meta: [{ title: "Mapas 3D das Unidades — Nexus" }] }),
  component: Maps,
});
function Maps() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Engenharia · Biblioteca espacial"
        title="Mapas 3D das unidades"
        description="Explore cada unidade em uma visualização dedicada, com estruturas, setores e referências técnicas próprias."
      />
      <Link
        to="/mapas-3d/trevisan"
        className="group block max-w-4xl overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
      >
        <div className="relative overflow-hidden bg-[#dbe2db] p-6 md:p-10">
          <svg
            viewBox="0 0 800 245"
            className="h-52 w-full"
            role="img"
            aria-label="Diagrama de implantação: três naves, Moega 3 e silo em contorno"
          >
            <defs>
              <pattern id="trevisan-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M30 0H0V30" fill="none" stroke="#c2cec2" strokeWidth=".6" />
              </pattern>
            </defs>
            <rect width="800" height="245" fill="url(#trevisan-grid)" />
            <g transform="translate(350 135) skewY(-18) scale(1 .6)">
              <path d="M-130 0v115H220V0" fill="#b4c1b7" stroke="#5e7668" />
              <path
                d="M-130 0L-72-45-14 0 44-45 102 0 161-45 220 0V115L161 70 102 115 44 70-14 115-72 70-130 115Z"
                fill="#d5ddd1"
                stroke="#658070"
              />
              <path d="M-72-45V70M44-45V70M161-45V70" stroke="#8c9f8e" />
              <path d="M108-70V-115L158-150 208-115V-70L158-105Z" fill="#829d86" stroke="#3f6551" />
              <path d="M108-70L158-105 208-70V-45L158-80 108-45Z" fill="#d3b98b" stroke="#8a7750" />
              <path d="M158-150V-105" stroke="#55745e" />
            </g>
            <circle cx="232" cy="66" r="34" stroke="#ab8957" strokeDasharray="5 3" fill="none" />
            <path
              d="M232 32v68M198 66h68M256 90L426 100"
              fill="none"
              stroke="#ab8957"
              strokeDasharray="4 3"
            />
            <text x="560" y="75" fontSize="11" fill="#4b6855" letterSpacing="2">
              MOEGA 3
            </text>
            <path d="M540 78H494" stroke="#779780" />
            <text x="535" y="220" fontSize="9" fill="#6f8070" letterSpacing="1">
              DIAGRAMA DE APRESENTAÇÃO · SEM ESCALA
            </text>
          </svg>
          <span className="absolute left-5 top-5 rounded border border-[#8c9d8f] bg-[#eaf0e5] px-2 py-1 text-[10px] tracking-widest text-[#526b56]">
            LEVANTAMENTO PRELIMINAR
          </span>
        </div>
        <div className="flex items-center justify-between gap-5 p-6 md:p-8">
          <div>
            <p className="text-[10px] uppercase tracking-[.2em] text-primary">Trevisan · Arroz</p>
            <h2 className="mt-2 text-2xl font-semibold">Moega 3 e coberturas</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Conjunto industrial completo: três naves, bloco alto, transportadores e contexto de
              implantação. Referência exclusiva nas oito pranchas do levantamento.
            </p>
            <div className="mt-5 flex flex-wrap gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <Box size={14} />
                Visualização dedicada
              </span>
              <span className="flex items-center gap-2">
                <Layers3 size={14} />
                Camadas técnicas
              </span>
              <span className="flex items-center gap-2">
                <FileText size={14} />8 pranchas de origem
              </span>
            </div>
          </div>
          <ArrowUpRight className="shrink-0 text-primary" size={26} />
        </div>
      </Link>
    </div>
  );
}
