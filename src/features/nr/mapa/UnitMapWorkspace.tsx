import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { clearShellContext, setShellContext } from "@/components/nexus/shell-context";
const useLayoutSafeEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Expand, List, X } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/nexus/Page";
import type { NrSearch } from "../NrWorkspace";
import type { Norma, NrContexto, NrRecord } from "../domain";
import { nrConsultar } from "../nr.functions";
import { nrMapaContexto } from "./mapa.functions";
import type { CameraMode, MapContext } from "./types";
import type { CameraRequest, CameraSnapshot } from "./UnitScene";
import { UnitMapPanel } from "./UnitMapPanel";
import { GraphicsMenu } from "./GraphicsMenu";
import {
  QUALITY_STORAGE,
  validGraphicsChoice,
  type GraphicsChoice,
  type GraphicsProfile,
  type LightState,
} from "./graphics";
import "./mapa.css";
const UnitScene = lazy(() => import("./UnitScene"));
class SceneBoundary extends Component<
  { children: ReactNode; onFail: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFail();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function UnitMapWorkspace({
  org,
  user,
  norma,
  search,
  onSearch,
  contexto,
}: {
  org: string;
  user: string;
  norma: Norma;
  search: NrSearch;
  onSearch: (patch: Partial<NrSearch>) => void;
  contexto: NrContexto;
}) {
  const load = useServerFn(nrMapaContexto),
    consult = useServerFn(nrConsultar),
    cache = useQueryClient();
  const scope = useMemo(
    () => ({ organization_id: org, cliente_id: search.cliente, unidade_id: search.unidade, norma }),
    [org, search.cliente, search.unidade, norma],
  );
  const q = useQuery({
    queryKey: ["nr", org, user, norma, "mapa", search.cliente, search.unidade],
    enabled: !!search.cliente && !!search.unidade && search.escopo !== "todos",
    queryFn: ({ signal }) =>
      load({ data: { ...scope, manifesto: true }, signal }) as Promise<MapContext>,
    retry: false,
  });
  const data = q.data,
    base = norma === "NR33" ? "/nr-33" : "/nr-35";
  const unit = contexto.unidades.find(
    (u) => u.id === search.unidade && u.cliente_id === search.cliente,
  );
  const identity = data?.objetos.find((o) => o.local_id === search.local);
  const selected = identity?.chave ?? search.objeto ?? "";
  const [listOpen, setListOpen] = useState(false),
    [term, setTerm] = useState(""),
    [noWebGL, setNoWebGL] = useState(false);
  const [quality, setQuality] = useState<GraphicsChoice>(() => {
    try {
      return validGraphicsChoice(localStorage.getItem(QUALITY_STORAGE));
    } catch {
      return "auto";
    }
  });
  const [activeProfile, setActiveProfile] = useState<GraphicsProfile>("balanced");
  const [graphicsLimit, setGraphicsLimit] = useState("");
  const [light, setLight] = useState<LightState>("day");
  const chooseQuality = useCallback((choice: GraphicsChoice) => {
    setQuality(choice);
    try {
      localStorage.setItem(QUALITY_STORAGE, choice);
    } catch {
      /* Choice works without persistent storage. */
    }
  }, []);
  const reportQuality = useCallback((profile: GraphicsProfile, limit: string) => {
    setActiveProfile(profile);
    setGraphicsLimit(limit);
  }, []);
  const mode = search.camera ?? "normal";
  const storageKey = `nr-map:${org}:${user}:${norma}:${search.cliente}:${search.unidade}`;
  const [initialCamera] = useState<CameraSnapshot | undefined>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      return value &&
        value.mode === mode &&
        Array.isArray(value.position) &&
        value.position.length === 3 &&
        value.position.every(Number.isFinite) &&
        Array.isArray(value.target) &&
        value.target.length === 3 &&
        value.target.every(Number.isFinite) &&
        Number.isFinite(value.zoom)
        ? value
        : undefined;
    } catch {
      return undefined;
    }
  });
  const [request, setRequest] = useState<CameraRequest>({ mode, serial: 0 });
  const currentRequest = useMemo(() => ({ ...request, mode }), [request, mode]);
  const failed = useCallback(() => {
    setNoWebGL(true);
    setListOpen(true);
  }, []);
  const camera = useCallback(
    (value: CameraSnapshot) => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        /* Navigation remains usable without storage. */
      }
    },
    [storageKey],
  );
  const detail = useQuery({
    queryKey: [
      "nr",
      org,
      user,
      norma,
      search.cliente,
      search.unidade,
      "map-local",
      identity?.local_id,
    ],
    enabled: !!identity,
    queryFn: ({ signal }) =>
      consult({
        data: {
          organization_id: org,
          norma: "NR33",
          recurso: "locais",
          operacao: "detalhe",
          id: identity!.local_id,
          cliente_id: search.cliente,
          unidade_id: search.unidade,
        },
        signal,
      }),
    retry: false,
  });
  const row =
    detail.data && "registro" in detail.data ? (detail.data.registro as NrRecord) : undefined;
  const safeRow =
    row?.id === identity?.local_id &&
    row?.unidade_id === search.unidade &&
    row?.cliente_id === search.cliente
      ? row
      : undefined;
  const select = useCallback(
    (key: string) => {
      const item = data?.objetos.find((o) => o.chave === key);
      onSearch({
        local: item?.local_id ?? "",
        objeto: key,
        painel: "resumo",
        petDemo: "",
        etapaDemo: 0,
        visualizacao: "compacta",
      });
      setListOpen(false);
    },
    [data, onSearch],
  );
  const visible =
    data?.objetos.filter((o) =>
      `${o.tag} ${o.titulo} ${o.aliases.join(" ")} ${data.manifest?.silos.find((s) => s.key === o.chave)?.aliases.join(" ")}`
        .toLocaleLowerCase("pt-BR")
        .includes(term.toLocaleLowerCase("pt-BR")),
    ) ?? [];
  const maximized = !!selected && search.visualizacao === "expandida";
  const clienteNome = contexto.clientes.find((c) => c.id === search.cliente)?.nome ?? "";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Register the norm → client → unit context in the shell header; owned by this route + scope.
  const ownerKey = `${pathname}|${norma}|${search.cliente}|${search.unidade}`;
  const otherNorma = norma === "NR33" ? "NR-35" : "NR-33";
  const ctxReady = !!unit && !!clienteNome && search.escopo !== "todos";
  const backSearch = JSON.stringify({ ...search, local: "", objeto: "" });
  const switchSearch = JSON.stringify(search);
  useLayoutSafeEffect(() => {
    if (!ctxReady || !unit) {
      clearShellContext(ownerKey);
      return;
    }
    setShellContext({
      path: pathname,
      key: ownerKey,
      normaCodigo: norma === "NR33" ? "NR-33" : "NR-35",
      normaNome: norma === "NR33" ? "NR-33 — Espaços confinados" : "NR-35 — Trabalho em altura",
      cliente: clienteNome,
      unidade: unit.nome,
      back: { to: base, search: JSON.parse(backSearch), label: "Voltar ao painel da unidade" },
      switchNorma: {
        to: `${norma === "NR33" ? "/nr-35" : "/nr-33"}/mapa-3d`,
        search: JSON.parse(switchSearch),
        label: `Alternar mapa para ${otherNorma}`,
      },
    });
    return () => clearShellContext(ownerKey);
  }, [ctxReady, ownerKey, pathname, norma, clienteNome, unit?.nome, base, backSearch, switchSearch, otherNorma]);
  if (!unit || !search.cliente || !search.unidade || search.escopo === "todos")
    return (
      <div className="nx-nr-workspace">
        <p role="alert">Selecione uma unidade autorizada com cena publicada.</p>
        <Link to={base} search={{ ...search, local: "", objeto: "" }}>
          Voltar ao painel
        </Link>
      </div>
    );
  return (
    <div className="nx-nr-workspace unit-map-workspace">
      <h1 className="sr-only">
        Mapa 3D {norma === "NR33" ? "NR-33" : "NR-35"} · {clienteNome} · {unit.nome}
      </h1>
      {q.isPending ? (
        <LoadingState label="Conferindo associação da cena e locais autorizados…" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !data?.cena || !data.manifest ? (
        <p role="status">
          Esta unidade não possui cena publicada.{" "}
          <Link to={String(`${base}/locais`)} search={search}>
            Abrir inventário
          </Link>
        </p>
      ) : (
        <>
          <div className="unit-map-stage" data-panel={!!selected} data-maximized={maximized}>
            <div className="unit-map-scene-layer" inert={maximized}>
              {!noWebGL && (
                <SceneBoundary onFail={failed}>
                  <Suspense fallback={<LoadingState label="Preparando terreno e equipamentos…" />}>
                    <UnitScene
                      manifest={data.manifest}
                      objects={data.objetos}
                      selected={selected}
                      interactive={!maximized}
                      request={currentRequest}
                      onSelect={select}
                      onFail={failed}
                      onCamera={camera}
                      initialCamera={initialCamera}
                      quality={quality}
                      light={light}
                      onQuality={reportQuality}
                    />
                  </Suspense>
                </SceneBoundary>
              )}
              {noWebGL && (
                <div className="unit-map-fallback">
                  <h2>Mapa em lista</h2>
                  <p>
                    A visualização 3D está indisponível neste dispositivo. Os mesmos locais,
                    documentos e PET continuam acessíveis.
                  </p>
                </div>
              )}
              <div className="unit-map-toolbar" aria-label="Navegação do mapa">
                <div>
                  {(["normal", "superior", "angular"] as CameraMode[]).map((v) => (
                    <button
                      key={v}
                      aria-pressed={mode === v}
                      onClick={() => onSearch({ camera: v })}
                    >
                      {v === "normal" ? "Normal" : v === "superior" ? "Superior" : "Angular"}
                    </button>
                  ))}
                </div>
                <button
                  aria-label="Enquadrar unidade"
                  title="Enquadrar unidade"
                  onClick={() => setRequest({ mode, serial: request.serial + 1, view: "unit" })}
                >
                  <Expand size={19} />
                </button>
                <GraphicsMenu
                  choice={quality}
                  active={activeProfile}
                  limit={graphicsLimit}
                  light={light}
                  onChoice={chooseQuality}
                  onLight={setLight}
                />
                <button aria-expanded={listOpen || noWebGL} onClick={() => setListOpen(!listOpen)}>
                  <List size={18} /> Locais
                </button>
              </div>
              {(listOpen || noWebGL) && (
                <section className="unit-map-list" aria-label="Locais da cena">
                  <div>
                    <h2>Equipamentos externos</h2>
                    {!noWebGL && (
                      <button onClick={() => setListOpen(false)} aria-label="Fechar lista">
                        <X size={18} />
                      </button>
                    )}
                  </div>
                  <label>
                    Buscar TAG ou apelido
                    <input
                      type="search"
                      value={term}
                      placeholder="EC 25, S01, SA 05, AS 05…"
                      onChange={(e) => setTerm(e.target.value)}
                    />
                  </label>
                  {visible.map((o) => (
                    <button
                      key={o.local_id}
                      onClick={() => select(o.chave)}
                      aria-pressed={identity?.local_id === o.local_id}
                    >
                      <strong>{o.tag}</strong>
                      <span>{o.titulo}</span>
                    </button>
                  ))}
                  <Link to={String(`${base}/locais`)} search={{ ...search, local: "", objeto: "" }}>
                    Todos os locais e setores da unidade
                  </Link>
                  <Link to={String(`${base}/pets`)} search={{ ...search, local: "" }}>
                    Histórico de PETs da unidade
                  </Link>
                </section>
              )}
            </div>
            {selected && (
              <UnitMapPanel
                key={identity?.local_id ?? selected}
                scope={scope}
                user={user}
                norma={norma}
                search={search}
                contexto={contexto}
                data={data}
                selected={selected}
                row={safeRow}
                loading={detail.isPending}
                error={detail.error}
                retry={() => {
                  void detail.refetch();
                }}
                saved={() => {
                  void cache.invalidateQueries({ queryKey: ["nr", org] });
                }}
                onSearch={onSearch}
                onFocus={() => setRequest({ mode, serial: request.serial + 1, focus: selected })}
              />
            )}
            <p className="unit-map-caption">
              Implantação aproximada · medidas em metros · {data.objetos.length} silos vinculados
            </p>
          </div>
          <details className="unit-map-sources">
            <summary>Referências e limites da implantação</summary>
            {data.manifest.provenance.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </details>
          {search.local && !identity && (
            <p role="alert">O local informado não pertence à cena autorizada desta unidade.</p>
          )}
        </>
      )}
    </div>
  );
}
