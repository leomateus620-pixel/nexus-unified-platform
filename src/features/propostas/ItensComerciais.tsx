import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, Search, X } from "lucide-react";

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
import { brlUnit, qtd } from "@/lib/format";
import { revKeys, useComponentes, useFornecedores, useRevisao, useSave } from "./hooks";

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
  const save = useSave();
  const qc = useQueryClient();
  const acknowledged = useRef(new Map<string, Record<string, unknown>>());
  useEffect(() => {
    for (const [id, patch] of acknowledged.current) {
      const current = comps.data?.find((row) => row.id === id);
      if (
        current &&
        Object.entries(patch).some(([field, value]) => current[field as keyof Comp] !== value)
      )
        acknowledged.current.delete(id);
    }
  }, [comps.data]);
  const [busca, setBusca] = useState("");
  const [filtroMod, setFiltroMod] = useState("");
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [modalidadeAberta, setModalidadeAberta] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const modalityInput = useRef<HTMLSelectElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const modalityTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (buscaAberta) searchInput.current?.focus();
  }, [buscaAberta]);
  useEffect(() => {
    if (modalidadeAberta) modalityInput.current?.focus();
  }, [modalidadeAberta]);
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
        price: brlUnit(precoUnitario(Number(c.custo_adotado), params).preco),
        quantity: rev.data?.desatualizada
          ? "Pendente"
          : rev.data?.resumo
            ? qtd(
                rev.data.resumo.por_componente.find((row) => row.componente_id === c.id)
                  ?.quantidade ?? 0,
                c.unidade,
              )
            : "Não calculada",
      })),
    [lista, rev.data, params],
  );

  if (rev.isPending || comps.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  if (comps.isError) return <ErrorState error={comps.error} onRetry={() => comps.refetch()} />;
  const editavel = rev.data.editavel;

  async function atualizar(ids: string[], patch: Record<string, unknown>) {
    const fields = Object.keys(patch).sort().join(",");
    const operationKey = `componentes-${[...ids].sort().join(",")}:${fields}`;
    const atualizados = await save.run(operationKey, async () => {
      ids = ids.filter((id) => {
        const previous = comps.data?.find((c) => c.id === id);
        return (
          previous &&
          Object.entries(patch).some(([field, value]) => {
            const acknowledgedValue = acknowledged.current.get(id);
            return (
              (acknowledgedValue && field in acknowledgedValue
                ? acknowledgedValue[field]
                : previous[field as keyof Comp]) !== value
            );
          })
        );
      });
      if (!ids.length) return 0;
      const esperados = Object.fromEntries(
        ids.map((id) => {
          const previous = comps.data?.find((c) => c.id === id);
          if (!previous) throw new Error("Componente não encontrado na revisão");
          return [
            id,
            Object.fromEntries(
              Object.keys(patch).map((field) => [
                field,
                acknowledged.current.get(id) && field in acknowledged.current.get(id)!
                  ? acknowledged.current.get(id)![field]
                  : (previous[field as keyof typeof previous] ?? null),
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
      if (error) {
        // A response may have been lost after the server accepted this exact patch.
        const replay = await supabase.from("revisao_componentes").select("*").in("id", ids);
        const alreadyApplied =
          !replay.error &&
          replay.data?.length === ids.length &&
          replay.data.every((row) =>
            Object.entries(patch).every(
              ([field, value]) => (row as Record<string, unknown>)[field] === value,
            ),
          );
        if (!alreadyApplied) throw new Error(error.message);
        ids.forEach((id) =>
          acknowledged.current.set(id, { ...acknowledged.current.get(id), ...patch }),
        );
        return ids.length;
      }
      if (data !== ids.length)
        throw new Error(
          "Conflito nos componentes: outro usuário alterou os campos. Trabalho local preservado.",
        );
      ids.forEach((id) =>
        acknowledged.current.set(id, { ...acknowledged.current.get(id), ...patch }),
      );
      return data;
    });
    if (atualizados === undefined) return;
    await qc.invalidateQueries({ queryKey: revKeys.comps(revisaoId) });
    return true;
  }

  async function definirInclusao(ids: string[], incluido: boolean) {
    await atualizar(ids, { incluido_orcamento: incluido });
  }

  async function alterarCusto(c: Comp, valor: number) {
    if (!Number.isFinite(valor) || valor < 0) return save.set("erro", "Custo inválido");
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
    return atualizar([c.id], {
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
    const operationKey = `colagem-custos-${updates
      .map(({ c }) => c.id)
      .sort()
      .join(",")}:custo_adotado,custo_origem_id,justificativa`;
    return save.run(operationKey, async () => {
      for (const u of updates) {
        const patch = { custo_adotado: u.v, justificativa: just.trim(), custo_origem_id: null };
        const previous = acknowledged.current.get(u.c.id) ?? u.c;
        if (
          Object.entries(patch).every(
            ([field, value]) => (previous as Record<string, unknown>)[field] === value,
          )
        )
          continue;
        const { data, error } = await supabase
          .from("revisao_componentes")
          .update(patch)
          .eq("id", u.c.id)
          .eq("custo_adotado", Number(previous.custo_adotado ?? u.c.custo_adotado))
          .select("id");
        if (error) throw new Error(error.message);
        if (!data?.length) {
          const replay = await supabase
            .from("revisao_componentes")
            .select("*")
            .eq("id", u.c.id)
            .single();
          if (
            replay.error ||
            !replay.data ||
            Object.entries(patch).some(
              ([field, value]) => (replay.data as Record<string, unknown>)[field] !== value,
            )
          )
            throw new Error(
              "Conflito na colagem de custos. Rascunho preservado; revise os componentes antes de tentar novamente.",
            );
        }
        acknowledged.current.set(u.c.id, { ...acknowledged.current.get(u.c.id), ...patch });
      }
      setColar("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: revKeys.comps(revisaoId) }),
        qc.invalidateQueries({ queryKey: revKeys.head(revisaoId) }),
      ]);
      return true;
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
        <div className="nx-editor-toolbar nx-item-toolbar">
          <button
            type="button"
            className="nx-editor-icon"
            aria-label="Buscar itens"
            ref={searchTrigger}
            title={busca ? `Busca: ${busca}` : "Buscar por código, descrição ou fabricante"}
            aria-expanded={buscaAberta}
            aria-controls="nx-item-search"
            data-active={!!busca}
            onClick={() => setBuscaAberta((value) => !value)}
          >
            <Search size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nx-editor-icon"
            aria-label="Filtrar modalidade"
            ref={modalityTrigger}
            title={filtroMod ? `Modalidade: ${filtroMod}` : "Filtrar modalidade"}
            aria-expanded={modalidadeAberta}
            aria-controls="nx-item-modality"
            data-active={!!filtroMod}
            onClick={() => setModalidadeAberta((value) => !value)}
          >
            <Filter size={18} aria-hidden="true" />
          </button>
          {buscaAberta && (
            <label className="nx-editor-search" id="nx-item-search">
              <span className="nx-control-label">Buscar item</span>
              <input
                ref={searchInput}
                type="search"
                placeholder="Código, descrição ou fabricante"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className={input}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setBuscaAberta(false);
                    searchTrigger.current?.focus();
                  }
                }}
              />
            </label>
          )}
          {modalidadeAberta && (
            <label id="nx-item-modality" className="nx-modality-filter">
              <span className="nx-control-label">Modalidade</span>
              <select
                ref={modalityInput}
                aria-label="Modalidade"
                value={filtroMod}
                onChange={(e) => setFiltroMod(e.target.value)}
                className={input}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setModalidadeAberta(false);
                    modalityTrigger.current?.focus();
                  }
                }}
              >
                <option value="">Todas as modalidades</option>
                <option value="comprar">Comprar</option>
                <option value="fabricar">Fabricar</option>
                <option value="terceirizar">Terceirizar</option>
              </select>
            </label>
          )}
          {(busca || filtroMod) && (
            <button
              type="button"
              className="nx-filter-clear"
              onClick={() => {
                setBusca("");
                setFiltroMod("");
              }}
              aria-label="Limpar filtros"
              title="Limpar filtros"
            >
              <X size={15} aria-hidden="true" />
              Filtros ativos
            </button>
          )}
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
            <strong>
              {lista.filter((c) => batchSel.has(c.id)).length} selecionado(s) para lote
            </strong>
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
                {visible.map(({ item, price, quantity }) => (
                  <ProductComponentCard
                    key={item.id}
                    item={item}
                    selected={aberto === item.id}
                    batchChecked={batchSel.has(item.id)}
                    editable={editavel}
                    price={price}
                    quantity={quantity}
                    pricePending={rev.data.desatualizada}
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
                    draftKey={`item-${detalhe.id}-custo`}
                    aria-label={`Custo ${detalhe.codigo}`}
                    type="number"
                    step="0.0001"
                    min={0}
                    required
                    disabled={!editavel}
                    defaultValue={Number(detalhe.custo_adotado)}
                    key={detalhe.id}
                    onCommit={(value) => alterarCusto(detalhe, Number(value))}
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
