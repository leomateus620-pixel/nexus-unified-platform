import { MapPin } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { formatCivil } from "./calendar-domain";
import type { PendenteAgenda } from "./types";

// Actions retain their own state machine, including independent verification.
const actionStates: Record<string, { label: string; state: string }> = {
  aberta: { label: "Pendente", state: "publicado" },
  em_execucao: { label: "Em andamento", state: "em_andamento" },
  aguardando_verificacao: { label: "Em verificação", state: "em_andamento" },
  concluida: { label: "Concluído", state: "concluido" },
  cancelada: { label: "Cancelado", state: "cancelado" },
};
export function AgendaPendingCard({
  item,
  onOpen,
  onSchedule,
}: {
  item: PendenteAgenda;
  onOpen: () => void;
  onSchedule?: (() => void) | undefined;
}) {
  const status = actionStates[item.estado] ?? { label: "Pendente", state: "publicado" };
  return (
    <article className="agenda-pending-card">
      <div className="agenda-pending-date">
        <strong>{item.prazo ? "Prazo" : "Sem horário"}</strong>
        {item.prazo && (
          <span>
            {formatCivil(item.prazo, { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
      </div>
      <div className="agenda-pending-content">
        <button type="button" onClick={onOpen} className="agenda-card-title">
          {item.titulo}
        </button>
        <p>{item.responsavel_nome}</p>
        {item.local && (
          <p className="agenda-card-location">
            <MapPin size={15} />
            {item.local}
          </p>
        )}
        {(item.cliente_nome || item.projeto_nome) && (
          <p>
            {item.cliente_nome}
            {item.projeto_nome && item.projeto_nome !== item.cliente_nome
              ? (item.cliente_nome ? " · " : "") + item.projeto_nome
              : ""}
          </p>
        )}
        <span className="agenda-card-category">Ação operacional</span>
        <div className="flex flex-wrap gap-2">
          {onSchedule && (
            <ActionButton variant="ghost" onClick={onSchedule}>
              Agendar registro existente
            </ActionButton>
          )}
          <ActionButton variant="ghost" onClick={onOpen}>
            Abrir origem
          </ActionButton>
        </div>
      </div>
      <span className="agenda-status" data-state={status.state}>
        {status.label}
      </span>
    </article>
  );
}
