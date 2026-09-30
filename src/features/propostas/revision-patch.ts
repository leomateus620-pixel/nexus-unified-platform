type Snapshot = { version: number; values: Record<string, unknown> };
type RevisionWriter = {
  read: () => Promise<Snapshot>;
  write: (expectedVersion: number, values: Record<string, unknown>) => Promise<number | null>;
};

/** Only effective edits are merged. Concurrent changes to other fields survive. */
export async function applyRevisionPatch(
  writer: RevisionWriter,
  baseline: Snapshot,
  values: Record<string, unknown>,
  normalize: (field: string, value: unknown) => unknown = (_field, value) => value,
) {
  const changes = Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => !Object.is(normalize(key, value), normalize(key, baseline.values[key])),
    ),
  );
  if (!Object.keys(changes).length) return baseline;
  const matches = (server: Snapshot, expected: Record<string, unknown>) =>
    Object.keys(changes).every((key) =>
      Object.is(normalize(key, server.values[key]), normalize(key, expected[key])),
    );
  const current = await writer.read();
  if (matches(current, changes)) return current;
  if (!matches(current, baseline.values))
    throw new Error(
      "Conflito na revisão: outro editor alterou o mesmo campo. Edição local preservada.",
    );
  const desired = { ...current.values, ...changes };
  let transportError: unknown;
  try {
    const version = await writer.write(current.version, desired);
    if (version !== null) return { version, values: desired };
  } catch (cause) {
    transportError = cause;
  }
  const server = await writer.read();
  // A successful write followed by a lost HTTP response is already persisted, not a conflict.
  if (matches(server, changes)) return server;
  if (!matches(server, baseline.values))
    throw new Error(
      "Conflito na revisão: outro editor alterou o mesmo campo. Edição local preservada.",
    );
  if (transportError) throw transportError;
  const merged = { ...server.values, ...changes };
  const version = await writer.write(server.version, merged);
  if (version === null)
    throw new Error("Conflito na revisão durante a gravação. Edição local preservada.");
  return { version, values: merged };
}
