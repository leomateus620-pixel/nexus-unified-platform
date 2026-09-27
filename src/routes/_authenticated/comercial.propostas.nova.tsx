import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";

import {
  ActionButton,
  EmptyState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/features/org/session";
import { criarProposta } from "@/features/propostas/propostas.functions";

export const Route = createFileRoute("/_authenticated/comercial/propostas/nova")({
  head: () => ({
    meta: [
      { title: "Nova proposta — Sistema Nexus" },
      { name: "description", content: "Criar uma proposta a partir de um cliente cadastrado." },
      { property: "og:title", content: "Nova proposta — Sistema Nexus" },
      { property: "og:description", content: "Criar proposta comercial." },
    ],
  }),
  component: Nova,
});

const schema = z.object({
  cliente_id: z.string().uuid("Selecione o cliente"),
  unidade_id: z.string(),
  contato_id: z.string(),
  titulo: z.string().max(200),
});

function Nova() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const criar = useServerFn(criarProposta);
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { cliente_id: "", unidade_id: "", contato_id: "", titulo: "" },
  });
  const clienteId = form.watch("cliente_id");
  const clientes = useQuery({
    queryKey: ["clientes", orgId, "sel"],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id,razao_social,unidades(id,nome),contatos(id,nome)")
        .eq("organization_id", orgId)
        .order("razao_social");
      if (error) throw error;
      return data;
    },
  });
  const catalogo = useQuery({
    queryKey: ["produtos-count", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("produtos")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("ativo", true);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const cli = (clientes.data ?? []).find((c) => c.id === clienteId);

  const onSubmit = form.handleSubmit(async (v) => {
    setErro(null);
    try {
      const r = await criar({
        data: {
          cliente_id: v.cliente_id,
          unidade_id: v.unidade_id || null,
          contato_id: v.contato_id || null,
          titulo: v.titulo,
        },
      });
      navigate({
        to: "/comercial/propostas/$propostaId/revisoes/$revisaoId/itens-comerciais",
        params: { propostaId: r.proposta_id, revisaoId: r.revisao_id },
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  });

  if (clientes.isPending || catalogo.isPending) return <LoadingState />;
  const sel =
    "mt-1 h-9 w-full rounded border border-input bg-background px-2 text-sm text-foreground";
  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        eyebrow="Comercial"
        title="Nova proposta"
        description="Selecione cliente e obra. Parâmetros padrão, regras técnicas ativas e custos vigentes do catálogo são copiados para a revisão 01."
      />
      {!clientes.data?.length ? (
        <EmptyState
          title="Nenhum cliente cadastrado"
          action={
            <Link to="/clientes" className="text-sm text-primary">
              Cadastrar cliente
            </Link>
          }
        />
      ) : (
        <Section title="Dados iniciais">
          {catalogo.data === 0 && (
            <p className="mb-3 text-xs text-warning">
              O catálogo de produtos está vazio: a revisão será criada sem componentes.{" "}
              <Link to="/produtos" className="underline">
                Cadastrar ou importar catálogo
              </Link>
              .
            </p>
          )}
          <form onSubmit={onSubmit} className="space-y-3 text-xs text-muted-foreground">
            <label className="block">
              Cliente
              <select className={sel} {...form.register("cliente_id")}>
                <option value="">Selecione…</option>
                {clientes.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razao_social}
                  </option>
                ))}
              </select>
              {form.formState.errors.cliente_id && (
                <span className="text-destructive">{form.formState.errors.cliente_id.message}</span>
              )}
            </label>
            <label className="block">
              Unidade / obra
              <select className={sel} {...form.register("unidade_id")} disabled={!cli}>
                <option value="">—</option>
                {(cli?.unidades ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Contato
              <select className={sel} {...form.register("contato_id")} disabled={!cli}>
                <option value="">—</option>
                {(cli?.contatos ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Título (opcional)
              <input className={sel} {...form.register("titulo")} />
            </label>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <ActionButton type="submit" loading={form.formState.isSubmitting}>
              Criar proposta
            </ActionButton>
          </form>
        </Section>
      )}
    </div>
  );
}
