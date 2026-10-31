import { surveyObject } from "./survey-projection";

type CapturedValue = { presente: boolean; valor?: unknown };
function readPath(data: Record<string, unknown>, path: readonly string[]): CapturedValue {
  let current: unknown = data;
  for (const key of path) {
    const object = surveyObject(current);
    if (!Object.hasOwn(object, key)) return { presente: false };
    current = object[key];
  }
  return { presente: true, valor: current };
}
export function nrLocalProposalChanges(data: Record<string, unknown>) {
  const marker = surveyObject(data["revisao_tecnica_nexus"]);
  const baselines = surveyObject(marker["valores_origem"]);
  const paths = Array.isArray(marker["campos_propostos"])
    ? marker["campos_propostos"].filter((entry): entry is string => typeof entry === "string")
    : [];
  return [...new Set(paths)].map((path) => {
    const captured = surveyObject(baselines[path]);
    const before =
      typeof captured["presente"] === "boolean" &&
      (captured["presente"] === false || Object.hasOwn(captured, "valor"))
        ? (captured as CapturedValue)
        : null;
    return { path, before, after: readPath(data, path.split(".")) };
  });
}
const canonicalValue = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonicalValue)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(surveyObject(value))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => [key, canonicalValue(entry)]),
        )
      : value;

/** A row is marked as proposed only when a captured baseline proves a change. */
export function nrLocalProposalAffects(
  data: Record<string, unknown>,
  path: readonly string[],
): boolean {
  const key = path.join(".");
  return nrLocalProposalChanges(data).some((change) => {
    if (change.path.startsWith(`${key}.`)) return true;
    if (change.path !== key && !key.startsWith(`${change.path}.`)) return false;
    if (!change.before) return true; // Older proposal markers have no before-version proof.
    const suffix = path.slice(change.path.split(".").length);
    const previous =
      suffix.length && change.before.presente
        ? readPath(surveyObject(change.before.valor), suffix)
        : change.before;
    const current = readPath(data, path);
    return (
      previous.presente !== current.presente ||
      JSON.stringify(canonicalValue(previous.valor)) !==
        JSON.stringify(canonicalValue(current.valor))
    );
  });
}

/** Editorial marker only. Authority and record version remain server controlled. */
export function patchNrLocalTechnical(
  data: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): Record<string, unknown> {
  if (!path.length || path.some((key) => ["__proto__", "constructor", "prototype"].includes(key)))
    throw new Error("Campo técnico não suportado.");
  if (["historico", "calculo", "calculo_fixo", "levantamento"].includes(path[0] ?? ""))
    throw new Error("Este registro histórico permanece preservado.");
  function merge(current: Record<string, unknown>, depth: number): Record<string, unknown> {
    const key = path[depth]!;
    if (depth === path.length - 1) return { ...current, [key]: value };
    const previous = current[key];
    if (previous != null && (typeof previous !== "object" || Array.isArray(previous)))
      throw new Error("A estrutura histórica deste grupo precisa ser conciliada antes de editar.");
    return { ...current, [key]: merge(surveyObject(previous), depth + 1) };
  }
  const next = merge(data, 0);
  const marker = surveyObject(data["revisao_tecnica_nexus"]);
  const previousPaths = Array.isArray(marker["campos_propostos"])
    ? marker["campos_propostos"].filter((entry): entry is string => typeof entry === "string")
    : [];
  const key = path.join(".");
  const baselines = surveyObject(marker["valores_origem"]);
  // Capture once before the first proposed edit. An older marker without a
  // baseline cannot be backfilled from an already edited value.
  const capture = !previousPaths.includes(key) && !Object.hasOwn(baselines, key);
  const values = capture
    ? { ...baselines, [key]: structuredClone(readPath(data, path)) }
    : baselines;
  return {
    ...next,
    revisao_tecnica_nexus: {
      ...marker,
      estado: "proposta",
      campos_propostos: [...new Set([...previousPaths, key])],
      valores_origem: values,
    },
  };
}
