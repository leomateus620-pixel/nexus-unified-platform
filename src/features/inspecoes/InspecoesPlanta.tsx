import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  Download,
  Minus,
  Plus,
  Printer,
} from "lucide-react";
import { ActionButton, EmptyState } from "@/components/nexus/Page";
import { Badge, Fatos, dataCivil, legenda, objeto, texto } from "./apresentacao";
import type { InspecoesDetalhe, InspecoesRegistro } from "./ui-contract";

type Modo = "tipo" | "r64" | "resultado";
type Box = { x: number; y: number; w: number; h: number };
export type InspecoesMapaView = { box: Box; modo: Modo; busca: string; selected: string };
type Point = {
  x: number;
  y: number;
  radius: number;
  tag: string;
  type: string;
  source: string;
  label: Record<string, unknown>;
  leader: unknown;
  zone: string;
  asset?: InspecoesRegistro | undefined;
};
const colors = {
  r64: { em_dia: "#13674d", em_aviso: "#a24d00", vencido: "#a81d2a", sem_inspecao: "#566473" },
  resultado: {
    apto: "#13674d",
    apto_restricao: "#a24d00",
    nao_apto: "#a81d2a",
    nao_inspecionado: "#566473",
  },
};
const neutral = "#566473";
const numeric = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const nums = (value: unknown) =>
  asArray(value)
    .map(numeric)
    .filter((item): item is number => item != null);
