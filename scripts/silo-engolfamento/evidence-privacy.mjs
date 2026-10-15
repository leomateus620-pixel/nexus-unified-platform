import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** Keep timing/count evidence while removing machine-specific injected URLs. */
export function evidenceReplacer(_key, value) {
  return typeof value === "string"
    ? value.replace(/https?:\/\/[^/\s"'<>]*kaspersky-labs\.com\/[^\s"'<>]*/gi, (url) => {
        try {
          return `${new URL(url).origin}/[system-injected]`;
        } catch {
          return "[system-injected]";
        }
      })
    : value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const file of process.argv.slice(2)) {
    const report = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, `${JSON.stringify(report, evidenceReplacer, 2)}\n`);
    console.log(`Sanitized evidence: ${file}`);
  }
}
