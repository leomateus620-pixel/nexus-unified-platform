import { createFileRoute, Outlet } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/execucao")({
  head: () => ({
    meta: [
      { title: "Execução / OS — Sistema Nexus" },
      { name: "description", content: "Ordens de serviço e PET Digital Nexus." },
    ],
  }),
  component: () => <Outlet />,
});
