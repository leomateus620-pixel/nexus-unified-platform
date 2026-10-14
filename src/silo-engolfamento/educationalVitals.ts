/**
 * These effort/stress presets are presentation assumptions, not a clinical
 * time course, diagnosis, sensor reading, or prognosis. SpO₂ remains unavailable
 * because no validated engulfment-specific medical curve is available here.
 * Concept/limitations: FDA, Pulse Oximeter Basics (local sources catalogue).
 */
export type IllustrativeBpm = number & { readonly __illustration: "bpm" };
export type IllustrativeSpO2 = number & { readonly __illustration: "SpO2-percent" };
export type VentilatoryState =
  | "Sem restrição representada"
  | "Restrição ventilatória possível"
  | "Vias aéreas possivelmente obstruídas";

export interface EducationalVitals {
  readonly label: "Indicadores simulados — representação educativa";
  readonly heartRate: IllustrativeBpm | null;
  readonly spo2: IllustrativeSpO2 | null;
  readonly ventilation: VentilatoryState;
  readonly reading: "Ilustração de esforço" | "Leitura indisponível";
  readonly note: string;
}

export const VITAL_ASSUMPTIONS = Object.freeze({
  heartRatePresets: Object.freeze({ rest: 82, effort: 104, emergency: 118 }),
  numericBasis: "Valores de encenação de esforço; sem curva fisiológica validada.",
  spo2Basis: "Não disponível: a simulação não estima saturação periférica.",
  prognosis: "Nenhum indicador estima morte, lesão ou prazo de resgate.",
});

export function educationalVitals(
  time: number,
  depth: number,
  prevention = false,
): EducationalVitals {
  const obstructed = depth >= 1.75;
  const restricted = depth >= 1.15;
  const unavailable = depth >= 0.65;
  const preset = prevention || time < 3 ? 82 : time < 6 ? 104 : 118;
  return Object.freeze({
    label: "Indicadores simulados — representação educativa",
    heartRate: unavailable ? null : (preset as IllustrativeBpm),
    spo2: null,
    ventilation: obstructed
      ? "Vias aéreas possivelmente obstruídas"
      : restricted
        ? "Restrição ventilatória possível"
        : "Sem restrição representada",
    reading: unavailable ? "Leitura indisponível" : "Ilustração de esforço",
    note: unavailable
      ? "Sem telemetria sob aprisionamento. A emergência independe de qualquer leitura."
      : "Pulso ilustrativo de esforço. SpO₂ indisponível; não mede oxigênio nos pulmões.",
  });
}
