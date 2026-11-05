import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton } from "@/components/nexus/Page";
import type { UnitScope } from "@/features/nr/mapa/types";
import { petFormularioBranco } from "./print.functions";
import { baixarBytes } from "./PetDocumentos";
export function PetUnitPrint({
  scope,
  models,
}: {
  scope: UnitScope;
  models: { id: string; nome: string; versao: number }[];
}) {
  const load = useServerFn(petFormularioBranco),
    [model, setModel] = useState(""),
    [copies, setCopies] = useState<1 | 2>(2),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const r = await load({ data: { ...scope, modelo_id: model, vias: copies } });
      baixarBytes(r.base64, r.nome);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Formulário indisponível.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="nx-pet-panel">
      <summary>Impressão e formulário em branco</summary>
      <p className="nx-pet-hint">
        O original digital assinado fica no acervo de cada PET. Para uso físico, imprima duas vias
        do original preservado. O formulário abaixo exige um layout incluído na versão aprovada pelo
        RT e não cria nem emite uma PET.
      </p>
      {!models.length ? (
        <p>Procedimento e layout aprovados indisponíveis. Solicite a regularização ao RT.</p>
      ) : (
        <div className="nx-pet-actions my-3">
          <select
            aria-label="Modelo para impressão"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">Selecione o procedimento</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} · v{m.versao}
              </option>
            ))}
          </select>
          <select
            aria-label="Vias do formulário"
            value={copies}
            onChange={(e) => setCopies(Number(e.target.value) as 1 | 2)}
          >
            <option value={2}>Duas vias físicas · seis páginas</option>
            <option value={1}>Uma via em branco · três páginas</option>
          </select>
          <ActionButton onClick={generate} disabled={!model || busy}>
            {busy ? "Gerando…" : "Baixar formulário em branco"}
          </ActionButton>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
