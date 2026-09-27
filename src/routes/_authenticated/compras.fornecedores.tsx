import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";

import {
  ActionButton,
  DataTable,
  EmptyState,
  PageHeader,
  QueryView,
  Section,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/features/org/session";
import { useFornecedores } from "@/features/propostas/hooks";
import { RecordIdentity } from "@/components/nexus/OperationalDetails";

export const Route = createFileRoute("/_authenticated/compras/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores — Sistema Nexus" },
      { name: "description", content: "Cadastro de fornecedores, distinto de fabricantes." },
      { property: "og:title", content: "Fornecedores — Sistema Nexus" },
      { property: "og:description", content: "Cadastro de fornecedores." },
    ],
  }),
  component: Page,
});

const schema = z.object({
  nome: z.string().trim().min(2, "Obrigatório").max(200),
  cnpj: z.string().max(20),
  contato: z.string().max(200),
});

function Page() {
  const orgId = useOrgId();
  const q = useFornecedores(orgId);
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", cnpj: "", contato: "" },
  });
  const salvar = form.handleSubmit(async (v) => {
    setErro(null);
    const { error } = await supabase.from("fornecedores").insert({
      organization_id: orgId,
      nome: v.nome,
      cnpj: v.cnpj || null,
      contato: v.contato || null,
    });
    if (error) return setErro(error.message);
    form.reset();
    qc.invalidateQueries({ queryKey: ["fornecedores", orgId] });
  });
  const input = "h-8 rounded border border-input bg-background px-2 text-sm text-foreground";
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Compras e Produção"
        title="Fornecedores"
        description="Fornecedor é quem vende; fabricante é a marca do componente. São cadastros distintos."
      />
      <Section title="Novo fornecedor">
        <form onSubmit={salvar} className="nx-inline-form">
          <label className="nx-field-wide">
            Nome do fornecedor
            <input
              aria-label="Nome"
              placeholder="Nome"
              className={`${input} w-72`}
              {...form.register("nome")}
            />
          </label>
          <label>
            CNPJ
            <input
              aria-label="CNPJ"
              placeholder="CNPJ"
              className={input}
              {...form.register("cnpj")}
            />
          </label>
          <label>
            Contato
            <input
              aria-label="Contato"
              placeholder="Contato"
              className={input}
              {...form.register("contato")}
            />
          </label>
          <ActionButton type="submit" loading={form.formState.isSubmitting}>
            Cadastrar
          </ActionButton>
        </form>
        {form.formState.errors.nome && (
          <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>
        )}
        {erro && <p className="mt-2 text-sm text-destructive">{erro}</p>}
      </Section>
      <Section title="Fornecedores">
        <QueryView query={q} empty={<EmptyState title="Nenhum fornecedor cadastrado" />}>
          {(rows) => (
            <DataTable
              getRowId={(f) => f.id}
              rows={rows}
              columns={[
                {
                  key: "nome",
                  label: "Fornecedor",
                  render: (f) => <RecordIdentity primary={f.nome} />,
                },
                { key: "cnpj", label: "CNPJ", render: (f) => f.cnpj ?? "—" },
                { key: "contato", label: "Contato", render: (f) => f.contato ?? "—" },
              ]}
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}
