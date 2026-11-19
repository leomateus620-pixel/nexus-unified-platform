import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  createDrive,
  DRIVE_FOLDER,
  MAX_DRIVE_PHOTO_BYTES,
} from "../../src/features/cruz-alta/inspection-sync/drive.server";

const BASE = "fixture-photo-root";
const NESTED = "fixture-photo-nested";
const DIRECT = "fixture-photo-direct";
const PHOTO = "fixture-photo-original";
const SECOND = "fixture-photo-second";
const FOREIGN = "fixture-photo-unrelated";
const RDO_ROOT = "fixture-private-rdo-root";
const RDO_LAUNCHED = "fixture-private-rdo-launched";
const RESOURCE = "0-fixture-drive-key";
const CHANGED = "2026-01-08T13:42:00.000Z";
const JPEG = new Uint8Array([255, 216, 255, 224, 53, 14, 255, 217]);
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const AUTHORITY = "https://www.googleapis.com";
const THUMBNAIL = "https://lh3.googleusercontent.com/drive-storage/fixture-preview=s220";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = {
  clientEmail: "photos@test-case.iam.gserviceaccount.com",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};
const access = { id: BASE, resourceKey: RESOURCE };
const signal = () => new AbortController().signal;

function photo(id: string, parent: string, mimeType = "image/jpeg") {
  return {
    id,
    name: `${id}.jpg`,
    mimeType,
    parents: [parent],
    version: "42",
    modifiedTime: CHANGED,
    size: String(JPEG.length),
  };
}

function directory(id: string, parent?: string) {
  return {
    ...photo(id, parent ?? "fixture-above-photo-root", DRIVE_FOLDER),
    name: id,
    capabilities: { canListChildren: true },
  };
}

type FixtureOptions = {
  incomplete?: boolean;
  inaccessible?: boolean;
  thumbnailLink?: string;
  thumbnailRedirect?: boolean;
  size?: number;
  originalBody?: Uint8Array<ArrayBuffer>;
  originalMime?: string;
  replaced?: boolean;
  omitParents?: boolean;
  baseParent?: string;
  baseName?: string;
  launchedParent?: string;
  originFailure?: number;
  secondPhoto?: boolean;
  canDownload?: boolean;
  holdOrigin?: { id: string; release: Promise<void>; deny?: boolean; onStart?: () => void };
  onPhotoMetadata?: () => void;
};

