import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/nexus/Page";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useOrg } from "@/features/org/session";
import { useFornecedores } from "@/features/propostas/hooks";
import { brlUnit } from "@/lib/format";
import { dataCalendarioValida, dataCustoBR } from "@/features/custos/datas";
import "@/components/nexus/stages.css";
import "@/features/custos/product-costs.css";
import { ComprasProduto } from "@/features/custos/ComprasProduto";
import {
  ProductEditorPanel,
  useFamiliasCodigo,
  usePermissoes,
} from "@/features/catalogo/ProductEditor";
import { nomeTipo } from "@/features/catalogo/codigos";

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
  const qc = useQueryClient();
  const perm = usePermissoes();
  const familias = useFamiliasCodigo();
  const [editar, setEditar] = useState(false);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
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
  if (q.isPending) return <LoadingState label="Carregando ficha do produto" />;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  const custos = [...p.produto_custos].sort(
    (a, b) => b.vigencia.localeCompare(a.vigencia) || b.created_at.localeCompare(a.created_at),
  );
  const nomeFamilia = (sigla: string | null) => {
    if (!sigla) return "Não informada";
    const f = familias.data?.find((x) => x.sigla === sigla);
    return f ? `${f.nome} — ${f.sigla}` : sigla;
  };
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["produto", produtoId] });
    qc.invalidateQueries({ queryKey: ["produtos", orgId] });
    qc.invalidateQueries({ queryKey: ["produto-composicao-ficha", produtoId] });
  };
  const verCustos = org.data?.canSeeCosts === true;
  const comprasProps = {
    produtoId: p.id,
    orgId,
    unidade: p.unidade,
    custoSugerido: custos[0]
      ? { custo: Number(custos[0].custo), origem: custos[0].origem, vigencia: custos[0].vigencia }
      : null,
    podeEditar: perm.data?.importar_catalogo === true,
  };
  return (
    <div className="nx-product-profile nx-cost-stack">
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <nav className="nx-order-context" aria-label="Componente atual">
        <Link to="/produtos" className="hover:text-foreground">
          Produtos e Soluções
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="nx-product-code">{p.codigo}</span>
      </nav>
      <PageHeader
        eyebrow="Ficha do produto · Cadastro mestre"
        title={p.descricao}
        description="Referência reutilizável do catálogo. Alterações neste cadastro não substituem os valores já adotados nas revisões de propostas."
        actions={
          <ActionButton
            variant="ghost"
            disabled={perm.isPending || perm.isError || !perm.data?.editar_cadastro}
            onClick={() => setEditar(true)}
          >
            Editar cadastro mestre
          </ActionButton>
        }
      />
      <div className="nx-product-identity">
        <code className="nx-product-code">{p.codigo}</code>
        <span>{nomeTipo(p.tipo_item)}</span>
        <span>Unidade: {p.unidade}</span>
        <span>
          {{ comprar: "Comprar", fabricar: "Fabricar", terceirizar: "Terceirizar" }[p.modalidade]}
        </span>
        <span>{p.ativo ? "Cadastro ativo" : "Cadastro inativo"}</span>
      </div>
      {confirmacao && (
        <p role="status" className="nx-cost-help">
          {confirmacao}
        </p>
      )}
      {perm.isError ? (
        <ErrorState error={perm.error} onRetry={() => perm.refetch()} />
      ) : (
        !perm.isPending &&
        !perm.data?.editar_cadastro && (
          <p role="status" className="nx-cost-help">
            Cadastro disponível para consulta. Seu perfil não permite editar os dados mestres.
          </p>
        )
      )}
      <Section title="Identificação e fornecimento">
        <dl className="nx-cost-facts">
          <div>
            <dt>Grupo comercial / prefixo do código</dt>
            <dd>{nomeFamilia(p.familia)}</dd>
          </div>
          <div>
            <dt>Família técnica · opcional</dt>
            <dd>{nomeFamilia(p.familia_tecnica)}</dd>
          </div>
          <div>
            <dt>Base de custo</dt>
            <dd>
              {p.base_custo === "completo"
                ? "Produto comprado completo: componentes internos informativos"
                : "Custo por composição: componentes formam o custo"}
            </dd>
          </div>
          <div>
            <dt>Fabricante</dt>
            <dd>{(p.fabricantes as { nome: string } | null)?.nome ?? "Não informado"}</dd>
          </div>
          <div>
            <dt>NCM</dt>
            <dd>{p.ncm ?? "Não informado"}</dd>
          </div>
          <div>
            <dt>Origem do cadastro</dt>
            <dd>{p.origem ?? "Não informada"}</dd>
          </div>
        </dl>
        <details className="nx-product-details-disclosure">
          <summary>Condições de compra e classificação técnica</summary>
          <CondicoesProduto
            key={p.id}
            produto={p}
            orgId={orgId}
            podeEditar={perm.data?.editar_cadastro === true}
            ok={recarregar}
          />
        </details>
        {p.descricao_original && (
          <details className="nx-product-details-disclosure">
            <summary>Consultar descrição original</summary>
            <p className="text-sm whitespace-pre-wrap">{p.descricao_original}</p>
          </details>
        )}
      </Section>
      <Tabs defaultValue={verCustos ? "custos" : "composicao"}>
        <TabsList className="nx-product-profile-tabs" aria-label="Seções da ficha do produto">
          <TabsTrigger value="composicao">Composição</TabsTrigger>
          <TabsTrigger value="custos">Custos do catálogo</TabsTrigger>
          <TabsTrigger value="compras">Histórico de compras</TabsTrigger>
          <TabsTrigger value="referencias">Fornecedores e unidades</TabsTrigger>
        </TabsList>
        <TabsContent value="composicao" className="nx-product-profile-panel" forceMount>
          <ComposicaoProduto
            produtoId={p.id}
            nome={p.descricao}
            baseCusto={p.base_custo}
            status={p.composicao_status}
          />
        </TabsContent>
        <TabsContent value="custos" className="nx-product-profile-panel nx-cost-stack" forceMount>
          {verCustos ? (
            <>
              <ComprasProduto {...comprasProps} secao="custos" />
              <Section
                title="Histórico de custos sugeridos"
                description="Cada registro mantém vigência e origem. O custo adotado em uma proposta só muda por ação explícita naquela revisão."
              >
                {perm.data?.importar_catalogo && (
                  <NovoCusto produtoId={p.id} orgId={orgId} ok={recarregar} />
                )}
                {custos.length === 0 ? (
                  <EmptyState
                    title="Sem referência de custo registrada"
                    hint="Nenhum custo sugerido foi informado para este produto."
                  />
                ) : (
                  <ul className="nx-cost-records">
                    {custos.map((c) => (
                      <li key={c.id}>
                        <div>
                          <strong className="tabular-nums">{brlUnit(Number(c.custo))}</strong>
                          <p className="nx-cost-help">
                            Vigência: {dataCustoBR(c.vigencia)} ·{" "}
                            {(c.fornecedores as { nome: string } | null)?.nome ??
                              "Fornecedor não informado"}
                          </p>
                        </div>
                        <p className="nx-cost-help">{c.origem ?? "Origem não informada"}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          ) : (
            <AcessoCustos />
          )}
        </TabsContent>
        <TabsContent value="compras" className="nx-product-profile-panel" forceMount>
          {verCustos ? <ComprasProduto {...comprasProps} secao="compras" /> : <AcessoCustos />}
        </TabsContent>
        <TabsContent value="referencias" className="nx-product-profile-panel" forceMount>
          {verCustos ? <ComprasProduto {...comprasProps} secao="referencias" /> : <AcessoCustos />}
        </TabsContent>
      </Tabs>
      <ProductEditorPanel
        open={editar}
        onOpenChange={setEditar}
        produtoId={p.id}
        title="Editar cadastro mestre"
        description="Produto reutilizável do catálogo. Revisões existentes preservam seus próprios valores."
        onSaved={(r) => {
          recarregar();
          setConfirmacao(`Cadastro ${r.codigo} atualizado.`);
          setEditar(false);
        }}
      />
    </div>
  );
}

function AcessoCustos() {
  return (
    <EmptyState
      title="Acesso restrito"
      hint="Seu perfil não tem permissão para consultar custos e aquisições."
    />
  );
}

function ComposicaoProduto({
  produtoId,
  nome,
  baseCusto,
  status,
}: {
  produtoId: string;
  nome: string;
  baseCusto: string;
  status: string;
}) {
  const q = useQuery({
    queryKey: ["produto-composicao-ficha", produtoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produto_estrutura")
        .select(
          "filho_id,quantidade,ordem,filho:produtos!produto_estrutura_filho_id_fkey(id,codigo,descricao,unidade,tipo_item)",
        )
        .eq("pai_id", produtoId)
        .order("ordem");
      if (error) throw error;
      return data;
    },
  });
  return (
    <Section
      title="Composição por 1 unidade"
      description={
        baseCusto === "completo"
          ? "Produto comprado completo: componentes internos informativos, sem cobrança independente."
          : "Custo por composição: componentes participam da formação do custo."
      }
    >
      {status === "pendente" && (
        <p className="nx-cost-notice">Composição pendente de definição no cadastro.</p>
      )}
      {q.isPending ? (
        <LoadingState label="Carregando composição do cadastro" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState
          title="Sem componentes cadastrados"
          hint="Consulte ou edite a composição pelo cadastro mestre."
        />
      ) : (
        <ul className="nx-cost-records">
          {q.data.map((c) => (
            <li key={c.filho_id}>
              <div>
                <strong>{c.filho?.descricao ?? "Componente indisponível"}</strong>
                <p className="nx-cost-help">
                  <code>{c.filho?.codigo ?? "Código indisponível"}</code> ·{" "}
                  {nomeTipo(c.filho?.tipo_item)}
                </p>
              </div>
              <div className="tabular-nums">
                <strong>
                  {Number(c.quantidade)} {c.filho?.unidade}
                </strong>
                <p className="nx-cost-help">Por 1 {nome}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function CondicoesProduto({
  produto,
  orgId,
  podeEditar,
  ok,
}: {
  produto: Database["public"]["Tables"]["produtos"]["Row"];
  orgId: string;
  podeEditar: boolean;
  ok: () => void;
}) {
  const forn = useFornecedores(orgId);
  const familias = useFamiliasCodigo();
  const qc = useQueryClient();
  const [f, setF] = useState({
    fornecedor_padrao_id: produto.fornecedor_padrao_id ?? "",
    multiplo_compra: String(produto.multiplo_compra),
    indivisivel: produto.indivisivel,
    ativo: produto.ativo,
    familia_tecnica: produto.familia_tecnica ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <form
      className="nx-product-supply-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setErro(null);
        setConfirmacao(null);
        const multiplo = Number(f.multiplo_compra.replace(",", "."));
        if (!Number.isFinite(multiplo) || multiplo <= 0) {
          setErro("O múltiplo de compra deve ser maior que zero.");
          return;
        }
        setSalvando(true);
        try {
          const { error } = await supabase
            .from("produtos")
            .update({
              fornecedor_padrao_id: f.fornecedor_padrao_id || null,
              multiplo_compra: multiplo,
              indivisivel: f.indivisivel,
              ativo: f.ativo,
              familia_tecnica: f.familia_tecnica || null,
            })
            .eq("id", produto.id);
          if (error) throw error;
          setConfirmacao("Condições e classificação técnica do cadastro atualizadas.");
          qc.invalidateQueries({ queryKey: ["catalogo-busca", orgId] });
          ok();
        } catch (er) {
          setErro((er as Error).message);
        } finally {
          setSalvando(false);
        }
      }}
    >
      <fieldset disabled={!podeEditar || salvando} className="nx-cost-form-grid">
        <label>
          Fornecedor padrão
          <select
            className="nx-cost-input"
            value={f.fornecedor_padrao_id}
            onChange={(e) => setF({ ...f, fornecedor_padrao_id: e.target.value })}
          >
            <option value="">Não informado</option>
            {(forn.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Múltiplo de compra
          <input
            className="nx-cost-input"
            inputMode="decimal"
            required
            value={f.multiplo_compra}
            onChange={(e) => setF({ ...f, multiplo_compra: e.target.value })}
            aria-describedby={erro ? "product-conditions-error" : undefined}
          />
        </label>
        <label>
          Família técnica · opcional
          <select
            className="nx-cost-input"
            value={f.familia_tecnica}
            onChange={(e) => setF({ ...f, familia_tecnica: e.target.value })}
            disabled={familias.isPending || familias.isError}
          >
            <option value="">Não informada</option>
            {familias.data?.map((x) => (
              <option key={x.sigla} value={x.sigla}>
                {x.nome} — {x.sigla}
              </option>
            ))}
          </select>
          <span className="nx-cost-help">
            Classificação independente do grupo comercial. Não altera o prefixo nem o código.
          </span>
        </label>
        <div className="nx-cost-stack">
          <label>
            <input
              type="checkbox"
              checked={f.indivisivel}
              onChange={(e) => setF({ ...f, indivisivel: e.target.checked })}
            />{" "}
            Item indivisível: não fracionar
          </label>
          <label>
            <input
              type="checkbox"
              checked={f.ativo}
              onChange={(e) => setF({ ...f, ativo: e.target.checked })}
            />{" "}
            Ativo para novas propostas
          </label>
        </div>
      </fieldset>
      {forn.isError && <ErrorState error={forn.error} onRetry={() => forn.refetch()} />}
      {familias.isError && <ErrorState error={familias.error} onRetry={() => familias.refetch()} />}
      {erro && (
        <p id="product-conditions-error" role="alert" className="nx-cost-error">
          {erro} Os dados preenchidos foram preservados.
        </p>
      )}
      {confirmacao && (
        <p role="status" className="nx-cost-help">
          {confirmacao}
        </p>
      )}
      {podeEditar && (
        <div>
          <ActionButton type="submit" variant="ghost" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar condições e classificação"}
          </ActionButton>
        </div>
      )}
    </form>
  );
}

function NovoCusto({ produtoId, orgId, ok }: { produtoId: string; orgId: string; ok: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({
    custo: "",
    vigencia: new Date().toISOString().slice(0, 10),
    origem: "",
  });
  const [erros, setErros] = useState<{ custo?: string | undefined; vigencia?: string }>({});
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    const custo = Number(f.custo.replace(",", "."));
    const next: typeof erros = {};
    if (!f.custo.trim() || !Number.isFinite(custo) || custo < 0)
      next.custo = "Informe um custo igual ou maior que zero.";
    if (f.vigencia && !dataCalendarioValida(f.vigencia)) next.vigencia = "Informe uma data válida.";
    setErros(next);
    if (Object.keys(next).length) return;
    setSalvando(true);
    try {
      const { error } = await supabase.from("produto_custos").insert({
        organization_id: orgId,
        produto_id: produtoId,
        custo,
        ...(f.vigencia ? { vigencia: f.vigencia } : {}),
        origem: f.origem.trim() || null,
      });
      if (error) throw error;
      setConfirmacao(
        `Referência de ${brlUnit(custo)} registrada no catálogo. Revisões existentes preservam seus custos.`,
      );
      setAberto(false);
      setF({ custo: "", vigencia: new Date().toISOString().slice(0, 10), origem: "" });
      ok();
    } catch (er) {
      setErro((er as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <>
      <ActionButton
        variant="ghost"
        onClick={() => {
          setAberto(true);
          setConfirmacao(null);
        }}
      >
        Registrar novo custo
      </ActionButton>
      {confirmacao && (
        <p role="status" className="nx-cost-help">
          {confirmacao}
        </p>
      )}
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          if (!salvando) setAberto(v);
        }}
      >
        <DialogContent className="nexus-operational nx-cost-dialog">
          <DialogHeader>
            <DialogTitle>Registrar custo sugerido</DialogTitle>
            <DialogDescription>
              Referência do catálogo para novas propostas. Nenhuma revisão existente será alterada.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={salvar}>
            <label className="nx-cost-field">
              Custo unitário (R$)
              <input
                className="nx-cost-input"
                inputMode="decimal"
                autoFocus
                value={f.custo}
                onChange={(e) => {
                  setF({ ...f, custo: e.target.value });
                  setErros({ ...erros, custo: undefined });
                }}
                disabled={salvando}
                aria-invalid={!!erros.custo}
                aria-describedby="new-cost-value-help"
              />
              <span
                id="new-cost-value-help"
                className={erros.custo ? "nx-cost-error" : "nx-cost-help"}
              >
                {erros.custo ?? "R$ 0,00 é um custo informado; o campo vazio não é zero."}
              </span>
            </label>
            <label className="nx-cost-field">
              Vigência
              <input
                className="nx-cost-input"
                type="date"
                value={f.vigencia}
                onChange={(e) => setF({ ...f, vigencia: e.target.value })}
                disabled={salvando}
                aria-invalid={!!erros.vigencia}
              />
              {erros.vigencia && <span className="nx-cost-error">{erros.vigencia}</span>}
            </label>
            <label className="nx-cost-field">
              Origem da referência
              <input
                className="nx-cost-input"
                value={f.origem}
                onChange={(e) => setF({ ...f, origem: e.target.value })}
                placeholder="Cotação, fornecedor ou documento"
                disabled={salvando}
              />
            </label>
            {erro && (
              <p role="alert" className="nx-cost-error">
                {erro} Os dados preenchidos foram preservados.
              </p>
            )}
            <div className="nx-cost-actions">
              <ActionButton type="submit" disabled={salvando}>
                {salvando ? "Gravando…" : "Salvar custo"}
              </ActionButton>
              <ActionButton variant="ghost" disabled={salvando} onClick={() => setAberto(false)}>
                Cancelar
              </ActionButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
