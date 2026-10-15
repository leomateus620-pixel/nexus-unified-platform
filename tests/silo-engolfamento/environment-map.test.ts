import assert from "node:assert/strict";
import test from "node:test";
import * as T from "three";
import {
  ENVIRONMENT_MAP_URL,
  loadEnvironmentMap,
} from "../../src/silo-engolfamento/EnvironmentMap";

test("baked environment preserves linear CubeUV upload and CPU bitmap across GPU release", async () => {
  const fetch = globalThis.fetch,
    decode = globalThis.createImageBitmap;
  let imageClosed = 0;
  const image = { width: 768, height: 1024, close: () => imageClosed++ } as ImageBitmap;
  const controller = new AbortController();
  let receivedOptions: ImageBitmapOptions | undefined;
  globalThis.fetch = async (input, options) => {
    assert.equal(input, ENVIRONMENT_MAP_URL);
    assert.equal(options?.signal, controller.signal);
    return new Response(new Uint8Array([1]), { status: 200 });
  };
  globalThis.createImageBitmap = (async (
    _source: ImageBitmapSource,
    options?: ImageBitmapOptions,
  ) => {
    receivedOptions = options;
    return image;
  }) as typeof createImageBitmap;
  try {
    const resource = await loadEnvironmentMap(controller.signal);
    assert.deepEqual(receivedOptions, {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
      imageOrientation: "none",
    });
    assert.equal(resource.texture.mapping, T.CubeUVReflectionMapping);
    assert.equal(resource.texture.colorSpace, T.LinearSRGBColorSpace);
    assert.equal(resource.texture.flipY, false);
    assert.equal(resource.texture.generateMipmaps, false);
    assert.equal(resource.texture.minFilter, T.LinearFilter);
    assert.equal(resource.texture.magFilter, T.LinearFilter);
    let gpuReleases = 0;
    resource.texture.addEventListener("dispose", () => gpuReleases++);
    resource.texture.dispose();
    assert.equal(imageClosed, 0, "context release must retain the decoded CPU image");
    resource.texture.needsUpdate = true;
    resource.dispose();
    resource.dispose();
    assert.equal(imageClosed, 1, "only the final owner closes the bitmap once");
    assert.equal(gpuReleases, 2);
  } finally {
    globalThis.fetch = fetch;
    if (decode) globalThis.createImageBitmap = decode;
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
  }
});

test("environment rejects HTTP, invalid images and cancellation without leaking a late bitmap", async () => {
  const fetch = globalThis.fetch,
    decode = globalThis.createImageBitmap;
  let closed = 0,
    decoded = 0;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  globalThis.createImageBitmap = (async () => {
    decoded++;
    return { width: 3, height: 4, close: () => closed++ } as ImageBitmap;
  }) as typeof createImageBitmap;
  try {
    await assert.rejects(loadEnvironmentMap(), /HTTP 404/);
    assert.equal(decoded, 0);
    globalThis.fetch = async () => new Response(new Uint8Array([1]), { status: 200 });
    await assert.rejects(loadEnvironmentMap(), /dimensões/);
    assert.equal(closed, 1);
    const controller = new AbortController();
    globalThis.createImageBitmap = (async () => {
      controller.abort();
      return { width: 768, height: 1024, close: () => closed++ } as ImageBitmap;
    }) as typeof createImageBitmap;
    await assert.rejects(loadEnvironmentMap(controller.signal), { name: "AbortError" });
    assert.equal(closed, 2, "non-abortable late decode is still released");
    globalThis.createImageBitmap = (async () => {
      throw new Error("image decode failed");
    }) as typeof createImageBitmap;
    await assert.rejects(loadEnvironmentMap(), /não foi possível decodificar/);
    const aborted = new AbortController();
    aborted.abort();
    globalThis.fetch = async () => {
      throw new Error("aborted requests must not fetch");
    };
    await assert.rejects(loadEnvironmentMap(aborted.signal), { name: "AbortError" });
  } finally {
    globalThis.fetch = fetch;
    if (decode) globalThis.createImageBitmap = decode;
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
  }
});
