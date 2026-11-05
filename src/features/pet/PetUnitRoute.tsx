import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useOrg } from "@/features/org/session";
import { LoadingState, ErrorState } from "@/components/nexus/Page";
import { nrSearchSchema } from "@/features/nr/route-state";
import { nrConsultar } from "@/features/nr/nr.functions";
import type { NrContexto, Norma } from "@/features/nr/domain";
import { petObter } from "./pet.functions";
import { PetWorkspace } from "./PetWorkspace";
import { PetConsulta } from "./PetConsulta";
import type { PetDetalhe } from "./ui-types";
import { z } from "zod";

/** Legacy links resolve by an authorized PET ID; URL context never grants access. */
export function PetUnitRoute({
  petId,
  norma,
  legacy = false,
}: {
  petId: string;
  norma?: Norma;
  legacy?: boolean;
}) {
  const session = useOrg(),
    get = useServerFn(petObter),
    consult = useServerFn(nrConsultar),
    navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const search = nrSearchSchema.parse(location.search);
  const valid = z.string().uuid().safeParse(petId).success;
  const detail = useQuery({
    queryKey: ["pet", session.data?.orgId, session.data?.userId, "route", petId],
    enabled: !!session.data && valid,
    queryFn: ({ signal }) =>
      get({
        data: { organization_id: session.data!.orgId, id: petId },
        signal,
      }) as unknown as Promise<PetDetalhe>,
    retry: false,
  });
  const actual = detail.data?.pet,
    origin = norma ?? actual?.norma_origem ?? "NR33";
  const context = useQuery({
    queryKey: ["nr", session.data?.orgId, session.data?.userId, origin, "contexto"],
    enabled: !!actual && !!session.data,
    queryFn: ({ signal }) =>
      consult({
        data: { organization_id: session.data!.orgId, norma: origin, recurso: "contexto" },
        signal,
      }) as Promise<NrContexto>,
    retry: false,
  });
  const unit = context.data?.unidades.find((u) => u.id === actual?.unidade_id);
  const canRoute =
    !!actual && !!unit && (!actual.cliente_id || actual.cliente_id === unit.cliente_id);
  useEffect(() => {
    if (legacy && canRoute && actual && unit)
      void navigate({
        to: String(`${origin === "NR33" ? "/nr-33" : "/nr-35"}/pets/${petId}`),
        search: {
          ...nrSearchSchema.parse({}),
          cliente: unit.cliente_id,
          unidade: unit.id,
          local: actual.local_nr_id ?? "",
          retorno: "pets",
        },
        replace: true,
      });
  }, [legacy, canRoute, actual, unit, origin, petId, navigate]);
  if (!valid) return <p role="alert">Identificador de PET inválido.</p>;
  if (session.isError || detail.isError || (!legacy && context.isError))
    return (
      <ErrorState
        error={session.error || detail.error || context.error}
        onRetry={() => {
          void detail.refetch();
          void context.refetch();
        }}
      />
    );
  if (session.isPending || detail.isPending || context.isPending)
    return <LoadingState label="Resolvendo o contexto autorizado da PET…" />;
  if (legacy && !canRoute && actual)
    return (
      <>
        <p role="note" className="nr-notice">
          PET legada: correspondência com contexto NR pendente. A consulta permanece sujeita às
          atribuições deste registro.
        </p>
        <PetWorkspace petId={petId} />
      </>
    );
  if (legacy && canRoute) return <LoadingState label="Abrindo PET na unidade…" />;
  if (
    !canRoute ||
    !unit ||
    !actual ||
    search.cliente !== unit.cliente_id ||
    search.unidade !== unit.id ||
    (search.local && search.local !== actual.local_nr_id)
  )
    return (
      <ErrorState
        error={
          new Error(
            "A PET não corresponde à unidade/local informado ou o contexto não está autorizado.",
          )
        }
      />
    );
  return search.consulta ? (
    <PetConsulta petId={petId} norma={origin} search={search} />
  ) : (
    <PetWorkspace
      petId={petId}
      returnContext={{
        ...search,
        cliente: unit.cliente_id,
        unidade: unit.id,
        local: actual.local_nr_id ?? "",
      }}
      norma={origin}
    />
  );
}