const lists = (value: unknown) => asArray(value).map(texto);
const safeColor = (value: unknown, fallback = "#4b5563") => {
  const color = texto(value);
  return /^(?:#[0-9a-f]{3,8}|none|black|white|gray)$/i.test(color) ? color : fallback;
};
const safePath = (value: unknown) => {
  const path = texto(value);
  return path.length <= 1_200_000 && /^[Mm][MLHVCSQTAZmlhvcsqtaz0-9eE.,+\s-]+$/.test(path)
    ? path
    : undefined;
};

function getZone(value: Record<string, unknown>, x: number, y: number) {
  const columns = nums(value["colunas"]),
    rows = nums(value["linhas"]);
  const column = columns.findIndex((edge, index) => edge <= x && x < columns[index + 1]!);
  const row = rows.findIndex((edge, index) => edge <= y && y < rows[index + 1]!);
  if (column < 0 || row < 0) return "";
  return (lists(value["rot_linhas"])[row] ?? "") + (lists(value["rot_colunas"])[column] ?? "");
}

export function InspecoesPlanta({
  detalhe,
  abrir,
  views,
  viewKey,
}: {
  detalhe: InspecoesDetalhe;
  abrir: (item: InspecoesRegistro) => void;
  views: Map<string, InspecoesMapaView>;
  viewKey: string;
}) {
  const source = detalhe.registro.snapshot;
  const plan = {
    w: numeric(source["largura_pt"]) ?? 1190.55,
    h: numeric(source["altura_pt"]) ?? 841.89,
  };
  const view = { x: 0, y: 0, ...plan };
  const saved = views.get(viewKey);
  const [box, setBox] = useState(saved?.box ?? view);
  const [modo, setModo] = useState<Modo>(saved?.modo ?? "tipo");
  const [buscar, setBuscar] = useState(saved?.busca ?? "");
  const [selected, setSelected] = useState(saved?.selected ?? "");
  useEffect(() => {
    views.set(viewKey, { box, modo, busca: buscar, selected });
  }, [views, viewKey, box, modo, buscar, selected]);
  const viewport = useRef<SVGSVGElement>(null);
  const printFrame = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ clientX: number; clientY: number; box: Box } | null>(null);
  const id = useId();
  const ativos = new Map(
    detalhe.relacionados
      .filter(({ colecao }) => colecao === "ativos")
      .map((item) => [item.source_id, item]),
  );
  const zones = objeto(source["zonas"]);
  const points = asArray(source["pontos"]).flatMap((entry): Point[] => {
    const point = objeto(entry);
    const x = numeric(point["x"]),
      y = numeric(point["y"]);
    const tag = texto(point["tag"]);
    const sourceId = texto(point["ativo_id"]);
    if (x == null || y == null || !tag) return [];
    return [
      {
        x,
        y,
        tag,
        source: sourceId || tag,
        type: texto(point["tipo"]),
        radius: Math.max(1, numeric(point["raio"]) ?? 4),
        label: objeto(point["rotulo"]),
        leader: point["lider"],
        zone: getZone(zones, x, y),
        asset: ativos.get(sourceId),
      },
    ];
  });
  const types = asArray(source["tipos"])
    .map(objeto)
    .map((item) => ({
      id: texto(item["sigla"]),
      label: texto(item["sigla"]),
      color: safeColor(item["cor"], neutral),
      description: texto(item["nome"]),
    }));
  const legend =
    modo === "tipo"
      ? types
      : Object.entries(colors[modo]).map(([key, color]) => ({
          id: key,
          label: legenda(key),
          color,
          description: "",
        }));
  const point = points.find((entry) => entry.source === selected);
  const search = buscar.trim().toLocaleLowerCase("pt-BR");
  const matches = points.filter(
    (entry) => !search || entry.tag.toLocaleLowerCase("pt-BR").includes(search),
  );
  const geom = objeto(source["geometria"] ?? objeto(source["fundo"])["geometria"]);
  const paths = asArray(geom["paths"]).map(objeto);
  const captions = asArray(geom["textos"]).map(objeto);
  const expectedZone = texto(point?.asset?.resumo?.["zona_laudo"]);
  const status = texto(point?.asset?.resumo?.["r64_status"]);
  const result = texto(point?.asset?.resumo?.["resultado"]);
  const zoneMismatch =
    !!expectedZone &&
    !!point?.zone &&
    !expectedZone
      .split("/")
      .map((item) => item.trim())
      .includes(point.zone);
  const selectedStatus = (entry: Point) => {
    if (modo === "tipo") return entry.type;
    if (modo === "r64") return texto(entry.asset?.resumo?.["r64_status"]) || "sem_inspecao";
    const result = texto(entry.asset?.resumo?.["resultado"]);
    return result === "apto_com_restricao" ? "apto_restricao" : result;
  };
  function zoom(factor: number) {
    setBox((current) => {
      const width = Math.min(view.w * 1.25, Math.max(view.w / 10, current.w * factor));
      const height = (width * view.h) / view.w;
      return {
        x: current.x + (current.w - width) / 2,
        y: current.y + (current.h - height) / 2,
        w: width,
        h: height,
      };
    });
  }
  function focusPoint(entry: Point) {
    setSelected(entry.source);
    setBox((current) => {
      const w = Math.min(view.w / 2, current.w);
      const h = (w * view.h) / view.w;
      return { x: entry.x - w / 2, y: entry.y - h / 2, w, h };
    });
  }
  function pan(dx: number, dy: number) {
    setBox((current) => ({
      ...current,
      x: current.x + current.w * dx,
      y: current.y + current.h * dy,
    }));
  }
  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowLeft") pan(-0.1, 0);
    else if (e.key === "ArrowRight") pan(0.1, 0);
    else if (e.key === "ArrowUp") pan(0, -0.1);
    else if (e.key === "ArrowDown") pan(0, 0.1);
    else if (e.key === "+" || e.key === "=") zoom(0.8);
    else if (e.key === "-") zoom(1.25);
    else if (e.key === "Home") setBox(view);
    else return;
    e.preventDefault();
  }
  function startPan(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest("[data-point]"))) return;
    pointer.current = { clientX: e.clientX, clientY: e.clientY, box };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function movePan(e: PointerEvent<SVGSVGElement>) {
    const start = pointer.current;
    if (!start) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(rect.width / start.box.w, rect.height / start.box.h);
    setBox({
      ...start.box,
      x: start.box.x - (e.clientX - start.clientX) / ratio,
      y: start.box.y - (e.clientY - start.clientY) / ratio,
    });
  }
  function exportSvg() {
    const node = viewport.current?.cloneNode(true);
    if (!(node instanceof SVGElement)) return;
    node.setAttribute("viewBox", `0 0 ${view.w} ${view.h}`);
    node.setAttribute("width", "420mm");
    node.setAttribute("height", "297mm");
    const blob = new Blob([new XMLSerializer().serializeToString(node)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${(detalhe.registro.codigo || "planta").replace(/[^\p{L}\p{N}_.-]/gu, "-")}.svg`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1_000);
  }
  function print() {
    const node = viewport.current;
    const frame = printFrame.current;
    if (!node || !frame) return;
    const before = node.getAttribute("viewBox") ?? "";
    node.setAttribute("viewBox", `0 0 ${view.w} ${view.h}`);
    frame.dataset["imprimir"] = "sim";
    try {
      window.print();
    } finally {
      delete frame.dataset["imprimir"];
      node.setAttribute("viewBox", before);
    }
  }
  if (!points.length) return <EmptyState title="Nenhum ponto disponível nesta revisão da planta" />;
  return (
    <section className="insp-stack" aria-labelledby={id}>
      <h3 className="insp-subheading" id={id}>
        Planta interativa
      </h3>
      <div className="insp-toolbar">
        <label className="insp-field insp-search">
          Buscar TAG
          <input
            type="search"
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Digite a TAG do ponto"
          />
        </label>
        <div className="insp-field">
          <label htmlFor={id + "-point"}>Ponto</label>
          <select
            id={id + "-point"}
            value={matches.some((entry) => entry.source === selected) ? selected : ""}
            onChange={(event) => {
              const match = matches.find((entry) => entry.source === event.target.value);
              if (match) focusPoint(match);
              else setSelected("");
            }}
          >
            <option value="">
              {matches.length ? "Selecione um ponto" : "Nenhum ponto encontrado"}
            </option>
            {matches.map((entry) => (
              <option key={entry.source} value={entry.source}>
                {entry.tag}
                {entry.zone ? ` · ${entry.zone}` : ""}
              </option>
            ))}
          </select>
        </div>
        <label className="insp-field">
          Colorir por
          <select value={modo} onChange={(event) => setModo(event.target.value as Modo)}>
            <option value="tipo">Tipo de ponto</option>
            <option value="r64">Prazo de reinspeção R64</option>
            <option value="resultado">Resultado histórico</option>
          </select>
        </label>
      </div>
      <div className="insp-map-layout">
        <div className="insp-map-frame" ref={printFrame}>
          <svg
            ref={viewport}
            tabIndex={0}
            aria-label="Planta vetorial. Setas movimentam a folha e as teclas mais e menos alteram o zoom."
            viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
            role="img"
            onKeyDown={onKeyDown}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={() => {
              pointer.current = null;
            }}
            onPointerCancel={() => {
              pointer.current = null;
            }}
          >
            <title>{detalhe.registro.titulo}</title>
            <desc>
              {points.length} pontos em planta. As cores indicam{" "}
              {modo === "tipo"
                ? "o tipo de ponto"
                : modo === "r64"
                  ? "o prazo R64"
                  : "o resultado histórico"}
              .
            </desc>
            <rect x={0} y={0} width={view.w} height={view.h} fill="white" />
            <rect
              x={12}
              y={12}
              width={view.w - 24}
              height={view.h - 24}
              stroke="#1e293b"
              strokeWidth={1.3}
              fill="none"
            />
            <g stroke="#9aa6b2" strokeWidth={0.55} strokeDasharray="3 4">
              {nums(zones["colunas"]).map((x) => (
                <line key={x} x1={x} y1={20} x2={x} y2={view.h - 20} />
              ))}
              {nums(zones["linhas"]).map((y) => (
                <line key={y} x1={20} y1={y} x2={view.w - 20} y2={y} />
              ))}
            </g>
            <g fill="#526173" fontSize={9} textAnchor="middle">
              {nums(zones["colunas"])
                .slice(0, -1)
                .map((x, index) => (
                  <text key={x} x={(x + (nums(zones["colunas"])[index + 1] ?? x)) / 2} y={18}>
                    {lists(zones["rot_colunas"])[index]}
                  </text>
                ))}
              {nums(zones["linhas"])
                .slice(0, -1)
                .map((y, index) => (
                  <text key={y} x={17} y={(y + (nums(zones["linhas"])[index + 1] ?? y)) / 2}>
                    {lists(zones["rot_linhas"])[index]}
                  </text>
                ))}
            </g>
            <g>
              {paths.map((entry, index) => (
                <path
                  key={index}
                  d={safePath(entry["d"])}
                  fill={safeColor(entry["fill"], "none")}
                  stroke={safeColor(entry["cor"])}
                  strokeWidth={numeric(entry["w"]) ?? 0.8}
                  strokeDasharray={
                    typeof entry["tracejado"] === "string" && /^[\d.\s,]+$/.test(entry["tracejado"])
                      ? entry["tracejado"]
                      : undefined
                  }
                />
              ))}
            </g>
            <g>
              {captions.map((entry, index) => {
                const x = numeric(entry["x"]) ?? 0,
                  y = numeric(entry["y"]) ?? 0;
                return (
                  <text
                    key={index}
                    x={x}
                    y={y}
                    fill={safeColor(entry["cor"])}
                    fontSize={numeric(entry["tam"]) ?? 7}
                    fontWeight={entry["negrito"] ? "bold" : undefined}
                    transform={`rotate(${numeric(entry["rot"]) ?? 0}, ${x}, ${y})`}
                  >
                    {texto(entry["t"])}
                  </text>
                );
              })}
            </g>
            <g>
              {points.map((entry) => {
                const color =
                  legend.find((key) => key.id === selectedStatus(entry))?.color ?? neutral;
                const active = entry.source === selected;
                const x = numeric(entry.label["x"]) ?? entry.x + 4,
                  y = numeric(entry.label["y"]) ?? entry.y - 4;
                const leader = asArray(entry.leader)
                  .map((p) => {
                    const row = asArray(p);
                    return [
                      numeric(row[0]) ?? numeric(objeto(p)["x"]),
                      numeric(row[1]) ?? numeric(objeto(p)["y"]),
                    ];
                  })
                  .filter(([x, y]) => x != null && y != null)
                  .map(([x, y]) => `${x},${y}`)
                  .join(" ");
                return (
                  <g
                    key={entry.source}
                    data-point={entry.source}
                    onClick={() => setSelected(entry.source)}
                    className="insp-map-point"
                  >
                    <title>
                      {entry.tag}
                      {entry.zone ? ` · ${entry.zone}` : ""}
                    </title>
                    {leader && (
                      <polyline points={leader} stroke={color} strokeWidth={0.55} fill="none" />
                    )}
                    {active && (
                      <circle
                        cx={entry.x}
                        cy={entry.y}
                        r={entry.radius + 4}
                        stroke="#173d2e"
                        strokeWidth={1.8}
                        fill="none"
                      />
                    )}
                    <circle
                      cx={entry.x}
                      cy={entry.y}
                      r={Math.max(7, entry.radius)}
                      fill="transparent"
                    />
                    <circle
                      cx={entry.x}
                      cy={entry.y}
                      r={entry.radius}
                      stroke={color}
                      strokeWidth={1.1}
                      fill={active ? "#c2f7d1" : "white"}
                    />
                    <text
                      x={x}
                      y={y}
                      fontSize={numeric(entry.label["tam"]) ?? 6}
                      fill={color}
                      transform={`rotate(${numeric(entry.label["rot"]) ?? 0}, ${x}, ${y})`}
                    >
                      {entry.tag}
                    </text>
                  </g>
                );
              })}
            </g>
            <g
              transform={`translate(${view.w - 312}, ${view.h - 101})`}
              fill="#1e293b"
              fontFamily="sans-serif"
            >
              <rect width={292} height={79} fill="white" stroke="#1e293b" />
              <text x={8} y={15} fontSize={10} fontWeight={700}>
                NEXUS · {texto(source["formato"]) || "A3"} · {detalhe.registro.codigo}
              </text>
              <text x={8} y={29} fontSize={7}>
                {texto(source["folha"])} · {points.length} pontos
              </text>
              {legend.map((entry, index) => (
                <text
                  key={entry.id}
                  x={8 + (index % 2) * 143}
                  y={45 + Math.floor(index / 2) * 12}
                  fill={entry.color}
                  fontSize={8}
                >
                  {entry.label}
                </text>
              ))}
              <text x={8} y={72} fontSize={7}>
                Revisão: {texto(source["revisao"]) || "não registrada"}
              </text>
            </g>
          </svg>
        </div>
        <aside className="insp-map-aside" aria-label="Informações do ponto">
          {point ? (
            <>
              <p className="insp-kicker">{point.type}</p>
              <h4>{point.tag}</h4>
              {status && <Badge value={status} kind="prazo" />}
              {result && <Badge value={result} kind="tecnico" />}
              <Fatos
                items={[
                  ["Zona calculada", point.zone],
                  ["Zona registrada no laudo", expectedZone || "Não informada"],
                  ["Vencimento R64", dataCivil(point.asset?.resumo?.["vence"])],
                ]}
              />
              {zoneMismatch && (
                <p role="status" className="insp-media-failure">
                  A zona calculada diverge da zona registrada. Requer conferência.
                </p>
              )}
              {point.asset ? (
                <ActionButton variant="ghost" onClick={() => abrir(point.asset!)}>
                  Abrir ficha do ativo <ArrowRight size={16} aria-hidden="true" />
                </ActionButton>
              ) : (
                <p className="nr-muted">Ficha do ativo indisponível para este ponto.</p>
              )}
            </>
          ) : (
            <p className="nr-muted">
              Selecione um ponto para consultar sua TAG, localização e ativo vinculado.
            </p>
          )}
        </aside>
      </div>
      <ul className="insp-map-legend" aria-label="Legenda da planta">
        {legend.map((entry) => (
          <li key={entry.id} title={entry.description}>
            <span style={{ background: entry.color }} />
            {entry.label}
            {modo === "tipo" && ` (${points.filter((item) => item.type === entry.id).length})`}
          </li>
        ))}
        {modo === "resultado" && (
          <li>
            <span style={{ background: neutral }} />
            Sem resultado registrado
          </li>
        )}
      </ul>
      {!paths.length && !captions.length && (
        <p className="nr-muted">
          Fundo vetorial indisponível. Os marcadores preservam as coordenadas da origem.
        </p>
      )}
      <div className="insp-actions" aria-label="Controles de planta">
        <ActionButton
          variant="ghost"
          onClick={() => zoom(1.25)}
          aria-label="Reduzir zoom da planta"
        >
          <Minus size={16} aria-hidden="true" />
        </ActionButton>
        <ActionButton variant="ghost" onClick={() => zoom(0.8)} aria-label="Ampliar planta">
          <Plus size={16} aria-hidden="true" />
        </ActionButton>
        <ActionButton
          variant="ghost"
          onClick={() => pan(-0.15, 0)}
          aria-label="Mover planta para a esquerda"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </ActionButton>
        <ActionButton
          variant="ghost"
          onClick={() => pan(0.15, 0)}
          aria-label="Mover planta para a direita"
        >
          <ArrowRight size={16} aria-hidden="true" />
        </ActionButton>
        <ActionButton
          variant="ghost"
          onClick={() => pan(0, -0.15)}
          aria-label="Mover planta para cima"
        >
          <ArrowUp size={16} aria-hidden="true" />
        </ActionButton>
        <ActionButton
          variant="ghost"
          onClick={() => pan(0, 0.15)}
          aria-label="Mover planta para baixo"
        >
          <ArrowDown size={16} aria-hidden="true" />
        </ActionButton>
        <ActionButton variant="ghost" onClick={() => setBox(view)}>
          <Crosshair size={16} aria-hidden="true" />
          Ajustar à folha
        </ActionButton>
        <ActionButton variant="ghost" onClick={exportSvg}>
          <Download size={16} aria-hidden="true" />
          Exportar SVG
        </ActionButton>
        <ActionButton variant="ghost" onClick={print}>
          <Printer size={16} aria-hidden="true" />
          Imprimir A3
        </ActionButton>
      </div>
    </section>
  );
}
