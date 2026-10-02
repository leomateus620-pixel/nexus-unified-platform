import { PendenciasImportacao } from "@/features/custos/PendenciasImportacao";
import { ImportacaoAssistida } from "@/features/importacao/ImportacaoAssistida";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useState } from "react";
import { ArrowRight, FileInput, Hash, Plus, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { ActionButton, EmptyState, PageHeader, QueryView } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/features/org/session";
import { importarModeloPlanilha } from "@/features/propostas/propostas.functions";
import { recodificarProduto } from "@/features/catalogo/catalogo.functions";
import {
  ArvoreEstrutura,
  FamiliaPicker,
  ProductEditorPanel,
  usePermissoes,
} from "@/features/catalogo/ProductEditor";
import { TIPOS_ITEM, nomeTipo, type TipoItem } from "@/features/catalogo/codigos";
import { brlUnit } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/produtos/")({
  head: () => ({
    meta: [
      { title: "Produtos e Soluções — Sistema Nexus" },
      {
        name: "description",
        content: "Catálogo de produtos, grupos comerciais e códigos Nexus.",
      },
      { property: "og:title", content: "Produtos e Soluções — Sistema Nexus" },
      { property: "og:description", content: "Catálogo de componentes codificados." },
    ],
  }),
  component: Produtos,
});

type Familia = {
  sigla: string;
  nome: string;
  grupo: string;
  situacao: string;
  observacao: string | null;
};

export function useFamilias() {
  return useQuery({
    queryKey: ["familias_codigo"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("familias_codigo")
        .select("sigla,nome,grupo,situacao,observacao")
        .order("ordem");
      if (error) throw error;
      return data as Familia[];
    },
  });
}

function useProdutos(orgId: string) {
  return useQuery({
    queryKey: ["produtos", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select(
          "id,codigo,codigo_legado,familia,familia_tecnica,tipo_item,descricao,unidade,ncm,modalidade,ativo,material,dimensoes,composicao_status,base_custo,descricao_original,fabricantes(nome),produto_referencias(codigo_fornecedor),produto_custos(custo,vigencia,created_at)",
        )
        .eq("organization_id", orgId)
        .order("codigo");
      if (error) throw error;
      return data.map((p) => {
        const c = [...(p.produto_custos ?? [])].sort((a, b) =>
          a.vigencia === b.vigencia
            ? b.created_at.localeCompare(a.created_at)
            : b.vigencia.localeCompare(a.vigencia),
        )[0];
        return { ...p, custo: c ? Number(c.custo) : null };
      });
    },
  });
}

function useSeries(orgId: string) {
  return useQuery({
    queryKey: ["series_codigo", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [pl, sc, pr] = await Promise.all([
        supabase.from("series_planilha").select("familia,tipo,ultimo,pendencia"),
        supabase.from("series_codigo").select("familia,tipo,ultimo").eq("organization_id", orgId),
        supabase
          .from("produtos")
          .select("familia,tipo_item,sequencia")
          .eq("organization_id", orgId)
          .not("sequencia", "is", null),
      ]);
      if (pl.error) throw pl.error;
      if (sc.error) throw sc.error;
      if (pr.error) throw pr.error;
      const m = new Map<
        string,
        { familia: string; tipo: string; ultimo: number; pendencia: string | null }
      >();
      const up = (f: string, t: string, n: number, pend?: string | null) => {
        const k = `${f}-${t}`;
        const cur = m.get(k) ?? { familia: f, tipo: t, ultimo: 0, pendencia: null };
        cur.ultimo = Math.max(cur.ultimo, n);
        if (pend) cur.pendencia = pend;
        m.set(k, cur);
      };
      pl.data.forEach((s) => up(s.familia, s.tipo, s.ultimo, s.pendencia));
      sc.data.forEach((s) => up(s.familia, s.tipo, s.ultimo));
      pr.data.forEach((s) => up(s.familia!, s.tipo_item!, s.sequencia!));
      return [...m.values()];
    },
  });
}

const input = "h-11 min-w-0 rounded border border-input bg-background px-3 text-sm text-foreground";

