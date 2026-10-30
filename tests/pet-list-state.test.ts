import { describe, expect, it } from "vitest";
import {
  parsePetListState,
  petListPageAfterResponse,
  petListStateKey,
  readPetListState,
  writePetListState,
} from "../src/features/pet/list-state";
const empty = { search: "", page: 0, tab: "ordens", scrollY: 0 };
const saved = { search: "válvula 100%", page: 2, tab: "pets" as const, scrollY: 824.5 };
const payload = (changes = {}) => JSON.stringify({ formato: 1, ...saved, ...changes });
describe("PET list: local scope and return position", () => {
  it("restores search, zero-based page, tab and scroll without storing record data", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const key = petListStateKey("org", "user", "os");
    expect(
      writePetListState(storage, key, { ...saved, pet: { segredo: true } } as typeof saved),
    ).toBe(true);
    expect(readPetListState(storage, key)).toEqual(saved);
    expect(JSON.parse(values.get(key)!)).toEqual({ formato: 1, ...saved });
  });
  it("isolates organization, account, OS and the execution overview", () => {
    const keys = [
      petListStateKey("org", "user", "os"),
      petListStateKey("org2", "user", "os"),
      petListStateKey("org", "user2", "os"),
      petListStateKey("org", "user", "os2"),
      petListStateKey("org", "user"),
    ];
    expect(new Set(keys).size).toBe(5);
    expect(petListStateKey("a:b", "c", "d")).not.toBe(petListStateKey("a", "b:c", "d"));
    expect(
      readPetListState({ getItem: (key) => (key === keys[0] ? payload() : null) }, keys[1]!),
    ).toEqual(empty);
  });
  it("fails safely for malformed, incompatible or excessively large session values", () => {
    for (const raw of [null, "", "{", "null", "[]", "5", '{"formato":2}', "x".repeat(3000)])
      expect(parsePetListState(raw)).toEqual(empty);
    expect(parsePetListState(payload())).toEqual(saved);
  });
  it("bounds local fields and ignores unrelated or prototype-named properties", () => {
    expect(
      parsePetListState(
        payload({ search: "x".repeat(121), page: -1, scrollY: 1e20, tab: "other" }),
      ),
    ).toEqual(empty);
    expect(parsePetListState(payload({ page: 1.5, scrollY: -1 }))).toEqual({
      ...saved,
      page: 0,
      scrollY: 0,
    });
    expect(
      parsePetListState(
        payload({
          page: 1_000_001,
          scrollY: null,
          __proto__: { secret: true },
          pet: { conteudo: "ignored" },
        }),
      ),
    ).toEqual({ ...saved, page: 0, scrollY: 0 });
  });
  it("remains usable when session storage is blocked or unavailable", () => {
    expect(readPetListState(null, "key")).toEqual(empty);
    expect(
      readPetListState(
        {
          getItem() {
            throw new Error("blocked");
          },
        },
        "key",
      ),
    ).toEqual(empty);
    expect(writePetListState(null, "key", saved)).toBe(false);
    expect(
      writePetListState(
        {
          setItem() {
            throw new Error("quota");
          },
        },
        "key",
        saved,
      ),
    ).toBe(false);
  });
  it("reconciles an obsolete page only from the current completed server response", () => {
    expect(petListPageAfterResponse(4, { total: 25, pagina: 4, limite: 20 }, false)).toBeNull();
    expect(petListPageAfterResponse(4, { total: 25, pagina: 3, limite: 20 }, true)).toBeNull();
    expect(petListPageAfterResponse(4, { total: 25, pagina: 4, limite: 20 }, true)).toBe(1);
    expect(petListPageAfterResponse(1, { total: 25, pagina: 1, limite: 20 }, true)).toBeNull();
    expect(petListPageAfterResponse(1, { total: 0, pagina: 1, limite: 20 }, true)).toBe(0);
  });
  it("accepts optional legacy pagination metadata and rejects unconfirmed counts", () => {
    expect(petListPageAfterResponse(2, { total: 21 }, true)).toBe(1);
    expect(petListPageAfterResponse(2, undefined, true)).toBeNull();
    expect(petListPageAfterResponse(2, { total: -1 }, true)).toBeNull();
    expect(petListPageAfterResponse(2, { total: 21, limite: 0 }, true)).toBeNull();
    expect(petListPageAfterResponse(2, { total: 21, limite: 101 }, true)).toBeNull();
  });
});
