import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowDown } from "lucide-react";
import { useCommandKey } from "@/features/operacao/components";
import { ActionButton } from "@/components/nexus/Page";
import type { Norma, NrRecord } from "./domain";
import { nrPastaOrdenar } from "./folders.functions";
export function NrFolderOrder({ org, norma, row }: { org: string; norma: Norma; row: NrRecord }) {
  const execute = useServerFn(nrPastaOrdenar),
    qc = useQueryClient(),
    key = useCommandKey();
  const guard = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function move(direcao: "subir" | "descer") {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        organization_id: org,
        norma,
        id: row.id,
        expected_version: row.version,
        direcao,
      };
      await execute({ data: { ...payload, chave: key(payload) } });
      setNotice("Ordem da pasta confirmada no servidor.");
      await qc.invalidateQueries({ queryKey: ["nr", org] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ordenar a pasta.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="nr-panel my-4" aria-label="Ordenar pasta">
      <h3 className="font-semibold">Ordem entre pastas do mesmo nível</h3>
      <p className="text-sm my-2">
        A posição muda sem alterar identidade, pasta pai, arquivos ou caminho original.
      </p>
      <div className="flex gap-2 flex-wrap">
        <ActionButton disabled={busy} variant="ghost" onClick={() => void move("subir")}>
          <ArrowUp size={16} />
          Subir pasta
        </ActionButton>
        <ActionButton disabled={busy} variant="ghost" onClick={() => void move("descer")}>
          <ArrowDown size={16} />
          Descer pasta
        </ActionButton>
      </div>
      {error && (
        <p role="alert" className="text-red-800 mt-2">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2">
          {notice}
        </p>
      )}
    </section>
  );
}
