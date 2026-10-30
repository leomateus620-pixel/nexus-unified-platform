import { describe, expect, it } from "vitest";
import { oauthReturnPath } from "../src/lib/oauth-return-path";
describe("OAuth return boundary", () => {
  it("preserves consent authorization and fragment", () => {
    expect(oauthReturnPath("/.lovable/oauth/consent?authorization_id=abc#review")).toBe("/.lovable/oauth/consent?authorization_id=abc#review");
  });
  it("rejects external and ambiguous destinations", () => {
    for (const path of ["//outside.invalid", "/\\outside.invalid", "https://outside.invalid", "/auth\n", null]) expect(oauthReturnPath(path)).toBe("/");
  });
});