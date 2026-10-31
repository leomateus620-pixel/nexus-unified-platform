import { afterEach, expect, test, vi } from "vitest";
import { handleNrImageWorker } from "../src/features/nr/image-worker/handler.server";

const url = "https://yhtgijtllvgzoqtfcgal.supabase.co";
const ticket = "b".repeat(64); // Synthetic, never sent outside this isolated test.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("the technical callback rejects missing tickets and methods before reading private bindings", async () => {
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  const denied = await handleNrImageWorker(
    new Request("https://nexusgestao.app/api/public/nr/image-worker", { method: "POST" }),
  );
  expect(denied.status).toBe(403);
  expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  expect(
    (await handleNrImageWorker(new Request("https://nexusgestao.app/api/public/nr/image-worker")))
      .status,
  ).toBe(405);
  expect(transport).not.toHaveBeenCalled();
});

test("missing private runtime configuration is explicit and cannot consume a ticket", async () => {
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  const response = await handleNrImageWorker(
    new Request("https://nexusgestao.app/api/public/nr/image-worker", {
      method: "POST",
      headers: { "X-Nexus-Job-Token": ticket },
    }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "integracao_nao_configurada" });
  expect(transport).not.toHaveBeenCalled();
});

test("the handler reads private bindings at request time and delegates only a fixed one-job claim", async () => {
  vi.stubEnv("SUPABASE_URL", url);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test-only");
  const calls: { url: string; data: unknown; headers: Headers }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, options: RequestInit) => {
      calls.push({
        url: input,
        data: JSON.parse(options.body as string),
        headers: new Headers(options.headers),
      });
      return Response.json(input.endsWith("nr_imagem_worker_validar") ? true : []);
    }),
  );
  const response = await handleNrImageWorker(
    new Request("https://nexusgestao.app/api/public/nr/image-worker", {
      method: "POST",
      headers: { "X-Nexus-Job-Token": ticket },
      body: JSON.stringify({ organization_id: "ignored", path: "https://other.test", limit: 99 }),
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).processed).toBe(0);
  expect(calls.map((call) => call.url)).toEqual([
    `${url}/rest/v1/rpc/nr_imagem_worker_validar`,
    `${url}/rest/v1/rpc/nr_imagem_trabalho_obter`,
  ]);
  expect(calls[1]!.data).toEqual({ p_limite: 1, p_processador: "nexus-storage-transform-v1" });
  expect(calls[0]!.headers.get("apikey")).toBe("sb_secret_test-only");
  expect(calls[0]!.headers.get("authorization")).toBeNull();
});
