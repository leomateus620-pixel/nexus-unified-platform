import "@tanstack/react-start/server-only";
import {
  isRasterPhotoMime,
  RASTER_PHOTO_MIMES,
  rasterPhotoSignature,
  safeDriveThumbnail,
  type RasterPhotoMime,
} from "./photo-media.server";

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
export const MAX_DRIVE_PHOTO_BYTES = 24 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
export const MAX_DRIVE_PHOTO_DEPTH = 4;
const MAX_PHOTO_FOLDERS = 40;
const MAX_PHOTO_PAGES = 48;
const MAX_PHOTO_ITEMS = 240;
const PHOTO_TIMEOUT_MS = 20_000;
const THUMBNAIL_TIMEOUT_MS = 6_000;
const MAX_OAUTH_CACHE_MS = 5 * 60 * 1000;
const oauthTokens = new Map<string, { token: string; validUntil: number }>();

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
type DriveEntry = Omit<DriveItem, "mimeType"> & { mimeType: string };
export type DrivePhotoFolder = {
  id: string;
  resourceKey: string | null;
  origin?: { parentId: string; rootId: string; nameMatches: (name: string) => boolean };
};
export type DrivePhotoRef = { id: string; version: string; path: string[] };
export type DrivePhoto = DrivePhotoRef & { name: string; modifiedAt: string };

export class SyncFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    readonly status?: number,
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
    response.status,
  );
}

async function rejectDrivePermission(response: Response): Promise<never> {
  let retryable = false;
  try {
    const data = await readJson(response, 16_384);
    const error = record(data["error"]);
    const reasons = Array.isArray(error["errors"]) ? error["errors"].map(record) : [];
    retryable =
      error["status"] === "RESOURCE_EXHAUSTED" ||
      reasons.some(
        (item) =>
          item["reason"] === "rateLimitExceeded" || item["reason"] === "userRateLimitExceeded",
      );
  } catch {
    // HTTP 403 still blocks all media. A transient quota reason may be retried.
  }
  throw new SyncFailure("leitura_drive_indisponivel", retryable, 403);
}

function explicitParent(data: Record<string, unknown>, expected: string) {
  const parents = data["parents"];
  if (parents == null || (Array.isArray(parents) && parents.length === 0)) return null;
  return Array.isArray(parents) && parents.length === 1 && parents[0] === expected;
}

