import type { PetDetalhe } from "./ui-types";
/** Presentation only; persisted documentary and operational states remain canonical SQL. */
export function initialPetStage(detail: PetDetalhe): number {
  if (["encerrada", "cancelada"].includes(detail.pet.estado_documental)) return 7;
  if (detail.intervalos.some((interval) => !interval.saida_em)) return 5;
  if (
    detail.pet.estado_documental === "encerramento_pendente" ||
    detail.pet.condicao_operacional === "terminada"
  )
    return 6;
  if (detail.pet.emitida_em) return 5;
  if (["em_conferencia", "aguardando_assinaturas"].includes(detail.pet.estado_documental)) return 4;
  return 0;
}
export function petStageAvailable(detail: PetDetalhe, stage: number): boolean {
  if (stage < 0 || stage > 7 || !Number.isInteger(stage)) return false;
  if (stage <= 4) return true;
  if (stage === 7) return ["encerrada", "cancelada"].includes(detail.pet.estado_documental);
  return (
    !!detail.pet.emitida_em && !["encerrada", "cancelada"].includes(detail.pet.estado_documental)
  );
}
export const PET_PHASES = [
  { name: "Preparar", stages: [0, 1, 2, 3] },
  { name: "Conferir", stages: [4] },
  { name: "Operar", stages: [5] },
  { name: "Encerrar", stages: [6] },
  { name: "Consultar", stages: [7] },
] as const;
