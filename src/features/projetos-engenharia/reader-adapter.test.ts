import { describe, expect, it, vi } from "vitest";
import { LeituraPeAccessError, LeituraPeError } from "./leitor/domain";
import type { PeArquivo } from "./pe-arquivos.functions";
import { createPeReaderAdapter, validateSignedOriginalUrl } from "./reader-adapter";

// Isolated metadata only: these values are never inserted into the operational database.
const file: PeArquivo = {
  id: "00112233-0000-4000-8000-001122334455",
  organization_id: "00112233-0000-4000-8000-001122334456",
  projeto_id: "00112233-0000-4000-8000-001122334457",
  versao_id: "00112233-0000-4000-8000-001122334458",
  nome: "Original.pdf",
  mime: "application/pdf",
  tamanho: 123,
  sha256: "a".repeat(64),
  caminho: "00112233/pe/001122334458/original",
  estado: "vinculado",
  created_by: "00112233-0000-4000-8000-001122334459",
  created_at: "2026-10-22T13:00:00Z",
  confirmado_em: "2026-10-22T13:01:00Z",
};
const base = "https://project.example.test";
const signed = `${base}/storage/v1/object/sign/nexus-operacional/${file.caminho}?token=private-test-token&download=Original.pdf`;
const signal = () => new AbortController().signal;
function setup(
  overrides: {
    obter?: (signal: AbortSignal) => Promise<PeArquivo>;
    baixar?: (signal: AbortSignal) => Promise<{ url: string }>;
  } = {},
) {
  const obter = vi.fn(overrides.obter ?? (async () => ({ ...file })));
  const baixar = vi.fn(overrides.baixar ?? (async () => ({ url: signed })));
  const adapter = createPeReaderAdapter({ expected: file, storageBaseUrl: base, obter, baixar });
  return { adapter, obter, baixar };
}

describe("private original reader authorization", () => {
  it("checks the file by id again each time, including both sides of signing", async () => {
    const events: string[] = [];
    const { adapter } = setup({
      obter: async () => {
        events.push("current");
        return { ...file };
      },
      baixar: async () => {
        events.push("signed");
        return { url: signed };
      },
    });
    await adapter.checkAccess(signal());
    expect(await adapter.fetchAuthorized(signal())).toEqual({ url: signed });
    await adapter.checkAccess(signal());
    expect(events).toEqual(["current", "current", "signed", "current", "current"]);
  });

  it.each([
    ["id", "another-file"],
    ["organization_id", "another-organization"],
    ["projeto_id", "another-project"],
    ["versao_id", "another-version"],
    ["sha256", "b".repeat(64)],
    ["tamanho", 124],
    ["mime", "image/png"],
    ["caminho", "another/path"],
    ["estado", "pendente"],
  ] as const)("denies a changed %s before requesting a signed URL", async (key, value) => {
    const { adapter, baixar } = setup({ obter: async () => ({ ...file, [key]: value }) });
    await expect(adapter.fetchAuthorized(signal())).rejects.toBeInstanceOf(LeituraPeAccessError);
    expect(baixar).not.toHaveBeenCalled();
  });

  it("does not return an already issued URL after access is revoked during signing", async () => {
    let revoked = false;
    const { adapter } = setup({
      obter: async () => {
        if (revoked) throw { code: "42501", message: "restricted diagnostic" };
        return { ...file };
      },
      baixar: async () => {
        revoked = true;
        return { url: signed };
      },
    });
    await expect(adapter.fetchAuthorized(signal())).rejects.toBeInstanceOf(LeituraPeAccessError);
  });

  it("denies a storage path/hash change while signing instead of showing different bytes", async () => {
    let changed = false;
    const { adapter } = setup({
      obter: async () => ({ ...file, sha256: changed ? "b".repeat(64) : file.sha256 }),
      baixar: async () => {
        changed = true;
        return { url: signed };
      },
    });
    await expect(adapter.fetchAuthorized(signal())).rejects.toBeInstanceOf(LeituraPeAccessError);
  });

  it("preserves cancellation even when the signing provider resolves late", async () => {
    const controller = new AbortController();
    const { adapter } = setup({
      baixar: async () => {
        controller.abort();
        return { url: signed };
      },
    });
    await expect(adapter.fetchAuthorized(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("maps serialized denials and sanitizes other provider failures", async () => {
    const denied = setup({
      obter: async () => {
        throw { status: 403, message: signed };
      },
    });
    await expect(denied.adapter.checkAccess(signal())).rejects.toBeInstanceOf(LeituraPeAccessError);
    const failed = setup({
      baixar: async () => {
        throw new Error(signed);
      },
    });
    const error = await failed.adapter.fetchAuthorized(signal()).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(LeituraPeError);
    expect((error as Error).message).toBe("network");
    expect(String(error)).not.toContain("private-test-token");
  });

  it("binds expected metadata without depending on a mutable list row", async () => {
    const expected = { ...file };
    const { obter, baixar } = setup();
    const adapter = createPeReaderAdapter({ expected, storageBaseUrl: base, obter, baixar });
    expected.sha256 = "c".repeat(64);
    await expect(adapter.checkAccess(signal())).resolves.toBeUndefined();
  });
});

describe("signed private object URL", () => {
  it("accepts only the exact configured Storage object, retaining the optional download name", () => {
    expect(validateSignedOriginalUrl(signed, base, file.caminho)).toBe(signed);
    expect(
      validateSignedOriginalUrl(signed.replace("&download=Original.pdf", ""), base, file.caminho),
    ).toBe(signed.replace("&download=Original.pdf", ""));
  });

  it.each([
    signed.replace(base, "https://other.example.test"),
    signed.replace(base, "http://project.example.test"),
    signed.replace("/sign/", "/public/"),
    signed.replace("nexus-operacional", "another-bucket"),
    signed.replace(file.caminho, `${file.caminho}-sibling`),
    signed.replace("https://", "https://private-user@"),
    `${signed}#page=2`,
    `${signed}&token=second`,
    `${signed}&redirect=https://other.example.test`,
    `${signed}&download=second.pdf`,
    signed.replace("token=private-test-token", "token="),
    signed.replace("token=private-test-token&", ""),
    "/storage/v1/object/sign/nexus-operacional/original?token=relative",
  ])("rejects any URL that changes the private object contract", (url) => {
    expect(() => validateSignedOriginalUrl(url, base, file.caminho)).toThrow(LeituraPeError);
  });

  it.each(["../original", "a/../original", "a//original", "/original", "original/"])(
    "rejects a non-canonical object path",
    (path) => {
      expect(() => validateSignedOriginalUrl(signed, base, path)).toThrow(LeituraPeError);
    },
  );
});