function Produtos() {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const admin = org.data?.isAdmin ?? false;
  const verCusto = org.data?.canSeeCosts ?? false;
  const perms = usePermissoes();
  const fam = useFamilias();
  const q = useProdutos(orgId);
  const series = useSeries(orgId);
  const pendenciasImportacao = useQuery({
    queryKey: ["pendencias-importacao"],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("importacao_registros")
        .select("id,aba,linha,tema,explicacao,dados")
        .eq("situacao", "pendente")
        .order("aba")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const qc = useQueryClient();
  const imp = useServerFn(importarModeloPlanilha);
  const importar = useMutation({
    mutationFn: () => imp(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["produtos", orgId] }),
  });
  const familias = useMemo(() => fam.data ?? [], [fam.data]);
  const nomeFam = (sigla: string | null) =>
    familias.find((f) => f.sigla === sigla)?.nome ?? sigla ?? "Não definido";
  const [busca, setBusca] = useState("");
  const [fFam, setFFam] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [superficie, setSuperficie] = useState<
    "detalhes" | "editar" | "novo" | "importar" | "series" | "pendencias" | null
  >(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [resumoImportacao, setResumoImportacao] = useState("");
  const [mostrarResumoImportacao, setMostrarResumoImportacao] = useState(false);
  const importacaoConcluida = useCallback((resumo: string) => {
    setResumoImportacao(resumo);
    setMostrarResumoImportacao(false);
  }, []);
  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (q.data ?? []).filter(
      (p) =>
        (!termo ||
          [
            p.codigo,
            p.descricao,
            p.codigo_legado,
            p.familia,
            familias.find((f) => f.sigla === p.familia)?.nome,
            p.familia_tecnica,
            p.material,
            p.dimensoes,
            p.descricao_original,
            ...(p.produto_referencias ?? []).map((r) => r.codigo_fornecedor),
          ]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(termo))) &&
        (!fFam || p.familia === fFam || (fFam === "__pend" && !p.familia)) &&
        (!fTipo || p.tipo_item === fTipo),
    );
  }, [q.data, busca, fFam, fTipo, familias]);
  const pendentes = (q.data ?? []).filter((p) => !p.familia);
  const produto = q.data?.find((p) => p.id === selecionado);
  const filtrosAtivos = !!(busca || fFam || fTipo);
  const limpar = () => {
    setBusca("");
    setFFam("");
    setFTipo("");
  };
  const restrito =
    q.isError &&
    ["42501", "PGRST301", "401", "403"].includes(String((q.error as { code?: string }).code));
  const titulos = {
    detalhes: "Ficha rápida do produto",
    importar: "Importar dados da planilha",
    series: "Grupos comerciais e séries",
    pendencias: "Pendências de cadastro",
  };
  const contextual =
    superficie && superficie !== "novo" && superficie !== "editar" ? superficie : null;
  const importsCount = pendenciasImportacao.data?.length;

  return (
    <div className="nx-catalog">
      <PageHeader
        eyebrow="Produtos e Soluções"
        title="Catálogo de produtos"
        description="Encontre um item, consulte sua composição e mantenha o cadastro comercial organizado."
        actions={
          <ActionButton
            disabled={!perms.data?.importar_catalogo}
            onClick={() => {
              setConfirmacao("");
              setSuperficie("novo");
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              Cadastrar item
            </span>
          </ActionButton>
        }
      />
      <div className="nx-catalog-toolbar">
        <ActionButton variant="ghost" onClick={() => setSuperficie("importar")}>
          <span className="inline-flex items-center gap-2">
            <FileInput size={16} />
            Importação
          </span>
        </ActionButton>
        <ActionButton variant="ghost" onClick={() => setSuperficie("series")}>
          <span className="inline-flex items-center gap-2">
            <Hash size={16} />
            Séries de códigos
          </span>
        </ActionButton>
        <button
          type="button"
          className="min-h-10 px-3 text-sm underline underline-offset-4"
          onClick={() => setSuperficie("pendencias")}
        >
          Consultar pendências
        </button>
        {perms.data && !perms.data.importar_catalogo && (
          <span className="text-sm text-muted-foreground">Cadastro restrito ao seu perfil</span>
        )}
        {perms.isError && (
          <span role="alert" className="text-sm text-destructive">
            Permissões indisponíveis.{" "}
            <button type="button" className="underline" onClick={() => perms.refetch()}>
              Tentar novamente
            </button>
          </span>
        )}
      </div>
      {(pendentes.length > 0 || (importsCount ?? 0) > 0) && (
        <div className="nx-catalog-notice mt-4 flex flex-wrap items-center justify-between gap-3">
          <p>
            {pendentes.length > 0 && (
              <>
                <strong>{pendentes.length}</strong>{" "}
                {pendentes.length === 1 ? "item com código pendente" : "itens com código pendente"}
                {(importsCount ?? 0) > 0 ? " · " : ""}
              </>
            )}
            {(importsCount ?? 0) > 0 && (
              <>
                <strong>{importsCount}</strong>{" "}
                {importsCount === 1 ? "pendência de importação" : "pendências de importação"}
              </>
            )}
          </p>
          <button
            type="button"
            className="font-semibold underline underline-offset-4"
            onClick={() => setSuperficie("pendencias")}
          >
            Ver detalhes
          </button>
        </div>
      )}
      {confirmacao && (
        <p role="status" className="mt-4 text-sm text-primary">
          {confirmacao}
        </p>
      )}
      <section aria-label="Produtos do catálogo">
        <div className="nx-catalog-filters">
          <div className="nx-catalog-search">
            <Search size={20} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar produto"
              placeholder="Buscar nome, código, referência ou medida"
              className={input}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <select
            aria-label="Filtrar grupo comercial"
            className={input}
            value={fFam}
            onChange={(e) => setFFam(e.target.value)}
          >
            <option value="">Todos os grupos comerciais</option>
            {familias.map((f) => (
              <option key={f.sigla} value={f.sigla}>
                {f.nome} — {f.sigla}
              </option>
            ))}
            <option value="__pend">Código pendente</option>
          </select>
          <select
            aria-label="Filtrar tipo"
            className={input}
            value={fTipo}
            onChange={(e) => setFTipo(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            {TIPOS_ITEM.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="nx-catalog-result">
          <span role="status">
            {q.isPending
              ? "Carregando catálogo…"
              : q.isError
                ? "Consulta não concluída"
                : `${linhas.length} ${linhas.length === 1 ? "produto" : "produtos"}${filtrosAtivos ? ` de ${q.data?.length ?? 0}` : ""}`}
          </span>
          {filtrosAtivos && (
            <button
              type="button"
              className="min-h-9 font-semibold text-foreground underline underline-offset-4"
              onClick={limpar}
            >
              Limpar filtros
            </button>
          )}
        </div>
        {q.isPending ? (
          <div aria-busy="true" className="py-12 text-center text-sm text-muted-foreground">
            Carregando produtos e referências…
          </div>
        ) : q.isError ? (
          <div role="alert" className="py-8">
            <EmptyState
              title={
                restrito ? "Acesso restrito ao catálogo" : "Não foi possível carregar o catálogo"
              }
              hint={restrito ? "Seu perfil não tem acesso a estes registros." : q.error.message}
            />
            {!restrito && (
              <ActionButton variant="ghost" onClick={() => q.refetch()}>
                Tentar novamente
              </ActionButton>
            )}
          </div>
        ) : !q.data?.length ? (
          <EmptyState
            title="Seu catálogo está vazio"
            hint={
              perms.data?.importar_catalogo
                ? "Use Cadastrar item para começar ou consulte a importação de planilhas."
                : "Ainda não há produtos disponíveis. Solicite o cadastro ao responsável."
            }
          />
        ) : !linhas.length ? (
          <EmptyState
            title="Nenhum produto encontrado"
            hint="Revise a busca ou limpe os filtros para consultar todos os produtos."
          />
        ) : (
          <ul className="nx-catalog-grid" data-costs={verCusto}>
            <li className="nx-catalog-columns" aria-hidden="true">
              <span>Produto / código</span>
              <span>Tipo / unidade</span>
              <span>Situação</span>
              {verCusto && <span className="text-right">Custo sugerido</span>}
              <span />
            </li>
            {linhas.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={selecionado === p.id ? "true" : undefined}
                  aria-label={`Ver detalhes de ${p.descricao}, ${p.codigo}`}
                  onClick={() => {
                    setSelecionado(p.id);
                    setSuperficie("detalhes");
                  }}
                  className="nx-catalog-row"
                >
                  <span className="nx-catalog-name">
                    <strong title={p.descricao}>{p.descricao}</strong>
                    <span className="font-mono">{p.codigo}</span>
                  </span>
                  <span className="nx-catalog-support">
                    <span>
                      {nomeTipo(p.tipo_item)} · {p.unidade}
                    </span>
                    <span>{nomeFam(p.familia)}</span>
                  </span>
                  <span className="nx-catalog-support">
                    <span className={!p.ativo || !p.familia ? "text-warning" : ""}>
                      {!p.ativo ? "Inativo" : !p.familia ? "Código pendente" : "Cadastro ativo"}
                    </span>
                    {p.tipo_item && p.tipo_item !== "P" && (
                      <span className={p.composicao_status === "definida" ? "" : "text-warning"}>
                        {p.composicao_status === "definida"
                          ? "Composição definida"
                          : "Composição pendente"}
                      </span>
                    )}
                  </span>
                  {verCusto && (
                    <span className="nx-catalog-cost">
                      {p.custo === null ? (
                        <span className="text-muted-foreground">Pendente</span>
                      ) : (
                        <>
                          {brlUnit(p.custo)}
                          {p.custo === 0 && (
                            <span className="block text-sm text-muted-foreground">
                              Zero informado
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  )}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProductEditorPanel
        open={superficie === "novo" || superficie === "editar"}
        onOpenChange={(open) => {
          if (!open) setSuperficie(null);
        }}
        {...(superficie === "editar" && selecionado ? { produtoId: selecionado } : {})}
        onCancel={() => setSuperficie(superficie === "editar" ? "detalhes" : null)}
        onSaved={(r) => {
          setConfirmacao(
            `${r.novo ? "Produto cadastrado" : "Cadastro salvo"}. Código confirmado: ${r.codigo}.`,
          );
          setSelecionado(r.id);
          setSuperficie("detalhes");
        }}
      />
      <Sheet
        open={!!contextual}
        onOpenChange={(open) => {
          if (!open && !importBusy && !importar.isPending) {
            if (contextual === "importar") setMostrarResumoImportacao(true);
            setSuperficie(null);
          }
        }}
      >
        <SheetContent
          className="nexus-operational nx-catalog-shell nx-product-panel"
          onEscapeKeyDown={(event) => {
            if (importBusy || importar.isPending) event.preventDefault();
          }}
        >
          <SheetHeader className="nx-product-panel-heading">
            <SheetTitle className="font-display text-xl">
              {contextual ? titulos[contextual] : "Catálogo"}
            </SheetTitle>
            <SheetDescription>
              {contextual === "detalhes"
                ? "Cadastro mestre · produto reutilizável no catálogo e nas propostas."
                : contextual === "series"
                  ? "Numeração controlada pelo servidor, por grupo comercial e tipo."
                  : contextual === "importar"
                    ? "Cole os dados do Excel, confira as colunas e revise os registros antes de importar."
                    : "Registros que aguardam uma decisão de classificação ou de origem."}
            </SheetDescription>
          </SheetHeader>
          <div className="nx-product-panel-scroll">
            {contextual === "detalhes" && produto && (
              <div className="nx-catalog-detail">
                <div>
                  <h2 className="font-display text-2xl font-semibold leading-tight">
                    {produto.descricao}
                  </h2>
                  <p className="mt-2 font-mono text-base text-muted-foreground">{produto.codigo}</p>
                  {produto.descricao_original &&
                    produto.descricao_original !== produto.descricao && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Descrição de origem: {produto.descricao_original}
                      </p>
                    )}
                </div>
                <dl>
                  <Info
                    k="Grupo comercial / prefixo do código"
                    v={
                      produto.familia
                        ? `${nomeFam(produto.familia)} — ${produto.familia}`
                        : "A definir"
                    }
                  />
                  <Info
                    k="Família técnica · opcional"
                    v={produto.familia_tecnica ?? "Não informada"}
                  />
                  <Info
                    k="Tipo / unidade"
                    v={`${nomeTipo(produto.tipo_item)} · ${produto.unidade}`}
                  />
                  <Info
                    k="Fornecimento"
                    v={
                      produto.modalidade === "comprar"
                        ? "Comprar"
                        : produto.modalidade === "fabricar"
                          ? "Fabricar"
                          : "Terceirizar"
                    }
                  />
                  <Info
                    k="Fabricante"
                    v={(produto.fabricantes as { nome: string } | null)?.nome ?? "Não informado"}
                  />
                  <Info k="NCM" v={produto.ncm ?? "Não informado"} />
                  <Info k="Código anterior" v={produto.codigo_legado ?? "Não informado"} />
                  {verCusto && (
                    <Info
                      k="Custo sugerido para novas propostas"
                      v={
                        produto.custo === null ? "Sem referência de custo" : brlUnit(produto.custo)
                      }
                    />
                  )}
                </dl>
                <div className="flex flex-wrap gap-3">
                  {perms.data?.editar_cadastro && (
                    <ActionButton onClick={() => setSuperficie("editar")}>
                      Editar cadastro mestre
                    </ActionButton>
                  )}
                  <Link
                    to="/produtos/$produtoId"
                    params={{ produtoId: produto.id }}
                    className="inline-flex min-h-10 items-center text-sm font-semibold underline underline-offset-4"
                  >
                    Abrir ficha completa{verCusto ? " e custos" : ""}
                  </Link>
                </div>
                {produto.tipo_item && produto.tipo_item !== "P" && (
                  <section>
                    <h3 className="font-display text-lg font-semibold">Composição por 1 unidade</h3>
                    <p className="mb-3 mt-1 text-sm text-muted-foreground">
                      {produto.base_custo === "completo"
                        ? "Produto comprado completo: componentes internos informativos."
                        : "Custo por composição: componentes participam da formação do custo."}
                    </p>
                    <EstruturaCatalogo produtoId={produto.id} />
                  </section>
                )}
              </div>
            )}
            {contextual === "importar" && (
              <div className="p-4 sm:p-6">
                {mostrarResumoImportacao && resumoImportacao && (
                  <p role="status" className="mb-4 text-sm text-primary">
                    Última importação concluída: {resumoImportacao}
                  </p>
                )}
                <ImportacaoAssistida
                  podeRegistrar={perms.data?.importar_catalogo === true}
                  onBusyChange={setImportBusy}
                  onCompletion={importacaoConcluida}
                />
                {admin && (
                  <details className="mt-6 border-t border-border pt-4">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Biblioteca da planilha modelo
                    </summary>
                    <p className="my-3 text-sm text-muted-foreground">
                      Importação administrativa da biblioteca já integrada ao sistema.
                    </p>
                    <ActionButton
                      variant="ghost"
                      loading={importar.isPending}
                      onClick={() => importar.mutate()}
                    >
                      Importar biblioteca da planilha modelo
                    </ActionButton>
                    {importar.isSuccess && (
                      <p role="status" className="mt-3 text-sm text-primary">
                        Importação concluída: {importar.data.inseridos} componente(s) novo(s).
                        {importar.data.pendentes.length > 0 &&
                          ` Aguardando classificação: ${importar.data.pendentes.join(", ")}.`}
                      </p>
                    )}
                    {importar.isError && (
                      <p role="alert" className="mt-3 text-sm text-destructive">
                        {(importar.error as Error).message}
                      </p>
                    )}
                  </details>
                )}
              </div>
            )}
            {contextual === "pendencias" && (
              <div className="space-y-6 p-4 sm:p-6">
                {confirmacao && (
                  <p role="status" className="text-sm text-primary">
                    {confirmacao}
                  </p>
                )}
                {pendentes.length > 0 && (
                  <section>
                    <h3 className="mb-2 font-display text-lg font-semibold">
                      {pendentes.length} códigos aguardando definição
                    </h3>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Escolha o grupo comercial e o tipo. O código definitivo é confirmado ao
                      salvar.
                    </p>
                    {admin ? (
                      <ul className="space-y-3">
                        {pendentes.map((p) => (
                          <Pendente
                            key={p.id}
                            p={p}
                            familias={familias}
                            orgId={orgId}
                            onConfirmed={(codigo) =>
                              setConfirmacao(`Classificação salva. Código confirmado: ${codigo}.`)
                            }
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        A definição de códigos exige acesso de administrador.
                      </p>
                    )}
                  </section>
                )}
                {pendenciasImportacao.isPending ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Carregando pendências da importação…
                  </p>
                ) : pendenciasImportacao.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    Não foi possível consultar as pendências.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => pendenciasImportacao.refetch()}
                    >
                      Tentar novamente
                    </button>
                  </p>
                ) : (
                  <PendenciasImportacao podeResolver={admin} />
                )}
                {!pendentes.length && importsCount === 0 && (
                  <EmptyState
                    title="Nenhuma pendência encontrada"
                    hint="Os registros consultados não têm decisões de cadastro em aberto."
                  />
                )}
              </div>
            )}
            {contextual === "series" && (
              <div className="p-4 sm:p-6">
                <QueryView
                  query={series}
                  empty={
                    <EmptyState
                      title="Nenhuma série encontrada"
                      hint="A numeração começa quando os primeiros itens são cadastrados."
                    />
                  }
                >
                  {(rows) => (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-muted-foreground">
                          <tr>
                            <th className="p-3">Grupo comercial</th>
                            <th className="p-3">Tipo</th>
                            <th className="p-3">Último</th>
                            <th className="p-3">Prévia do próximo código</th>
                          </tr>
                        </thead>
                        <tbody>
                          {familias.flatMap((f) =>
                            rows
                              .filter((r) => r.familia === f.sigla)
                              .sort((a, b) => "MSP".indexOf(a.tipo) - "MSP".indexOf(b.tipo))
                              .map((r) => (
                                <tr
                                  key={`${r.familia}${r.tipo}`}
                                  className="border-t border-border"
                                >
                                  <td className="p-3">
                                    {f.nome} — <span className="font-mono">{f.sigla}</span>
                                    {(r.pendencia || f.situacao === "a_confirmar") && (
                                      <p className="mt-1 text-sm text-warning">
                                        {r.pendencia ?? f.observacao}
                                      </p>
                                    )}
                                  </td>
                                  <td className="p-3">{nomeTipo(r.tipo)}</td>
                                  <td className="p-3 font-mono tabular-nums">
                                    {String(r.ultimo).padStart(3, "0")}
                                  </td>
                                  <td className="p-3 font-mono">
                                    {f.sigla}-NXS-{r.tipo}
                                    {String(r.ultimo + 1).padStart(3, "0")}
                                  </td>
                                </tr>
                              )),
                          )}
                        </tbody>
                      </table>
                      <p className="mt-4 text-sm text-muted-foreground">
                        Confirmado ao salvar. As prévias não reservam números. Lacunas históricas
                        não são reutilizadas; séries sem histórico começam em 001.
                      </p>
                    </div>
                  )}
                </QueryView>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{k}:</dt>
      <dd className="capitalize-first text-foreground">{v}</dd>
    </div>
  );
}

function usePrevia(orgId: string, familia: string, tipo: string) {
  return useQuery({
    queryKey: ["previa_codigo", orgId, familia, tipo],
    enabled: !!orgId && !!familia && !!tipo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("previa_codigo", {
        _org: orgId,
        _familia: familia,
        _tipo: tipo,
      });
      if (error) throw error;
      return data as string | null;
    },
  });
}

function Pendente({
  p,
  familias,
  orgId,
  onConfirmed,
}: {
  p: { id: string; codigo: string; descricao: string };
  familias: Familia[];
  orgId: string;
  onConfirmed: (codigo: string) => void;
}) {
  const qc = useQueryClient();
  const rec = useServerFn(recodificarProduto);
  const [familia, setFamilia] = useState("");
  const [tipo, setTipo] = useState<TipoItem | "">("");
  const previa = usePrevia(orgId, familia, tipo);
  const m = useMutation({
    mutationFn: () => rec({ data: { produto_id: p.id, familia, tipo: tipo as TipoItem } }),
    onSuccess: (result) => {
      onConfirmed(result.codigo);
      qc.invalidateQueries({ queryKey: ["produtos", orgId] });
      qc.invalidateQueries({ queryKey: ["series_codigo", orgId] });
    },
  });
  return (
    <li className="grid gap-2 rounded border border-border p-3 sm:grid-cols-2 sm:items-center">
      <div className="text-sm">
        <span className="font-mono font-semibold">{p.codigo}</span> <span>{p.descricao}</span>
      </div>
      <FamiliaPicker id={`fam-${p.id}`} familias={familias} value={familia} onChange={setFamilia} />
      <select
        aria-label={`Tipo de ${p.codigo}`}
        className={input}
        value={tipo}
        onChange={(e) => setTipo(e.target.value as TipoItem)}
      >
        <option value="">Tipo</option>
        {TIPOS_ITEM.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.nome}
          </option>
        ))}
      </select>
      <ActionButton loading={m.isPending} disabled={!familia || !tipo} onClick={() => m.mutate()}>
        Confirmar classificação
      </ActionButton>
      {previa.data && (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Prévia do código: <span className="font-mono">{previa.data}</span> · Confirmado ao salvar
        </p>
      )}
      {m.isError && (
        <p className="text-sm text-destructive sm:col-span-2">{(m.error as Error).message}</p>
      )}
    </li>
  );
}

function EstruturaCatalogo({ produtoId }: { produtoId: string }) {
  const q = useQuery({
    queryKey: ["arvore", produtoId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("arvore_produto", { _produto: produtoId });
      if (error) throw error;
      return data as unknown as Parameters<typeof ArvoreEstrutura>[0]["no"];
    },
  });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Carregando composição…</p>;
  if (q.isError) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!(q.data.filhos ?? []).length)
    return (
      <p className="text-sm text-warning">Composição pendente: nenhum componente cadastrado.</p>
    );
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Quantidades derivadas desta composição unitária.
      </p>
      <ArvoreEstrutura no={q.data} />
    </div>
  );
}