function fixture(options: FixtureOptions = {}) {
  const urls: URL[] = [];
  let photoDetails = 0;
  const selected = {
    ...photo(PHOTO, NESTED),
    ...(options.size ? { size: String(options.size) } : {}),
  };
  const children = new Map([
    [
      BASE,
      [
        photo(DIRECT, BASE),
        directory(NESTED, BASE),
        photo("fixture-shortcut", BASE, "application/vnd.google-apps.shortcut"),
      ],
    ],
    [
      NESTED,
      [
        selected,
        ...(options.secondPhoto ? [photo(SECOND, NESTED)] : []),
        photo("fixture-photo-svg", NESTED, "image/svg+xml"),
      ],
    ],
  ]);
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    urls.push(url);
    assert.equal(init?.redirect, "manual");
    if (url.origin === "https://oauth2.googleapis.com") {
      assert.equal(init?.method, "POST");
      return Response.json({ access_token: "fixture-drive-token", expires_in: 3600 });
    }
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer fixture-drive-token");
    if (url.origin === "https://lh3.googleusercontent.com") {
      assert.equal(url.href, THUMBNAIL);
      if (options.thumbnailRedirect)
        return Response.redirect("https://outside.fixture.test/private");
      return new Response(PNG, { headers: { "content-type": "image/png" } });
    }
    assert.equal(url.origin, AUTHORITY, "a credential must not reach another origin");
    const id = url.pathname.split("/").at(-1)!;
    if (id === "files") {
      const query = url.searchParams.get("q") ?? "";
      const parent = /'([A-Za-z0-9_-]+)' in parents/.exec(query)?.[1] ?? "";
      if (parent === RDO_ROOT) {
        assert.equal(
          query,
          `'${RDO_ROOT}' in parents and trashed = false and mimeType = '${DRIVE_FOLDER}'`,
        );
        return Response.json({
          files: [{ ...directory(RDO_LAUNCHED, RDO_ROOT), resourceKey: RESOURCE }],
        });
      }
      assert(children.has(parent));
      const items = children.get(parent)!;
      if (parent === BASE)
        assert.equal(headers.get("X-Goog-Drive-Resource-Keys"), `${BASE}/${RESOURCE}`);
      if (query.includes(" and name = ")) return Response.json({ files: items });
      assert(query.includes("mimeType = 'image/jpeg'"));
      assert(query.includes("mimeType = 'image/png'"));
      assert(query.includes("mimeType = 'image/webp'"));
      assert(query.includes("mimeType = 'image/gif'"));
      assert(!query.includes("shortcut") && !query.includes("image/svg+xml"));
      if (parent === BASE && !url.searchParams.has("pageToken"))
        return Response.json({ files: items.slice(0, 1), nextPageToken: "last-page" });
      if (parent === BASE && options.incomplete)
        return Response.json({ files: [], incompleteSearch: true });
      return Response.json({ files: parent === BASE ? items.slice(1) : items });
    }
    if (id === RDO_ROOT || id === RDO_LAUNCHED) {
      if (options.holdOrigin?.id === id) {
        options.holdOrigin.onStart?.();
        await options.holdOrigin.release;
        if (options.holdOrigin.deny)
          return Response.json({ error: { status: "PERMISSION_DENIED" } }, { status: 403 });
      }
      if (id === RDO_LAUNCHED)
        assert.equal(headers.get("X-Goog-Drive-Resource-Keys"), `${RDO_LAUNCHED}/${RESOURCE}`);
      return Response.json(
        directory(id, id === RDO_LAUNCHED ? (options.launchedParent ?? RDO_ROOT) : undefined),
      );
    }
    if (id === BASE || id === NESTED) {
      if (id === BASE && options.originFailure) {
        return Response.json(
          { error: { status: "PERMISSION_DENIED" } },
          { status: options.originFailure },
        );
      }
      const folder = directory(id, id === NESTED ? BASE : options.baseParent);
      if (id === BASE && options.baseName) folder.name = options.baseName;
      if (options.inaccessible && id === BASE) folder.capabilities.canListChildren = false;
      return Response.json(folder);
    }
    if (id === SECOND && options.secondPhoto) return Response.json(photo(SECOND, NESTED));
    assert.equal(
      id,
      PHOTO,
      "no direct metadata or bytes for a guessed file outside the approved folder",
    );
    if (url.searchParams.get("alt") === "media") {
      return new Response(options.originalBody ?? JPEG, {
        headers: { "content-type": options.originalMime ?? "image/jpeg" },
      });
    }
    photoDetails += 1;
    options.onPhotoMetadata?.();
    return Response.json({
      ...selected,
      ...(options.omitParents ? { parents: undefined } : {}),
      ...(options.replaced && photoDetails > 1 ? { version: "43" } : {}),
      ...(options.canDownload !== undefined
        ? { capabilities: { canDownload: options.canDownload } }
        : {}),
      thumbnailLink: options.thumbnailLink,
    });
  };
  return { api: createDrive(credentials, transport), urls };
}

const ref = { id: PHOTO, version: "42", path: [NESTED] };

const registeredPublishedTag = {
  ...access,
  origin: {
    parentId: RDO_LAUNCHED,
    rootId: RDO_ROOT,
    nameMatches: (value: string) => value.startsWith("08 - "),
  },
};

test(
  "the uncatalogued fallback waits for root authorization before reading the TAG",
  { timeout: 3000 },
  async () => {
    const originStarted = Promise.withResolvers<void>();
    const root = Promise.withResolvers<void>();
    const state = fixture({
      baseParent: RDO_LAUNCHED,
      baseName: "08 - TAG",
      holdOrigin: {
        id: RDO_ROOT,
        release: root.promise,
        deny: true,
        onStart: () => originStarted.resolve(),
      },
    });
    const denied = assert.rejects(
      state.api.readPhoto(registeredPublishedTag, ref, false, signal()),
      {
        code: "pasta_rdo_fora_da_origem",
      },
    );
    await originStarted.promise;
    assert(!state.urls.some((url) => url.searchParams.has("q") || url.pathname.endsWith(BASE)));
    root.resolve();
    await denied;
    assert(!state.urls.some((url) => url.searchParams.has("alt")));
  },
);

test(
  "an exact catalogue photo verifies concurrently with its registered origin and deduplicates identical refs",
  { timeout: 3000 },
  async () => {
    const root = Promise.withResolvers<void>();
    const reachedPhoto = Promise.withResolvers<void>();
    const state = fixture({
      baseParent: RDO_LAUNCHED,
      baseName: "08 - TAG",
      canDownload: true,
      holdOrigin: { id: RDO_ROOT, release: root.promise },
      onPhotoMetadata: () => reachedPhoto.resolve(),
    });
    const access = state.api.photoAccess(registeredPublishedTag, signal());
    let settled = false;
    const result = Promise.all([
      access.verifyCatalogRef(ref),
      access.verifyCatalogRef({ ...ref, path: [...ref.path] }),
    ]).finally(() => {
      settled = true;
    });
    await reachedPhoto.promise;
    assert.equal(settled, false, "known live photo must wait for the registered root");
    root.resolve();
    assert.deepEqual(
      (await result).map((item) => item.canDownload),
      [true, true],
    );
    assert.equal(state.urls.filter((url) => url.pathname.endsWith(PHOTO)).length, 1);
    assert(!state.urls.some((url) => url.searchParams.has("alt")));
  },
);

