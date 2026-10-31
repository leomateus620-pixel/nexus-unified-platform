import { useNavigate, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { nrSearchSchema } from "./route-state";
import type { Norma } from "./domain";
import { NrWorkspace, type NrSearch, type NrSection } from "./NrWorkspace";
export function NrRoute({ norma, section }: { norma: Norma; section: NrSection }) {
  const location = useRouterState({ select: (state) => state.location });
  const search = nrSearchSchema.parse(location.search);
  const segments = location.pathname.split("/").filter(Boolean);
  const candidate = segments[2];
  const navigate = useNavigate();
  if (candidate && !z.string().uuid().safeParse(candidate).success)
    return (
      <div className="nx-nr-workspace">
        <p role="alert" className="nr-feedback">
          O identificador deste registro é inválido. Confira o endereço ou volte à lista pelo menu.
        </p>
      </div>
    );
  const id = candidate && z.string().uuid().safeParse(candidate).success ? candidate : undefined;
  return (
    <NrWorkspace
      norma={norma}
      section={section}
      id={id}
      search={search}
      onSearch={(patch: Partial<NrSearch>) => {
        void navigate({ to: location.pathname, search: { ...search, ...patch } });
      }}
    />
  );
}

export function NrCatchall({ norma }: { norma: Norma }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const segments = pathname.split("/").filter(Boolean);
  const section = segments[1];
  const permitted = [
    "clientes",
    "conferencia",
    "locais",
    "levantamentos",
    "documentos",
    "pastas",
    "pendencias",
    "biblioteca",
    "historico",
    "configuracoes",
    "sistemas",
    ...(norma === "NR33" ? ["pets"] : []),
  ];
  if (
    !section ||
    !permitted.includes(section) ||
    segments.length > 3 ||
    (segments.length === 3 &&
      ![
        "locais",
        "levantamentos",
        "documentos",
        "pastas",
        "pendencias",
        "biblioteca",
        "sistemas",
      ].includes(section))
  )
    return (
      <div className="nx-nr-workspace">
        <p className="nr-feedback" role="alert">
          Esta área não foi encontrada. Abra uma área válida pelo menu NR.
        </p>
      </div>
    );
  return <NrRoute norma={norma} section={section as NrSection} />;
}
