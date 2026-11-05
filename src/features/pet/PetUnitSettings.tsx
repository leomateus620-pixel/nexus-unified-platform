import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { consultarAcessoOperacional } from "@/features/operacao/operacao.functions";
import { petExecutar, petOpcoes } from "./pet.functions";
import { PetModelos } from "./PetModelos";
import { PetCommandIntents } from "./command-intents";
import type { PetExecute, PetOpcoes } from "./ui-types";
import { ErrorState } from "@/components/nexus/Page";
/** Existing organizational model workflow, now reachable from the unit's PET area. */
export function PetUnitSettings({ org, user }: { org: string; user: string }) {
  const accessFn = useServerFn(consultarAcessoOperacional),
    load = useServerFn(petOpcoes),
    execute = useServerFn(petExecutar),
    cache = useQueryClient();
  const access = useQuery({
    queryKey: ["pet", org, user, "acesso"],
    queryFn: () => accessFn({ data: { organization_id: org } }),
    retry: false,
  });
  const options = useQuery({
    queryKey: ["pet", org, user, "opcoes"],
    enabled: !!access.data?.gerirOperacao,
    queryFn: () => load({ data: { organization_id: org } }) as Promise<PetOpcoes>,
    retry: false,
  });
  const lock = useRef(false),
    intents = useRef(new PetCommandIntents());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const command: PetExecute = async (value) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await execute({
        data: { organization_id: org, comando: { ...value, chave: intents.current.key(value) } },
      });
      intents.current.confirmed(value);
      await cache.invalidateQueries({ queryKey: ["pet", org] });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar.");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!access.data?.gerirOperacao) return null;
  if (options.isError)
    return <ErrorState error={options.error} onRetry={() => options.refetch()} />;
  return options.data ? (
    <PetModelos
      options={options.data}
      onCommand={command}
      busy={busy}
      canReview={access.data.revisarOperacao}
      commandError={error}
    />
  ) : null;
}
