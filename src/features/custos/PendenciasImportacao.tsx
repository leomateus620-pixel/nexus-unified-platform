import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ActionButton, Section } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";

/** Fila de decisões vindas das planilhas importadas: nada aqui foi resolvido por suposição. */
export function PendenciasImportacao({ podeResolver }: { podeResolver: boolean }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const q = useQuery({
    queryKey: ["pendencias-importacao"],
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
  const lista = q.data ?? [];
  if (lista.length === 0) return null;
  const decisoes = lista.filter((r) => r.aba !== "Outros Itens");
  const outros = lista.filter((r) => r.aba === "Outros Itens");
  const marcar = async (id: string, situacao: "resolvido" | "ignorado") => {
    await supabase.from("importacao_registros").update({ situacao }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["pendencias-importacao"] });
  };
  return (
    <Section
      title={`Pendências da planilha comercial (${lista.length})`}
      description="Itens que exigem decisão técnica, fiscal ou de cadastro. Os demais produtos já foram importados."
    >
      <ul className="space-y-2 text-sm">
        {decisoes.map((r) => (
          <li key={r.id} className="rounded border border-border p-2">
            <p className="text-foreground">{r.tema}</p>
            <p className="text-muted-foreground">{r.explicacao}</p>
            {podeResolver && (
              <ActionButton variant="ghost" onClick={() => marcar(r.id, "resolvido")}>
                Marcar como decidido
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
      {outros.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="text-sm underline"
            aria-expanded={aberto}
            onClick={() => setAberto(!aberto)}
          >
            {outros.length} registros de “Outros Itens” sem grupo definido
          </button>
          {aberto && (
            <ul className="mt-2 space-y-1 text-sm">
              {outros.map((r) => {
                const d = r.dados as Record<string, string | number>;
                return (
                  <li key={r.id}>
                    <span className="text-foreground">{String(d["Descrição integral"] ?? "")}</span>{" "}
                    <span className="text-muted-foreground">
                      · {r.tema} · NF {String(d["Nº NF"] ?? "—")} · {String(d["Quantidade original"] ?? "")}{" "}
                      {String(d["Unidade"] ?? "")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}
