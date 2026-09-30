import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SaveCtx, revKeys, type SaveStatus, type CalculationStatus } from "./hooks";
import { consolidarProposta } from "./propostas.functions";
import { ProposalSaveCoordinator, type SaveConfirmation } from "./save-queue";

export function ProposalSaveProvider({
  revisaoId,
  editavel = true,
  needsCalculation = false,
  children,
}: {
  revisaoId: string;
  editavel?: boolean;
  needsCalculation?: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<{
    status: SaveStatus;
    calculation: CalculationStatus;
    msg: string | null;
    busy: boolean;
  }>({ status: "idle", calculation: "current", msg: null, busy: false });
  const qc = useQueryClient();
  const consolidate = useServerFn(consolidarProposta);
  const server = useRef(consolidate);
  const revisionVersion = useRef<number | null>(null);
  const revisionBaselines = useRef(new Map<string, Record<string, unknown>>());
  const requestedInitialCalculation = useRef(false);
  server.current = consolidate;
  const coordinator = useMemo(
    () =>
      new ProposalSaveCoordinator({
        changed: setState,
        consolidate: async (id) =>
          (await server.current({
            data: { revisao_id: revisaoId, operacao_id: id },
          })) as SaveConfirmation,
        confirmed: async () => {
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["salvamentos", revisaoId] }),
            qc.invalidateQueries({ queryKey: revKeys.all(revisaoId) }),
          ]);
          const revision = qc.getQueryData<{ version: number }>(revKeys.head(revisaoId));
          if (revision) revisionVersion.current = revision.version;
        },
        validate: () => {
          const invalid = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            ".nx-proposal-workspace input:invalid, .nx-proposal-workspace textarea:invalid",
          );
          if (invalid)
            throw new Error("Entrada inválida: revise o campo indicado. Edição local preservada.");
        },
      }),
    [qc, revisaoId],
  );
  useEffect(() => {
    coordinator.activate();
    const flush = () => {
      if (editavel) void coordinator.flush();
    };
    const background = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", background);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", background);
      coordinator.dispose();
      requestedInitialCalculation.current = false;
    };
  }, [coordinator, editavel]);
  useEffect(() => {
    if (editavel && needsCalculation && !requestedInitialCalculation.current) {
      requestedInitialCalculation.current = true;
      void coordinator.requestCalculation();
    }
  }, [coordinator, editavel, needsCalculation]);
  const ctx = useMemo(
    () => ({
      ...state,
      set: coordinator.set,
      run: editavel ? coordinator.run : async () => undefined,
      register: coordinator.register,
      local: coordinator.local,
      settle: coordinator.settle,
      draft: coordinator.draft,
      remember: coordinator.remember,
      revisionVersion,
      revisionBaselines: revisionBaselines.current,
      ensureConsistent: editavel ? coordinator.ensureConsistent : async () => true,
      save: editavel ? coordinator.ensureConsistent : async () => true,
      retry: editavel ? coordinator.retry : async () => false,
      flush: editavel ? coordinator.flush : async () => true,
      requestCalculation: editavel ? coordinator.requestCalculation : async () => false,
    }),
    [state, coordinator, editavel],
  );
  return <SaveCtx.Provider value={ctx}>{children}</SaveCtx.Provider>;
}
