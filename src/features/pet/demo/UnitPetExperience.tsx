import { useState } from "react";
import { ErrorState, LoadingState } from "@/components/nexus/Page";
import type { NrSearch } from "@/features/nr/NrWorkspace";
import { PetUnitPanel } from "../PetUnitPanel";
import { PetDemoPanel } from "./PetDemoPanel";
import { useDemoContext, type DemoScope } from "./hooks";

export function UnitPetExperience({
  scope,
  user,
  search,
  localId,
  onLocal,
}: {
  scope: DemoScope;
  user: string;
  search: NrSearch;
  localId?: string | undefined;
  onLocal: (local: string) => void;
}) {
  const ctx = useDemoContext(scope, user),
    [operational, setOperational] = useState(false);
  if (ctx.isPending) return <LoadingState label="Carregando PETs da unidade…" />;
  if (ctx.isError) return <ErrorState error={ctx.error} onRetry={() => ctx.refetch()} />;
  return (
    <>
      {ctx.data?.habilitado && (
        <div className="pet-demo pet-demo-list-tools">
          <div className="pet-demo-segments" aria-label="Tipo de PET">
            <button aria-pressed={!operational} onClick={() => setOperational(false)}>
              Demonstrações
            </button>
            <button aria-pressed={operational} onClick={() => setOperational(true)}>
              Operação real
            </button>
          </div>
        </div>
      )}
      {ctx.data?.habilitado && !operational ? (
        <PetDemoPanel
          scope={{ ...scope, ...(localId ? { local_id: localId } : {}) }}
          user={user}
          search={search}
        />
      ) : (
        <PetUnitPanel
          scope={scope}
          user={user}
          search={search}
          localId={localId}
          onLocal={onLocal}
        />
      )}
    </>
  );
}
