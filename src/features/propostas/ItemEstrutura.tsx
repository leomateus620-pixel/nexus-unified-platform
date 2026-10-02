import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { NoEstrutura } from "@/features/calculo/domain";
import { incluirNaRevisao } from "@/features/catalogo/catalogo.functions";
import { ArvoreEstrutura, usePermissoes } from "@/features/catalogo/ProductEditor";
import { nomeTipo, PADRAO_CODIGO } from "@/features/catalogo/codigos";
import { qtd } from "@/lib/format";
import type { ResumoCalculo } from "./hooks";
import { revKeys, useSave } from "./hooks";
import { EditorInput } from "./ui/EditorWorkspace";
import { useEditorDialog } from "./ui/useEditorDialog";

type Item = {
  id: string;
  produto_id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  incluido_orcamento: boolean;
  quantidade_avulsa: number;
  estrutura: Json | null;
  estrutura_origem: Json | null;
};

const arvore = (j: Json | null) =>
  j && typeof j === "object" && !Array.isArray(j) ? (j as unknown as NoEstrutura) : null;

export function quantidadeComOrigem(
  pc: ResumoCalculo["por_componente"][number] | undefined,
  unidade: string,
) {
  return pc ? qtd(pc.quantidade, unidade) : "Sem consolidado";
}

function contar(no: NoEstrutura): number {
  return (no.filhos ?? []).reduce((n, f) => n + 1 + contar(f), 0);
}

export function tipoItemRevisao(item: Pick<Item, "estrutura" | "codigo">) {
  return nomeTipo(arvore(item.estrutura)?.tipo ?? PADRAO_CODIGO.exec(item.codigo)?.[2]);
}

export function ItemEstruturaResumo({ item }: { item: Item }) {
  const a = arvore(item.estrutura);
  if (!a || a.tipo === "P") return null;
  return (
    <p className="nx-commercial-structure-note">
      {(a.filhos ?? []).length ? `${contar(a)} componentes · ` : "Composição pendente · "}
      {a.base_custo === "completo"
        ? "Produto comprado completo · componentes informativos"
        : a.base_custo === "composto"
          ? "Custo por composição"
          : "Base de custo não informada"}
    </p>
  );
}

function alterar(
  no: NoEstrutura,
  caminho: number[],
  fn: (filhos: NoEstrutura[], i: number) => void,
): NoEstrutura {
  const copia: NoEstrutura = structuredClone(no);
  let alvo = copia;
  for (const i of caminho.slice(0, -1)) alvo = alvo.filhos![i]!;
  fn(alvo.filhos!, caminho[caminho.length - 1]!);
  return copia;
}

function achatar(
  no: NoEstrutura | null,
  mult = 1,
  acc = new Map<string, { nome: string; q: number }>(),
) {
  for (const f of no?.filhos ?? []) {
    const q = mult * Number(f.quantidade ?? 0);
    const k = f.codigo ?? f.produto_id;
    acc.set(k, { nome: f.descricao ?? k, q: (acc.get(k)?.q ?? 0) + q });
    achatar(f, q, acc);
  }
  return acc;
}

