import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type CompBase = {
  id: string;
  produto_id: string;
  codigo: string;
  descricao: string;
  custo_adotado: number | string;
  custo_origem_id: string | null;
};

export type AdocaoCusto = { id: string; custo: number; origemId: string; codigo: string };

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/**
 * Compara o custo adotado na revisão com a referência atual do catálogo. Nunca altera nada sozinho:
 * a adoção é sempre explícita, item a item ou pelos selecionados.
 */
export function AvisoCustoCatalogo({
  comps,
  quantidades,
  editavel,
  onAdotar,
}: {
  comps: CompBase[];
  quantidades: Map<string, number>;
  editavel: boolean;
  onAdotar: (itens: AdocaoCusto[]) => Promise<unknown>;
}) {
  const ids = useMemo(() => [...new Set(comps.map((c) => c.produto_id))].sort(), [comps]);
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

  const difs = useMemo(() => {
    if (!ref.data) return [];
    return comps.flatMap((c) => {
      const r = ref.data.get(c.produto_id);
      if (!r || r.id === c.custo_origem_id) return [];
      const novo = Number(r.custo);
      const atual = Number(c.custo_adotado);
      if (Math.abs(novo - atual) < 0.005) return [];
      const q = quantidades.get(c.id) ?? 0;
      return [{ c, r, novo, atual, impacto: (novo - atual) * q, q }];
    });
  }, [comps, ref.data, quantidades]);

  if (!difs.length) return null;
  const adotar = async (lista: typeof difs) => {
    setBusy(true);
    try {
      await onAdotar(
        lista.map((d) => ({ id: d.c.id, custo: d.novo, origemId: d.r.id, codigo: d.c.codigo })),
      );
      setSel(new Set());
    } finally {
      setBusy(false);
    }
  };
  const selecionados = difs.filter((d) => sel.has(d.c.id));

  return (
    <div
      role="status"
      className="mb-3 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <strong className="font-display uppercase tracking-wide text-warning">
          Custo do catálogo mudou · {difs.length} {difs.length === 1 ? "item" : "itens"}
        </strong>
        {editavel && (
          <button
            type="button"
            disabled={busy || !selecionados.length}
            onClick={() => adotar(selecionados)}
            className="h-8 rounded border border-warning/60 px-3 text-xs font-bold uppercase disabled:opacity-50"
          >
            Adotar selecionados ({selecionados.length})
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        A proposta mantém o custo adotado até você escolher atualizar. Compras novas não alteram
        propostas automaticamente.
      </p>
      <ul className="divide-y divide-border">
        {difs.map((d) => (
          <li key={d.c.id} className="flex flex-wrap items-center gap-3 py-2">
            {editavel && (
              <input
                type="checkbox"
                aria-label={`Selecionar ${d.c.codigo}`}
                checked={sel.has(d.c.id)}
                onChange={(e) => {
                  const n = new Set(sel);
                  if (e.target.checked) n.add(d.c.id);
                  else n.delete(d.c.id);
                  setSel(n);
                }}
              />
            )}
            <span className="min-w-[220px] flex-1">
              <span className="font-mono text-xs text-primary">{d.c.codigo}</span>{" "}
              {d.c.descricao}
            </span>
            <span className="text-xs">
              {brl(d.atual)} → <strong>{brl(d.novo)}</strong>
            </span>
            <span className="text-xs text-muted-foreground">
              {d.r.origem ?? "catálogo"} · {new Date(d.r.vigencia).toLocaleDateString("pt-BR")}
            </span>
            <span className="text-xs">
              Impacto no custo: {d.q > 0 ? brl(d.impacto) : "sem quantidade calculada"}
            </span>
            {editavel && (
              <button
                type="button"
                disabled={busy}
                onClick={() => adotar([d])}
                className="h-8 rounded border border-border px-3 text-xs uppercase disabled:opacity-50"
              >
                Adotar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
