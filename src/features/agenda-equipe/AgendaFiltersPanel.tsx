import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";
import { useAgendaAppearance } from "./AgendaAppearance";
import { AgendaPicker } from "./AgendaPicker";
import { tipoLabels } from "./domain";
import type { AgendaSearch } from "./types";
export function AgendaFiltersPanel({
  org,
  search,
  canTeam,
  onDenied,
  onClose,
  onApply,
}: {
  org: string;
  search: AgendaSearch;
  canTeam: boolean;
  onDenied: (error: unknown) => void;
  onClose: () => void;
  onApply: (patch: Partial<AgendaSearch>) => void;
}) {
  const { theme } = useAgendaAppearance();
  const [draft, setDraft] = useState(search);
  const opener = useRef<HTMLElement | null>(null);
  const patch = (value: Partial<AgendaSearch>) => setDraft((s) => ({ ...s, ...value }));
  const clear = () =>
    patch({
      busca: "",
      estado: "",
      tipo: "",
      equipe: "",
      pessoa: "",
      cliente: "",
      projeto: "",
      natureza: "",
      hora: -1,
      demanda: false,
      foco: canTeam ? "equipe" : "minha",
    });
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="agenda-dialog-overlay" />
        <Dialog.Content
          className="agenda-workspace agenda-filter-dialog"
          data-theme={theme}
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            if (document.activeElement instanceof HTMLElement)
              opener.current = document.activeElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus({ preventScroll: true });
          }}
        >
          <header>
            <Dialog.Title>Filtros da agenda</Dialog.Title>
            <Dialog.Close className="agenda-icon-button" aria-label="Fechar filtros">
              <X size={18} />
            </Dialog.Close>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onApply(draft);
            }}
          >
            <div className="agenda-filter-fields">
              <label>
                Buscar
                <div className="agenda-search-input">
                  <Search size={17} />
                  <input
                    type="search"
                    aria-label="Buscar na agenda"
                    placeholder="Título, local ou descrição"
                    value={draft.busca}
                    maxLength={120}
                    onChange={(e) => patch({ busca: e.target.value })}
                  />
                </div>
              </label>
              <label>
                Agenda
                <select
                  aria-label="Escopo da agenda"
                  value={
                    draft.foco === "equipe" || (draft.foco !== "minha" && draft.pendentesEquipe)
                      ? "equipe"
                      : "minha"
                  }
                  onChange={(e) =>
                    patch({
                      foco:
                        draft.foco === "pendentes" || draft.foco === "notificacoes"
                          ? draft.foco
                          : (e.target.value as AgendaSearch["foco"]),
                      pendentesEquipe: e.target.value === "equipe",
                    })
                  }
                >
                  <option value="minha">Minha agenda</option>
                  {canTeam && <option value="equipe">Equipe</option>}
                </select>
              </label>
              <AgendaPicker
                org={org}
                tipo="pessoas"
                label="Pessoa"
                value={draft.pessoa}
                onDenied={onDenied}
                onChange={(r) => patch({ pessoa: r?.id ?? "" })}
              />
              <AgendaPicker
                org={org}
                tipo="projetos"
                label="Cliente / projeto"
                value={draft.projeto}
                onDenied={onDenied}
                onChange={(r) => patch({ projeto: r?.id ?? "", cliente: r?.cliente_id ?? "" })}
              />
              <label>
                Status
                <select
                  value={draft.estado}
                  onChange={(e) => patch({ estado: e.target.value as AgendaSearch["estado"] })}
                >
                  <option value="">Todos</option>
                  <option value="rascunho">Pendente · rascunho</option>
                  <option value="publicado">Pendente · publicado</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </label>
              <label>
                Categoria
                <select
                  value={draft.tipo}
                  onChange={(e) => patch({ tipo: e.target.value as AgendaSearch["tipo"] })}
                >
                  <option value="">Todas</option>
                  {Object.entries(tipoLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Natureza
                <select
                  value={draft.natureza}
                  onChange={(e) => patch({ natureza: e.target.value as AgendaSearch["natureza"] })}
                >
                  <option value="">Evento e ação</option>
                  <option value="evento">Evento</option>
                  <option value="acao">Ação</option>
                </select>
              </label>
              {canTeam && draft.foco !== "pendentes" && (
                <AgendaPicker
                  org={org}
                  tipo="equipes"
                  label="Equipe"
                  value={draft.equipe}
                  onDenied={onDenied}
                  onChange={(r) => patch({ equipe: r?.id ?? "" })}
                />
              )}
              {draft.hora >= 0 && (
                <label>
                  Faixa horária
                  <select
                    value={draft.hora}
                    onChange={(e) => patch({ hora: Number(e.target.value) })}
                  >
                    <option value={-1}>Todas</option>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}h — {String(hour + 1).padStart(2, "0")}h
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <footer>
              <ActionButton variant="ghost" onClick={clear}>
                Limpar
              </ActionButton>
              <div>
                <ActionButton variant="ghost" onClick={onClose}>
                  Cancelar
                </ActionButton>
                <ActionButton type="submit">Aplicar</ActionButton>
              </div>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
