import { useMemo, useState, type KeyboardEvent, type Ref } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Factory,
  Focus,
  GitCommitHorizontal,
  Map as MapIcon,
  X,
} from "lucide-react";
import { lvhfAppearance, lvhfState, lvhfSwatch } from "./lvhf-appearance";
import type { CruzObject } from "./scene-types";
import { SectorIcon } from "./sector-visual";
import "./structure-browser.css";

const filters = [
  { id: "todos", label: "Todos" },
  { id: "setor", label: "Setores" },
  { id: "estrutura", label: "Estruturas" },
  { id: "componente", label: "Componentes" },
  { id: "lvhf", label: "LVHF" },
] as const;

export type StructureFilter = (typeof filters)[number]["id"];

const kinds = {
  setor: "Setor",
  estrutura: "Estrutura",
  componente: "Componente",
  lvhf: "Linha de vida",
} satisfies Record<CruzObject["kind"], string>;

const icons = { setor: MapIcon, estrutura: Factory, componente: Box, lvhf: GitCommitHorizontal };

function catalogTree(objects: CruzObject[]) {
  const byId = new Map(objects.map((item) => [item.id, item]));
  const children = new Map<string, CruzObject[]>();
  const roots = objects.filter((item) => !item.parent || !byId.has(item.parent));
  for (const item of objects) {
    if (!item.parent || !byId.has(item.parent)) continue;
    const siblings = children.get(item.parent) ?? [];
    siblings.push(item);
    children.set(item.parent, siblings);
  }
  function parents(item: CruzObject) {
    const chain: CruzObject[] = [];
    for (let id = item.parent; id && id !== item.id;) {
      const parent = byId.get(id);
      if (!parent || chain.includes(parent)) break;
      chain.unshift(parent);
      id = parent.parent;
    }
    return chain;
  }
  return { byId, children, roots, parents };
}

function Pictogram({ sector }: { sector: CruzObject }) {
  return (
    <span className="ca-browser-icon" aria-hidden="true">
      <SectorIcon id={sector.id} size={42} />
    </span>
  );
}

function componentCode(item: CruzObject) {
  if (item.kind === "componente") return item.aliases?.find((alias) => /^\d+(\.\d+)?$/.test(alias));
  return undefined;
}

function ItemLabel({ item, path }: { item: CruzObject; path?: string }) {
  const code = componentCode(item);
  const status = lvhfState(item.status);
  return (
    <span className="ca-browser-label">
      <strong>{item.name}</strong>
      <span className="ca-browser-meta">
        {kinds[item.kind]}
        {code ? " · " + code : ""}
        {path && " · " + path}
        {item.status && (
          <span className="ca-browser-status">
            {status && <span aria-hidden="true" style={{ background: lvhfSwatch(status) }} />}
            {status ? lvhfAppearance[status].label : item.status}
          </span>
        )}
      </span>
    </span>
  );
}

