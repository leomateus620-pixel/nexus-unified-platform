import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { preparePdfAssets } from "./prepare-assets.mjs";
async function fixture(run) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "nexus-pe-library-test-"));
  const pkg = path.join(temp, "package");
  const output = path.join(temp, "public", "pdfjs", "6.4.299");
  try {
    await mkdir(pkg);
    await writeFile(
      path.join(pkg, "package.json"),
      JSON.stringify({ name: "pdfjs-dist", version: "6.4.299" }),
    );
    await writeFile(path.join(pkg, "LICENSE"), "Local library license fixture");
    for (const folder of ["cmaps", "wasm", "iccs", "standard_fonts"]) {
      await mkdir(path.join(pkg, folder));
      await writeFile(
        path.join(pkg, folder, "asset.fixture"),
        `Synthetic library resource ${folder}`,
      );
    }
    await writeFile(
      path.join(pkg, "wasm", "quickjs-eval.js"),
      "Must not be published by this reader",
    );
    await run({ pkg, output, temp });
  } finally {
    const absolute = path.resolve(temp);
    const allowed = path.resolve(os.tmpdir()) + path.sep;
    assert(
      absolute.startsWith(allowed) && path.basename(absolute).startsWith("nexus-pe-library-test-"),
    );
    await rm(absolute, { recursive: true, force: true });
  }
}
test("resources repeat deterministically and do not publish the scripting sandbox or touch other public files", () =>
  fixture(async ({ pkg, output, temp }) => {
    const sibling = path.join(temp, "public", "preserved-3d.fixture");
    await mkdir(path.dirname(sibling), { recursive: true });
    await writeFile(sibling, "Existing asset");
    const first = await preparePdfAssets(pkg, output);
    const manifest = await readFile(path.join(output, "nexus-assets.json"), "utf8");
    assert.deepEqual(await preparePdfAssets(pkg, output), first);
    assert.equal(await readFile(path.join(output, "nexus-assets.json"), "utf8"), manifest);
    assert.equal(await readFile(sibling, "utf8"), "Existing asset");
    assert.equal(first.files, 5);
    await assert.rejects(readFile(path.join(output, "wasm", "quickjs-eval.js")), {
      code: "ENOENT",
    });
  }));
test("wrong package version is rejected before publishing resources", () =>
  fixture(async ({ pkg, output }) => {
    await writeFile(
      path.join(pkg, "package.json"),
      JSON.stringify({ name: "pdfjs-dist", version: "0.0.0" }),
    );
    await assert.rejects(preparePdfAssets(pkg, output), /6\.4\.299 exata/);
    await assert.rejects(readFile(path.join(output, "LICENSE")), { code: "ENOENT" });
  }));
test("a versioned resource is never overwritten when its bytes diverge", () =>
  fixture(async ({ pkg, output }) => {
    await preparePdfAssets(pkg, output);
    await writeFile(path.join(output, "cmaps", "asset.fixture"), "Preserve this existing file");
    await assert.rejects(preparePdfAssets(pkg, output), /Não foi sobrescrito/);
    assert.equal(
      await readFile(path.join(output, "cmaps", "asset.fixture"), "utf8"),
      "Preserve this existing file",
    );
  }));
