/** Keep existing short context keys byte-for-byte. Long descriptions use a
 * deterministic context identifier; this identifier is NOT an integrity hash.
 * File integrity remains the canonical SHA-256 verified by the upload pipeline. */
export function petDangerEvidenceItem(group: string, danger: string): string {
  const legacy = `perigo:${group}:${danger}`;
  if (legacy.length <= 120) return legacy;
  const bytes = new TextEncoder().encode(legacy);
  const mask = (1n << 64n) - 1n;
  let first = 0xcbf29ce484222325n;
  let second = 0x84222325cbf29ce4n;
  for (const value of bytes) {
    first = ((first ^ BigInt(value)) * 0x100000001b3n) & mask;
    second = ((second ^ BigInt(value)) * 0x100000001b3n) & mask;
  }
  return `perigo:v2:${first.toString(16).padStart(16, "0")}${second.toString(16).padStart(16, "0")}`;
}
