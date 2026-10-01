import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/features/org/session";
import { adicionarComponenteRevisao } from "@/features/catalogo/catalogo.functions";
import { nomeTipo } from "@/features/catalogo/codigos";

/** Localiza componentes do catálogo e adiciona à revisão editável (nada é inserido automaticamente). */
export function AdicionarDoCatalogo({
  revisaoId,
  presentes,
}: {
  revisaoId: string;
  presentes: Set<string>;
}) {
  const orgId = useOrg().data?.orgId ?? "";
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const qc = useQueryClient();
  const add = useServerFn(adicionarComponenteRevisao);
  const cat = useQuery({
    queryKey: ["produtos-busca", orgId],
    enabled: aberto && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id,codigo,descricao,familia,tipo_item,unidade")
        .eq("organization_id", orgId)
        .eq("ativo", true)
        .order("codigo");
      if (error) throw error;
      return data;
    },
  });
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (cat.data ?? [])
      .filter((p) => !presentes.has(p.id))
      .filter((p) => !t || p.codigo.toLowerCase().includes(t) || p.descricao.toLowerCase().includes(t))
      .slice(0, 30);
  }, [cat.data, busca, presentes]);
  const m = useMutation({
    mutationFn: (produto_id: string) => add({ data: { revisao_id: revisaoId, produto_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rev", revisaoId] });
    },
  });
  if (!aberto)
    return (
      <button type="button" className="nx-button mb-2 rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => setAberto(true)}>
        + Adicionar componente do catálogo
      </button>
    );
  return (
    <div className="mb-3 rounded border border-border p-3">
      <div className="mb-2 flex gap-2">
        <input
          autoFocus
          aria-label="Buscar no catálogo"
          placeholder="Buscar por código ou descrição"
          className="h-9 flex-1 rounded border border-input bg-background px-2 text-sm text-foreground"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button type="button" className="text-sm text-muted-foreground" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </div>
      {cat.isLoading && <p className="text-sm text-muted-foreground">Carregando catálogo…</p>}
      {cat.data && lista.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum componente fora desta revisão.</p>
      )}
      <ul className="max-h-72 divide-y divide-border overflow-y-auto">
        {lista.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="font-mono text-sm font-semibold text-primary">{p.codigo}</span>
            <span className="min-w-0 flex-1 text-sm">{p.descricao}</span>
            <span className="text-xs text-muted-foreground">
              {p.tipo_item ? nomeTipo(p.tipo_item) : "Código pendente"} · {p.unidade}
            </span>
            <button
              type="button"
              disabled={m.isPending}
              className="rounded border border-primary/50 px-2 py-1 text-xs text-primary disabled:opacity-50"
              onClick={() => m.mutate(p.id)}
            >
              Adicionar
            </button>
          </li>
        ))}
      </ul>
      {m.isError && <p className="mt-2 text-sm text-destructive">{(m.error as Error).message}</p>}
      {m.isSuccess && <p className="mt-2 text-sm text-primary">Componente adicionado à revisão. Salve a proposta para recalcular.</p>}
    </div>
  );
}
