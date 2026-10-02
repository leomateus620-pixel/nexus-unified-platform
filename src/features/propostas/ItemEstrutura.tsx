import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { NoEstrutura } from "@/features/calculo/domain";
import { incluirNaRevisao } from "@/features/catalogo/catalogo.functions";
import { ArvoreEstrutura, ProductEditor, usePermissoes } from "@/features/catalogo/ProductEditor";
import { qtd } from "@/lib/format";
import type { ResumoCalculo } from "./hooks";
import { useSave } from "./hooks";

type Item = {
  id: string;
  produto_id: string;
  descricao: string;
  unidade: string;
  quantidade_avulsa: number;
  estrutura: Json | null;
  estrutura_origem: Json | null;
};

const arvore = (j: Json | null) => (j && typeof j === "object" && !Array.isArray(j) ? (j as unknown as NoEstrutura) : null);

/** Quantidade total com as origens visíveis (dimensionamento × inclusão manual/estrutura). */
export function quantidadeComOrigem(pc: ResumoCalculo["por_componente"][number] | undefined, unidade: string) {
  if (!pc) return qtd(0, unidade);
  const s = pc.quantidade_sistemas ?? pc.quantidade;
  const a = pc.quantidade_avulsa ?? 0;
  if (a > 0 && s > 0) return `${qtd(pc.quantidade, unidade)} (dimensionamento ${s} + manual ${a})`;
  if (a > 0) return `${qtd(pc.quantidade, unidade)} (inclusão manual)`;
  return qtd(pc.quantidade, unidade);
}

function contar(no: NoEstrutura): number {
  return (no.filhos ?? []).reduce((n, f) => n + 1 + contar(f), 0);
}

/** Linha principal compacta: componentes recolhidos, abertos por clique/toque. */
export function ItemEstruturaResumo({ item }: { item: Item }) {
  const a = arvore(item.estrutura);
  const q = Number(item.quantidade_avulsa);
  if (!a && !(q > 0)) return null;
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {q > 0 && <span>Item avulso: {qtd(q, item.unidade)}</span>}
      {a && (a.filhos ?? []).length > 0 && (
        <details onClick={(e) => e.stopPropagation()}>
          <summary className="cursor-pointer text-primary">
            {contar(a)} componente(s) na estrutura {a.base_custo === "completo" ? "· comprado completo" : ""}
          </summary>
          <ArvoreEstrutura no={a} multiplicador={q || 1} />
        </details>
      )}
    </div>
  );
}

function alterar(no: NoEstrutura, caminho: number[], fn: (filhos: NoEstrutura[], i: number) => void): NoEstrutura {
  const copia: NoEstrutura = structuredClone(no);
  let alvo = copia;
  for (const i of caminho.slice(0, -1)) alvo = alvo.filhos![i]!;
  fn(alvo.filhos!, caminho[caminho.length - 1]!);
  return copia;
}

function achatar(no: NoEstrutura | null, mult = 1, acc = new Map<string, { nome: string; q: number }>()) {
  for (const f of no?.filhos ?? []) {
    const q = mult * Number(f.quantidade ?? 0);
    const k = f.codigo ?? f.produto_id;
    acc.set(k, { nome: f.descricao ?? k, q: (acc.get(k)?.q ?? 0) + q });
    achatar(f, q, acc);
  }
  return acc;
}

