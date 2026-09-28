import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Section,
} from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import { precoUnitario, mesclarParametros } from "@/features/calculo/domain";
import { useOrg } from "@/features/org/session";
import { brlUnit } from "@/lib/format";
import {
  revKeys,
  useComponentes,
  useFornecedores,
  useRecalcular,
  useRevisao,
  useSave,
} from "./hooks";

import { EditorInput, EditorInspector, EditorSaveState } from "./ui/EditorWorkspace";
import { CommercialItemRow } from "./ui/CommercialItemRow";

type Comp = NonNullable<ReturnType<typeof useComponentes>["data"]>[number];

export function ItensComerciais({ revisaoId }: { revisaoId: string }) {
  const rev = useRevisao(revisaoId);
  const comps = useComponentes(revisaoId);
  const org = useOrg();
  const forn = useFornecedores(org.data?.orgId ?? "");
  const recalc = useRecalcular(revisaoId);
  const save = useSave();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtroMod, setFiltroMod] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);
  const [colar, setColar] = useState("");
  const [erroColar, setErroColar] = useState<string | null>(null);
  const inspectorTrigger = useRef<HTMLButtonElement | null>(null);
  const inspectItem = useCallback((id: string, trigger: HTMLButtonElement) => {
    inspectorTrigger.current = trigger;
    setAberto(id);
  }, []);
  const toggleItem = useCallback((id: string, checked: boolean) => {
    setSel((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const params = useMemo(() => mesclarParametros(rev.data?.parametros), [rev.data?.parametros]);
  const verCusto = org.data?.canSeeCosts ?? false;
  const fornecedoresPorId = useMemo(
    () => new Map((forn.data ?? []).map((f) => [f.id, f.nome])),
    [forn.data],
  );

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    return (comps.data ?? []).filter(
      (c) =>
        (!q || `${c.codigo} ${c.descricao} ${c.fabricante ?? ""}`.toLowerCase().includes(q)) &&
        (!filtroMod || c.modalidade === filtroMod),
    );
  }, [comps.data, busca, filtroMod]);
  const linhasVisuais = useMemo(
    () =>
      lista.map((c) => ({
        item: c,
        supplier: fornecedoresPorId.get(c.fornecedor_id ?? "") ?? "Sem fornecedor definido",
        cost: verCusto ? brlUnit(Number(c.custo_adotado)) : null,
        price: brlUnit(precoUnitario(Number(c.custo_adotado), params).preco),
      })),
    [lista, fornecedoresPorId, verCusto, params],
  );

  if (rev.isPending || comps.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  if (comps.isError) return <ErrorState error={comps.error} onRetry={() => comps.refetch()} />;
  const editavel = rev.data.editavel;

  async function atualizar(ids: string[], patch: Record<string, unknown>) {
    save.set("salvando");
    const { error } = await supabase
      .from("revisao_componentes")
      .update(patch as never)
      .in("id", ids);
    if (error) return save.set("erro", error.message);
    await qc.invalidateQueries({ queryKey: revKeys.comps(revisaoId) });
    if ("custo_adotado" in patch) recalc.mutate();
    else save.set("salvo");
  }

  async function alterarCusto(c: Comp, valor: number) {
    if (!Number.isFinite(valor) || valor < 0) return save.set("erro", "Custo inválido");
    if (valor === Number(c.custo_adotado)) return;
    const just = window.prompt(
      `Justificativa para alterar o custo de ${c.codigo} nesta proposta (o catálogo não é alterado):`,
    );
    if (!just || just.trim().length < 3) return save.set("erro", "Justificativa obrigatória");
    await atualizar([c.id], {
      custo_adotado: valor,
      justificativa: just.trim(),
      custo_origem_id: null,
    });
  }

  async function aplicarColagem() {
    setErroColar(null);
    const linhas = colar.trim().split(/\r?\n/).filter(Boolean);
    const porCodigo = new Map((comps.data ?? []).map((c) => [c.codigo.toUpperCase(), c]));
    const erros: string[] = [];
    const updates: { c: Comp; v: number }[] = [];
    linhas.forEach((l, i) => {
      const [cod, val] = l.split(/\t|;/);
      const c = porCodigo.get((cod ?? "").trim().toUpperCase());
      const v = Number((val ?? "").trim().replace(/\./g, "").replace(",", "."));
      if (!c) erros.push(`Linha ${i + 1}: código "${cod}" não está na revisão`);
      else if (!Number.isFinite(v) || v < 0) erros.push(`Linha ${i + 1}: custo inválido`);
      else updates.push({ c, v });
    });
    if (erros.length) return setErroColar(erros.join("; "));
    const just = window.prompt(`Justificativa para ${updates.length} custos colados:`);
    if (!just || just.trim().length < 3) return setErroColar("Justificativa obrigatória");
    save.set("salvando");
    for (const u of updates) {
      const { error } = await supabase
        .from("revisao_componentes")
        .update({ custo_adotado: u.v, justificativa: just.trim(), custo_origem_id: null })
        .eq("id", u.c.id);
      if (error) return save.set("erro", error.message);
    }
    setColar("");
    await qc.invalidateQueries({ queryKey: revKeys.comps(revisaoId) });
    recalc.mutate();
  }

  const detalhe = (comps.data ?? []).find((c) => c.id === aberto) ?? null;
  const input = "nx-editor-input";

  if (!comps.data?.length)
    return (
      <EmptyState
        title="Esta revisão não tem componentes"
        hint="Os componentes são copiados do catálogo de Produtos e Soluções ao criar a proposta. Cadastre ou importe o catálogo e crie uma nova revisão."
      />
    );

  return (
    <div className="nx-editor-workspace" data-inspector={!!detalhe}>
      <Section
        title="Itens comerciais"
        description="Catálogo adotado nesta revisão. Selecione um item para editar seus valores e consultar a memória de preço."
      >
        <div className="nx-editor-toolbar">
          <label className="nx-editor-search">
            Buscar item
            <input
              placeholder="Código, descrição ou fabricante"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={input}
            />
          </label>
          <label>
            Modalidade
            <select
              value={filtroMod}
              onChange={(e) => setFiltroMod(e.target.value)}
              className={input}
            >
              <option value="">Todas as modalidades</option>
              <option value="comprar">Comprar</option>
              <option value="fabricar">Fabricar</option>
              <option value="terceirizar">Terceirizar</option>
            </select>
          </label>
          {lista.length > 0 && (
            <label className="nx-editor-select-all">
              <input
                type="checkbox"
                aria-label="Selecionar todos os itens filtrados"
                checked={sel.size === lista.length && lista.length > 0}
                onChange={(e) =>
                  setSel(e.target.checked ? new Set(lista.map((c) => c.id)) : new Set())
                }
              />
              Selecionar todos
            </label>
          )}
          <span className="nx-editor-count">
            {lista.length} de {comps.data.length} itens
          </span>
        </div>
        {sel.size > 0 && editavel && (
          <div className="nx-editor-batch" aria-label="Ações para itens selecionados">
            <strong>{sel.size} selecionado(s)</strong>
            <label>
              Modalidade em lote
              <select
                defaultValue=""
                onChange={(e) =>
                  e.target.value && atualizar([...sel], { modalidade: e.target.value })
                }
                className={input}
              >
                <option value="">Definir modalidade…</option>
                <option value="comprar">Comprar</option>
                <option value="fabricar">Fabricar</option>
                <option value="terceirizar">Terceirizar</option>
              </select>
            </label>
            <label>
              Fornecedor em lote
              <select
                defaultValue=""
                onChange={(e) =>
                  e.target.value && atualizar([...sel], { fornecedor_id: e.target.value })
                }
                className={input}
              >
                <option value="">Definir fornecedor…</option>
                {(forn.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
            <button className="nx-editor-link" onClick={() => setSel(new Set())}>
              Limpar seleção
            </button>
          </div>
        )}
        <EditorSaveState editavel={editavel} />
        {lista.length === 0 ? (
          <EmptyState
            title="Nenhum item corresponde aos filtros"
            hint="Revise o código, a descrição ou a modalidade selecionada."
            action={
              <ActionButton
                variant="ghost"
                onClick={() => {
                  setBusca("");
                  setFiltroMod("");
                }}
              >
                Limpar filtros
              </ActionButton>
            }
          />
        ) : (
          <div
            className="nx-editor-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Itens comerciais, tabela com rolagem horizontal"
          >
            <table
              className="nx-editor-table nx-commercial-table"
              role="table"
              aria-label="Itens comerciais desta revisão"
            >
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">
                    Seleção
                  </th>
                  <th scope="col" role="columnheader">
                    Item / descrição
                  </th>
                  <th scope="col" role="columnheader">
                    Un.
                  </th>
                  <th scope="col" role="columnheader">
                    Modalidade / fornecedor
                  </th>
                  {verCusto && (
                    <th scope="col" role="columnheader" data-numeric>
                      Custo nesta revisão
                    </th>
                  )}
                  <th scope="col" role="columnheader" data-numeric>
                    Preço unit. (calc.)
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {linhasVisuais.map(({ item, supplier, cost, price }) => (
                  <CommercialItemRow
                    key={item.id}
                    item={item}
                    selected={aberto === item.id}
                    checked={sel.has(item.id)}
                    editable={editavel}
                    supplier={supplier}
                    cost={cost}
                    price={price}
                    onInspect={inspectItem}
                    onToggle={toggleItem}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editavel && verCusto && (
          <details className="nx-editor-paste">
            <summary>Colar custos de planilha</summary>
            <label className="nx-editor-field">
              Código ⇥ custo · uma linha por item
              <textarea
                value={colar}
                onChange={(e) => setColar(e.target.value)}
                rows={4}
                className={input}
                aria-invalid={!!erroColar}
                aria-describedby={erroColar ? "nx-cost-paste-error" : undefined}
                placeholder={"COMP-05\t12,94"}
              />
            </label>
            {erroColar && (
              <p id="nx-cost-paste-error" className="nx-editor-error" role="alert">
                {erroColar}
              </p>
            )}
            <ActionButton variant="ghost" onClick={aplicarColagem} disabled={!colar.trim()}>
              Validar e aplicar
            </ActionButton>
          </details>
        )}
      </Section>
      <EditorInspector
        open={!!detalhe}
        title="Item comercial"
        description="Valores e condições nesta revisão"
        onClose={() => setAberto(null)}
        returnFocus={inspectorTrigger}
      >
        {detalhe && (
          <>
            <div className="nx-inspector-identity">
              <span className="nx-editor-code">{detalhe.codigo}</span>
              <h3>{detalhe.descricao}</h3>
              <span className="nx-editor-meta">
                {detalhe.fabricante ?? "Fabricante não informado"} · {detalhe.unidade} · NCM{" "}
                {detalhe.ncm ?? "—"}
              </span>
            </div>
            <div className="nx-inspector-fields">
              <h4>Condições do item</h4>
              <label className="nx-editor-field">
                Modalidade
                <select
                  disabled={!editavel}
                  value={detalhe.modalidade}
                  onChange={(e) => atualizar([detalhe.id], { modalidade: e.target.value })}
                  className={input}
                >
                  <option value="comprar">Comprar</option>
                  <option value="fabricar">Fabricar</option>
                  <option value="terceirizar">Terceirizar</option>
                </select>
              </label>
              <label className="nx-editor-field">
                Fornecedor
                <select
                  disabled={!editavel}
                  value={detalhe.fornecedor_id ?? ""}
                  onChange={(e) =>
                    atualizar([detalhe.id], { fornecedor_id: e.target.value || null })
                  }
                  className={input}
                >
                  <option value="">Sem fornecedor definido</option>
                  {(forn.data ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </label>
              {verCusto && (
                <label className="nx-editor-field">
                  Custo nesta revisão · R$
                  <EditorInput
                    aria-label={`Custo ${detalhe.codigo}`}
                    type="number"
                    step="0.0001"
                    min={0}
                    disabled={!editavel}
                    defaultValue={Number(detalhe.custo_adotado)}
                    key={`${detalhe.id}-${detalhe.custo_adotado}`}
                    onBlur={(e) => alterarCusto(detalhe, Number(e.target.value))}
                    className={`${input} text-right tabular-nums`}
                  />
                  <span>A alteração exige justificativa e preserva o catálogo global.</span>
                </label>
              )}
            </div>
            <EditorSaveState editavel={editavel} />
            {verCusto ? (
              <>
                <details open className="nx-composition-memory">
                  <summary>Memória do preço unitário</summary>
                  <VerCalculo custo={Number(detalhe.custo_adotado)} params={params} />
                </details>
                <p className="nx-editor-note">
                  Origem do custo:{" "}
                  {detalhe.custo_origem_id
                    ? "catálogo (vigência mais recente)"
                    : `ajuste manual — ${detalhe.justificativa ?? "sem justificativa"}`}
                </p>
              </>
            ) : (
              <p className="nx-editor-note">Custos e margens não disponíveis para o seu perfil.</p>
            )}
          </>
        )}
      </EditorInspector>
    </div>
  );
}

function VerCalculo({
  custo,
  params,
}: {
  custo: number;
  params: ReturnType<typeof mesclarParametros>;
}) {
  const p = precoUnitario(custo, params);
  const linhas: [string, string][] = [
    ["Custo adotado", brlUnit(custo)],
    [`Frete (${params.frete_materiais * 100}%)`, brlUnit(p.frete)],
    [`Provisão de imposto (${params.aliquota_precificacao * 100}%)`, brlUnit(p.imposto)],
    [`DIFAL ${params.difal_ativo ? "" : "(inativo)"}`, brlUnit(p.difal)],
    ["Custo composto", brlUnit(p.composto)],
    [`Markup (${params.markup * 100}%)`, brlUnit(p.preco - p.composto)],
    ["Preço de venda unitário", brlUnit(p.preco)],
  ];
  return (
    <dl className="nx-inspector-dl nx-inspector-price">
      {linhas.map(([k, v]) => (
        <div key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tabular-nums text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
