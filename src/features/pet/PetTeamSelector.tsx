import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Plus, RotateCw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PET_FUNCOES } from "./ui-types";
import {
  certificadoKey,
  PET_FUNCOES_EQUIPE,
  rotuloCertificado,
  type Candidatos,
  type PetFuncaoEquipe,
} from "./equipe-certificados";
import { petEquipeCandidatos, petEquipeTreinamento } from "./equipe-certificados.functions";
import "./pet-team.css";

type Scope = { organization_id: string; cliente_id: string; unidade_id: string };
export type TeamMember = { id: string; nome: string; funcao: PetFuncaoEquipe; pessoa_id?: string | undefined };

function Badge({ s }: { s: Parameters<typeof rotuloCertificado>[0] }) {
  const r = rotuloCertificado(s);
  return (
    <span className="pet-cert-badge" data-tone={r.tom}>
      <span aria-hidden="true">{r.icone}</span> {r.texto}
    </span>
  );
}

/** Role → registered person → add, with the documentary state per person + role. */
export function PetTeamSelector({
  scope,
  equipe,
  disabled,
  editable,
  onAdd,
  onRemove,
}: {
  scope: Scope;
  equipe: TeamMember[];
  disabled: boolean;
  editable: boolean;
  onAdd: (m: Omit<TeamMember, "id">) => void;
  onRemove: (id: string) => void;
}) {
  const load = useServerFn(petEquipeCandidatos);
  const [funcao, setFuncao] = useState<PetFuncaoEquipe>("supervisor");
  const [pessoa, setPessoa] = useState("");
  const [busca, setBusca] = useState("");
  const [legacyName, setLegacyName] = useState("");
  const [viewer, setViewer] = useState<{ pessoa_id: string; nome: string; funcao: PetFuncaoEquipe; qualificacao_id?: string } | null>(null);
  const opts = (f: PetFuncaoEquipe) => ({
    queryKey: certificadoKey(scope, f),
    queryFn: ({ signal }: { signal: AbortSignal }) => load({ data: { ...scope, funcao: f }, signal }),
    retry: false,
    staleTime: 60_000,
  });
  const current = useQuery(opts(funcao));
  const roles = useMemo(() => [...new Set(equipe.map((p) => p.funcao))], [equipe]);
  const perRole = useQueries({ queries: roles.map((f) => opts(f)) });
  const byRole = new Map<PetFuncaoEquipe, (typeof perRole)[number]>(roles.map((f, i) => [f, perRole[i]!]));
  const noAccess = current.isError && /permiss|indispon/i.test(String(current.error?.message));
  const list = (current.data?.candidatos ?? []).filter((c) =>
    c.nome.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")),
  );
  const selected = current.data?.candidatos.find((c) => c.pessoa_id === pessoa);
  const duplicate = equipe.some((p) => p.pessoa_id === pessoa && p.funcao === funcao);
  const rowState = (m: TeamMember) => {
    if (!m.pessoa_id) return { s: "incompleto" as const, legacy: true, c: undefined };
    const q = byRole.get(m.funcao);
    if (!q || q.isPending) return { s: "verificando" as const, c: undefined };
    if (q.isError) return { s: noAccessErr(q.error) ? ("sem_acesso" as const) : ("indisponivel" as const), c: undefined, retry: () => q.refetch() };
    const c = (q.data as Candidatos).candidatos.find((x) => x.pessoa_id === m.pessoa_id);
    return { s: c?.situacao ?? ("ausente" as const), c };
  };
  return (
    <div className="pet-team">
      <div className="pet-team-controls">
        <label>
          <span>Função nesta PET</span>
          <select
            value={funcao}
            disabled={disabled}
            onChange={(e) => {
              setFuncao(e.target.value as PetFuncaoEquipe);
              setBusca("");
            }}
          >
            {PET_FUNCOES_EQUIPE.map((f) => (
              <option key={f} value={f}>
                {PET_FUNCOES[f]}
              </option>
            ))}
          </select>
        </label>
        {noAccess ? (
          <label>
            <span>Nome do participante (sem acesso ao cadastro)</span>
            <input value={legacyName} maxLength={160} disabled={disabled} onChange={(e) => setLegacyName(e.target.value)} />
          </label>
        ) : (
          <label className="pet-team-person">
            <span>Pessoa cadastrada</span>
            {(current.data?.candidatos.length ?? 0) > 8 && (
              <input
                type="search"
                placeholder="Buscar nome"
                aria-label="Buscar pessoa"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            )}
            <select value={pessoa} disabled={disabled || current.isPending} onChange={(e) => setPessoa(e.target.value)}>
              <option value="">
                {current.isPending
                  ? "Carregando equipe da unidade…"
                  : current.isError
                    ? "Consulta indisponível"
                    : list.length
                      ? "Selecione"
                      : "Nenhuma pessoa vinculada para esta função"}
              </option>
              {list.map((c) => (
                <option key={c.pessoa_id} value={c.pessoa_id}>
                  {`${c.nome} — ${rotuloCertificado(c.situacao).icone} ${rotuloCertificado(c.situacao).texto}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="pet-demo-secondary"
          disabled={disabled || (noAccess ? legacyName.trim().length < 2 : !selected || duplicate)}
          onClick={() => {
            if (noAccess) {
              onAdd({ nome: legacyName.trim(), funcao });
              setLegacyName("");
            } else if (selected) onAdd({ nome: selected.nome, funcao, pessoa_id: selected.pessoa_id });
          }}
        >
          <Plus size={16} /> Adicionar à equipe
        </button>
      </div>
      {selected && (
        <p className="pet-team-preview" aria-live="polite">
          <Badge s={selected.situacao} />
          {duplicate && <span> · já está na equipe nesta função</span>}
          {selected.evidencia?.anexo_id && (
            <button
              type="button"
              className="pet-team-view"
              onClick={() =>
                setViewer({ pessoa_id: selected.pessoa_id, nome: selected.nome, funcao, qualificacao_id: selected.evidencia!.qualificacao_id })
              }
            >
              <Eye size={15} aria-hidden="true" /> Ver treinamento
            </button>
          )}
        </p>
      )}
      {current.isError && !noAccess && (
        <p className="pet-team-preview">
          <Badge s="indisponivel" />
          <button type="button" className="pet-team-view" onClick={() => current.refetch()}>
            <RotateCw size={14} aria-hidden="true" /> Tentar de novo
          </button>
        </p>
      )}
      <div className="pet-teamsel-groups">
        {PET_FUNCOES_EQUIPE.filter((f) => equipe.some((p) => p.funcao === f)).map((f) => (
          <section key={f} aria-label={PET_FUNCOES[f]}>
            <h4>{PET_FUNCOES[f]}</h4>
            <ul>
              {equipe
                .filter((p) => p.funcao === f)
                .map((p) => {
                  const st = rowState(p);
                  return (
                    <li key={p.id}>
                      <span className="pet-team-name">
                        <strong>{p.nome}</strong>
                        {st.legacy ? (
                          <span className="pet-cert-badge" data-tone="neutro">Sem cadastro vinculado</span>
                        ) : (
                          <Badge s={st.s} />
                        )}
                      </span>
                      <span className="pet-team-actions">
                        {"retry" in st && (
                          <button type="button" aria-label={`Tentar de novo para ${p.nome}`} onClick={() => st.retry?.()}>
                            <RotateCw size={15} />
                          </button>
                        )}
                        {st.c?.evidencia?.anexo_id && (
                          <button
                            type="button"
                            className="pet-team-view"
                            aria-label={`Ver treinamento de ${p.nome} como ${PET_FUNCOES[f]}`}
                            onClick={() =>
                              setViewer({ pessoa_id: p.pessoa_id!, nome: p.nome, funcao: f, qualificacao_id: st.c!.evidencia!.qualificacao_id })
                            }
                          >
                            <Eye size={15} aria-hidden="true" /> Ver treinamento
                          </button>
                        )}
                        {editable && (
                          <button type="button" aria-label={`Remover ${p.nome}`} onClick={() => onRemove(p.id)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
      <TrainingViewer scope={scope} target={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

function noAccessErr(e: unknown) {
  return /permiss|indispon/i.test(String((e as Error)?.message));
}

function TrainingViewer({
  scope,
  target,
  onClose,
}: {
  scope: Scope;
  target: { pessoa_id: string; nome: string; funcao: PetFuncaoEquipe; qualificacao_id?: string } | null;
  onClose: () => void;
}) {
  const open = useServerFn(petEquipeTreinamento);
  const [pick, setPick] = useState<string | undefined>();
  const qid = pick ?? target?.qualificacao_id;
  const q = useQuery({
    queryKey: ["pet", "treinamento", scope.organization_id, scope.unidade_id, target?.pessoa_id, target?.funcao, qid],
    enabled: !!target,
    queryFn: () =>
      open({ data: { ...scope, funcao: target!.funcao, pessoa_id: target!.pessoa_id, ...(qid ? { qualificacao_id: qid } : {}) } }),
    retry: false,
    staleTime: 60_000,
    gcTime: 60_000,
  });
  const ev = q.data?.evidencias.find((e) => e.qualificacao_id === q.data?.escolhida);
  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) {
          setPick(undefined);
          onClose();
        }
      }}
    >
      <DialogContent className="pet-training-dialog">
        <DialogHeader>
          <DialogTitle>Treinamento · {target?.nome}</DialogTitle>
          <DialogDescription>
            {target && PET_FUNCOES[target.funcao]} · comprovante vinculado ao cadastro. A liberação da PET segue as
            validações de capacitação, vigência e designação no servidor.
          </DialogDescription>
        </DialogHeader>
        {q.isPending ? (
          <p role="status">Abrindo comprovante…</p>
        ) : q.isError ? (
          <p role="alert">Sem acesso ao comprovante ou consulta indisponível.</p>
        ) : ev ? (
          <div className="pet-training-body">
            <dl>
              <dt>Curso</dt>
              <dd>{ev.curso}</dd>
              <dt>Emissor</dt>
              <dd>{ev.emissor}</dd>
              <dt>Carga horária</dt>
              <dd>{ev.carga_horaria ? `${ev.carga_horaria} h` : "Não informada"}</dd>
              <dt>Realização</dt>
              <dd>{ev.conclusao.split("-").reverse().join("/")}</dd>
              <dt>Validade</dt>
              <dd>{ev.validade ? ev.validade.split("-").reverse().join("/") : "Não informada no certificado"}</dd>
              <dt>Situação</dt>
              <dd>{ev.estado === "validada" ? "Validada" : ev.estado === "revogada" ? "Revogada" : "Em conferência"}</dd>
            </dl>
            {q.data.url ? (
              <img src={q.data.url} alt={`Certificado de ${target?.nome}: ${ev.curso}`} />
            ) : (
              <p role="alert">{q.data.erro ?? "Comprovante não anexado."}</p>
            )}
            {q.data.evidencias.length > 1 && (
              <label>
                Outros comprovantes desta função
                <select value={qid} onChange={(e) => setPick(e.target.value)}>
                  {q.data.evidencias.map((e) => (
                    <option key={e.qualificacao_id} value={e.qualificacao_id}>
                      {e.curso} · {e.conclusao}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ) : (
          <p role="alert">Sem certificado desta função.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
