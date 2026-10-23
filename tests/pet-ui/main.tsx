import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/nexus/AppShell";
import { ExecucaoWorkspace, PetHistoricoUnidade } from "@/features/pet/ExecucaoWorkspace";
import { PetWorkspace } from "@/features/pet/PetWorkspace";
import { usePath } from "./router";
import "@/styles.css";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Lab() {
  const path = usePath();
  const pet = path.match(/\/execucao\/pets\/([^/]+)/)?.[1];
  const os = path.match(/\/execucao\/ordens\/([^/]+)/)?.[1];
  return (
    <QueryClientProvider client={client}>
      <div
        style={{
          background: "#263832",
          color: "white",
          padding: "8px 16px",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        DEMONSTRAÇÃO · banco PostgreSQL local isolado · autenticação de laboratório · ICP-Brasil não
        configurado ·{" "}
        <a href="/clientes/unidade-demonstracao">Histórico da unidade de demonstração</a>
      </div>
      <AppShell>
        {path === "/clientes/unidade-demonstracao" ? (
          <section style={{ padding: 24 }}>
            <h1>Unidade Campo · DEMONSTRAÇÃO</h1>
            <p>Componente real do histórico da unidade em laboratório SQL isolado.</p>
            <PetHistoricoUnidade unidadeId="a0300000-0000-4000-8000-000000000007" />
          </section>
        ) : pet ? (
          <PetWorkspace petId={pet} />
        ) : (
          <ExecucaoWorkspace {...(os ? { ordemId: os } : {})} />
        )}
      </AppShell>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Lab />);
