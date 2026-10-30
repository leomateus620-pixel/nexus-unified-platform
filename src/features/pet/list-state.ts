/** Local presentation preferences only. Never stores permit data or an authority
 * to read/operate a PET; every restored view still makes authenticated queries. */
export type PetListViewState = {
  search: string;
  page: number;
  tab: "ordens" | "pets";
  scrollY: number;
};
type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;
const defaults = (): PetListViewState => ({ search: "", page: 0, tab: "ordens", scrollY: 0 });
const validInteger = (value: unknown, maximum: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
export const petListStateKey = (organizationId: string, userId: string, osId?: string) =>
  `nexus.pet.list.v1:${encodeURIComponent(organizationId)}:${encodeURIComponent(userId)}:${encodeURIComponent(osId || "execucao")}`;

export function parsePetListState(raw: string | null): PetListViewState {
  if (!raw || raw.length > 2048) return defaults();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaults();
    const row = value as Record<string, unknown>;
    if (row["formato"] !== 1) return defaults();
    return {
      search: typeof row["search"] === "string" && row["search"].length <= 120 ? row["search"] : "",
      page: validInteger(row["page"], 1_000_000) ? row["page"] : 0,
      tab: row["tab"] === "pets" ? "pets" : "ordens",
      scrollY:
        typeof row["scrollY"] === "number" &&
        Number.isFinite(row["scrollY"]) &&
        row["scrollY"] >= 0 &&
        row["scrollY"] <= 10_000_000
          ? row["scrollY"]
          : 0,
    };
  } catch {
    return defaults();
  }
}
export function readPetListState(storage: ReadStorage | null, key: string): PetListViewState {
  try {
    return parsePetListState(storage?.getItem(key) ?? null);
  } catch {
    return defaults();
  }
}
export function writePetListState(
  storage: WriteStorage | null,
  key: string,
  state: PetListViewState,
): boolean {
  try {
    if (!storage) return false;
    // Serialize only our local view fields; never persist an attached record/DTO.
    storage.setItem(
      key,
      JSON.stringify({
        formato: 1,
        search: state.search,
        page: state.page,
        tab: state.tab,
        scrollY: state.scrollY,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Placeholder/cached data while a current fetch is running cannot invalidate a
 * restored page. Reconcile only the actual response for the requested page. */
export function petListPageAfterResponse(
  page: number,
  response: { total: number; pagina?: number; limite?: number } | undefined,
  confirmed: boolean,
): number | null {
  if (
    !confirmed ||
    !response ||
    !validInteger(response.total, Number.MAX_SAFE_INTEGER) ||
    (response.pagina !== undefined && response.pagina !== page)
  )
    return null;
  const limit = response.limite ?? 20;
  if (!validInteger(limit, 100) || limit < 1) return null;
  const last = Math.max(0, Math.ceil(response.total / limit) - 1);
  return page > last ? last : null;
}
