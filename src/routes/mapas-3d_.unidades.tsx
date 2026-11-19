import { createFileRoute, Link, type SearchSchemaInput } from "@tanstack/react-router";
import { ArrowRight, Building2, Cylinder, Factory, Search, Warehouse, X } from "lucide-react";
import { useRef } from "react";
import { PageHeader } from "@/components/nexus/Page";
import "@/components/nexus/map-library.css";

export const Route = createFileRoute("/mapas-3d_/unidades")({
  validateSearch: (search: { q?: unknown } & SearchSchemaInput) => ({
    q: typeof search["q"] === "string" ? search["q"].slice(0, 100) : "",
  }),
  head: () => ({ meta: [{ title: "Mapas 3D das Unidades — Nexus" }] }),
  component: Maps,
});

const maps = [
  {
    key: "cruz-alta",
    route: "/mapas-3d/tres-tentos-cruz-alta",
    name: "Cruz Alta",
    label: "Três Tentos — Cruz Alta/RS",
    context: "Três Tentos · Rio Grande do Sul",
    type: "Mapa de unidade",
    fallback: Factory,
    description:
      "Explore os setores, as coberturas e as linhas de vida. Consulte as pranchas na ficha de cada estrutura.",
    keywords: "3tentos fábrica preparação silos LVHF",
    preview: "/models/cruz-alta/implantacao.webp",
    previewAlt: "Implantação modelada da fábrica de Cruz Alta",
  },
  {
    key: "silo-engolfamento",
    route: "/mapas-3d/silo-engolfamento",
    name: "Silo metálico · LVHF interna",
    label: "Silo metálico · LVHF interna",
    context: "Segurança · Massa granular",
    type: "Simulação educativa",
    fallback: Cylinder,
    description:
      "Inspecione a linha de vida circular de um silo de 22 m e percorra o cenário de engolfamento em quatro perspectivas.",
    keywords: "treinamento trole segurança reprodução",
    preview: "/models/silo-engolfamento/thumbnail.svg",
    previewAlt: "Corte do silo metálico com a linha de vida circular e técnicos em escala humana",
  },
  {
    key: "trevisan",
    route: "/mapas-3d/trevisan",
    name: "Moega 3 e coberturas",
    label: "Moega 3 e coberturas",
    context: "Trevisan · Arroz",
    type: "Levantamento preliminar",
    fallback: Warehouse,
    description:
      "Confira a moega, as três naves e os transportadores do conjunto, modelados a partir de oito pranchas.",
    keywords: "implantação camadas técnicas bloco alto",
  },
  {
    key: "tres-tentos",
    route: "/mapas-3d",
    name: "Unidade industrial",
    label: "Unidade industrial 3 Tentos",
    context: "3 Tentos · Armazenagem",
    type: "Mapa de unidade",
    fallback: Building2,
    description:
      "Inspecione silos e edificações no modelo construído com referências CAD e fotográficas.",
    keywords: "três tentos 3tentos reconstrução",
    preview: "/references/3tentos/DE8CBDEB-B80D-4584-A99F-C44956F484E3.png",
    previewAlt: "Fotografia de referência da unidade 3 Tentos com quatro silos e galpão",
  },
] as const;

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function Maps() {
  const { q: busca } = Route.useSearch();
  const navigate = Route.useNavigate();
  const search = useRef<HTMLInputElement>(null);
  const terms = normalize(busca).split(/\s+/);
  const visible = maps.filter((map) => {
    const text = normalize(
      [map.name, map.label, map.context, map.type, map.description, map.keywords].join(" "),
    );
    return terms.every((term) => text.includes(term));
  });
  const updateSearch = (q: string) =>
    void navigate({ search: { q }, replace: true, resetScroll: false });
  const clearSearch = () => {
    search.current?.focus();
    updateSearch("");
  };
  return (
    <div className="nx-map-catalog">
      <PageHeader
        eyebrow="Engenharia"
        title="Mapas 3D das unidades"
        description="Abra a cena de uma unidade ou explore uma simulação de segurança."
        actions={
          <Link to="/escada-lc02" className="nx-map-related">
            Escada LC-02 <ArrowRight aria-hidden="true" size={17} />
          </Link>
        }
      />
      <div className="nx-map-toolbar">
        <div className="nx-map-search" role="search">
          <label htmlFor="nx-map-catalog-search">Buscar visualização</label>
          <div className="nx-map-search-field">
            <Search aria-hidden="true" size={18} />
            <input
              ref={search}
              id="nx-map-catalog-search"
              type="search"
              value={busca}
              maxLength={100}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Nome, unidade ou finalidade"
            />
            {busca.length > 0 && (
              <button type="button" onClick={clearSearch} aria-label="Limpar busca">
                <X aria-hidden="true" size={18} />
              </button>
            )}
          </div>
        </div>
        <span className="nx-map-count" role="status">
          {visible.length
            ? visible.length === 1
              ? "1 visualização"
              : `${visible.length} visualizações`
            : "Nenhuma visualização corresponde à busca."}
        </span>
      </div>
      {visible.length > 0 ? (
        <ul className="nx-map-grid">
          {visible.map((map) => (
            <li key={map.key}>
              <Link
                to={map.route}
                aria-label={`Abrir visualização: ${map.label}`}
                className="nx-map-card"
                data-map={map.key}
              >
                <div className="nx-map-preview">
                  {"preview" in map ? (
                    <img src={map.preview} alt={map.previewAlt} decoding="async" />
                  ) : (
                    <TrevisanPreview />
                  )}
                  <span className="nx-map-type">{map.type}</span>
                </div>
                <div className="nx-map-details">
                  <div className="nx-map-pictogram" aria-hidden="true">
                    <img
                      src={`/models/mapas-3d/icons/${map.key}.webp`}
                      alt=""
                      width={56}
                      height={56}
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                    <map.fallback
                      className="nx-map-pictogram-fallback"
                      size={30}
                      strokeWidth={1.5}
                    />
                  </div>
                  <h2>{map.name}</h2>
                  <p className="nx-map-context">{map.context}</p>
                  <p className="nx-map-description">{map.description}</p>
                  <span className="nx-map-link">
                    Abrir visualização <ArrowRight aria-hidden="true" size={18} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="nx-map-empty">
          <Search aria-hidden="true" size={22} />
          <p>Tente o nome da unidade, o tipo de visualização ou uma palavra mais curta.</p>
          <button type="button" onClick={clearSearch}>
            Ver todas as visualizações
          </button>
        </div>
      )}
    </div>
  );
}

function TrevisanPreview() {
  return (
    <svg
      viewBox="0 0 800 245"
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
  );
}
