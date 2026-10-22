import { LeituraPeAccessError, LeituraPeError } from "./leitor/domain";
import type { PeArquivo } from "./pe-arquivos.functions";

export type ExpectedPeOriginal = Pick<
  PeArquivo,
  "id" | "organization_id" | "projeto_id" | "versao_id" | "sha256" | "tamanho" | "mime" | "caminho"
>;
type ReaderDependencies = {
  expected: ExpectedPeOriginal;
  storageBaseUrl: string;
  obter: (signal: AbortSignal) => Promise<PeArquivo>;
  baixar: (signal: AbortSignal) => Promise<{ url: string }>;
};
function denied(error: unknown) {
  if (error instanceof LeituraPeAccessError) return true;
  if (error instanceof Error && error.message === "Arquivo indisponível para seu acesso atual.")
    return true;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return (
      value["message"] === "Arquivo indisponível para seu acesso atual." ||
      value["code"] === "42501" ||
      value["code"] === "PGRST116" ||
      value["status"] === 401 ||
      value["status"] === 403
    );
  }
  return false;
}
function safeFailure(error: unknown, signal: AbortSignal): never {
  signal.throwIfAborted();
  if (denied(error)) throw new LeituraPeAccessError();
  // Do not reflect Storage URLs, provider diagnostics, tokens or internal paths to the UI.
  throw new LeituraPeError("network");
}
export function assertCurrentOriginal(current: PeArquivo, expected: ExpectedPeOriginal) {
  const fields = [
    "id",
    "organization_id",
    "projeto_id",
    "versao_id",
    "sha256",
    "tamanho",
    "mime",
    "caminho",
  ] as const;
  if (
    !current ||
    current.estado !== "vinculado" ||
    fields.some((field) => current[field] !== expected[field])
  )
    throw new LeituraPeAccessError();
}
/** Only an exact private signed-object URL from this project's configured Storage origin is accepted. */
export function validateSignedOriginalUrl(raw: string, storageBaseUrl: string, caminho: string) {
  try {
    const base = new URL(storageBaseUrl);
    const url = new URL(raw);
    const segments = caminho.split("/");
    if (!segments.length || segments.some((part) => !part || part === "." || part === ".."))
      throw new Error();
    const pathname = `/storage/v1/object/sign/nexus-operacional/${segments.map(encodeURIComponent).join("/")}`;
    if (
      !["https:", "http:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname !== pathname ||
      url.searchParams.getAll("token").length !== 1 ||
      !url.searchParams.get("token") ||
      [...url.searchParams.keys()].some((key) => key !== "token" && key !== "download") ||
      url.searchParams.getAll("download").length > 1
    )
      throw new Error();
    return url.href;
  } catch {
    throw new LeituraPeError("network");
  }
}
export function createPeReaderAdapter(dependencies: ReaderDependencies) {
  const expected = Object.freeze({ ...dependencies.expected });
  async function current(signal: AbortSignal) {
    signal.throwIfAborted();
    let file: PeArquivo;
    try {
      file = await dependencies.obter(signal);
    } catch (error) {
      return safeFailure(error, signal);
    }
    signal.throwIfAborted();
    assertCurrentOriginal(file, expected);
    return file;
  }
  return {
    async checkAccess(signal: AbortSignal): Promise<void> {
      await current(signal);
    },
    async fetchAuthorized(signal: AbortSignal): Promise<{ url: string }> {
      await current(signal);
      let signed: { url: string };
      try {
        signed = await dependencies.baixar(signal);
      } catch (error) {
        return safeFailure(error, signal);
      }
      signal.throwIfAborted();
      const url = validateSignedOriginalUrl(
        signed.url,
        dependencies.storageBaseUrl,
        expected.caminho,
      );
      // Signing does not establish a new authorization lifetime or bypass a revocation while waiting.
      await current(signal);
      return { url };
    },
  };
}
