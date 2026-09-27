import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  ActionButton,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/features/org/session";
import { useFornecedores } from "@/features/propostas/hooks";
import { brlUnit, dataBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/produtos/$produtoId")({
  head: () => ({
    meta: [
      { title: "Componente — Sistema Nexus" },
      { name: "description", content: "Cadastro e histórico de custos do componente." },
    ],
  }),
  component: Produto,
});

function Produto() {
  const { produtoId } = Route.useParams();
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const forn = useFornecedores(orgId);
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["produto", produtoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select(
          "*, fabricantes(nome), produto_custos(id,custo,vigencia,origem,created_at,fornecedores(nome))",
        )
        .eq("id", produtoId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  const custos = [...p.produto_custos].sort((a, b) => (a.vigencia < b.vigencia ? 1 : -1));
  const atualizar = async (patch: Record<string, unknown>) => {
    setErro(null);
    const { error } = await supabase
      .from("produtos")
      .update(patch as never)
      .eq("id", p.id);
    if (error) return setErro(error.message);
    qc.invalidateQueries({ queryKey: ["produto", produtoId] });
    qc.invalidateQueries({ queryKey: ["produtos", orgId] });
  };
  const novoCusto = async () => {
    const v = window.prompt("Novo custo (R$):");
    if (!v) return;
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return setErro("Custo inválido");
    const vig =
      window.prompt("Vigência (AAAA-MM-DD):", new Date().toISOString().slice(0, 10)) ?? "";
    const origem = window.prompt("Origem (cotação, fornecedor, documento):") ?? "";
    const { error } = await supabase
      .from("produto_custos")
      .insert({
        organization_id: orgId,
        produto_id: p.id,
        custo: n,
        ...(vig ? { vigencia: vig } : {}),
        origem: origem || null,
      });
    if (error) return setErro(error.message);
    qc.invalidateQueries({ queryKey: ["produto", produtoId] });
  };
  const input = "h-8 rounded border border-input bg-background px-2 text-sm text-foreground";
  return (
    <div className="space-y-4">
      <nav className="text-xs text-muted-foreground">
        <Link to="/produtos" className="hover:text-foreground">
          Produtos e Soluções
        </Link>{" "}
        / {p.codigo}
      </nav>
      <PageHeader
        eyebrow={p.codigo}
        title={p.descricao}
        description={`Origem do cadastro: ${p.origem ?? "—"}. Propostas existentes não mudam ao alterar este cadastro.`}
      />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Section title="Cadastro">
        <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
          <p>
            Unidade: <span className="text-foreground">{p.unidade}</span>
          </p>
          <p>
            NCM: <span className="text-foreground">{p.ncm ?? "—"}</span> (classifica, não
            identifica)
          </p>
          <p>
            Fabricante:{" "}
            <span className="text-foreground">
              {(p.fabricantes as { nome: string } | null)?.nome ?? "—"}
            </span>
          </p>
          <label>
            Modalidade de suprimento
            <select
              className={`${input} ml-2`}
              value={p.modalidade}
              onChange={(e) => atualizar({ modalidade: e.target.value })}
            >
              <option value="comprar">Comprar</option>
              <option value="fabricar">Fabricar</option>
              <option value="terceirizar">Terceirizar</option>
            </select>
          </label>
          <label>
            Fornecedor padrão
            <select
              className={`${input} ml-2`}
              value={p.fornecedor_padrao_id ?? ""}
              onChange={(e) => atualizar({ fornecedor_padrao_id: e.target.value || null })}
            >
              <option value="">—</option>
              {(forn.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Múltiplo de compra
            <input
              type="number"
              min={1}
              step="any"
              defaultValue={Number(p.multiplo_compra)}
              onBlur={(e) =>
                Number(e.target.value) > 0 && atualizar({ multiplo_compra: Number(e.target.value) })
              }
              className={`${input} ml-2 w-20`}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.indivisivel}
              onChange={(e) => atualizar({ indivisivel: e.target.checked })}
            />{" "}
            Peça indivisível (nunca fracionar)
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.ativo}
              onChange={(e) => atualizar({ ativo: e.target.checked })}
            />{" "}
            Ativo (copiado para novas propostas)
          </label>
        </div>
      </Section>
      {org.data?.canSeeCosts && (
        <Section title="Histórico de custos">
          <ActionButton variant="ghost" onClick={novoCusto}>
            Registrar novo custo
          </ActionButton>
          <div className="mt-3">
            {custos.length === 0 ? (
              <EmptyState title="Sem custo registrado" />
            ) : (
              <DataTable
                getRowId={(c) => c.id}
                rows={custos}
                columns={[
                  { key: "vigencia", label: "Vigência", render: (c) => dataBR(c.vigencia) },
                  {
                    key: "custo",
                    label: "Custo",
                    align: "right",
                    render: (c) => brlUnit(Number(c.custo)),
                  },
                  {
                    key: "forn",
                    label: "Fornecedor",
                    render: (c) => (c.fornecedores as { nome: string } | null)?.nome ?? "—",
                  },
                  { key: "origem", label: "Origem", render: (c) => c.origem ?? "—" },
                ]}
              />
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
