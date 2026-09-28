import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SaveCtx, revKeys, type SaveStatus } from "./hooks";
import { consolidarProposta } from "./propostas.functions";
import { ProposalSaveQueue } from "./save-queue";

export function ProposalSaveProvider({
  revisaoId,
  children,
}: {
  revisaoId: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queue = useRef(new ProposalSaveQueue());
  const flushers = useRef(new Map<string, () => void>());
  const generation = useRef(0);
  const localFields = useRef(new Set<string>());
  const operation = useRef<{ id: string; generation: number } | null>(null);
  const saving = useRef(false);
  const qc = useQueryClient();
  const consolidate = useServerFn(consolidarProposta);
  const set = useCallback((s: SaveStatus, message?: string) => {
    setStatus(s);
    setMsg(message ?? null);
  }, []);
  const local = useCallback(
    (key = "form") => {
      localFields.current.add(key);
      generation.current++;
      set("local");
    },
    [set],
  );
  const settle = useCallback(
    (key = "form") => {
      localFields.current.delete(key);
      if (
        !localFields.current.size &&
        !queue.current.pending &&
        !queue.current.failures.size &&
        !saving.current
      )
        set("salvo");
    },
    [set],
  );
  const register = useCallback((key: string, flush: () => void) => {
    flushers.current.set(key, flush);
    return () => {
      flushers.current.delete(key);
    };
  }, []);
  const run = useCallback(
    <T,>(key: string, work: () => Promise<T>): Promise<T | undefined> => {
      const captured = key === "calculo" ? generation.current : ++generation.current;
      if (!saving.current) set("salvando");
      return queue.current
        .enqueue(key, work)
        .then((value) => {
          if (!queue.current.failures.size && !saving.current)
            set(generation.current === captured && !localFields.current.size ? "salvo" : "local");
          return value;
        })
        .catch((error: Error) => {
          set(/conflito/i.test(error.message) ? "conflito" : "erro", error.message);
          return undefined;
        });
    },
    [set],
  );
  const save = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const invalid = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        ".nx-proposal-workspace input:invalid, .nx-proposal-workspace textarea:invalid",
      );
      if (invalid) {
        invalid.reportValidity();
        throw new Error("Entrada inválida: revise o campo indicado. Rascunho preservado.");
      }
      // Each flusher captures current form values synchronously before enqueuing work.
      if (!operation.current) flushers.current.forEach((flush) => flush());
      if (!operation.current && localFields.current.size)
        throw new Error(
          "Entrada pendente: conclua o campo ou a justificativa antes de consolidar. Trabalho preservado.",
        );
      operation.current ??= { id: crypto.randomUUID(), generation: generation.current };
      const captured = operation.current.generation;
      const id = operation.current.id;
      set("consolidando");
      const result = (await queue.current.enqueue("checkpoint", async () => {
        queue.current.assertHealthy();
        return consolidate({ data: { revisao_id: revisaoId, operacao_id: id } });
      })) as { evento: boolean; objetos: number; campos: number };
      operation.current = null;
      set(
        generation.current === captured && !localFields.current.size ? "confirmado" : "local",
        result.evento
          ? `Salvamento confirmado · ${result.objetos} objetos · ${result.campos} campos${generation.current !== captured ? ". Novas edições ficam para o próximo salvamento." : ""}`
          : "Nenhuma alteração para salvar",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["salvamentos", revisaoId] }),
        qc.invalidateQueries({ queryKey: revKeys.all(revisaoId) }),
      ]);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      // Definitive validation/conflict rejection: next deliberate save is a new operation.
      // Transport failures keep the UUID, so a lost confirmation cannot duplicate the event.
      if (/conflito|inválid|pendente|não consolidado|Acesso|imutável/i.test(error))
        operation.current = null;
      set(/conflito/i.test(error) ? "conflito" : "erro", error);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }, [consolidate, qc, revisaoId, set]);
  const ctx = useMemo(
    () => ({ status, msg, set, run, register, local, settle, save, busy }),
    [status, msg, set, run, register, local, settle, save, busy],
  );
  return <SaveCtx.Provider value={ctx}>{children}</SaveCtx.Provider>;
}
