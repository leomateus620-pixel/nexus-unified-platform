/* eslint-disable react-refresh/only-export-components -- This isolated test entry is never shipped. */
import { NrHarness } from "./NrHarness";
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
import { Route as DefaultsRoute } from "@/routes/_authenticated/configuracoes.orcamentos";
import { Route as ProductsRoute } from "@/routes/_authenticated/produtos.index";
import { Route as ProductRoute } from "@/routes/_authenticated/produtos.$produtoId";
import { ImportacaoAssistida } from "@/features/importacao/ImportacaoAssistida";
import { useSave } from "@/features/propostas/hooks";
import { OutletContext, useFixturePage } from "./router";
import { query, scenario } from "./data";
import { Route as PessoasRoute } from "@/routes/_authenticated/equipe";
import { Route as AgendaEquipeRoute } from "@/routes/_authenticated/agenda-equipe";
import { Route as SegurancaRoute } from "@/routes/_authenticated/seguranca";
import { Route as PeRoute } from "@/routes/_authenticated/projetos-engenharia";
import { Route as MapsLibraryRoute } from "@/routes/mapas-3d_.unidades";
import { Route as ClientesRoute } from "@/routes/_authenticated/clientes";
import { Route as ConfiguracoesRoute } from "@/routes/_authenticated/configuracoes.index";
import { Route as LevantamentosRoute } from "@/routes/_authenticated/levantamentos";
import { Route as EngenhariaRoute } from "@/routes/_authenticated/engenharia.index";
import { Route as AlmoxarifadoRoute } from "@/routes/_authenticated/almoxarifado";
import "@/styles.css";

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
    mutations: { retry: false },
  },
});
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
const Defaults = DefaultsRoute.options.component;
const Products = ProductsRoute.options.component;
const Product = ProductRoute.options.component;
const ProjetosEngenharia = PeRoute.options.component;
const MapsLibrary = MapsLibraryRoute.options.component;
const Clientes = ClientesRoute.options.component;
const Configuracoes = ConfiguracoesRoute.options.component;
const Levantamentos = LevantamentosRoute.options.component;
const Engenharia = EngenhariaRoute.options.component;
const Almoxarifado = AlmoxarifadoRoute.options.component;
const Seguranca = SegurancaRoute.options.component;
const Pessoas = PessoasRoute.options.component;
const AgendaEquipe = AgendaEquipeRoute.options.component;
function Harness() {
  const page = useFixturePage();
  return (
    <QueryClientProvider client={client}>
      <AppShell>
        {page === "nr-33" || page === "nr-35" ? (
          <NrHarness norma={page === "nr-33" ? "NR33" : "NR35"} />
        ) : page === "agenda-equipe" ? (
          <AgendaEquipe />
        ) : page === "almoxarifado" ? (
          <Almoxarifado />
        ) : page === "engenharia" ? (
          <Engenharia />
        ) : page === "levantamentos" ? (
          <Levantamentos />
        ) : page === "equipe" ? (
          <Pessoas />
        ) : page === "seguranca" ? (
          <Seguranca />
        ) : page === "projetos-engenharia" ? (
          <ProjetosEngenharia />
        ) : page === "mapas-library" ? (
          <MapsLibrary />
        ) : page === "clientes" ? (
          <Clientes />
        ) : page === "configuracoes" ? (
          <Configuracoes />
        ) : page === "produtos" ? (
          <Products />
        ) : page === "produto" ? (
          <Product />
        ) : page === "importacao" ? (
          <ImportacaoAssistida podeRegistrar={scenario !== "restricted"} />
        ) : page === "list" ? (
          <List />
        ) : page === "oc" ? (
          <Oc />
        ) : page === "op" ? (
          <Op />
        ) : page === "parametros-globais" ? (
          <Defaults />
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
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")).render(<Harness />);
window.__nexusReady = true;
