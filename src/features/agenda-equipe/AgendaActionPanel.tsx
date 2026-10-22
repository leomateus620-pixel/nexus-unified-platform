import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ActionButton, Section } from "@/components/nexus/Page";
import { RecordFiles } from "@/features/operacao/RecordFiles";
import { OperationalDialog, fieldClass } from "@/features/operacao/components";
import { formatCivil } from "./calendar-domain";
import type { AcaoAgenda, ComandoBody, PendenteAgenda } from "./types";
type Transition = "em_execucao" | "aguardando_verificacao" | "concluida" | "cancelada";
const labels: Record<Transition, string> = {
  em_execucao: "Iniciar ação",
  aguardando_verificacao: "Enviar para verificação",
  concluida: "Verificar e concluir ação",
  cancelada: "Cancelar ação",
};
const states: Record<AcaoAgenda["acao"]["estado"], string> = {
  aberta: "Aberta",
  em_execucao: "Em execução",
  aguardando_verificacao: "Aguardando verificação",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
export function AgendaActionPanel({
  org,
  data,
  busy,
  onBack,
  onSchedule,
  onCommand,
}: {
  org: string;
  data: AcaoAgenda;
  busy: boolean;
  onBack: () => void;
  onSchedule: (source: PendenteAgenda) => void;
  onCommand: (body: ComandoBody) => Promise<boolean>;
}) {
  const a = data.acao,
    p = data.permissoes;
  const [decision, setDecision] = useState<{
      estado: Transition;
      version: number;
      token: string;
      devolucao: boolean;
    } | null>(null),
    [motivo, setMotivo] = useState(""),
    [error, setError] = useState("");
  const current = useRef(decision),
    mounted = useRef(true);
  current.current = decision;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function open(estado: Transition, devolucao = false) {
    setDecision({ estado, version: a.version, token: crypto.randomUUID(), devolucao });
    setMotivo("");
    setError("");
  }
  async function send() {
    const captured = current.current;
    if (!captured || busy) return;
    if ((captured.estado !== "em_execucao" || captured.devolucao) && motivo.trim().length < 5) {
      setError("Explique o resultado ou o motivo com ao menos cinco caracteres.");
      return;
    }
    const ok = await onCommand({
      comando: "transicionar_acao",
      dados: {
        acao_id: a.id,
        expected_version: captured.version,
        estado: captured.estado,
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      },
    });
    if (!mounted.current || current.current?.token !== captured.token) return;
    if (ok) setDecision(null);
    else
      setError(
        "A alteração não foi confirmada. Seu preenchimento foi preservado; consulte o erro e tente novamente.",
      );
  }
  return (
    <div className="grid min-w-0 gap-4">
      <Section
        title={a.titulo}
        description={states[a.estado] + " · Ação operacional · V" + a.version}
        actions={
          <ActionButton variant="ghost" onClick={onBack}>
            Voltar à agenda
          </ActionButton>
        }
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Prazo</dt>
            <dd>{a.prazo ? formatCivil(a.prazo) : "Sem prazo definido"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Prioridade</dt>
            <dd>{a.prioridade}</dd>
          </div>
        </dl>
        {a.descricao && (
          <p className="mt-4 whitespace-pre-wrap break-words text-sm">{a.descricao}</p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          {a.exige_verificacao
            ? "A conclusão exige evidência e verificação por pessoa autorizada independente."
            : "A conclusão segue a política cadastrada para esta ação."}{" "}
          Reservar horário não cria outra tarefa.
        </p>
        {a.conclusao && (
          <p className="mt-4 whitespace-pre-wrap rounded border border-border p-3 text-sm">
            Conclusão: {a.conclusao}
          </p>
        )}
        {a.motivo && <p className="mt-3 whitespace-pre-wrap text-sm">Motivo: {a.motivo}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {p.iniciar && (
            <ActionButton disabled={busy} onClick={() => open("em_execucao")}>
              Iniciar ação
            </ActionButton>
          )}
          {p.devolver && (
            <ActionButton variant="ghost" disabled={busy} onClick={() => open("em_execucao", true)}>
              Devolver para correção
            </ActionButton>
          )}
          {p.enviar_verificacao && (
            <ActionButton disabled={busy} onClick={() => open("aguardando_verificacao")}>
              Enviar para verificação
            </ActionButton>
          )}
          {p.concluir && (
            <ActionButton disabled={busy} onClick={() => open("concluida")}>
              Verificar e concluir ação
            </ActionButton>
          )}
          {p.agendar && (
            <ActionButton
              variant="ghost"
              disabled={busy}
              onClick={() =>
                onSchedule({
                  id: a.id,
                  tipo: "acao",
                  titulo: a.titulo,
                  estado: a.estado,
                  responsavel_id: a.responsavel_id,
                  responsavel_nome: data.responsavel_nome,
                  prazo: a.prazo,
                  cliente_id: null,
                  unidade_id: null,
                })
              }
            >
              Agendar esta ação
            </ActionButton>
          )}
          {p.cancelar && (
            <ActionButton variant="danger" disabled={busy} onClick={() => open("cancelada")}>
              Cancelar ação
            </ActionButton>
          )}
        </div>
      </Section>
      <Section
        title="Evidências da ação"
        description="Os anexos pertencem à mesma ação, com acesso privado revalidado."
      >
        <RecordFiles
          pai={{ organization_id: org, acao_id: a.id }}
          readOnly={a.estado === "concluida" || a.estado === "cancelada"}
        />
      </Section>
      {decision && (
        <OperationalDialog
          title={decision.devolucao ? "Devolver para correção" : labels[decision.estado]}
          open
          onOpenChange={(open) => {
            if (!open) setDecision(null);
          }}
        >
          <form
            className="grid gap-4"
            aria-busy={busy}
            data-dirty={motivo ? "true" : "false"}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {decision.version !== a.version && (
              <p role="alert" className="rounded border border-warning/50 p-3 text-sm">
                A ação mudou desde a abertura. Seu texto está preservado; feche este formulário e
                compare a ficha atual antes de tentar novamente.
              </p>
            )}
            <p className="text-sm">
              {a.titulo} · Versão aberta {decision.version}
            </p>
            {(decision.estado !== "em_execucao" || decision.devolucao) && (
              <label className="grid gap-1 text-sm">
                Resultado ou motivo *
                <textarea
                  className={fieldClass + " min-h-28"}
                  value={motivo}
                  minLength={5}
                  maxLength={10000}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild>
                <ActionButton variant="ghost" disabled={busy}>
                  Voltar
                </ActionButton>
              </Dialog.Close>
              <ActionButton type="submit" loading={busy} disabled={decision.version !== a.version}>
                {decision.devolucao ? "Devolver para correção" : labels[decision.estado]}
              </ActionButton>
            </div>
          </form>
        </OperationalDialog>
      )}
    </div>
  );
}
