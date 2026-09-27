import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

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

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    return (comps.data ?? []).filter(
      (c) =>
        (!q || `${c.codigo} ${c.descricao} ${c.fabricante ?? ""}`.toLowerCase().includes(q)) &&
        (!filtroMod || c.modalidade === filtroMod),
    );
  }, [comps.data, busca, filtroMod]);

  if (rev.isPending || comps.isPending) return <LoadingState />;
  if (rev.isError) return <ErrorState error={rev.error} onRetry={() => rev.refetch()} />;
  if (comps.isError) return <ErrorState error={comps.error} onRetry={() => comps.refetch()} />;
  const editavel = rev.data.editavel;
  const params = mesclarParametros(rev.data.parametros);
  const verCusto = org.data?.canSeeCosts ?? false;

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
  const input =
    "h-8 rounded border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60";

  if (!comps.data?.length)
    return (
      <EmptyState
        title="Esta revisão não tem componentes"
        hint="Os componentes são copiados do catálogo de Produtos e Soluções ao criar a proposta. Cadastre ou importe o catálogo e crie uma nova revisão."
      />
    );

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Section
        title="Itens comerciais"
        description="Cópia versionada do catálogo para esta revisão. Custos editados aqui não alteram o catálogo."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            aria-label="Buscar"
            placeholder="Buscar código, descrição, fabricante"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={`${input} w-64`}
          />
          <select
            aria-label="Modalidade"
            value={filtroMod}
            onChange={(e) => setFiltroMod(e.target.value)}
            className={input}
          >
            <option value="">Todas as modalidades</option>
            <option value="comprar">Comprar</option>
            <option value="fabricar">Fabricar</option>
            <option value="terceirizar">Terceirizar</option>
          </select>
          {sel.size > 0 && editavel && (
            <>
              <span className="text-xs text-muted-foreground">{sel.size} selecionado(s):</span>
              <select
                aria-label="Modalidade em lote"
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
              <select
                aria-label="Fornecedor em lote"
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
            </>
          )}
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 z-10 bg-card text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={sel.size === lista.length && lista.length > 0}
                    onChange={(e) =>
                      setSel(e.target.checked ? new Set(lista.map((c) => c.id)) : new Set())
                    }
                  />
                </th>
                <th className="px-2">Código</th>
                <th className="px-2">Descrição</th>
                <th className="px-2">Un.</th>
                <th className="px-2">Modalidade</th>
                <th className="px-2">Fornecedor</th>
                {verCusto && <th className="px-2 text-right">Custo adotado</th>}
                <th className="px-2 text-right">Preço unit. (calc.)</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-border/60 ${aberto === c.id ? "bg-accent/50" : ""}`}
                >
                  <td className="px-2">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${c.codigo}`}
                      checked={sel.has(c.id)}
                      onChange={(e) => {
                        const n = new Set(sel);
                        if (e.target.checked) n.add(c.id);
                        else n.delete(c.id);
                        setSel(n);
                      }}
                    />
                  </td>
                  <td className="px-2 font-mono text-xs">
                    <button
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => setAberto(c.id)}
                    >
                      {c.codigo}
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    {c.descricao}
                    <span className="block text-xs text-muted-foreground">
                      {c.fabricante ?? "—"} · NCM {c.ncm ?? "—"}
                    </span>
                  </td>
                  <td className="px-2">{c.unidade}</td>
                  <td className="px-2">
                    <select
                      aria-label="Modalidade"
                      disabled={!editavel}
                      value={c.modalidade}
                      onChange={(e) => atualizar([c.id], { modalidade: e.target.value })}
                      className={input}
                    >
                      <option value="comprar">Comprar</option>
                      <option value="fabricar">Fabricar</option>
                      <option value="terceirizar">Terceirizar</option>
                    </select>
                  </td>
                  <td className="px-2">
                    <select
                      aria-label="Fornecedor"
                      disabled={!editavel}
                      value={c.fornecedor_id ?? ""}
                      onChange={(e) => atualizar([c.id], { fornecedor_id: e.target.value || null })}
                      className={`${input} max-w-44`}
                    >
                      <option value="">—</option>
                      {(forn.data ?? []).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  {verCusto && (
                    <td className="px-2 text-right">
                      <input
                        aria-label={`Custo ${c.codigo}`}
                        type="number"
                        step="0.0001"
                        min={0}
                        disabled={!editavel}
                        defaultValue={Number(c.custo_adotado)}
                        key={`${c.id}-${c.custo_adotado}`}
                        onBlur={(e) => alterarCusto(c, Number(e.target.value))}
                        className={`${input} w-28 text-right tabular-nums`}
                      />
                    </td>
                  )}
                  <td className="px-2 text-right tabular-nums text-muted-foreground">
                    {brlUnit(precoUnitario(Number(c.custo_adotado), params).preco)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editavel && verCusto && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Colar custos de planilha (código ⇥ custo)
            </summary>
            <textarea
              value={colar}
              onChange={(e) => setColar(e.target.value)}
              rows={4}
              className="mt-2 w-full rounded border border-input bg-background p-2 font-mono text-xs text-foreground"
              placeholder={"COMP-05\t12,94"}
            />
            {erroColar && <p className="text-xs text-destructive">{erroColar}</p>}
            <ActionButton variant="ghost" onClick={aplicarColagem} disabled={!colar.trim()}>
              Validar e aplicar
            </ActionButton>
          </details>
        )}
      </Section>

      <aside className="rounded-lg border border-border bg-card p-4 text-sm xl:sticky xl:top-40 xl:self-start">
        {!detalhe ? (
          <p className="text-muted-foreground">Selecione um código para ver o cálculo do preço.</p>
        ) : (
          <div className="space-y-2">
            <p className="font-mono text-xs text-primary">{detalhe.codigo}</p>
            <p className="font-medium text-foreground">{detalhe.descricao}</p>
            <p className="text-xs text-muted-foreground">
              {detalhe.fabricante ?? "—"} · {detalhe.unidade} · NCM {detalhe.ncm ?? "—"}
            </p>
            {verCusto ? (
              <VerCalculo custo={Number(detalhe.custo_adotado)} params={params} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Custos e margens não disponíveis para o seu perfil.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Origem do custo:{" "}
              {detalhe.custo_origem_id
                ? "catálogo (vigência mais recente)"
                : `ajuste manual — ${detalhe.justificativa ?? "sem justificativa"}`}
            </p>
          </div>
        )}
      </aside>
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
    <dl className="divide-y divide-border/60 rounded border border-border">
      {linhas.map(([k, v]) => (
        <div key={k} className="flex justify-between px-2 py-1 text-xs">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tabular-nums text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
