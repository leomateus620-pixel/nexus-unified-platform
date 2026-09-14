import { createFileRoute } from "@tanstack/react-router";

import { DataTable, PageHeader, Section, StatCard } from "@/components/nexus/Page";
import { usuarios } from "@/lib/nexus-data";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Sistema Nexus" },
      {
        name: "description",
        content:
          "Usuários, permissões, templates, normas, impostos, categorias e parâmetros do sistema.",
      },
      { property: "og:title", content: "Configurações — Sistema Nexus" },
      {
        property: "og:description",
        content: "Parâmetros gerais, perfis de acesso e modelos do Sistema Nexus.",
      },
    ],
  }),
  component: Configuracoes,
});

const blocos = [
  { titulo: "Permissões", desc: "Perfis por módulo e nível de acesso" },
  { titulo: "Templates", desc: "Modelos de proposta, laudo e dossiê" },
  { titulo: "Normas", desc: "Normas aplicáveis e checklists vinculados" },
  { titulo: "Impostos", desc: "Regras fiscais por NCM e estado" },
  { titulo: "Categorias", desc: "Classificações de produtos e serviços" },
  { titulo: "Parâmetros", desc: "Numeração, moedas, prazos e alertas" },
];

function Configuracoes() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configurações"
        title="Parâmetros do sistema"
        description="Base de configuração do Nexus: quem acessa o quê, quais modelos são usados e como o sistema calcula e numera."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Usuários ativos" value="24" />
        <StatCard label="Perfis de acesso" value="7" tone="primary" />
        <StatCard label="Templates ativos" value="23" />
        <StatCard label="Normas cadastradas" value="14" tone="info" />
      </div>

      <Section title="Usuários e acessos">
        <DataTable
          columns={[
            { key: "nome", label: "Nome" },
            { key: "perfil", label: "Perfil" },
            { key: "unidade", label: "Unidade" },
            { key: "acesso", label: "Acesso" },
          ]}
          rows={usuarios}
        />
      </Section>

      <div className="grid gap-4 md:grid-cols-3">
        {blocos.map((b) => (
          <Section key={b.titulo} title={b.titulo} description={b.desc}>
            <button className="text-xs font-medium text-primary hover:underline">Configurar</button>
          </Section>
        ))}
      </div>
    </div>
  );
}
