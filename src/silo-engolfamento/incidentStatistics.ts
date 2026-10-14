/** Documented evidence, never populated from the simulation or Nexus records. */
export const INCIDENT_DATASET_VERSION = "purdue-yearly-snapshots-2022-2025-v1";

export interface DocumentedGrainCases {
  readonly year: number;
  readonly total: number;
  readonly fatal: number;
  readonly nonFatal: number;
  readonly sourceId: string;
  readonly evidence: string;
}

export const INCIDENT_STATISTICS: readonly DocumentedGrainCases[] = Object.freeze([
  Object.freeze({
    year: 2022,
    total: 42,
    fatal: 15,
    nonFatal: 27,
    sourceId: "purdue-2022",
    evidence: "pp. 8–9: total 42 e 35,7% fatais; figura 6 do relatório 2024 confirma 15/27",
  }),
  Object.freeze({
    year: 2023,
    total: 27,
    fatal: 16,
    nonFatal: 11,
    sourceId: "purdue-2023",
    evidence: "pp. 8–9: total 27 e 59,3% fatais; figura 6 do relatório 2024 confirma 16/11",
  }),
  Object.freeze({
    year: 2024,
    total: 34,
    fatal: 14,
    nonFatal: 20,
    sourceId: "purdue-2024",
    evidence: "pp. 8–9: total 34 e 41,2% fatais; figura 6 confirma 14/20",
  }),
  Object.freeze({
    year: 2025,
    total: 21,
    fatal: 6,
    nonFatal: 15,
    sourceId: "purdue-2025",
    evidence: "pp. 5 e 7–8: total 21 e 28,6% fatais; arredondamento inteiro corresponde a 6/15",
  }),
]);

export const INCIDENT_TOTALS = Object.freeze(
  INCIDENT_STATISTICS.reduce(
    (total, row) => ({
      total: total.total + row.total,
      fatal: total.fatal + row.fatal,
      nonFatal: total.nonFatal + row.nonFatal,
    }),
    { total: 0, fatal: 0, nonFatal: 0 },
  ),
);

export const INCIDENT_SCOPE = Object.freeze({
  territory: "Estados Unidos",
  period: "2022–2025",
  mechanism: "Aprisionamento/engolfamento em grãos — grain entrapments, conforme os relatórios",
  unit: "Casos documentados: a fonte define caso como uma vítima individual; uma ocorrência pode envolver várias vítimas.",
  limitations:
    "Grãos em geral, instalações e transportes abrangidos pelos relatórios. Sem recorte exclusivo de soja ou silos elevados. Não é estimativa mundial nem série brasileira.",
  ascertainment:
    "A vigilância não captura todos os casos, especialmente os não fatais. Relatórios posteriores podem revisar o histórico. O total é a soma destas versões anuais, sem afirmar deduplicação de pessoas entre anos.",
  brazil:
    "Série brasileira específica e comparável não incorporada. Notícias isoladas não sustentam uma contagem nacional.",
});

export interface HypotheticalPreventionResult {
  readonly percent: number;
  readonly proportion: number;
  readonly documentedFatalCases: number;
  readonly exactCases: number;
  readonly roundedCases: number;
}

/** A user-chosen arithmetic hypothesis, not observed efficacy or prediction. */
export function calculateHypotheticalPrevention(
  percent: number,
): HypotheticalPreventionResult | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  const proportion = percent / 100;
  const exactCases = INCIDENT_TOTALS.fatal * proportion;
  return Object.freeze({
    percent,
    proportion,
    documentedFatalCases: INCIDENT_TOTALS.fatal,
    exactCases,
    roundedCases: Math.round(exactCases),
  });
}

export function parseHypotheticalPercent(input: string): number | null {
  const trimmed = input.trim();
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(trimmed)) return null;
  const percent = Number(trimmed.replace(",", "."));
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null;
}
