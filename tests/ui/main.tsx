/* eslint-disable react-refresh/only-export-components -- This isolated test entry is never shipped. */
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/nexus/AppShell";
import { Dimensionamento } from "@/features/propostas/Dimensionamento";
import { ItensComerciais } from "@/features/propostas/ItensComerciais";
import {
  Orcamento,
  Planejamento,
  Resumo,
  ParametrosRevisao,
  Historico,
} from "@/features/propostas/Etapas";
import { Route as WorkspaceRoute } from "@/routes/_authenticated/comercial.propostas.$propostaId.revisoes.$revisaoId";
import { Route as ListRoute } from "@/routes/_authenticated/comercial.propostas.index";
import { Route as OcRoute } from "@/routes/_authenticated/compras.ordens-compra.$ordemId";
import { Route as OpRoute } from "@/routes/_authenticated/compras.ordens-producao.$ordemId";
import { useSave } from "@/features/propostas/hooks";
import { OutletContext } from "./router";
import { query, scenario } from "./data";
import "@/styles.css";

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
    mutations: { retry: false },
  },
});
const page = query.get("page") || "dimensionamento";
function StateProbe() {
  const { set } = useSave();
  useEffect(() => {
    if (scenario === "conflict")
      set("conflito", "Conflito simulado: outra sessão atualizou esta revisão.");
  }, [set]);
  return null;
}
const pages = {
  dimensionamento: <Dimensionamento revisaoId="rev-fixture" />,
  "itens-comerciais": <ItensComerciais revisaoId="rev-fixture" />,
  orcamento: <Orcamento revisaoId="rev-fixture" />,
  compras: <Planejamento revisaoId="rev-fixture" modo="compras" />,
  producao: <Planejamento revisaoId="rev-fixture" modo="producao" />,
  "resumo-executivo": <Resumo revisaoId="rev-fixture" />,
  parametros: <ParametrosRevisao revisaoId="rev-fixture" />,
  historico: <Historico revisaoId="rev-fixture" propostaId="proposal-fixture" />,
};
const Workspace = WorkspaceRoute.options.component,
  List = ListRoute.options.component,
  Oc = OcRoute.options.component,
  Op = OpRoute.options.component;
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <AppShell>
      {page === "list" ? (
        <List />
      ) : page === "oc" ? (
        <Oc />
      ) : page === "op" ? (
        <Op />
      ) : (
        <OutletContext.Provider
          value={
            <>
              <StateProbe />
              {pages[page] || pages.dimensionamento}
            </>
          }
        >
          <Workspace />
        </OutletContext.Provider>
      )}
    </AppShell>
  </QueryClientProvider>,
);
window.__nexusReady = true;
