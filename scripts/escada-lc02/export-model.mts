import { writeFile, mkdir } from "node:fs/promises";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { createLC02Model } from "../../src/escada/lc02-model.ts";

// GLTFExporter uses the browser FileReader API; Blob is native in Node.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((value) => {
      this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`;
      this.onloadend?.();
    });
  }
}
Object.defineProperty(globalThis, "FileReader", { value: NodeFileReader, configurable: true });
const model = createLC02Model();
try {
  const output = await new GLTFExporter().parseAsync(model.root, { binary: true });
  if (!(output instanceof ArrayBuffer)) throw new Error("Expected binary GLB");
  await mkdir("public/models/escada-lc02", { recursive: true });
  await writeFile("public/models/escada-lc02/escada-lc02.glb", Buffer.from(output));
  console.log(`Exported LC-02: ${output.byteLength} bytes, metres, six semantic groups.`);
} finally {
  model.dispose();
}
