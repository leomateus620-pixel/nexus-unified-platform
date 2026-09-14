import { createFileRoute } from "@tanstack/react-router";

import {
  ActionButton,
  DataTable,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
} from "@/components/nexus/Page";
import { clientes, documentos, projetos } from "@/lib/nexus-data";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Sistema Nexus" },
      {
        name: "description",
        content: "Cadastro de clientes, contatos, unidades, projetos, documentos e histórico.",
      },
      { property: "og:title", content: "Clientes — Sistema Nexus" },
      {
        property: "og:description",
        content: "Ficha completa do cliente: unidades, projetos, documentos e histórico.",
      },
    ],
  }),
  component: Clientes,
});

function Clientes() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clientes"
        title="Cadastro e histórico"
        description="Cada cliente reúne contatos, unidades, projetos, documentos emitidos e todo o histórico de atendimento."
        actions={<ActionButton>Novo cliente</ActionButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clientes ativos" value="38" />
        <StatCard label="Unidades cadastradas" value="94" tone="primary" />
        <StatCard label="Documentos vinculados" value="1.284" />
        <StatCard label="Sem contato há 90 dias" value="6" tone="danger" />
      </div>

      <Section title="Carteira de clientes">
        <DataTable
          columns={[
            { key: "nome", label: "Cliente" },
            { key: "cidade", label: "Cidade" },
            { key: "unidades", label: "Unidades", align: "right" },
            { key: "projetos", label: "Projetos", align: "right" },
            { key: "contato", label: "Contato principal" },
            { key: "situacao", label: "Situação", render: (r) => <StatusBadge value={r.situacao} /> },
          ]}
          rows={clientes}
        />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Projetos do cliente selecionado" description="Cooperativa Vale Verde">
          <DataTable
            columns={[
              { key: "codigo", label: "Projeto" },
              { key: "escopo", label: "Escopo" },
              { key: "etapa", label: "Etapa", render: (r) => <StatusBadge value={r.etapa} /> },
            ]}
            rows={projetos}
          />
        </Section>
        <Section title="Documentos do cliente">
          <DataTable
            columns={[
              { key: "codigo", label: "Documento" },
              { key: "tipo", label: "Tipo" },
              { key: "revisao", label: "Revisão" },
              { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
            ]}
            rows={documentos}
          />
        </Section>
      </div>
    </div>
  );
}
