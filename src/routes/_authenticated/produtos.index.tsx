import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";

import { ActionButton, DataTable, EmptyState, PageHeader, QueryView, Section } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/features/org/session";
import { importarModeloPlanilha } from "@/features/propostas/propostas.functions";
import { brlUnit } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/produtos/")({
  head: () => ({
    meta: [
      { title: "Produtos e Soluções — Sistema Nexus" },
      { name: "description", content: "Catálogo mestre de componentes, NCM, fabricantes e histórico de custos." },
      { property: "og:title", content: "Produtos e Soluções — Sistema Nexus" },
      { property: "og:description", content: "Catálogo mestre de componentes." },
    ],
  }),
  component: Produtos,
});

const schema = z.object({
  codigo: z.string().trim().min(1).max(40),
  descricao: z.string().trim().min(2).max(300),
  unidade: z.string().trim().min(1).max(10),
  ncm: z.string().max(20),
  modalidade: z.enum(["comprar", "fabricar", "terceirizar"]),
  custo: z.coerce.number().min(0),
});

export function useProdutos(orgId: string) {
  return useQuery({
    queryKey: ["produtos", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id,codigo,descricao,unidade,ncm,modalidade,ativo,origem,fabricantes(nome),fornecedores(nome),produto_custos(custo,vigencia,created_at)")
        .eq("organization_id", orgId)
        .order("codigo");
      if (error) throw error;
      return data.map((p) => {
        const custos = [...(p.produto_custos ?? [])].sort((a, b) => (a.vigencia < b.vigencia ? 1 : a.vigencia > b.vigencia ? -1 : a.created_at < b.created_at ? 1 : -1));
        return { ...p, custo: custos[0] ? Number(custos[0].custo) : null };
      });
    },
  });
}

function Produtos() {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const q = useProdutos(orgId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const imp = useServerFn(importarModeloPlanilha);
  const importar = useMutation({ mutationFn: () => imp(), onSuccess: () => qc.invalidateQueries({ queryKey: ["produtos", orgId] }) });
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { codigo: "", descricao: "", unidade: "PÇ", ncm: "", modalidade: "comprar", custo: 0 } });
  const salvar = form.handleSubmit(async (v) => {
    setErro(null);
    const { data, error } = await supabase.from("produtos").insert({ organization_id: orgId, codigo: v.codigo, descricao: v.descricao, unidade: v.unidade, ncm: v.ncm || null, modalidade: v.modalidade, indivisivel: v.unidade.toUpperCase() !== "M", origem: "cadastro manual" }).select("id").single();
    if (error) return setErro(error.message);
    const { error: e2 } = await supabase.from("produto_custos").insert({ organization_id: orgId, produto_id: data.id, custo: v.custo, origem: "cadastro manual" });
    if (e2) return setErro(e2.message);
    form.reset();
    qc.invalidateQueries({ queryKey: ["produtos", orgId] });
  });
  const input = "h-8 rounded border border-input bg-background px-2 text-sm text-foreground";
  const verCusto = org.data?.canSeeCosts ?? false;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Produtos e Soluções"
        title="Catálogo mestre"
        description="Identidade do componente e histórico de custos. Propostas usam uma cópia versionada; editar uma proposta não altera o catálogo."
        actions={org.data?.isAdmin ? <ActionButton variant="ghost" loading={importar.isPending} onClick={() => importar.mutate()}>Importar biblioteca da planilha modelo</ActionButton> : null}
      />
      {importar.isSuccess && <p className="text-sm text-primary">Importação concluída: {importar.data.inseridos} componente(s) novo(s). Códigos existentes foram preservados.</p>}
      {importar.isError && <p className="text-sm text-destructive">{importar.error instanceof Error ? importar.error.message : "Falha na importação"}</p>}
      <Section title="Novo componente">
        <form onSubmit={salvar} className="flex flex-wrap gap-2">
          <input aria-label="Código" placeholder="Código" className={`${input} w-28`} {...form.register("codigo")} />
          <input aria-label="Descrição" placeholder="Descrição" className={`${input} w-80`} {...form.register("descricao")} />
          <input aria-label="Unidade" placeholder="Un." className={`${input} w-16`} {...form.register("unidade")} />
          <input aria-label="NCM" placeholder="NCM" className={`${input} w-28`} {...form.register("ncm")} />
          <select aria-label="Modalidade" className={input} {...form.register("modalidade")}>
            <option value="comprar">Comprar</option>
            <option value="fabricar">Fabricar</option>
            <option value="terceirizar">Terceirizar</option>
          </select>
          <input aria-label="Custo" type="number" step="0.0001" placeholder="Custo" className={`${input} w-28`} {...form.register("custo")} />
          <ActionButton type="submit" loading={form.formState.isSubmitting}>Cadastrar</ActionButton>
        </form>
        {Object.values(form.formState.errors).length > 0 && <p className="mt-1 text-xs text-destructive">Verifique os campos obrigatórios.</p>}
        {erro && <p className="mt-2 text-sm text-destructive">{erro}</p>}
      </Section>
      <Section title="Componentes">
        <QueryView query={q} empty={<EmptyState title="Catálogo vazio" hint="Cadastre componentes ou importe a biblioteca de 21 componentes da planilha modelo (custos do arquivo, sem atualização de mercado)." />}>
          {(rows) => (
            <DataTable
              getRowId={(p) => p.id}
              rows={rows}
              onRowClick={(p) => navigate({ to: "/produtos/$produtoId", params: { produtoId: p.id } })}
              columns={[
                { key: "codigo", label: "Código" },
                { key: "descricao", label: "Descrição" },
                { key: "unidade", label: "Un." },
                { key: "fab", label: "Fabricante", render: (p) => (p.fabricantes as { nome: string } | null)?.nome ?? "—" },
                { key: "ncm", label: "NCM", render: (p) => p.ncm ?? "—" },
                { key: "modalidade", label: "Suprimento" },
                ...(verCusto ? [{ key: "custo", label: "Custo vigente", align: "right" as const, render: (p: { custo: number | null }) => brlUnit(p.custo) }] : []),
              ]}
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}
