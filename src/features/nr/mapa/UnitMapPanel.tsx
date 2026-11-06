import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Crosshair, Maximize2, Minimize2, X } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/nexus/Page";
import { PetUnitPanel } from "@/features/pet/PetUnitPanel";
import { PetDemoEntry, PetDemoPanel } from "@/features/pet/demo/PetDemoPanel";
import { useDemoContext, type DemoScope } from "@/features/pet/demo/hooks";
import { NrLocalDetail } from "../NrLocalDetail";
import { NrPhotoGallery } from "../NrPhotoGallery";
import { NrContratacao } from "../NrContratacao";
import type { NrSearch } from "../NrWorkspace";
import type { Norma, NrContexto, NrRecord } from "../domain";
import type { MapContext } from "./types";

type Props = {
  scope: DemoScope;
  user: string;
  norma: Norma;
  search: NrSearch;
  contexto: NrContexto;
  data: MapContext;
  selected: string;
  row: NrRecord | undefined;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  saved: () => void;
  onSearch: (patch: Partial<NrSearch>) => void;
  onFocus: () => void;
};
export function UnitMapPanel({
  scope,
  user,
  norma,
  search,
  contexto,
  data,
  selected,
  row,
  loading,
  error,
  retry,
  saved,
  onSearch,
  onFocus,
}: Props) {
  const identity = data.objetos.find((o) => o.chave === selected);
  const silo = data.manifest?.silos.find((s) => s.key === selected);
  const building = data.manifest?.buildings.find((b) => b.key === selected);
  const localScope = { ...scope, ...(identity ? { local_id: identity.local_id } : {}) };
  const demo = useDemoContext(localScope, user);
  const dedicated = search.visualizacao === "dedicada";
  const expanded = search.visualizacao === "expandida" || dedicated;
  const panel =
    search.painel === "resumo" || !search.painel || search.painel === "pendencias"
      ? "ficha"
      : search.painel;
  const root = useRef<HTMLElement>(null),
    expandButton = useRef<HTMLButtonElement>(null);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const wasExpanded = useRef(false);
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    tabsRef.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [panel, expanded]);
  useEffect(() => {
    if (!expanded && wasExpanded.current) expandButton.current?.focus();
    wasExpanded.current = expanded;
    if (!expanded) return;
    expandButton.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('[role="alertdialog"]')) return;
      if (e.key === "Escape" && !e.defaultPrevented) {
        const t = e.target instanceof HTMLElement ? e.target : null;
        const openDetails = t?.closest("details[open]");
        if (openDetails && root.current?.contains(openDetails) && t?.tagName === "SUMMARY") {
          e.preventDefault();
          (openDetails as HTMLDetailsElement).open = false;
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onSearchRef.current({ visualizacao: "compacta" });
      }
      if (e.key !== "Tab") return;
      const items = [
        ...(root.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
        ) ?? []),
      ].filter((el) => el.getClientRects().length > 0 && !el.closest("[hidden]"));
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    const element = root.current;
    element?.addEventListener("keydown", listener);
    return () => element?.removeEventListener("keydown", listener);
  }, [expanded]);
  const open = (id: string, step = 0) =>
    onSearch({ painel: "pet", petDemo: id, etapaDemo: step, visualizacao: "expandida" });
  const base = norma === "NR33" ? "/nr-33" : "/nr-35";
  return (
    <aside
      ref={root}
      className="unit-map-panel"
      data-view={expanded ? "expanded" : "compact"}
      aria-label={`${identity?.tag ?? "Infraestrutura"} · ${identity?.titulo ?? building?.name ?? "Passarela compartilhada"}`}
    >
      <header className="unit-map-panel-top">
        <div className="unit-map-panel-identity">
          <p>
            <span className="unit-map-tag">{identity?.tag ?? "Infraestrutura"}</span>
          </p>
          <h2>{identity?.titulo ?? building?.name ?? "Passarela compartilhada"}</h2>
          {!!silo?.aliases.length && (
            <span className="unit-map-aliases" aria-label="Outras identificações">
              {silo.aliases.join(" · ")}
            </span>
          )}
        </div>
        {identity && (
          <div
            className="unit-map-panel-intro"
            hidden={expanded && panel === "pet" && !!search.petDemo}
          >
            <PetDemoEntry
              scope={localScope}
              user={user}
              onOpen={open}
              variant={expanded ? "toolbar" : undefined}
            />
            {demo.isPending ? (
              <span className="unit-map-pet-loading" role="status">
                Carregando PET…
              </span>
            ) : demo.isError ? (
              <ErrorState error={demo.error} onRetry={() => demo.refetch()} />
            ) : (
              !demo.data?.habilitado && (
                <button
                  className="pet-demo-primary"
                  onClick={() => onSearch({ painel: "pet", visualizacao: "expandida" })}
                >
                  Abrir PET
                </button>
              )
            )}
          </div>
        )}
        <div className="unit-map-panel-tools">
          {identity && (
            <button aria-label="Enquadrar silo" title="Enquadrar silo" onClick={onFocus}>
              <Crosshair size={18} />
            </button>
          )}
          <button
            ref={expandButton}
            aria-label={expanded ? "Minimizar ficha" : "Expandir ficha"}
            title={expanded ? "Minimizar ficha (Esc)" : "Expandir ficha"}
            onClick={() => onSearch({ visualizacao: expanded ? "compacta" : "expandida" })}
          >
            {expanded ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </button>
          <button
            aria-label="Fechar ficha"
            title="Fechar ficha"
            onClick={() =>
              onSearch({
                local: "",
                objeto: "",
                painel: "resumo",
                petDemo: "",
                etapaDemo: 0,
                visualizacao: "compacta",
              })
            }
          >
            <X size={20} />
          </button>
        </div>
      </header>
      {identity ? (
        <>
          <nav className="unit-map-tabs" aria-label="Conteúdo do equipamento" ref={tabsRef}>
            {(["ficha", "acervo", "pet", "historico"] as const).map((tab) => (
              <button
                key={tab}
                aria-pressed={panel === tab}
                aria-current={panel === tab ? "page" : undefined}
                onClick={() => onSearch({ painel: tab })}
              >
                {
                  { ficha: "Visão geral", acervo: "Acervo", pet: "PET", historico: "Histórico" }[
                    tab
                  ]
                }
              </button>
            ))}
          </nav>
          <div
            className="unit-map-panel-content"
            data-workflow={panel === "pet" && !!search.petDemo}
          >
            <div hidden={panel !== "pet"} className="unit-map-pet-content">
              {demo.data?.habilitado ? (
                <PetDemoPanel
                  scope={localScope}
                  user={user}
                  search={search}
                  onSearch={onSearch}
                  active={panel === "pet"}
                />
              ) : (
                panel === "pet" &&
                !demo.isPending &&
                !demo.isError && (
                  <PetUnitPanel
                    scope={scope}
                    user={user}
                    localId={identity.local_id}
                    search={search}
                    returnTo="mapa-3d"
                  />
                )
              )}
            </div>
            {panel === "historico" && (
              <>
                <h3 className="unit-map-section-title">Histórico de PET</h3>
                <PetDemoPanel
                  scope={localScope}
                  user={user}
                  search={{ ...search, petDemo: "" }}
                  onSearch={onSearch}
                />
                <details className="unit-map-provenance">
                  <summary>Histórico técnico e operacional</summary>
                  {row && (
                    <NrLocalDetail
                      row={row}
                      norma="NR33"
                      contexto={contexto}
                      embedded
                      search={{ ...search, ficha: "historico" }}
                      onSearch={(patch) => onSearch({ ...patch, painel: "ficha" })}
                      onSaved={saved}
                    />
                  )}
                  <PetUnitPanel
                    scope={scope}
                    user={user}
                    localId={identity.local_id}
                    search={search}
                    returnTo="mapa-3d"
                  />
                </details>
              </>
            )}
            {(panel === "ficha" || panel === "acervo") &&
              (loading ? (
                <LoadingState label="Consultando equipamento…" />
              ) : error ? (
                <ErrorState error={error} onRetry={retry} />
              ) : !row ? (
                <p role="alert">Registro indisponível neste contexto.</p>
              ) : (
                <>
                  {panel === "ficha" && (
                    <>
                      <p className="unit-map-document-status">
                        {row.resumo_tecnico
                          ? `${row.resumo_tecnico.documentos_total} documentos · ${row.resumo_tecnico.imagens_total} imagens`
                          : "Informações do equipamento"}
                      </p>
                      {Array.isArray(row.dados["fotos"]) && row.dados["fotos"].length > 0 && (
                        <div className="unit-map-preview-photo">
                          <NrPhotoGallery
                            org={scope.organization_id}
                            localId={identity.local_id}
                            value={row.dados["fotos"].slice(0, 1)}
                            context={identity.titulo}
                            title="Foto de campo"
                          />
                        </div>
                      )}
                    </>
                  )}
                  {expanded || panel === "acervo" ? (
                    <NrLocalDetail
                      row={row}
                      norma={panel === "acervo" ? norma : "NR33"}
                      contexto={contexto}
                      embedded
                      variant={panel === "acervo" ? "acervo" : "padrao"}
                      acervoExtra={
                        panel === "acervo" ? (
                          <details className="nr-acervo-contratados">
                            <summary>Documentos contratados</summary>
                            <NrContratacao scope={scope} compact />
                          </details>
                        ) : undefined
                      }
                      search={{
                        ...search,
                        ficha:
                          panel === "acervo"
                            ? search.ficha === "fotos"
                              ? "fotos"
                              : "documentos"
                            : (search.ficha ?? "identificacao"),
                      }}
                      onSearch={(patch) =>
                        onSearch({
                          ...patch,
                          painel:
                            patch.ficha === "documentos" || patch.ficha === "fotos"
                              ? "acervo"
                              : "ficha",
                        })
                      }
                      onSaved={saved}
                    />
                  ) : (
                    <button
                      className="pet-demo-secondary unit-map-full-detail"
                      onClick={() => onSearch({ visualizacao: "expandida" })}
                    >
                      <Maximize2 size={16} /> Ver ficha completa
                    </button>
                  )}
                  {panel === "ficha" && (
                    <>
                      <details className="unit-map-provenance">
                        <summary>Pendências e avaliações</summary>
                        <Link
                          to={String(`${base}/pendencias`)}
                          search={{ ...search, local: identity.local_id }}
                        >
                          Pendências deste local
                        </Link>
                        <Link to={String(`${base}/pendencias`)} search={{ ...search, local: "" }}>
                          Pendências da unidade
                        </Link>
                        <button
                          onClick={() =>
                            onSearch({
                              painel: "ficha",
                              ficha: "avaliacao",
                              visualizacao: "expandida",
                            })
                          }
                        >
                          Itens de avaliação
                        </button>
                      </details>
                      <details className="unit-map-provenance">
                        <summary>Fontes e conferência da representação</summary>
                        <p>{silo?.source}</p>
                        <p>{silo?.note}</p>
                        <p>
                          Corpo reto: {silo?.straight} m · cone: {silo?.cone} m · diâmetro:{" "}
                          {silo?.diameter} m. Cotas internas de referência; apoios, cobertura e
                          posição são aproximações.
                        </p>
                      </details>
                    </>
                  )}
                </>
              ))}
          </div>
        </>
      ) : (
        <div className="unit-map-panel-content">
          <p>
            {building?.note ??
              "Passarela e transportador atendem ao conjunto. Consulte cada silo para acessar sua ficha e PET."}
          </p>
        </div>
      )}
    </aside>
  );
}
