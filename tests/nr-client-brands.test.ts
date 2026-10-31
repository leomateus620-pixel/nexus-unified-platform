import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assinarMarcas } from "../src/features/clientes/marca.server";
import { dimensoesMarca, marcaImagem } from "../src/features/clientes/marca";
import { sha256Nr, validarBinarioNr } from "../src/features/nr/files";

const official = {
  caminho: "/brands/cotrirosa.png",
  origem: "https://cdn.siterapido.rs/wp-content/uploads/sites/210/2023/11/cotrirosa-logo.png",
  sha256: "8acbb5f230bc5da747005f4440c8dd28d976e0b6a84ac25da2b8308d55f944b7",
  mime: "image/png" as const,
  largura: 211,
  altura: 40,
  tamanho: 8349,
};

describe("marcas canônicas de clientes", () => {
  it("preserva o PNG oficial e verifica MIME, SHA e dimensões sem recomprimir", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("../public/brands/cotrirosa.png", import.meta.url)),
    );
    expect(await sha256Nr(bytes)).toBe(official.sha256);
    await expect(
      validarBinarioNr(bytes, { nome: "cotrirosa.png", ...official }),
    ).resolves.toMatchObject({ mime: "image/png", tamanho: 8349 });
    expect(dimensoesMarca(bytes, "image/png")).toEqual({ largura: 211, altura: 40 });
  });
  it("recusa dimensões vazias ou excessivas antes de enviar o objeto", () => {
    expect(() => dimensoesMarca(new Uint8Array(), "image/png")).toThrow("dimensões");
    const bytes = new Uint8Array(24);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 8193);
    view.setUint32(20, 200);
    expect(() => dimensoesMarca(bytes, "image/png")).toThrow("8192");
  });
  it("assina em lote, deduplica mídia entre ocorrências e mantém logos oficiais locais", async () => {
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({
        path,
        signedUrl: `https://storage.example.invalid/${path}`,
        error: null,
      })),
    }));
    const db = {
      storage: { from: vi.fn(() => ({ createSignedUrls })) },
    } as unknown as SupabaseClient;
    const custom = { ...official, caminho: "org/user/hash.png" };
    const result = await assinarMarcas(db, [
      { id: "a", marca: custom },
      { id: "b", marca: official },
      { id: "c", marca: custom },
      { id: "d", marca: null },
    ]);
    expect(createSignedUrls).toHaveBeenCalledExactlyOnceWith([custom.caminho], 3600);
    expect(result.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
    expect(marcaImagem(result[0]!.marca)).toBe(`https://storage.example.invalid/${custom.caminho}`);
    expect(marcaImagem(result[1]!.marca)).toBe("/brands/cotrirosa.png");
    expect(result[3]!.marca).toBeNull();
  });
  it("falha de assinatura preserva nome e ID e permite fallback sem hotlink", async () => {
    const db = {
      storage: {
        from: () => ({
          createSignedUrls: async () => ({ data: null, error: { message: "unavailable" } }),
        }),
      },
    } as unknown as SupabaseClient;
    const result = await assinarMarcas(db, [
      {
        id: "canonical",
        nome: "Cliente sem prévia",
        marca: { ...official, caminho: "org/user/hash.png" },
      },
    ]);
    expect(result[0]).toMatchObject({ id: "canonical", nome: "Cliente sem prévia" });
    expect(marcaImagem(result[0]!.marca)).toBeUndefined();
  });
  it("uma falha de rede ao assinar não transforma a marca em dependência da seleção", async () => {
    const db = {
      storage: {
        from: () => ({
          createSignedUrls: async () => {
            throw new Error("offline");
          },
        }),
      },
    } as unknown as SupabaseClient;
    const result = await assinarMarcas(db, [
      { id: "canonical", nome: "Cliente", marca: { ...official, caminho: "org/user/hash.png" } },
    ]);
    expect(result[0]?.nome).toBe("Cliente");
    expect(marcaImagem(result[0]!.marca)).toBeUndefined();
  });
});
