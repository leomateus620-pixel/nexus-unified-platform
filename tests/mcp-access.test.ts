import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@lovable.dev/mcp-js";
const state = vi.hoisted(() => ({ membership: true, roles: ["engenharia"], error: false, user: "caller", calls: [] as string[][] }));
vi.mock("../src/lib/mcp/supabase", () => ({ supabaseForUser: () => ({
  from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: (column: string, value: string) => { state.calls.push([table, column, value]); return chain; },
      maybeSingle: async () => ({ data: state.membership ? { id: "member" } : null, error: state.error }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: state.roles.map(role => ({ role })), error: state.error }).then(resolve),
    }; return chain;
  },
}) }));
import { moduleAccess } from "../src/lib/mcp/access";
const ctx = { isAuthenticated: () => true, getUserId: () => state.user } as unknown as ToolContext;
describe("MCP module authorization", () => {
  it("checks roles and membership against verified caller and selected organization", async () => {
    state.calls = []; state.roles = ["engenharia"]; state.membership = true; state.error = false;
    await expect(moduleAccess(ctx, "org-a", "/produtos")).resolves.toBeDefined();
    expect(state.calls).toContainEqual(["memberships", "user_id", "caller"]);
    expect(state.calls).toContainEqual(["user_roles", "organization_id", "org-a"]);
  });
  it("denies another organization despite a permitted role", async () => {
    state.membership = false;
    await expect(moduleAccess(ctx, "org-b", "/produtos")).rejects.toThrow("Sem acesso");
    state.membership = true;
  });
  it("denies a module hidden from the caller", async () => {
    state.roles = ["campo"];
    await expect(moduleAccess(ctx, "org-a", "/comercial")).rejects.toThrow("Sem acesso");
  });
  it("fails closed on permission lookup errors", async () => {
    state.roles = ["admin"]; state.error = true;
    await expect(moduleAccess(ctx, "org-a", "/produtos")).rejects.toThrow("Sem acesso");
    state.error = false;
  });
});