test(
  "an accessible catalogue photo cannot override a denied root or moved RDO branch",
  { timeout: 3000 },
  async () => {
    for (const origin of [
      { id: RDO_ROOT, deny: true },
      { id: RDO_LAUNCHED, launchedParent: FOREIGN },
    ]) {
      const held = Promise.withResolvers<void>();
      const reachedPhoto = Promise.withResolvers<void>();
      const state = fixture({
        baseParent: RDO_LAUNCHED,
        baseName: "08 - TAG",
        canDownload: true,
        ...(origin.launchedParent ? { launchedParent: origin.launchedParent } : {}),
        holdOrigin: {
          id: origin.id,
          release: held.promise,
          ...(origin.deny ? { deny: true } : {}),
        },
        onPhotoMetadata: () => reachedPhoto.resolve(),
      });
      const result = state.api.photoAccess(registeredPublishedTag, signal()).verifyCatalogRef(ref);
      const denied = assert.rejects(result, { code: "pasta_rdo_fora_da_origem" });
      await reachedPhoto.promise;
      held.resolve();
      await denied;
      assert(!state.urls.some((url) => url.searchParams.has("alt")));
    }
  },
);

test("checks two visible photos against one live scoped traversal and never reads their original bytes", async () => {
  const state = fixture({ secondPhoto: true });
  const scoped = state.api.photoAccess(access, signal());
  await Promise.all([scoped.verify(ref), scoped.verify({ ...ref, id: SECOND })]);
  assert.equal(state.urls.filter((url) => url.pathname.endsWith(BASE)).length, 1);
  assert.equal(state.urls.filter((url) => url.pathname.endsWith(NESTED)).length, 1);
  assert.equal(
    state.urls.filter((url) => url.searchParams.get("q")?.includes(`'${NESTED}' in parents`))
      .length,
    1,
  );
  assert.equal(state.urls.filter((url) => url.searchParams.has("alt")).length, 0);
  await assert.rejects(scoped.verify({ ...ref, id: FOREIGN }), { code: "foto_rdo_indisponivel" });
  assert(!state.urls.some((url) => url.pathname.endsWith(FOREIGN)));
});

test("a live denial of content access rejects cached and direct reads despite visible metadata", async () => {
  const denied = fixture({ canDownload: false, thumbnailLink: THUMBNAIL });
  await assert.rejects(denied.api.photoAccess(access, signal()).verify(ref), {
    code: "foto_rdo_indisponivel",
  });
  await assert.rejects(denied.api.readPhoto(access, ref, true, signal()), {
    code: "foto_rdo_indisponivel",
  });
  assert(!denied.urls.some((url) => url.searchParams.has("alt") || url.href === THUMBNAIL));
  assert.equal(
    (await fixture({ canDownload: true }).api.photoAccess(access, signal()).verify(ref))
      .canDownload,
    true,
  );
});

test("lists raster photo metadata from complete pages with exact paths and no storage URLs", async () => {
  const state = fixture();
  assert.deepEqual(await state.api.listPhotos(access, signal()), [
    { id: DIRECT, name: `${DIRECT}.jpg`, version: "42", modifiedAt: CHANGED, path: [] },
    { id: PHOTO, name: `${PHOTO}.jpg`, version: "42", modifiedAt: CHANGED, path: [NESTED] },
  ]);
  assert(
    !state.urls.some(
      (url) => url.searchParams.has("alt") || url.hostname.includes("googleusercontent"),
    ),
  );
});

test("rejects an incomplete page or an unreadable root instead of publishing a partial list", async () => {
  await assert.rejects(fixture({ incomplete: true }).api.listPhotos(access, signal()), {
    code: "listagem_drive_incompleta",
  });
  const inaccessible = fixture({ inaccessible: true });
  await assert.rejects(inaccessible.api.listPhotos(access, signal()), {
    code: "pasta_drive_sem_acesso",
  });
  assert(!inaccessible.urls.some((url) => url.searchParams.has("q")));
});

