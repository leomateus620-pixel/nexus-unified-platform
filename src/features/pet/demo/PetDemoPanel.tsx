import { useState } from "react";
import { ArrowRight, Plus, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import type { NrSearch } from "@/features/nr/NrWorkspace";
import { demoStateLabel, type DemoSession } from "./domain";
import { useDemoContext, useDemoList, type DemoScope } from "./hooks";
import { PetDemoWorkspace } from "./PetDemoWorkspace";
import "./demo.css";
type Props = {
  scope: DemoScope;
  user: string;
  search: NrSearch;
  onSearch?: ((value: Partial<NrSearch>) => void) | undefined;
  active?: boolean;
};
export function PetDemoEntry({
  scope,
  user,
  onOpen,
  variant,
}: {
  scope: DemoScope;
  user: string;
  onOpen: (id: string, step?: number) => void;
  /** "toolbar": compact horizontal layout for the expanded map sheet header. */
  variant?: "toolbar" | undefined;
}) {
  const cls = variant === "toolbar" ? "pet-demo-entry pet-demo-entry-toolbar" : "pet-demo-entry";
  const ctx = useDemoContext(scope, user),
    list = useDemoList(scope, user, !!ctx.data?.habilitado);
  if (!ctx.data?.habilitado) return null;
  if (list.isPending)
    return (
      <div className={cls}>
        <span className="pet-demo-badge">Demonstração</span>
        <button disabled>Carregando PETs…</button>
      </div>
    );
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const rows = list.data?.registros ?? [],
    latest = rows[0];
  return (
    <div className={cls}>
      <span className="pet-demo-badge">Demonstração</span>
      {latest ? (
        <button
          className="pet-demo-primary"
          onClick={() => onOpen(rows.length === 1 ? latest.id : "", latest.etapa)}
        >
          Continuar PET <ArrowRight size={18} />
        </button>
      ) : ctx.data.pode_editar ? (
        <button className="pet-demo-primary" onClick={() => onOpen("nova", 0)}>
          Iniciar PET <ArrowRight size={18} />
        </button>
      ) : (
        <button onClick={() => onOpen("")}>Consultar PETs</button>
      )}
      {latest && (
        <span className="pet-demo-entry-meta">
          {list.data?.total === 1
            ? `${latest.numero} · ${demoStateLabel[latest.estado]}`
            : `${list.data?.total} demonstrações em andamento`}
        </span>
      )}
      {latest && ctx.data.pode_editar && (
        <button className="pet-demo-text" onClick={() => onOpen("nova", 0)}>
          <Plus size={14} /> Iniciar outra
        </button>
      )}
    </div>
  );
}
export function PetDemoPanel({ scope, user, search, onSearch, active = true }: Props) {
  const ctx = useDemoContext(scope, user),
    navigate = useNavigate();
  const [term, setTerm] = useState(""),
    [group, setGroup] = useState<"andamento" | "concluidas">("andamento"),
    [page, setPage] = useState(0);
  const list = useDemoList(scope, user, !!ctx.data?.habilitado, term, group, page);
  const open = (id: string, s?: DemoSession) => {
    const patch: Partial<NrSearch> = {
      painel: "pet",
      petDemo: id,
      etapaDemo: s?.etapa ?? 0,
      visualizacao: "expandida",
      ...(s ? { local: s.local_id, objeto: "" } : {}),
    };
    if (onSearch) onSearch(patch);
    else
      void navigate({
        to: String(`${scope.norma === "NR33" ? "/nr-33" : "/nr-35"}/mapa-3d`),
        search: { ...search, ...patch },
      });
  };
  if (ctx.isPending) return <LoadingState label="Carregando demonstração…" />;
  if (ctx.isError) return <ErrorState error={ctx.error} onRetry={() => ctx.refetch()} />;
  if (!ctx.data?.habilitado) return null;
  if (scope.local_id && search.petDemo && onSearch)
    return (
      <PetDemoWorkspace
        key={`${scope.organization_id}:${user}:${scope.local_id}`}
        scope={scope}
        user={user}
        id={search.petDemo}
        step={search.etapaDemo ?? 0}
        onSearch={onSearch}
        active={active}
      />
    );
  return (
    <section className="pet-demo" aria-label="PETs de demonstração">
      <div className="pet-demo-title">
        <div>
          <span className="pet-demo-eyebrow">Demonstração</span>
          <h3>{scope.local_id ? "PET deste silo" : "PETs da unidade"}</h3>
        </div>
        {scope.local_id && ctx.data.pode_editar && (
          <button className="pet-demo-primary" onClick={() => open("nova")}>
            <Plus size={17} /> Iniciar PET
          </button>
        )}
      </div>
      <div className="pet-demo-list-tools">
        <div className="pet-demo-segments">
          <button
            aria-pressed={group === "andamento"}
            onClick={() => {
              setGroup("andamento");
              setPage(0);
            }}
          >
            Em andamento
          </button>
          <button
            aria-pressed={group === "concluidas"}
            onClick={() => {
              setGroup("concluidas");
              setPage(0);
            }}
          >
            Concluídas
          </button>
        </div>
        {((list.data?.total ?? 0) > 0 || term) && (
          <label>
            <Search size={16} />
            <input
              aria-label="Buscar demonstrações"
              placeholder="Número, silo ou atividade"
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setPage(0);
              }}
            />
          </label>
        )}
      </div>
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data?.total ? (
        <EmptyState
          title={
            group === "andamento" ? "Tudo pronto para começar" : "Nenhuma demonstração concluída"
          }
          hint={
            scope.local_id
              ? "Inicie uma PET para explorar as etapas deste silo."
              : "Selecione um silo no mapa para iniciar uma PET."
          }
        />
      ) : (
        <div className="pet-demo-list">
          {list.data.registros.map((s) => (
            <button key={s.id} onClick={() => open(s.id, s)}>
              <span>
                <strong>{s.numero}</strong>
                <small>
                  {s.identificacao.tag} · {demoStateLabel[s.estado]}
                </small>
                <span>{s.conteudo.atividade}</span>
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
      )}
      {(list.data?.total ?? 0) > 10 && (
        <div className="pet-demo-pagination">
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>
            Página {page + 1} · {list.data?.total} registros
          </span>
          <button
            disabled={(page + 1) * 10 >= (list.data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}
