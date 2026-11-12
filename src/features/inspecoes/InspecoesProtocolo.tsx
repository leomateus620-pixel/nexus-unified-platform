import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { inspecoesHomologarProtocolo, inspecoesProtocoloAtual } from "./inspecoes.functions";
import { tiposLevantamento } from "./ui-contract";

export function InspecoesProtocolo({
  organizationId,
  familia,
  queryKey,
}: {
  organizationId: string;
  familia: string;
  queryKey: readonly string[];
}) {
  const [tipo, setTipo] = useState<(typeof tiposLevantamento)[number]>("T1");
  const [fonte, setFonte] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [art, setArt] = useState("");
  const [ensaio, setEnsaio] = useState("");
  const consultar = useServerFn(inspecoesProtocoloAtual);
  const homologar = useServerFn(inspecoesHomologarProtocolo);
  const cache = useQueryClient();
  const atual = useQuery({
    queryKey: [...queryKey, "protocolo", familia, tipo],
    queryFn: ({ signal }) => consultar({ data: { organizationId, familia, tipo }, signal }),
  });
  const salvar = useMutation({
    mutationFn: () =>
      homologar({
        data: {
          organizationId,
          familia,
          tipo,
          fonte,
          justificativa,
          artObrigatoria: art === "sim",
          ensaioObrigatorio: ensaio === "sim",
          version: atual.data?.version ?? 0,
        },
      }),
    onSuccess: () => {
      setFonte("");
      setJustificativa("");
      setArt("");
      setEnsaio("");
      void cache.invalidateQueries({ queryKey });
    },
  });
  return (
    <details className="insp-expansivel">
      <summary>Homologação de protocolo</summary>
      <form
        className="insp-stack"
        onSubmit={(event) => {
          event.preventDefault();
          salvar.mutate();
        }}
      >
        <label className="insp-field">
          Tipo de inspeção
          <select
            value={tipo}
            disabled={salvar.isPending}
            onChange={(event) => {
              setTipo(event.target.value as typeof tipo);
              salvar.reset();
              setFonte("");
              setJustificativa("");
              setArt("");
              setEnsaio("");
            }}
          >
            {tiposLevantamento.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        {atual.isPending ? (
          <LoadingState label="Consultando protocolo…" />
        ) : atual.isError ? (
          <ErrorState error={atual.error} onRetry={() => void atual.refetch()} />
        ) : (
          <p>
            {atual.data
              ? `Revisão homologada ${atual.data.version} · ${atual.data.fonte}`
              : "Checklist proposto, aguardando homologação."}
          </p>
        )}
        <label className="insp-field">
          Fonte técnica aplicável
          <input
            value={fonte}
            onChange={(event) => setFonte(event.target.value)}
            minLength={5}
            maxLength={2000}
            required
          />
        </label>
        <label className="insp-field">
          Justificativa da homologação
          <textarea
            value={justificativa}
            onChange={(event) => setJustificativa(event.target.value)}
            minLength={10}
            maxLength={4000}
            required
          />
        </label>
        <label className="insp-field">
          ART exigida para este protocolo
          <select value={art} onChange={(event) => setArt(event.target.value)} required>
            <option value="">Selecione</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </label>
        <label className="insp-field">
          Ensaio exigido para este protocolo
          <select value={ensaio} onChange={(event) => setEnsaio(event.target.value)} required>
            <option value="">Selecione</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </label>
        <ActionButton type="submit" disabled={atual.isPending || atual.isError || salvar.isPending}>
          {salvar.isPending ? "Homologando…" : "Homologar nova revisão"}
        </ActionButton>
        {salvar.isError && <ErrorState error={salvar.error} />}
        {salvar.isSuccess && <p role="status">Revisão {salvar.data.version} homologada.</p>}
      </form>
    </details>
  );
}
