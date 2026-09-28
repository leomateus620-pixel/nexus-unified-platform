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
import type { Json } from "@/integrations/supabase/types";
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
import { CollectionPage, ObjectCollection } from "./ui/ObjectCards";
import { ProductComponentCard } from "./ui/ProductComponentCard";

import { useEditorDialog } from "./ui/useEditorDialog";

type Comp = NonNullable<ReturnType<typeof useComponentes>["data"]>[number];

export function ItensComerciais({ revisaoId }: { revisaoId: string }) {
  const { ask, dialog } = useEditorDialog();
  const rev = useRevisao(revisaoId);
  const comps = useComponentes(revisaoId);
  const org = useOrg();
  const forn = useFornecedores(org.data?.orgId ?? "");
  const recalc = useRecalcular(revisaoId);
  const save = useSave();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtroMod, setFiltroMod] = useState("");
  const [batchSel, setBatchSel] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);
  const [colar, setColar] = useState("");
  const [erroColar, setErroColar] = useState<string | null>(null);
  const inspectorTrigger = useRef<HTMLButtonElement | null>(null);
  const inspectItem = useCallback((id: string, trigger: HTMLButtonElement) => {
    inspectorTrigger.current = trigger;
    setAberto(id);
  }, []);
  const toggleBatch = useCallback((id: string, checked: boolean) => {
    setBatchSel((previous) => {
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
    return save.run(`componentes-${ids.join(",")}`, async () => {
      const esperados = Object.fromEntries(
        ids.map((id) => {
          const previous = comps.data?.find((c) => c.id === id);
          if (!previous) throw new Error("Componente não encontrado na revisão");
          return [
            id,
            Object.fromEntries(
              Object.keys(patch).map((field) => [
                field,
                previous[field as keyof typeof previous] ?? null,
              ]),
            ),
          ];
        }),
      );
      const { data, error } = await supabase.rpc("atualizar_componentes_revisao", {
        _rev: revisaoId,
        _ids: ids,
        _patch: patch as Json,
        _esperados: esperados as Json,
      });
      if (error) throw new Error(error.message);
      if (data !== ids.length)
        throw new Error("Nem todos os componentes foram atualizados. Trabalho local preservado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: revKeys.comps(revisaoId) }),
        qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) }),
      ]);
      recalc.mutate();
    });
  }

  async function definirInclusao(ids: string[], incluido: boolean) {
    await atualizar(ids, { incluido_orcamento: incluido });
  }

  async function alterarCusto(c: Comp, valor: number) {
    if (!Number.isFinite(valor) || valor < 0) return save.set("erro", "Custo inválido");
    if (valor === Number(c.custo_adotado)) return;
    save.local("justificativa-custo");
    const answer = await ask({
      title: `Alterar custo · ${c.codigo}`,
      description: "A alteração é exclusiva desta revisão. O catálogo não será alterado.",
      reason: true,
    });
    save.settle("justificativa-custo");
    if (!answer) return false;
    const just = answer.reason;
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
    const answer = await ask({
      title: `Aplicar ${updates.length} custos`,
      description: updates
        .map((u) => `${u.c.codigo}: ${brlUnit(Number(u.c.custo_adotado))} → ${brlUnit(u.v)}`)
        .join("\n"),
      reason: true,
    });
    if (!answer) return;
    const just = answer.reason;
    if (!just || just.trim().length < 3) return setErroColar("Justificativa obrigatória");
    return save.run("colagem-custos", async () => {
      for (const u of updates) {
        const { data, error } = await supabase
          .from("revisao_componentes")
          .update({ custo_adotado: u.v, justificativa: just.trim(), custo_origem_id: null })
          .eq("id", u.c.id)
          .eq("custo_adotado", u.c.custo_adotado)
          .select("id");
        if (error) throw new Error(error.message);
        if (!data?.length)
          throw new Error(
            "Conflito na colagem de custos. Rascunho preservado; revise os componentes antes de tentar novamente.",
          );
      }
      setColar("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: revKeys.comps(revisaoId) }),
        qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) }),
      ]);
      recalc.mutate();
    });
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
        className="nx-collection-section"
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
          {lista.length > 0 && editavel && (
            <label className="nx-editor-select-all">
              <input
                type="checkbox"
                aria-label="Incluir todos os itens filtrados no orçamento"
                checked={lista.every((c) => c.incluido_orcamento)}
                onChange={(e) =>
                  void definirInclusao(
                    lista.map((c) => c.id),
                    e.target.checked,
                  )
                }
              />
              Incluir todos no orçamento
            </label>
          )}
          <span className="nx-editor-count">
            {lista.length} de {comps.data.length} itens
          </span>
        </div>
        {lista.some((c) => batchSel.has(c.id)) && editavel && (
          <div className="nx-editor-batch" aria-label="Ações para itens selecionados">
            <strong>{lista.filter((c) => batchSel.has(c.id)).length} selecionado(s) para lote</strong>
            <label>
              Modalidade em lote
              <select
                defaultValue=""
                onChange={(e) =>
                  e.target.value &&
                  atualizar(
                    lista.filter((c) => batchSel.has(c.id)).map((c) => c.id),
                    { modalidade: e.target.value },
                  )
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
                  e.target.value &&
                  atualizar(
                    lista.filter((c) => batchSel.has(c.id)).map((c) => c.id),
                    { fornecedor_id: e.target.value },
                  )
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
            <button className="nx-editor-link" onClick={() => setBatchSel(new Set())}>
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
          <CollectionPage items={linhasVisuais}>
            {(visible) => (
              <ObjectCollection label="Itens comerciais desta revisão">
                {visible.map(({ item, supplier, cost, price }) => (
                  <ProductComponentCard
                    key={item.id}
                    item={item}
                    selected={aberto === item.id}
                    batchChecked={batchSel.has(item.id)}
                    editable={editavel}
                    supplier={supplier}
                    cost={cost}
                    price={price}
                    onInspect={inspectItem}
                    onToggleIncluded={(id, included) => void definirInclusao([id], included)}
                    onToggleBatch={toggleBatch}
                  />
                ))}
              </ObjectCollection>
            )}
          </CollectionPage>
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
                    key={detalhe.id}
                    onBlur={(e) => {
                      const field = e.currentTarget;
                      void alterarCusto(detalhe, Number(field.value)).then((result) => {
                        if (result === false) field.value = String(detalhe.custo_adotado);
                      });
                    }}
                    className={`${input} text-right tabular-nums`}
                  />
                  <span>A alteração exige justificativa e preserva o catálogo global.</span>
                </label>
              )}
            </div>
            <EditorSaveState editavel={editavel} />
            {verCusto ? (
              <>
                <details className="nx-composition-memory">
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
      {dialog}
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
