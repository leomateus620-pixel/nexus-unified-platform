/** Read-only privacy/integrity audit. Original evidence is never rewritten.
 * This report contains counts, hashes and project-relative filenames only.
 * node scripts/silo-engolfamento/audit-evidence-privacy.mjs */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { evidenceReplacer } from "./evidence-privacy.mjs";

const output = "docs/silo-engolfamento/evidence/upgrade/evidence-privacy-audit.json";
const roots = ["docs/silo-engolfamento/evidence", "public/models/silo-engolfamento"];
const workspace = path.resolve(".").replaceAll("\\", "/").toLowerCase();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const files = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await visit(file);
    else if (/\.(json|cpuprofile)$/i.test(entry.name) && file !== output) files.push(file);
  }
}
for (const root of roots) await visit(root);
files.sort();
const sensitiveKey =
  /^(?:authorization|proxyauthorization|cookie|setcookie|password|passphrase|apikey|accesskey|accesstoken|refreshtoken|idtoken|servicerolekey|clientsecret|privatekey|authtoken|bearertoken|token)$/i;
const credentialPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16})\b/g,
];
const totals = {
  parseErrors: 0,
  unsanitizedSystemUrls: 0,
  sensitiveQueryParameters: 0,
  credentialFields: 0,
  credentialLikeStrings: 0,
  externalHostPaths: 0,
};
const results = [];
for (const file of files) {
  const bytes = await readFile(file);
  let data;
  try {
    data = JSON.parse(bytes.toString("utf8"));
  } catch {
    totals.parseErrors++;
    results.push({ file, parseError: true, bytes: bytes.length, sha256: hash(bytes) });
    continue;
  }
  const findings = {
    unsanitizedSystemUrls: 0,
    sensitiveQueryParameters: 0,
    credentialFields: 0,
    credentialLikeStrings: 0,
    externalHostPaths: 0,
  };
  const numbers = [],
    normalizedNumbers = [];
  let strings = 0;
  function walk(value, numericOutput, scan = false, key = "") {
    if (typeof value === "number") numericOutput.push(value);
    else if (typeof value === "string") {
      if (!scan) return;
      strings++;
      if (sensitiveKey.test(key.replaceAll(/[^a-z0-9]/gi, "")) && value.trim())
        findings.credentialFields++;
      for (const pattern of credentialPatterns)
        findings.credentialLikeStrings += [...value.matchAll(pattern)].length;
      for (const match of value.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
        if (evidenceReplacer("", match[0]) !== match[0]) findings.unsanitizedSystemUrls++;
        try {
          const url = new URL(match[0]);
          for (const [name, parameter] of url.searchParams) {
            const normal = name.replaceAll(/[^a-z0-9]/gi, "");
            if (parameter && sensitiveKey.test(normal)) findings.sensitiveQueryParameters++;
            else if (/^(?:session|sessionid)$/i.test(normal) && parameter.length >= 16)
              findings.sensitiveQueryParameters++;
            else if (
              /^code$/i.test(normal) &&
              /auth|oauth|callback/i.test(url.pathname) &&
              parameter.length >= 16
            )
              findings.sensitiveQueryParameters++;
          }
        } catch {
          // Non-URL prose is not exposed, and is covered by credential patterns.
        }
      }
      for (const match of value.matchAll(/(?:file:\/\/\/|(?<![a-z0-9]))[a-z]:[\\/][^\r\n"<>]*/gi)) {
        let candidate = match[0].replace(/^file:\/\/\//i, "");
        try {
          candidate = decodeURIComponent(candidate);
        } catch {
          // Treat malformed escaping as a plain path without displaying it.
        }
        const normalized = candidate.replaceAll("\\", "/").toLowerCase();
        if (!(normalized === workspace || normalized.startsWith(`${workspace}/`)))
          findings.externalHostPaths++;
      }
    } else if (Array.isArray(value)) value.forEach((item) => walk(item, numericOutput, scan));
    else if (value && typeof value === "object")
      Object.entries(value).forEach(([name, item]) => {
        if (scan) walk(name, numericOutput, true);
        walk(item, numericOutput, scan, name);
      });
  }
  walk(data, numbers, true);
  const normalized = JSON.parse(JSON.stringify(data, evidenceReplacer));
  walk(normalized, normalizedNumbers);
  const numericDigest = hash(JSON.stringify(numbers)),
    normalizedNumericDigest = hash(JSON.stringify(normalizedNumbers));
  for (const [name, count] of Object.entries(findings)) totals[name] += count;
  results.push({
    file,
    type: file.endsWith(".cpuprofile") ? "cpuprofile" : "json",
    bytes: bytes.length,
    sha256: hash(bytes),
    numericValues: numbers.length,
    stringValues: strings,
    numericDigest,
    normalizedNumericDigest,
    numericConsistency: numericDigest === normalizedNumericDigest,
    normalizationWouldChangeContent: JSON.stringify(data) !== JSON.stringify(normalized),
    findings,
  });
}
const report = {
  schema: "nexus-silo-evidence-privacy/1.0.0",
  auditedAt: new Date().toISOString(),
  policy:
    "Read-only audit using evidence-privacy.mjs; no raw URLs, tokens or external host paths in this report. Original evidence is preserved.",
  roots,
  excluded: [output],
  fileCount: results.length,
  jsonCount: results.filter((result) => result.type === "json").length,
  cpuProfileCount: results.filter((result) => result.type === "cpuprofile").length,
  numericValues: results.reduce((sum, result) => sum + (result.numericValues ?? 0), 0),
  numericConsistency: results.every((result) => result.numericConsistency),
  filesRequiringNormalization: results.filter((result) => result.normalizationWouldChangeContent)
    .length,
  totals,
  results,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    report: output,
    files: report.fileCount,
    json: report.jsonCount,
    cpuProfiles: report.cpuProfileCount,
    numericValues: report.numericValues,
    numericConsistency: report.numericConsistency,
    filesRequiringNormalization: report.filesRequiringNormalization,
    findings: totals,
    filesWithFindings: results
      .filter((result) => result.parseError || Object.values(result.findings).some(Boolean))
      .map((result) => ({
        file: result.file,
        findings: result.findings,
        parseError: result.parseError ?? false,
      })),
  }),
);
if (Object.values(totals).some(Boolean) || !report.numericConsistency) process.exitCode = 1;
