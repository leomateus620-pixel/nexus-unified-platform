import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (input: unknown) => unknown;
    const chain = {
      middleware: () => chain,
      inputValidator: (schema: { parse: (input: unknown) => unknown }) => {
        parse = (value) => schema.parse(value);
        return chain;
      },
      handler:
        (work: (input: unknown) => unknown) => async (input: { data: unknown; context: unknown }) =>
          work({ ...input, data: parse(input.data) }),
    };
    return chain;
  },
}));
import { salvarCliente } from "../src/features/clientes/clientes.functions";
const org = "a7330000-0000-4000-8000-000000000001",
  user = "a7330000-0000-4000-8000-000000000002",
  client = "a7330000-0000-4000-8000-000000000003";
const bytes = new Uint8Array(
  await readFile(new URL("../public/brands/cotrirosa.png", import.meta.url)),
);
const row = {
  id: client,
  organization_id: org,
  razao_social: "Cliente isolado",
  nome_exibicao: "Cliente",
  version: 2,
  created_at: "2026-10-31",
  updated_at: "2026-10-31",
  arquivado_em: null,
  motivo_arquivo: null,
  observacoes: null,
  cnpj: null,
  identificador_normalizado: null,
  cidade: null,
  uf: null,
  situacao: "Ativo",
};
const data = {
  organization_id: org,
  id: client,
  expected_version: 1,
  chave: "a7330000-0000-4000-8000-000000000004",
  dados: {
    razao_social: "Cliente isolado",
    nome_exibicao: "Cliente",
    cnpj: "",
    cidade: "",
    uf: "",
    observacoes: "",
  },
  marca_upload: {
    nome: "cotrirosa.png",
    mime: "image/png",
    base64: Buffer.from(bytes).toString("base64"),
    superficie: "escura",
  },
};
const calls: string[] = [];
function setup(mode: "ok" | "duplicate" | "corrupt" | "denied" = "ok") {
  const upload = vi.fn(async () => {
    calls.push("upload");
    return {
      data: null,
      error: mode === "duplicate" ? { statusCode: "409", message: "already exists" } : null,
    };
  });
  const download = vi.fn(async () => {
    calls.push("readback");
    return {
      data: new Blob([mode === "corrupt" ? new Uint8Array([1, 2, 3]) : bytes]),
      error: null,
    };
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push(name);
    if (name === "pode") return { data: mode !== "denied", error: null };
    return {
      data: { ...row, marca: (args["_dados"] as Record<string, unknown>)["marca"] ?? null },
      error: null,
    };
  });
  const db = {
    rpc,
    storage: {
      from: vi.fn(() => ({
        upload,
        download,
        createSignedUrls: vi.fn(async (paths: string[]) => ({
          data: paths.map((path) => ({
            path,
            signedUrl: `https://private.example.invalid/${path}`,
          })),
          error: null,
        })),
      })),
    },
  };
  const call = salvarCliente as unknown as (input: {
    data: unknown;
    context: { supabase: typeof db; userId: string };
  }) => Promise<typeof row & { marca: { sha256: string; caminho: string; superficie: string } }>;
  return {
    upload,
    download,
    rpc,
    call: (payload: unknown = data) =>
      call({ data: payload, context: { supabase: db, userId: user } }),
  };
}
beforeEach(() => {
  calls.length = 0;
});
describe("salvar marca pelo cadastro existente", () => {
  it("valida o readback privado antes de adotar o ativo e usa a identidade autenticada", async () => {
    const api = setup();
    const saved = await api.call();
    expect(calls).toEqual(["pode", "upload", "readback", "salvar_cliente_operacional"]);
    expect(saved.marca.sha256).toBe(
      "8acbb5f230bc5da747005f4440c8dd28d976e0b6a84ac25da2b8308d55f944b7",
    );
    expect(saved.marca.caminho).toMatch(new RegExp(`^${org}/${user}/`));
    expect(saved.marca.superficie).toBe("escura");
    expect(api.upload.mock.calls[0]?.[2]).toMatchObject({ upsert: false });
  });
  it("um caminho repetido só é adotado após conferir os bytes já armazenados", async () => {
    const api = setup("duplicate");
    await expect(api.call()).resolves.toMatchObject({ id: client });
    expect(api.download).toHaveBeenCalledOnce();
    expect(calls.at(-1)).toBe("salvar_cliente_operacional");
  });
  it("bytes divergentes não gravam a marca ou alteram a versão do cliente", async () => {
    const api = setup("corrupt");
    await expect(api.call()).rejects.toThrow("tamanho");
    expect(api.rpc.mock.calls.some(([name]) => name === "salvar_cliente_operacional")).toBe(false);
  });
  it("não envia nenhum arquivo se o papel não permite editar cadastros", async () => {
    const api = setup("denied");
    await expect(api.call()).rejects.toThrow("Sem permissão");
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.download).not.toHaveBeenCalled();
  });
  it("editar outros campos preserva a marca pela ausência da chave na RPC", async () => {
    const api = setup();
    const { marca_upload: omitted, ...plain } = data;
    await api.call(plain);
    expect(api.upload).not.toHaveBeenCalled();
    const saved = api.rpc.mock.calls.find(([name]) => name === "salvar_cliente_operacional");
    expect(saved?.[1]["_dados"]).not.toHaveProperty("marca");
  });
});
