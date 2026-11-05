import { Component, lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Box, Expand, List, X, ChevronUp, ChevronDown } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/nexus/Page";
import type { NrSearch } from "../NrWorkspace";
import type { Norma, NrContexto, NrRecord } from "../domain";
import { nrConsultar } from "../nr.functions";
import { nrMapaContexto } from "./mapa.functions";
import type { CameraMode, MapContext } from "./types";
import type { CameraRequest, CameraSnapshot } from "./UnitScene";
import { NrLocalDetail } from "../NrLocalDetail";
import { NrPhotoGallery } from "../NrPhotoGallery";
import { PetUnitPanel } from "@/features/pet/PetUnitPanel";
import { NrContratacao } from "../NrContratacao";
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
    [expanded, setExpanded] = useState(!!search.painel && search.painel !== "resumo"),
    [noWebGL, setNoWebGL] = useState(false);
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
      onSearch({ local: item?.local_id ?? "", objeto: key, painel: "resumo" });
      setExpanded(false);
      setListOpen(false);
    },
    [data, onSearch],
  );
  const silo = data?.manifest?.silos.find((s) => s.key === selected),
    building = data?.manifest?.buildings.find((b) => b.key === selected);
  const visible =
    data?.objetos.filter((o) =>
      `${o.tag} ${o.titulo} ${o.aliases.join(" ")} ${data.manifest?.silos.find((s) => s.key === o.chave)?.aliases.join(" ")}`
        .toLocaleLowerCase("pt-BR")
        .includes(term.toLocaleLowerCase("pt-BR")),
    ) ?? [];
  const panel = search.painel ?? "resumo";
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
      <header className="unit-map-header">
        <Link
          to={base}
          search={{ ...search, local: "", objeto: "" }}
          aria-label="Voltar ao painel da unidade"
        >
          <ArrowLeft size={19} />
        </Link>
        <div>
          <p>
            {contexto.clientes.find((c) => c.id === search.cliente)?.nome} ·{" "}
            {norma === "NR33" ? "NR-33" : "NR-35"}
          </p>
          <h1>
            <Box size={18} /> {unit.nome}
          </h1>
        </div>
        <Link to={String(`${norma === "NR33" ? "/nr-35" : "/nr-33"}/mapa-3d`)} search={search}>
          {norma === "NR33" ? "NR-35" : "NR-33"}
        </Link>
      </header>
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
          <div className="unit-map-stage" data-panel={!!selected}>
            {!noWebGL && (
              <SceneBoundary onFail={failed}>
                <Suspense fallback={<LoadingState label="Preparando terreno e equipamentos…" />}>
                  <UnitScene
                    manifest={data.manifest}
                    objects={data.objetos}
                    selected={selected}
                    request={currentRequest}
                    onSelect={select}
                    onFail={failed}
                    onCamera={camera}
                    initialCamera={initialCamera}
                    economy={
                      typeof window !== "undefined" &&
                      window.matchMedia("(max-width: 700px)").matches
                    }
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
                  <button key={v} aria-pressed={mode === v} onClick={() => onSearch({ camera: v })}>
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
            {selected && (
              <aside
                className="unit-map-panel"
                data-expanded={expanded}
                aria-label={
                  identity
                    ? `${identity.tag} · ${identity.titulo}`
                    : (building?.name ?? "Estrutura compartilhada")
                }
              >
                <div className="unit-map-panel-top">
                  <div>
                    <p>{identity?.tag ?? "Infraestrutura"}</p>
                    <h2>{identity?.titulo ?? building?.name ?? "Passarela compartilhada"}</h2>
                  </div>
                  <button
                    aria-label="Fechar ficha"
                    onClick={() => {
                      onSearch({ local: "", objeto: "", painel: "resumo" });
                      setExpanded(false);
                    }}
                  >
                    <X size={20} />
                  </button>
                </div>
                {identity ? (
                  <>
                    <p className="unit-map-alias">
                      {silo?.aliases.join(" · ")}
                      {!identity.posicao_confirmada && " · posição aproximada"}
                    </p>
                    <div className="unit-map-primary">
                      <button
                        onClick={() => {
                          onSearch({ painel: "pet" });
                          setExpanded(true);
                        }}
                      >
                        Operação da PET
                      </button>
                      <button
                        onClick={() =>
                          setRequest({ mode, serial: request.serial + 1, focus: selected })
                        }
                      >
                        Enquadrar silo
                      </button>
                      <button className="unit-map-expand" onClick={() => setExpanded(!expanded)}>
                        {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                        {expanded ? "Recolher" : "Abrir ficha"}
                      </button>
                    </div>
                    {detail.isPending ? (
                      <LoadingState label="Consultando equipamento…" />
                    ) : detail.isError ? (
                      <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
                    ) : !safeRow ? (
                      <p role="alert">Registro indisponível neste contexto.</p>
                    ) : (
                      <>
                        <p className="unit-map-document-status">
                          {safeRow.resumo_tecnico
                            ? `${safeRow.resumo_tecnico.documentos_total} documentos vinculados · ${safeRow.resumo_tecnico.imagens_total} imagens`
                            : "Consulte a situação documental no acervo."}
                        </p>
                        {!expanded &&
                          Array.isArray(safeRow.dados["fotos"]) &&
                          safeRow.dados["fotos"].length > 0 && (
                            <div className="unit-map-preview-photo">
                              <NrPhotoGallery
                                org={org}
                                localId={identity.local_id}
                                value={safeRow.dados["fotos"].slice(0, 1)}
                                context={identity.titulo}
                                title="Foto de campo"
                              />
                            </div>
                          )}
                        {expanded && (
                          <div className="unit-map-detail">
                            <nav aria-label="Conteúdo do equipamento">
                              {(["ficha", "acervo", "pendencias", "pet", "historico"] as const).map(
                                (tab) => (
                                  <button
                                    key={tab}
                                    aria-pressed={(panel === "resumo" ? "ficha" : panel) === tab}
                                    onClick={() => onSearch({ painel: tab })}
                                  >
                                    {
                                      {
                                        ficha: "Ficha",
                                        acervo: "Acervo",
                                        pendencias: "Pendências",
                                        pet: "PET",
                                        historico: "Histórico",
                                      }[tab]
                                    }
                                  </button>
                                ),
                              )}
                            </nav>
                            {norma === "NR35" && (
                              <p className="nx-pet-notice">
                                Ficha de origem NR-33. Documentos e pendências respeitam o recorte
                                NR-35. A PET continua sendo uma permissão de espaço confinado.
                              </p>
                            )}
                            {panel === "acervo" && <NrContratacao scope={scope} compact />}
                            {panel === "pet" ? (
                              <PetUnitPanel
                                scope={scope}
                                user={user}
                                localId={identity.local_id}
                                search={search}
                                returnTo="mapa-3d"
                              />
                            ) : panel === "pendencias" ? (
                              <div>
                                <p>
                                  Pendências específicas exigem vínculo explícito com este local.
                                  Pendências gerais não são atribuídas automaticamente.
                                </p>
                                <Link
                                  to={String(`${base}/pendencias`)}
                                  search={{ ...search, local: identity.local_id }}
                                >
                                  Pendências deste local
                                </Link>
                                <Link
                                  to={String(`${base}/pendencias`)}
                                  search={{ ...search, local: "" }}
                                >
                                  Pendências da unidade
                                </Link>
                                <button
                                  onClick={() => onSearch({ painel: "ficha", ficha: "avaliacao" })}
                                >
                                  Itens de avaliação
                                </button>
                              </div>
                            ) : (
                              <NrLocalDetail
                                row={safeRow}
                                norma={panel === "acervo" ? norma : "NR33"}
                                contexto={contexto}
                                embedded
                                search={{
                                  ...search,
                                  ficha:
                                    panel === "acervo"
                                      ? search.ficha === "fotos"
                                        ? "fotos"
                                        : "documentos"
                                      : panel === "historico"
                                        ? "historico"
                                        : (search.ficha ?? "identificacao"),
                                }}
                                onSearch={(patch) => onSearch({ ...patch, painel: "ficha" })}
                                onSaved={() =>
                                  void cache.invalidateQueries({ queryKey: ["nr", org] })
                                }
                              />
                            )}
                            <details className="unit-map-provenance">
                              <summary>Fontes e conferência da representação</summary>
                              <p>{silo?.source}</p>
                              <p>{silo?.note}</p>
                              <p>
                                Corpo reto: {silo?.straight} m · cone: {silo?.cone} m · diâmetro:{" "}
                                {silo?.diameter} m. Cotas internas de referência; apoios e cobertura
                                são aproximações.
                              </p>
                            </details>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <p>
                    {building?.note ??
                      "Passarela e transportador atendem ao conjunto. Este alvo não seleciona um silo nem herda sua PET."}
                  </p>
                )}
              </aside>
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
