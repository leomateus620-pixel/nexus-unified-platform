import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ActionButton, ErrorState } from "@/components/nexus/Page";
import { supabase } from "@/integrations/supabase/client";
import "./product-costs.css";

/** Pendências recolhidas: a lista de produtos continua sendo o conteúdo principal. */
export function PendenciasImportacao({ podeResolver }: { podeResolver: boolean }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
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
  const marcar = async (id: string) => {
    setErro(null);
    setConfirmacao(null);
    setSalvando(id);
    try {
      const { error } = await supabase
        .from("importacao_registros")
        .update({ situacao: "resolvido" })
        .eq("id", id);
      if (error) throw error;
      setConfirmacao("Pendência marcada como decidida.");
      await qc.invalidateQueries({ queryKey: ["pendencias-importacao"] });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(null);
    }
  };
  if (q.isPending)
    return (
      <p className="nx-cost-help" role="status">
        Consultando pendências de importação…
      </p>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const lista = q.data ?? [];
  if (lista.length === 0)
    return confirmacao ? (
      <p className="nx-cost-help" role="status">
        {confirmacao} Não há outras pendências de importação.
      </p>
    ) : null;
  return (
    <section className="nx-import-pending" aria-label="Pendências de importação">
      <div className="nx-import-pending-summary">
        <p>
          <strong>{lista.length} pendência(s) de importação</strong>
          <span>Decisões de cadastro, classificação ou documento.</span>
        </p>
        <ActionButton
          variant="ghost"
          aria-expanded={aberto}
          aria-controls="import-pending-details"
          onClick={() => setAberto(!aberto)}
        >
          {aberto ? "Recolher detalhes" : "Ver pendências"}
        </ActionButton>
      </div>
      {confirmacao && (
        <p role="status" className="nx-cost-help">
          {confirmacao}
        </p>
      )}
      {erro && (
        <p className="nx-cost-error" role="alert">
          {erro}
        </p>
      )}
      {aberto && (
        <div id="import-pending-details">
          {!podeResolver && (
            <p className="nx-cost-help">
              Consulta disponível. Seu perfil não tem permissão para resolver pendências.
            </p>
          )}
          <ul className="nx-cost-records">
            {lista.map((r) => {
              const d = r.dados as Record<string, string | number> | null;
              return (
                <li key={r.id}>
                  <div>
                    <strong>
                      {r.aba === "Outros Itens"
                        ? String(d?.["Descrição integral"] ?? r.tema)
                        : r.tema}
                    </strong>
                    <p>{r.explicacao}</p>
                    <p className="nx-cost-help">
                      {r.aba} · linha {r.linha}
                      {r.aba === "Outros Itens"
                        ? ` · NF ${String(d?.["Nº NF"] ?? "—")} · ${String(d?.["Quantidade original"] ?? "")} ${String(d?.["Unidade"] ?? "")}`
                        : ""}
                    </p>
                  </div>
                  {podeResolver && r.aba !== "Outros Itens" && (
                    <ActionButton
                      variant="ghost"
                      disabled={salvando !== null}
                      onClick={() => marcar(r.id)}
                    >
                      {salvando === r.id ? "Gravando…" : "Marcar como decidido"}
                    </ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