/** Inspetor: alcance explícito entre esta proposta e o cadastro mestre. */
export function ItemProposta({
  item,
  editavel,
  atualizar,
  revisaoId,
}: {
  item: Item;
  editavel: boolean;
  atualizar: (ids: string[], patch: Record<string, unknown>) => Promise<unknown>;
  revisaoId: string;
}) {
  const perms = usePermissoes();
  const save = useSave();
  const [editarMestre, setEditarMestre] = useState(false);
  const [comparacao, setComparacao] = useState<NoEstrutura | null>(null);
  const incluir = useServerFn(incluirNaRevisao);
  const a = arvore(item.estrutura);
  const origem = arvore(item.estrutura_origem);
  const q = Number(item.quantidade_avulsa);
  const alterada = JSON.stringify(item.estrutura) !== JSON.stringify(item.estrutura_origem);
  const comparar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("arvore_produto", { _produto: item.produto_id });
      if (error) throw error;
      return data as unknown as NoEstrutura;
    },
    onSuccess: setComparacao,
  });
  const aplicar = useMutation({
    mutationFn: () => incluir({ data: { revisao_id: revisaoId, produto_id: item.produto_id, quantidade: q } }),
    onSuccess: () => {
      setComparacao(null);
      void save.requestCalculation();
    },
  });
  const diffs = (() => {
    if (!comparacao) return [];
    const x = achatar(a, q || 1);
    const y = achatar(comparacao, q || 1);
    return [...new Set([...x.keys(), ...y.keys()])]
      .map((k) => ({ k, nome: (y.get(k) ?? x.get(k))!.nome, de: x.get(k)?.q ?? 0, para: y.get(k)?.q ?? 0 }))
      .filter((d) => d.de !== d.para);
  })();

  return (
    <div className="nx-inspector-fields">
      <h4>Nesta proposta</h4>
      <label className="nx-editor-field">
        Quantidade avulsa (além do dimensionamento)
        <input
          key={`${item.id}-${q}`}
          aria-label="Quantidade avulsa"
          type="number"
          min={0}
          step="any"
          disabled={!editavel}
          defaultValue={q}
          className="nx-editor-input text-right tabular-nums"
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 0 && v !== q) void atualizar([item.id], { quantidade_avulsa: v });
          }}
        />
        <span>Demanda adicional explícita; não substitui a quantidade do dimensionamento.</span>
      </label>
      {a && (a.filhos ?? []).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">
            {a.tipo === "S" ? "Peças deste conjunto" : "Componentes desta montagem"} — alterações valem somente para esta
            proposta.
          </p>
          <ArvoreEstrutura
            no={a}
            multiplicador={q || 1}
            editavel={editavel}
            onQuantidade={(c, nq) =>
              void atualizar([item.id], { estrutura: alterar(a, c, (fs, i) => (fs[i]!.quantidade = nq)) })
            }
            onRemover={(c) => void atualizar([item.id], { estrutura: alterar(a, c, (fs, i) => void fs.splice(i, 1)) })}
          />
        </div>
      )}
      {editavel && (
        <div className="flex flex-wrap gap-2 text-xs">
          {alterada && origem && (
            <button type="button" className="nx-editor-link" onClick={() => void atualizar([item.id], { estrutura: origem })}>
              Restaurar composição original
            </button>
          )}
          <button type="button" className="nx-editor-link" disabled={comparar.isPending} onClick={() => comparar.mutate()}>
            Atualizar a partir do catálogo
          </button>
          {perms.data?.editar_cadastro && (
            <button type="button" className="nx-editor-link" onClick={() => setEditarMestre((v) => !v)}>
              Editar cadastro do produto
            </button>
          )}
        </div>
      )}
      {comparar.isError && <p className="text-xs text-destructive">{(comparar.error as Error).message}</p>}
      {comparacao && (
        <div className="rounded border border-border p-2 text-xs">
          {diffs.length === 0 ? (
            <p>A composição desta proposta já corresponde ao catálogo.</p>
          ) : (
            <>
              <p className="mb-1 font-medium">Mudanças na quantidade total ({qtd(q || 1, item.unidade)}):</p>
              <ul>
                {diffs.map((d) => (
                  <li key={d.k}>
                    {d.nome}: {d.de} → {d.para}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-muted-foreground">Ao aplicar, os ajustes locais desta proposta são substituídos e o orçamento é recalculado.</p>
              <button type="button" className="nx-editor-link" disabled={aplicar.isPending} onClick={() => aplicar.mutate()}>
                Aplicar nesta proposta
              </button>
            </>
          )}
          {aplicar.isError && <p className="text-destructive">{(aplicar.error as Error).message}</p>}
        </div>
      )}
      {editarMestre && (
        <div className="rounded border border-primary/30 p-2">
          <p className="mb-2 text-xs text-muted-foreground">
            Cadastro mestre: vale para propostas futuras. Esta proposta só muda se você usar “Atualizar a partir do catálogo”.
          </p>
          <ProductEditor produtoId={item.produto_id} compacto onSaved={() => setEditarMestre(false)} onCancel={() => setEditarMestre(false)} />
        </div>
      )}
    </div>
  );
}