/** Revision quantities and composition share the existing save coordinator. */
export function ItemProposta({
  item,
  editavel,
  atualizar,
  revisaoId,
  consolidado,
  calculoAtual,
  onEditMaster,
}: {
  item: Item;
  editavel: boolean;
  atualizar: (ids: string[], patch: Record<string, unknown>) => Promise<unknown>;
  revisaoId: string;
  consolidado?: ResumoCalculo["por_componente"][number] | undefined;
  calculoAtual: boolean;
  onEditMaster: () => void;
}) {
  const perms = usePermissoes();
  const save = useSave();
  const qc = useQueryClient();
  const { ask, dialog } = useEditorDialog();
  const [comparacao, setComparacao] = useState<NoEstrutura | null>(null);
  const incluir = useServerFn(incluirNaRevisao);
  const draftKey = `item-${item.id}-estrutura`;
  const [estruturaDraft, setEstruturaDraft] = useState<NoEstrutura | undefined>(() =>
    save.draft<NoEstrutura>(draftKey),
  );
  const a = estruturaDraft ?? arvore(item.estrutura);
  useEffect(() => {
    if (estruturaDraft && JSON.stringify(item.estrutura) === JSON.stringify(estruturaDraft)) {
      setEstruturaDraft(undefined);
      save.remember(draftKey, undefined);
    }
  }, [item.estrutura, estruturaDraft, draftKey, save]);
  const salvarEstrutura = async (estrutura: NoEstrutura) => {
    setEstruturaDraft(estrutura);
    save.remember(draftKey, estrutura);
    await atualizar([item.id], { estrutura });
  };
  const origem = arvore(item.estrutura_origem);
  const q = Number(item.quantidade_avulsa ?? 0);
  const alterada = JSON.stringify(a) !== JSON.stringify(item.estrutura_origem);
  const comparar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("arvore_produto", { _produto: item.produto_id });
      if (error) throw error;
      return data as unknown as NoEstrutura;
    },
    onSuccess: setComparacao,
  });
  const adocaoBloqueada =
    !editavel ||
    save.busy ||
    !["idle", "confirmado"].includes(save.status) ||
    estruturaDraft !== undefined;
  const adocaoAtual = useRef({ bloqueada: adocaoBloqueada, quantidade: q });
  adocaoAtual.current = { bloqueada: adocaoBloqueada, quantidade: q };
  const aplicar = useMutation({
    mutationFn: () => {
      // An adoption must not replay an old manual quantity over a pending revision edit.
      if (adocaoAtual.current.bloqueada)
        throw new Error(
          "Conclua o salvamento das alterações desta revisão antes de adotar a composição.",
        );
      return incluir({
        data: {
          revisao_id: revisaoId,
          produto_id: item.produto_id,
          quantidade: adocaoAtual.current.quantidade,
        },
      });
    },
    onSuccess: async () => {
      setComparacao(null);
      setEstruturaDraft(undefined);
      save.remember(draftKey, undefined);
      await qc.invalidateQueries({ queryKey: revKeys.all(revisaoId) });
      void save.requestCalculation();
    },
  });
  const diffs = (() => {
    if (!comparacao) return [];
    const x = achatar(a, q || 1);
    const y = achatar(comparacao, q || 1);
    return [...new Set([...x.keys(), ...y.keys()])]
      .map((k) => ({
        k,
        nome: (y.get(k) ?? x.get(k))!.nome,
        de: x.get(k)?.q ?? 0,
        para: y.get(k)?.q ?? 0,
      }))
      .filter((d) => d.de !== d.para);
  })();
  const estruturaDiferente = comparacao && JSON.stringify(a) !== JSON.stringify(comparacao);
  const base = q > 0 ? `Composição para ${qtd(q)} unidades manuais` : "Composição por 1 unidade";
  const restaurar = async () => {
    const resposta = await ask({
      title: "Restaurar composição original",
      description:
        "Os ajustes locais da composição nesta revisão serão substituídos pela estrutura originalmente copiada. A quantidade manual do item será preservada.",
    });
    if (resposta && origem) await salvarEstrutura(origem);
  };
  return (
    <>
      <section className="nx-inspector-fields">
        <h4>Demanda e quantidades</h4>
        <dl className="nx-commercial-quantities">
          <div>
            <dt>Dimensionamento</dt>
            <dd>
              {!calculoAtual
                ? "Cálculo pendente"
                : consolidado?.quantidade_sistemas !== undefined
                  ? qtd(consolidado.quantidade_sistemas, item.unidade)
                  : "Origem não disponível"}
            </dd>
          </div>
          <div>
            <dt>Consolidada pelo cálculo</dt>
            <dd>
              {!item.incluido_orcamento
                ? "Fora do orçamento"
                : !calculoAtual
                  ? "Cálculo pendente"
                  : quantidadeComOrigem(consolidado, item.unidade)}
            </dd>
          </div>
        </dl>
        <label className="nx-editor-field">
          Quantidade manual adicional · {item.unidade}
          <EditorInput
            key={item.id}
            draftKey={`item-${item.id}-quantidade-manual`}
            aria-label="Quantidade manual adicional"
            type="number"
            min={0}
            max={1e7}
            step="any"
            required
            disabled={!editavel || aplicar.isPending}
            defaultValue={q}
            className="nx-editor-input text-right tabular-nums"
            onCommit={async (v) => {
              const result = await atualizar([item.id], { quantidade_avulsa: Number(v) });
              return result ? true : undefined;
            }}
          />
          <span>
            Substitui a quantidade manual atual. O dimensionamento continua separado.{" "}
            {item.incluido_orcamento ? "" : "O item está fora do orçamento."}
          </span>
        </label>
        {calculoAtual && consolidado?.quantidade_avulsa !== undefined && (
          <p className="nx-editor-note">
            Demanda manual e composições no cálculo:{" "}
            {qtd(consolidado.quantidade_avulsa, item.unidade)}. Pode incluir quantidades derivadas
            de outros produtos.
          </p>
        )}
      </section>
      <section className="nx-inspector-fields">
        <h4>Composição nesta revisão</h4>
        {estruturaDraft && (
          <p className="nx-editor-note" role="status">
            Edição local da composição preservada. Acompanhe a gravação no estado global.
          </p>
        )}
        {a && a.tipo !== "P" ? (
          <>
            <div className="nx-composition-basis">
              <strong>{base}</strong>
              <p>
                {a.base_custo === "completo"
                  ? "Produto comprado completo: componentes internos informativos, sem cobrança independente."
                  : a.base_custo === "composto"
                    ? "Custo por composição: componentes participam da formação do custo."
                    : "Base de custo não informada nesta revisão. Consulte o cadastro e o cálculo oficial antes de interpretar a participação dos componentes no custo."}
              </p>
              <p>
                As quantidades abaixo representam esta composição. Consulte o consolidado oficial
                acima para a demanda calculada.
              </p>
            </div>
            {(a.filhos ?? []).length > 0 ? (
              <ArvoreEstrutura
                no={a}
                multiplicador={q || 1}
                editavel={editavel && !aplicar.isPending}
                onQuantidade={(c, nq) =>
                  void salvarEstrutura(alterar(a, c, (fs, i) => (fs[i]!.quantidade = nq)))
                }
                onRemover={(c) =>
                  void salvarEstrutura(alterar(a, c, (fs, i) => void fs.splice(i, 1)))
                }
              />
            ) : (
              <p className="nx-editor-note">
                Composição pendente. Consulte o cadastro mestre para definir os componentes.
              </p>
            )}
          </>
        ) : (
          <p className="nx-editor-note">
            {a?.tipo === "P"
              ? "Peça sem composição interna."
              : "Esta revisão não possui uma composição registrada."}
          </p>
        )}
        {editavel && (
          <div className="nx-commercial-secondary-actions">
            {alterada && origem && (
              <button
                type="button"
                className="nx-editor-link"
                disabled={aplicar.isPending}
                onClick={restaurar}
              >
                Restaurar composição original
              </button>
            )}
            <button
              type="button"
              className="nx-editor-link"
              disabled={comparar.isPending || aplicar.isPending}
              onClick={() => comparar.mutate()}
            >
              {comparar.isPending ? "Consultando catálogo…" : "Comparar com o catálogo"}
            </button>
            {perms.data?.editar_cadastro && (
              <button
                type="button"
                className="nx-editor-link"
                disabled={aplicar.isPending}
                onClick={onEditMaster}
              >
                Editar cadastro mestre
              </button>
            )}
          </div>
        )}
        {comparar.isError && (
          <p className="nx-editor-error" role="alert">
            {comparar.error.message}
          </p>
        )}
        {comparacao && (
          <section className="nx-composition-comparison" aria-label="Comparação com o catálogo">
            <h5>Catálogo × esta revisão</h5>
            {!estruturaDiferente ? (
              <p>A composição desta revisão já corresponde ao catálogo.</p>
            ) : (
              <>
                <p>
                  {base}.{" "}
                  {diffs.length
                    ? "Alterações nas quantidades desta composição:"
                    : "Há alterações nos dados da estrutura; as quantidades desta base permanecem iguais."}
                </p>
                {!!diffs.length && (
                  <ul>
                    {diffs.map((d) => (
                      <li key={d.k}>
                        <span>
                          {d.nome}
                          <code>{d.k}</code>
                        </span>
                        <strong>
                          {qtd(d.de)} → {qtd(d.para)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                )}
                {a?.base_custo !== comparacao.base_custo && (
                  <p>
                    Base de custo no catálogo:{" "}
                    {comparacao.base_custo === "completo"
                      ? "Produto comprado completo"
                      : comparacao.base_custo === "composto"
                        ? "Custo por composição"
                        : "Base de custo não informada"}
                    .
                  </p>
                )}
                <p className="nx-editor-note">
                  Ao adotar, os ajustes locais da composição serão substituídos. A operação inclui o
                  item no orçamento e solicita recálculo.
                </p>
                {adocaoBloqueada && (
                  <p className="nx-editor-note">
                    Conclua o salvamento das alterações desta revisão para adotar a composição do
                    catálogo.
                  </p>
                )}
                <button
                  type="button"
                  className="nx-editor-link"
                  disabled={aplicar.isPending || adocaoBloqueada}
                  onClick={() => {
                    if (!adocaoAtual.current.bloqueada) aplicar.mutate();
                  }}
                >
                  {aplicar.isPending ? "Aplicando…" : "Substituir pela composição do catálogo"}
                </button>
              </>
            )}
            {aplicar.isError && (
              <p className="nx-editor-error" role="alert">
                {aplicar.error.message}
              </p>
            )}
            <button type="button" className="nx-editor-link" onClick={() => setComparacao(null)}>
              Fechar comparação
            </button>
          </section>
        )}
      </section>
      {dialog}
    </>
  );
}