export function StructureBrowser({
  objects,
  matches,
  query,
  filter,
  onFilter,
  selectedId,
  onChoose,
  onUnit,
  onClose,
  resultsRef,
}: {
  objects: CruzObject[];
  matches: CruzObject[];
  query: string;
  filter: StructureFilter;
  onFilter: (filter: StructureFilter) => void;
  selectedId: string | null;
  onChoose: (item: CruzObject) => void;
  onUnit: () => void;
  onClose: () => void;
  resultsRef?: Ref<HTMLDivElement>;
}) {
  const tree = useMemo(() => catalogTree(objects), [objects]);
  const selected = selectedId ? tree.byId.get(selectedId) : undefined;
  const ancestry = new Set(selected ? tree.parents(selected).map((item) => item.id) : []);
  const [expanded, setExpanded] = useState(() => ancestry);
  const searching = query.trim().length > 0 || filter !== "todos";
  const groups = useMemo(() => {
    if (!searching) return [];
    const grouped = new Map<CruzObject | undefined, { item: CruzObject; path: string }[]>();
    for (const item of matches) {
      const parents = tree.parents(item);
      const sector =
        item.kind === "setor" ? item : parents.find((parent) => parent.kind === "setor");
      const rows = grouped.get(sector) ?? [];
      rows.push({
        item,
        path: parents
          .filter((parent) => parent.kind !== "setor")
          .map((parent) => parent.name)
          .join(" / "),
      });
      grouped.set(sector, rows);
    }
    return [...grouped];
  }, [matches, searching, tree]);

  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function focusRow(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-ca-select]"),
    );
    if (!buttons.length) return;
    const row = (event.target as HTMLElement).closest(".ca-browser-row");
    const current = buttons.indexOf(
      row?.querySelector<HTMLButtonElement>("[data-ca-select]") ??
        (document.activeElement as HTMLButtonElement),
    );
    event.preventDefault();
    const next =
      current < 0
        ? event.key === "ArrowDown"
          ? 0
          : buttons.length - 1
        : current + (event.key === "ArrowDown" ? 1 : -1);
    buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
  }

  function renderBranch(item: CruzObject) {
    const children = tree.children.get(item.id) ?? [];
    const isOpen = expanded.has(item.id);
    const isSector = item.kind === "setor";
    const Icon = icons[item.kind];
    const branchId = `ca-branch-${item.id}`;
    const code = componentCode(item);
    const disclosureLabel = `${isOpen ? "Recolher" : "Expandir"} ${item.name}${code ? " · " + code : ""}`;
    return (
      <li
        key={item.id}
        className={isSector ? "ca-browser-sector" : undefined}
        data-setor={isSector ? item.id : undefined}
      >
        <div className="ca-browser-row" data-ancestry={ancestry.has(item.id) || undefined}>
          {isSector ? (
            <>
              <button
                type="button"
                className="ca-browser-entry"
                data-ca-select
                aria-current={selectedId === item.id || undefined}
                aria-expanded={isOpen}
                aria-controls={isOpen ? branchId : undefined}
                onClick={() => toggle(item.id)}
              >
                <Pictogram sector={item} />
                <span className="ca-browser-label">
                  <strong>{item.name}</strong>
                  <span className="ca-browser-meta">
                    {children.length} {children.length === 1 ? "estrutura" : "estruturas"}
                  </span>
                </span>
                <ChevronDown aria-hidden="true" size={17} className="ca-browser-chevron" />
              </button>
              <button
                type="button"
                className="ca-browser-disclosure"
                aria-label={`Enquadrar setor ${item.name}`}
                title={`Enquadrar setor ${item.name}`}
                onClick={() => onChoose(item)}
              >
                <Focus aria-hidden="true" size={18} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ca-browser-entry"
                data-ca-select
                aria-pressed={selectedId === item.id}
                onClick={() => onChoose(item)}
              >
                <Icon className="ca-browser-kind" aria-hidden="true" size={17} />
                <ItemLabel item={item} />
              </button>
              {children.length > 0 && (
                <button
                  type="button"
                  className="ca-browser-disclosure"
                  aria-label={disclosureLabel}
                  title={disclosureLabel}
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? branchId : undefined}
                  onClick={() => toggle(item.id)}
                >
                  <ChevronDown aria-hidden="true" size={17} className="ca-browser-chevron" />
                </button>
              )}
            </>
          )}
        </div>
        {isOpen && children.length > 0 && (
          <ul className="ca-browser-branch" id={branchId}>
            {children.map(renderBranch)}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div
      className="ca-pop ca-browser"
      id="ca-search-results"
      aria-label="Índice da unidade"
      role="region"
    >
      <header className="ca-browser-head">
        <div className="ca-browser-title">
          <div>
            <h2>{searching ? "Resultados no mapa" : "Explorar a unidade"}</h2>
            <p role="status">
              {searching
                ? `${matches.length} ${matches.length === 1 ? "registro" : "registros"}`
                : `${tree.roots.length} setores`}
            </p>
          </div>
          <button type="button" aria-label="Fechar lista" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="ca-browser-filters" role="group" aria-label="Filtrar resultados">
          {filters.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => onFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="ca-browser-content" ref={resultsRef} onKeyDown={focusRow}>
        {searching ? (
          groups.length ? (
            groups.map(([sector, rows]) => (
              <section
                className="ca-browser-group"
                aria-label={sector?.name ?? "Outros registros"}
                key={sector?.id ?? "outros"}
                data-setor={sector?.id}
              >
                {sector && rows.some(({ item }) => item.id !== sector.id) && (
                  <h3>
                    <Pictogram sector={sector} />
                    {sector.name}
                  </h3>
                )}
                <ul>
                  {rows.map(({ item, path }) => {
                    const Icon = icons[item.kind];
                    return (
                      <li key={item.id}>
                        <div className="ca-browser-row">
                          <button
                            className="ca-browser-entry"
                            type="button"
                            data-ca-select
                            aria-pressed={selectedId === item.id}
                            onClick={() => onChoose(item)}
                          >
                            {item.kind === "setor" ? (
                              <Pictogram sector={item} />
                            ) : (
                              <Icon className="ca-browser-kind" aria-hidden="true" size={17} />
                            )}
                            <ItemLabel item={item} path={path} />
                            <ChevronRight aria-hidden="true" size={16} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          ) : (
            <p className="ca-browser-empty">Nenhum resultado para esta busca.</p>
          )
        ) : (
          <>
            <button
              className="ca-browser-unit"
              type="button"
              aria-pressed={selectedId === "unidade"}
              onClick={onUnit}
            >
              <Factory aria-hidden="true" size={20} /> Ficha da unidade{" "}
              <ChevronRight aria-hidden="true" size={16} />
            </button>
            <ul className="ca-browser-tree">{tree.roots.map(renderBranch)}</ul>
          </>
        )}
      </div>
    </div>
  );
}
