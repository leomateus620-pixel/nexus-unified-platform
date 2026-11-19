import "@tanstack/react-start/server-only";
import { SyncFailure, type createDrive, type DriveItem } from "./drive.server";
import { rdoFolderCode } from "./sources.server";

const MAX_RDO_FOLDER_PAGES = 20;

type FolderReader = Pick<ReturnType<typeof createDrive>, "listFolder">;
type RdoCategory = "montagem" | "lancada";

function numberedRdoFolders(items: DriveItem[], category: RdoCategory) {
  return items.flatMap(({ id, name, resourceKey }) => {
    const code = rdoFolderCode(name);
    return code ? [{ id, code, name, category, ...(resourceKey ? { resourceKey } : {}) }] : [];
  });
}

export async function scanRdoFolders(
  drive: FolderReader,
  rootId: string,
  publishedId: string,
  rootResourceKey: string | null,
  signal: AbortSignal,
) {
  const seenIds = new Set<string>([rootId]);

  async function listAll(folderId: string, key: string | null, publishedName?: string) {
    const items: DriveItem[] = [];
    const seenTokens = new Set<string>();
    let pageToken: string | null = null;

    for (let page = 0; page < MAX_RDO_FOLDER_PAGES; page += 1) {
      const { items: pageItems, nextPageToken } = await drive.listFolder(
        folderId,
        key,
        pageToken,
        signal,
        publishedName ? { parent: rootId, name: publishedName } : {},
        true,
      );
      for (const item of pageItems) {
        if (seenIds.has(item.id)) throw new SyncFailure("listagem_rdo_inconsistente", true);
        seenIds.add(item.id);
        items.push(item);
      }
      if (!nextPageToken) return items;
      if (seenTokens.has(nextPageToken)) throw new SyncFailure("listagem_rdo_inconsistente", true);
      seenTokens.add(nextPageToken);
      pageToken = nextPageToken;
    }

    throw new SyncFailure("listagem_rdo_acima_do_limite");
  }

  const assembly = await listAll(rootId, rootResourceKey);
  const publishedFolder = assembly.find(({ id }) => id === publishedId);
  if (!publishedFolder) throw new SyncFailure("pasta_rdo_lancados_ausente");
  const published = await listAll(
    publishedFolder.id,
    publishedFolder.resourceKey,
    publishedFolder.name,
  );

  return {
    kind: "scan" as const,
    rdoFolders: [
      ...numberedRdoFolders(
        assembly.filter(({ id }) => id !== publishedId),
        "montagem",
      ),
      ...numberedRdoFolders(published, "lancada"),
    ],
  };
}
