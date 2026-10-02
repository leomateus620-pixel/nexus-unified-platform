import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brlUnit, qtd } from "@/lib/format";

type CompBase = {
  id: string;
  produto_id: string;
  codigo: string;
  descricao: string;
  custo_adotado: number | string;
  custo_origem_id: string | null;
};

export type AdocaoCusto = { id: string; custo: number; origemId: string; codigo: string };

/** Catalog references are informative until the user explicitly adopts them. */
export function AvisoCustoCatalogo({
  comps,
  quantidades,
  calculoAtual = false,
  editavel,
  onAdotar,
}: {
  comps: CompBase[];
  quantidades: Map<string, number>;
  calculoAtual?: boolean;
  editavel: boolean;
  onAdotar: (itens: AdocaoCusto[]) => Promise<unknown>;
}) {
  const ids = useMemo(
    () => [...new Set(comps.map((c) => c.produto_id).filter(Boolean))].sort(),
    [comps],
  );
  const ref = useQuery({
    queryKey: ["custo-catalogo-atual", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produto_custos")
        .select("id,produto_id,custo,vigencia,origem,created_at")
        .in("produto_id", ids)
        .order("vigencia", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const m = new Map<string, (typeof data)[number]>();
      for (const r of data ?? []) if (!m.has(r.produto_id)) m.set(r.produto_id, r);
      return m;
    },
  });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const difs = useMemo(() => {
    if (!ref.data) return [];
    return comps.flatMap((c) => {
      const r = ref.data.get(c.produto_id);
      if (!r || r.id === c.custo_origem_id) return [];
      const novo = Number(r.custo);
      const atual = Number(c.custo_adotado);
      // A new source matters even when its value is unchanged, including an explicit zero.
      const q = calculoAtual ? quantidades.get(c.id) : undefined;
      return [{ c, r, novo, atual, impacto: q !== undefined ? (novo - atual) * q : undefined, q }];
    });
  }, [comps, ref.data, quantidades, calculoAtual]);
  if (!ids.length) return null;
  if (ref.isPending)
    return (
      <p className="nx-editor-note" role="status">
        Consultando referências de custo do catálogo…
      </p>
    );
  if (ref.isError)
    return (
      <p className="nx-editor-error" role="alert">
        Não foi possível consultar novas referências de custo.{" "}
        <button type="button" className="nx-editor-link" onClick={() => ref.refetch()}>
          Tentar novamente
        </button>
      </p>
    );
  if (!difs.length) return null;
  const adotar = async (lista: typeof difs) => {
    setBusy(true);
    setErro(null);
    try {
      const resultado = await onAdotar(
        lista.map((d) => ({ id: d.c.id, custo: d.novo, origemId: d.r.id, codigo: d.c.codigo })),
      );
      if (resultado !== false) setSel(new Set());
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível adotar o custo. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  };
  const selecionados = difs.filter((d) => sel.has(d.c.id));
  return (
    <details className="nx-cost-reference">
      <summary>
        <strong>Nova referência disponível</strong>
        <span>
          {difs.length} {difs.length === 1 ? "item" : "itens"}
        </span>
        <span>Ver atualizações</span>
      </summary>
      <div className="nx-cost-reference-body">
        <p>A revisão mantém o custo adotado até você escolher atualizar.</p>
        {!calculoAtual && (
          <p className="nx-editor-note">
            Impacto pendente: aguarde o salvamento e o cálculo atualizado da revisão.
          </p>
        )}
        {editavel && (
          <button
            type="button"
            disabled={busy || !selecionados.length}
            onClick={() => adotar(selecionados)}
            className="nx-editor-link"
          >
            Adotar selecionados ({selecionados.length})
          </button>
        )}
        <ul>
          {difs.map((d) => (
            <li key={d.c.id}>
              <div className="nx-cost-reference-identity">
                {editavel && (
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${d.c.codigo}`}
                    disabled={busy}
                    checked={sel.has(d.c.id)}
                    onChange={(e) => {
                      const n = new Set(sel);
                      if (e.target.checked) n.add(d.c.id);
                      else n.delete(d.c.id);
                      setSel(n);
                    }}
                  />
                )}
                <span>
                  <strong>{d.c.descricao}</strong>
                  <code>{d.c.codigo}</code>
                </span>
              </div>
              <dl>
                <div>
                  <dt>Adotado nesta revisão</dt>
                  <dd>{brlUnit(d.atual)}</dd>
                </div>
                <div>
                  <dt>Nova referência</dt>
                  <dd>
                    <strong>{brlUnit(d.novo)}</strong>
                  </dd>
                </div>
              </dl>
              <p className="nx-editor-note">
                {d.r.origem || "Origem não informada"} · vigência{" "}
                {new Date(`${String(d.r.vigencia).slice(0, 10)}T12:00:00`).toLocaleDateString(
                  "pt-BR",
                )}
              </p>
              {calculoAtual && (
                <p className="nx-editor-note">
                  {d.impacto !== undefined
                    ? `Variação do custo direto: ${brlUnit(d.impacto)} · base calculada: ${qtd(d.q!)}. O preço final depende do recálculo.`
                    : "Impacto indisponível: item sem quantidade consolidada."}
                </p>
              )}
              {editavel && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => adotar([d])}
                  className="nx-editor-link"
                >
                  {busy ? "Adotando…" : "Adotar nesta revisão"}
                </button>
              )}
            </li>
          ))}
        </ul>
        {erro && (
          <p className="nx-editor-error" role="alert">
            {erro}
          </p>
        )}
      </div>
    </details>
  );
}
