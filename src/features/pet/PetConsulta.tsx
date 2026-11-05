import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useOrg } from "@/features/org/session";
import { ErrorState, LoadingState } from "@/components/nexus/Page";
import type { Norma } from "@/features/nr/domain";
import type { NrSearch } from "@/features/nr/NrWorkspace";
import { petObter } from "./pet.functions";
import { petDate, petLabel, type PetDetalhe } from "./ui-types";
import { PetDocumentos } from "./PetDocumentos";
import { PetPhotoMetadata } from "./PetPhotoMetadata";
import { PetTemposOficiais } from "./PetResumo";
import type { Json } from "./schemas";
import "./pet.css";
export function PetConsulta({
  petId,
  norma,
  search,
}: {
  petId: string;
  norma: Norma;
  search: NrSearch;
}) {
  const session = useOrg(),
    load = useServerFn(petObter),
    [copied, setCopied] = useState("");
  const q = useQuery({
    queryKey: ["pet", session.data?.orgId, session.data?.userId, "consulta", petId],
    enabled: !!session.data,
    queryFn: ({ signal }) =>
      load({
        data: { organization_id: session.data!.orgId, id: petId },
        signal,
      }) as unknown as Promise<PetDetalhe>,
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: "always",
  });
  if (session.isError || q.isError)
    return <ErrorState error={session.error || q.error} onRetry={() => q.refetch()} />;
  if (!session.data || !q.data) return <LoadingState />;
  const d = q.data,
    people = d.intervalos.filter((p) => !p.saida_em),
    name = (id: string) => d.participantes.find((p) => p.pessoa_id === id)?.nome_snapshot ?? id;
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(
        "Link de consulta copiado. O destinatário precisa entrar no Nexus e ter acesso a esta PET.",
      );
    } catch {
      setCopied("Copie o endereço desta página. O acesso permanece autenticado.");
    }
  }
  return (
    <main className="nx-pet p-4">
      <Link
        to={String(`${norma === "NR33" ? "/nr-33" : "/nr-35"}/pets`)}
        search={{ ...search, consulta: false }}
      >
        ← Histórico da unidade
      </Link>
      <header className="nx-pet-panel my-4">
        <p className="nx-pet-kicker">PET · somente leitura</p>
        <h1>
          {d.pet.numero} · {d.pet.atividade}
        </h1>
        <p>
          {String(d.espaco.identificacao ?? "")} · {petLabel(d.pet.estado_documental)} ·{" "}
          {petLabel(d.pet.condicao_operacional)}
        </p>
        <p>
          Consulta atualizada às {new Date(q.dataUpdatedAt).toLocaleTimeString("pt-BR")}.
          Atualização a cada 5 segundos.
        </p>
        <button className="nr-inline-action" onClick={() => void copy()}>
          Copiar link para consulta
        </button>
        {copied && <p role="status">{copied}</p>}
      </header>
      <section className="nx-pet-panel">
        <h2>Ao vivo · presenças registradas</h2>
        <p>{people.length} pessoa(s) com entrada registrada e sem saída confirmada.</p>
        {people.map((p, i) => (
          <p key={`${p.pessoa_id}:${i}`}>
            {name(p.pessoa_id)} · entrada {petDate(p.entrada_em, d.pet.timezone)}
          </p>
        ))}
        <p className="nx-pet-hint">
          A tela apresenta registros recebidos. Não substitui o vigia nem o monitoramento contínuo.
        </p>
      </section>
      <PetTemposOficiais detail={d} />
      <section className="nx-pet-panel my-4">
        <h2>Avaliações e leituras registradas</h2>
        {d.avaliacoes.length ? (
          d.avaliacoes.slice(-20).map((a) => (
            <article className="nx-pet-card" key={a.id}>
              <strong>
                {petLabel(a.etapa)} · {petDate(a.momento, d.pet.timezone)}
              </strong>
              <p>
                {a.instrumento} · série {a.numero_serie}
              </p>
              {(a.leituras ?? d.leituras.filter((l) => l.avaliacao_id === a.id)).map((l, i) => (
                <p key={i}>
                  {l.agente}: {l.valor} {l.unidade}
                </p>
              ))}
            </article>
          ))
        ) : (
          <p>Nenhuma avaliação registrada.</p>
        )}
      </section>
      <section className="nx-pet-panel my-4">
        <h2>Eventos recentes</h2>
        {d.eventos.slice(-20).map((e) => (
          <p key={e.id}>
            {petDate(e.momento ?? e.created_at, d.pet.timezone)} · {petLabel(e.tipo)} · {e.motivo}
          </p>
        ))}
      </section>
      <PetPhotoMetadata
        org={session.data.orgId}
        petId={petId}
        version={d.pet.version}
        editable={false}
      />
      <PetDocumentos
        organizationId={session.data.orgId}
        petId={petId}
        versao={d.pet.version}
        documentos={d.documentos as unknown as Record<string, Json>[]}
      />
    </main>
  );
}
