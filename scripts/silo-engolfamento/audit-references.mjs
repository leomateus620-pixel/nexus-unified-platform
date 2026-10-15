import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Pinned source inspection, not runtime imports. Full external source is not redistributed.
const references = [
  {
    repository: "ThatOpen/engine_components",
    revision: "9b38c8768cc8b0eadc633591f7639ecbce664ada",
    files: ["README.md", "CONTRIBUTING.md", "LICENSE.md"],
    terms: ["Components", "Fragments", "render"],
  },
  {
    repository: "yomotsu/camera-controls",
    revision: "c51601107e266097edf6a9caa57bfa9eaa77427c",
    files: ["readme.md", "package.json", "LICENSE"],
    terms: ["fitToBox", "setFocalOffset", "controlstart", "stop()", "update"],
  },
  {
    repository: "gkjohnson/three-mesh-bvh",
    revision: "b0935a7ec5904d2c009880be8da843b2637f185d",
    files: ["README.md", "package.json", "LICENSE"],
    terms: ["firstHitOnly", "refit", "worker", "Skinned"],
  },
  {
    repository: "donmccurdy/glTF-Transform",
    revision: "3797aad585021e68cf5fbf3f2fba37783596ffac",
    files: [
      "README.md",
      "packages/functions/src/dedup.ts",
      "packages/functions/src/join.ts",
      "LICENSE.md",
    ],
    terms: ["dedup", "join", "mesh", "texture"],
  },
  {
    repository: "donmccurdy/three-gltf-viewer",
    revision: "b5ee5dafe27f953ae1b55f42b5fa3697fef08683",
    files: ["README.md", "src/viewer.js", "LICENSE"],
    terms: [
      "PMREMGenerator",
      "KTX2Loader",
      "MeshoptDecoder",
      "SkeletonHelper",
      "ACESFilmicToneMapping",
    ],
  },
];
const results = await Promise.all(
  references.map(async (reference) => {
    const files = await Promise.all(
      reference.files.map(async (path) => {
        const url = `https://raw.githubusercontent.com/${reference.repository}/${reference.revision}/${path}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        const source = await response.text();
        const license = path.startsWith("LICENSE");
        return {
          path,
          url,
          bytes: Buffer.byteLength(source),
          sha256: createHash("sha256").update(source).digest("hex"),
          license: license
            ? /MIT License|Permission is hereby granted/.test(source)
              ? "MIT"
              : "inspect"
            : undefined,
          terms: reference.terms.filter((term) =>
            source.toLowerCase().includes(term.toLowerCase()),
          ),
          ...(path === "package.json"
            ? {
                version: JSON.parse(source).version,
                peerDependencies: JSON.parse(source).peerDependencies,
              }
            : {}),
        };
      }),
    );
    return { ...reference, files };
  }),
);
const localPackages = await Promise.all(
  [
    "three",
    "camera-controls",
    "three-mesh-bvh",
    "@gltf-transform/core",
    "@gltf-transform/functions",
  ].map(async (name) => {
    const packageJson = JSON.parse(await readFile(`node_modules/${name}/package.json`, "utf8"));
    return {
      name,
      version: packageJson.version,
      license: packageJson.license,
      peerDependencies: packageJson.peerDependencies,
    };
  }),
);
await mkdir("docs/silo-engolfamento/evidence/upgrade", { recursive: true });
await writeFile(
  "docs/silo-engolfamento/evidence/upgrade/reference-audit.json",
  `${JSON.stringify({ inspectedAt: new Date().toISOString(), references: results, localPackages }, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    results.map(({ repository, revision, files }) => ({
      repository,
      revision,
      licenses: files.filter((file) => file.license).map((file) => file.license),
      terms: [...new Set(files.flatMap((file) => file.terms))],
    })),
    null,
    2,
  ),
);