const quotedDriveValue = (value: string) =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function asDriveEntry(value: unknown, parent: string): DriveEntry {
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
    typeof mimeType !== "string" ||
    explicitParent(data, parent) === false ||
    typeof modifiedTime !== "string" ||
    !Number.isFinite(Date.parse(modifiedTime)) ||
    typeof version !== "string" ||
    !/^\d{1,24}$/.test(version) ||
    (mimeType !== DRIVE_FOLDER && (bytes === null || !Number.isSafeInteger(bytes) || bytes < 1)) ||
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

function asDriveItem(value: unknown, parent: string): DriveItem {
  const entry = asDriveEntry(value, parent);
  if (entry.mimeType !== DRIVE_FOLDER && entry.mimeType !== DRIVE_PDF)
    throw new SyncFailure("metadados_drive_invalidos", true);
  return { ...entry, mimeType: entry.mimeType };
}

function checkPhotoFolder(folder: DrivePhotoFolder) {
  if (
    !driveId.test(folder.id) ||
    (folder.resourceKey !== null && !driveId.test(folder.resourceKey))
  )
    throw new SyncFailure("pasta_drive_divergente");
  const origin = folder.origin;
  if (
    origin &&
    (!driveId.test(origin.parentId) ||
      !driveId.test(origin.rootId) ||
      typeof origin.nameMatches !== "function" ||
      origin.parentId === folder.id ||
      origin.rootId === folder.id)
  )
    throw new SyncFailure("pasta_rdo_fora_da_origem");
}

async function readRaster(
  response: Response,
  limit: number,
  tooLarge: string,
  expectedMime?: RasterPhotoMime,
) {
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (
    response.status !== 200 ||
    !isRasterPhotoMime(mime) ||
    (expectedMime && mime !== expectedMime)
  ) {
    await response.body?.cancel();
    throw new SyncFailure("foto_rdo_invalida");
  }
  const bytes = await readLimited(response, limit, tooLarge);
  if (!rasterPhotoSignature(bytes, mime)) throw new SyncFailure("foto_rdo_invalida");
  return { bytes, mime };
}

function photoResponse({ bytes, mime }: Awaited<ReturnType<typeof readRaster>>) {
  return new Response(bytes, {
    headers: {
      "content-type": mime,
      "content-length": String(bytes.byteLength),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createDrive(credentials: Credentials, transport = fetch) {
  let bearer: Promise<string> | undefined;
  let cacheKey: string | undefined;
  function accessToken(signal: AbortSignal) {
    bearer ??= (async () => {
      if (transport === fetch) {
        const identity = new TextEncoder().encode(
          JSON.stringify([credentials.clientEmail, credentials.keyId, credentials.privateKey]),
        );
        cacheKey ??= await sha256Hex(identity);
        const cached = oauthTokens.get(cacheKey);
        if (cached && cached.validUntil > Date.now()) return cached.token;
      }
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
      const data = await readJson(response, 16_384);
      const token = data["access_token"];
      if (typeof token !== "string" || !/^[\w.+/=-]{1,8192}$/.test(token))
        throw new SyncFailure("autenticacao_drive_invalida");
      const expiresIn = data["expires_in"];
      if (
        cacheKey &&
        typeof expiresIn === "number" &&
        Number.isFinite(expiresIn) &&
        expiresIn > 60
      ) {
        if (oauthTokens.size >= 4 && !oauthTokens.has(cacheKey)) {
          const first = oauthTokens.keys().next().value;
          if (first) oauthTokens.delete(first);
        }
        oauthTokens.set(cacheKey, {
          token,
          validUntil: Date.now() + Math.min(MAX_OAUTH_CACHE_MS, (expiresIn - 60) * 1000),
        });
      }
      return token;
    })();
    return bearer;
  }

  async function driveRequest(path: string, id: string, key: string | null, signal: AbortSignal) {
    const headers = new Headers({ Authorization: `Bearer ${await accessToken(signal)}` });
    if (key) headers.set("X-Goog-Drive-Resource-Keys", `${id}/${key}`);
    const response = await transport(`${DRIVE_API}${path}`, {
      headers,
      redirect: "manual",
      signal,
    });
    if (response.status === 401 && cacheKey) oauthTokens.delete(cacheKey);
    if (response.status === 403) await rejectDrivePermission(response);
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
      (mimeType !== DRIVE_FOLDER && mimeType !== DRIVE_PDF && !isRasterPhotoMime(mimeType))
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

  async function readableFolder(
    { id, resourceKey }: DrivePhotoFolder,
    expected: {
      parent?: string | undefined;
      name?: string | undefined;
      nameMatches?: (name: string) => boolean;
    },
    signal: AbortSignal,
  ) {
    // A parent filter can return an empty result even if the folder cannot be read.
    const params = new URLSearchParams({
      supportsAllDrives: "true",
      fields: "id,name,parents,mimeType,trashed,capabilities(canListChildren)",
    });
    const folder = await readJson(
      await driveRequest(`/files/${id}?${params}`, id, resourceKey, signal),
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
    if (
      expected.nameMatches &&
      (typeof folder["name"] !== "string" || !expected.nameMatches(folder["name"]))
    )
      throw new SyncFailure("pasta_rdo_fora_da_origem");
    if (expected.parent) await confirmParent(folder, expected.parent, resourceKey, signal);
  }

  async function verifyPhotoOrigin(
    folder: DrivePhotoFolder,
    budget: { pages: number },
    signal: AbortSignal,
    catalogued = false,
  ) {
    if (!folder.origin) return readableFolder(folder, {}, signal);
    const { parentId, rootId, nameMatches } = folder.origin;
    const verifyTag = () => readableFolder(folder, { parent: parentId, nameMatches }, signal);
    const verifyBranch = async () => {
      if (parentId === rootId) return;
      const openRoot = () => readableFolder({ id: rootId, resourceKey: null }, {}, signal);
      const findPublishedFolder = async () => {
        // Resolve the resource key from the registered root before opening the branch.
        const query = `${quotedDriveValue(rootId)} in parents and trashed = false and mimeType = '${DRIVE_FOLDER}'`;
        const seen = new Set<string>();
        let cursor: string | null = null;
        let parent: DriveEntry | undefined;
        do {
          if (budget.pages <= 0) throw new SyncFailure("limite_fotos_rdo");
          budget.pages -= 1;
          const page = await listPage(query, FILE_FIELDS, rootId, null, cursor, signal);
          const match = page.raw.map(record).find((entry) => entry["id"] === parentId);
          if (match) {
            parent = asDriveEntry(match, rootId);
            if (parent.mimeType !== DRIVE_FOLDER) throw new SyncFailure("pasta_rdo_fora_da_origem");
            break;
          }
          cursor = page.nextPageToken;
          if (cursor) {
            if (seen.has(cursor)) throw new SyncFailure("listagem_drive_incompleta", true);
            seen.add(cursor);
          }
        } while (cursor);
        if (!parent) throw new SyncFailure("pasta_rdo_fora_da_origem");
        await readableFolder(parent, { parent: rootId }, signal);
      };
      if (catalogued) {
        await Promise.all([openRoot(), findPublishedFolder()]);
      } else {
        await openRoot();
        await findPublishedFolder();
      }
    };
    try {
      if (catalogued) {
        await Promise.all([verifyBranch(), verifyTag()]);
      } else {
        await verifyBranch();
        await verifyTag();
      }
    } catch (error) {
      if (
        error instanceof SyncFailure &&
        !error.retryable &&
        (error.status === 403 ||
          error.status === 404 ||
          error.code === "pasta_drive_divergente" ||
          error.code === "pasta_drive_sem_acesso")
      )
        throw new SyncFailure("pasta_rdo_fora_da_origem");
      throw error;
    }
  }

  async function photoChildren(
    folder: DrivePhotoFolder,
    budget: { pages: number },
    signal: AbortSignal,
  ) {
    const filters = [DRIVE_FOLDER, ...RASTER_PHOTO_MIMES]
      .map((mime) => `mimeType = '${mime}'`)
      .join(" or ");
    const query = `${quotedDriveValue(folder.id)} in parents and trashed = false and (${filters})`;
    const children: DriveEntry[] = [];
    const ids = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | null = null;
    do {
      if (budget.pages <= 0) throw new SyncFailure("limite_fotos_rdo");
      budget.pages -= 1;
      const { raw, nextPageToken } = await listPage(
        query,
        FILE_FIELDS,
        folder.id,
        folder.resourceKey,
        cursor,
        signal,
      );
      for (const value of raw) {
        const entry = record(value);
        const mime = entry["mimeType"];
        if (typeof mime !== "string") throw new SyncFailure("metadados_drive_invalidos", true);
        if (mime !== DRIVE_FOLDER && !isRasterPhotoMime(mime)) continue;
        const child = asDriveEntry(entry, folder.id);
        if (ids.has(child.id)) throw new SyncFailure("listagem_drive_incompleta", true);
        ids.add(child.id);
        children.push(child);
        if (children.length > MAX_PHOTO_ITEMS + MAX_PHOTO_FOLDERS)
          throw new SyncFailure("limite_fotos_rdo");
      }
      cursor = nextPageToken;
      if (cursor) {
        if (cursors.has(cursor)) throw new SyncFailure("listagem_drive_incompleta", true);
        cursors.add(cursor);
      }
    } while (cursor);
    return children;
  }

  async function photoDetails(item: DriveEntry, signal: AbortSignal) {
    const { id, resourceKey } = item;
    const params = new URLSearchParams({
      supportsAllDrives: "true",
      fields: `${FILE_FIELDS},thumbnailLink,capabilities(canDownload)`,
    });
    const data = await readJson(
      await driveRequest(`/files/${id}?${params}`, id, resourceKey, signal),
      16_384,
    );
    if (data["id"] !== id || data["version"] !== item.version || data["trashed"] === true)
      throw new SyncFailure("versao_foto_rdo_alterada");
    const capability = (data["capabilities"] as { canDownload?: unknown } | undefined)?.canDownload;
    if (capability === false) throw new SyncFailure("foto_rdo_indisponivel");
    const parent = item.parents[0]!;
    await confirmParent(data, parent, resourceKey, signal);
    const current = asDriveEntry(data, parent);
    if (
      !isRasterPhotoMime(current.mimeType) ||
      current.mimeType !== item.mimeType ||
      current.size !== item.size ||
      current.name !== item.name ||
      (item.sha256 && current.sha256 && current.sha256 !== item.sha256)
    )
      throw new SyncFailure("versao_foto_rdo_alterada");
    return {
      ...current,
      mimeType: current.mimeType,
      sha256: current.sha256 ?? item.sha256,
      canDownload: capability === true,
      thumbnailLink: data["thumbnailLink"],
    };
  }

  async function nativeThumbnail(link: URL, signal: AbortSignal) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS)]);
    try {
      const thumbnail = await transport(link.href, {
        headers: { Authorization: `Bearer ${await accessToken(deadline)}` },
        redirect: "manual",
        signal: deadline,
      });
      return await readRaster(thumbnail, MAX_THUMBNAIL_BYTES, "miniatura_rdo_indisponivel");
    } catch {
      signal.throwIfAborted();
      return null;
    }
  }

  function photoAccess(folder: DrivePhotoFolder, signal: AbortSignal) {
    checkPhotoFolder(folder);
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(PHOTO_TIMEOUT_MS)]);
    const budget = { pages: MAX_PHOTO_PAGES };
    const children = new Map<string, ReturnType<typeof photoChildren>>();
    const opened = new Map<string, Promise<void>>();
    const catalogueChecks = new Map<string, ReturnType<typeof resolve>>();
    let origin: Promise<void> | undefined;

    function list(parent: DrivePhotoFolder) {
      let pending = children.get(parent.id);
      if (!pending) {
        pending = photoChildren(parent, budget, deadline);
        children.set(parent.id, pending);
      }
      return pending;
    }

    async function traverse(ref: DrivePhotoRef, catalogued: boolean) {
      let scoped = folder;
      for (const id of ref.path) {
        const next = (await list(scoped)).find(
          (child) => child.id === id && child.mimeType === DRIVE_FOLDER,
        );
        if (!next) throw new SyncFailure("foto_rdo_indisponivel");
        let verified = opened.get(`${scoped.id}/${id}`);
        if (!verified) {
          verified = readableFolder(next, { parent: scoped.id }, deadline);
          opened.set(`${scoped.id}/${id}`, verified);
        }
        // The live scoped parent listing supplies the child's identity and resource key.
        if (catalogued) await Promise.all([verified, list(next)]);
        else await verified;
        scoped = next;
      }
      const item = (await list(scoped)).find(
        (child) => child.id === ref.id && isRasterPhotoMime(child.mimeType),
      );
      if (!item) throw new SyncFailure("foto_rdo_indisponivel");
      if (item.version !== ref.version) throw new SyncFailure("versao_foto_rdo_alterada");
      return photoDetails(item, deadline);
    }

    async function resolve(ref: DrivePhotoRef, catalogued = false) {
      const chain = [folder.id, ...ref.path, ref.id];
      if (
        ref.path.length > MAX_DRIVE_PHOTO_DEPTH ||
        new Set(chain).size !== chain.length ||
        chain.some((id) => !driveId.test(id)) ||
        !/^\d{1,24}$/.test(ref.version)
      )
        throw new SyncFailure("foto_rdo_indisponivel");

      origin ??= verifyPhotoOrigin(folder, budget, deadline, catalogued);
      if (catalogued) {
        // Only an exact server catalogue reference may start its live walk while the
        // registered root check runs. No binary may be opened until both succeed.
        const [, selected] = await Promise.all([origin, traverse(ref, true)]);
        return selected;
      }
      await origin;
      return traverse(ref, false);
    }

    async function readOriginal(current: Awaited<ReturnType<typeof resolve>>, thumbnail = false) {
      const limit = thumbnail ? MAX_THUMBNAIL_BYTES : MAX_DRIVE_PHOTO_BYTES;
      const tooLarge = thumbnail ? "miniatura_rdo_indisponivel" : "foto_rdo_acima_do_limite";
      if (!current.size || current.size > limit) throw new SyncFailure(tooLarge);
      const query = new URLSearchParams({ supportsAllDrives: "true", alt: "media" });
      const response = await driveRequest(
        `/files/${current.id}?${query}`,
        current.id,
        current.resourceKey,
        deadline,
      );
      const original = await readRaster(response, limit, tooLarge, current.mimeType);
      if (
        original.bytes.byteLength !== current.size ||
        (current.sha256 && (await sha256Hex(original.bytes)) !== current.sha256)
      )
        throw new SyncFailure("foto_rdo_invalida");
      if (!current.sha256) await photoDetails(current, deadline);
      return original;
    }

    return {
      async verify(ref: DrivePhotoRef) {
        const { mimeType, size, sha256, canDownload } = await resolve(ref);
        return { mimeType, size, sha256, canDownload };
      },
      async verifyCatalogRef(ref: DrivePhotoRef) {
        const key = [ref.id, ref.version, ...ref.path].join("/");
        let pending = catalogueChecks.get(key);
        if (!pending) {
          pending = resolve(ref, true);
          catalogueChecks.set(key, pending);
        }
        const { mimeType, size, sha256, canDownload } = await pending;
        return { mimeType, size, sha256, canDownload };
      },
      async readOriginal(ref: DrivePhotoRef) {
        return readOriginal(await resolve(ref));
      },
      async read(ref: DrivePhotoRef, preview: boolean) {
        const current = await resolve(ref);

        if (preview) {
          const link = safeDriveThumbnail(current.thumbnailLink, current.id);
          const thumbnail = link && (await nativeThumbnail(link, deadline));
          if (thumbnail) {
            await photoDetails(current, deadline);
            return photoResponse(thumbnail);
          }
        }

        return photoResponse(await readOriginal(current, preview));
      },
    };
  }

  return {
    photoAccess,
    async listFolder(
      id: string,
      key: string | null,
      pageToken: string | null,
      signal: AbortSignal,
      expected: { parent?: string | undefined; name?: string | undefined },
      foldersOnly = false,
    ) {
      await readableFolder({ id, resourceKey: key }, expected, signal);
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
      const sha256 = await sha256Hex(bytes);
      if (item.sha256 && item.sha256 !== sha256)
        throw new SyncFailure("hash_drive_divergente", true);
      if (!item.sha256) check(await details());
      return { bytes, sha256 };
    },
    async listPhotos(folder: DrivePhotoFolder, signal: AbortSignal): Promise<DrivePhoto[]> {
      checkPhotoFolder(folder);
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(PHOTO_TIMEOUT_MS)]);
      const queue: { folder: DrivePhotoFolder; path: string[]; parent?: string }[] = [
        { folder, path: [] },
      ];
      const seen = new Set([folder.id]);
      const photos: DrivePhoto[] = [];
      const budget = { pages: MAX_PHOTO_PAGES };
      await verifyPhotoOrigin(folder, budget, deadline);
      for (const node of queue) {
        if (node.parent) await readableFolder(node.folder, { parent: node.parent }, deadline);
        const children = await photoChildren(node.folder, budget, deadline);
        for (const child of children) {
          if (seen.has(child.id)) throw new SyncFailure("listagem_drive_incompleta", true);
          seen.add(child.id);
          if (child.mimeType === DRIVE_FOLDER) {
            if (node.path.length >= MAX_DRIVE_PHOTO_DEPTH || queue.length >= MAX_PHOTO_FOLDERS)
              throw new SyncFailure("limite_fotos_rdo");
            queue.push({ folder: child, path: [...node.path, child.id], parent: node.folder.id });
            continue;
          }
          if (photos.length >= MAX_PHOTO_ITEMS) throw new SyncFailure("limite_fotos_rdo");
          const { id, name, modifiedAt, version } = child;
          photos.push({ id, name, modifiedAt, version, path: node.path });
        }
      }
      return photos;
    },
    async readPhoto(
      folder: DrivePhotoFolder,
      ref: DrivePhotoRef,
      preview: boolean,
      signal: AbortSignal,
    ) {
      return photoAccess(folder, signal).read(ref, preview);
    },
  };
}
