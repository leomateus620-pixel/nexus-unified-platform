import assert from "node:assert/strict";
import { test, vi } from "vitest";
import {
  gerarDerivadosInspecoes,
  lerArquivoLimitado,
} from "../src/features/inspecoes/arquivo-derivados.server";
import { fixtures } from "./fixtures/nr-image-worker";

const origin = "https://yhtgijtllvgzoqtfcgal.supabase.co";
const path =
  "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/original.jpg";
const foto = {
  caminho: path,
  mime: "image/jpeg",
  miniatura_caminho: null,
  previa_caminho: null,
};
const webp = (bytes: Uint8Array<ArrayBuffer>) =>
  new Response(bytes, { headers: { "content-type": "image/webp" } });

test("gera as duas variantes em Storage privado sem ampliação e relê o WebP antes de vinculá-lo", async () => {
  vi.stubEnv("SUPABASE_URL", origin);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_inspecoes-test-only");
  const requests: URL[] = [];
  vi.stubGlobal("fetch", (input: string, options: RequestInit) => {
    const url = new URL(input);
    assert.equal(url.origin, origin);
    assert.equal(options.redirect, "error");
    requests.push(url);
    if (url.pathname.includes("/render/image/authenticated/")) {
      assert.equal(url.searchParams.get("width"), "100");
      assert.equal(url.searchParams.get("height"), "100");
      assert.equal(url.searchParams.get("resize"), "contain");
      return webp(fixtures.smallPreview);
    }
    if (options.method === "POST") {
      assert.equal(new Headers(options.headers).get("x-upsert"), "false");
      return new Response("", { status: 409 });
    }
    assert.match(url.pathname, /^\/storage\/v1\/object\/authenticated\//);
    return webp(fixtures.smallPreview);
  });
  try {
    const variants = await gerarDerivadosInspecoes(foto, fixtures.small);
    assert.deepEqual(Object.keys(variants), ["miniatura_384", "previa_768"]);
    assert.equal(requests.length, 6);
    assert.match(variants.miniatura_384!.caminho, /\/miniatura_384\.webp$/);
    assert.equal(variants.previa_768!.sha256, variants.miniatura_384!.sha256);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

test("confirma o derivado faltante e rejeita orientação, destino e releitura divergentes", async () => {
  vi.stubEnv("SUPABASE_URL", origin);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "inspecoes-test-only");
  let mode = "wrong";
  const requests: URL[] = [];
  vi.stubGlobal("fetch", (input: string, options: RequestInit) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname.includes("/render/image/authenticated/"))
      return webp(mode === "wrong" ? fixtures.wrongExif : fixtures.exifPreview);
    if (options.method === "POST") return new Response("", { status: 201 });
    return webp(fixtures.wrongExif);
  });
  try {
    const retry = {
      ...foto,
      miniatura_caminho: path.replace("original.jpg", "miniatura_384.webp"),
    };
    assert.deepEqual(await gerarDerivadosInspecoes(retry, fixtures.exif), {});
    assert.equal(requests.length, 1);
    mode = "right";
    assert.deepEqual(await gerarDerivadosInspecoes(retry, fixtures.exif), {});
    assert.equal(requests.length, 4);
    assert.deepEqual(
      await gerarDerivadosInspecoes({ ...foto, caminho: "../outra.jpg" }, fixtures.small),
      {},
    );
    vi.stubEnv("SUPABASE_URL", "https://outside.test");
    assert.deepEqual(await gerarDerivadosInspecoes(foto, fixtures.small), {});
    assert.equal(requests.length, 4);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

test("o retorno do Storage não pode ultrapassar os bytes reservados", async () => {
  const response = new Response(Uint8Array.of(1, 2, 3));
  await assert.rejects(lerArquivoLimitado(response.body, 2), /tamanho esperado/);
  const shorter = new Response(Uint8Array.of(1, 2));
  assert.deepEqual(await lerArquivoLimitado(shorter.body, 3), Uint8Array.of(1, 2));
});
