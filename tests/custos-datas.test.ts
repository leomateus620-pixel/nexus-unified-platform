import { describe, expect, it } from "vitest";
import { dataCalendarioValida, dataCustoBR } from "../src/features/custos/datas";
import { dataBR } from "../src/lib/format";

describe("Datas de compras e vigência", () => {
  it("preserves the calendar day of a date-only value", () => {
    expect(dataCustoBR("2026-10-01")).toBe("01/10/2026");
    expect(dataCustoBR("2024-02-29")).toBe("29/02/2024");
  });
  it("rejects impossible dates rather than normalizing them silently", () => {
    for (const value of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", ""])
      expect(dataCalendarioValida(value)).toBe(false);
    expect(dataCalendarioValida("2024-02-29")).toBe(true);
    expect(dataCustoBR("2026-02-29")).toBe("—");
  });
  it("keeps the existing local formatter for actual timestamps", () => {
    const timestamp = "2026-10-01T01:30:00Z";
    expect(dataCustoBR(timestamp)).toBe(dataBR(timestamp));
    expect(dataCustoBR(null)).toBe(dataBR(null));
  });
});
