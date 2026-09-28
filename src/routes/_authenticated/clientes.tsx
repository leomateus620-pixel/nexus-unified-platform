import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { RecordIdentity } from "@/components/nexus/OperationalDetails";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Sistema Nexus" },
      { name: "description", content: "Cadastro de clientes, unidades e contatos." },
      { property: "og:title", content: "Clientes — Sistema Nexus" },
      { property: "og:description", content: "Clientes, unidades e contatos." },
    ],
  }),
  component: Clientes,
});

const clienteSchema = z.object({
  razao_social: z.string().trim().min(2, "Obrigatório").max(200),
  cnpj: z.string().max(20),
  cidade: z.string().max(100),
  uf: z.string().max(2),
});

function Clientes() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["clientes", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select(
          "*, unidades(id,nome,endereco,distancia_ida_volta_km), contatos(id,nome,email,telefone)",
        )
        .eq("organization_id", orgId)
        .order("razao_social");
      if (error) throw error;
      return data;
    },
  });
  const form = useForm<z.infer<typeof clienteSchema>>({
    resolver: zodResolver(clienteSchema),
    defaultValues: { razao_social: "", cnpj: "", cidade: "", uf: "" },
  });
  const salvar = form.handleSubmit(async (v) => {
    setErro(null);
    const { error } = await supabase.from("clientes").insert({
      ...v,
      uf: v.uf.toUpperCase() || null,
      cnpj: v.cnpj || null,
      cidade: v.cidade || null,
      organization_id: orgId,
    });
    if (error) return setErro(error.message);
    form.reset();
    qc.invalidateQueries({ queryKey: ["clientes", orgId] });
  });
  const cli = (q.data ?? []).find((c) => c.id === sel) ?? null;
  const input = "h-8 rounded border border-input bg-background px-2 text-sm text-foreground";

  async function addUnidade() {
    if (!cli) return;
    const nome = window.prompt("Nome da unidade/obra:");
    if (!nome?.trim()) return;
    const endereco = window.prompt("Endereço (opcional):") ?? "";
    const km = window.prompt("Distância ida e volta em km (opcional):") ?? "";
    const { error } = await supabase.from("unidades").insert({
      organization_id: orgId,
      cliente_id: cli.id,
      nome: nome.trim(),
      endereco: endereco || null,
      distancia_ida_volta_km: km ? Number(km.replace(",", ".")) : null,
    });
    if (error) return setErro(error.message);
    qc.invalidateQueries({ queryKey: ["clientes", orgId] });
  }
  async function addContato() {
    if (!cli) return;
    const nome = window.prompt("Nome do contato:");
    if (!nome?.trim()) return;
    const email = window.prompt("E-mail (opcional):") ?? "";
    const { error } = await supabase.from("contatos").insert({
      organization_id: orgId,
      cliente_id: cli.id,
      nome: nome.trim(),
      email: email || null,
    });
    if (error) return setErro(error.message);
    qc.invalidateQueries({ queryKey: ["clientes", orgId] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clientes"
        title="Clientes, unidades e contatos"
        description="Dados usados pelas propostas sem redigitação."
      />
      <Section title="Novo cliente">
        <form onSubmit={salvar} className="nx-inline-form">
          <label className="nx-field-wide">
            Razão social
            <input
              aria-label="Razão social"
              placeholder="Razão social"
              className={`${input} w-72`}
              {...form.register("razao_social")}
            />
            {form.formState.errors.razao_social && (
              <p className="text-xs text-destructive">
                {form.formState.errors.razao_social.message}
              </p>
            )}
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
            Cidade
            <input
              aria-label="Cidade"
              placeholder="Cidade"
              className={input}
              {...form.register("cidade")}
            />
          </label>
          <label className="nx-field-short">
            UF
            <input
              aria-label="UF"
              placeholder="UF"
              maxLength={2}
              className={`${input} w-16`}
              {...form.register("uf")}
            />
          </label>
          <ActionButton type="submit" loading={form.formState.isSubmitting}>
            Cadastrar
          </ActionButton>
        </form>
        {erro && <p className="mt-2 text-sm text-destructive">{erro}</p>}
      </Section>
      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Section title="Clientes">
          <QueryView
            query={q}
            empty={
              <EmptyState
                title="Nenhum cliente cadastrado"
                hint="Cadastre o primeiro cliente acima."
              />
            }
          >
            {(rows) => (
              <DataTable
                getRowId={(c) => c.id}
                rows={rows}
                selectedId={sel}
                onRowClick={(c) => setSel(c.id)}
                columns={[
                  {
                    key: "razao_social",
                    label: "Razão social",
                    render: (c) => <RecordIdentity primary={c.razao_social} />,
                  },
                  { key: "cnpj", label: "CNPJ", render: (c) => c.cnpj ?? "—" },
                  {
                    key: "cidade",
                    label: "Cidade/UF",
                    render: (c) => [c.cidade, c.uf].filter(Boolean).join(" / ") || "—",
                  },
                  { key: "u", label: "Unidades", align: "right", render: (c) => c.unidades.length },
                  { key: "situacao", label: "Situação" },
                ]}
              />
            )}
          </QueryView>
        </Section>
        <aside
          className="nx-client-context"
          aria-label="Unidades e contatos do cliente selecionado"
        >
          {!cli ? (
            <p className="text-muted-foreground">
              Selecione um cliente para ver unidades e contatos.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="font-display text-lg font-medium text-foreground">{cli.razao_social}</p>
              <div>
                <div className="flex justify-between">
                  <p className="text-xs uppercase text-muted-foreground">Unidades</p>
                  <button className="min-h-11 px-2 text-sm text-primary" onClick={addUnidade}>
                    + Unidade
                  </button>
                </div>
                {cli.unidades.length ? (
                  <ul className="text-xs">
                    {cli.unidades.map((u) => (
                      <li key={u.id}>
                        {u.nome}
                        {u.endereco ? ` · ${u.endereco}` : ""}
                        {u.distancia_ida_volta_km != null
                          ? ` · ${u.distancia_ida_volta_km} km`
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhuma unidade.</p>
                )}
              </div>
              <div>
                <div className="flex justify-between">
                  <p className="text-xs uppercase text-muted-foreground">Contatos</p>
                  <button className="min-h-11 px-2 text-sm text-primary" onClick={addContato}>
                    + Contato
                  </button>
                </div>
                {cli.contatos.length ? (
                  <ul className="text-xs">
                    {cli.contatos.map((c) => (
                      <li key={c.id}>
                        {c.nome}
                        {c.email ? ` · ${c.email}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum contato.</p>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
