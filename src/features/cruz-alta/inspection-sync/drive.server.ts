import "@tanstack/react-start/server-only";

export const DRIVE_FOLDER = "application/vnd.google-apps.folder";
export const DRIVE_PDF = "application/pdf";
export const driveId = /^[A-Za-z0-9_-]{10,250}$/;
export const sha256Pattern = /^[a-f0-9]{64}$/;
export const MAX_DRIVE_PDF_BYTES = 24 * 1024 * 1024;
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FILE_FIELDS =
  "id,name,mimeType,parents,modifiedTime,version,size,sha256Checksum,resourceKey,trashed";
const DRIVE_PAGE_SIZE = 100;
const MAX_METADATA_BYTES = 192 * 1024;

type Credentials = { clientEmail: string; privateKey: string; keyId?: string };
export type DriveItem = {
  id: string;
  name: string;
  mimeType: typeof DRIVE_PDF | typeof DRIVE_FOLDER;
  parents: string[];
  modifiedAt: string;
  version: string;
  size: number | null;
  sha256: string | null;
  resourceKey: string | null;
};

export class SyncFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
  ) {
    super(code);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SyncFailure("resposta_drive_invalida", true);
  return value as Record<string, unknown>;
}

export function serviceCredentials(value: unknown): Credentials {
  const data = record(typeof value === "string" ? JSON.parse(value) : value);
  const { type, client_email, private_key, private_key_id } = data;
  if (
    type !== "service_account" ||
    typeof client_email !== "string" ||
    !/^[A-Za-z0-9.+_-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com$/.test(client_email) ||
    typeof private_key !== "string" ||
    private_key.length > 8192 ||
    (private_key_id != null &&
      (typeof private_key_id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(private_key_id)))
  )
    throw new SyncFailure("credencial_drive_invalida");
  return {
    clientEmail: client_email,
    privateKey: private_key,
    ...(typeof private_key_id === "string" ? { keyId: private_key_id } : {}),
  };
}

export async function readLimited(response: Request | Response, limit: number, code: string) {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel();
    throw new SyncFailure(code);
  }
  if (!response.body) throw new SyncFailure("resposta_drive_vazia", true);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new SyncFailure(code);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

async function readJson(response: Response, limit: number) {
  const bytes = await readLimited(response, limit, "metadados_drive_acima_do_limite");
  try {
    return record(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new SyncFailure("resposta_drive_invalida", true);
  }
}

function base64Url(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function driveSigningKey(privateKey: string) {
  const raw = privateKey
    .trim()
    .match(/^-----BEGIN PRIVATE KEY-----\s+([\w+/=\s]+?)\s+-----END PRIVATE KEY-----$/);
  if (!raw?.[1]) throw new SyncFailure("credencial_drive_invalida");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(raw[1].replace(/\s/g, "")), (character) => character.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  if ((key.algorithm as RsaKeyAlgorithm).modulusLength < 2048)
    throw new SyncFailure("credencial_drive_invalida");
  return key;
}

async function assertion(credentials: Credentials, now: number) {
  const encoder = new TextEncoder();
  const encode = (data: object) => base64Url(encoder.encode(JSON.stringify(data)));
  const iat = Math.floor(now / 1000);
  const header = encode({ alg: "RS256", typ: "JWT", kid: credentials.keyId });
  const payload = encode({
    iss: credentials.clientEmail,
    scope: TOKEN_SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + 300,
  });
  const key = await driveSigningKey(credentials.privateKey);
  const signed = `${header}.${payload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signed));
  return `${signed}.${base64Url(new Uint8Array(signature))}`;
}

function expectSuccess(response: Response, failure: string) {
  if (response.ok) return;
  void response.body?.cancel().catch(() => undefined);
  throw new SyncFailure(
    failure,
    response.status === 408 || response.status === 429 || response.status >= 500,
  );
}

function explicitParent(data: Record<string, unknown>, expected: string) {
  const parents = data["parents"];
  if (parents == null || (Array.isArray(parents) && parents.length === 0)) return null;
  return Array.isArray(parents) && parents.length === 1 && parents[0] === expected;
}

const quotedDriveValue = (value: string) =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function asDriveItem(value: unknown, parent: string): DriveItem {
  const data = record(value);
  const { id, name, mimeType, modifiedTime, version, size, sha256Checksum, resourceKey, trashed } =
    data;
  const bytes = typeof size === "string" && /^\d+$/.test(size) ? Number(size) : null;
  if (
    trashed === true ||
    typeof id !== "string" ||
    !driveId.test(id) ||
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 500 ||
    Array.from(name).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    (mimeType !== DRIVE_FOLDER && mimeType !== DRIVE_PDF) ||
    explicitParent(data, parent) === false ||
    typeof modifiedTime !== "string" ||
    !Number.isFinite(Date.parse(modifiedTime)) ||
    typeof version !== "string" ||
    !/^\d{1,24}$/.test(version) ||
    (mimeType === DRIVE_PDF && (bytes === null || !Number.isSafeInteger(bytes) || bytes < 1)) ||
    (sha256Checksum != null &&
      (typeof sha256Checksum !== "string" || !sha256Pattern.test(sha256Checksum))) ||
    (resourceKey != null && (typeof resourceKey !== "string" || !driveId.test(resourceKey)))
  )
    throw new SyncFailure("metadados_drive_invalidos", true);
  return {
    id,
    name,
    mimeType,
    parents: [parent],
    modifiedAt: modifiedTime,
    version,
    size: bytes,
    sha256: typeof sha256Checksum === "string" ? sha256Checksum : null,
    resourceKey: typeof resourceKey === "string" ? resourceKey : null,
  };
}

export function createDrive(credentials: Credentials, transport = fetch) {
  let bearer: Promise<string> | undefined;
  async function driveRequest(path: string, id: string, key: string | null, signal: AbortSignal) {
    bearer ??= (async () => {
      let jwt: string;
      try {
        jwt = await assertion(credentials, Date.now());
      } catch {
        throw new SyncFailure("credencial_drive_invalida");
      }
      const response = await transport(TOKEN_URL, {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }),
        redirect: "manual",
        signal,
      });
      expectSuccess(response, "autenticacao_drive_indisponivel");
      const token = (await readJson(response, 16_384))["access_token"];
      if (typeof token !== "string" || !/^[\w.+/=-]{1,8192}$/.test(token))
        throw new SyncFailure("autenticacao_drive_invalida");
      return token;
    })();
    const headers = new Headers({ Authorization: `Bearer ${await bearer}` });
    if (key) headers.set("X-Goog-Drive-Resource-Keys", `${id}/${key}`);
    const response = await transport(`${DRIVE_API}${path}`, {
      headers,
      redirect: "manual",
      signal,
    });
    expectSuccess(response, "leitura_drive_indisponivel");
    return response;
  }

  async function listPage(
    query: string,
    fields: string,
    id: string,
    key: string | null,
    pageToken: string | null,
    signal: AbortSignal,
  ) {
    const params = new URLSearchParams({
      q: query,
      fields: `nextPageToken,incompleteSearch,files(${fields})`,
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      spaces: "drive",
      pageSize: String(DRIVE_PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await readJson(
      await driveRequest(`/files?${params}`, id, key, signal),
      MAX_METADATA_BYTES,
    );
    if (data["incompleteSearch"] === true) throw new SyncFailure("listagem_drive_incompleta", true);
    const raw = data["files"] ?? [];
    const next = data["nextPageToken"] ?? null;
    if (
      !Array.isArray(raw) ||
      raw.length > DRIVE_PAGE_SIZE ||
      (next !== null &&
        (typeof next !== "string" || !next || next.length > 4096 || next === pageToken))
    )
      throw new SyncFailure("pagina_drive_invalida", true);
    return { raw, nextPageToken: next };
  }

  async function confirmParent(
    metadata: Record<string, unknown>,
    expected: string,
    resourceKey: string | null,
    signal: AbortSignal,
  ) {
    const direct = explicitParent(metadata, expected);
    if (direct === true) return;
    if (direct === false) throw new SyncFailure("pasta_drive_divergente");

    // Drive can omit parents in a direct metadata lookup. Only an exact match in a
    // server-filtered response from the already authorized parent can confirm membership.
    const { id, name, mimeType } = metadata;
    if (
      typeof id !== "string" ||
      !driveId.test(id) ||
      typeof name !== "string" ||
      !name ||
      name.length > 500 ||
      (mimeType !== DRIVE_FOLDER && mimeType !== DRIVE_PDF)
    )
      throw new SyncFailure("pasta_drive_divergente");
    const query = `${quotedDriveValue(expected)} in parents and trashed = false and name = ${quotedDriveValue(name)} and mimeType = ${quotedDriveValue(mimeType)}`;
    let pageToken: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const { raw, nextPageToken } = await listPage(
        query,
        "id,name,mimeType,parents,trashed",
        id,
        resourceKey,
        pageToken,
        signal,
      );
      const exact = raw.map(record).find((row) => row["id"] === id);
      if (exact) {
        if (
          exact["name"] !== name ||
          exact["mimeType"] !== mimeType ||
          exact["trashed"] === true ||
          explicitParent(exact, expected) === false
        )
          break;
        return;
      }
      if (!nextPageToken) break;
      pageToken = nextPageToken;
    }
    throw new SyncFailure("pasta_drive_divergente");
  }

  return {
    async listFolder(
      id: string,
      key: string | null,
      pageToken: string | null,
      signal: AbortSignal,
      expected: { parent?: string | undefined; name?: string | undefined },
      foldersOnly = false,
    ) {
      // A parent filter can return an empty result even if the folder cannot be read.
      const folderParams = new URLSearchParams({
        supportsAllDrives: "true",
        fields: "id,name,parents,mimeType,trashed,capabilities(canListChildren)",
      });
      const folder = await readJson(
        await driveRequest(`/files/${id}?${folderParams}`, id, key, signal),
        16_384,
      );
      const capabilities = folder["capabilities"] as { canListChildren?: unknown } | undefined;
      if (
        folder["id"] !== id ||
        folder["mimeType"] !== DRIVE_FOLDER ||
        folder["trashed"] === true ||
        capabilities?.canListChildren !== true
      )
        throw new SyncFailure("pasta_drive_sem_acesso");
      if (expected.name && folder["name"] !== expected.name)
        throw new SyncFailure("pasta_drive_divergente");
      if (expected.parent) await confirmParent(folder, expected.parent, key, signal);
      const folderMime = `mimeType = '${DRIVE_FOLDER}'`;
      const { raw, nextPageToken } = await listPage(
        `'${id}' in parents and trashed = false and ${foldersOnly ? folderMime : `(${folderMime} or mimeType = '${DRIVE_PDF}')`}`,
        FILE_FIELDS,
        id,
        key,
        pageToken,
        signal,
      );
      const safeNames = foldersOnly
        ? raw.filter((item) => {
            const name = record(item)["name"];
            return (
              typeof name !== "string" ||
              !Array.from(name).some((character) => {
                const code = character.charCodeAt(0);
                return code < 32 || (code >= 127 && code <= 159);
              })
            );
          })
        : raw;
      const items = safeNames.map((item) => asDriveItem(item, id));
      if (foldersOnly && items.some((item) => item.mimeType !== DRIVE_FOLDER))
        throw new SyncFailure("listagem_rdo_inconsistente", true);
      return { items, nextPageToken };
    },
    async download(item: DriveItem, signal: AbortSignal) {
      const params = new URLSearchParams({ supportsAllDrives: "true", fields: FILE_FIELDS });
      const parent = item.parents[0]!;
      const details = async () => {
        const metadata = await readJson(
          await driveRequest(`/files/${item.id}?${params}`, item.id, item.resourceKey, signal),
          16_384,
        );
        if (
          metadata["id"] !== item.id ||
          metadata["name"] !== item.name ||
          metadata["trashed"] === true
        )
          throw new SyncFailure("versao_drive_atualizada");
        await confirmParent(metadata, parent, item.resourceKey, signal);
        return asDriveItem(metadata, parent);
      };
      const check = (current: DriveItem) => {
        if (
          current.id !== item.id ||
          current.version !== item.version ||
          current.size !== item.size ||
          current.parents[0] !== item.parents[0] ||
          current.name !== item.name ||
          current.mimeType !== DRIVE_PDF ||
          (item.sha256 && current.sha256 !== item.sha256)
        )
          throw new SyncFailure("versao_drive_atualizada");
      };
      check(await details());
      const query = new URLSearchParams({ supportsAllDrives: "true", alt: "media" });
      const response = await driveRequest(
        `/files/${item.id}?${query}`,
        item.id,
        item.resourceKey,
        signal,
      );
      const bytes = await readLimited(response, MAX_DRIVE_PDF_BYTES, "pdf_acima_do_limite");
      if (
        bytes.length !== item.size ||
        !new TextDecoder().decode(bytes.subarray(0, 5)).startsWith("%PDF-")
      )
        throw new SyncFailure("pdf_drive_divergente");
      const sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      if (item.sha256 && item.sha256 !== sha256)
        throw new SyncFailure("hash_drive_divergente", true);
      if (!item.sha256) check(await details());
      return { bytes, sha256 };
    },
  };
}