test("revalidates the TAG and both live source boundaries before listing or serving photos", async () => {
  const verified = {
    ...access,
    origin: {
      parentId: RDO_LAUNCHED,
      rootId: RDO_ROOT,
      nameMatches: (name: string) => /^08 - /.test(name),
    },
  };
  const matching = fixture({ baseParent: RDO_LAUNCHED, baseName: "08 - FIXTURE" });
  assert.equal((await matching.api.listPhotos(verified, signal())).length, 2);
  assert.equal(matching.urls.filter((url) => url.pathname.endsWith(BASE)).length, 1);

  for (const options of [
    { baseParent: RDO_LAUNCHED, baseName: "09 - RETAGGED" },
    { baseParent: FOREIGN, baseName: "08 - MOVED" },
    { baseParent: RDO_LAUNCHED, baseName: "08 - FIXTURE", launchedParent: FOREIGN },
    { originFailure: 403 },
    { originFailure: 404 },
  ]) {
    const state = fixture(options);
    await assert.rejects(state.api.readPhoto(verified, ref, false, signal()), {
      code: "pasta_rdo_fora_da_origem",
    });
    assert(
      !state.urls.some(
        (url) =>
          url.searchParams.has("alt") ||
          url.searchParams.get("q")?.includes(`'${BASE}' in parents`),
      ),
    );
  }

  await assert.rejects(fixture({ originFailure: 503 }).api.listPhotos(verified, signal()), {
    code: "leitura_drive_indisponivel",
    retryable: true,
    status: 503,
  });
});

test("resolves hidden parents from the approved exact folder, and revalidates the original version after reading", async () => {
  const state = fixture({ omitParents: true });
  const response = await state.api.readPhoto(access, ref, false, signal());
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("content-length"), String(JPEG.length));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), JPEG);
  assert(
    state.urls.some((url) =>
      url.searchParams.get("q")?.includes(`'${NESTED}' in parents and trashed = false and name = `),
    ),
  );

  await assert.rejects(fixture({ replaced: true }).api.readPhoto(access, ref, false, signal()), {
    code: "versao_foto_rdo_alterada",
  });
});

test("blocks wrong ancestry, guessed files and stale versions before fetching original or thumbnail", async () => {
  for (const invalid of [
    { ...ref, path: [] },
    { ...ref, path: [FOREIGN] },
    { ...ref, id: FOREIGN },
    { ...ref, path: [BASE, NESTED] },
    { ...ref, version: "41" },
  ]) {
    const state = fixture({ thumbnailLink: THUMBNAIL });
    await assert.rejects(state.api.readPhoto(access, invalid, true, signal()));
    assert(
      !state.urls.some(
        (url) =>
          url.searchParams.has("alt") ||
          url.pathname.endsWith(FOREIGN) ||
          url.hostname.includes("googleusercontent"),
      ),
    );
  }
});

test("only uses an allowed Google thumbnail and denies redirects while falling back to a bounded original", async () => {
  const rendered = fixture({ thumbnailLink: THUMBNAIL });
  const thumbnail = await rendered.api.readPhoto(access, ref, true, signal());
  assert.equal(thumbnail.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await thumbnail.arrayBuffer()), PNG);
  assert.equal(rendered.urls.filter((url) => url.href === THUMBNAIL).length, 1);
  assert(!rendered.urls.some((url) => url.searchParams.has("alt")));

  for (const rejected of [
    {
      thumbnailLink: "https://lh3.googleusercontent.com.outside.fixture.test/drive-storage/fixture",
    },
    { thumbnailLink: "https://lh3.googleusercontent.com/unverified-path/fixture" },
    { thumbnailLink: "https://drive.google.com/thumbnail?id=fixture-photo-unrelated" },
    { thumbnailLink: THUMBNAIL, thumbnailRedirect: true },
  ]) {
    const fallback = fixture(rejected);
    const response = await fallback.api.readPhoto(access, ref, true, signal());
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert(fallback.urls.some((url) => url.searchParams.has("alt")));
    assert(
      !fallback.urls.some(
        (url) => url.hostname.endsWith("outside.fixture.test") || url.host === "drive.google.com",
      ),
    );
  }
});

test("checks MIME, raster signature and size before serving media", async () => {
  const tooBig = fixture({ size: MAX_DRIVE_PHOTO_BYTES + 1 });
  await assert.rejects(tooBig.api.readPhoto(access, ref, false, signal()), {
    code: "foto_rdo_acima_do_limite",
  });
  assert(!tooBig.urls.some((url) => url.searchParams.has("alt")));
  const previewLimit = fixture({ size: 2 * 1024 * 1024 + 1 });
  await assert.rejects(previewLimit.api.readPhoto(access, ref, true, signal()), {
    code: "miniatura_rdo_indisponivel",
  });
  assert(!previewLimit.urls.some((url) => url.searchParams.has("alt")));
  await assert.rejects(
    fixture({ originalMime: "image/svg+xml" }).api.readPhoto(access, ref, false, signal()),
    { code: "foto_rdo_invalida" },
  );
  await assert.rejects(
    fixture({ originalBody: new TextEncoder().encode("not-raster") }).api.readPhoto(
      access,
      ref,
      false,
      signal(),
    ),
    { code: "foto_rdo_invalida" },
  );
});
